import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TestApp, Client, bootApp, loginCustomer, loginOwner, services } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

let t: TestApp;

beforeAll(async () => {
  t = await bootApp();
});
afterAll(async () => {
  await t?.close();
});

describe('platform on real PostgreSQL', () => {
  it('readiness reports the database up, Redis down (not installed) and a Unicode-aware search locale', async () => {
    const res = await fetch(`${t.origin}/health/ready`);
    const body = (await res.json()) as any;
    expect(body.checks.database).toBe('up');
    expect(body.checks.redis).toBe('down');
    expect(body.checks.searchLocale).toBe('ok');
    expect(res.status).toBe(503); // not ready without Redis — reported honestly
    expect(JSON.stringify(body)).not.toMatch(/postgresql:\/\/|hedax-test-only/);
  });

  it('schema has the database-level protections the migrations promise', async () => {
    const s = await services(t);
    const triggers = await s.prisma.$queryRaw<Array<{ tgname: string }>>`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname`;
    expect(triggers.length).toBeGreaterThanOrEqual(7);
    const checks = await s.prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*)::bigint AS n FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace`;
    expect(Number(checks[0]?.n)).toBeGreaterThanOrEqual(50);
    // Ledger tables are append-only: UPDATE/DELETE are refused by the database itself.
    await expect(s.prisma.$executeRaw`UPDATE "inventory_movement" SET "note" = 'x'`).rejects.toThrow();
    await expect(s.prisma.$executeRaw`DELETE FROM "audit_log"`).rejects.toThrow();
  });

  it('timestamps are correct even when the database server runs in a non-UTC zone', async () => {
    const s = await services(t);
    // The throwaway server runs in Asia/Tehran (global-setup); a plain connection sees that zone…
    const { PrismaClient } = await import('../../dist/generated/prisma/client.js');
    const plain = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL as string }) });
    const [server] = await plain.$queryRaw<Array<{ tz: string }>>`SELECT current_setting('TimeZone') AS tz`;
    await plain.$disconnect();
    expect(server?.tz).toBe('Asia/Tehran');
    // …while application sessions are pinned to UTC, so parameters and now() agree.
    const [session] = await s.prisma.$queryRaw<Array<{ tz: string }>>`SELECT current_setting('TimeZone') AS tz`;
    expect(session?.tz).toBe('UTC');
    const now = new Date();
    const [drift] = await s.prisma.$queryRaw<Array<{ seconds: number }>>`SELECT abs(extract(epoch from (${now}::timestamptz - now())))::float8 AS seconds`;
    expect(drift?.seconds).toBeLessThan(5);
    const [db] = await s.prisma.$queryRaw<Array<{ n: Date }>>`SELECT now() AS n`;
    expect(Math.abs((db?.n as Date).getTime() - Date.now())).toBeLessThan(5_000);
  });

  it('owner signs in with password + TOTP; customers sign in with OTP', async () => {
    const owner = await loginOwner(t);
    const me = await owner.get('/me');
    expect(me.status).toBe(200);
    expect(me.body.kind).toBe('STAFF');
    expect(me.body.mfaEnabled).toBe(true);
    expect(me.body.permissions).toContain('roles.manage');

    const customer = await loginCustomer(t);
    const cme = await customer.get('/me');
    expect(cme.body.kind).toBe('CUSTOMER');
    expect(cme.body.mobileMasked).not.toContain(customer.mobile.slice(4, 8)); // masked
  });

  it('refuses state-changing requests without a valid CSRF token or from a foreign origin', async () => {
    const customer = await loginCustomer(t);
    const noToken = await customer.req('POST', '/account/addresses', { recipientName: 'x' }, {}, false);
    expect(noToken.status).toBe(403);
    expect(noToken.body.error.code).toBe('CSRF_TOKEN');
    const foreign = await customer.post('/account/addresses', { recipientName: 'x' }, { origin: 'https://evil.example' });
    expect(foreign.status).toBe(403);
    expect(foreign.body.error.code).toBe('CSRF_ORIGIN');
    // An anonymous CSRF token is bound to "anonymous" and does not work for a signed-in session.
    const anon = new Client(t);
    await anon.get('/auth/csrf');
    const stolen = await customer.req('POST', '/account/addresses', {}, { 'x-csrf-token': anon.cookies.get('hedax_csrf') as string }, false);
    expect(stolen.status).toBe(403);
  });

  it('uniform error contract without internals', async () => {
    const anon = new Client(t);
    const res = await anon.get('/orders');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({ code: expect.any(String), message: expect.any(String), requestId: expect.any(String) });
    const bad = await anon.post('/auth/otp/request', { mobile: '12' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
  });
});
