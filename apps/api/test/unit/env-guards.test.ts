import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';
import { SimulatorPaymentProvider } from '../../src/modules/payments/simulator.provider.js';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const secret = () => randomBytes(32).toString('base64');

/** A production configuration that is acceptable: no simulator, no dev SMS, real scanner, https, secure cookies. */
function productionEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    APP_ENV: 'production',
    DATABASE_URL: 'postgresql://hedax:unused@127.0.0.1:1/hedax',
    REDIS_URL: 'redis://127.0.0.1:1',
    PUBLIC_BASE_URL: 'https://shop.example.test',
    SESSION_SECRET: secret(),
    OTP_PEPPER: secret(),
    APP_ENCRYPTION_KEY: secret(),
    COOKIE_SECURE: 'true',
    PAYMENT_PROVIDER: 'none',
    SMS_PROVIDER: 'none',
    MALWARE_SCANNER: 'clamav',
    OPENAPI_ENABLED: 'false',
    ...overrides,
  };
}

describe('A29 — production refuses test-only payment, SMS/OTP and scanner modes', () => {
  it('accepts a production configuration without any test adapter', () => {
    const env = loadEnv(productionEnv());
    expect(env).toMatchObject({ APP_ENV: 'production', PAYMENT_PROVIDER: 'none', SMS_PROVIDER: 'none', MALWARE_SCANNER: 'clamav' });
  });

  it.each([
    ['PAYMENT_PROVIDER', 'simulator'],
    ['SMS_PROVIDER', 'dev-log'],
    ['MALWARE_SCANNER', 'none-dev'],
    ['COOKIE_SECURE', 'false'],
    ['PUBLIC_BASE_URL', 'http://shop.example.test'],
    ['OPENAPI_ENABLED', 'true'],
    ['QUEUE_DRIVER', 'inline'],
  ])('refuses %s=%s in production and names only the variable', (key, value) => {
    const env = productionEnv({ [key]: value });
    let message = '';
    try {
      loadEnv(env);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain(key);
    for (const sensitive of ['SESSION_SECRET', 'OTP_PEPPER', 'APP_ENCRYPTION_KEY'] as const) expect(message).not.toContain(env[sensitive]);
    expect(message).not.toContain('unused@');
  });

  it('an empty cache-purge setting means "not set"; a short purge secret is refused', () => {
    const env = loadEnv(productionEnv({ WEB_INTERNAL_URL: '', REVALIDATE_SECRET: '' }));
    expect(env.WEB_INTERNAL_URL).toBeUndefined();
    expect(env.REVALIDATE_SECRET).toBeUndefined();
    expect(() => loadEnv(productionEnv({ WEB_INTERNAL_URL: 'http://web:3000', REVALIDATE_SECRET: 'too-short' }))).toThrow(/REVALIDATE_SECRET/);
  });

  it('the same values are allowed in development (labelled test adapters)', () => {
    expect(() => loadEnv(productionEnv({ APP_ENV: 'development', PAYMENT_PROVIDER: 'simulator', SMS_PROVIDER: 'dev-log', MALWARE_SCANNER: 'none-dev', COOKIE_SECURE: 'false', PUBLIC_BASE_URL: 'http://localhost:3000', QUEUE_DRIVER: 'inline' }))).not.toThrow();
  });

  it('the payment simulator itself cannot be constructed in production', () => {
    expect(() => new SimulatorPaymentProvider('https://shop.example.test', 'SIM', 15, 'production')).toThrow(/production/);
    expect(() => new SimulatorPaymentProvider('http://localhost:3000', 'SIM', 15, 'development')).not.toThrow();
  });

  it('the compiled API refuses to start in production with the simulator and prints no secret', () => {
    const env = productionEnv({ PAYMENT_PROVIDER: 'simulator', SMS_PROVIDER: 'dev-log' });
    const result = spawnSync(process.execPath, ['dist/main.js'], { cwd: apiRoot, env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', ...env }, encoding: 'utf8', timeout: 60_000 });
    expect(result.status).toBe(1);
    const output = `${result.stdout}${result.stderr}`;
    expect(output).toContain('PAYMENT_PROVIDER');
    expect(output).toContain('SMS_PROVIDER');
    for (const sensitive of ['SESSION_SECRET', 'OTP_PEPPER', 'APP_ENCRYPTION_KEY'] as const) expect(output).not.toContain(env[sensitive]);
  }, 90_000);

  it('development sample data cannot be loaded into a production database', () => {
    const result = spawnSync(process.execPath, ['dist/database/seed-dev.js'], {
      cwd: apiRoot, env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', APP_ENV: 'production', DATABASE_URL: 'postgresql://hedax:unused@127.0.0.1:1/hedax' }, encoding: 'utf8', timeout: 60_000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('seed-dev refused');
  }, 90_000);
});
