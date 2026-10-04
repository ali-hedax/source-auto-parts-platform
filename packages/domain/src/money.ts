import { DomainError } from './errors.js';

/**
 * Money is always an integer count of the currency's minor unit.
 * - IRR: 1 minor unit = 1 rial (scale 0). Toman is never used as a unit.
 * - AED: 1 minor unit = 1 fils = 1/100 dirham (scale 2).
 * Floating point numbers are never used for money.
 */
export const CURRENCIES = ['IRR', 'AED'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const CURRENCY_SCALE: Record<CurrencyCode, number> = { IRR: 0, AED: 2 };

export interface Money {
  readonly currency: CurrencyCode;
  readonly minor: bigint;
}

/** JSON wire format: amounts travel as strings so they never pass through Number. */
export interface MoneyJson {
  currency: CurrencyCode;
  amountMinor: string;
}

const INTEGER_RE = /^-?\d+$/;

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value);
}

export function parseMinor(value: string | bigint): bigint {
  if (typeof value === 'bigint') return value;
  const trimmed = value.trim();
  if (!INTEGER_RE.test(trimmed)) {
    throw new DomainError('INVALID_AMOUNT', `Amount must be an integer minor-unit string, got "${value}"`);
  }
  return BigInt(trimmed);
}

export function money(currency: CurrencyCode, minor: bigint | string): Money {
  if (!isCurrencyCode(currency)) throw new DomainError('UNKNOWN_CURRENCY', `Unknown currency ${String(currency)}`);
  return { currency, minor: parseMinor(minor) };
}

export function moneyToJson(value: Money): MoneyJson {
  return { currency: value.currency, amountMinor: value.minor.toString() };
}

export function moneyFromJson(value: MoneyJson): Money {
  return money(value.currency, value.amountMinor);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new DomainError('CURRENCY_MISMATCH', `Cannot combine ${a.currency} with ${b.currency} without an explicit conversion`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { currency: a.currency, minor: a.minor + b.minor };
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { currency: a.currency, minor: a.minor - b.minor };
}

export function multiplyMoney(value: Money, quantity: number | bigint): Money {
  const q = typeof quantity === 'bigint' ? quantity : BigInt(assertSafeInteger(quantity, 'quantity'));
  return { currency: value.currency, minor: value.minor * q };
}

export function sumMoney(currency: CurrencyCode, values: readonly Money[]): Money {
  return values.reduce<Money>((acc, item) => addMoney(acc, item), { currency, minor: 0n });
}

export function assertSafeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value)) throw new DomainError('INVALID_INTEGER', `${field} must be a safe integer`);
  return value;
}

/**
 * Parses a human decimal amount ("12.5", "1,250,000", "۱۲٫۵۰") in major units into minor units.
 * Rejects more fractional digits than the currency allows instead of rounding silently.
 */
export function parseDecimalAmount(input: string, currency: CurrencyCode): bigint {
  const scale = CURRENCY_SCALE[currency];
  const normalized = toAsciiDigits(input)
    .replace(/[,٬\s]/g, '')
    .replace(/٫/g, '.');
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) throw new DomainError('INVALID_AMOUNT', `Not a decimal amount: "${input}"`);
  const [, sign, whole, fraction = ''] = match;
  if (fraction.length > scale) {
    throw new DomainError('TOO_MANY_DECIMALS', `${currency} allows at most ${scale} decimal places`);
  }
  const minor = BigInt((whole ?? '0') + fraction.padEnd(scale, '0'));
  return sign === '-' ? -minor : minor;
}

/** Minor units → canonical decimal string in major units ("1250" AED → "12.50"). */
export function minorToDecimalString(minor: bigint, currency: CurrencyCode): string {
  const scale = CURRENCY_SCALE[currency];
  const negative = minor < 0n;
  const abs = (negative ? -minor : minor).toString();
  if (scale === 0) return (negative ? '-' : '') + abs;
  const padded = abs.padStart(scale + 1, '0');
  const whole = padded.slice(0, -scale);
  const fraction = padded.slice(-scale);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function toAsciiDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const p = PERSIAN_DIGITS.indexOf(ch);
    if (p >= 0) {
      out += String(p);
      continue;
    }
    const a = ARABIC_DIGITS.indexOf(ch);
    out += a >= 0 ? String(a) : ch;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Exchange rate: `irr_per_aed` = how many rials one dirham buys.
// ---------------------------------------------------------------------------

export interface RateFraction {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

const RATE_RE = /^(\d+)(?:\.(\d{1,6}))?$/;

/** Parses a positive decimal rate with up to 6 fractional digits into an exact fraction. */
export function parseRate(rate: string): RateFraction {
  const match = RATE_RE.exec(toAsciiDigits(rate.trim()));
  if (!match) throw new DomainError('INVALID_FX_RATE', `Invalid irr_per_aed rate "${rate}"`);
  const [, whole, fraction = ''] = match;
  const numerator = BigInt((whole ?? '0') + fraction);
  const denominator = 10n ** BigInt(fraction.length);
  if (numerator <= 0n) throw new DomainError('INVALID_FX_RATE', 'irr_per_aed must be greater than zero');
  return { numerator, denominator };
}

/**
 * Rounding rule applied when a conversion produces a fractional result.
 * HALF_UP rounds halves away from zero. `incrementMinor` lets the owner round
 * to e.g. 10 rial; the default is 1 (whole rial). The rule id is stored in
 * every snapshot so historic amounts stay explainable.
 */
export interface RoundingRule {
  readonly mode: 'HALF_UP';
  readonly incrementMinor: bigint;
}

export const DEFAULT_IRR_ROUNDING: RoundingRule = { mode: 'HALF_UP', incrementMinor: 1n };
export const DEFAULT_AED_ROUNDING: RoundingRule = { mode: 'HALF_UP', incrementMinor: 1n };

export function roundingRuleId(rule: RoundingRule): string {
  return `${rule.mode}:${rule.incrementMinor.toString()}`;
}

/** Divides numerator/denominator and rounds half away from zero to a multiple of increment. */
export function divideRounded(numerator: bigint, denominator: bigint, rule: RoundingRule): bigint {
  if (denominator === 0n) throw new DomainError('DIVISION_BY_ZERO');
  if (rule.incrementMinor <= 0n) throw new DomainError('INVALID_ROUNDING_INCREMENT');
  const d = denominator * rule.incrementMinor;
  const negative = numerator < 0n !== d < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const dd = d < 0n ? -d : d;
  const q = (2n * n + dd) / (2n * dd);
  const units = negative ? -q : q;
  return units * rule.incrementMinor;
}

/** AED (fils) → IRR (rial): rial = fils × irr_per_aed / 100. */
export function convertAedToIrr(fils: bigint, rate: string | RateFraction, rule: RoundingRule = DEFAULT_IRR_ROUNDING): bigint {
  const r = typeof rate === 'string' ? parseRate(rate) : rate;
  return divideRounded(fils * r.numerator, r.denominator * 100n, rule);
}

/** IRR (rial) → AED (fils) for reference display only: fils = rial × 100 / irr_per_aed. */
export function convertIrrToAed(rial: bigint, rate: string | RateFraction, rule: RoundingRule = DEFAULT_AED_ROUNDING): bigint {
  const r = typeof rate === 'string' ? parseRate(rate) : rate;
  return divideRounded(rial * 100n * r.denominator, r.numerator, rule);
}

export function convertMoney(value: Money, target: CurrencyCode, rate: string | null | undefined, rule?: RoundingRule): Money {
  if (value.currency === target) return value;
  if (!rate) throw new DomainError('FX_RATE_UNAVAILABLE', 'No valid irr_per_aed rate for conversion');
  if (value.currency === 'AED' && target === 'IRR') return { currency: 'IRR', minor: convertAedToIrr(value.minor, rate, rule) };
  return { currency: 'AED', minor: convertIrrToAed(value.minor, rate, rule) };
}

// ---------------------------------------------------------------------------
// Formatting (locale-aware, never through Number)
// ---------------------------------------------------------------------------

export type UiLocale = 'fa' | 'en';

const UNIT_LABEL: Record<UiLocale, Record<CurrencyCode, string>> = {
  fa: { IRR: 'ریال', AED: 'درهم' },
  en: { IRR: 'IRR', AED: 'AED' },
};

export function currencyLabel(currency: CurrencyCode, locale: UiLocale): string {
  return UNIT_LABEL[locale][currency];
}

function intlLocale(locale: UiLocale): string {
  return locale === 'fa' ? 'fa-IR' : 'en-US';
}

/** Formats a minor-unit amount as a localized number without a unit. */
export function formatMinorNumber(minor: bigint, currency: CurrencyCode, locale: UiLocale): string {
  const scale = CURRENCY_SCALE[currency];
  const nf = new Intl.NumberFormat(intlLocale(locale), { useGrouping: true, maximumFractionDigits: 0 });
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const divisor = 10n ** BigInt(scale);
  const whole = abs / divisor;
  let text = nf.format(whole);
  if (scale > 0) {
    const fraction = (abs % divisor).toString().padStart(scale, '0');
    const decimalSep = locale === 'fa' ? '٫' : '.';
    const localizedFraction = locale === 'fa' ? toPersianDigits(fraction) : fraction;
    text += decimalSep + localizedFraction;
  }
  if (negative) text = (locale === 'fa' ? '−' : '-') + text;
  return text;
}

/** "۱٬۲۵۰٬۰۰۰ ریال" / "IRR 1,250,000" / "AED 12.50" / "۱۲٫۵۰ درهم". */
export function formatMoney(value: Money, locale: UiLocale): string {
  const number = formatMinorNumber(value.minor, value.currency, locale);
  const unit = currencyLabel(value.currency, locale);
  return locale === 'fa' ? `${number} ${unit}` : `${unit} ${number}`;
}

/**
 * A non-negative decimal string (e.g. a recorded IRR-per-AED rate "140000.250000")
 * grouped in the locale's digits, trailing zero decimals dropped: "۱۴۰٬۰۰۰٫۲۵" /
 * "140,000.25". Display only; never parse the result back.
 */
export function formatDecimalString(value: string, locale: UiLocale): string {
  const [whole = '0', fraction = ''] = value.trim().split('.');
  const grouped = new Intl.NumberFormat(intlLocale(locale), { useGrouping: true, maximumFractionDigits: 0 }).format(BigInt(whole || '0'));
  const frac = fraction.replace(/0+$/, '');
  if (!frac) return grouped;
  return locale === 'fa' ? `${grouped}٫${toPersianDigits(frac)}` : `${grouped}.${frac}`;
}

export function toPersianDigits(input: string): string {
  return input.replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d);
}
