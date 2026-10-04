import { Injectable } from '@nestjs/common';
import type { PriceView } from '@hedax/contracts';
import { type CurrencyCode, type PriceResult, type PriceTier, displayUnitPrice, money, resolveUnitPrice } from '@hedax/domain';
import type { ProductPrice, QuantityPriceRule } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../common/prisma.service.js';
import { moneyDto } from '../../common/serialize.js';

export interface CurrentRate {
  id: string;
  irrPerAed: string;
  effectiveFrom: Date;
}

/** Version tag stored with every snapshot so historic prices stay explainable. */
export const PRICING_RULES_VERSION = 'pricing-v1';

export function tiersFor(base: ProductPrice | null, rules: readonly QuantityPriceRule[]): PriceTier[] {
  const tiers: PriceTier[] = [];
  if (base) {
    tiers.push({
      id: base.id,
      customerGroupId: null,
      minQty: 1,
      maxQty: null,
      base: money(base.baseCurrency, base.baseAmountMinor),
      manualIrrMinor: base.manualIrrMinor,
      manualAedMinor: base.manualAedMinor,
      validFrom: null,
      validTo: null,
      active: true,
    });
  }
  for (const r of rules) {
    tiers.push({
      id: r.id,
      customerGroupId: r.customerGroupId,
      minQty: r.minQty,
      maxQty: r.maxQty,
      base: money(r.baseCurrency, r.baseAmountMinor),
      manualIrrMinor: r.manualIrrMinor,
      manualAedMinor: r.manualAedMinor,
      validFrom: r.validFrom,
      validTo: r.validTo,
      active: r.active,
    });
  }
  return tiers;
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Latest rate whose effective time has started. Null means "no valid rate": never invent one. */
  async currentRate(tx?: Tx, at: Date = new Date()): Promise<CurrentRate | null> {
    const db = tx ?? this.prisma;
    const row = await db.exchangeRate.findFirst({ where: { effectiveFrom: { lte: at } }, orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }] });
    return row ? { id: row.id, irrPerAed: row.irrPerAed.toString(), effectiveFrom: row.effectiveFrom } : null;
  }

  resolve(
    base: ProductPrice | null,
    rules: readonly QuantityPriceRule[],
    quantity: number,
    approvedGroupId: string | null,
    rate: CurrentRate | null,
  ): PriceResult {
    return resolveUnitPrice(tiersFor(base, rules), {
      quantity,
      approvedCustomerGroupId: approvedGroupId,
      irrPerAed: rate?.irrPerAed ?? null,
      fxRateId: rate?.id ?? null,
      now: new Date(),
    });
  }

  toView(result: PriceResult, display: CurrencyCode): PriceView {
    if (result.status !== 'PRICED') {
      return { kind: 'inquiry', reason: result.reason === 'NO_VALID_FX_RATE' ? 'NO_VALID_FX_RATE' : 'NO_PRICE' };
    }
    const shown = displayUnitPrice(result, display);
    if (shown.kind !== 'price') return { kind: 'inquiry', reason: 'NO_PRICE' };
    return {
      kind: 'price',
      payable: moneyDto('IRR', result.unitPayableIrr),
      display: moneyDto(shown.currency, shown.minor),
      displayIsReference: shown.isReference,
    };
  }
}
