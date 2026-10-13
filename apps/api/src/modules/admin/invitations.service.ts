import { Injectable } from '@nestjs/common';
import type { StaffInvitationStatus, StaffInvitationView } from '@hedax/contracts';
import { assertCanGrant } from '@hedax/domain';
import { randomToken, sha256Hex } from '@hedax/domain/server';
import { AuditService } from '../../common/audit.service.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import { LIMITS, RateLimitService } from '../../common/rate-limit.service.js';
import type { Actor } from '../../common/request-context.js';
import { AuthService } from '../auth/auth.service.js';
import { MailService } from '../mail/mail.service.js';

const INVITATION_TTL_MS = 72 * 3_600_000;

/**
 * Staff invitations (spec §13). The link carries a 32-byte random token; only its SHA-256 is stored,
 * it works once, only until it expires, and only creates an account for the invited address.
 * Sending, resending and revoking are checked here (users.manage plus "no more than you hold"),
 * not only hidden in the panel. Resending replaces the token, so an older link stops working.
 */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly mail: MailService,
    private readonly limits: RateLimitService,
  ) {}

  /** Roles of an invitation, checked against what the acting staff member may grant. */
  private async grantableRoles(actor: Actor, roleIds: string[], confirmCode: string | undefined) {
    const roles = await this.prisma.role.findMany({ where: { id: { in: roleIds } }, include: { permissions: true } });
    if (roles.length !== new Set(roleIds).size) throw badRequest('UNKNOWN_ROLE');
    if (roles.some((r) => r.isOwner) && !actor.isOwner) throw forbidden('PERMISSION_ESCALATION');
    assertCanGrant(actor.permissions, roles.flatMap((r) => r.permissions.map((p) => p.permissionKey)));
    // A new owner is a separate, confirmed act (spec §13): a fresh authenticator code of the acting owner.
    if (roles.some((r) => r.isOwner)) await this.auth.confirmStepUp(actor, confirmCode);
    return roles;
  }

  async invite(actor: Actor, body: { email: string; fullName: string; roleIds: string[]; confirmCode?: string | undefined }) {
    await this.limits.hit(LIMITS.invitePerActor, actor.userId);
    const roles = await this.grantableRoles(actor, body.roleIds, body.confirmCode);
    const email = body.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) throw conflict('EMAIL_IN_USE');
    const open = await this.prisma.staffInvitation.findFirst({ where: { email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } });
    if (open) throw conflict('INVITATION_PENDING', 'An invitation for this e-mail is still open; resend or revoke it');
    const token = randomToken(32);
    const invitation = await this.prisma.tx(async (tx) => {
      const inv = await tx.staffInvitation.create({
        data: { email, fullName: body.fullName, tokenHash: sha256Hex(token), roleIds: body.roleIds, invitedById: actor.userId, expiresAt: new Date(Date.now() + INVITATION_TTL_MS) },
      });
      if (this.mail.configured) await this.mail.queueInvitation(tx, { invitationId: inv.id, to: email, token, createdById: actor.userId });
      await this.audit.record(tx, { action: 'staff.invited', entityType: 'staff_invitation', entityId: inv.id, after: { email, roles: roles.map((r) => r.key), emailQueued: this.mail.configured } });
      return inv;
    });
    return { invitationId: invitation.id, acceptUrl: this.mail.acceptUrl(token), expiresAt: invitation.expiresAt.toISOString(), emailQueued: this.mail.configured };
  }

  /** New link and expiry; the previous link and any not-yet-sent e-mail are invalidated. */
  async resend(actor: Actor, id: string, confirmCode: string | undefined) {
    const inv = await this.prisma.staffInvitation.findUnique({ where: { id } });
    if (!inv) throw notFound();
    if (inv.acceptedAt) throw conflict('INVITATION_ALREADY_ACCEPTED');
    if (inv.revokedAt) throw conflict('INVITATION_REVOKED');
    await this.limits.hit(LIMITS.inviteResendPerInvitation, inv.id);
    await this.grantableRoles(actor, inv.roleIds, confirmCode);
    const token = randomToken(32);
    const updated = await this.prisma.tx(async (tx) => {
      await this.mail.cancelQueuedForInvitation(tx, inv.id);
      const u = await tx.staffInvitation.update({ where: { id: inv.id }, data: { tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + INVITATION_TTL_MS) } });
      if (this.mail.configured) await this.mail.queueInvitation(tx, { invitationId: inv.id, to: inv.email, token, createdById: actor.userId });
      await this.audit.record(tx, { action: 'staff.invitation.resent', entityType: 'staff_invitation', entityId: inv.id, after: { email: inv.email, emailQueued: this.mail.configured } });
      return u;
    });
    return { invitationId: inv.id, acceptUrl: this.mail.acceptUrl(token), expiresAt: updated.expiresAt.toISOString(), emailQueued: this.mail.configured };
  }

  async revoke(actor: Actor, id: string) {
    const inv = await this.prisma.staffInvitation.findUnique({ where: { id } });
    if (!inv) throw notFound();
    if (inv.acceptedAt) throw conflict('INVITATION_ALREADY_ACCEPTED');
    if (inv.revokedAt) return { id, revoked: true };
    await this.prisma.tx(async (tx) => {
      await tx.staffInvitation.update({ where: { id }, data: { revokedAt: new Date() } });
      await this.mail.cancelQueuedForInvitation(tx, id);
      await this.audit.record(tx, { action: 'staff.invitation.revoked', entityType: 'staff_invitation', entityId: id, actorId: actor.userId, after: { email: inv.email } });
    });
    return { id, revoked: true };
  }

  /** Recent invitations (open ones and anything from the last 90 days) with their e-mail state. */
  async list(): Promise<StaffInvitationView[]> {
    const since = new Date(Date.now() - 90 * 24 * 3_600_000);
    const rows = await this.prisma.staffInvitation.findMany({
      where: { OR: [{ createdAt: { gte: since } }, { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }] },
      include: { emails: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const roles = await this.prisma.role.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => r.roleIds))] } } });
    const now = new Date();
    return rows.map((r) => {
      const last = r.emails[0];
      let status: StaffInvitationStatus;
      if (r.acceptedAt) status = 'ACCEPTED';
      else if (r.revokedAt) status = 'REVOKED';
      else if (r.expiresAt <= now) status = 'EXPIRED';
      else if (last?.status === 'SENT') status = 'SENT';
      else if (last?.status === 'FAILED') status = 'FAILED';
      else status = 'PENDING';
      return {
        id: r.id, email: r.email, fullName: r.fullName,
        roles: roles.filter((x) => r.roleIds.includes(x.id)).map((x) => ({ id: x.id, nameFa: x.nameFa, nameEn: x.nameEn, isOwner: x.isOwner })),
        status, createdAt: r.createdAt.toISOString(), expiresAt: r.expiresAt.toISOString(), acceptedAt: r.acceptedAt?.toISOString() ?? null,
        sentAt: last?.status === 'SENT' ? (last.sentAt?.toISOString() ?? null) : null,
        lastError: last?.status === 'FAILED' || last?.status === 'QUEUED' ? last.lastError : null,
      };
    });
  }
}
