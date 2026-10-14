import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Services, type TestApp, bootApp, inviteStaff, loginOwner, ownerTotp, services } from './helpers.js';

/**
 * Erasing a staff member or an invitation (owner request, cannot be undone): the person's name and
 * e-mail disappear from the account, the invitations, the e-mails and the audit trail, while the
 * audit events themselves stay and the audit log still refuses deletes and ordinary updates.
 */
let t: TestApp;
let s: Services;
let owner: Client;
let lastCode: string | undefined;
const run = Date.now().toString(36);

/** Each erasure consumes one authenticator code; the next one waits for a fresh time step. */
const freshCode = async () => {
  // Another test file may already have used the current step (replay protection).
  const used = await s.prisma.user.findFirst({ where: { email: process.env.TEST_OWNER_EMAIL }, select: { mfaLastTimeStep: true } });
  const step = Math.floor(Date.now() / 30_000);
  if (used?.mfaLastTimeStep != null && used.mfaLastTimeStep >= step) await new Promise((r) => setTimeout(r, (step + 1) * 30_000 - Date.now() + 500));
  lastCode = await ownerTotp(lastCode);
  return lastCode;
};

const supportRoleId = async () => (await owner.get<Array<{ id: string; key: string }>>('/admin/roles')).body.find((r) => r.key === 'support')!.id;

/** Audit rows whose payload still mentions the text (case-insensitive). */
const auditMentions = async (text: string) => {
  const rows = await s.prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*) AS n FROM audit_log WHERE strpos(lower(coalesce(before::text, '') || coalesce(after::text, '')), lower(${text})) > 0`;
  return Number(rows[0]!.n);
};

beforeAll(async () => {
  t = await bootApp();
  s = await services(t);
  owner = await loginOwner(t);
});

afterAll(async () => {
  await t?.close();
});

describe('staff erasure', () => {
  it('erases an account: no name or e-mail left, access gone, history kept without the name', { timeout: 150_000 }, async () => {
    const email = `erase-me.${run}@hedax.test`;
    const fullName = `کارمند حذف‌شدنی ${run}`;
    const inv = await owner.post<{ acceptUrl: string; invitationId: string }>('/admin/staff/invitations', { email, fullName, roleIds: [await supportRoleId()] });
    expect(inv.status, JSON.stringify(inv.body)).toBe(201);
    const staff = new Client(t);
    const password = `Er-${Math.random().toString(36).slice(2)}-Zx!7q`;
    const token = new URL(inv.body.acceptUrl).searchParams.get('token') as string;
    const accepted = await staff.post<{ userId: string }>('/auth/invitations/accept', { token, fullName, password });
    expect(accepted.status).toBe(200);
    const userId = accepted.body.userId;
    expect((await staff.post('/auth/staff/login', { email, password })).status).toBe(200);
    expect((await staff.get('/me')).status).toBe(200);
    expect(await auditMentions(email)).toBeGreaterThan(0);

    // «حذف» only moves to the trash. Deleting for good is the owner's alone, from the trash, with the
    // name typed again and a current authenticator code.
    const support = await inviteStaff(t, owner, 'support');
    expect((await support.post(`/admin/staff/${userId}/trash`, {})).status).toBe(403);
    expect((await owner.post(`/admin/staff/${userId}/purge`, { confirmName: fullName, confirmCode: '123456' })).status).toBe(404);
    expect((await owner.post(`/admin/staff/${userId}/trash`, {})).status).toBe(200);
    expect((await support.post(`/admin/staff/${userId}/purge`, { confirmName: fullName, confirmCode: '123456' })).status).toBe(403);
    expect((await owner.post(`/admin/staff/${userId}/purge`, { confirmName: fullName })).status).toBe(400);
    expect((await owner.post(`/admin/staff/${userId}/purge`, { confirmName: 'کس دیگر', confirmCode: '123456' })).body.error.code).toBe('CONFIRM_NAME_MISMATCH');
    const wrong = await owner.post(`/admin/staff/${userId}/purge`, { confirmName: fullName, confirmCode: '000000' === (await ownerTotp()) ? '111111' : '000000' });
    expect(wrong.body.error.code).toBe('MFA_CODE_INVALID');

    // The typed name is compared like search text: Arabic ي/ك, extra spaces and the half-space do not matter.
    const typed = ` ${fullName.replace('‌', ' ').replace(/ی/g, 'ي')}  `;
    const res = await owner.post<{ erased: boolean; invitations: number; auditEntries: number }>(`/admin/staff/${userId}/purge`, { confirmName: typed, confirmCode: await freshCode() });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ erased: true, invitations: 1 });
    expect(res.body.auditEntries).toBeGreaterThan(0);

    // The live session ended and the old password no longer signs in.
    expect((await staff.get('/me')).status).toBe(401);
    expect((await new Client(t).post('/auth/staff/login', { email, password })).status).toBe(401);

    const user = await s.prisma.user.findUnique({ where: { id: userId } });
    expect(user).toMatchObject({ status: 'DELETED', email: null, fullName: null, passwordHash: null, mfaSecretEnc: null });
    expect(await s.prisma.userRole.count({ where: { userId } })).toBe(0);
    expect(await s.prisma.session.count({ where: { userId } })).toBe(0);
    expect(await s.prisma.staffInvitation.count({ where: { email } })).toBe(0);
    expect(await s.prisma.emailMessage.count({ where: { toAddress: email } })).toBe(0);

    // Nowhere in the audit trail: neither the address nor the name; the events themselves remain.
    expect(await auditMentions(email)).toBe(0);
    expect(await auditMentions(fullName)).toBe(0);
    const events = await s.prisma.auditLog.findMany({ where: { entityId: { in: [userId, inv.body.invitationId] } }, select: { action: true } });
    expect(events.map((e) => e.action)).toEqual(expect.arrayContaining(['staff.invited', 'staff.invitation.accepted', 'staff.trashed', 'staff.erased']));
    expect(await s.prisma.trashEntry.count({ where: { entityId: userId } })).toBe(0);

    // Not listed any more, cannot be edited, and the address can be invited again.
    const list = await owner.get<{ staff: Array<{ id: string }> }>('/admin/staff');
    expect(list.body.staff.some((x) => x.id === userId)).toBe(false);
    expect((await owner.patch(`/admin/staff/${userId}`, { suspended: true })).status).toBe(404);
    expect((await owner.post('/admin/staff/invitations', { email, fullName, roleIds: [await supportRoleId()] })).status).toBe(201);
  });

  it('erases an invitation with its e-mails; an accepted one is erased with the account instead', { timeout: 150_000 }, async () => {
    const email = `erase-invite.${run}@hedax.test`;
    const fullName = `دعوت حذف‌شدنی ${run}`;
    const inv = await owner.post<{ invitationId: string }>('/admin/staff/invitations', { email, fullName, roleIds: [await supportRoleId()] });
    expect(inv.status).toBe(201);
    expect((await owner.post(`/admin/staff/invitations/${inv.body.invitationId}/resend`, {})).status).toBe(200);
    expect(await s.prisma.emailMessage.count({ where: { invitationId: inv.body.invitationId } })).toBe(2);

    const res = await owner.post<{ erased: boolean }>(`/admin/staff/invitations/${inv.body.invitationId}/erase`, { confirmCode: await freshCode() });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await s.prisma.staffInvitation.count({ where: { email } })).toBe(0);
    expect(await s.prisma.emailMessage.count({ where: { toAddress: email } })).toBe(0);
    expect(await auditMentions(email)).toBe(0);
    expect(await auditMentions(fullName)).toBe(0);
    const list = await owner.get<{ invitations: Array<{ email: string }> }>('/admin/staff');
    expect(list.body.invitations.some((i) => i.email === email)).toBe(false);

    // A person who already has an account is erased from the staff table, not through the invitation.
    const staff = await inviteStaff(t, owner, 'support');
    const accepted = await s.prisma.staffInvitation.findFirst({ where: { email: staff.email } });
    const refused = await owner.post(`/admin/staff/invitations/${accepted!.id}/erase`, { confirmCode: '123456' });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('ERASE_ACCOUNT_INSTEAD');
  });

  it('refuses erasing oneself, and the audit log still refuses deletes and ordinary updates', async () => {
    const me = await owner.get<{ id: string }>('/me');
    const self = await owner.post(`/admin/staff/${me.body.id}/trash`, {});
    expect(self.status).toBe(403);
    expect(self.body.error.code).toBe('SELF_EDIT');
    // The owner row itself is never offered for the trash.
    const list = await owner.get<{ staff: Array<{ id: string; canTrash: boolean }> }>('/admin/staff');
    expect(list.body.staff.find((x) => x.id === me.body.id)?.canTrash).toBe(false);

    const row = await s.prisma.auditLog.findFirst({ select: { id: true } });
    await expect(s.prisma.$executeRaw`UPDATE audit_log SET after = '{}'::jsonb WHERE id = ${row!.id}::uuid`).rejects.toThrow(/append-only/);
    await expect(s.prisma.$executeRaw`DELETE FROM audit_log WHERE id = ${row!.id}::uuid`).rejects.toThrow(/append-only/);
    // Even inside an erasure transaction only the payloads may change, and rows can never be deleted.
    await expect(s.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('hedax.audit_redaction', 'on', true)`;
      await tx.$executeRaw`UPDATE audit_log SET action = 'forged' WHERE id = ${row!.id}::uuid`;
    })).rejects.toThrow(/append-only/);
    await expect(s.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('hedax.audit_redaction', 'on', true)`;
      await tx.$executeRaw`DELETE FROM audit_log WHERE id = ${row!.id}::uuid`;
    })).rejects.toThrow(/append-only/);
  });
});
