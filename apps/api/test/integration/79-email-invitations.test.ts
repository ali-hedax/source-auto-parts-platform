import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Services, type TestApp, bootApp, inviteStaff, loginOwner, services } from './helpers.js';

/**
 * Staff invitations by e-mail: the invite queues an e-mail that the worker hands to the mail
 * server (here the in-memory test transport). SENT means "accepted by the SMTP server".
 * Covers delivery, duplicate jobs, transient and permanent SMTP failures, resend (old link dies),
 * revoke, expiry, single use, duplicates and who may invite.
 */
let t: TestApp;
let s: Services;
let owner: Client;
const run = Date.now().toString(36);
let roles: Array<{ id: string; key: string; nameFa: string }>;

const roleId = (key: string) => roles.find((r) => r.key === key)!.id;
const tokenOf = (url: string) => new URL(url).searchParams.get('token') as string;
const emailRows = (invitationId: string) => s.prisma.emailMessage.findMany({ where: { invitationId }, orderBy: { createdAt: 'asc' } });
const listed = async (email: string) => ((await owner.get<{ invitations: Array<{ email: string; status: string; sentAt: string | null; lastError: string | null }> }>('/admin/staff')).body.invitations).find((i) => i.email === email)!;

async function invite(email: string, roleKey = 'support') {
  const res = await owner.post<{ invitationId: string; acceptUrl: string; emailQueued: boolean }>('/admin/staff/invitations', { email, fullName: 'کارمند آزمایشی', roleIds: [roleId(roleKey)] });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

const accept = (token: string) => new Client(t).post('/auth/invitations/accept', { token, fullName: 'کارمند آزمایشی', password: `Gq-${Math.random().toString(36).slice(2)}-Vt!4w` });

beforeAll(async () => {
  t = await bootApp();
  s = await services(t);
  owner = await loginOwner(t);
  roles = (await owner.get<Array<{ id: string; key: string; nameFa: string }>>('/admin/roles')).body;
});

afterAll(async () => {
  await t?.close();
});

describe('invitation e-mail', () => {
  it('is queued with the invitation, sent once by the worker, and its link works exactly once', async () => {
    const email = `inv-ok.${run}@hedax.test`;
    const inv = await invite(email);
    expect(inv.emailQueued).toBe(true);
    const [row] = await emailRows(inv.invitationId);
    expect(row).toMatchObject({ status: 'QUEUED', kind: 'STAFF_INVITATION', toAddress: email });
    // The token is never stored in clear: only encrypted until the message is final.
    expect(JSON.stringify({ ...row, secretEnc: undefined })).not.toContain(tokenOf(inv.acceptUrl));
    expect(row.secretEnc).toBeTruthy();
    expect((await listed(email)).status).toBe('PENDING');

    const before = s.mailTransport.sent.length;
    expect(await s.runAsWorker(() => s.mail.deliver(row.id))).toBe('SENT');
    // A repeated job (crash, duplicate dispatch) does not send it again.
    expect(await s.runAsWorker(() => s.mail.deliver(row.id))).toBe('SKIPPED');
    expect(s.mailTransport.sent.length).toBe(before + 1);
    const mail = s.mailTransport.sent.at(-1);
    expect(mail.to).toBe(email);
    expect(mail.subject).toContain('Source by HEDAX');
    for (const body of [mail.html, mail.text]) {
      expect(body).toContain(inv.acceptUrl.replace(/&/g, '&amp;'));
      expect(body).toContain('/fa/staff/login');
      expect(body).toContain(roles.find((r) => r.key === 'support')!.nameFa);
    }
    expect(mail.html).toContain('dir="rtl"');
    const sentRow = (await emailRows(inv.invitationId))[0];
    expect(sentRow).toMatchObject({ status: 'SENT', secretEnc: null });
    expect(sentRow.smtpResponse).toMatch(/^250/);
    const view = await listed(email);
    expect(view.status).toBe('SENT');
    expect(view.sentAt).toBeTruthy();

    // The link from the e-mail creates the account once; a second click is told to sign in.
    const token = new URL(/https?:\/\/\S+token=[A-Za-z0-9_-]+/.exec(mail.text)![0]).searchParams.get('token') as string;
    const accepted = await accept(token);
    expect(accepted.status).toBe(200);
    // The sign-in page is pre-filled with the invited address.
    expect(accepted.body).toMatchObject({ email });
    const again = await accept(token);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVITATION_ALREADY_ACCEPTED');
    expect((await listed(email)).status).toBe('ACCEPTED');
  });

  it('retries a temporary SMTP failure, stops on a permanent one, and never shows a failure as sent', async () => {
    const tempEmail = `inv-temp.${run}@hedax.test`;
    const temp = await invite(tempEmail);
    const [tempRow] = await emailRows(temp.invitationId);
    s.mailTransport.failNext(new s.MailSendError('TRANSIENT', 'SMTP_TEMPORARY ECONNECTION'));
    await expect(s.runAsWorker(() => s.mail.deliver(tempRow.id))).rejects.toThrow(/EMAIL_RETRY/);
    expect((await emailRows(temp.invitationId))[0]).toMatchObject({ status: 'QUEUED', attempts: 1, lastError: 'SMTP_TEMPORARY ECONNECTION' });
    expect((await listed(tempEmail)).status).toBe('PENDING');
    expect(await s.runAsWorker(() => s.mail.deliver(tempRow.id))).toBe('SENT');

    const permEmail = `inv-perm.${run}@hedax.test`;
    const perm = await invite(permEmail);
    const [permRow] = await emailRows(perm.invitationId);
    s.mailTransport.failNext(new s.MailSendError('PERMANENT', 'SMTP_REJECTED EENVELOPE 550'));
    expect(await s.runAsWorker(() => s.mail.deliver(permRow.id))).toBe('FAILED');
    expect((await emailRows(perm.invitationId))[0]).toMatchObject({ status: 'FAILED', attempts: 1, secretEnc: null });
    expect(await listed(permEmail)).toMatchObject({ status: 'FAILED', sentAt: null, lastError: 'SMTP_REJECTED EENVELOPE 550' });

    // Temporary failures are retried a limited number of times, then the message is FAILED.
    const capEmail = `inv-cap.${run}@hedax.test`;
    const cap = await invite(capEmail);
    const [capRow] = await emailRows(cap.invitationId);
    s.mailTransport.failNext(...Array.from({ length: 5 }, () => new s.MailSendError('TRANSIENT', 'SMTP_TEMPORARY ETIMEDOUT')));
    for (let i = 1; i < 5; i += 1) await expect(s.runAsWorker(() => s.mail.deliver(capRow.id))).rejects.toThrow(/EMAIL_RETRY/);
    expect(await s.runAsWorker(() => s.mail.deliver(capRow.id))).toBe('FAILED');
    expect((await emailRows(cap.invitationId))[0]).toMatchObject({ status: 'FAILED', attempts: 5 });
    expect((await listed(capEmail)).status).toBe('FAILED');
  });

  it('resend replaces the link; revoke and expiry stop the invitation and its pending e-mail', async () => {
    const reEmail = `inv-resend.${run}@hedax.test`;
    const first = await invite(reEmail);
    const [firstRow] = await emailRows(first.invitationId);
    expect(await s.runAsWorker(() => s.mail.deliver(firstRow.id))).toBe('SENT');
    const resent = await owner.post<{ acceptUrl: string; emailQueued: boolean }>(`/admin/staff/invitations/${first.invitationId}/resend`, {});
    expect(resent.status, JSON.stringify(resent.body)).toBe(200);
    expect(tokenOf(resent.body.acceptUrl)).not.toBe(tokenOf(first.acceptUrl));
    const oldTry = await accept(tokenOf(first.acceptUrl));
    expect(oldTry.status).toBe(400);
    expect(oldTry.body.error.code).toBe('INVITATION_INVALID');
    const rows = await emailRows(first.invitationId);
    expect(await s.runAsWorker(() => s.mail.deliver(rows.at(-1)!.id))).toBe('SENT');
    expect(s.mailTransport.sent.at(-1).text).toContain(tokenOf(resent.body.acceptUrl));
    expect((await accept(tokenOf(resent.body.acceptUrl))).status).toBe(200);

    const revEmail = `inv-revoke.${run}@hedax.test`;
    const rev = await invite(revEmail);
    expect((await owner.post(`/admin/staff/invitations/${rev.invitationId}/revoke`, {})).status).toBe(200);
    const [revRow] = await emailRows(rev.invitationId);
    expect(revRow.status).toBe('CANCELLED');
    expect(await s.runAsWorker(() => s.mail.deliver(revRow.id))).toBe('SKIPPED');
    const revTry = await accept(tokenOf(rev.acceptUrl));
    expect(revTry.body.error.code).toBe('INVITATION_REVOKED');
    expect((await listed(revEmail)).status).toBe('REVOKED');

    const expEmail = `inv-expired.${run}@hedax.test`;
    const exp = await invite(expEmail);
    await s.prisma.staffInvitation.update({ where: { id: exp.invitationId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const [expRow] = await emailRows(exp.invitationId);
    expect(await s.runAsWorker(() => s.mail.deliver(expRow.id))).toBe('CANCELLED');
    const expTry = await accept(tokenOf(exp.acceptUrl));
    expect(expTry.body.error.code).toBe('INVITATION_EXPIRED');
    expect((await listed(expEmail)).status).toBe('EXPIRED');
  });

  it('refuses duplicates and existing accounts, and only users.manage can invite, resend or revoke', async () => {
    const dupEmail = `inv-dup.${run}@hedax.test`;
    const dup = await invite(dupEmail);
    const second = await owner.post('/admin/staff/invitations', { email: dupEmail.toUpperCase(), fullName: 'تکراری', roleIds: [roleId('support')] });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('INVITATION_PENDING');

    const support = await inviteStaff(t, owner, 'support');
    const existing = await owner.post('/admin/staff/invitations', { email: support.email, fullName: 'حساب موجود', roleIds: [roleId('support')] });
    expect(existing.body.error.code).toBe('EMAIL_IN_USE');

    for (const [path, body] of [
      ['/admin/staff/invitations', { email: `x.${run}@hedax.test`, fullName: 'بدون مجوز', roleIds: [roleId('support')] }],
      [`/admin/staff/invitations/${dup.invitationId}/resend`, {}],
      [`/admin/staff/invitations/${dup.invitationId}/revoke`, {}],
      ['/admin/mail/test', {}],
    ] as const) {
      const res = await support.post(path, body);
      expect(res.status, path).toBe(403);
    }
    // The support staff member got only the support role, not the panel's admin rights.
    expect((await support.get('/admin/staff')).status).toBe(403);
  });

  it('sends the panel test message only to the company address and reports the SMTP acceptance', async () => {
    const res = await owner.post<{ id: string; to: string }>('/admin/mail/test', {});
    expect(res.status, JSON.stringify(res.body)).toBe(202);
    expect(res.body.to).toBe('info@hedax.test');
    expect(await s.runAsWorker(() => s.mail.deliver(res.body.id))).toBe('SENT');
    const status = await owner.get<{ configured: boolean; lastTest: { status: string; smtpResponse: string } }>('/admin/mail/status');
    expect(status.body.configured).toBe(true);
    expect(status.body.lastTest).toMatchObject({ status: 'SENT' });
    expect(status.body.lastTest.smtpResponse).toMatch(/^250/);
  });
});
