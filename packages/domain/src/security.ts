import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** One-time login code policy (spec §14). Values are defaults, overridable via config. */
export const OTP_POLICY = {
  length: 6,
  ttlSeconds: 120,
  maxVerifyAttempts: 5,
  resendCooldownSeconds: 60,
  maxSendsPerPhonePerHour: 5,
  maxSendsPerIpPerHour: 20,
} as const;

export function generateOtp(length: number = OTP_POLICY.length): string {
  let code = '';
  for (let i = 0; i < length; i += 1) code += String(randomInt(0, 10));
  return code;
}

/** Codes are stored only as HMAC(pepper, phone:code); the pepper lives in env, not the DB. */
export function hashOtp(code: string, phoneE164: string, pepper: string): string {
  return createHmac('sha256', pepper).update(`${phoneE164}:${code}`).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}

export function verifyOtpHash(code: string, phoneE164: string, pepper: string, storedHash: string): boolean {
  return safeEqualHex(hashOtp(code, phoneE164, pepper), storedHash);
}

/** 256-bit random opaque token (session ids, invitation tokens, bootstrap tokens). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Only the SHA-256 of a session/invitation token is stored in the database. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Human-friendly unguessable reference, e.g. HX-R-7K2M9QXA. */
export function humanReference(prefix: string, length = 8): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += CROCKFORD[(bytes[i] ?? 0) % 32];
  return `${prefix}-${out}`;
}

export const REFERENCE_PREFIX = {
  sourcingRequest: 'HX-R',
  stockOrder: 'HX-O',
  procurement: 'HX-P',
  quote: 'HX-Q',
  payment: 'HX-PAY',
  refund: 'HX-RF',
  returnRequest: 'HX-RT',
} as const;

/** Staff password rule: length is what matters; block trivially weak values. */
export function passwordProblems(password: string, context: readonly string[] = []): string[] {
  const problems: string[] = [];
  if (password.length < 12) problems.push('TOO_SHORT');
  if (password.length > 256) problems.push('TOO_LONG');
  if (/^(.)\1+$/.test(password)) problems.push('REPEATED_CHARACTER');
  const lower = password.toLowerCase();
  if (['password', '123456', 'qwerty', 'hedax', 'admin'].some((w) => lower.includes(w))) problems.push('COMMON_WORD');
  if (context.some((c) => c.length >= 4 && lower.includes(c.toLowerCase()))) problems.push('CONTAINS_PERSONAL_INFO');
  return problems;
}
