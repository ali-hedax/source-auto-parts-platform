import { toAsciiDigits } from './money.js';

export type MobileParseResult =
  | { ok: true; e164: string; national: string }
  | { ok: false; reason: 'EMPTY' | 'INVALID_FORMAT' };

/**
 * Normalizes an Iranian mobile number. Accepts 09…, 9…, +98 9…, 0098 9…, 98 9…,
 * Persian/Arabic digits and common separators. Returns E.164 (+989XXXXXXXXX).
 */
export function normalizeIranMobile(input: string): MobileParseResult {
  const cleaned = toAsciiDigits(input).replace(/[\s\-().‌‏‎]/g, '');
  if (cleaned.length === 0) return { ok: false, reason: 'EMPTY' };
  const match = /^(?:\+98|0098|98|0)?(9\d{9})$/.exec(cleaned);
  if (!match?.[1]) return { ok: false, reason: 'INVALID_FORMAT' };
  const subscriber = match[1];
  return { ok: true, e164: `+98${subscriber}`, national: `0${subscriber}` };
}

/** Masks a phone for logs and staff lists that do not need the full number: +98912***4567. */
export function maskPhone(e164: string): string {
  if (e164.length < 8) return '***';
  return `${e164.slice(0, 6)}***${e164.slice(-4)}`;
}
