import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { CheckoutPreview, CheckoutStart, PaymentRedirect } from '@hedax/contracts';
import { computeOrderTotals, convertIrrToAed } from '@hedax/domain';
import { REFERENCE_PREFIX, humanReference } from '@hedax/domain/server';
import { badRequest, conflict, notFound, unprocessable } from '../../common/errors.js';
import { IdempotencyService } from '../../common/idempotency.service.js';
import { Prisma, PrismaService, type Tx } from '../../common/prisma.service.js';
import type { Actor } from '../../common/request-context.js';
import { irr, moneyDto, toJsonSafe } from '../../common/serialize.js';
import { TransitionsService } from '../../common/transitions.service.js';
import { CartService } from '../cart/cart.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { PaymentProviderRegistry } from '../payments/provider-registry.js';
import { PaymentsService } from '../payments/payments.service.js';
import { PRICING_RULES_VERSION, PricingService } from '../pricing/pricing.service.js';
import { SettingsService } from '../settings/settings.service.js';

interface PricedLine {
  productId: string;
  quantity: number;
  unitIrr: bigint;
  snapshot: Record<string, unknown>;
  sku: string;
  nameFa: string;
  nameEn: string | null;
  partType: 'GENUINE' | 'OEM' | 'AFTERMARKET';
  condition: 'NEW' | 'USED' | 'REFURBISHED';
  origin: 'DOMESTIC' | 'IMPORTED' | 'UNKNOWN';
}

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartService,
    private readonly catalog: CatalogService,
    private readonly pricing: PricingService,
    private readonly inventory: InventoryService,
    private readonly settings: SettingsService,
    private readonly payments: PaymentsService,
    private readonly registry: PaymentProviderRegistry,
    private readonly transitions: TransitionsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /** Re-prices every line on the server (never trusting the browser) and checks purchasability. */
  private async priceCart(cartId: string, actor: Actor) {
    const items = await this.prisma.cartItem.findMany({ where: { cartId }, orderBy: { addedAt: 'asc' } });
    if (items.length === 0) throw unprocessable('EMPTY_CART', 'The cart is empty');
    const products = await this.catalog.hydrate(items.map((i) => i.productId));
    const rate = await this.pricing.currentRate();
    const lines: PricedLine[] = [];
    for (const item of items) {
      const p = products.get(item.productId);
      if (!p || !p.published || p.archivedAt || !p.isSellable) throw unprocessable('PRODUCT_NOT_PURCHASABLE', 'A part in the cart is no longer available', { productId: item.productId });
      const price = this.pricing.resolve(p.basePrice, p.priceRules, item.quantity, actor.approvedCustomerGroupId, rate);
      if (price.status !== 'PRICED') throw unprocessable('INQUIRY_REQUIRED', 'A part in the cart needs a price inquiry', { productId: p.id, reason: price.reason });
      lines.push({
        productId: p.id,
        quantity: item.quantity,
        unitIrr: price.unitPayableIrr,
        snapshot: {
          tierId: price.tierId, tierSource: price.tierSource, payableSource: price.payableSource, fxRateId: price.fxRateId,
          irrPerAed: price.irrPerAed, roundingRule: price.roundingRule, referenceAed: price.referenceAed, rulesVersion: PRICING_RULES_VERSION,
        },
        sku: p.sku,
        nameFa: p.translations.find((t) => t.locale === 'fa')?.name ?? p.sku,
        nameEn: p.translations.find((t) => t.locale === 'en')?.name ?? null,
        partType: p.partType,
        condition: p.condition,
        origin: p.origin,
      });
    }
    return { lines, rate };
  }

  async preview(actor: Actor, req: Request, q: { addressId?: string; shippingMethodId?: string; currency: 'IRR' | 'AED' }): Promise<CheckoutPreview> {
    const cart = await this.carts.resolveCart(actor, req, null, false);
    const cartView = await this.carts.view(cart?.id ?? null, actor, q.currency);
    const settings = await this.settings.site();
    const policy = await this.settings.publishedPolicy('TERMS');
    const blockers: string[] = [];
    if (!policy) blockers.push('TERMS_NOT_PUBLISHED');
    if (!this.registry.isConfigured()) blockers.push('PAYMENT_NOT_CONFIGURED');
    if (!cartView.canCheckout) blockers.push('CART_NOT_READY');

    const address = q.addressId ? await this.prisma.address.findFirst({ where: { id: q.addressId, userId: actor.userId, archivedAt: null } }) : null;
    if (q.addressId && !address) throw notFound();
    if (!address) blockers.push('ADDRESS_REQUIRED');
    const options = await this.settings.shippingOptions(address?.province ?? null);
    const selected = q.shippingMethodId ? options.find((o) => o.id === q.shippingMethodId) : undefined;
    if (!selected) blockers.push('SHIPPING_METHOD_REQUIRED');

    let totals: CheckoutPreview['totals'] = null;
    if (cart && cartView.canCheckout && selected) {
      const { lines, rate } = await this.priceCart(cart.id, actor);
      const tax = await this.settings.taxRule();
      const t = computeOrderTotals({
        lines: lines.map((l) => ({ unitPayableIrr: l.unitIrr, quantity: l.quantity })),
        shipping: selected.costIrr === null ? { status: 'UNKNOWN', methodId: selected.id } : { status: 'KNOWN', methodId: selected.id, costIrr: selected.costIrr },
        tax,
      });
      blockers.push(...t.blockers);
      totals = {
        itemsTotal: irr(t.itemsTotal),
        discount: irr(t.discount),
        shipping: t.shipping === null ? null : irr(t.shipping),
        tax: irr(t.tax),
        taxConfigured: tax !== null,
        grandTotal: t.grandTotal === null ? null : irr(t.grandTotal),
        referenceAed: t.grandTotal !== null && rate ? moneyDto('AED', convertIrrToAed(t.grandTotal, rate.irrPerAed)) : null,
      };
    }
    return {
      cart: cartView,
      shippingOptions: options.map(({ zoneId: _z, costIrr: _c, ...o }) => o),
      totals,
      blockers: [...new Set(blockers)],
      policy: policy ? { id: policy.id, version: policy.version, title: actor.locale === 'en' ? (policy.titleEn ?? policy.titleFa) : policy.titleFa } : { id: '', version: 0, title: '' },
      reservationMinutes: settings.reservationMinutes,
    };
  }

  /**
   * Creates the unpaid order with snapshots, reserves stock atomically and
   * opens a payment attempt — all in one transaction — then asks the gateway
   * for a session. Idempotent per Idempotency-Key (A09).
   */
  async start(actor: Actor, req: Request, body: CheckoutStart, idempotencyKey: string | undefined): Promise<PaymentRedirect> {
    return this.idempotency.run('checkout.start', actor.userId, idempotencyKey, body, async () => {
      this.registry.active(); // fail fast: PAYMENT_NOT_CONFIGURED before creating anything
      const cart = await this.carts.resolveCart(actor, req, null, false);
      if (!cart) throw unprocessable('EMPTY_CART');
      const { lines, rate } = await this.priceCart(cart.id, actor);
      const address = await this.prisma.address.findFirst({ where: { id: body.addressId, userId: actor.userId, archivedAt: null } });
      if (!address) throw notFound();
      const option = (await this.settings.shippingOptions(address.province)).find((o) => o.id === body.shippingMethodId);
      if (!option) throw badRequest('SHIPPING_METHOD_UNAVAILABLE');
      if (option.costIrr === null) throw unprocessable('SHIPPING_COST_UNKNOWN', 'Shipping cost to this address needs an inquiry');
      const policy = await this.settings.publishedPolicy('TERMS');
      if (!policy || policy.id !== body.acceptedPolicyVersionId) throw conflict('POLICY_CHANGED', 'The terms of sale changed; please review and accept them again');
      const settings = await this.settings.site();
      const tax = await this.settings.taxRule();
      const totals = computeOrderTotals({
        lines: lines.map((l) => ({ unitPayableIrr: l.unitIrr, quantity: l.quantity })),
        shipping: { status: 'KNOWN', methodId: option.id, costIrr: option.costIrr },
        tax,
      });
      if (!totals.payable || totals.grandTotal === null) throw unprocessable('NOT_PAYABLE', 'The order cannot be paid yet', { blockers: totals.blockers });
      if (totals.grandTotal.toString() !== body.expectedGrandTotalIrr) {
        // The customer must see and accept the exact amount (prices/stock/rates may have changed).
        throw conflict('TOTAL_CHANGED', 'The total changed; please review the new amount', { grandTotalIrr: totals.grandTotal.toString() });
      }
      const reservationExpiresAt = new Date(Date.now() + settings.reservationMinutes * 60_000);

      const { orderId, attemptId } = await this.prisma.tx(async (tx) => {
        const order = await tx.order.create({
          data: {
            reference: humanReference(REFERENCE_PREFIX.stockOrder),
            userId: actor.userId,
            itemsTotalMinor: totals.itemsTotal,
            discountMinor: totals.discount,
            shippingMinor: option.costIrr as bigint,
            taxMinor: totals.tax,
            grandTotalMinor: totals.grandTotal as bigint,
            fxRateId: rate?.id ?? null,
            irrPerAed: rate?.irrPerAed ?? null,
            roundingRule: totals.roundingRule,
            taxRuleSnapshot: tax ? (toJsonSafe(tax) as Prisma.InputJsonValue) : Prisma.DbNull,
            pricingRulesVersion: PRICING_RULES_VERSION,
            addressSnapshot: {
              recipientName: address.recipientName, recipientMobile: address.recipientMobile, province: address.province,
              city: address.city, addressLine: address.addressLine, postalCode: address.postalCode,
            },
            shippingMethodId: option.id,
            shippingSnapshot: toJsonSafe({ methodId: option.id, zoneId: option.zoneId, name: option.name, costIrr: option.costIrr, estimate: option.estimate }) as Prisma.InputJsonValue,
            policyVersionId: policy.id,
            customerNote: body.customerNote ?? null,
            idempotencyKey: idempotencyKey as string,
            reservationExpiresAt,
          },
        });
        for (const line of lines) {
          const item = await tx.orderItem.create({
            data: {
              orderId: order.id, productId: line.productId, skuSnapshot: line.sku, nameFaSnapshot: line.nameFa, nameEnSnapshot: line.nameEn,
              partType: line.partType, condition: line.condition, origin: line.origin, quantity: line.quantity,
              unitPriceMinor: line.unitIrr, lineTotalMinor: line.unitIrr * BigInt(line.quantity),
              priceSnapshot: toJsonSafe(line.snapshot) as Prisma.InputJsonValue,
            },
          });
          // Throws INSUFFICIENT_STOCK → whole transaction rolls back; no partial reservation (A08).
          await this.inventory.reserve(tx, { productId: line.productId, quantity: line.quantity, orderId: order.id, orderItemId: item.id, expiresAt: reservationExpiresAt });
        }
        await tx.policyAcceptance.create({ data: { userId: actor.userId, policyVersionId: policy.id, subjectType: 'STOCK_ORDER', subjectId: order.id } });
        await this.transitions.note(tx, { subjectType: 'STOCK_ORDER', subjectId: order.id, type: 'ORDER_CREATED', data: { grandTotalIrr: totals.grandTotal } });
        const attempt = await this.payments.createAttempt(tx, {
          subjectType: 'STOCK_ORDER',
          subjectId: order.id,
          customerId: actor.userId,
          amountIrr: totals.grandTotal as bigint,
          snapshot: { orderReference: order.reference, grandTotalIrr: totals.grandTotal, fxRateId: rate?.id ?? null, policyVersionId: policy.id },
          idempotencyKey: `order:${order.id}:1`,
          locale: actor.locale,
        });
        await tx.cartItem.deleteMany({ where: { cartId: cart.id, productId: { in: lines.map((l) => l.productId) } } });
        return { orderId: order.id, attemptId: attempt.id };
      });

      const { redirectUrl, isSimulator } = await this.payments.initiate(attemptId);
      return { orderId, attemptId, redirectUrl, reservationExpiresAt: reservationExpiresAt.toISOString(), isSimulator };
    });
  }

  /** New attempt for an unpaid order; re-reserves stock if the earlier reservation lapsed. */
  async retry(actor: Actor, orderId: string, idempotencyKey: string | undefined): Promise<PaymentRedirect> {
    return this.idempotency.run('checkout.retry', actor.userId, idempotencyKey, { orderId }, async () => {
      this.registry.active();
      const settings = await this.settings.site();
      const { attemptId, expiresAt } = await this.prisma.tx(async (tx: Tx) => {
        const [locked] = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "order" WHERE "id" = ${orderId}::uuid AND "user_id" = ${actor.userId}::uuid FOR UPDATE`;
        if (!locked) throw notFound();
        const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, reservations: { where: { status: 'ACTIVE' } }, payments: true } });
        if (order.status !== 'AWAITING_PAYMENT') throw conflict('ORDER_NOT_PAYABLE', 'This order is not awaiting payment');
        if (order.payments.some((p) => p.status === 'SUCCEEDED')) throw conflict('ALREADY_PAID');
        const inFlight = order.payments.find((p) => p.status === 'PENDING' || p.status === 'PENDING_VERIFICATION');
        if (inFlight) throw conflict('PAYMENT_IN_PROGRESS', 'A payment for this order is still being verified');
        let expires = order.reservationExpiresAt ?? new Date();
        if (order.reservations.length === 0) {
          expires = new Date(Date.now() + settings.reservationMinutes * 60_000);
          for (const item of order.items) {
            await this.inventory.reserve(tx, { productId: item.productId, quantity: item.quantity, orderId: order.id, orderItemId: item.id, expiresAt: expires });
          }
          await tx.order.update({ where: { id: order.id }, data: { reservationExpiresAt: expires } });
        }
        const attempt = await this.payments.createAttempt(tx, {
          subjectType: 'STOCK_ORDER', subjectId: order.id, customerId: actor.userId, amountIrr: order.grandTotalMinor,
          snapshot: { orderReference: order.reference, grandTotalIrr: order.grandTotalMinor, retry: true },
          idempotencyKey: `order:${order.id}:${order.payments.length + 1}`, locale: actor.locale,
        });
        return { attemptId: attempt.id, expiresAt: expires };
      });
      const { redirectUrl, isSimulator } = await this.payments.initiate(attemptId);
      return { orderId, attemptId, redirectUrl, reservationExpiresAt: expiresAt.toISOString(), isSimulator };
    });
  }
}

