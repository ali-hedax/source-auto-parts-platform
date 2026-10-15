import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { StaffTrashView } from '@hedax/contracts';
import { assertNotLastOwner, normalizeSearchText } from '@hedax/domain';
import { AuditService } from '../../common/audit.service.js';
import { SessionService } from '../../common/auth/session.service.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Actor } from '../../common/request-context.js';
import { TrashService } from '../trash/trash.service.js';
import { STAFF_TRASH_KIND, StaffErasureService } from './staff-erasure.service.js';

type RestorableStatus = 'ACTIVE' | 'SUSPENDED';

/** The typed confirmation matches the name regardless of Arabic/Persian letters, digits, spacing and case. */
export function confirmNameMatches(typed: string, label: string): boolean {
  const a = normalizeSearchText(typed);
  return a.length > 0 && a === normalizeSearchText(label);
}

/**
 * Staff members in the trash (owner only; the controller checks). Moving someone to the trash
 * signs them out everywhere and blocks sign-in (status TRASHED), keeps their e-mail, roles and
 * history, and hides them from lists, counts and pickers. Restoring brings back the same roles
 * and status but removes the authenticator, which they set up again at the next sign-in.
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
  }

  async moveToTrash(actor: Actor, userId: string) {
    if (userId === actor.userId) throw forbidden('SELF_EDIT', 'You cannot move your own account to the trash');
    await this.prisma.tx(async (tx) => {
      // One at a time: two owners trashing each other at the same moment cannot leave no active owner.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('hedax:staff-owners'))`;
      const target = await tx.user.findFirst({ where: { id: userId, kind: 'STAFF', status: { in: ['ACTIVE', 'SUSPENDED'] } }, include: { roles: { include: { role: true } } } });
      if (!target) throw notFound();
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

  async count(): Promise<number> {
    return this.trash.count(STAFF_TRASH_KIND);
  }

  async list(): Promise<{ items: StaffTrashView[]; retentionDays: number }> {
    const [entries, retentionDays] = await Promise.all([this.trash.list(STAFF_TRASH_KIND), this.trash.retentionDays()]);
    const ids = entries.map((e) => e.entityId);
    const byIds = [...new Set(entries.map((e) => e.trashedById).filter((v): v is string => !!v))];
    const [users, actors] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: ids }, status: 'TRASHED' }, include: { roles: { include: { role: true } } } }),
      this.prisma.user.findMany({ where: { id: { in: byIds } }, select: { id: true, fullName: true, email: true, status: true } }),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const actorById = new Map(actors.map((a) => [a.id, a]));
    const items: StaffTrashView[] = [];
    for (const e of entries) {
      const u = userById.get(e.entityId);
      if (!u) continue;
      const by = e.trashedById ? actorById.get(e.trashedById) : undefined;
      const { purgeAt, daysLeft } = this.trash.schedule(e.trashedAt, retentionDays);
      items.push({
        entryId: e.id, userId: u.id, label: e.label, fullName: u.fullName, email: u.email,
        roles: u.roles.map((r) => ({ id: r.roleId, nameFa: r.role.nameFa, nameEn: r.role.nameEn, isOwner: r.role.isOwner })),
        trashedAt: e.trashedAt.toISOString(), trashedBy: by && by.status !== 'DELETED' ? (by.fullName ?? by.email) : null,
        purgeAt: purgeAt.toISOString(), daysLeft,
      });
    }
    return { items, retentionDays };
  }

  /** Same roles and details as before; the authenticator is removed and set up again at the next sign-in. */
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

  /** Delete for good: the name typed again plus the acting owner's current authenticator code. */
  async purge(actor: Actor, userId: string, confirmName: string, confirmCode: string) {
    const entry = await this.trash.find(STAFF_TRASH_KIND, userId);
    if (!entry) throw notFound();
    if (!confirmNameMatches(confirmName, entry.label)) throw badRequest('CONFIRM_NAME_MISMATCH', 'The typed name does not match');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (user?.status !== 'TRASHED') throw conflict('NOT_IN_TRASH');
    return this.erasure.eraseStaff(actor, userId, confirmCode);
  }
}
