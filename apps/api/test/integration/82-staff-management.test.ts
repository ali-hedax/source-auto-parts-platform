import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Services, type Staff, type TestApp, bootApp, enrollTotp, inviteStaff, loginOwner, ownerTotp, services } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Staff management (panel → staff), owner only: editing open invitations (e-mail, name, phone,
 * roles; a new address means a new link), resend/revoke, editing active staff (name, phone, roles),
 * deactivation that signs out at once, authenticator reset for a new phone, the audit trail,
 * server-side owner-only checks, and "never fewer than one active owner".
 */
let t: TestApp;
let s: Services;
let owner: Client;
let ownerId: string;
let lastCode: string | undefined;
const run = Date.now().toString(36);
let roles: Array<{ id: string; key: string }>;
const roleId = (key: string) => roles.find((r) => r.key === key)!.id;

/** A fresh owner code; each one works once per 30-second step (also across test files). */
const freshCode = async () => {
  const used = await s.prisma.user.findFirst({ where: { email: process.env.TEST_OWNER_EMAIL }, select: { mfaLastTimeStep: true } });
  const step = Math.floor(Date.now() / 30_000);
  if (used?.mfaLastTimeStep != null && used.mfaLastTimeStep >= step) await new Promise((r) => setTimeout(r, (step + 1) * 30_000 - Date.now() + 500));
  lastCode = await ownerTotp(lastCode);
  return lastCode;
};

const tokenOf = (url: string) => new URL(url).searchParams.get('token') as string;
const listed = async () => (await owner.get<{ staff: any[]; invitations: any[] }>('/admin/staff')).body;
const invitationOf = async (id: string) => (await listed()).invitations.find((i: any) => i.id === id);
const memberOf = async (id: string) => (await listed()).staff.find((m: any) => m.id === id);
const audits = async (entityId: string) => (await owner.get<any[]>(`/admin/audit?entityId=${entityId}`)).body;
const activeOwners = async () => s.prisma.user.count({ where: { status: 'ACTIVE', kind: 'STAFF', roles: { some: { role: { isOwner: true } } } } });

beforeAll(async () => {
  t = await bootApp();
  s = await services(t);
  owner = await loginOwner(t);
  ownerId = (await owner.get<{ id: string }>('/me')).body.id;
  roles = (await owner.get<Array<{ id: string; key: string }>>('/admin/roles')).body;
});

afterAll(async () => {
  await t?.close();
});

describe('editing invitations that were not accepted', () => {
  it('name, phone and roles change in place; the link keeps working and the account gets them', async () => {
    const email = `inv-edit.${run}@hedax.test`;
    const inv = await owner.post<any>('/admin/staff/invitations', { email, fullName: 'نام اولیه', phone: '۰۹۱۲ ۱۲۳ ۴۵۶۷', roleIds: [roleId('support')] });
    expect(inv.status, JSON.stringify(inv.body)).toBe(201);
    expect((await invitationOf(inv.body.invitationId)).phone).toBe('0912 123 4567');

    const edited = await owner.patch<any>(`/admin/staff/invitations/${inv.body.invitationId}`, { email, fullName: 'نام ویرایش‌شده', phone: '+98 21 5555 0000', roleIds: [roleId('sales_manager')] });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect(edited.body.emailChanged).toBe(false);
    const view = await invitationOf(inv.body.invitationId);
    expect(view).toMatchObject({ fullName: 'نام ویرایش‌شده', phone: '+98 21 5555 0000' });
    expect(view.roles.map((r: any) => r.id)).toEqual([roleId('sales_manager')]);

    // History: who changed what, before and after.
    const entry = (await audits(inv.body.invitationId)).find((a) => a.action === 'staff.invitation.updated');
    expect(entry.before).toMatchObject({ fullName: 'نام اولیه', phone: '0912 123 4567', roles: ['support'] });
    expect(entry.after).toMatchObject({ fullName: 'نام ویرایش‌شده', phone: '+98 21 5555 0000', roles: ['sales_manager'], newLink: false });

    // The original link still works and the account carries the edited roles and phone.
    const accepted = await new Client(t).post<any>('/auth/invitations/accept', { token: tokenOf(inv.body.acceptUrl), fullName: 'نام ویرایش‌شده', password: `Ed-${run}-Kq!9wz-Lm` });
    expect(accepted.status).toBe(200);
    const member = await memberOf(accepted.body.userId);
    expect(member).toMatchObject({ phone: '+98 21 5555 0000', status: 'ACTIVE' });
    expect(member.roles.map((r: any) => r.key)).toEqual(['sales_manager']);
    // An accepted invitation is edited as a staff member, not as an invitation.
    const late = await owner.patch(`/admin/staff/invitations/${inv.body.invitationId}`, { email, fullName: 'x y', phone: '', roleIds: [roleId('support')] });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('INVITATION_ALREADY_ACCEPTED');
  });

  it('a new e-mail address invalidates the old link and sends a new one with a new expiry', async () => {
    const inv = await owner.post<any>('/admin/staff/invitations', { email: `inv-move.${run}@hedax.test`, fullName: 'جابه‌جایی', roleIds: [roleId('support')] });
    const before = await s.prisma.staffInvitation.findUniqueOrThrow({ where: { id: inv.body.invitationId } });
    await new Promise((r) => setTimeout(r, 20));
    const newEmail = `inv-moved.${run}@hedax.test`;
    const moved = await owner.patch<any>(`/admin/staff/invitations/${inv.body.invitationId}`, { email: newEmail.toUpperCase(), fullName: 'جابه‌جایی', phone: '', roleIds: [roleId('support')] });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(moved.body).toMatchObject({ emailChanged: true, emailQueued: true });
    expect(new Date(moved.body.expiresAt).getTime()).toBeGreaterThan(before.expiresAt.getTime());
    const old = await new Client(t).post<any>('/auth/invitations/accept', { token: tokenOf(inv.body.acceptUrl), fullName: 'جابه‌جایی', password: `Mv-${run}-Zq!8wx-Pn` });
    expect(old.body.error.code).toBe('INVITATION_INVALID');
    const emails = await s.prisma.emailMessage.findMany({ where: { invitationId: inv.body.invitationId }, orderBy: { createdAt: 'asc' } });
    expect(emails.map((e) => [e.toAddress, e.status])).toEqual([[`inv-move.${run}@hedax.test`, 'CANCELLED'], [newEmail, 'QUEUED']]);
    expect((await new Client(t).post('/auth/invitations/accept', { token: tokenOf(moved.body.acceptUrl), fullName: 'جابه‌جایی', password: `Mv-${run}-Zq!8wx-Pn` })).status).toBe(200);
  });

  it('checks e-mail, phone, duplicates, revoked invitations and the owner role', async () => {
    const inv = await owner.post<any>('/admin/staff/invitations', { email: `inv-check.${run}@hedax.test`, fullName: 'بررسی', roleIds: [roleId('support')] });
    const other = await owner.post<any>('/admin/staff/invitations', { email: `inv-other.${run}@hedax.test`, fullName: 'دیگری', roleIds: [roleId('support')] });
    const patch = (body: Record<string, unknown>) => owner.patch<any>(`/admin/staff/invitations/${inv.body.invitationId}`, { email: `inv-check.${run}@hedax.test`, fullName: 'بررسی', phone: '', roleIds: [roleId('support')], ...body });
    const badEmail = await patch({ email: 'not-an-email' });
    expect(badEmail.status).toBe(400);
    expect(badEmail.body.error.fields.map((f: any) => f.path)).toContain('email');
    const badPhone = await patch({ phone: 'call me' });
    expect(badPhone.status).toBe(400);
    expect(badPhone.body.error.fields).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'phone', message: 'INVALID_PHONE' })]));
    expect((await patch({ email: process.env.TEST_OWNER_EMAIL })).body.error.code).toBe('EMAIL_IN_USE');
    expect((await patch({ email: `inv-other.${run}@hedax.test` })).body.error.code).toBe('INVITATION_PENDING');
    // Adding the owner role needs the acting owner's current code.
    const toOwner = await patch({ roleIds: [roleId('owner')] });
    expect(toOwner.status).toBe(403);
    expect(toOwner.body.error.code).toBe('MFA_CONFIRMATION_REQUIRED');

    // Resend: a new link and a later expiry; revoke: no more edits.
    const first = await s.prisma.staffInvitation.findUniqueOrThrow({ where: { id: other.body.invitationId } });
    await new Promise((r) => setTimeout(r, 20));
    const resent = await owner.post<any>(`/admin/staff/invitations/${other.body.invitationId}/resend`, {});
    expect(resent.status).toBe(200);
    expect(new Date(resent.body.expiresAt).getTime()).toBeGreaterThan(first.expiresAt.getTime());
    expect((await new Client(t).post<any>('/auth/invitations/accept', { token: tokenOf(other.body.acceptUrl), fullName: 'دیگری', password: `Ot-${run}-Zq!8wx-Pn` })).body.error.code).toBe('INVITATION_INVALID');
    expect((await owner.post(`/admin/staff/invitations/${other.body.invitationId}/revoke`, {})).status).toBe(200);
    const afterRevoke = await owner.patch<any>(`/admin/staff/invitations/${other.body.invitationId}`, { email: `inv-other.${run}@hedax.test`, fullName: 'دیگری', phone: '', roleIds: [roleId('support')] });
    expect(afterRevoke.body.error.code).toBe('INVITATION_REVOKED');
    expect((await invitationOf(other.body.invitationId)).status).toBe('REVOKED');
  });
});

describe('active staff', () => {
  it('name and phone change without signing them out; role changes and deactivation sign them out at once', async () => {
    const staff = await inviteStaff(t, owner, 'support');
    const edit = await owner.patch(`/admin/staff/${staff.userId}`, { fullName: 'نام تازهٔ پشتیبان', phone: '0912 000 1111' });
    expect(edit.status, JSON.stringify(edit.body)).toBe(200);
    expect(await memberOf(staff.userId)).toMatchObject({ fullName: 'نام تازهٔ پشتیبان', phone: '0912 000 1111' });
    expect((await staff.get('/me')).status).toBe(200);
    expect((await owner.patch<any>(`/admin/staff/${staff.userId}`, { phone: '12' })).body.error.fields[0]).toMatchObject({ path: 'phone', message: 'INVALID_PHONE' });

    expect((await owner.patch(`/admin/staff/${staff.userId}`, { roleIds: [roleId('procurement')] })).status).toBe(200);
    expect((await staff.get('/me')).status).toBe(401);
    expect((await memberOf(staff.userId)).roles.map((r: any) => r.key)).toEqual(['procurement']);

    // Deactivate: refused at sign-in until activated again.
    const again = new Client(t);
    expect((await again.post('/auth/staff/login', { email: staff.email, password: staff.password })).status).toBe(200);
    expect((await owner.patch(`/admin/staff/${staff.userId}`, { suspended: true, reason: 'test' })).status).toBe(200);
    expect((await again.get('/me')).status).toBe(401);
    const refused = await new Client(t).post<any>('/auth/staff/login', { email: staff.email, password: staff.password });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('ACCOUNT_SUSPENDED');
    expect((await memberOf(staff.userId)).status).toBe('SUSPENDED');
    expect((await owner.patch(`/admin/staff/${staff.userId}`, { suspended: false })).status).toBe(200);
    expect((await new Client(t).post('/auth/staff/login', { email: staff.email, password: staff.password })).status).toBe(200);

    const history = (await audits(staff.userId)).filter((a) => a.action === 'staff.updated');
    expect(history.length).toBeGreaterThanOrEqual(4);
    expect(history.some((a) => a.after?.fullName === 'نام تازهٔ پشتیبان' && a.before?.fullName)).toBe(true);
    expect(history.some((a) => a.after?.status === 'SUSPENDED')).toBe(true);
  });

  it('authenticator reset (new phone): codes and sessions end; the next sign-in sets it up again', { timeout: 150_000 }, async () => {
    const staff = await inviteStaff(t, owner, 'finance'); // finance requires two-step verification
    expect(staff.totpSecret).toBeTruthy();
    expect((await memberOf(staff.userId)).mfaEnabled).toBe(true);
    expect((await owner.post(`/admin/staff/${staff.userId}/mfa-reset`, {})).status).toBe(400);
    expect((await owner.post<any>(`/admin/staff/${ownerId}/mfa-reset`, { confirmCode: '123456' })).body.error.code).toBe('SELF_EDIT');
    const reset = await owner.post<any>(`/admin/staff/${staff.userId}/mfa-reset`, { confirmCode: await freshCode() });
    expect(reset.status, JSON.stringify(reset.body)).toBe(200);
    expect((await staff.get('/me')).status).toBe(401);
    expect((await memberOf(staff.userId)).mfaEnabled).toBe(false);
    expect(await s.prisma.mfaRecoveryCode.count({ where: { userId: staff.userId } })).toBe(0);
    const login = await new Client(t).post<any>('/auth/staff/login', { email: staff.email, password: staff.password });
    expect(login.body.status).toBe('MFA_ENROLLMENT_REQUIRED');
    expect((await audits(staff.userId)).some((a) => a.action === 'staff.mfa_reset')).toBe(true);
  });
});

describe('only the owner manages staff (checked by the server)', () => {
  it('manager and a role holding users.manage are refused everywhere; /me says who is an owner', async () => {
    const manager: Staff = await inviteStaff(t, owner, 'manager');
    const custom = await owner.post<any>('/admin/roles', { key: `people2_${run}`.slice(0, 40), nameFa: 'مدیر کارکنان', nameEn: 'People admin', permissions: ['dashboard.view', 'users.manage'] });
    expect(custom.status).toBe(201);
    const people: Staff = await inviteStaff(t, owner, `people2_${run}`.slice(0, 40));
    const inv = await owner.post<any>('/admin/staff/invitations', { email: `inv-perm.${run}@hedax.test`, fullName: 'دسترسی', roleIds: [roleId('support')] });
    const target = await inviteStaff(t, owner, 'support');
    const attempts: Array<[string, string, unknown]> = [
      ['GET', '/admin/staff', undefined],
      ['POST', '/admin/staff/invitations', { email: `x.${run}@hedax.test`, fullName: 'نفوذی', roleIds: [roleId('support')] }],
      ['PATCH', `/admin/staff/invitations/${inv.body.invitationId}`, { email: `inv-perm.${run}@hedax.test`, fullName: 'تغییر', phone: '', roleIds: [roleId('support')] }],
      ['POST', `/admin/staff/invitations/${inv.body.invitationId}/resend`, {}],
      ['POST', `/admin/staff/invitations/${inv.body.invitationId}/revoke`, {}],
      ['POST', `/admin/staff/invitations/${inv.body.invitationId}/erase`, { confirmCode: '123456' }],
      ['PATCH', `/admin/staff/${target.userId}`, { fullName: 'تغییر', suspended: true }],
      ['POST', `/admin/staff/${target.userId}/mfa-reset`, { confirmCode: '123456' }],
      ['GET', '/admin/staff/trash', undefined],
      ['POST', `/admin/staff/${target.userId}/trash`, {}],
      ['POST', `/admin/staff/${target.userId}/restore`, {}],
      ['POST', `/admin/staff/${target.userId}/purge`, { confirmName: 'کارمند support', confirmCode: '123456' }],
    ];
    for (const [method, path, body] of attempts) {
      const m = await manager.req(method, path, body);
      expect(m.status, `manager ${method} ${path}`).toBe(403);
      const p = await people.req(method, path, body);
      expect(p.status, `users.manage ${method} ${path}`).toBe(403);
      expect(p.body.error.code, `users.manage ${method} ${path}`).toBe('OWNER_ONLY');
    }
    // Nothing changed.
    expect(await memberOf(target.userId)).toMatchObject({ status: 'ACTIVE', fullName: 'کارمند support' });
    expect((await invitationOf(inv.body.invitationId)).status).not.toBe('REVOKED');
    expect((await manager.get<any>('/me')).body.isOwner).toBe(false);
    expect((await owner.get<any>('/me')).body.isOwner).toBe(true);
  });

  it('the owner cannot change, deactivate, reset or delete themselves, and one active owner always remains', { timeout: 150_000 }, async () => {
    for (const body of [{ roleIds: [roleId('support')] }, { suspended: true }, { fullName: 'نام دیگر' }]) {
      const res = await owner.patch<any>(`/admin/staff/${ownerId}`, body);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('SELF_EDIT');
    }
    expect((await owner.post<any>(`/admin/staff/${ownerId}/trash`, {})).body.error.code).toBe('SELF_EDIT');
    expect(await activeOwners()).toBeGreaterThanOrEqual(1);

    // A second owner (confirmed with the acting owner's code), then demoted and deactivated by the first.
    const email = `owner2.${run}@hedax.test`;
    const inv = await owner.post<any>('/admin/staff/invitations', { email, fullName: 'مالک دوم', roleIds: [roleId('owner')], confirmCode: await freshCode() });
    expect(inv.status, JSON.stringify(inv.body)).toBe(201);
    const password = `Ow-${run}-Kq!9wz-Lm`;
    const accepted = await new Client(t).post<any>('/auth/invitations/accept', { token: tokenOf(inv.body.acceptUrl), fullName: 'مالک دوم', password });
    const second = new Client(t);
    expect((await second.post<any>('/auth/staff/login', { email, password })).body.status).toBe('MFA_ENROLLMENT_REQUIRED');
    await enrollTotp(second);
    expect((await second.get<any>('/me')).body.isOwner).toBe(true);
    const owners = await activeOwners();
    expect(owners).toBeGreaterThanOrEqual(2);
    // The second owner cannot remove themselves either.
    expect((await second.patch<any>(`/admin/staff/${accepted.body.userId}`, { suspended: true })).body.error.code).toBe('SELF_EDIT');
    // Another owner can be deactivated while this one stays active.
    expect((await owner.patch(`/admin/staff/${accepted.body.userId}`, { suspended: true })).status).toBe(200);
    expect(await activeOwners()).toBe(owners - 1);
    expect((await second.get('/me')).status).toBe(401);
    // Another owner can go to the trash and come back (still deactivated); the last active owner stays.
    expect((await owner.post<any>(`/admin/staff/${accepted.body.userId}/trash`, {})).status).toBe(200);
    expect((await owner.post<any>(`/admin/staff/${accepted.body.userId}/restore`, {})).status).toBe(200);
    expect((await memberOf(accepted.body.userId))?.status).toBe('SUSPENDED');
    expect((await owner.patch(`/admin/staff/${accepted.body.userId}`, { roleIds: [roleId('support')] })).status).toBe(200);
    expect(await activeOwners()).toBeGreaterThanOrEqual(1);
    expect((await owner.get('/me')).status).toBe(200);
  });
});
