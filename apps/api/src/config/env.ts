import { z } from 'zod';

/**
 * Environment contract. Secrets come only from the environment / secret manager.
 * Production guards (spec §9.2, §14): simulators, dev SMS codes and the
 * "no scanner" mode are refused outright when APP_ENV=production.
 */
const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

/** `NAME=` left empty in an env file means "not set". */
const emptyAsUnset = (value: unknown) => (value === '' ? undefined : value);

const schema = z
  .object({
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    /** Public origin of the site (web + API behind one reverse proxy), e.g. https://example.ir */
    PUBLIC_BASE_URL: z.url().default('http://localhost:3000'),
    /** Additional allowed origins for CSRF origin checks (comma separated). */
    ALLOWED_ORIGINS: z.string().default(''),
    TRUST_PROXY: bool.default(false),

    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    /**
     * How the worker runs outbox events and periodic jobs: through BullMQ/Redis,
     * or `inline` (development without Redis: the same handlers run in the worker
     * process, one at a time). Refused in production.
     */
    QUEUE_DRIVER: z.enum(['bullmq', 'inline']).default('bullmq'),
    /**
     * Public page cache purge (spec §15): after a change to products, prices,
     * stock, rates, policies or contact details the API asks the web app to drop
     * its cached public data. Unset = pages refresh only on their timer (60–300 s).
     */
    WEB_INTERNAL_URL: z.preprocess(emptyAsUnset, z.url().optional()),
    /** Shared with the web app (≥32 random bytes, base64). */
    REVALIDATE_SECRET: z.preprocess(emptyAsUnset, z.string().min(32).optional()),

    /** ≥32 random bytes, base64. Signs CSRF tokens and hashes IPs. */
    SESSION_SECRET: z.string().min(32),
    /** ≥32 random bytes, base64. HMAC pepper for OTP codes. */
    OTP_PEPPER: z.string().min(32),
    /** 32-byte key, base64 — AES-256-GCM for TOTP secrets. */
    APP_ENCRYPTION_KEY: z.string().min(40),
    SESSION_TTL_HOURS_CUSTOMER: z.coerce.number().int().min(1).max(24 * 60).default(24 * 30),
    SESSION_TTL_HOURS_STAFF: z.coerce.number().int().min(1).max(72).default(12),
    COOKIE_SECURE: bool.default(true),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    LOCAL_STORAGE_DIR: z.string().default('./storage'),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_PRIVATE_BUCKET: z.string().optional(),
    S3_PUBLIC_BUCKET: z.string().optional(),
    S3_PUBLIC_BASE_URL: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    /** Base URL products images are served from (public bucket or /media via proxy). */
    PUBLIC_MEDIA_BASE_URL: z.string().default('/media'),

    MALWARE_SCANNER: z.enum(['clamav', 'none-dev']).default('none-dev'),
    CLAMAV_HOST: z.string().default('clamav'),
    CLAMAV_PORT: z.coerce.number().int().default(3310),
    // Readiness reports the signatures as "stale" beyond this age (freshclam failing, mirror down).
    CLAMAV_SIGNATURE_MAX_AGE_HOURS: z.coerce.number().int().min(1).max(720).default(48),

    /**
     * "simulator" is development/test only. "zarinpal" is the Zarinpal REST v4 gateway
     * (ZARINPAL_SANDBOX=true uses its public test sandbox, refused in production).
     * "none" refuses every payment start until a gateway is configured.
     */
    PAYMENT_PROVIDER: z.enum(['simulator', 'zarinpal', 'none']).default('simulator'),
    PAYMENT_MERCHANT_ID: z.string().default('SIMULATOR'),
    ZARINPAL_SANDBOX: bool.default(false),
    PAYMENT_SESSION_MINUTES: z.coerce.number().int().min(5).max(60).default(15),

    /** "kavenegar": Kavenegar REST API (OTP via an approved verify/lookup template). */
    SMS_PROVIDER: z.enum(['dev-log', 'kavenegar', 'none']).default('dev-log'),
    KAVENEGAR_API_KEY: z.preprocess(emptyAsUnset, z.string().min(10).optional()),
    /** Name of the approved verify/lookup template whose %token is the sign-in code. */
    KAVENEGAR_OTP_TEMPLATE: z.preprocess(emptyAsUnset, z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).optional()),
    /** Dedicated sender line for notification texts; without it only sign-in codes are sent by SMS. */
    KAVENEGAR_SENDER: z.preprocess(emptyAsUnset, z.string().regex(/^[0-9]{4,20}$/).optional()),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug']).default('info'),
    OPENAPI_ENABLED: bool.default(true),
  })
  .superRefine((env, ctx) => {
    const prod = env.APP_ENV === 'production';
    const guard = (condition: boolean, path: string, message: string) => {
      if (condition) ctx.addIssue({ code: 'custom', path: [path], message });
    };
    guard(prod && env.PAYMENT_PROVIDER === 'simulator', 'PAYMENT_PROVIDER', 'The payment simulator is forbidden in production');
    guard(prod && env.SMS_PROVIDER === 'dev-log', 'SMS_PROVIDER', 'The development SMS adapter is forbidden in production');
    guard(prod && env.MALWARE_SCANNER === 'none-dev', 'MALWARE_SCANNER', 'A real malware scanner is required in production');
    guard(prod && env.QUEUE_DRIVER === 'inline', 'QUEUE_DRIVER', 'Production requires the Redis/BullMQ queue');
    guard(prod && !env.COOKIE_SECURE, 'COOKIE_SECURE', 'Secure cookies are required in production');
    guard(prod && !env.PUBLIC_BASE_URL.startsWith('https://'), 'PUBLIC_BASE_URL', 'Production must use https');
    guard(prod && env.OPENAPI_ENABLED, 'OPENAPI_ENABLED', 'Disable the public OpenAPI UI in production (export the spec instead)');
    guard(prod && env.PAYMENT_PROVIDER === 'zarinpal' && env.ZARINPAL_SANDBOX, 'ZARINPAL_SANDBOX', 'The Zarinpal sandbox is a test gateway and is forbidden in production');
    guard(
      env.PAYMENT_PROVIDER === 'zarinpal' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(env.PAYMENT_MERCHANT_ID),
      'PAYMENT_MERCHANT_ID',
      'Zarinpal needs the 36-character merchant ID from its panel',
    );
    if (env.SMS_PROVIDER === 'kavenegar') {
      guard(!env.KAVENEGAR_API_KEY, 'KAVENEGAR_API_KEY', 'KAVENEGAR_API_KEY is required when SMS_PROVIDER=kavenegar');
      guard(!env.KAVENEGAR_OTP_TEMPLATE, 'KAVENEGAR_OTP_TEMPLATE', 'KAVENEGAR_OTP_TEMPLATE (an approved verify template) is required when SMS_PROVIDER=kavenegar');
    }
    if (env.STORAGE_DRIVER === 's3') {
      for (const key of ['S3_ENDPOINT', 'S3_REGION', 'S3_PRIVATE_BUCKET', 'S3_PUBLIC_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) {
        guard(!env[key], key, `${key} is required when STORAGE_DRIVER=s3`);
      }
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached && source === process.env) return cached;
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    // Only variable names and messages are printed — never values.
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}

export const ENV = Symbol('HEDAX_ENV');

export function isProduction(env: Env): boolean {
  return env.APP_ENV === 'production';
}
