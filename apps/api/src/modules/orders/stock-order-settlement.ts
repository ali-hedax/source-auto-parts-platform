import { Injectable, type OnModuleInit } from '@nestjs/common';
import { decideReservationExpiry } from '@hedax/domain';
import type { PaymentAttempt } from '../../generated/prisma/client.js';
import { OutboxService } from '../../common/outbox.service.js';
import { PrismaService, type Tx } from '../../common/prisma.service.js';
import { TransitionsService } from '../../common/transitions.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { PaymentsService, type SettlementHandler } from '../payments/payments.service.js';

/**
 * Stock-order side of a verified payment: consume the reservation exactly
 * once, or — for a late success after the reservation lapsed — re-check stock
 * and either re-allocate or open a refund case (A12). Money is never dropped.
 */
@Injectable()
export class StockOrderSettlement implements SettlementHandler, OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly inventory: InventoryService,
    private readonly transitions: TransitionsService,
    private readonly outbox: OutboxService,
  ) {}

  onModuleInit(): void {
    this.payments.registerHandler('STOCK_ORDER', this);
  }

  async lockSubject(tx: Tx, orderId: string): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "order" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
  }

  async onSettled(tx: Tx, attempt: PaymentAttempt, verifiedAt: Date): Promise<void> {
    const orderId = attempt.orderId as string;
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, reservations: true } });
    const active = order.reservations.filter((r) => r.status === 'ACTIVE');
    const coveredItems = new Set(active.map((r) => r.orderItemId));
    for (const r of active) await this.inventory.consume(tx, r.id);

    // Items whose reservation expired/was released before the money arrived.
    const uncovered = order.items.filter((i) => !coveredItems.has(i.id));
    let stockOk = true;
    if (uncovered.length) {
      const warehouseId = await this.inventory.defaultWarehouseId(tx);
      const locked = await tx.$queryRaw<Array<{ product_id: string; on_hand: number; reserved: number }>>`
        SELECT "product_id", "on_hand", "reserved" FROM "inventory_balance"
         WHERE "warehouse_id" = ${warehouseId}::uuid AND "product_id" = ANY(${uncovered.map((i) => i.productId)}::uuid[])
         FOR UPDATE`;
      const available = new Map(locked.map((b) => [b.product_id, b.on_hand - b.reserved]));
      stockOk = uncovered.every((i) => (available.get(i.productId) ?? 0) >= i.quantity);
      if (stockOk) {
        for (const i of uncovered) await this.inventory.reallocate(tx, { productId: i.productId, quantity: i.quantity, orderId, warehouseId });
      }
    }

    await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'PAID' } });
    if (order.status === 'AWAITING_PAYMENT' && stockOk) {
      await this.transitions.record(tx, { machine: 'stockOrder', subjectType: 'STOCK_ORDER', subjectId: orderId, from: 'AWAITING_PAYMENT', to: 'CONFIRMED', actorKind: 'SYSTEM', actorId: null, data: { attemptId: attempt.id } });
      await tx.order.update({ where: { id: orderId }, data: { status: 'CONFIRMED', confirmedAt: verifiedAt, version: { increment: 1 } } });
      await this.outbox.notify(tx, { userId: order.userId, type: 'order.paid', params: { reference: order.reference }, linkPath: `/account/orders/${orderId}`, dedupeKey: `order-paid:${orderId}`, sms: true });
      return;
    }
    // Paid, but the goods are gone or the order was already closed: keep the money on record and escalate.
    await tx.resolutionCase.createMany({
      data: [{
        kind: 'LATE_PAYMENT_NO_STOCK', subjectType: 'STOCK_ORDER', subjectId: orderId, paymentAttemptId: attempt.id,
        amountIrrMinor: attempt.verifiedAmountIrrMinor ?? attempt.amountIrrMinor,
        note: stockOk ? `Payment verified for an order in status ${order.status}` : 'Payment verified after reservation expiry and stock is no longer available',
      }],
      skipDuplicates: true,
    });
    if (order.status === 'AWAITING_PAYMENT') {
      await this.transitions.record(tx, {
        machine: 'stockOrder', subjectType: 'STOCK_ORDER', subjectId: orderId, from: 'AWAITING_PAYMENT', to: 'EXCEPTION',
        reason: 'PAID_STOCK_UNAVAILABLE', actorKind: 'SYSTEM', actorId: null,
      });
      await tx.order.update({ where: { id: orderId }, data: { status: 'EXCEPTION', version: { increment: 1 } } });
    }
    await this.outbox.notify(tx, { userId: order.userId, type: 'order.paid_needs_resolution', params: { reference: order.reference }, linkPath: `/account/orders/${orderId}`, dedupeKey: `order-exception:${orderId}` });
  }

  /** A definitive failure releases the reservation; the order stays payable and can be retried. */
  async onFailed(tx: Tx, attempt: PaymentAttempt): Promise<void> {
    const orderId = attempt.orderId as string;
    const others = await tx.paymentAttempt.count({ where: { orderId, id: { not: attempt.id }, status: { in: ['CREATED', 'PENDING', 'PENDING_VERIFICATION', 'SUCCEEDED'] } } });
    if (others > 0) return; // another attempt may still pay; keep the reservation
    const active = await tx.inventoryReservation.findMany({ where: { orderId, status: 'ACTIVE' } });
    for (const r of active) await this.inventory.release(tx, r.id, 'PAYMENT_FAILED');
  }

  /**
   * Worker sweep: expired reservations are reconciled with payment state first;
   * a reservation whose payment succeeded or is still inside the gateway window
   * is never released blindly (spec §9.2).
   */
  async sweepExpiredReservations(limit = 100): Promise<{ released: number; extended: number }> {
    const expired = await this.prisma.inventoryReservation.findMany({
      where: { status: 'ACTIVE', expiresAt: { lt: new Date() } },
      take: limit,
      select: { id: true, orderId: true, expiresAt: true },
    });
    let released = 0;
    let extended = 0;
    for (const r of expired) {
      await this.prisma.tx(async (tx) => {
        await this.lockSubject(tx, r.orderId);
        const attempts = await tx.paymentAttempt.findMany({ where: { orderId: r.orderId }, select: { status: true, providerDeadline: true } });
        const decision = decideReservationExpiry({ now: new Date(), expiresAt: r.expiresAt, attempts, graceMs: 5 * 60_000 });
        if (decision.action === 'EXTEND') {
          await tx.inventoryReservation.updateMany({ where: { id: r.id, status: 'ACTIVE' }, data: { expiresAt: decision.until } });
          extended += 1;
        } else if (decision.action === 'RELEASE') {
          if (await this.inventory.release(tx, r.id, 'EXPIRED')) released += 1;
        }
        // CONSUME: a succeeded attempt exists; settlement consumes it (or reconciliation will).
      });
    }
    return { released, extended };
  }

  /** Orders left unpaid with no reservation and no in-flight attempt for a day are cancelled. */
  async cancelAbandonedOrders(limit = 100): Promise<number> {
    const cutoff = new Date(Date.now() - 24 * 3_600_000);
    const candidates = await this.prisma.order.findMany({
      where: { status: 'AWAITING_PAYMENT', createdAt: { lt: cutoff }, reservations: { none: { status: 'ACTIVE' } } },
      take: limit,
      select: { id: true },
    });
    let n = 0;
    for (const c of candidates) {
      await this.prisma.tx(async (tx) => {
        await this.lockSubject(tx, c.id);
        const busy = await tx.paymentAttempt.count({ where: { orderId: c.id, status: { in: ['CREATED', 'PENDING', 'PENDING_VERIFICATION', 'SUCCEEDED'] } } });
        if (busy) return;
        const res = await tx.order.updateMany({ where: { id: c.id, status: 'AWAITING_PAYMENT' }, data: { status: 'CANCELLED', cancelledAt: new Date(), version: { increment: 1 } } });
        if (res.count === 1) {
          await this.transitions.record(tx, { machine: 'stockOrder', subjectType: 'STOCK_ORDER', subjectId: c.id, from: 'AWAITING_PAYMENT', to: 'CANCELLED', reason: 'UNPAID_TIMEOUT', actorKind: 'SYSTEM', actorId: null });
          n += 1;
        }
      });
    }
    return n;
  }
}
