import { DomainError } from './errors.js';
import { toAsciiDigits } from './money.js';

/**
 * Sales units (panel → units): «عدد», «دست», «لیتر» … Quantities of a product are stored as whole
 * numbers of its unit's step (the smallest amount that can be sold), so stock, carts, orders and
 * returns stay integer columns: for «لیتر» with a step of 0.5, the stored 3 means 1.5 litres. For
 * every whole-number unit with step 1 the stored number is the quantity itself. The step of a unit
 * cannot change once a product uses it, so stored numbers never change meaning.
 */
export interface UnitRule {
  name: string;
  allowDecimal: boolean;
  /** The step in thousandths: 1000 = 1, 500 = 0.5. */
  stepMilli: number;
}

export const DEFAULT_UNIT_NAME = 'عدد';
export const DEFAULT_UNIT: UnitRule = { name: DEFAULT_UNIT_NAME, allowDecimal: false, stepMilli: 1000 };
export const MAX_STEP_MILLI = 1_000_000;

/** Problems of a unit definition: a whole-number unit has a whole step; any step is between 0.001 and 1000. */
export function unitRuleProblems(rule: Pick<UnitRule, 'allowDecimal' | 'stepMilli'>): Array<'STEP_INVALID' | 'STEP_NOT_WHOLE'> {
  const out: Array<'STEP_INVALID' | 'STEP_NOT_WHOLE'> = [];
  if (!Number.isSafeInteger(rule.stepMilli) || rule.stepMilli < 1 || rule.stepMilli > MAX_STEP_MILLI) out.push('STEP_INVALID');
  else if (!rule.allowDecimal && rule.stepMilli % 1000 !== 0) out.push('STEP_NOT_WHOLE');
  return out;
}

/**
 * Reads an amount written by a person or a spreadsheet: Latin, Persian or Arabic digits, with «.»,
 * «٫» or «/» as the decimal mark. Returns thousandths, or null when it is not a plain amount.
 */
export function parseAmountMilli(input: string | number): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? milliOf(input) : null;
  const s = toAsciiDigits(input.trim()).replace(/[٫/]/g, '.').replace(/[٬,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return milliOf(Number(s));
}

function milliOf(n: number): number | null {
  const m = Math.round(n * 1000);
  return Math.abs(n * 1000 - m) < 1e-6 && Number.isSafeInteger(m) ? m : null;
}

/**
 * Amount in the unit (e.g. 1.5 litres) → stored steps (3). Refused with UNIT_QUANTITY_INVALID when
 * it is not positive, has decimals in a whole-number unit, or is not a multiple of the step.
 */
export function quantityToSteps(amount: number | string, unit: UnitRule, opts: { allowZero?: boolean } = {}): number {
  const milli = parseAmountMilli(amount);
  const invalid = () => new DomainError('UNIT_QUANTITY_INVALID', `Not a valid quantity for ${unit.name}`, { unit: unit.name, step: unit.stepMilli / 1000, allowDecimal: unit.allowDecimal });
  if (milli === null || milli < 0 || (milli === 0 && !opts.allowZero)) throw invalid();
  if (!unit.allowDecimal && milli % 1000 !== 0) throw invalid();
  if (milli % unit.stepMilli !== 0) throw invalid();
  return milli / unit.stepMilli;
}

/** Stored steps → amount in the unit (3 steps of 0.5 litre → 1.5). */
export function stepsToQuantity(steps: number, unit: Pick<UnitRule, 'stepMilli'>): number {
  return (steps * unit.stepMilli) / 1000;
}

/** Whether an amount is allowed for the unit (without throwing). */
export function isValidQuantity(amount: number | string, unit: UnitRule): boolean {
  try {
    quantityToSteps(amount, unit);
    return true;
  } catch {
    return false;
  }
}

/**
 * Price of `steps` steps when the price is per unit: 1.5 litres at 100,000 per litre = 150,000.
 * Rounded half up to the rial; exact (no rounding) for whole-number units.
 */
export function lineAmountIrr(unitPriceIrr: bigint, steps: number, stepMilli = 1000): bigint {
  if (stepMilli === 1000) return unitPriceIrr * BigInt(steps);
  return (unitPriceIrr * BigInt(steps) * BigInt(stepMilli) + 500n) / 1000n;
}

/** Display form of an amount: 1.5 → "1.5" / "۱٫۵", 2 → "2" / "۲". */
export function formatQuantity(amount: number, locale: 'fa' | 'en'): string {
  const text = Number.isInteger(amount) ? String(amount) : String(Number(amount.toFixed(3)));
  if (locale === 'en') return text;
  return text.replace('.', '٫').replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);
}
