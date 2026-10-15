import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Services, type Staff, type TestApp, bootApp, enrollTotp, inviteStaff, loginOwner, ownerTotp, services } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Staff trash (panel → staff → trash), owner only: «حذف» moves a staff member to the trash (signed
 * out at once, no sign-in, hidden from lists, counts and pickers, e-mail kept reserved); restoring
 * brings back the same roles and status with a reset authenticator; deleting for good is the
 * complete erasure; the daily job deletes what stayed longer than site settings → trash retention
 * days; the last active owner never gets there; every step is in the audit trail.
 */
let t: TestApp;
let s: Services;
let owner: Client;
let ownerId: string;
let trash: any;
let staffTrash: any;
let lastCode: string | undefined;
const run = Date.now().toString(36);
const DAY = 86_400_000;

const freshCode = async () => {
  const used = await s.prisma.user.findFirst({ where: { email: process.env.TEST_OWNER_EMAIL }, select: { mfaLastTimeStep: true } });
  const step = Math.floor(Date.now() / 30_000);
  if (used?.mfaLastTimeStep != null && used.mfaLastTimeStep >= step) await new Promise((r) => setTimeout(r, (step + 1) * 30_000 - Date.now() + 500));
  lastCode = await ownerTotp(lastCode);
  return lastCode;
};

const listed = async () => (await owner.get<{ staff: any[]; trashCount: number }>('/admin/staff')).body;
const trashList = async () => (await owner.get<{ items: any[]; retentionDays: number }>('/admin/staff/trash')).body;
const actions = async (entityId: string) => (await s.prisma.auditLog.findMany({ where: { entityId }, orderBy: { createdAt: 'asc' }, select: { action: true, actorKind: true } }));
const setRetention = async (days: number, by: Client = owner) => {
  const cur = (await by.get<any>('/admin/settings')).body;
  return by.put<any>('/admin/settings', { ...cur, trashRetentionDays: days });
};

beforeAll(async () => {
  t = await bootApp();
  s = await services(t);
  owner = await loginOwner(t);
  ownerId = (await owner.get<any>('/me')).body.id;
  const [trashMod, staffTrashMod] = await Promise.all([import('../../dist/modules/trash/trash.service.js'), import('../../dist/modules/admin/staff-trash.service.js')]);
  trash = t.get<any>(trashMod.TrashService);
  staffTrash = t.get<any>(staffTrashMod.StaffTrashService);
});

afterAll(async () => {
  await t?.close();
});

describe('moving to the trash and restoring', () => {
  it('signs out at once, blocks sign-in, hides the person and keeps the e-mail reserved; restore brings the same roles with a new authenticator', { timeout: 120_000 }, async () => {
    const member: Staff = await inviteStaff(t, owner, ['support', 'finance']);
    expect(member.totpSecret).toBeTruthy();
    const before = await listed();
    const supportCount = async () => (await owner.get<any[]>('/admin/roles')).body.find((r) => r.key === 'support').members as number;
    const membersBefore = await supportCount();
    const colleague = await inviteStaff(t, owner, 'support');
    expect((await colleague.get<any[]>('/admin/staff/options')).body.some((o) => o.id === member.userId)).toBe(true);

    const res = await owner.post<any>(`/admin/staff/${member.userId}/trash`, {});
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    // Signed out everywhere and cannot sign in again.
    expect((await member.get('/me')).status).toBe(401);
    const again = await new Client(t).post<any>('/auth/staff/login', { email: member.email, password: member.password });
    expect(again.status).toBe(403);
    expect(again.body.error.code).toBe('ACCOUNT_SUSPENDED');

    // Not in the staff list, the pickers or the role counts; the trash tab counts it.
    const after = await listed();
    expect(after.staff.some((m) => m.id === member.userId)).toBe(false);
    expect(after.trashCount).toBe(before.trashCount + 1);
    expect((await colleague.get<any[]>('/admin/staff/options')).body.some((o) => o.id === member.userId)).toBe(false);
    expect(await supportCount()).toBe(membersBefore);
    // Edits and resets are refused while in the trash.
    expect((await owner.patch(`/admin/staff/${member.userId}`, { fullName: 'نام دیگر' })).status).toBe(404);

    // The e-mail stays reserved: no new invitation or account can take it.
    const reuse = await owner.post<any>('/admin/staff/invitations', { email: member.email, fullName: 'دیگری', roleIds: [(await owner.get<any[]>('/admin/roles')).body.find((r) => r.key === 'support').id] });
    expect(reuse.status).toBe(409);

    // The trash row: name, e-mail, roles, date, by whom, days left (default 30).
    const row = (await trashList()).items.find((i) => i.id === member.userId);
    expect(row).toMatchObject({ fullName: 'کارمند support finance', email: member.email, label: 'کارمند support finance', daysLeft: 30 });
    expect(row.roles.map((r: any) => r.nameEn).length).toBe(2);
    expect(row.trashedBy).toBeTruthy();
    expect(new Date(row.purgeAt).getTime() - new Date(row.trashedAt).getTime()).toBe(30 * DAY);

    // Restore: same roles and status; the authenticator has to be set up again.
    expect((await owner.post<any>(`/admin/staff/${member.userId}/restore`, {})).status).toBe(200);
    const back = (await listed()).staff.find((m) => m.id === member.userId);
    expect(back).toMatchObject({ status: 'ACTIVE', mfaEnabled: false });
    expect(back.roles.map((r: any) => r.key).sort()).toEqual(['finance', 'support']);
    expect(await s.prisma.mfaRecoveryCode.count({ where: { userId: member.userId } })).toBe(0);
    expect(await s.prisma.trashEntry.count({ where: { entityId: member.userId } })).toBe(0);
    const relogin = new Client(t);
    const login = await relogin.post<any>('/auth/staff/login', { email: member.email, password: member.password });
    expect(login.status).toBe(200);
    expect(login.body.status).toBe('MFA_ENROLLMENT_REQUIRED');
    await enrollTotp(relogin);
    expect((await relogin.get('/me')).status).toBe(200);

    expect((await actions(member.userId)).map((a) => a.action)).toEqual(expect.arrayContaining(['staff.trashed', 'staff.restored']));
  });

  it('a deactivated member comes back deactivated', async () => {
    const member: Staff = await inviteStaff(t, owner, 'support');
    expect((await owner.patch(`/admin/staff/${member.userId}`, { suspended: true })).status).toBe(200);
    expect((await owner.post(`/admin/staff/${member.userId}/trash`, {})).status).toBe(200);
    expect((await owner.post(`/admin/staff/${member.userId}/trash`, {})).status).toBe(404);
    expect((await owner.post(`/admin/staff/${member.userId}/restore`, {})).status).toBe(200);
    expect((await owner.post(`/admin/staff/${member.userId}/restore`, {})).status).toBe(404);
    expect((await listed()).staff.find((m) => m.id === member.userId)?.status).toBe('SUSPENDED');
  });
});

describe('who may use the trash', () => {
  it('only an owner: a manager and other staff are refused on every trash route, and only an owner changes the retention', async () => {
    const manager: Staff = await inviteStaff(t, owner, 'manager');
    const support: Staff = await inviteStaff(t, owner, 'support');
    const target: Staff = await inviteStaff(t, owner, 'support');
    expect((await owner.post(`/admin/staff/${target.userId}/trash`, {})).status).toBe(200);
    const attempts: Array<[string, string, unknown]> = [
      ['GET', '/admin/staff/trash', undefined],
      ['POST', `/admin/staff/${support.userId}/trash`, {}],
      ['POST', `/admin/staff/${target.userId}/restore`, {}],
      ['POST', `/admin/staff/${target.userId}/purge`, { confirmName: 'کارمند support', confirmCode: '123456' }],
    ];
    for (const [method, path, body] of attempts) {
      const m = await manager.req(method, path, body);
      expect(m.status, `manager ${method} ${path}`).toBe(403);
      // The manager lacks users.manage; a role that has it is refused with OWNER_ONLY (82-staff-management).
      expect(['MISSING_PERMISSION', 'OWNER_ONLY'], `manager ${method} ${path}`).toContain(m.body.error.code);
      expect((await support.req(method, path, body)).status, `support ${method} ${path}`).toBe(403);
    }
    expect(await s.prisma.user.findUnique({ where: { id: target.userId }, select: { status: true } })).toMatchObject({ status: 'TRASHED' });
    expect(await s.prisma.user.findUnique({ where: { id: support.userId }, select: { status: true } })).toMatchObject({ status: 'ACTIVE' });

    // The manager edits other site settings but not how long the trash keeps people.
    const refused = await setRetention(7, manager);
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('OWNER_ONLY');
    const cur = (await manager.get<any>('/admin/settings')).body;
    expect((await manager.put<any>('/admin/settings', { ...cur, quoteValidityHoursDefault: cur.quoteValidityHoursDefault })).status).toBe(200);
    expect((await owner.post(`/admin/staff/${target.userId}/restore`, {})).status).toBe(200);
  });
});

describe('the last active owner', () => {
  it('can never be moved to the trash', async () => {
    // Through the API an owner can only trash someone else, so the rule is checked on the service:
    // a second owner who is the only active one (the test owner briefly deactivated) is refused.
    const email = `owner-last.${run}@hedax.test`;
    const ownerRole = (await owner.get<any[]>('/admin/roles')).body.find((r) => r.isOwner).id;
    const inv = await owner.post<any>('/admin/staff/invitations', { email, fullName: 'مالک تنها', roleIds: [ownerRole], confirmCode: await freshCode() });
    expect(inv.status, JSON.stringify(inv.body)).toBe(201);
    const accepted = await new Client(t).post<any>('/auth/invitations/accept', { token: new URL(inv.body.acceptUrl).searchParams.get('token'), fullName: 'مالک تنها', password: `Ol-${run}-Qz!8wx-Pn` });
    const second = accepted.body.userId as string;
    // Every other active owner (also those other test files left behind) is briefly deactivated.
    const others = (await s.prisma.user.findMany({ where: { status: 'ACTIVE', kind: 'STAFF', id: { not: second }, roles: { some: { role: { isOwner: true } } } }, select: { id: true } })).map((u) => u.id);
    await s.prisma.user.updateMany({ where: { id: { in: others } }, data: { status: 'SUSPENDED' } });
    try {
      await expect(staffTrash.moveToTrash({ userId: ownerId, isOwner: true }, second)).rejects.toThrow(/LAST_OWNER|last owner/);
      expect((await s.prisma.user.findUnique({ where: { id: second } }))?.status).toBe('ACTIVE');
    } finally {
      await s.prisma.user.updateMany({ where: { id: { in: others } }, data: { status: 'ACTIVE' } });
    }
    // With two active owners, the other one may go to the trash (and comes back).
    expect((await owner.get<any>('/admin/staff')).body.staff.find((m: any) => m.id === second)?.canTrash).toBe(true);
    expect((await owner.post(`/admin/staff/${second}/trash`, {})).status).toBe(200);
    expect((await owner.post(`/admin/staff/${second}/restore`, {})).status).toBe(200);
  });
});

describe('deleting for good', () => {
  it('needs the typed name and a current code; an owner in the trash can be deleted too', { timeout: 150_000 }, async () => {
    const ownerRole = (await owner.get<any[]>('/admin/roles')).body.find((r) => r.isOwner).id;
    const email = `owner-trash.${run}@hedax.test`;
    const inv = await owner.post<any>('/admin/staff/invitations', { email, fullName: 'مالک قدیمی', roleIds: [ownerRole], confirmCode: await freshCode() });
    expect(inv.status).toBe(201);
    const accepted = await new Client(t).post<any>('/auth/invitations/accept', { token: new URL(inv.body.acceptUrl).searchParams.get('token'), fullName: 'مالک قدیمی', password: `Ot-${run}-Wz!4kd-Rm` });
    const id = accepted.body.userId as string;
    // Not in the trash yet: nothing to delete for good.
    expect((await owner.post<any>(`/admin/staff/${id}/purge`, { confirmName: 'مالک قدیمی', confirmCode: '123456' })).status).toBe(404);
    expect((await owner.post(`/admin/staff/${id}/trash`, {})).status).toBe(200);
    expect((await owner.post<any>(`/admin/staff/${id}/purge`, { confirmName: 'مالک', confirmCode: '123456' })).body.error.code).toBe('CONFIRM_NAME_MISMATCH');
    const res = await owner.post<any>(`/admin/staff/${id}/purge`, { confirmName: 'مالك قديمي', confirmCode: await freshCode() });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await s.prisma.user.findUnique({ where: { id } })).toMatchObject({ status: 'DELETED', email: null, fullName: null });
    expect(await s.prisma.trashEntry.count({ where: { entityId: id } })).toBe(0);
    expect((await trashList()).items.some((i) => i.id === id)).toBe(false);
  });
});

describe('automatic deletion', () => {
  it('the daily job deletes what stayed longer than the retention set in site settings, as the system', { timeout: 120_000 }, async () => {
    const old: Staff = await inviteStaff(t, owner, 'support');
    const recent: Staff = await inviteStaff(t, owner, 'support');
    for (const m of [old, recent]) expect((await owner.post(`/admin/staff/${m.userId}/trash`, {})).status).toBe(200);
    await s.prisma.trashEntry.update({ where: { kind_entityId: { kind: 'staff', entityId: old.userId } }, data: { trashedAt: new Date(Date.now() - 31 * DAY) } });
    await s.prisma.trashEntry.update({ where: { kind_entityId: { kind: 'staff', entityId: recent.userId } }, data: { trashedAt: new Date(Date.now() - 10 * DAY) } });
    expect((await trashList()).items.find((i) => i.id === recent.userId)?.daysLeft).toBe(20);

    const first = await s.runAsWorker(() => trash.purgeExpired());
    expect(first.failed).toBe(0);
    expect(first.purged).toBeGreaterThanOrEqual(1);
    expect(await s.prisma.user.findUnique({ where: { id: old.userId } })).toMatchObject({ status: 'DELETED', email: null });
    expect(await s.prisma.user.findUnique({ where: { id: recent.userId } })).toMatchObject({ status: 'TRASHED', email: recent.email });
    const auto = (await actions(old.userId)).find((a) => a.action === 'staff.auto_erased');
    expect(auto?.actorKind).toBe('SYSTEM');

    // A shorter retention (owner, in site settings) applies to what is already in the trash.
    expect((await setRetention(7)).status).toBe(200);
    expect((await trashList()).retentionDays).toBe(7);
    await s.runAsWorker(() => trash.purgeExpired());
    expect(await s.prisma.user.findUnique({ where: { id: recent.userId } })).toMatchObject({ status: 'DELETED' });
    expect((await setRetention(30)).status).toBe(200);
  });
});
