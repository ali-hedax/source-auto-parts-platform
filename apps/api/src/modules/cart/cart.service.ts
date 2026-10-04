import { Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CART_COOKIE, type CartLineView, type CartView } from '@hedax/contracts';
import { randomToken, sha256Hex } from '@hedax/domain/server';
import { ENV, type Env } from '../../config/env.js';
import { badRequest, forbidden, notFound, unprocessable } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Actor } from '../../common/request-context.js';
import { irr } from '../../common/serialize.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { PricingService } from '../pricing/pricing.service.js';

const GUEST_CART_DAYS = 30;
const MAX_LINES = 50;

/**
 * Server-side cart. Browsing and building a cart need no account; the cart
 * never reserves stock (reservation starts only at checkout, spec §6).
 */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly pricing: PricingService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private assertCustomerOrGuest(actor: Actor | null): void {
    if (actor && actor.kind !== 'CUSTOMER') throw forbidden('STAFF_CANNOT_BUY', 'Staff accounts cannot place orders');
  }

  async resolveCart(actor: Actor | null, req: Request, res: Response | null, create: boolean) {
    this.assertCustomerOrGuest(actor);
    if (actor) {
      const existing = await this.prisma.cart.findUnique({ where: { userId: actor.userId } });
      if (existing || !create) return existing;
      return this.prisma.cart.create({ data: { userId: actor.userId, expiresAt: new Date(Date.now() + 365 * 86_400_000) } });
    }
    const token = req.cookies?.[CART_COOKIE] as string | undefined;
    if (token && token.length >= 20 && token.length <= 100) {
      const cart = await this.prisma.cart.findUnique({ where: { guestTokenHash: sha256Hex(token) } });
      if (cart && cart.expiresAt > new Date()) return cart;
    }
    if (!create || !res) return null;
    const fresh = randomToken(24);
    const cart = await this.prisma.cart.create({
      data: { guestTokenHash: sha256Hex(fresh), expiresAt: new Date(Date.now() + GUEST_CART_DAYS * 86_400_000) },
    });
    res.cookie(CART_COOKIE, fresh, {
      httpOnly: true, secure: this.env.COOKIE_SECURE, sameSite: 'lax', path: '/', maxAge: GUEST_CART_DAYS * 86_400_000,
    });
    return cart;
  }

  async view(cartId: string | null, actor: Actor | null, display: 'IRR' | 'AED'): Promise<CartView> {
    if (!cartId) return { id: '', lines: [], itemsTotalPayableIrr: null, canCheckout: false };
    const items = await this.prisma.cartItem.findMany({ where: { cartId }, orderBy: { addedAt: 'asc' } });
    const products = await this.catalog.hydrate(items.map((i) => i.productId));
    const rate = await this.pricing.currentRate();
    const groupId = actor?.approvedCustomerGroupId ?? null;
    let total = 0n;
    let allPriced = true;
    let blocking = false;
    const lines: CartLineView[] = items.map((item) => {
      const p = products.get(item.productId);
      if (!p) {
        blocking = true;
        allPriced = false;
        return {
          id: item.id, productId: item.productId, slug: '', sku: '', name: { fa: '', en: null }, imageUrl: null, quantity: item.quantity,
          maxOrderQuantity: 0, unitPrice: { kind: 'inquiry', reason: 'NO_PRICE' }, lineTotalPayableIrr: null, problems: ['UNAVAILABLE'],
        };
      }
      const card = this.catalog.toCard(p, { approvedGroupId: groupId, display }, rate);
      const { available } = this.catalog.availability(p);
      const problems: CartLineView['problems'] = [];
      const purchasable = p.published && !p.archivedAt && p.isSellable;
      if (!purchasable) problems.push('UNAVAILABLE');
      else if (available <= 0) problems.push('OUT_OF_STOCK');
      else if (item.quantity > available) problems.push('QUANTITY_REDUCED');
      const price = this.pricing.resolve(p.basePrice, p.priceRules, item.quantity, groupId, rate);
      if (price.status !== 'PRICED') problems.push('INQUIRY_REQUIRED');
      if (problems.length) blocking = true;
      let lineTotal: bigint | null = null;
      if (price.status === 'PRICED') {
        lineTotal = price.lineTotalIrr;
        total += lineTotal;
      } else {
        allPriced = false;
      }
      return {
        id: item.id,
        productId: p.id,
        slug: p.slug,
        sku: p.sku,
        name: card.name,
        imageUrl: card.primaryImage?.url ?? null,
        quantity: item.quantity,
        maxOrderQuantity: Math.min(available, 999),
        unitPrice: this.pricing.toView(price, display),
        lineTotalPayableIrr: lineTotal === null ? null : irr(lineTotal),
        problems,
      };
    });
    return {
      id: cartId,
      lines,
      itemsTotalPayableIrr: allPriced && lines.length ? irr(total) : null,
      canCheckout: lines.length > 0 && !blocking,
    };
  }

  async add(cartId: string, productId: string, quantity: number): Promise<void> {
    const products = await this.catalog.hydrate([productId]);
    const p = products.get(productId);
    if (!p || !p.published) throw notFound();
    // A02: archived / unsellable / out-of-stock products cannot be bought; the UI offers sourcing instead.
    if (p.archivedAt || !p.isSellable) throw unprocessable('PRODUCT_NOT_PURCHASABLE', 'This part cannot be purchased; request sourcing instead');
    const { available } = this.catalog.availability(p);
    if (available <= 0) throw unprocessable('OUT_OF_STOCK', 'This part is out of stock; request sourcing instead');
    const count = await this.prisma.cartItem.count({ where: { cartId } });
    const existing = await this.prisma.cartItem.findUnique({ where: { cartId_productId: { cartId, productId } } });
    if (!existing && count >= MAX_LINES) throw badRequest('CART_FULL');
    const next = Math.min((existing?.quantity ?? 0) + quantity, available, 999);
    await this.prisma.cartItem.upsert({
      where: { cartId_productId: { cartId, productId } },
      create: { cartId, productId, quantity: next },
      update: { quantity: next },
    });
  }

  async setQuantity(cartId: string, itemId: string, quantity: number): Promise<void> {
    const item = await this.prisma.cartItem.findFirst({ where: { id: itemId, cartId } });
    if (!item) throw notFound();
    if (quantity === 0) await this.prisma.cartItem.delete({ where: { id: itemId } });
    else await this.prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
  }

  /** Moves a guest cart into the customer's cart after login (quantities are summed). */
  async mergeGuestCart(req: Request, res: Response, userId: string): Promise<void> {
    const token = req.cookies?.[CART_COOKIE] as string | undefined;
    if (!token) return;
    const guest = await this.prisma.cart.findUnique({ where: { guestTokenHash: sha256Hex(token) }, include: { items: true } });
    res.clearCookie(CART_COOKIE, { path: '/' });
    if (!guest || guest.items.length === 0) return;
    await this.prisma.$transaction(async (tx) => {
      const target =
        (await tx.cart.findUnique({ where: { userId } })) ??
        (await tx.cart.create({ data: { userId, expiresAt: new Date(Date.now() + 365 * 86_400_000) } }));
      for (const item of guest.items) {
        const existing = await tx.cartItem.findUnique({ where: { cartId_productId: { cartId: target.id, productId: item.productId } } });
        await tx.cartItem.upsert({
          where: { cartId_productId: { cartId: target.id, productId: item.productId } },
          create: { cartId: target.id, productId: item.productId, quantity: Math.min(item.quantity, 999) },
          update: { quantity: Math.min((existing?.quantity ?? 0) + item.quantity, 999) },
        });
      }
      await tx.cart.delete({ where: { id: guest.id } });
    });
  }
}
