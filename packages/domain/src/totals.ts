import { DomainError } from './errors.js';
import {
  type CurrencyCode,
  type Money,
  type RoundingRule,
  DEFAULT_IRR_ROUNDING,
  convertAedToIrr,
  convertIrrToAed,
  divideRounded,
  roundingRuleId,
} from './money.js';

/**
 * Tax configuration comes from owner settings. When no tax rule is configured
 * nothing is added; the snapshot records that fact so it is never implied.
 */
export interface TaxRule {
  id: string;
  version: number;
  rateBasisPoints: number; // 900 = 9%
  base: 'ITEMS' | 'ITEMS_AND_SHIPPING';
}

export type ShippingQuote =
  | { status: 'KNOWN'; methodId: string; costIrr: bigint }
  | { status: 'UNKNOWN'; methodId: string | null };

export interface OrderLineInput {
  unitPayableIrr: bigint;
  quantity: number;
}

export interface OrderTotals {
  currency: 'IRR';
  itemsTotal: bigint;
  discount: bigint;
  shipping: bigint | null;
  tax: bigint;
  grandTotal: bigint | null;
  taxRule: { id: string; version: number } | null;
  roundingRule: string;
  payable: boolean;
  blockers: Array<'SHIPPING_COST_UNKNOWN' | 'EMPTY_ORDER' | 'NON_POSITIVE_TOTAL'>;
}

/** Stock-order totals. Everything is IRR; an unknown shipping cost blocks payment (never 0). */
export function computeOrderTotals(input: {
  lines: readonly OrderLineInput[];
  shipping: ShippingQuote;
  discountIrr?: bigint;
  tax: TaxRule | null;
  rounding?: RoundingRule;
}): OrderTotals {
  const rounding = input.rounding ?? DEFAULT_IRR_ROUNDING;
  const blockers: OrderTotals['blockers'] = [];
  if (input.lines.length === 0) blockers.push('EMPTY_ORDER');
  let itemsTotal = 0n;
  for (const l of input.lines) {
    if (!Number.isSafeInteger(l.quantity) || l.quantity < 1) throw new DomainError('INVALID_QUANTITY');
    if (l.unitPayableIrr <= 0n) throw new DomainError('INVALID_UNIT_PRICE');
    itemsTotal += l.unitPayableIrr * BigInt(l.quantity);
  }
  const discount = input.discountIrr ?? 0n;
  if (discount < 0n || discount > itemsTotal) throw new DomainError('INVALID_DISCOUNT');
  const shipping = input.shipping.status === 'KNOWN' ? input.shipping.costIrr : null;
  if (shipping !== null && shipping < 0n) throw new DomainError('INVALID_SHIPPING_COST');
  if (shipping === null) blockers.push('SHIPPING_COST_UNKNOWN');

  let tax = 0n;
  if (input.tax) {
    const base = itemsTotal - discount + (input.tax.base === 'ITEMS_AND_SHIPPING' ? (shipping ?? 0n) : 0n);
    tax = divideRounded(base * BigInt(input.tax.rateBasisPoints), 10_000n, rounding);
  }
  const grandTotal = shipping === null ? null : itemsTotal - discount + shipping + tax;
  if (grandTotal !== null && grandTotal <= 0n) blockers.push('NON_POSITIVE_TOTAL');
  return {
    currency: 'IRR',
    itemsTotal,
    discount,
    shipping,
    tax,
    grandTotal,
    taxRule: input.tax ? { id: input.tax.id, version: input.tax.version } : null,
    roundingRule: roundingRuleId(rounding),
    payable: blockers.length === 0,
    blockers,
  };
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

export type QuoteItemAvailability = 'AVAILABLE' | 'UNAVAILABLE';

export interface QuoteItemInput {
  id: string;
  availability: QuoteItemAvailability;
  /** Only items the customer explicitly accepted are payable; unavailable items never are. */
  included: boolean;
  quantity: number;
  unitPrice: Money;
  discount: Money | null;
}

export interface QuoteCostInput {
  code: 'SHIPPING' | 'OTHER';
  label: string;
  amount: Money;
}

export interface QuoteTotals {
  itemLines: Array<{ id: string; included: boolean; lineIrr: bigint | null }>;
  itemsIrr: bigint;
  costsIrr: bigint;
  taxIrr: bigint;
  totalPayableIrr: bigint;
  referenceTotalAed: bigint | null;
  irrPerAed: string | null;
  roundingRule: string;
}

function toIrr(value: Money, rate: string | null, rounding: RoundingRule): bigint {
  if (value.currency === 'IRR') return value.minor;
  if (!rate) throw new DomainError('FX_RATE_UNAVAILABLE', 'Quote contains AED amounts but no valid rate is recorded');
  return convertAedToIrr(value.minor, rate, rounding);
}

/**
 * Quote version totals. Uses the rate recorded on the version (snapshot), so
 * later rate changes never alter an issued quote.
 */
export function computeQuoteTotals(input: {
  items: readonly QuoteItemInput[];
  costs: readonly QuoteCostInput[];
  irrPerAed: string | null;
  tax: TaxRule | null;
  rounding?: RoundingRule;
}): QuoteTotals {
  const rounding = input.rounding ?? DEFAULT_IRR_ROUNDING;
  let itemsIrr = 0n;
  const itemLines: QuoteTotals['itemLines'] = [];
  for (const item of input.items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new DomainError('INVALID_QUANTITY');
    const payable = item.included && item.availability === 'AVAILABLE';
    if (!payable) {
      itemLines.push({ id: item.id, included: false, lineIrr: null });
      continue;
    }
    const unitIrr = toIrr(item.unitPrice, input.irrPerAed, rounding);
    const discountIrr = item.discount ? toIrr(item.discount, input.irrPerAed, rounding) : 0n;
    const gross = unitIrr * BigInt(item.quantity);
    if (discountIrr < 0n || discountIrr > gross) throw new DomainError('INVALID_DISCOUNT');
    const line = gross - discountIrr;
    itemsIrr += line;
    itemLines.push({ id: item.id, included: true, lineIrr: line });
  }
  let costsIrr = 0n;
  let shippingIrr = 0n;
  for (const c of input.costs) {
    const v = toIrr(c.amount, input.irrPerAed, rounding);
    if (v < 0n) throw new DomainError('INVALID_COST');
    costsIrr += v;
    if (c.code === 'SHIPPING') shippingIrr += v;
  }
  let taxIrr = 0n;
  if (input.tax) {
    const base = itemsIrr + (input.tax.base === 'ITEMS_AND_SHIPPING' ? shippingIrr : 0n);
    taxIrr = divideRounded(base * BigInt(input.tax.rateBasisPoints), 10_000n, rounding);
  }
  const totalPayableIrr = itemsIrr + costsIrr + taxIrr;
  return {
    itemLines,
    itemsIrr,
    costsIrr,
    taxIrr,
    totalPayableIrr,
    referenceTotalAed: input.irrPerAed ? convertIrrToAed(totalPayableIrr, input.irrPerAed) : null,
    irrPerAed: input.irrPerAed,
    roundingRule: roundingRuleId(rounding),
  };
}

export type QuotePayBlocker = 'NOT_ACCEPTED' | 'EXPIRED' | 'NOTHING_PAYABLE' | 'ALREADY_PAID';

/** Whether a *new* payment session may start for this version right now. */
export function quotePaymentBlockers(input: {
  status: string;
  validUntil: Date;
  now: Date;
  totalPayableIrr: bigint;
  hasSucceededPayment: boolean;
}): QuotePayBlocker[] {
  const blockers: QuotePayBlocker[] = [];
  if (input.hasSucceededPayment) blockers.push('ALREADY_PAID');
  if (input.status !== 'ACCEPTED') blockers.push('NOT_ACCEPTED');
  if (input.validUntil <= input.now) blockers.push('EXPIRED');
  if (input.totalPayableIrr <= 0n) blockers.push('NOTHING_PAYABLE');
  return blockers;
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export interface RefundRecord {
  status: 'REQUESTED' | 'APPROVED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'REJECTED';
  amountIrr: bigint;
}

/** Captured − (succeeded + approved + processing). Requested/failed/rejected do not hold funds. */
export function remainingRefundable(capturedIrr: bigint, refunds: readonly RefundRecord[]): bigint {
  const held = refunds
    .filter((r) => r.status === 'SUCCEEDED' || r.status === 'APPROVED' || r.status === 'PROCESSING')
    .reduce((acc, r) => acc + r.amountIrr, 0n);
  return capturedIrr - held;
}

export function assertRefundWithinCap(capturedIrr: bigint, refunds: readonly RefundRecord[], requestedIrr: bigint): void {
  if (requestedIrr <= 0n) throw new DomainError('INVALID_REFUND_AMOUNT');
  const remaining = remainingRefundable(capturedIrr, refunds);
  if (requestedIrr > remaining) {
    throw new DomainError('REFUND_EXCEEDS_REMAINING', 'Refund exceeds remaining refundable amount', {
      remainingIrr: remaining.toString(),
    });
  }
}

export function sumByCurrency(values: readonly Money[]): Partial<Record<CurrencyCode, bigint>> {
  const out: Partial<Record<CurrencyCode, bigint>> = {};
  for (const v of values) out[v.currency] = (out[v.currency] ?? 0n) + v.minor;
  return out;
}
