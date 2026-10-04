import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLES,
  assertCanGrant,
  assertNotLastOwner,
  assertRefundWithinCap,
  computeOrderTotals,
  computeQuoteTotals,
  conversationScope,
  decideReservationExpiry,
  evaluateVerification,
  money,
  quotePaymentBlockers,
  remainingRefundable,
  resolveLateSuccess,
} from '../src/index.js';
import { generateOtp, hashOtp, humanReference, passwordProblems, verifyOtpHash } from '../src/server.js';

describe('order totals (§7)', () => {
  it('blocks payment when the shipping cost is unknown instead of assuming 0', () => {
    const t = computeOrderTotals({ lines: [{ unitPayableIrr: 1_000_000n, quantity: 2 }], shipping: { status: 'UNKNOWN', methodId: null }, tax: null });
    expect(t.payable).toBe(false);
    expect(t.blockers).toContain('SHIPPING_COST_UNKNOWN');
    expect(t.grandTotal).toBeNull();
  });

  it('applies configured tax with rounding', () => {
    const t = computeOrderTotals({
      lines: [{ unitPayableIrr: 1_000_005n, quantity: 1 }],
      shipping: { status: 'KNOWN', methodId: 'post', costIrr: 500_000n },
      tax: { id: 'vat', version: 1, rateBasisPoints: 1000, base: 'ITEMS' },
    });
    expect(t.tax).toBe(100_001n); // 100,000.5 → 100,001
    expect(t.grandTotal).toBe(1_000_005n + 500_000n + 100_001n);
    expect(t.payable).toBe(true);
  });
});

describe('quote totals (§8, A06, A15)', () => {
  it('uses the rate snapshot and excludes unavailable or declined items', () => {
    const totals = computeQuoteTotals({
      items: [
        { id: 'a', availability: 'AVAILABLE', included: true, quantity: 2, unitPrice: money('AED', 1000n), discount: null },
        { id: 'b', availability: 'UNAVAILABLE', included: true, quantity: 1, unitPrice: money('IRR', 999n), discount: null },
        { id: 'c', availability: 'AVAILABLE', included: false, quantity: 1, unitPrice: money('IRR', 777n), discount: null },
      ],
      costs: [{ code: 'SHIPPING', label: 'Post', amount: money('IRR', 400_000n) }],
      irrPerAed: '160000',
      tax: null,
    });
    expect(totals.itemsIrr).toBe(3_200_000n);
    expect(totals.totalPayableIrr).toBe(3_600_000n);
    expect(totals.referenceTotalAed).toBe(2250n);
    expect(totals.itemLines.map((l) => l.included)).toEqual([true, false, false]);
  });

  it('fails loudly when AED amounts exist without a recorded rate', () => {
    expect(() =>
      computeQuoteTotals({
        items: [{ id: 'a', availability: 'AVAILABLE', included: true, quantity: 1, unitPrice: money('AED', 1n), discount: null }],
        costs: [],
        irrPerAed: null,
        tax: null,
      }),
    ).toThrow(/FX_RATE_UNAVAILABLE|rate/);
  });

  it('A13/A14: only an accepted, unexpired, unpaid version can start a payment', () => {
    const now = new Date('2026-10-01T00:00:00Z');
    const ok = { status: 'ACCEPTED', validUntil: new Date('2026-10-02T00:00:00Z'), now, totalPayableIrr: 10n, hasSucceededPayment: false };
    expect(quotePaymentBlockers(ok)).toEqual([]);
    expect(quotePaymentBlockers({ ...ok, status: 'SUPERSEDED' })).toContain('NOT_ACCEPTED');
    expect(quotePaymentBlockers({ ...ok, validUntil: now })).toContain('EXPIRED');
    expect(quotePaymentBlockers({ ...ok, hasSucceededPayment: true })).toContain('ALREADY_PAID');
  });
});

describe('payment verification (A09–A12)', () => {
  const expected = { providerReference: 'ref-1', amountIrr: 1_000_000n, merchantId: 'm-1' };
  const base = { providerReference: 'ref-1', amountIrr: 1_000_000n, merchantId: 'm-1', providerTransactionId: 't', cardMask: null, raw: {} };

  it('accepts only a matching server-verified success', () => {
    expect(evaluateVerification(expected, { ...base, status: 'SUCCEEDED' })).toEqual({ outcome: 'SUCCEEDED', overpaymentIrr: 0n });
    expect(evaluateVerification(expected, { ...base, status: 'SUCCEEDED', amountIrr: 999_999n })).toMatchObject({ outcome: 'MISMATCH' });
    expect(evaluateVerification(expected, { ...base, status: 'SUCCEEDED', merchantId: 'other' })).toMatchObject({ outcome: 'MISMATCH' });
    expect(evaluateVerification(expected, { ...base, status: 'SUCCEEDED', amountIrr: 1_100_000n })).toEqual({ outcome: 'SUCCEEDED', overpaymentIrr: 100_000n });
  });

  it('keeps unknown results pending instead of failing them', () => {
    expect(evaluateVerification(expected, { ...base, status: 'UNKNOWN' })).toEqual({ outcome: 'PENDING_VERIFICATION' });
  });

  it('never releases a reservation whose payment is still in flight', () => {
    const now = new Date('2026-10-01T00:20:00Z');
    const expiresAt = new Date('2026-10-01T00:15:00Z');
    expect(decideReservationExpiry({ now, expiresAt, attempts: [{ status: 'SUCCEEDED', providerDeadline: null }], graceMs: 0 })).toEqual({ action: 'CONSUME' });
    expect(
      decideReservationExpiry({ now, expiresAt, attempts: [{ status: 'PENDING', providerDeadline: new Date('2026-10-01T00:18:00Z') }], graceMs: 5 * 60_000 }),
    ).toMatchObject({ action: 'EXTEND' });
    expect(decideReservationExpiry({ now, expiresAt, attempts: [{ status: 'FAILED', providerDeadline: null }], graceMs: 0 })).toEqual({ action: 'RELEASE' });
  });

  it('A12: late success re-allocates or opens a refund case', () => {
    expect(resolveLateSuccess(2, 1)).toEqual({ action: 'REALLOCATE_STOCK' });
    expect(resolveLateSuccess(0, 1)).toEqual({ action: 'OPEN_REFUND_CASE', reason: 'STOCK_UNAVAILABLE' });
  });
});

describe('refund caps (§9.2)', () => {
  it('counts succeeded and in-flight refunds against the captured amount', () => {
    const refunds = [
      { status: 'SUCCEEDED' as const, amountIrr: 300n },
      { status: 'PROCESSING' as const, amountIrr: 200n },
      { status: 'FAILED' as const, amountIrr: 900n },
      { status: 'REJECTED' as const, amountIrr: 900n },
    ];
    expect(remainingRefundable(1000n, refunds)).toBe(500n);
    expect(() => assertRefundWithinCap(1000n, refunds, 501n)).toThrow(/REFUND_EXCEEDS_REMAINING|exceeds/);
    expect(() => assertRefundWithinCap(1000n, refunds, 500n)).not.toThrow();
  });
});

describe('RBAC (§13, A18)', () => {
  it('support role cannot change prices or roles', () => {
    const support = new Set(DEFAULT_ROLES.find((r) => r.key === 'support')!.permissions);
    expect(support.has('prices.write')).toBe(false);
    expect(support.has('roles.manage')).toBe(false);
    expect(conversationScope(support)).toBe('ASSIGNED');
  });

  it('prevents granting permissions the actor does not hold', () => {
    const sales = new Set<string>(DEFAULT_ROLES.find((r) => r.key === 'sales_manager')!.permissions);
    expect(() => assertCanGrant(sales, ['quotes.publish'])).not.toThrow();
    expect(() => assertCanGrant(sales, ['payments.refund'])).toThrow(/PERMISSION_ESCALATION|grant/);
    expect(() => assertCanGrant(new Set(ALL_PERMISSIONS), ['made.up'])).toThrow(/UNKNOWN_PERMISSION|Unknown/);
  });

  it('protects the last owner', () => {
    expect(() => assertNotLastOwner(['u1'], 'u1')).toThrow(/LAST_OWNER|last owner/);
    expect(() => assertNotLastOwner(['u1', 'u2'], 'u1')).not.toThrow();
  });
});

describe('server security helpers (§14)', () => {
  it('generates, hashes and verifies OTPs without storing the code', () => {
    const code = generateOtp();
    expect(code).toMatch(/^\d{6}$/);
    const hash = hashOtp(code, '+989121234567', 'pepper');
    expect(verifyOtpHash(code, '+989121234567', 'pepper', hash)).toBe(true);
    expect(verifyOtpHash(code, '+989121234568', 'pepper', hash)).toBe(false);
    expect(verifyOtpHash('000000' === code ? '111111' : '000000', '+989121234567', 'pepper', hash)).toBe(false);
  });

  it('creates unguessable references and rejects weak passwords', () => {
    expect(humanReference('HX-R')).toMatch(/^HX-R-[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(passwordProblems('short')).toContain('TOO_SHORT');
    expect(passwordProblems('HedaxPassword123')).toContain('COMMON_WORD');
    expect(passwordProblems('correct horse battery staple')).toEqual([]);
  });
});
