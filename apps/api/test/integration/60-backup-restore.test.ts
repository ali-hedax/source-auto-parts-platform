import EmbeddedPostgres from 'embedded-postgres';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type TestApp,
  Client,
  addAddress,
  addToCart,
  bootApp,
  checkout,
  createProduct,
  drainOutbox,
  idemKey,
  inviteStaff,
  loginCustomerAgain,
  loginCustomer,
  loginOwner,
  services,
  simplePdf,
  simulatorPay,
} from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A32 restore drill on a dedicated PostgreSQL instance (not the shared test DB):
 * create real data → clean shutdown → cold file-system backup of the database
 * directory and the private file store → destroy both → restore → verify that
 * orders, messages, files and permissions are usable again.
 * (The production procedure with pg_dump/pg_restore and off-site storage is
 * documented in docs/BACKUP_RESTORE.md; those tools are not available here.)
 */
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const work = path.join(apiRoot, '.local-pg', `restore-${process.pid}`);
const dataDir = path.join(work, 'data');
const storageDir = path.join(work, 'storage');
const backupDir = path.join(work, 'backup');
const PORT = Number(process.env.TEST_RESTORE_PG_PORT ?? 55434);
const PASSWORD = 'hedax-restore-test-only';
const pgOptions = {
  databaseDir: dataDir, user: 'hedax', password: PASSWORD, port: PORT, persistent: true, authMethod: 'scram-sha-256' as const,
  initdbFlags: ['--encoding=UTF8', process.platform === 'win32' ? '--locale=en-US' : '--locale=C.UTF-8'],
  postgresFlags: ['-c', 'listen_addresses=127.0.0.1', '-c', 'timezone=Asia/Tehran'],
  onLog: () => undefined, onError: () => undefined,
};
let pg: EmbeddedPostgres | null = null;
let t: TestApp | null = null;

beforeAll(async () => {
  rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  mkdirSync(work, { recursive: true });
  pg = new EmbeddedPostgres(pgOptions);
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('hedax_restore');
  // This file's own database, file store, owner and owner-session state.
  Object.assign(process.env, {
    DATABASE_URL: `postgresql://hedax:${PASSWORD}@127.0.0.1:${PORT}/hedax_restore?schema=public`,
    LOCAL_STORAGE_DIR: storageDir,
    HEDAX_TEST_WORKDIR: work,
    TEST_OWNER_EMAIL: 'owner@restore.test',
    TEST_OWNER_PASSWORD: randomBytes(18).toString('base64url'),
  });
  const run = (args: string[], extra: Record<string, string> = {}) => execFileSync(process.execPath, args, { cwd: apiRoot, env: { ...process.env, ...extra }, stdio: 'pipe' });
  run([path.join(apiRoot, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy']);
  run(['dist/cli/bootstrap-owner.js', '--email', 'owner@restore.test', '--name', 'Restore Owner'], { HEDAX_OWNER_PASSWORD: process.env.TEST_OWNER_PASSWORD as string });
  run(['dist/database/seed-dev.js']);
}, 300_000);

afterAll(async () => {
  await t?.close().catch(() => undefined);
  await pg?.stop().catch(() => undefined);
  rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
});

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

describe('A32 — restoring the database and file backup', () => {
  it('orders, messages, files and permissions are usable after restore', async () => {
    // 1) Real activity.
    t = await bootApp();
    const s = await services(t);
    const owner = await loginOwner(t);
    const p = await createProduct(owner, { sku: `A32-${Date.now().toString(36)}`, nameFa: 'قطعهٔ پشتیبان‌گیری', priceIrr: 4_000_000n, onHand: 3 });
    const customer = await loginCustomer(t);
    await addToCart(customer, p.id, 1);
    const order = await checkout(customer, await addAddress(customer));
    await simulatorPay(customer, order.body.redirectUrl, 'SUCCEEDED');
    const req = await customer.post('/sourcing-requests', { title: 'پشتیبان', items: [{ partName: 'سنسور', quantity: 1, vehicleBrandText: 'BAIC' }], clientRequestId: `cr-${idemKey()}` });
    const fileBytes = simplePdf('restore drill');
    const up = await customer.upload('/attachments', { purpose: 'MESSAGE' }, [{ name: 'drill.pdf', data: fileBytes }]);
    await customer.post(`/conversations/${req.body.conversationId}/messages`, { clientMessageId: `m-${idemKey()}`, body: 'پیام پیش از پشتیبان‌گیری', attachmentIds: [up.body[0].id] });
    await drainOutbox(s, ['attachment.scan']);
    const support = await inviteStaff(t, owner, 'support');
    await owner.put(`/admin/sourcing-requests/${req.body.id}/assignee`, { assigneeId: support.userId });
    const before = {
      order: (await customer.get(`/orders/${order.body.orderId}`)).body,
      counts: await s.prisma.$queryRaw<Array<Record<string, bigint>>>`SELECT (SELECT count(*) FROM "order") AS orders, (SELECT count(*) FROM "message") AS messages, (SELECT count(*) FROM "attachment") AS files, (SELECT count(*) FROM "user_role") AS grants, (SELECT count(*) FROM "audit_log") AS audit`,
    };
    expect(before.order.status).toBe('CONFIRMED');

    // 2) Clean shutdown and cold backup of database directory + private files.
    await t.close();
    t = null;
    await pg!.stop();
    cpSync(dataDir, path.join(backupDir, 'data'), { recursive: true });
    cpSync(storageDir, path.join(backupDir, 'storage'), { recursive: true });

    // 3) Disaster: both are gone.
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    rmSync(storageDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    expect(existsSync(dataDir) || existsSync(storageDir)).toBe(false);

    // 4) Restore and start again.
    cpSync(path.join(backupDir, 'data'), dataDir, { recursive: true });
    cpSync(path.join(backupDir, 'storage'), storageDir, { recursive: true });
    pg = new EmbeddedPostgres(pgOptions);
    await pg.start();
    t = await bootApp();
    const s2 = await services(t);

    // 5) Verify.
    const after = await s2.prisma.$queryRaw<Array<Record<string, bigint>>>`SELECT (SELECT count(*) FROM "order") AS orders, (SELECT count(*) FROM "message") AS messages, (SELECT count(*) FROM "attachment") AS files, (SELECT count(*) FROM "user_role") AS grants, (SELECT count(*) FROM "audit_log") AS audit`;
    expect(after).toEqual(before.counts);
    const again = await loginCustomerAgain(t, s2, customer.mobile);
    const restoredOrder = await again.get(`/orders/${order.body.orderId}`);
    expect(restoredOrder.body.status).toBe('CONFIRMED');
    expect(restoredOrder.body.totals).toEqual(before.order.totals);
    expect(restoredOrder.body.receipts).toEqual(before.order.receipts);
    const history = await again.get(`/conversations/${req.body.conversationId}/messages`);
    expect(history.body.items.map((m: any) => m.body)).toContain('پیام پیش از پشتیبان‌گیری');
    const download = await again.raw('GET', `/attachments/${up.body[0].id}/download`);
    expect(download.status).toBe(200);
    expect(sha(Buffer.from(await download.arrayBuffer()))).toBe(sha(fileBytes));
    // Permissions survive: the assigned agent can read, a stranger cannot, the agent still cannot change prices.
    const agent = new Client(t);
    expect((await agent.post('/auth/staff/login', { email: support.email, password: support.password })).body.status).toBe('SIGNED_IN');
    expect((await agent.get(`/conversations/${req.body.conversationId}`)).status).toBe(200);
    expect((await agent.post(`/admin/products/${p.id}/price-rules`, { customerGroupId: null, minQty: 1, maxQty: null, basePrice: { currency: 'IRR', amountMinor: '1' } })).status).toBe(403);
    const stranger = await loginCustomer(t);
    expect((await stranger.raw('GET', `/attachments/${up.body[0].id}/download`)).status).toBe(404);
    // The owner's TOTP secret is still decryptable with the same APP_ENCRYPTION_KEY (keys are backed up separately).
    expect((await (await loginOwner(t)).get('/me')).body.mfaEnabled).toBe(true);
    // Append-only protections came back with the data.
    await expect(s2.prisma.$executeRaw`DELETE FROM "audit_log"`).rejects.toThrow();
  });
});
