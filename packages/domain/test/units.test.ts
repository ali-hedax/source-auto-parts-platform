import { describe, expect, it } from 'vitest';
import { DEFAULT_UNIT, formatQuantity, isValidQuantity, lineAmountIrr, parseAmountMilli, quantityToSteps, stepsToQuantity, unitRuleProblems, type UnitRule } from '../src/index.js';

const piece: UnitRule = DEFAULT_UNIT;
const set: UnitRule = { name: 'دست', allowDecimal: false, stepMilli: 1000 };
const litre: UnitRule = { name: 'لیتر', allowDecimal: true, stepMilli: 500 };

describe('sales units', () => {
  it('whole-number units (عدد, دست) refuse decimals; the stored number is the quantity itself', () => {
    for (const u of [piece, set]) {
      expect(quantityToSteps(3, u)).toBe(3);
      expect(quantityToSteps('۳', u)).toBe(3);
      expect(() => quantityToSteps(1.5, u)).toThrow(/UNIT_QUANTITY_INVALID|valid quantity/);
      expect(() => quantityToSteps('2.5', u)).toThrow();
      expect(() => quantityToSteps(0, u)).toThrow();
      expect(() => quantityToSteps(-1, u)).toThrow();
      expect(stepsToQuantity(3, u)).toBe(3);
    }
  });

  it('litre allows halves only: 1.5 → 3 steps, 1.25 refused', () => {
    expect(quantityToSteps(1.5, litre)).toBe(3);
    expect(quantityToSteps('۱٫۵', litre)).toBe(3);
    expect(quantityToSteps('2/5', litre)).toBe(5);
    expect(quantityToSteps(4, litre)).toBe(8);
    expect(() => quantityToSteps(1.25, litre)).toThrow(/UNIT_QUANTITY_INVALID|valid quantity/);
    expect(() => quantityToSteps('abc', litre)).toThrow();
    expect(stepsToQuantity(3, litre)).toBe(1.5);
    expect(isValidQuantity(0.5, litre)).toBe(true);
    expect(isValidQuantity(0.3, litre)).toBe(false);
    expect(quantityToSteps(0, litre, { allowZero: true })).toBe(0);
  });

  it('prices per unit: 1.5 litres at 100,000 = 150,000; whole units are exact', () => {
    expect(lineAmountIrr(100_000n, 3, 500)).toBe(150_000n);
    expect(lineAmountIrr(2_500_000n, 4)).toBe(10_000_000n);
    // Half a rial rounds up.
    expect(lineAmountIrr(3n, 1, 500)).toBe(2n);
  });

  it('checks unit definitions and formats amounts', () => {
    expect(unitRuleProblems({ allowDecimal: true, stepMilli: 500 })).toEqual([]);
    expect(unitRuleProblems({ allowDecimal: false, stepMilli: 500 })).toEqual(['STEP_NOT_WHOLE']);
    expect(unitRuleProblems({ allowDecimal: false, stepMilli: 0 })).toEqual(['STEP_INVALID']);
    expect(parseAmountMilli('1,000')).toBe(1_000_000);
    expect(parseAmountMilli('1.0001')).toBeNull();
    expect(formatQuantity(1.5, 'fa')).toBe('۱٫۵');
    expect(formatQuantity(2, 'en')).toBe('2');
  });
});
