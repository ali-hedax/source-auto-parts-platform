import { describe, expect, it } from 'vitest';
import {
  addMoney,
  convertAedToIrr,
  convertIrrToAed,
  divideRounded,
  formatDecimalString,
  formatMoney,
  minorToDecimalString,
  money,
  parseDecimalAmount,
  parseRate,
} from '../src/index.js';

describe('money contract (A07)', () => {
  it('stores AED in fils and IRR in whole rials', () => {
    expect(parseDecimalAmount('12.5', 'AED')).toBe(1250n);
    expect(parseDecimalAmount('۱۲٫۵۰', 'AED')).toBe(1250n);
    expect(parseDecimalAmount('1,250,000', 'IRR')).toBe(1_250_000n);
    expect(() => parseDecimalAmount('10.5', 'IRR')).toThrow(/TOO_MANY_DECIMALS|decimal/);
    expect(() => parseDecimalAmount('1.234', 'AED')).toThrow();
    expect(minorToDecimalString(1250n, 'AED')).toBe('12.50');
    expect(minorToDecimalString(5n, 'AED')).toBe('0.05');
  });

  it('never adds IRR to AED without explicit conversion', () => {
    expect(() => addMoney(money('IRR', 100n), money('AED', 100n))).toThrow(/CURRENCY_MISMATCH|combine/);
  });

  it('converts fils to rials with the /100 scale and HALF_UP rounding', () => {
    // 12.50 AED × 175,000.5 IRR/AED = 2,187,506.25 → 2,187,506
    expect(convertAedToIrr(1250n, '175000.5')).toBe(2_187_506n);
    // 0.01 AED × 150 = 1.5 IRR → 2 (half up)
    expect(convertAedToIrr(1n, '150')).toBe(2n);
    // 0.01 AED × 149 = 1.49 → 1
    expect(convertAedToIrr(1n, '149')).toBe(1n);
    // exact
    expect(convertAedToIrr(100n, '165000')).toBe(165_000n);
  });

  it('supports rounding to a larger rial increment', () => {
    expect(divideRounded(12_345n, 1n, { mode: 'HALF_UP', incrementMinor: 10n })).toBe(12_350n);
    expect(divideRounded(12_344n, 1n, { mode: 'HALF_UP', incrementMinor: 10n })).toBe(12_340n);
    expect(divideRounded(-15n, 10n, { mode: 'HALF_UP', incrementMinor: 1n })).toBe(-2n);
  });

  it('converts IRR to AED reference amounts', () => {
    expect(convertIrrToAed(165_000n, '165000')).toBe(100n);
    expect(convertIrrToAed(1_000_000n, '165000')).toBe(606n); // 6.0606 AED → 6.06
  });

  it('rejects invalid rates instead of inventing one', () => {
    expect(() => parseRate('0')).toThrow();
    expect(() => parseRate('-5')).toThrow();
    expect(() => parseRate('abc')).toThrow();
    expect(parseRate('۱۶۵۰۰۰')).toEqual({ numerator: 165000n, denominator: 1n });
  });

  it('formats both currencies in both locales, and never as toman', () => {
    expect(formatMoney(money('IRR', 1_250_000n), 'en')).toBe('IRR 1,250,000');
    expect(formatMoney(money('AED', 1250n), 'en')).toBe('AED 12.50');
    const fa = formatMoney(money('IRR', 1_250_000n), 'fa');
    expect(fa.endsWith('ریال')).toBe(true);
    expect(fa).not.toContain('تومان');
    expect(fa).toContain('۱');
    expect(formatMoney(money('AED', 1250n), 'fa')).toBe('۱۲٫۵۰ درهم');
  });

  it('formats a recorded rate string in the locale digits without trailing zero decimals', () => {
    expect(formatDecimalString('140000.000000', 'en')).toBe('140,000');
    expect(formatDecimalString('140000.250000', 'en')).toBe('140,000.25');
    expect(formatDecimalString('140000.000000', 'fa')).toBe(new Intl.NumberFormat('fa-IR').format(140000));
    expect(formatDecimalString('140000.250000', 'fa')).toMatch(/^[۰-۹٬]+٫۲۵$/);
    expect(formatDecimalString('0.5', 'fa')).toBe('۰٫۵');
  });
});
