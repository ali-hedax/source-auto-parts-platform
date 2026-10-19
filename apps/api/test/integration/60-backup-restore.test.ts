import EmbeddedPostgres from 'embedded-postgres';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
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
const testRoot = path.join(apiRoot, '.local-pg');
mkdirSync(testRoot, { recursive: true });
const work = mkdtempSync(path.join(testRoot, `restore-${process.pid}-`));
const dataDir = path.join(work, 'data');
const storageDir = path.join(work, 'storage');
const backupDir = path.join(work, 'backup');
const PORT = Number(process.env.TEST_RESTORE_PG_PORT ?? 55434);
const PASSWORD = 'hedax-restore-test-only';
const postgresLog: string[] = [];
const stage = (name: string) => console.info(`[restore drill] ${name}`);
const directoryMode = (dir: string) => (statSync(dir).mode & 0o777).toString(8);
const pgOptions = {
  databaseDir: dataDir, user: 'hedax', password: PASSWORD, port: PORT, persistent: true, authMethod: 'scram-sha-256' as const,
  initdbFlags: ['--encoding=UTF8', process.platform === 'win32' ? '--locale=en-US' : '--locale=C.UTF-8'],
  // io_method=sync: no I/O worker processes. On Windows an orphaned PostgreSQL 18 io_worker kept
  // the port after stop, so the restart on the restored data failed (seen 2026-10-05).
  postgresFlags: ['-c', 'listen_addresses=127.0.0.1', '-c', 'timezone=Asia/Tehran', '-c', 'io_method=sync'],
  onLog: (message: string) => {
    postgresLog.push(message.trim());
    if (postgresLog.length > 20) postgresLog.shift();
  },
  onError: () => undefined,
};
let pg: EmbeddedPostgres | null = null;
let t: TestApp | null = null;
let failedToStart = false;

function assertOwnedPath(target: string) {
  const relative = path.relative(work, path.resolve(target));
  if (path.dirname(work) !== testRoot || !path.basename(work).startsWith(`restore-${process.pid}-`) ||
      relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Refusing to copy or remove files outside this restore drill');
  }
}

/** Node's recursive copy created a 0755 root on Linux, which PostgreSQL refuses. */
function copyTree(source: string, destination: string) {
  assertOwnedPath(source);
  assertOwnedPath(destination);
  const mode = statSync(source).mode & 0o777;
  // Create the root with its source permissions before copying any private data.
  mkdirSync(destination, { recursive: true, mode });
  cpSync(source, destination, { recursive: true });
  if (process.platform !== 'win32') {
    chmodSync(destination, mode);
    expect(directoryMode(destination)).toBe(mode.toString(8));
  }
}

function removeOwned(target: string) {
  assertOwnedPath(target);
  rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}

async function startPostgres(phase: string) {
  stage(`${phase}: PostgreSQL startup; directory mode ${directoryMode(dataDir)}`);
  postgresLog.length = 0;
  failedToStart = false;
  try { await pg!.start(); }
  catch {
    // embedded-postgres rejects with undefined when the child exits before readiness.
    // Its stop() waits for a new exit event even when that child already exited.
    failedToStart = true;
    // This cluster contains synthetic test data only; never log its connection/password.
    throw new Error(`${phase}: PostgreSQL failed before readiness\n${postgresLog.join('\n')}`);
  }
  stage(`${phase}: PostgreSQL ready`);
}

beforeAll(async () => {
  pg = new EmbeddedPostgres(pgOptions);
  await pg.initialise();
  await startPostgres('initial');
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
  stage('cleanup: close application');
  try { await t?.close(); }
  finally {
    stage('cleanup: stop PostgreSQL');
    // start() rejected only after child exit (or before spawn); preserve that error,
    // rather than waiting 180 seconds for an event that has already happened.
    if (!failedToStart) await pg?.stop();
    stage('cleanup: remove owned test files');
    removeOwned(work);
  }
});

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

describe('A32 — restoring the database and file backup', () => {
  it('orders, messages, files and permissions are usable after restore', async () => {
    // 1) Real activity.
    stage('create synthetic activity');
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
    stage('cold backup: close application');
    await t.close();
    t = null;
    stage('cold backup: stop PostgreSQL');
    await pg!.stop();
    pg = null;
    stage('cold backup: copy database and private files');
    copyTree(dataDir, path.join(backupDir, 'data'));
    copyTree(storageDir, path.join(backupDir, 'storage'));
    stage(`cold backup: directory mode ${directoryMode(path.join(backupDir, 'data'))}`);

    // 3) Disaster: both are gone.
    removeOwned(dataDir);
    removeOwned(storageDir);
    expect(existsSync(dataDir) || existsSync(storageDir)).toBe(false);

    // 4) Restore and start again.
    copyTree(path.join(backupDir, 'data'), dataDir);
    copyTree(path.join(backupDir, 'storage'), storageDir);
    pg = new EmbeddedPostgres(pgOptions);
    await startPostgres('restored');
    t = await bootApp();
    const s2 = await services(t);

    // 5) Verify.
    stage('verify restored activity, permissions and files');
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
