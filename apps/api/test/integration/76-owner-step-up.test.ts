import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, type TestApp, bootApp, inviteStaff, loginOwner, ownerTotp } from './helpers.js';

/**
 * Spec §13: a new owner (and thus an ownership hand-over) is a separate act,
 * confirmed with a fresh second factor of the acting owner — a valid session
 * alone is not enough.
 */
let t: TestApp;
let owner: Client;
const run = Date.now().toString(36);

beforeAll(async () => {
  t = await bootApp();
  owner = await loginOwner(t);
});

afterAll(async () => {
  await t?.close();
});

describe('owner role grants', () => {
  it('need a current authenticator code of the acting owner; missing, wrong and reused codes are refused', async () => {
    const ownerRole = (await owner.get<Array<{ id: string; isOwner: boolean }>>('/admin/roles')).body.find((r) => r.isOwner);
    expect(ownerRole).toBeTruthy();
    const invite = (email: string, confirmCode?: string) =>
      owner.post('/admin/staff/invitations', { email, fullName: 'مالک آزمایشی دوم', roleIds: [ownerRole!.id], ...(confirmCode ? { confirmCode } : {}) });

    const missing = await invite(`co-owner.${run}@hedax.test`);
    expect(missing.status).toBe(403);
    expect(missing.body.error.code).toBe('MFA_CONFIRMATION_REQUIRED');

    const code = await ownerTotp();
    const wrong = await invite(`co-owner.${run}@hedax.test`, code === '000000' ? '111111' : '000000');
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('MFA_CODE_INVALID');

    const ok = await invite(`co-owner.${run}@hedax.test`, code);
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    // The same code cannot confirm a second grant (replay protection).
    const replay = await invite(`co-owner-2.${run}@hedax.test`, code);
    expect(replay.status).toBe(400);
    expect(replay.body.error.code).toBe('MFA_CODE_INVALID');

    // Promoting an existing staff member to owner needs the same confirmation.
    const staff = await inviteStaff(t, owner, 'support');
    const promote = (confirmCode?: string) => owner.patch(`/admin/staff/${staff.userId}`, { roleIds: [ownerRole!.id], ...(confirmCode ? { confirmCode } : {}) });
    const unconfirmed = await promote();
    expect(unconfirmed.status).toBe(403);
    expect(unconfirmed.body.error.code).toBe('MFA_CONFIRMATION_REQUIRED');
    const confirmed = await promote(await ownerTotp(code));
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
  });
});
