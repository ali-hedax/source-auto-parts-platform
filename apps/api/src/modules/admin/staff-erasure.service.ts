import { Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit.service.js';
import { SessionService } from '../../common/auth/session.service.js';
import { conflict, forbidden, notFound } from '../../common/errors.js';
import { Prisma, PrismaService, type Tx } from '../../common/prisma.service.js';
import { LIMITS, RateLimitService } from '../../common/rate-limit.service.js';
import type { Actor } from '../../common/request-context.js';
import { AuthService } from '../auth/auth.service.js';

/** trash_entry.kind of staff members in the trash. */
export const STAFF_TRASH_KIND = 'staff';

/** What replaces an erased name or e-mail address, also in the audit trail. */
export const ERASED = 'حذف‌شده';

/** Fields that hold a person's identity in audit payloads about that person. */
const PERSONAL_KEY = /^(email|fullName|name|mobile|mobileE164|phone|contactPhone)$/i;

interface Identity {
  emails: string[];
  names: string[];
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Replaces the person's e-mail and name inside a JSON payload. Rows that are about the person
 * (`owned`) lose every identity field; other rows only lose values that are the e-mail or the name.
 */
export function redactIdentity(value: unknown, who: Identity, owned: boolean): unknown {
  if (typeof value === 'string') {
    let s = value;
    for (const email of who.emails) s = s.replace(new RegExp(escapeRegExp(email), 'gi'), ERASED);
    return who.names.includes(s.trim()) ? ERASED : s;
  }
  if (Array.isArray(value)) return value.map((v) => redactIdentity(v, who, owned));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = owned && PERSONAL_KEY.test(k) && typeof v === 'string' ? ERASED : redactIdentity(v, who, owned);
    }
    return out;
  }
  return value;
}

const jsonb = (v: unknown) => (v === null || v === undefined ? Prisma.sql`NULL` : Prisma.sql`${JSON.stringify(v)}::jsonb`);

/**
 * Erasure of a staff member or of an invitation, on the owner's request (cannot be undone).
 * Invitations and their e-mails are deleted. A staff account keeps only an anonymous row with the
 * status DELETED, because orders, messages and the audit trail point to it; its name, e-mail,
 * password, authenticator, roles, sessions and notifications are removed. In the audit trail the
 * events stay (who did what, when) but the person's name and e-mail become "حذف‌شده".
 * Only for someone already in the trash, by an owner with a current authenticator code (never
 * one's own account), or by the daily trash job once the retention period is over.
 */
@Injectable()
export class StaffErasureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly limits: RateLimitService,
  ) {}

  /**
   * Deletes for good a staff member who is in the trash (panel → staff → trash). An owner in the
   * trash can be erased too: the last active owner never gets there.
   */
  async eraseStaff(actor: Actor, userId: string, confirmCode: string) {
    if (userId === actor.userId) throw forbidden('SELF_EDIT', 'You cannot erase your own account');
    await this.limits.hit(LIMITS.staffErasePerActor, actor.userId);
    const target = await this.prisma.user.findFirst({ where: { id: userId, kind: 'STAFF', status: { not: 'DELETED' } }, select: { id: true, status: true } });
    if (!target) throw notFound();
    if (target.status !== 'TRASHED') throw conflict('NOT_IN_TRASH', 'Move the staff member to the trash first');
    await this.auth.confirmStepUp(actor, confirmCode);
    return this.erase(userId, false);
  }

  /** The daily trash job: staff members whose time in the trash is over (no person acting). */
  async eraseExpired(userId: string) {
    const target = await this.prisma.user.findFirst({ where: { id: userId, kind: 'STAFF', status: 'TRASHED' }, select: { id: true } });
    if (!target) return null;
    return this.erase(userId, true);
  }

  private async erase(userId: string, automatic: boolean) {
    const target = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    // Live sessions and sockets end before the account loses its data.
    await this.sessions.revokeAllForUser(userId, 'ERASED');
    return this.prisma.tx(async (tx) => {
      // Earlier addresses and names of the account are in its own change history.
      const history = await tx.auditLog.findMany({ where: { entityType: 'user', entityId: userId, action: { in: ['account.email.changed', 'account.name.changed'] } }, select: { before: true, after: true } });
      const emails = new Set<string>(target.email ? [target.email.toLowerCase()] : []);
      const names = new Set<string>(target.fullName ? [target.fullName.trim()] : []);
      for (const h of history) {
        for (const side of [h.before, h.after] as Array<Record<string, unknown> | null>) {
          if (typeof side?.email === 'string') emails.add(side.email.toLowerCase());
          if (typeof side?.fullName === 'string') names.add(side.fullName.trim());
        }
      }
      const invitations = await tx.staffInvitation.findMany({ where: { email: { in: [...emails] } }, select: { id: true, fullName: true } });
      for (const inv of invitations) names.add(inv.fullName.trim());
      const invitationIds = invitations.map((i) => i.id);

      await tx.emailMessage.deleteMany({ where: { OR: [{ invitationId: { in: invitationIds } }, { kind: 'STAFF_INVITATION', toAddress: { in: [...emails] } }] } });
      await tx.staffInvitation.deleteMany({ where: { id: { in: invitationIds } } });
      await tx.session.deleteMany({ where: { userId } });
      await tx.mfaChallenge.deleteMany({ where: { userId } });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.trashEntry.deleteMany({ where: { kind: STAFF_TRASH_KIND, entityId: userId } });
      await tx.user.update({
        where: { id: userId },
        data: {
          status: 'DELETED', email: null, fullName: null, contactPhone: null, mobileE164: null, mobileVerifiedAt: null, passwordHash: null,
          mfaSecretEnc: null, mfaEnabledAt: null, mfaLastTimeStep: null, lastLoginAt: null, authVersion: { increment: 1 },
        },
      });
      const auditEntries = await this.redactAudit(tx, { emails: [...emails], names: [...names] }, [userId, ...invitationIds], userId);
      await this.audit.record(tx, {
        action: automatic ? 'staff.auto_erased' : 'staff.erased', entityType: 'user', entityId: userId,
        after: { invitations: invitationIds.length, auditEntries, ...(automatic ? { reason: 'TRASH_RETENTION' } : {}) },
      });
      return { id: userId, erased: true, invitations: invitationIds.length, auditEntries };
    });
  }

  /** Erases an invitation that never became an account, together with every other invitation to the same address. */
  async eraseInvitation(actor: Actor, invitationId: string, confirmCode: string) {
    await this.limits.hit(LIMITS.staffErasePerActor, actor.userId);
    const inv = await this.prisma.staffInvitation.findUnique({ where: { id: invitationId } });
    if (!inv) throw notFound();
    if (await this.prisma.user.findUnique({ where: { email: inv.email }, select: { id: true } })) {
      throw conflict('ERASE_ACCOUNT_INSTEAD', 'This person already has an account; erase the staff account instead');
    }
    const ownerRole = await this.prisma.role.findFirst({ where: { id: { in: inv.roleIds }, isOwner: true }, select: { id: true } });
    if (ownerRole && !actor.isOwner) throw forbidden('OWNER_PROTECTED');
    await this.auth.confirmStepUp(actor, confirmCode);
    return this.prisma.tx(async (tx) => {
      const invitations = await tx.staffInvitation.findMany({ where: { email: inv.email }, select: { id: true, fullName: true } });
      const invitationIds = invitations.map((i) => i.id);
      await tx.emailMessage.deleteMany({ where: { OR: [{ invitationId: { in: invitationIds } }, { kind: 'STAFF_INVITATION', toAddress: inv.email }] } });
      await tx.staffInvitation.deleteMany({ where: { id: { in: invitationIds } } });
      const auditEntries = await this.redactAudit(tx, { emails: [inv.email.toLowerCase()], names: [...new Set(invitations.map((i) => i.fullName.trim()))] }, invitationIds, null);
      await this.audit.record(tx, { action: 'staff.invitation.erased', entityType: 'staff_invitation', entityId: invitationId, after: { invitations: invitationIds.length, auditEntries } });
      return { id: invitationId, erased: true, invitations: invitationIds.length, auditEntries };
    });
  }

  /**
   * Rewrites the before/after payloads of audit rows that mention the person. Allowed by the
   * audit_log trigger only inside this transaction, and only for those two columns.
   */
  private async redactAudit(tx: Tx, who: Identity, ownedIds: string[], userId: string | null): Promise<number> {
    // Addresses are unique, so any row that mentions one is about this person. Names are not
    // (two people can share one), so they are only replaced in rows about or by this person.
    const needles = who.emails.filter((e) => e.length >= 3);
    const byActor = userId ? Prisma.sql`OR actor_id = ${userId}::uuid` : Prisma.empty;
    const rows = await tx.$queryRaw<Array<{ id: string; before: unknown; after: unknown; owned: boolean }>>`
      SELECT id, before, after, (entity_id = ANY(${ownedIds}::text[])) AS owned
      FROM audit_log
      WHERE entity_id = ANY(${ownedIds}::text[]) ${byActor}
         OR EXISTS (SELECT 1 FROM unnest(${needles}::text[]) n WHERE strpos(lower(coalesce(before::text, '') || ' ' || coalesce(after::text, '')), n) > 0)`;
    await tx.$queryRaw`SELECT set_config('hedax.audit_redaction', 'on', true)`;
    let changed = 0;
    for (const row of rows) {
      const before = redactIdentity(row.before, who, row.owned);
      const after = redactIdentity(row.after, who, row.owned);
      if (JSON.stringify(before) === JSON.stringify(row.before) && JSON.stringify(after) === JSON.stringify(row.after)) continue;
      await tx.$executeRaw`UPDATE audit_log SET before = ${jsonb(before)}, after = ${jsonb(after)} WHERE id = ${row.id}::uuid`;
      changed += 1;
    }
    await tx.$queryRaw`SELECT set_config('hedax.audit_redaction', 'off', true)`;
    return changed;
  }
}
