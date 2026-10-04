import {
  type CurrencyCode,
  type Money,
  type RoundingRule,
  DEFAULT_IRR_ROUNDING,
  convertAedToIrr,
  convertIrrToAed,
  roundingRuleId,
} from './money.js';

/**
 * A price tier. The public base price is a tier with `customerGroupId = null`
 * and `minQty = 1`. Group and quantity rules are further tiers.
 *
 * `manualIrrMinor` is an explicit rial price that beats automatic conversion.
 * `manualAedMinor` is display/reference only in v1: payment always settles in IRR.
 */
export interface PriceTier {
  id: string;
  customerGroupId: string | null;
  minQty: number;
  maxQty: number | null;
  base: Money;
  manualIrrMinor: bigint | null;
  manualAedMinor: bigint | null;
  validFrom: Date | null;
  validTo: Date | null;
  active: boolean;
}

export interface PricingContext {
  quantity: number;
  /** Only an *approved* group id may be passed here; self-declared groups grant nothing. */
  approvedCustomerGroupId: string | null;
  /** Current valid `irr_per_aed` rate as a decimal string, or null when none is valid. */
  irrPerAed: string | null;
  fxRateId: string | null;
  now: Date;
  rounding?: RoundingRule;
  /** Relative tolerance (basis points) before a manual AED price is flagged as inconsistent. */
  manualAedToleranceBp?: number;
}

export type PayableSource = 'MANUAL_IRR' | 'BASE_IRR' | 'CONVERTED_FROM_AED';
export type ReferenceAedSource = 'MANUAL_AED' | 'BASE_AED' | 'CONVERTED_FROM_IRR';
export type TierSource = 'GROUP_RULE' | 'PUBLIC';

export type PriceWarning = 'MANUAL_AED_INCONSISTENT_WITH_IRR';

export interface PricedResult {
  status: 'PRICED';
  tierId: string;
  tierSource: TierSource;
  unitPayableIrr: bigint;
  payableSource: PayableSource;
  lineTotalIrr: bigint;
  referenceAed: { unitMinor: bigint; source: ReferenceAedSource } | null;
  fxRateId: string | null;
  irrPerAed: string | null;
  roundingRule: string;
  warnings: PriceWarning[];
}

export interface InquiryResult {
  status: 'INQUIRY_REQUIRED';
  reason: 'NO_PRICE' | 'NO_VALID_FX_RATE' | 'INVALID_QUANTITY';
  tierId: string | null;
}

export type PriceResult = PricedResult | InquiryResult;

function tierApplies(tier: PriceTier, qty: number, now: Date): boolean {
  if (!tier.active) return false;
  if (tier.validFrom && tier.validFrom > now) return false;
  if (tier.validTo && tier.validTo <= now) return false;
  if (qty < tier.minQty) return false;
  if (tier.maxQty !== null && qty > tier.maxQty) return false;
  return true;
}

/** Most specific applicable tier = highest minQty; ties broken by id for determinism. */
function pickTier(tiers: readonly PriceTier[], qty: number, now: Date): PriceTier | null {
  const candidates = tiers.filter((t) => tierApplies(t, qty, now));
  candidates.sort((a, b) => b.minQty - a.minQty || a.id.localeCompare(b.id));
  return candidates[0] ?? null;
}

/**
 * Selects the payable IRR unit price following spec §9.1:
 * 1. an applicable rule for the customer's approved group (+quantity), else
 * 2. the public price (public quantity tiers included).
 * Inside the chosen tier: manual IRR → base IRR → base AED converted with a valid rate.
 * Without a valid rate an AED-only tier yields INQUIRY_REQUIRED; nothing is invented.
 */
export function resolveUnitPrice(tiers: readonly PriceTier[], ctx: PricingContext): PriceResult {
  if (!Number.isSafeInteger(ctx.quantity) || ctx.quantity < 1) {
    return { status: 'INQUIRY_REQUIRED', reason: 'INVALID_QUANTITY', tierId: null };
  }
  const rounding = ctx.rounding ?? DEFAULT_IRR_ROUNDING;
  const groupTier = ctx.approvedCustomerGroupId
    ? pickTier(tiers.filter((t) => t.customerGroupId === ctx.approvedCustomerGroupId), ctx.quantity, ctx.now)
    : null;
  const tier = groupTier ?? pickTier(tiers.filter((t) => t.customerGroupId === null), ctx.quantity, ctx.now);
  if (!tier) return { status: 'INQUIRY_REQUIRED', reason: 'NO_PRICE', tierId: null };

  let unitPayableIrr: bigint;
  let payableSource: PayableSource;
  let usedRate = false;
  if (tier.manualIrrMinor !== null) {
    unitPayableIrr = tier.manualIrrMinor;
    payableSource = 'MANUAL_IRR';
  } else if (tier.base.currency === 'IRR') {
    unitPayableIrr = tier.base.minor;
    payableSource = 'BASE_IRR';
  } else {
    if (!ctx.irrPerAed) return { status: 'INQUIRY_REQUIRED', reason: 'NO_VALID_FX_RATE', tierId: tier.id };
    unitPayableIrr = convertAedToIrr(tier.base.minor, ctx.irrPerAed, rounding);
    payableSource = 'CONVERTED_FROM_AED';
    usedRate = true;
  }
  if (unitPayableIrr <= 0n) return { status: 'INQUIRY_REQUIRED', reason: 'NO_PRICE', tierId: tier.id };

  let referenceAed: PricedResult['referenceAed'] = null;
  if (tier.manualAedMinor !== null) referenceAed = { unitMinor: tier.manualAedMinor, source: 'MANUAL_AED' };
  else if (tier.base.currency === 'AED') referenceAed = { unitMinor: tier.base.minor, source: 'BASE_AED' };
  else if (ctx.irrPerAed) referenceAed = { unitMinor: convertIrrToAed(unitPayableIrr, ctx.irrPerAed), source: 'CONVERTED_FROM_IRR' };

  const warnings: PriceWarning[] = [];
  if (tier.manualAedMinor !== null && ctx.irrPerAed) {
    const implied = convertAedToIrr(tier.manualAedMinor, ctx.irrPerAed, rounding);
    const toleranceBp = BigInt(ctx.manualAedToleranceBp ?? 200);
    const diff = implied > unitPayableIrr ? implied - unitPayableIrr : unitPayableIrr - implied;
    if (diff * 10_000n > unitPayableIrr * toleranceBp) warnings.push('MANUAL_AED_INCONSISTENT_WITH_IRR');
  }

  const rateRecorded = usedRate || referenceAed?.source === 'CONVERTED_FROM_IRR';
  return {
    status: 'PRICED',
    tierId: tier.id,
    tierSource: tier.customerGroupId ? 'GROUP_RULE' : 'PUBLIC',
    unitPayableIrr,
    payableSource,
    lineTotalIrr: unitPayableIrr * BigInt(ctx.quantity),
    referenceAed,
    fxRateId: rateRecorded ? ctx.fxRateId : null,
    irrPerAed: rateRecorded ? ctx.irrPerAed : null,
    roundingRule: roundingRuleId(rounding),
    warnings,
  };
}

/** Admin panel helper: explains where each displayed price comes from. */
export function describePriceSource(result: PriceResult): string {
  if (result.status === 'INQUIRY_REQUIRED') return `inquiry:${result.reason}`;
  return `${result.tierSource}:${result.payableSource}`;
}

export type DisplayCurrency = CurrencyCode;

/**
 * What the storefront shows for a unit price in the selected display currency.
 * The payable IRR amount is always available for the checkout summary.
 */
export function displayUnitPrice(result: PriceResult, display: DisplayCurrency):
  | { kind: 'inquiry' }
  | { kind: 'price'; currency: CurrencyCode; minor: bigint; isReference: boolean; payableIrr: bigint } {
  if (result.status !== 'PRICED') return { kind: 'inquiry' };
  if (display === 'IRR' || !result.referenceAed) {
    return { kind: 'price', currency: 'IRR', minor: result.unitPayableIrr, isReference: false, payableIrr: result.unitPayableIrr };
  }
  return { kind: 'price', currency: 'AED', minor: result.referenceAed.unitMinor, isReference: true, payableIrr: result.unitPayableIrr };
}
