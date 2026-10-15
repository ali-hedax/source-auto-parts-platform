import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { StaffInvitationStatus, StaffTrashView } from '@hedax/contracts';
import { assertNotLastOwner, normalizeSearchText } from '@hedax/domain';
import { AuditService } from '../../common/audit.service.js';
import { SessionService } from '../../common/auth/session.service.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Actor } from '../../common/request-context.js';
import { TrashService } from '../trash/trash.service.js';
import { invitationStatus } from './invitations.service.js';
import { STAFF_INVITATION_TRASH_KIND, STAFF_TRASH_KIND, StaffErasureService } from './staff-erasure.service.js';

type RestorableStatus = 'ACTIVE' | 'SUSPENDED';
type Role = { id: string; nameFa: string; nameEn: string; isOwner: boolean };

/** The typed confirmation matches the name regardless of Arabic/Persian letters, digits, spacing and case. */
export function confirmNameMatches(typed: string, label: string): boolean {
  const a = normalizeSearchText(typed);
  return a.length > 0 && a === normalizeSearchText(label);
}

/**
 * Staff members and invitations in the trash (owner only; the controller checks).
 *
 * A staff member, active or deactivated, moved to the trash is signed out everywhere and cannot
 * sign in (status TRASHED); their e-mail, roles and history are kept and they are hidden from
 * lists, counts and pickers. Restoring brings back the same roles and the same status (a
 * deactivated member comes back deactivated) but removes the authenticator, which they set up
 * again at the next sign-in. Never one's own account, never the last active owner.
 *
 * An invitation that was not accepted (pending, expired or revoked) moved to the trash keeps its
 * row unchanged and only gets trashedAt: its link is refused and it is not listed. Restoring clears
 * trashedAt, so it comes back exactly as it was (a pending invitation whose expiry passed in the
 * meantime comes back expired).
 *
 * Deleting for good is the complete erasure (typed name + the owner's authenticator code).
 */
@Injectable()
export class StaffTrashService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    private readonly trash: TrashService,
    private readonly erasure: StaffErasureService,
  ) {}

  onModuleInit(): void {
    this.trash.register(STAFF_TRASH_KIND, async (userId) => {
      if (await this.erasure.eraseExpired(userId)) return;
      // The account is no longer in the trash (e.g. restored by hand in the database): drop the stale entry.
      await this.prisma.tx((tx) => this.trash.remove(tx, STAFF_TRASH_KIND, userId));
    });
    this.trash.register(STAFF_INVITATION_TRASH_KIND, async (invitationId) => {
      if (await this.erasure.eraseExpiredInvitation(invitationId)) return;
      await this.prisma.tx((tx) => this.trash.remove(tx, STAFF_INVITATION_TRASH_KIND, invitationId));
    });
  }

  async moveToTrash(actor: Actor, userId: string) {
    if (userId === actor.userId) throw forbidden('SELF_EDIT', 'You cannot move your own account to the trash');
    await this.prisma.tx(async (tx) => {
      // One at a time: two owners trashing each other at the same moment cannot leave no active owner.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('hedax:staff-owners'))`;
      const target = await tx.user.findFirst({ where: { id: userId, kind: 'STAFF', status: { in: ['ACTIVE', 'SUSPENDED'] } }, include: { roles: { include: { role: true } } } });
      if (!target) throw notFound();
      // A deactivated owner is not an active owner, so only an active one can be the last.
      if (target.roles.some((r) => r.role.isOwner) && target.status === 'ACTIVE') {
        const owners = await tx.userRole.findMany({ where: { role: { isOwner: true }, user: { status: 'ACTIVE' } }, select: { userId: true } });
        assertNotLastOwner(owners.map((o) => o.userId), userId);
      }
      await tx.user.update({ where: { id: userId }, data: { status: 'TRASHED', authVersion: { increment: 1 } } });
      await this.trash.put(tx, { kind: STAFF_TRASH_KIND, entityId: userId, label: target.fullName?.trim() || target.email || userId, restoreState: { status: target.status }, trashedById: actor.userId });
      await this.audit.record(tx, {
        action: 'staff.trashed', entityType: 'user', entityId: userId,
        before: { status: target.status, roles: target.roles.map((r) => r.role.key).sort() }, after: { status: 'TRASHED' },
      });
    });
    // Every session and live socket ends now; sign-in is refused while the status is TRASHED.
    await this.sessions.revokeAllForUser(userId, 'TRASHED');
    return { id: userId, trashed: true };
  }

  /** Pending, expired or revoked: any invitation that did not become an account. */
  async moveInvitationToTrash(actor: Actor, invitationId: string) {
    await this.prisma.tx(async (tx) => {
      const inv = await tx.staffInvitation.findUnique({ where: { id: invitationId }, include: { emails: { orderBy: { createdAt: 'desc' }, take: 1 } } });
      if (!inv || inv.trashedAt) throw notFound();
      if (inv.acceptedAt) throw conflict('INVITATION_ALREADY_ACCEPTED', 'The invitation became an account; move the staff member to the trash instead');
      const status = invitationStatus(inv, inv.emails[0]);
      // Guarded against a concurrent accept: only an invitation still unused and outside the trash moves.
      const moved = await tx.staffInvitation.updateMany({ where: { id: invitationId, acceptedAt: null, trashedAt: null }, data: { trashedAt: new Date() } });
      if (moved.count !== 1) throw conflict('INVITATION_ALREADY_ACCEPTED');
      await this.trash.put(tx, { kind: STAFF_INVITATION_TRASH_KIND, entityId: invitationId, label: inv.fullName.trim() || inv.email, restoreState: { status }, trashedById: actor.userId });
      await this.audit.record(tx, { action: 'staff.invitation.trashed', entityType: 'staff_invitation', entityId: invitationId, before: { status }, after: { email: inv.email, trashed: true } });
    });
    return { id: invitationId, trashed: true };
  }

  async count(): Promise<number> {
    const [staff, invitations] = await Promise.all([this.trash.count(STAFF_TRASH_KIND), this.trash.count(STAFF_INVITATION_TRASH_KIND)]);
    return staff + invitations;
  }

  async list(): Promise<{ items: StaffTrashView[]; retentionDays: number }> {
    const [staffEntries, invitationEntries, retentionDays] = await Promise.all([
      this.trash.list(STAFF_TRASH_KIND), this.trash.list(STAFF_INVITATION_TRASH_KIND), this.trash.retentionDays(),
    ]);
    const byIds = [...new Set([...staffEntries, ...invitationEntries].map((e) => e.trashedById).filter((v): v is string => !!v))];
    const [users, invitations, actors] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: staffEntries.map((e) => e.entityId) }, status: 'TRASHED' }, include: { roles: { include: { role: true } } } }),
      this.prisma.staffInvitation.findMany({ where: { id: { in: invitationEntries.map((e) => e.entityId) }, trashedAt: { not: null } } }),
      this.prisma.user.findMany({ where: { id: { in: byIds } }, select: { id: true, fullName: true, email: true, status: true } }),
    ]);
    const roleRows = await this.prisma.role.findMany({ where: { id: { in: [...new Set(invitations.flatMap((i) => i.roleIds))] } } });
    const userById = new Map(users.map((u) => [u.id, u]));
    const invitationById = new Map(invitations.map((i) => [i.id, i]));
    const actorById = new Map(actors.map((a) => [a.id, a]));
    const items: Array<StaffTrashView> = [];
    const common = (e: { id: string; label: string; trashedAt: Date; trashedById: string | null; restoreState: unknown }) => {
      const by = e.trashedById ? actorById.get(e.trashedById) : undefined;
      const { purgeAt, daysLeft } = this.trash.schedule(e.trashedAt, retentionDays);
      return {
        entryId: e.id, label: e.label, trashedAt: e.trashedAt.toISOString(), trashedBy: by && by.status !== 'DELETED' ? (by.fullName ?? by.email) : null,
        purgeAt: purgeAt.toISOString(), daysLeft, saved: (e.restoreState as { status?: string } | null)?.status,
      };
    };
    for (const e of staffEntries) {
      const u = userById.get(e.entityId);
      if (!u) continue;
      const { saved, ...rest } = common(e);
      items.push({
        ...rest, kind: 'staff', id: u.id, previousStatus: saved === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE', fullName: u.fullName, email: u.email,
        roles: u.roles.map((r): Role => ({ id: r.roleId, nameFa: r.role.nameFa, nameEn: r.role.nameEn, isOwner: r.role.isOwner })),
      });
    }
    for (const e of invitationEntries) {
      const inv = invitationById.get(e.entityId);
      if (!inv) continue;
      const { saved, ...rest } = common(e);
      items.push({
        ...rest, kind: 'invitation', id: inv.id, previousStatus: (saved as StaffInvitationStatus | undefined) ?? 'PENDING', fullName: inv.fullName, email: inv.email,
        roles: roleRows.filter((r) => inv.roleIds.includes(r.id)).map((r): Role => ({ id: r.id, nameFa: r.nameFa, nameEn: r.nameEn, isOwner: r.isOwner })),
      });
    }
    items.sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));
    return { items, retentionDays };
  }

  /** Same roles, details and status as before; the authenticator is removed and set up again at the next sign-in. */
  async restore(actor: Actor, userId: string) {
    await this.prisma.tx(async (tx) => {
      const entry = await this.trash.find(STAFF_TRASH_KIND, userId, tx);
      const target = await tx.user.findFirst({ where: { id: userId, kind: 'STAFF', status: 'TRASHED' }, select: { id: true } });
      if (!entry || !target) throw notFound();
      const saved = (entry.restoreState as { status?: string } | null)?.status;
      const status: RestorableStatus = saved === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
      await tx.user.update({ where: { id: userId }, data: { status, mfaSecretEnc: null, mfaEnabledAt: null, mfaLastTimeStep: null, authVersion: { increment: 1 } } });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaChallenge.deleteMany({ where: { userId } });
      await this.trash.remove(tx, STAFF_TRASH_KIND, userId);
      await this.audit.record(tx, { action: 'staff.restored', entityType: 'user', entityId: userId, before: { status: 'TRASHED' }, after: { status, mfaReset: true } });
    });
    return { id: userId, restored: true };
  }

  /**
   * Back exactly as it was (link, expiry, revocation). An invitation that would be open again is
   * refused when the address was taken meanwhile (an account, or a newer open invitation).
   */
  async restoreInvitation(actor: Actor, invitationId: string) {
    await this.prisma.tx(async (tx) => {
      const entry = await this.trash.find(STAFF_INVITATION_TRASH_KIND, invitationId, tx);
      const inv = await tx.staffInvitation.findUnique({ where: { id: invitationId }, include: { emails: { orderBy: { createdAt: 'desc' }, take: 1 } } });
      if (!entry || !inv?.trashedAt) throw notFound();
      const status = invitationStatus(inv, inv.emails[0]);
      if (!inv.revokedAt && inv.expiresAt > new Date()) {
        if (await tx.user.findUnique({ where: { email: inv.email }, select: { id: true } })) throw conflict('EMAIL_IN_USE', 'This e-mail already belongs to an account');
        const open = await tx.staffInvitation.findFirst({ where: { email: inv.email, id: { not: inv.id }, acceptedAt: null, revokedAt: null, trashedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } });
        if (open) throw conflict('INVITATION_PENDING', 'Another invitation for this e-mail is open');
      }
      await tx.staffInvitation.update({ where: { id: invitationId }, data: { trashedAt: null } });
      await this.trash.remove(tx, STAFF_INVITATION_TRASH_KIND, invitationId);
      await this.audit.record(tx, { action: 'staff.invitation.restored', entityType: 'staff_invitation', entityId: invitationId, before: { trashed: true }, after: { status } });
    });
    return { id: invitationId, restored: true };
  }

  /** Delete for good: the name typed again plus the acting owner's current authenticator code. */
  async purge(actor: Actor, userId: string, confirmName: string, confirmCode: string) {
    const entry = await this.trash.find(STAFF_TRASH_KIND, userId);
    if (!entry) throw notFound();
    if (!confirmNameMatches(confirmName, entry.label)) throw badRequest('CONFIRM_NAME_MISMATCH', 'The typed name does not match');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (user?.status !== 'TRASHED') throw conflict('NOT_IN_TRASH');
    return this.erasure.eraseStaff(actor, userId, confirmCode);
  }

  async purgeInvitation(actor: Actor, invitationId: string, confirmName: string, confirmCode: string) {
    const entry = await this.trash.find(STAFF_INVITATION_TRASH_KIND, invitationId);
    if (!entry) throw notFound();
    if (!confirmNameMatches(confirmName, entry.label)) throw badRequest('CONFIRM_NAME_MISMATCH', 'The typed name does not match');
    return this.erasure.eraseTrashedInvitation(actor, invitationId, confirmCode);
  }
}
