import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { generate as totp } from 'otplib';
import sharp from 'sharp';
import { io, type Socket } from 'socket.io-client';

/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed HTTP test client */

/** Appends a line to the diagnostic trace (OS temp file) when tracing is enabled. */
export function trace(message: string): void {
  const file = process.env.HEDAX_TEST_TRACE;
  if (file) appendFileSync(file, `${new Date().toISOString()} pid=${process.pid} ${message}\n`);
}

export interface TestApp {
  app: INestApplication;
  origin: string;
  base: string;
  get<T>(token: unknown): T;
  close(): Promise<void>;
}

let pgPatched = false;
/**
 * Diagnostics only (when HEDAX_TEST_TRACE is set): times every pg query and pool
 * checkout in this process and traces the slow ones, so an intermittent stall
 * can be attributed to a query, a pool wait or the HTTP connection.
 */
function patchPgForTracing(): void {
  if (pgPatched || !process.env.HEDAX_TEST_TRACE) return;
  pgPatched = true;
  const local = createRequire(import.meta.url);
  const pg = createRequire(local.resolve('@prisma/adapter-pg'))('pg');
  const query = pg.Client.prototype.query;
  pg.Client.prototype.query = function patchedQuery(this: any, config: any, values?: any, callback?: any) {
    const started = Date.now();
    const busy = !!this.activeQuery || (this.queryQueue?.length ?? 0) > 0;
    const text = String(typeof config === 'string' ? config : (config?.text ?? '')).replace(/\s+/g, ' ').slice(0, 140);
    const result = query.call(this, config, values, callback);
    const done = (outcome: string) => {
      const ms = Date.now() - started;
      if (ms > 3_000) trace(`pg slow ${outcome} ${ms}ms busyAtSend=${busy} ${text}`);
    };
    if (result && typeof result.then === 'function') result.then(() => done('ok'), () => done('error'));
    return result;
  };
  const connect = pg.Pool.prototype.connect;
  pg.Pool.prototype.connect = function patchedConnect(this: any, cb?: any) {
    const started = Date.now();
    const result = connect.call(this, cb);
    if (result && typeof result.then === 'function') {
      result.then(() => {
        const ms = Date.now() - started;
        if (ms > 3_000) trace(`pg pool wait ${ms}ms total=${this.totalCount} idle=${this.idleCount} waiting=${this.waitingCount}`);
      }, () => undefined);
    }
    return result;
  };
}

/** Boots the compiled API (dist/) in-process on a random port with the same HTTP pipeline as main.ts. */
export async function bootApp(): Promise<TestApp> {
  const [{ AppModule }, { configureApp }, { loadEnv }] = await Promise.all([
    import('../../dist/app.module.js'),
    import('../../dist/app.setup.js'),
    import('../../dist/config/env.js'),
  ]);
  // abortOnError=false: a failing lookup throws in the test instead of exiting the process.
  trace('bootApp: create');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false, abortOnError: false });
  patchPgForTracing();
  if (process.env.HEDAX_TEST_TRACE) {
    // Server-side duration of slow requests (vs the client-side duration traced in Client.send).
    app.use((req: any, res: any, next: () => void) => {
      const started = Date.now();
      res.on('finish', () => {
        const ms = Date.now() - started;
        if (ms > 3_000) trace(`server slow ${req.method} ${req.originalUrl} ${ms}ms status=${res.statusCode}`);
      });
      next();
    });
  }
  configureApp(app, loadEnv());
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  const origin = `http://127.0.0.1:${port}`;
  trace(`bootApp: listening ${origin}`);
  return {
    app,
    origin,
    base: `${origin}/api/v1`,
    get: <T>(token: unknown) => app.get(token as never) as T,
    close: async () => {
      trace('close: start');
      await app.close();
      trace('close: done');
    },
  };
}

/** Services resolved from the running app (same instances the HTTP layer uses). */
export async function services(t: TestApp) {
  const [prisma, attachments, imports, payments, settlement, quotes, ctx, scanner] = await Promise.all([
    import('../../dist/common/prisma.service.js'),
    import('../../dist/modules/attachments/attachments.service.js'),
    import('../../dist/modules/imports/imports.service.js'),
    import('../../dist/modules/payments/payments.service.js'),
    import('../../dist/modules/orders/stock-order-settlement.js'),
    import('../../dist/modules/sourcing/quotes.service.js'),
    import('../../dist/common/request-context.js'),
    import('../../dist/common/storage/scanner.js'),
  ]);
  return {
    prisma: t.get<any>(prisma.PrismaService),
    attachments: t.get<any>(attachments.AttachmentsService),
    imports: t.get<any>(imports.ImportsService),
    payments: t.get<any>(payments.PaymentsService),
    settlement: t.get<any>(settlement.StockOrderSettlement),
    quotes: t.get<any>(quotes.QuotesService),
    scanner: t.get<any>(scanner.SCANNER),
    runAsWorker: <T>(fn: () => Promise<T>) => ctx.runWithContext({ requestId: `test-worker-${Date.now().toString(36)}`, ipHash: null, actor: null }, fn),
  };
}

export type Services = Awaited<ReturnType<typeof services>>;

/**
 * Runs pending outbox events of the given types through the same service
 * methods the worker's handlers call (BullMQ transport itself is not used:
 * Redis is not available in this environment).
 */
export async function drainOutbox(s: Services, types: string[], aggregateId?: string): Promise<number> {
  const rows = await s.prisma.outboxEvent.findMany({
    where: { status: 'PENDING', type: { in: types }, ...(aggregateId ? { aggregateId } : {}) },
    orderBy: { createdAt: 'asc' },
  });
  for (const row of rows) {
    const p = row.payload as Record<string, string>;
    await s.runAsWorker(async () => {
      if (row.type === 'attachment.scan') await s.attachments.scan(p.attachmentId);
      else if (row.type === 'import.parse') await s.imports.parse(p.jobId);
      else if (row.type === 'import.commit') await s.imports.commit(p.jobId);
      else if (row.type === 'payment.reconcile') await s.payments.verify(p.attemptId, 'INQUIRY');
      else throw new Error(`drainOutbox: no handler for ${row.type}`);
    });
    await s.prisma.outboxEvent.update({ where: { id: row.id }, data: { status: 'DONE', processedAt: new Date(), attempts: { increment: 1 } } });
  }
  return rows.length;
}

export interface Res<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

const usedMobiles = new Set<string>();
/** Fresh valid Iranian mobile per call, so every test customer is a new account. */
export function uniqueMobile(): string {
  for (;;) {
    const mobile = `0935${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
    if (!usedMobiles.has(mobile)) {
      usedMobiles.add(mobile);
      return mobile;
    }
  }
}

export function idemKey(): string {
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Minimal browser-like client: cookie jar + double-submit CSRF token on every mutation. */
export class Client {
  readonly cookies = new Map<string, string>();

  constructor(private readonly t: TestApp) {}

  get base(): string {
    return this.t.base;
  }

  get origin(): string {
    return this.t.origin;
  }

  cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private absorb(res: Response): void {
    for (const raw of res.headers.getSetCookie()) {
      const [pair = ''] = raw.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = decodeURIComponent(pair.slice(eq + 1).trim());
      if (!value || /expires=Thu, 01 Jan 1970/i.test(raw)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async raw(
    method: string,
    pathOrUrl: string,
    init: { body?: unknown; form?: FormData; headers?: Record<string, string>; csrf?: boolean; retried?: boolean } = {},
  ): Promise<Response> {
    const res = await this.send(method, pathOrUrl, init);
    // Same as the web client (apps/web/src/lib/api/client.ts): a stale CSRF token is refreshed once.
    if (method !== 'GET' && init.csrf !== false && !init.retried && res.status === 403) {
      const code = await res.clone().json().then((b: any) => b?.error?.code as string | undefined, () => undefined);
      if (code === 'CSRF_TOKEN') {
        await this.send('GET', '/auth/csrf', {});
        return this.raw(method, pathOrUrl, { ...init, retried: true });
      }
    }
    return res;
  }

  private async send(
    method: string,
    pathOrUrl: string,
    init: { body?: unknown; form?: FormData; headers?: Record<string, string>; csrf?: boolean },
  ): Promise<Response> {
    const mutating = method !== 'GET' && method !== 'HEAD';
    if (mutating && init.csrf !== false && !this.cookies.has('hedax_csrf')) await this.raw('GET', '/auth/csrf');
    const headers: Record<string, string> = { accept: 'application/json', ...(init.headers ?? {}) };
    const cookie = this.cookieHeader();
    if (cookie) headers.cookie = cookie;
    if (mutating && init.csrf !== false && this.cookies.has('hedax_csrf')) headers['x-csrf-token'] = this.cookies.get('hedax_csrf') as string;
    let body: BodyInit | null = null;
    if (init.form) body = init.form;
    else if (init.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(init.body);
    }
    const url = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${this.t.base}${pathOrUrl}`;
    const started = Date.now();
    const res = await fetch(url, { method, headers, body, redirect: 'manual' });
    if (Date.now() - started > 5_000) trace(`slow request ${method} ${url.replace(this.t.base, '')} ${Date.now() - started}ms status=${res.status}`);
    this.absorb(res);
    return res;
  }

  async req<T = any>(method: string, path: string, body?: unknown, headers?: Record<string, string>, csrf = true): Promise<Res<T>> {
    const res = await this.raw(method, path, { ...(body !== undefined ? { body } : {}), ...(headers ? { headers } : {}), csrf });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON body */
    }
    return { status: res.status, body: parsed as T, headers: res.headers };
  }

  get<T = any>(path: string) {
    return this.req<T>('GET', path);
  }
  post<T = any>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.req<T>('POST', path, body ?? {}, headers);
  }
  put<T = any>(path: string, body?: unknown) {
    return this.req<T>('PUT', path, body ?? {});
  }
  patch<T = any>(path: string, body?: unknown) {
    return this.req<T>('PATCH', path, body ?? {});
  }
  del<T = any>(path: string) {
    return this.req<T>('DELETE', path);
  }

  async upload<T = any>(path: string, fields: Record<string, string>, files: Array<{ name: string; data: Uint8Array; field?: string; type?: string }>): Promise<Res<T>> {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    for (const f of files) form.append(f.field ?? 'files', new Blob([new Uint8Array(f.data)], { type: f.type ?? 'application/octet-stream' }), f.name);
    const res = await this.raw('POST', path, { form });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON body */
    }
    return { status: res.status, body: parsed as T, headers: res.headers };
  }

  /** Socket.IO connection authenticated by this client's session cookie. */
  socket(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const s = io(this.t.origin, { path: '/api/v1/ws', transports: ['websocket'], extraHeaders: { cookie: this.cookieHeader() }, reconnection: false, forceNew: true });
      const timer = setTimeout(() => reject(new Error('socket connect timeout')), 10_000);
      s.on('connect', () => {
        clearTimeout(timer);
        resolve(s);
      });
      s.on('connect_error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
  }
}

export type Customer = Client & { mobile: string };

export async function loginCustomer(t: TestApp, mobile = uniqueMobile()): Promise<Customer> {
  const c = new Client(t) as Customer;
  c.mobile = mobile;
  const sent = await c.post<{ devCode?: string }>('/auth/otp/request', { mobile });
  if (sent.status !== 200 || !sent.body.devCode) throw new Error(`OTP request failed: ${sent.status} ${JSON.stringify(sent.body)}`);
  const ok = await c.post('/auth/otp/verify', { mobile, code: sent.body.devCode });
  if (ok.status !== 200) throw new Error(`OTP verify failed: ${ok.status} ${JSON.stringify(ok.body)}`);
  const profile = await c.put('/account/profile', { fullName: `مشتری آزمایشی ${mobile.slice(-4)}`, preferredLocale: 'fa' });
  if (profile.status !== 200) throw new Error(`profile failed: ${profile.status} ${JSON.stringify(profile.body)}`);
  return c;
}

/** Signs the same mobile in again later (the OTP resend cooldown is treated as elapsed). */
export async function loginCustomerAgain(t: TestApp, s: Services, mobile: string): Promise<Customer> {
  await s.prisma.$executeRaw`UPDATE "otp_challenge" SET "created_at" = "created_at" - interval '2 minutes' WHERE "mobile_e164" = ${`+98${mobile.slice(1)}`}`;
  return loginCustomer(t, mobile);
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

interface OwnerState {
  totpSecret?: string;
  cookies?: Record<string, string>;
}
const ownerStateFile = () => path.join(process.env.HEDAX_TEST_WORKDIR as string, 'owner-state.json');
function readOwnerState(): OwnerState {
  try {
    return JSON.parse(readFileSync(ownerStateFile(), 'utf8')) as OwnerState;
  } catch {
    return {};
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Completes a TOTP login, waiting for the next 30 s step if this step's code was already used (replay guard). */
async function completeTotp(c: Client, email: string, password: string, challengeId: string, secret: string): Promise<void> {
  let mfa = await c.post('/auth/staff/mfa', { challengeId, code: await totp({ secret }) });
  if (mfa.status === 200) return;
  await sleep(31_000);
  const again = await c.post<{ status: string; challengeId: string }>('/auth/staff/login', { email, password });
  mfa = await c.post('/auth/staff/mfa', { challengeId: again.body.challengeId, code: await totp({ secret }) });
  if (mfa.status !== 200) throw new Error(`MFA login failed ${mfa.status} ${JSON.stringify(mfa.body)}`);
}

async function enrollTotp(c: Client): Promise<string> {
  const enroll = await c.post<{ challengeId: string; secret: string }>('/auth/staff/mfa/enroll');
  if (enroll.status !== 200) throw new Error(`MFA enroll failed ${enroll.status} ${JSON.stringify(enroll.body)}`);
  const confirm = await c.post('/auth/staff/mfa/enroll/confirm', { challengeId: enroll.body.challengeId, code: await totp({ secret: enroll.body.secret }) });
  if (confirm.status !== 200) throw new Error(`MFA confirm failed ${confirm.status} ${JSON.stringify(confirm.body)}`);
  return enroll.body.secret;
}

/**
 * Owner session (owner role requires MFA). The first test file enrolls TOTP;
 * later files reuse the session cookie kept in the throwaway test directory.
 */
/**
 * A fresh authenticator code of the test owner (step-up confirmations). Codes
 * are single-use per 30 s step, so when the current step was already used this
 * waits for the next one.
 */
export async function ownerTotp(previous?: string): Promise<string> {
  const secret = readOwnerState().totpSecret;
  if (!secret) throw new Error('owner TOTP secret unknown (loginOwner first)');
  let code = await totp({ secret });
  if (code === previous) {
    await sleep(31_000);
    code = await totp({ secret });
  }
  return code;
}

export async function loginOwner(t: TestApp): Promise<Client> {
  const state = readOwnerState();
  trace(`loginOwner: state=${state.cookies ? 'cookies' : 'none'}`);
  const c = new Client(t);
  if (state.cookies) {
    for (const [k, v] of Object.entries(state.cookies)) c.cookies.set(k, v);
    const me = await c.get<{ kind: string }>('/me');
    if (me.status === 200 && me.body.kind === 'STAFF') {
      trace('loginOwner: reused session');
      return c;
    }
    c.cookies.clear();
  }
  const email = process.env.TEST_OWNER_EMAIL as string;
  const password = process.env.TEST_OWNER_PASSWORD as string;
  const res = await c.post<{ status: string; challengeId?: string }>('/auth/staff/login', { email, password });
  if (res.status !== 200) throw new Error(`owner login failed ${res.status} ${JSON.stringify(res.body)}`);
  let secret = state.totpSecret;
  if (res.body.status === 'MFA_ENROLLMENT_REQUIRED') secret = await enrollTotp(c);
  else if (res.body.status === 'MFA_REQUIRED') {
    if (!secret) throw new Error('owner TOTP secret unknown');
    await completeTotp(c, email, password, res.body.challengeId as string, secret);
  }
  writeFileSync(ownerStateFile(), JSON.stringify({ totpSecret: secret, cookies: Object.fromEntries(c.cookies) } satisfies OwnerState));
  trace('loginOwner: fresh login done');
  return c;
}

export type Staff = Client & { userId: string; email: string; password: string };

/** Invites a staff member with the given system role(s) and signs them in (enrolling TOTP when the role requires it). */
export async function inviteStaff(t: TestApp, owner: Client, roleKeys: string | string[]): Promise<Staff> {
  const keys = Array.isArray(roleKeys) ? roleKeys : [roleKeys];
  const roles = await owner.get<Array<{ id: string; key: string }>>('/admin/roles');
  if (roles.status !== 200) throw new Error(`roles failed ${roles.status} ${JSON.stringify(roles.body)}`);
  const roleIds = keys.map((k) => {
    const role = roles.body.find((r) => r.key === k);
    if (!role) throw new Error(`role ${k} not found`);
    return role.id;
  });
  const email = `${keys[0]}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@hedax.test`;
  const fullName = `کارمند ${keys.join(' ')}`;
  const inv = await owner.post<{ acceptUrl: string }>('/admin/staff/invitations', { email, fullName, roleIds });
  if (inv.status !== 201) throw new Error(`invite failed ${inv.status} ${JSON.stringify(inv.body)}`);
  const token = new URL(inv.body.acceptUrl).searchParams.get('token') as string;
  const staff = new Client(t) as Staff;
  const password = `Zq-${Math.random().toString(36).slice(2)}-Kp!8x`;
  const acc = await staff.post<{ userId: string }>('/auth/invitations/accept', { token, fullName, password });
  if (acc.status !== 200) throw new Error(`accept failed ${acc.status} ${JSON.stringify(acc.body)}`);
  const login = await staff.post<{ status: string }>('/auth/staff/login', { email, password });
  if (login.status !== 200) throw new Error(`staff login failed ${login.status} ${JSON.stringify(login.body)}`);
  if (login.body.status === 'MFA_ENROLLMENT_REQUIRED') await enrollTotp(staff);
  const me = await staff.get<{ id: string }>('/me');
  staff.userId = me.body.id;
  staff.email = email;
  staff.password = password;
  return staff;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export async function pngBytes(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 49, g: 130, b: 206 } } }).png().toBuffer();
}

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of buf) {
    let c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Minimal uncompressed ZIP writer, enough to build OOXML test documents. */
export function zipStore(files: Array<{ name: string; data: string | Uint8Array }>): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const data = typeof f.data === 'string' ? Buffer.from(f.data, 'utf8') : Buffer.from(f.data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += 30 + name.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

export function minimalDocx(extra: Array<{ name: string; data: string }> = []): Buffer {
  return zipStore([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>' },
    { name: 'word/document.xml', data: '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>فهرست قطعات</w:t></w:r></w:p></w:body></w:document>' },
    ...extra,
  ]);
}

export function simplePdf(text = 'HEDAX test document'): Buffer {
  return Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n% ${text}\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
}

export async function taxonomy(owner: Client) {
  const tax = await owner.get<{ categories: Array<{ id: string; code: string }>; vehicleBrands: Array<{ id: string; code: string }>; customerGroups: Array<{ id: string; key: string }> }>('/admin/taxonomy');
  if (tax.status !== 200) throw new Error(`taxonomy failed ${tax.status}`);
  return tax.body;
}

/** Creates and publishes a NEW product with stock through the admin API; returns ids. */
export async function createProduct(
  owner: Client,
  opts: { sku: string; nameFa: string; priceIrr?: bigint; priceAed?: bigint; onHand: number; vehicleBrandCodes?: string[]; category?: string },
): Promise<{ id: string; slug: string }> {
  const tax = await taxonomy(owner);
  const categoryId = tax.categories.find((c) => c.code === (opts.category ?? 'BRAKE'))?.id;
  const vehicleBrandIds = (opts.vehicleBrandCodes ?? ['IKCO']).map((code) => tax.vehicleBrands.find((b) => b.code === code)?.id);
  const created = await owner.post<{ id: string; version: number }>('/admin/products', {
    sku: opts.sku,
    nameFa: opts.nameFa,
    nameEn: `${opts.sku} test part`,
    categoryId,
    vehicleBrandIds,
    partType: 'AFTERMARKET',
    condition: 'NEW',
    origin: opts.priceAed !== undefined ? 'IMPORTED' : 'DOMESTIC',
    basePrice: opts.priceAed !== undefined
      ? { currency: 'AED', amountMinor: opts.priceAed.toString() }
      : { currency: 'IRR', amountMinor: (opts.priceIrr ?? 1_000_000n).toString() },
    lowStockThreshold: 0,
  });
  if (created.status !== 201) throw new Error(`create product failed ${created.status} ${JSON.stringify(created.body)}`);
  const id = created.body.id;
  if (opts.onHand > 0) {
    const detail = await owner.get<{ inventory: { version: number } }>(`/admin/products/${id}`);
    const adj = await owner.post('/admin/inventory/adjust', { productId: id, newOnHand: opts.onHand, reason: 'RECEIVED', expectedVersion: detail.body.inventory.version });
    if (adj.status !== 201) throw new Error(`adjust failed ${adj.status} ${JSON.stringify(adj.body)}`);
  }
  const fresh = await owner.get<{ version: number; slug: string }>(`/admin/products/${id}`);
  const pub = await owner.post(`/admin/products/${id}/publish`, { published: true, version: fresh.body.version });
  if (pub.status !== 201) throw new Error(`publish failed ${pub.status} ${JSON.stringify(pub.body)}`);
  return { id, slug: fresh.body.slug };
}

export async function addToCart(c: Client, productId: string, quantity = 1): Promise<Res> {
  const res = await c.post('/cart/items', { productId, quantity });
  if (res.status !== 201) throw new Error(`add to cart failed ${res.status} ${JSON.stringify(res.body)}`);
  return res;
}

export async function addAddress(c: Client, province = 'تهران'): Promise<string> {
  const res = await c.post<{ id: string }>('/account/addresses', {
    recipientName: 'گیرنده آزمایشی', recipientMobile: '09121234567', province, city: 'تهران', addressLine: 'خیابان آزمایشی، پلاک ۱', postalCode: '1234567890', isDefault: true,
  });
  if (res.status !== 201) throw new Error(`address failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id;
}

/** Review step exactly as the UI does it: preview → pick a priced shipping method → preview again. */
export async function reviewCheckout(c: Client, addressId: string) {
  const first = await c.get<any>(`/checkout/preview?addressId=${addressId}`);
  if (first.status !== 200) throw new Error(`preview failed ${first.status} ${JSON.stringify(first.body)}`);
  const method = first.body.shippingOptions.find((o: any) => o.cost.status === 'KNOWN');
  const priced = await c.get<any>(`/checkout/preview?addressId=${addressId}&shippingMethodId=${method.id}`);
  return { preview: priced.body, shippingMethodId: method.id as string };
}

export async function checkout(c: Client, addressId: string, key = idemKey()): Promise<Res> {
  const { preview, shippingMethodId } = await reviewCheckout(c, addressId);
  if (!preview.totals?.grandTotal) return { status: 0, body: preview, headers: new Headers() };
  return c.post('/checkout', {
    addressId, shippingMethodId, acceptedPolicyVersionId: preview.policy.id, expectedGrandTotalIrr: preview.totals.grandTotal.amountMinor,
  }, { 'idempotency-key': key });
}

export function simulatorRef(redirectUrl: string): string {
  return decodeURIComponent(redirectUrl.split('/payments/simulator/')[1] ?? '');
}

/** "Bank side" of the simulator; optionally the browser then follows the callback redirect. */
export async function simulatorPay(
  c: Client,
  redirectUrl: string,
  outcome: 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'PENDING' | 'TAMPERED' | 'DUPLICATE',
  followCallback = true,
): Promise<{ decideStatus: number; callbackStatus: number | null; resultLocation: string | null }> {
  const ref = simulatorRef(redirectUrl);
  const res = await c.raw('POST', `/payments/simulator/${encodeURIComponent(ref)}/decide`, { body: { outcome }, csrf: false });
  if (!followCallback || outcome === 'PENDING') return { decideStatus: res.status, callbackStatus: null, resultLocation: null };
  const location = res.headers.get('location');
  if (!location) throw new Error(`simulator decide returned ${res.status}`);
  const cb = await c.raw('GET', `${c.origin}${location}`);
  return { decideStatus: res.status, callbackStatus: cb.status, resultLocation: cb.headers.get('location') };
}

export function waitForEvent<T = any>(s: Socket, event: string, timeoutMs = 5_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    s.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

export function emitAck<T = any>(s: Socket, event: string, payload: unknown, timeoutMs = 5_000): Promise<T> {
  return s.timeout(timeoutMs).emitWithAck(event, payload) as Promise<T>;
}
