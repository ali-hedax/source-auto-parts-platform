import { toAsciiDigits } from '@hedax/domain';

/**
 * A number typed by a person. Persian and Arabic-Indic digits and the Persian
 * decimal separator «٫» are accepted («۱۵» → 15, «۹٫۵» → 9.5); `Number()` alone
 * turns them into NaN. Empty or non-numeric text gives NaN, so callers keep
 * their own default (`typedNumber(x) || 1`) or validation.
 */
export function typedNumber(text: string | number): number {
  const s = toAsciiDigits(String(text)).replace(/٫/g, '.').trim();
  return s === '' ? Number.NaN : Number(s);
}
