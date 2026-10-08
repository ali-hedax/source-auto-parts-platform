import { generate as totp } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Services, type Staff, type TestApp, bootApp, inviteStaff, loginOwner, services } from './helpers.js';

/**
 * Staff "my account": a signed-in staff member changes their own name, e-mail and
 * password. E-mail and password need the current password and a fresh authenticator
 * code; both end every session. MFA and roles stay as they are.
 */
let t: TestApp;
let s: Services;
let staff: Staff;
const persian = (code: string) => code.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] as string);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastCode = '';

/** A current code that was not used yet (codes are single-use per 30 s step). */
async function freshCode(): Promise<string> {
  let code = await totp({ secret: staff.totpSecret as string });
  if (code === lastCode) {
    await sleep(31_000);
    code = await totp({ secret: staff.totpSecret as string });
  }
  lastCode = code;
  return code;
}

async function signIn(email: string, password: string): Promise<Client> {
  const c = new Client(t);
  const login = await c.post<{ status: string; challengeId: string }>('/auth/staff/login', { email, password });
  expect(login.status, JSON.stringify(login.body)).toBe(200);
  expect(login.body.status).toBe('MFA_REQUIRED');
  const mfa = await c.post('/auth/staff/mfa', { challengeId: login.body.challengeId, code: await freshCode() });
  expect(mfa.status, JSON.stringify(mfa.body)).toBe(200);
  return c;
}

const copySession = (from: Client) => {
  const c = new Client(t);
  for (const [k, v] of from.cookies) c.cookies.set(k, v);
  return c;
};

beforeAll(async () => {
  t = await bootApp();
  s = await services(t);
  const owner = await loginOwner(t);
  staff = await inviteStaff(t, owner, 'finance'); // finance requires MFA
});

afterAll(async () => {
  await t?.close();
});

describe('my account', () => {
  it('changes the own name with a valid session', async () => {
    const res = await staff.patch('/me/name', { fullName: 'نام تازهٔ کارمند' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await staff.get<{ displayName: string }>('/me')).body.displayName).toBe('نام تازهٔ کارمند');
  });

  it('changes the e-mail only with the current password and a fresh code, then ends every session', async () => {
    const newEmail = `renamed.${Date.now().toString(36)}@hedax.test`;
    const wrongPassword = await staff.post('/me/email', { email: newEmail, currentPassword: 'not-the-password', code: await totp({ secret: staff.totpSecret as string }) });
    expect(wrongPassword.status).toBe(400);
    expect(wrongPassword.body.error.code).toBe('CURRENT_PASSWORD_INVALID');

    const noCode = await staff.post('/me/email', { email: newEmail, currentPassword: staff.password });
    expect(noCode.status).toBe(403);
    expect(noCode.body.error.code).toBe('MFA_CONFIRMATION_REQUIRED');

    const taken = await staff.post('/me/email', { email: (await inviteStaff(t, await loginOwner(t), 'support')).email, currentPassword: staff.password, code: '000000' });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('EMAIL_IN_USE');

    const oldSession = copySession(staff);
    const ok = await staff.post('/me/email', { email: newEmail, currentPassword: staff.password, code: persian(await freshCode()) });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect((await oldSession.get('/me')).status).toBe(401);

    const oldLogin = await new Client(t).post('/auth/staff/login', { email: staff.email, password: staff.password });
    expect(oldLogin.status).toBe(401);
    staff.email = newEmail;
  }, 120_000);

  it('changes the password with a strong new one and a fresh code; MFA stays on and nothing secret is audited', async () => {
    const c = await signIn(staff.email, staff.password);
    const weak = await c.post('/me/password', { currentPassword: staff.password, newPassword: 'short', code: '000000' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('WEAK_PASSWORD');

    const newPassword = `Nv-${Math.random().toString(36).slice(2)}-Qz!7m`;
    const ok = await c.post('/me/password', { currentPassword: staff.password, newPassword, code: await freshCode() });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect((await c.get('/me')).status).toBe(401);

    expect((await new Client(t).post('/auth/staff/login', { email: staff.email, password: staff.password })).status).toBe(401);
    const again = await signIn(staff.email, newPassword); // still asks for the authenticator code
    expect((await again.get<{ mfaEnabled: boolean }>('/me')).body.mfaEnabled).toBe(true);

    const audit = await s.prisma.auditLog.findMany({ where: { entityId: staff.userId, action: { startsWith: 'account.' } } });
    expect(audit.map((a) => a.action).sort()).toEqual(['account.email.changed', 'account.name.changed', 'account.password.changed']);
    const text = JSON.stringify(audit);
    expect(text).not.toContain(newPassword);
    expect(text).not.toContain(staff.password);
  }, 180_000);
});
