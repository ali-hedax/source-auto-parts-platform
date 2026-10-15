import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Services, type Staff, type TestApp, bootApp, inviteStaff, loginOwner, ownerTotp, services } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * «حذف (انتقال به سطل زباله)» for every state on panel → staff: an active member, a deactivated
 * member, and an invitation that is pending, expired or revoked. The server allows each of them
 * (not only the panel); a restore brings back exactly the previous state (a deactivated member comes
 * back deactivated, an expired invitation comes back expired, a pending link works again); the last
 * active owner still cannot go; deleting for good and the daily job work for invitations too.
 */
let t: TestApp;
let s: Services;
let owner: Client;
let ownerId: string;
let trash: any;
let staffTrash: any;
let lastCode: string | undefined;
let roleId: (key: string) => string;
const run = Date.now().toString(36);
const DAY = 86_400_000;
const OPEN = ['PENDING', 'SENT', 'FAILED'];

const freshCode = async () => {
  const used = await s.prisma.user.findFirst({ where: { email: process.env.TEST_OWNER_EMAIL }, select: { mfaLastTimeStep: true } });
  const step = Math.floor(Date.now() / 30_000);
  if (used?.mfaLastTimeStep != null && used.mfaLastTimeStep >= step) await new Promise((r) => setTimeout(r, (step + 1) * 30_000 - Date.now() + 500));
  lastCode = await ownerTotp(lastCode);
  return lastCode;
};

const listed = async () => (await owner.get<{ staff: any[]; invitations: any[]; trashCount: number }>('/admin/staff')).body;
const trashList = async () => (await owner.get<{ items: any[]; retentionDays: number }>('/admin/staff/trash')).body;
const auditOf = async (entityId: string) => s.prisma.auditLog.findMany({ where: { entityId }, orderBy: { createdAt: 'asc' }, select: { action: true, actorKind: true } });

/** A fresh invitation; returns its id, e-mail, name and the link token. */
const invite = async (label: string, role = 'support') => {
  const email = `${label}.${run}${Math.random().toString(36).slice(2, 6)}@hedax.test`;
  const fullName = `دعوت ${label}`;
  const res = await owner.post<any>('/admin/staff/invitations', { email, fullName, roleIds: [roleId(role)] });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { id: res.body.invitationId as string, email, fullName, token: new URL(res.body.acceptUrl).searchParams.get('token') as string };
};
const accept = (token: string, fullName: string) => new Client(t).post<any>('/auth/invitations/accept', { token, fullName, password: `Ia-${run}-Xq!7pv-Lm` });

beforeAll(async () => {
  t = await bootApp();
  s = await services(t);
  owner = await loginOwner(t);
  ownerId = (await owner.get<any>('/me')).body.id;
  const roles = (await owner.get<any[]>('/admin/roles')).body;
  roleId = (key) => roles.find((r) => r.key === key).id;
  const [trashMod, staffTrashMod] = await Promise.all([import('../../dist/modules/trash/trash.service.js'), import('../../dist/modules/admin/staff-trash.service.js')]);
  trash = t.get<any>(trashMod.TrashService);
  staffTrash = t.get<any>(staffTrashMod.StaffTrashService);
});

afterAll(async () => {
  await t?.close();
});

describe('staff members: active and deactivated', () => {
  it('an active member offers the trash and comes back active', async () => {
    const member: Staff = await inviteStaff(t, owner, 'support');
    const row = (await listed()).staff.find((m) => m.id === member.userId);
    expect(row).toMatchObject({ status: 'ACTIVE', canTrash: true });
    expect((await owner.post(`/admin/staff/${member.userId}/trash`, {})).status).toBe(200);
    expect((await trashList()).items.find((i) => i.id === member.userId)).toMatchObject({ kind: 'staff', previousStatus: 'ACTIVE' });
    expect((await owner.post(`/admin/staff/${member.userId}/restore`, {})).status).toBe(200);
    expect((await listed()).staff.find((m) => m.id === member.userId)?.status).toBe('ACTIVE');
  });

  it('a deactivated member offers the trash, the server accepts it, and a restore keeps it deactivated', async () => {
    const member: Staff = await inviteStaff(t, owner, 'finance');
    expect((await owner.patch(`/admin/staff/${member.userId}`, { suspended: true })).status).toBe(200);
    const row = (await listed()).staff.find((m) => m.id === member.userId);
    expect(row).toMatchObject({ status: 'SUSPENDED', canTrash: true });

    const res = await owner.post<any>(`/admin/staff/${member.userId}/trash`, {});
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await s.prisma.user.findUnique({ where: { id: member.userId }, select: { status: true } })).toMatchObject({ status: 'TRASHED' });
    expect((await listed()).staff.some((m) => m.id === member.userId)).toBe(false);
    expect((await trashList()).items.find((i) => i.id === member.userId)).toMatchObject({ kind: 'staff', previousStatus: 'SUSPENDED' });
    // Still cannot sign in while in the trash.
    expect((await new Client(t).post<any>('/auth/staff/login', { email: member.email, password: member.password })).status).toBe(403);

    expect((await owner.post(`/admin/staff/${member.userId}/restore`, {})).status).toBe(200);
    expect((await listed()).staff.find((m) => m.id === member.userId)).toMatchObject({ status: 'SUSPENDED', mfaEnabled: false });
    expect((await new Client(t).post<any>('/auth/staff/login', { email: member.email, password: member.password })).status).toBe(403);
    expect((await auditOf(member.userId)).map((a) => a.action)).toEqual(expect.arrayContaining(['staff.trashed', 'staff.restored']));
  });

  it('a deactivated owner can go to the trash even when only one owner is active; the active one never can', async () => {
    const email = `owner-off.${run}@hedax.test`;
    const inv = await owner.post<any>('/admin/staff/invitations', { email, fullName: 'مالک غیرفعال', roleIds: [roleId('owner')], confirmCode: await freshCode() });
    expect(inv.status, JSON.stringify(inv.body)).toBe(201);
    const second = (await accept(new URL(inv.body.acceptUrl).searchParams.get('token') as string, 'مالک غیرفعال')).body.userId as string;
    expect((await owner.patch(`/admin/staff/${second}`, { suspended: true })).status).toBe(200);
    // Only the test owner stays active among owners.
    const others = (await s.prisma.user.findMany({ where: { status: 'ACTIVE', kind: 'STAFF', id: { not: ownerId }, roles: { some: { role: { isOwner: true } } } }, select: { id: true } })).map((u) => u.id);
    await s.prisma.user.updateMany({ where: { id: { in: others } }, data: { status: 'SUSPENDED' } });
    try {
      expect((await listed()).staff.find((m) => m.id === second)).toMatchObject({ status: 'SUSPENDED', canTrash: true });
      expect((await owner.post(`/admin/staff/${second}/trash`, {})).status).toBe(200);
      // The single active owner: the rule holds on the server.
      await expect(staffTrash.moveToTrash({ userId: second, isOwner: true }, ownerId)).rejects.toThrow(/LAST_OWNER|last owner/);
      expect((await s.prisma.user.findUnique({ where: { id: ownerId } }))?.status).toBe('ACTIVE');
      // Restored: still deactivated, so still not an active owner.
      expect((await owner.post(`/admin/staff/${second}/restore`, {})).status).toBe(200);
      expect((await s.prisma.user.findUnique({ where: { id: second } }))?.status).toBe('SUSPENDED');
    } finally {
      await s.prisma.user.updateMany({ where: { id: { in: others } }, data: { status: 'ACTIVE' } });
    }
  });
});

describe('invitations: pending, expired and revoked', () => {
  it('each state can go to the trash and comes back in the same state', async () => {
    const pending = await invite('pending');
    const expired = await invite('expired');
    await s.prisma.staffInvitation.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - DAY) } });
    const revoked = await invite('revoked');
    expect((await owner.post(`/admin/staff/invitations/${revoked.id}/revoke`, {})).status).toBe(200);

    const before = await listed();
    const statusOf = (body: { invitations: any[] }, id: string) => body.invitations.find((i) => i.id === id)?.status;
    expect(OPEN).toContain(statusOf(before, pending.id));
    expect(statusOf(before, expired.id)).toBe('EXPIRED');
    expect(statusOf(before, revoked.id)).toBe('REVOKED');

    for (const inv of [pending, expired, revoked]) {
      const res = await owner.post<any>(`/admin/staff/invitations/${inv.id}/trash`, {});
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      // A second time: it is not outside the trash any more.
      expect((await owner.post(`/admin/staff/invitations/${inv.id}/trash`, {})).status).toBe(404);
    }
    const during = await listed();
    expect(during.trashCount).toBe(before.trashCount + 3);
    for (const inv of [pending, expired, revoked]) expect(during.invitations.some((i) => i.id === inv.id)).toBe(false);
    const items = (await trashList()).items;
    expect(OPEN).toContain(items.find((i) => i.id === pending.id)?.previousStatus);
    expect(items.find((i) => i.id === expired.id)).toMatchObject({ kind: 'invitation', previousStatus: 'EXPIRED', email: expired.email, fullName: expired.fullName, daysLeft: 30 });
    expect(items.find((i) => i.id === revoked.id)).toMatchObject({ kind: 'invitation', previousStatus: 'REVOKED' });
    expect(items.find((i) => i.id === pending.id)?.roles.length).toBe(1);

    // In the trash the link does not work and nothing else can be done with it.
    const refused = await accept(pending.token, pending.fullName);
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('INVITATION_REVOKED');
    for (const [method, path, body] of [
      ['POST', `/admin/staff/invitations/${pending.id}/resend`, {}],
      ['POST', `/admin/staff/invitations/${pending.id}/revoke`, {}],
      ['PATCH', `/admin/staff/invitations/${pending.id}`, { email: pending.email, fullName: 'نام دیگر', phone: '', roleIds: [roleId('support')] }],
    ] as Array<[string, string, unknown]>) {
      const r = await owner.req<any>(method, path, body);
      expect(r.status, `${method} ${path}`).toBe(409);
      expect(r.body.error.code).toBe('IN_TRASH');
    }

    for (const inv of [pending, expired, revoked]) expect((await owner.post(`/admin/staff/invitations/${inv.id}/restore`, {})).status).toBe(200);
    const after = await listed();
    expect(after.trashCount).toBe(before.trashCount);
    expect(statusOf(after, pending.id)).toBe(statusOf(before, pending.id));
    expect(statusOf(after, expired.id)).toBe('EXPIRED');
    expect(statusOf(after, revoked.id)).toBe('REVOKED');
    expect(await s.prisma.trashEntry.count({ where: { entityId: { in: [pending.id, expired.id, revoked.id] } } })).toBe(0);
    for (const inv of [pending, expired, revoked]) {
      expect((await auditOf(inv.id)).map((a) => a.action)).toEqual(expect.arrayContaining(['staff.invitation.trashed', 'staff.invitation.restored']));
    }
    // The restored pending link works again.
    const ok = await accept(pending.token, pending.fullName);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  });

  it('an accepted invitation is not trashed (the account is); a trashed open invitation frees the address', async () => {
    const accepted = await invite('accepted');
    expect((await accept(accepted.token, accepted.fullName)).status).toBe(200);
    const r = await owner.post<any>(`/admin/staff/invitations/${accepted.id}/trash`, {});
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('INVITATION_ALREADY_ACCEPTED');

    // While the old invitation is in the trash, the same address can be invited again …
    const old = await invite('again');
    expect((await owner.post(`/admin/staff/invitations/${old.id}/trash`, {})).status).toBe(200);
    const fresh = await owner.post<any>('/admin/staff/invitations', { email: old.email, fullName: old.fullName, roleIds: [roleId('support')] });
    expect(fresh.status, JSON.stringify(fresh.body)).toBe(201);
    // … and then the old one cannot come back open next to the new one.
    const back = await owner.post<any>(`/admin/staff/invitations/${old.id}/restore`, {});
    expect(back.status).toBe(409);
    expect(back.body.error.code).toBe('INVITATION_PENDING');
    expect((await trashList()).items.some((i) => i.id === old.id)).toBe(true);
  });

  it('only an owner: a manager is refused on every invitation trash route', async () => {
    const manager: Staff = await inviteStaff(t, owner, 'manager');
    const inv = await invite('guarded');
    expect((await owner.post(`/admin/staff/invitations/${inv.id}/trash`, {})).status).toBe(200);
    for (const [path, body] of [
      [`/admin/staff/invitations/${inv.id}/trash`, {}],
      [`/admin/staff/invitations/${inv.id}/restore`, {}],
      [`/admin/staff/invitations/${inv.id}/purge`, { confirmName: inv.fullName, confirmCode: '123456' }],
    ] as Array<[string, unknown]>) expect((await manager.post(path, body)).status, path).toBe(403);
    expect((await s.prisma.staffInvitation.findUnique({ where: { id: inv.id } }))?.trashedAt).toBeTruthy();
  });

  it('deleting for good needs the typed name and a current code', { timeout: 120_000 }, async () => {
    const inv = await invite('purged');
    expect((await owner.post<any>(`/admin/staff/invitations/${inv.id}/purge`, { confirmName: inv.fullName, confirmCode: '123456' })).status).toBe(404);
    expect((await owner.post(`/admin/staff/invitations/${inv.id}/trash`, {})).status).toBe(200);
    const wrong = await owner.post<any>(`/admin/staff/invitations/${inv.id}/purge`, { confirmName: 'نام دیگر', confirmCode: '123456' });
    expect(wrong.body.error.code).toBe('CONFIRM_NAME_MISMATCH');
    const res = await owner.post<any>(`/admin/staff/invitations/${inv.id}/purge`, { confirmName: inv.fullName, confirmCode: await freshCode() });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await s.prisma.staffInvitation.findUnique({ where: { id: inv.id } })).toBeNull();
    expect(await s.prisma.trashEntry.count({ where: { entityId: inv.id } })).toBe(0);
    expect((await trashList()).items.some((i) => i.id === inv.id)).toBe(false);
    // The address is no longer in the history.
    const mentions = await s.prisma.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*)::bigint AS n FROM audit_log WHERE before::text ILIKE ${'%' + inv.email + '%'} OR after::text ILIKE ${'%' + inv.email + '%'}`;
    expect(Number(mentions[0]!.n)).toBe(0);
  });

  it('the daily job deletes invitations that stayed longer than the retention, as the system', async () => {
    const old = await invite('auto-old');
    const recent = await invite('auto-recent');
    for (const inv of [old, recent]) expect((await owner.post(`/admin/staff/invitations/${inv.id}/trash`, {})).status).toBe(200);
    await s.prisma.trashEntry.update({ where: { kind_entityId: { kind: 'staff_invitation', entityId: old.id } }, data: { trashedAt: new Date(Date.now() - 31 * DAY) } });
    const result = await s.runAsWorker(() => trash.purgeExpired());
    expect(result.failed).toBe(0);
    expect(await s.prisma.staffInvitation.findUnique({ where: { id: old.id } })).toBeNull();
    expect((await s.prisma.staffInvitation.findUnique({ where: { id: recent.id } }))?.trashedAt).toBeTruthy();
    expect((await auditOf(old.id)).find((a) => a.action === 'staff.invitation.auto_erased')?.actorKind).toBe('SYSTEM');
    expect((await owner.post(`/admin/staff/invitations/${recent.id}/restore`, {})).status).toBe(200);
  });
});
