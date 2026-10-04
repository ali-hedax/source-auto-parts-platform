import EmbeddedPostgres from 'embedded-postgres';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    hedaxEnv: Record<string, string>;
  }
}

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.TEST_PG_PORT ?? 55433);
const PASSWORD = 'hedax-test-only';

/*
 * embedded-postgres registers async-exit-hook, which stops its servers on
 * 'beforeExit' and then calls process.exit(0) — overwriting the failure exit
 * code vitest has set, so failed tests would look green to CI. Keep vitest's code.
 */
let intendedExitCode: number | undefined;
process.on('beforeExit', () => {
  if (intendedExitCode === undefined && typeof process.exitCode === 'number' && process.exitCode !== 0) intendedExitCode = process.exitCode;
});
process.on('exit', () => {
  if (intendedExitCode) process.exitCode = intendedExitCode;
});

let pg: EmbeddedPostgres | null = null;
/** Diagnostic trace kept outside the throwaway directory (OS temp). */
const traceFile = path.join(os.tmpdir(), 'hedax-integration-trace.log');
let workDir = '';

/** Starts a throwaway PostgreSQL, migrates, seeds and creates the first owner. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  workDir = path.join(apiRoot, '.local-pg', `test-${process.pid}`);
  rmSync(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  mkdirSync(workDir, { recursive: true });
  writeFileSync(traceFile, `run started ${new Date().toISOString()}\n`);
  pg = new EmbeddedPostgres({
    databaseDir: path.join(workDir, 'data'),
    user: 'hedax',
    password: PASSWORD,
    port: PORT,
    persistent: false,
    authMethod: 'scram-sha-256',
    initdbFlags: ['--encoding=UTF8', process.platform === 'win32' ? '--locale=en-US' : '--locale=C.UTF-8'],
    // A non-UTC server zone on purpose: the application must not depend on the server's TimeZone.
    postgresFlags: [
      '-c', 'listen_addresses=127.0.0.1', '-c', 'max_connections=200', '-c', 'timezone=Asia/Tehran',
      // Diagnostics: report lock waits, and turn an endless lock wait into a visible error.
      '-c', 'log_lock_waits=on', '-c', 'deadlock_timeout=2s', '-c', 'lock_timeout=120s',
    ],
    onLog: (message) => {
      if (/lock|deadlock|timeout|terminat|FATAL|ERROR/i.test(String(message))) appendFileSync(traceFile, `[pg] ${String(message).trim()}\n`);
    },
    onError: () => undefined,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('hedax_test');

  const env: Record<string, string> = {
    APP_ENV: 'development', // exposes the dev OTP code to the test client; simulator + dev SMS allowed
    DATABASE_URL: `postgresql://hedax:${PASSWORD}@127.0.0.1:${PORT}/hedax_test?schema=public`,
    REDIS_URL: 'redis://127.0.0.1:6391', // nothing listens here on purpose
    PUBLIC_BASE_URL: 'http://127.0.0.1:3999',
    SESSION_SECRET: randomBytes(32).toString('base64'),
    OTP_PEPPER: randomBytes(32).toString('base64'),
    APP_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    COOKIE_SECURE: 'false',
    STORAGE_DRIVER: 'local',
    LOCAL_STORAGE_DIR: path.join(workDir, 'storage'),
    MALWARE_SCANNER: 'none-dev',
    PAYMENT_PROVIDER: 'simulator',
    SMS_PROVIDER: 'dev-log',
    OPENAPI_ENABLED: 'false',
    LOG_LEVEL: 'fatal',
    TEST_OWNER_EMAIL: 'owner@hedax.test',
    TEST_OWNER_PASSWORD: randomBytes(18).toString('base64url'),
    HEDAX_TEST_WORKDIR: workDir,
    HEDAX_TEST_TRACE: traceFile,
  };
  Object.assign(process.env, env);
  project.provide('hedaxEnv', env);

  const run = (args: string[], extra: Record<string, string> = {}) =>
    execFileSync(process.execPath, args, { cwd: apiRoot, env: { ...process.env, ...extra }, stdio: 'pipe' });
  run([path.join(apiRoot, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy']);
  run(['dist/cli/bootstrap-owner.js', '--email', env.TEST_OWNER_EMAIL as string, '--name', 'Test Owner'], { HEDAX_OWNER_PASSWORD: env.TEST_OWNER_PASSWORD as string });
  run(['dist/database/seed-dev.js']);

  return async () => {
    await pg?.stop().catch(() => undefined);
    rmSync(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  };
}
