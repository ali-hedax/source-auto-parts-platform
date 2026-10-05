// Runs the real-stack browser tests (apps/web/e2e-real) against a throwaway stack:
// a temporary PostgreSQL (native binaries from the API's `embedded-postgres` dev
// dependency) with migrations, a random first owner and the development seed;
// the compiled API and worker (QUEUE_DRIVER=inline, so no Redis is needed); and
// the web app connected to that API. The developer database, `.env` and
// `.local-dev-credentials` are never read or changed; everything is removed at
// the end. Logs stay in <os temp>/hedax-e2e-real/.
//
//   pnpm --filter @hedax/api build && pnpm --filter @hedax/worker build
//   pnpm --filter @hedax/web e2e:real                 # extra args go to Playwright, e.g. -- -g "admin"
//   pnpm --filter @hedax/web e2e:real -- --perf       # production build + lab LCP/CLS (perf.json in the log folder)
//   E2E_PAYMENT=zarinpal-sandbox pnpm --filter @hedax/web e2e:real   # pay through Zarinpal's public sandbox
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiRoot = path.resolve(webRoot, '../api');
const workerRoot = path.resolve(webRoot, '../worker');
const PG_PORT = Number(process.env.E2E_PG_PORT ?? 55435);
const API_PORT = Number(process.env.E2E_API_PORT ?? 4100);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3300);
const apiOrigin = `http://localhost:${API_PORT}`;
const webOrigin = `http://localhost:${WEB_PORT}`;
const workDir = path.join(os.tmpdir(), `hedax-e2e-real-${process.pid}`);
const logDir = path.join(os.tmpdir(), 'hedax-e2e-real');
/** `--perf`: production build of the web app and only the lab LCP/CLS measurement (performance.spec.ts). */
const PERF = process.argv.includes('--perf');
const PERF_DIST = '.next-e2e-perf';
const playwrightArgs = process.argv.slice(2).filter((arg) => arg !== '--perf');

const log = (msg) => process.stdout.write(`[e2e-real] ${msg}\n`);

for (const file of [path.join(apiRoot, 'dist/main.js'), path.join(workerRoot, 'dist/main.js')]) {
  if (!existsSync(file)) {
    log(`missing ${path.relative(path.resolve(webRoot, '../..'), file)} — run: pnpm --filter @hedax/api build && pnpm --filter @hedax/worker build`);
    process.exit(2);
  }
}

const portInUse = (port) =>
  new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
for (const port of [PG_PORT, API_PORT, WEB_PORT]) {
  if (await portInUse(port)) {
    log(`port ${port} is already in use; set E2E_PG_PORT / E2E_API_PORT / E2E_WEB_PORT`);
    process.exit(2);
  }
}

const requireFromApi = createRequire(path.join(apiRoot, 'package.json'));
const { default: EmbeddedPostgres } = await import(pathToFileURL(requireFromApi.resolve('embedded-postgres')).href);
const requireFromWeb = createRequire(path.join(webRoot, 'package.json'));

const children = [];
let pg = null;
let cleaned = false;

function killTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }
}

async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  for (const child of children.reverse()) killTree(child);
  await pg?.stop().catch(() => undefined);
  rmSync(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  if (PERF) rmSync(path.join(webRoot, PERF_DIST), { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    void cleanup().finally(() => process.exit(130));
  });
}

function start(name, cwd, args, env) {
  const out = openSync(path.join(logDir, `${name}.log`), 'w');
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', out, out], detached: process.platform !== 'win32' });
  children.push(child);
  child.once('exit', (code) => {
    if (!cleaned) log(`${name} exited early (code ${code}); see ${path.join(logDir, `${name}.log`)}`);
  });
  return child;
}

async function waitFor(what, check, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check().catch(() => false)) return;
    if (Date.now() > deadline) throw new Error(`${what} not ready after ${Math.round(timeoutMs / 1000)} s (logs: ${logDir})`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

let exitCode = 1;
try {
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });

  const pgPassword = randomBytes(18).toString('base64url');
  log(`starting PostgreSQL on 127.0.0.1:${PG_PORT}`);
  pg = new EmbeddedPostgres({
    databaseDir: path.join(workDir, 'pg'),
    user: 'hedax',
    password: pgPassword,
    port: PG_PORT,
    persistent: false,
    authMethod: 'scram-sha-256',
    initdbFlags: ['--encoding=UTF8', process.platform === 'win32' ? '--locale=en-US' : '--locale=C.UTF-8'],
    // io_method=sync: no I/O worker processes (on Windows an orphaned one kept the port open after stop).
    postgresFlags: ['-c', 'listen_addresses=127.0.0.1', '-c', 'max_connections=100', '-c', 'io_method=sync'],
    onLog: () => undefined,
    onError: () => undefined,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('hedax_e2e');

  const owner = { email: 'owner@hedax.test', password: randomBytes(18).toString('base64url') };
  const revalidateSecret = randomBytes(32).toString('base64');
  const appEnv = {
    ...process.env,
    APP_ENV: 'development',
    PORT: String(API_PORT),
    PUBLIC_BASE_URL: webOrigin,
    DATABASE_URL: `postgresql://hedax:${pgPassword}@127.0.0.1:${PG_PORT}/hedax_e2e?schema=public`,
    REDIS_URL: 'redis://127.0.0.1:6391', // nothing listens here: the API runs without Redis
    QUEUE_DRIVER: 'inline',
    WEB_INTERNAL_URL: webOrigin, // public cache purge after changes (spec §15)
    REVALIDATE_SECRET: revalidateSecret,
    SESSION_SECRET: randomBytes(32).toString('base64'),
    OTP_PEPPER: randomBytes(32).toString('base64'),
    APP_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    COOKIE_SECURE: 'false',
    STORAGE_DRIVER: 'local',
    LOCAL_STORAGE_DIR: path.join(workDir, 'storage'),
    MALWARE_SCANNER: 'none-dev',
    // E2E_PAYMENT=zarinpal-sandbox: Zarinpal's official public sandbox (any UUID merchant ID) instead of the simulator.
    ...(process.env.E2E_PAYMENT === 'zarinpal-sandbox'
      ? { PAYMENT_PROVIDER: 'zarinpal', ZARINPAL_SANDBOX: 'true', PAYMENT_MERCHANT_ID: randomUUID() }
      : { PAYMENT_PROVIDER: 'simulator' }),
    SMS_PROVIDER: 'dev-log',
    OPENAPI_ENABLED: 'false',
    LOG_LEVEL: 'warn',
    PDF_BROWSER_CHANNEL: process.env.PDF_BROWSER_CHANNEL ?? process.env.PW_CHANNEL ?? 'msedge',
  };

  log('migrating, creating the first owner and loading the development seed');
  const tool = (args, extra = {}) => execFileSync(process.execPath, args, { cwd: apiRoot, env: { ...appEnv, ...extra }, stdio: 'pipe' });
  tool([path.join(apiRoot, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy']);
  tool(['dist/cli/bootstrap-owner.js', '--email', owner.email, '--name', 'مالک آزمایشی'], { HEDAX_OWNER_PASSWORD: owner.password });
  tool(['dist/database/seed-dev.js']);

  log(`starting API on ${apiOrigin} and the worker (inline queue)`);
  start('api', apiRoot, ['dist/main.js'], appEnv);
  start('worker', workerRoot, ['dist/main.js'], appEnv);
  await waitFor('API', async () => (await fetch(`${apiOrigin}/health/live`)).ok, 60_000);
  await waitFor('worker', async () => readFileSync(path.join(logDir, 'worker.log'), 'utf8').includes('QUEUE_DRIVER=inline'), 60_000);

  const nextBin = requireFromWeb.resolve('next/dist/bin/next');
  const webEnv = {
    ...process.env,
    HEDAX_DATA_SOURCE: 'api',
    API_INTERNAL_URL: `${apiOrigin}/api/v1`,
    NEXT_PUBLIC_WS_URL: apiOrigin,
    PUBLIC_BASE_URL: webOrigin,
    REVALIDATE_SECRET: revalidateSecret,
  };
  if (PERF) {
    // Performance mode: a production build in its own folder (the normal `.next` output stays untouched).
    log('building the web app for production (performance mode, a few minutes)');
    rmSync(path.join(webRoot, PERF_DIST), { recursive: true, force: true });
    const buildLog = openSync(path.join(logDir, 'web-build.log'), 'w');
    execFileSync(process.execPath, [nextBin, 'build'], { cwd: webRoot, env: { ...webEnv, NEXT_DIST_DIR: PERF_DIST }, stdio: ['ignore', buildLog, buildLog] });
    log(`starting the production web app on ${webOrigin}`);
    start('web', webRoot, [nextBin, 'start', '--port', String(WEB_PORT)], { ...webEnv, NEXT_DIST_DIR: PERF_DIST });
  } else {
    // Cached API responses from an earlier run point at another throwaway database (stale-while-revalidate
    // would serve one of them first, e.g. an old product id); each run starts with an empty data cache.
    rmSync(path.join(webRoot, '.next', 'dev', 'cache', 'fetch-cache'), { recursive: true, force: true });
    log(`starting web on ${webOrigin} (first compile can take a minute)`);
    start('web', webRoot, [nextBin, 'dev', '--port', String(WEB_PORT)], webEnv);
  }
  await waitFor('web', async () => (await fetch(`${webOrigin}/fa`, { signal: AbortSignal.timeout(120_000) })).status === 200, 300_000);

  log('running Playwright');
  const result = spawnSync(process.execPath, [requireFromWeb.resolve('@playwright/test/cli'), 'test', '-c', 'playwright.real.config.ts', ...(PERF ? ['performance.spec.ts'] : []), ...playwrightArgs], {
    cwd: webRoot,
    stdio: 'inherit',
    env: {
      ...process.env, E2E_REAL_BASE_URL: webOrigin, E2E_OWNER_EMAIL: owner.email, E2E_OWNER_PASSWORD: owner.password,
      ...(PERF ? { E2E_PERF: '1', E2E_PERF_OUT: process.env.E2E_PERF_OUT ?? path.join(logDir, 'perf.json') } : {}),
    },
  });
  exitCode = result.status ?? 1;
} catch (e) {
  log(e instanceof Error ? e.message : String(e));
} finally {
  log('stopping the stack and removing temporary data');
  await cleanup();
}
process.exit(exitCode);
