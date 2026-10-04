import { describe, expect, it } from 'vitest';
import { type PriceTier, displayUnitPrice, money, resolveUnitPrice } from '../src/index.js';

const now = new Date('2026-09-30T08:00:00Z');

function tier(partial: Partial<PriceTier> & Pick<PriceTier, 'id' | 'base'>): PriceTier {
  return {
    customerGroupId: null,
    minQty: 1,
    maxQty: null,
    manualIrrMinor: null,
    manualAedMinor: null,
    validFrom: null,
    validTo: null,
    active: true,
    ...partial,
  };
}

describe('price resolution priority (§9.1, A07)', () => {
  const publicAed = tier({ id: 'pub', base: money('AED', 1000n) }); // 10.00 AED

  it('converts an AED base price with the current rate', () => {
    const r = resolveUnitPrice([publicAed], { quantity: 2, approvedCustomerGroupId: null, irrPerAed: '160000', fxRateId: 'fx1', now });
    expect(r.status).toBe('PRICED');
    if (r.status !== 'PRICED') return;
    expect(r.unitPayableIrr).toBe(1_600_000n);
    expect(r.lineTotalIrr).toBe(3_200_000n);
    expect(r.payableSource).toBe('CONVERTED_FROM_AED');
    expect(r.fxRateId).toBe('fx1');
    expect(r.referenceAed).toEqual({ unitMinor: 1000n, source: 'BASE_AED' });
  });

  it('requires inquiry when no valid rate exists (never zero or invented)', () => {
    const r = resolveUnitPrice([publicAed], { quantity: 1, approvedCustomerGroupId: null, irrPerAed: null, fxRateId: null, now });
    expect(r).toMatchObject({ status: 'INQUIRY_REQUIRED', reason: 'NO_VALID_FX_RATE' });
  });

  it('lets a manual IRR price beat automatic conversion', () => {
    const t = tier({ id: 'pub', base: money('AED', 1000n), manualIrrMinor: 1_550_000n });
    const r = resolveUnitPrice([t], { quantity: 1, approvedCustomerGroupId: null, irrPerAed: null, fxRateId: null, now });
    expect(r).toMatchObject({ status: 'PRICED', unitPayableIrr: 1_550_000n, payableSource: 'MANUAL_IRR' });
  });

  it('treats manual AED as reference only and warns when inconsistent', () => {
    const t = tier({ id: 'pub', base: money('IRR', 1_600_000n), manualAedMinor: 500n });
    const r = resolveUnitPrice([t], { quantity: 1, approvedCustomerGroupId: null, irrPerAed: '160000', fxRateId: 'fx', now });
    expect(r.status).toBe('PRICED');
    if (r.status !== 'PRICED') return;
    expect(r.unitPayableIrr).toBe(1_600_000n);
    expect(r.referenceAed).toEqual({ unitMinor: 500n, source: 'MANUAL_AED' });
    expect(r.warnings).toContain('MANUAL_AED_INCONSISTENT_WITH_IRR');
  });

  it('prefers an approved group rule and the most specific quantity tier', () => {
    const tiers = [
      tier({ id: 'pub', base: money('IRR', 1_000_000n) }),
      tier({ id: 'pub10', base: money('IRR', 950_000n), minQty: 10 }),
      tier({ id: 'ws', customerGroupId: 'wholesale', base: money('IRR', 900_000n) }),
      tier({ id: 'ws20', customerGroupId: 'wholesale', base: money('IRR', 850_000n), minQty: 20 }),
    ];
    const base = { irrPerAed: null, fxRateId: null, now };
    expect(resolveUnitPrice(tiers, { ...base, quantity: 1, approvedCustomerGroupId: null })).toMatchObject({ tierId: 'pub' });
    expect(resolveUnitPrice(tiers, { ...base, quantity: 12, approvedCustomerGroupId: null })).toMatchObject({ tierId: 'pub10' });
    expect(resolveUnitPrice(tiers, { ...base, quantity: 5, approvedCustomerGroupId: 'wholesale' })).toMatchObject({ tierId: 'ws', tierSource: 'GROUP_RULE' });
    expect(resolveUnitPrice(tiers, { ...base, quantity: 25, approvedCustomerGroupId: 'wholesale' })).toMatchObject({ tierId: 'ws20' });
    // Unknown/unapproved group falls back to public price.
    expect(resolveUnitPrice(tiers, { ...base, quantity: 1, approvedCustomerGroupId: 'garage' })).toMatchObject({ tierId: 'pub' });
  });

  it('ignores expired or inactive tiers', () => {
    const tiers = [
      tier({ id: 'pub', base: money('IRR', 1_000_000n) }),
      tier({ id: 'promo', base: money('IRR', 1n), validTo: new Date('2026-09-01T00:00:00Z'), minQty: 1, customerGroupId: null }),
      tier({ id: 'off', base: money('IRR', 2n), active: false }),
    ];
    const r = resolveUnitPrice(tiers, { quantity: 1, approvedCustomerGroupId: null, irrPerAed: null, fxRateId: null, now });
    expect(r).toMatchObject({ tierId: 'pub' });
  });

  it('keeps the display currency independent from the payable amount', () => {
    const r = resolveUnitPrice([publicAed], { quantity: 1, approvedCustomerGroupId: null, irrPerAed: '160000', fxRateId: 'fx', now });
    const inAed = displayUnitPrice(r, 'AED');
    const inIrr = displayUnitPrice(r, 'IRR');
    expect(inAed).toMatchObject({ kind: 'price', currency: 'AED', isReference: true, payableIrr: 1_600_000n });
    expect(inIrr).toMatchObject({ kind: 'price', currency: 'IRR', isReference: false, payableIrr: 1_600_000n });
  });
});
