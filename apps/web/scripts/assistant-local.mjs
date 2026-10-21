// Dedicated disposable local stack for reviewing assistant settings against the
// real API. Never loads .env or reuses a database/Redis/storage volume.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, openSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiRoot = path.resolve(webRoot, '../api');
const fromApi = createRequire(path.join(apiRoot, 'package.json'));
const fromWeb = createRequire(path.join(webRoot, 'package.json'));
const ports = { pg: 55439, api: 4191, web: 3191 };
// Explicit allowlist: do not pass inherited app credentials or provider settings.
const systemEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(path|systemroot|windir|temp|tmp|comspec|pathext|userprofile|appdata|localappdata)$/i.test(key)));
const children = [];
let pg;
let workDir;
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children.reverse()) {
    if (child.exitCode !== null || !child.pid) continue;
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', env: systemEnv });
    else child.kill('SIGTERM');
  }
  await pg?.stop();
  if (workDir && path.dirname(workDir) === os.tmpdir() && path.basename(workDir).startsWith('hedax-assistant-local-')) {
    await rm(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void stop().then(() => process.exit(0)));
async function available(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(true));
  });
}
function start(name, cwd, args, env) {
  const log = openSync(path.join(workDir, `${name}.log`), 'w');
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', log, log], windowsHide: true });
  children.push(child);
  child.once('exit', () => { if (!stopping) void stop().then(() => process.exit(1)); });
}
try {
  // Next dev can load its own dotenv files automatically. Refuse rather than
  // reading any pre-existing web environment in this disposable review mode.
  for (const file of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    if (existsSync(path.join(webRoot, file))) throw new Error('Web environment file exists; isolated launcher refuses to load it.');
  }
  for (const port of Object.values(ports)) if (!await available(port)) throw new Error(`Port ${port} is occupied. No existing process will be changed.`);
  workDir = mkdtempSync(path.join(os.tmpdir(), 'hedax-assistant-local-'));
  const { default: EmbeddedPostgres } = await import(pathToFileURL(fromApi.resolve('embedded-postgres')).href);
  const password = randomBytes(24).toString('base64url');
  pg = new EmbeddedPostgres({ databaseDir: path.join(workDir, 'pg'), user: 'hedax', password, port: ports.pg, persistent: true, authMethod: 'scram-sha-256', initdbFlags: ['--encoding=UTF8', process.platform === 'win32' ? '--locale=en-US' : '--locale=C.UTF-8'], postgresFlags: ['-c', 'listen_addresses=127.0.0.1', '-c', 'io_method=sync'], onLog: () => undefined, onError: () => undefined });
  await pg.initialise(); await pg.start(); await pg.createDatabase('hedax_assistant_local');
  const env = { ...systemEnv, APP_ENV: 'development', PORT: String(ports.api), ASSISTANT_AI_PROVIDER: 'mock', ASSISTANT_LIVE_CALLS_ENABLED: 'false', PUBLIC_BASE_URL: `http://localhost:${ports.web}`, DATABASE_URL: `postgresql://hedax:${password}@127.0.0.1:${ports.pg}/hedax_assistant_local?schema=public`, REDIS_URL: 'redis://127.0.0.1:6391', QUEUE_DRIVER: 'inline', SESSION_SECRET: randomBytes(32).toString('base64'), OTP_PEPPER: randomBytes(32).toString('base64'), APP_ENCRYPTION_KEY: randomBytes(32).toString('base64'), STORAGE_DRIVER: 'local', LOCAL_STORAGE_DIR: path.join(workDir, 'storage'), MALWARE_SCANNER: 'none-dev', COOKIE_SECURE: 'false', PAYMENT_PROVIDER: 'none', SMS_PROVIDER: 'dev-log', MAIL_PROVIDER: 'none', OPENAPI_ENABLED: 'false', LOG_LEVEL: 'warn' };
  const tool = (args, interactive = false) => execFileSync(process.execPath, args, { cwd: apiRoot, env, stdio: interactive ? 'inherit' : 'pipe' });
  tool([fromApi.resolve('prisma/build/index.js'), 'migrate', 'deploy']);
  const smoke = process.argv.includes('--smoke');
  if (smoke) env.HEDAX_OWNER_PASSWORD = randomBytes(24).toString('base64url');
  else console.log('Create a LOCAL TEST password for owner@hedax.test. Never use a real account password.');
  tool(['dist/cli/bootstrap-owner.js', '--email', 'owner@hedax.test', '--name', 'Local Test Owner'], !smoke);
  delete env.HEDAX_OWNER_PASSWORD;
  tool(['dist/database/seed-dev.js']);
  // This disposable review stack starts with the assistant visible; production defaults remain unchanged.
  tool(['--input-type=module', '--eval', `import { PrismaService } from './dist/common/prisma.service.js'; import { DEFAULT_ASSISTANT_SETTINGS } from '@hedax/contracts/constants'; const p=new PrismaService({DATABASE_URL:process.env.DATABASE_URL}); await p.siteSetting.upsert({where:{key:'assistant.phase1'},create:{key:'assistant.phase1',value:{...DEFAULT_ASSISTANT_SETTINGS,enabled:true},version:1},update:{value:{...DEFAULT_ASSISTANT_SETTINGS,enabled:true}}}); await p.$disconnect();`]);
  // Same compiled API and pipeline, with loopback-only binding for this local review.
  const apiEntry = `import 'reflect-metadata'; import { NestFactory } from '@nestjs/core'; import { AppModule } from './dist/app.module.js'; import { configureApp } from './dist/app.setup.js'; import { loadEnv } from './dist/config/env.js'; const app = await NestFactory.create(AppModule, { logger: false }); configureApp(app, loadEnv()); app.enableShutdownHooks(); await app.listen(${ports.api}, '127.0.0.1');`;
  start('api', apiRoot, ['--input-type=module', '--eval', apiEntry], env);
  const webEnv = { ...systemEnv, HEDAX_DATA_SOURCE: 'api', API_INTERNAL_URL: `http://127.0.0.1:${ports.api}/api/v1`, PUBLIC_BASE_URL: env.PUBLIC_BASE_URL, NEXT_PUBLIC_WS_URL: 'off' };
  start('web', webRoot, [fromWeb.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(ports.web)], webEnv);
  if (smoke) {
    const deadline = Date.now() + 180_000;
    let verified = false;
    while (Date.now() < deadline && !stopping) {
      try {
        const settings = await fetch(`http://127.0.0.1:${ports.api}/api/v1/site/assistant`, { signal: AbortSignal.timeout(5_000) });
        if (!settings.ok || (await settings.json()).enabled !== false) throw new Error('Default state');
        const page = await fetch(`http://127.0.0.1:${ports.web}/fa/admin/assistant`, { signal: AbortSignal.timeout(30_000) });
        if (!page.ok) throw new Error('Web not ready');
        verified = true; break;
      } catch { await new Promise((resolve) => setTimeout(resolve, 1000)); }
    }
    if (!verified) throw new Error('Local smoke timed out');
    console.log('PASS: disposable real API defaults off; local assistant admin page returns 200. No fixture backend.');
    await stop();
  } else console.log(`Open http://localhost:${ports.web}/fa (assistant enabled with mock provider) or /fa/staff/login (owner@hedax.test) for /fa/admin/assistant. Ctrl+C removes the disposable stack.`);
} catch (error) {
  // CLI errors can contain environment values: print only our safe summary.
  console.error('Local assistant stack could not start. No existing services or data were changed.');
  if (error instanceof Error && /^(Port |Web environment file exists)/.test(error.message)) console.error(error.message);
  await stop(); process.exitCode = 1;
}
