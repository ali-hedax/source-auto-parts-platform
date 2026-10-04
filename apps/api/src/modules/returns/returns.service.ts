import { Injectable } from '@nestjs/common';
import { DomainError, type RefundRecord, assertRefundWithinCap, assertTransition, remainingRefundable } from '@hedax/domain';
import { REFERENCE_PREFIX, humanReference } from '@hedax/domain/server';
import { AuditService } from '../../common/audit.service.js';
import { badRequest, conflict, notFound } from '../../common/errors.js';
import { IdempotencyService } from '../../common/idempotency.service.js';
import { OutboxService } from '../../common/outbox.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Actor } from '../../common/request-context.js';
import { irr } from '../../common/serialize.js';
import { TransitionsService } from '../../common/transitions.service.js';
import { AttachmentsService } from '../attachments/attachments.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { PaymentProviderRegistry } from '../payments/provider-registry.js';

const asRecords = (rows: ReadonlyArray<{ status: RefundRecord['status']; amountIrrMinor: bigint }>): RefundRecord[] =>
  rows.map((r) => ({ status: r.status, amountIrr: r.amountIrrMinor }));

/**
 * Cancel/return requests are separate from their execution; refunds are
 * separate from requests. Stock returns to sale only after inspection (§17),
 * and refunds can never exceed what was captured (§9.2).
 */
@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: TransitionsService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly inventory: InventoryService,
    private readonly attachments: AttachmentsService,
    private readonly registry: PaymentProviderRegistry,
    private readonly idempotency: IdempotencyService,
  ) {}

  async createRequest(actor: Actor, body: { orderId: string; kind: 'CANCEL' | 'RETURN'; reason: string; items: Array<{ orderItemId: string; quantity: number }>; attachmentIds: string[] }) {
    const order = await this.prisma.order.findFirst({ where: { id: body.orderId, userId: actor.userId }, include: { items: true } });
    const procurement = order ? null : await this.prisma.procurement.findFirst({ where: { id: body.orderId, customerId: actor.userId } });
    if (!order && !procurement) throw notFound();
    const open = await this.prisma.returnRequest.count({ where: { ...(order ? { orderId: order.id } : { procurementId: body.orderId }), status: { in: ['REQUESTED', 'APPROVED', 'ITEMS_RECEIVED'] } } });
    if (open) throw conflict('REQUEST_OPEN', 'There is already an open request for this order');
    if (body.kind === 'RETURN') {
      if (!order) throw badRequest('RETURN_NOT_SUPPORTED', 'Use the conversation for custom-sourced orders');
      if (order.status !== 'DELIVERED') throw conflict('NOT_DELIVERED', 'Returns are possible after delivery');
      for (const i of body.items) {
        const line = order.items.find((x) => x.id === i.orderItemId);
        if (!line || i.quantity > line.quantity - line.returnedQuantity) throw badRequest('INVALID_RETURN_QUANTITY');
      }
      if (!body.items.length) throw badRequest('ITEMS_REQUIRED');
    }
    await this.attachments.assertOwnedUsable(actor.userId, body.attachmentIds);
    return this.prisma.tx(async (tx) => {
      const rr = await tx.returnRequest.create({
        data: {
          reference: humanReference(REFERENCE_PREFIX.returnRequest), customerId: actor.userId, kind: body.kind, reason: body.reason,
          ...(order ? { orderId: order.id } : { procurementId: body.orderId }),
          items: { create: body.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity })) },
        },
      });
      if (body.attachmentIds.length) await tx.attachment.updateMany({ where: { id: { in: body.attachmentIds } }, data: { subjectType: 'RETURN_REQUEST', subjectId: rr.id } });
      await this.transitions.note(tx, { subjectType: order ? 'STOCK_ORDER' : 'PROCUREMENT', subjectId: body.orderId, type: `${body.kind}_REQUESTED`, reason: body.reason });
      return { id: rr.id, reference: rr.reference, status: rr.status };
    });
  }

  async listForCustomer(actor: Actor) {
    const rows = await this.prisma.returnRequest.findMany({ where: { customerId: actor.userId }, orderBy: { createdAt: 'desc' }, include: { refunds: true } });
    return rows.map((r) => ({
      id: r.id, reference: r.reference, kind: r.kind, status: r.status, reason: r.reason, decisionReason: r.decisionReason,
      orderId: r.orderId ?? r.procurementId, createdAt: r.createdAt.toISOString(),
      refunds: r.refunds.map((f) => ({ reference: f.reference, status: f.status, amount: irr(f.amountIrrMinor) })),
    }));
  }

  /**
   * Staff list. Each request carries what is needed to settle it from the same
   * screen: item names and prices, the verified payment of its order and a
   * suggested refund (received items for a return; the refundable rest for a
   * cancellation). The suggestion is only a starting value; the cap is enforced.
   */
  async listForStaff() {
    const rows = await this.prisma.returnRequest.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      include: { customer: { select: { fullName: true } }, items: { include: { orderItem: { select: { nameFaSnapshot: true, unitPriceMinor: true } } } }, refunds: true },
    });
    const orderIds = rows.flatMap((r) => (r.orderId ? [r.orderId] : []));
    const procurementIds = rows.flatMap((r) => (r.procurementId ? [r.procurementId] : []));
    const payments = await this.prisma.paymentAttempt.findMany({
      where: { status: 'SUCCEEDED', OR: [{ orderId: { in: orderIds } }, { procurementId: { in: procurementIds } }] },
      include: { refunds: true },
    });
    return rows.map((r) => {
      const payment = payments.find((p) => (r.orderId && p.orderId === r.orderId) || (r.procurementId && p.procurementId === r.procurementId)) ?? null;
      const captured = payment ? (payment.verifiedAmountIrrMinor ?? payment.amountIrrMinor) : 0n;
      const refundable = payment ? remainingRefundable(captured, asRecords(payment.refunds)) : 0n;
      const itemsValue = r.items.reduce((sum, i) => sum + BigInt(r.status === 'ITEMS_RECEIVED' ? i.receivedQuantity : i.quantity) * i.orderItem.unitPriceMinor, 0n);
      const suggested = r.kind === 'RETURN' ? (itemsValue < refundable ? itemsValue : refundable) : refundable;
      return {
        id: r.id, reference: r.reference, kind: r.kind, status: r.status, reason: r.reason, customer: r.customer.fullName, orderId: r.orderId, procurementId: r.procurementId,
        items: r.items.map((i) => ({
          id: i.id, orderItemId: i.orderItemId, name: i.orderItem.nameFaSnapshot, unitPrice: irr(i.orderItem.unitPriceMinor),
          quantity: i.quantity, receivedQuantity: i.receivedQuantity, restockedQuantity: i.restockedQuantity,
        })),
        payment: payment ? { id: payment.id, reference: payment.reference, captured: irr(captured), refundable: irr(refundable) } : null,
        refunds: r.refunds.map((f) => ({ reference: f.reference, status: f.status, amount: irr(f.amountIrrMinor) })),
        suggestedRefund: irr(suggested),
        version: r.version, createdAt: r.createdAt.toISOString(),
      };
    });
  }

  async decide(id: string, decision: 'APPROVED' | 'REJECTED', reason: string, actorId: string) {
    return this.prisma.tx(async (tx) => {
      const r = await tx.returnRequest.findUnique({ where: { id } });
      if (!r) throw notFound();
      assertTransition('returnRequest', r.status, decision, reason);
      const res = await tx.returnRequest.updateMany({ where: { id, status: r.status }, data: { status: decision, decisionReason: reason, decidedById: actorId, decidedAt: new Date(), version: { increment: 1 } } });
      if (res.count !== 1) throw new DomainError('VERSION_CONFLICT');
      await this.transitions.note(tx, { subjectType: 'RETURN_REQUEST', subjectId: id, type: `RETURN_${decision}`, reason });
      await this.audit.record(tx, { action: 'return.decided', entityType: 'return_request', entityId: id, after: { decision, reason } });
      await this.outbox.notify(tx, { userId: r.customerId, type: `return.${decision.toLowerCase()}`, params: { reference: r.reference }, linkPath: '/account/returns', dedupeKey: `return:${id}:${decision}` });
      return { id, status: decision };
    });
  }

  /** Records received/inspected quantities; only inspected sellable quantities go back to stock. */
  async receive(id: string, items: Array<{ itemId: string; receivedQuantity: number; restockQuantity: number; inspectionNote?: string }>) {
    return this.prisma.tx(async (tx) => {
      const r = await tx.returnRequest.findUnique({ where: { id }, include: { items: { include: { orderItem: true } } } });
      if (!r) throw notFound();
      assertTransition('returnRequest', r.status, 'ITEMS_RECEIVED');
      for (const input of items) {
        const item = r.items.find((i) => i.id === input.itemId);
        if (!item || input.receivedQuantity > item.quantity || input.restockQuantity > input.receivedQuantity) throw badRequest('INVALID_QUANTITY');
        await tx.returnRequestItem.update({ where: { id: item.id }, data: { receivedQuantity: input.receivedQuantity, restockedQuantity: input.restockQuantity, inspectionNote: input.inspectionNote ?? null } });
        await tx.orderItem.update({ where: { id: item.orderItemId }, data: { returnedQuantity: { increment: input.receivedQuantity } } });
        if (input.restockQuantity > 0) {
          const warehouseId = await this.inventory.defaultWarehouseId(tx);
          const bal = await tx.inventoryBalance.findUniqueOrThrow({ where: { productId_warehouseId: { productId: item.orderItem.productId, warehouseId } } });
          await this.inventory.setOnHand(tx, {
            productId: item.orderItem.productId, newOnHand: bal.onHand + input.restockQuantity, expectedVersion: null,
            type: 'RETURN_RESTOCK', reason: 'RETURN_INSPECTED', referenceType: 'return_request', referenceId: id,
          });
        }
      }
      await tx.returnRequest.update({ where: { id }, data: { status: 'ITEMS_RECEIVED', version: { increment: 1 } } });
      await this.audit.record(tx, { action: 'return.items_received', entityType: 'return_request', entityId: id, after: items });
      return { id, status: 'ITEMS_RECEIVED' };
    });
  }

  // ---------------------------------------------------------------------------
  // Refunds
  // ---------------------------------------------------------------------------

  async refunds() {
    const rows = await this.prisma.refund.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { paymentAttempt: { select: { reference: true, subjectType: true } } } });
    return rows.map((r) => ({
      id: r.id, reference: r.reference, status: r.status, amount: irr(r.amountIrrMinor), reason: r.reason, payment: r.paymentAttempt.reference,
      subjectType: r.paymentAttempt.subjectType, providerRefundReference: r.providerRefundReference, manualReference: r.manualReference,
      createdAt: r.createdAt.toISOString(), completedAt: r.completedAt?.toISOString() ?? null, version: r.version,
    }));
  }

  async createRefund(actor: Actor, body: { paymentAttemptId?: string; paymentReference?: string; amountIrr: string; reason: string; returnRequestId?: string }, key: string | undefined) {
    return this.idempotency.run('refund.create', actor.userId, key, body, () =>
      this.prisma.tx(async (tx) => {
        // Staff may name the payment by its human reference (HX-PAY-…) instead of the internal id.
        const attemptId = body.paymentAttemptId
          ?? (await tx.paymentAttempt.findUnique({ where: { reference: (body.paymentReference ?? '').toUpperCase() }, select: { id: true } }))?.id;
        if (!attemptId) throw notFound();
        await tx.$queryRaw`SELECT "id" FROM "payment_attempt" WHERE "id" = ${attemptId}::uuid FOR UPDATE`;
        const attempt = await tx.paymentAttempt.findUnique({ where: { id: attemptId }, include: { refunds: true } });
        if (!attempt || attempt.status !== 'SUCCEEDED') throw badRequest('PAYMENT_NOT_CAPTURED', 'Only a verified payment can be refunded');
        const captured = attempt.verifiedAmountIrrMinor ?? attempt.amountIrrMinor;
        const amount = BigInt(body.amountIrr);
        // Requested refunds do not hold funds yet, but the requested amount must still fit.
        assertRefundWithinCap(captured, asRecords(attempt.refunds), amount);
        const refund = await tx.refund.create({
          data: {
            reference: humanReference(REFERENCE_PREFIX.refund), paymentAttemptId: attempt.id, amountIrrMinor: amount, reason: body.reason,
            returnRequestId: body.returnRequestId ?? null, requestedById: actor.userId, idempotencyKey: `${actor.userId}:${key}`,
          },
        });
        await this.audit.record(tx, { action: 'refund.requested', entityType: 'refund', entityId: refund.id, after: { amountIrr: amount, reason: body.reason } });
        return { id: refund.id, reference: refund.reference, status: refund.status, remainingIrr: remainingRefundable(captured, asRecords(attempt.refunds)).toString() };
      }),
    );
  }

  /** REQUESTED → APPROVED (funds held, re-checked under lock) or REJECTED. */
  async decideRefund(actor: Actor, id: string, decision: 'APPROVED' | 'REJECTED', reason: string | undefined) {
    return this.prisma.tx(async (tx) => {
      const refund = await tx.refund.findUnique({ where: { id } });
      if (!refund) throw notFound();
      await tx.$queryRaw`SELECT "id" FROM "payment_attempt" WHERE "id" = ${refund.paymentAttemptId}::uuid FOR UPDATE`;
      assertTransition('refund', refund.status, decision, reason);
      if (decision === 'APPROVED') {
        const attempt = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: refund.paymentAttemptId }, include: { refunds: { where: { id: { not: id } } } } });
        assertRefundWithinCap(attempt.verifiedAmountIrrMinor ?? attempt.amountIrrMinor, asRecords(attempt.refunds), refund.amountIrrMinor);
      }
      const res = await tx.refund.updateMany({ where: { id, status: refund.status }, data: { status: decision, approvedById: actor.userId, version: { increment: 1 } } });
      if (res.count !== 1) throw new DomainError('VERSION_CONFLICT');
      await this.transitions.record(tx, { machine: 'refund', subjectType: 'REFUND', subjectId: id, from: refund.status, to: decision, reason: reason ?? null });
      await this.audit.record(tx, { action: `refund.${decision.toLowerCase()}`, entityType: 'refund', entityId: id, after: { reason } });
      return { id, status: decision };
    });
  }

  /**
   * Executes an approved refund through the provider when supported; otherwise
   * finance records the verified manual bank reference. Requested ≠ done.
   */
  async executeRefund(actor: Actor, id: string, manualReference?: string) {
    const refund = await this.prisma.refund.findUnique({ where: { id }, include: { paymentAttempt: true } });
    if (!refund) throw notFound();
    if (refund.status !== 'APPROVED' && refund.status !== 'FAILED') throw conflict('REFUND_NOT_APPROVED');
    const moved = await this.prisma.tx(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "payment_attempt" WHERE "id" = ${refund.paymentAttemptId}::uuid FOR UPDATE`;
      if (refund.status === 'FAILED') {
        // A failed refund holds no funds, so other refunds may have been approved since.
        // Retrying it must still fit under what was captured (never refund twice).
        const attempt = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: refund.paymentAttemptId }, include: { refunds: { where: { id: { not: id } } } } });
        assertRefundWithinCap(attempt.verifiedAmountIrrMinor ?? attempt.amountIrrMinor, asRecords(attempt.refunds), refund.amountIrrMinor);
      }
      return tx.refund.updateMany({ where: { id, status: refund.status }, data: { status: 'PROCESSING', processedById: actor.userId } });
    });
    if (moved.count !== 1) throw new DomainError('VERSION_CONFLICT');
    let outcome: { status: 'SUCCEEDED' | 'FAILED' | 'PROCESSING'; providerRefundReference: string | null; raw: Record<string, unknown> };
    const provider = this.registry.byCode(refund.paymentAttempt.provider);
    if (manualReference) {
      outcome = { status: 'SUCCEEDED', providerRefundReference: null, raw: { manual: true } };
    } else if (provider?.refund && provider.supportsRefund && refund.paymentAttempt.providerReference) {
      try {
        outcome = await provider.refund({
          refundId: refund.id, providerReference: refund.paymentAttempt.providerReference,
          providerTransactionId: refund.paymentAttempt.providerTransactionId, amountIrr: refund.amountIrrMinor,
        });
      } catch (e) {
        outcome = { status: 'FAILED', providerRefundReference: null, raw: { error: e instanceof Error ? e.message.slice(0, 200) : 'error' } };
      }
    } else {
      await this.prisma.refund.update({ where: { id }, data: { status: refund.status } });
      throw badRequest('MANUAL_REFERENCE_REQUIRED', 'This provider has no refund API; record the bank transfer reference');
    }
    return this.prisma.tx(async (tx) => {
      const final = outcome.status === 'PROCESSING' ? 'PROCESSING' : outcome.status;
      await tx.refund.update({
        where: { id },
        data: {
          status: final, providerRefundReference: outcome.providerRefundReference, manualReference: manualReference ?? null,
          providerResult: outcome.raw as object, completedAt: final === 'SUCCEEDED' ? new Date() : null, version: { increment: 1 },
        },
      });
      if (final !== 'PROCESSING') {
        await this.transitions.record(tx, { machine: 'refund', subjectType: 'REFUND', subjectId: id, from: 'PROCESSING', to: final, reason: manualReference ? 'MANUAL' : null });
      }
      if (final === 'SUCCEEDED') {
        const attempt = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: refund.paymentAttemptId }, include: { refunds: true } });
        const refunded = attempt.refunds.filter((r) => r.status === 'SUCCEEDED').reduce((s, r) => s + r.amountIrrMinor, 0n);
        const captured = attempt.verifiedAmountIrrMinor ?? attempt.amountIrrMinor;
        const status = refunded >= captured ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
        if (attempt.orderId) await tx.order.update({ where: { id: attempt.orderId }, data: { paymentStatus: status } });
        if (attempt.procurementId) await tx.procurement.update({ where: { id: attempt.procurementId }, data: { paymentStatus: status } });
        await this.outbox.notify(tx, { userId: attempt.customerId, type: 'refund.succeeded', params: { reference: refund.reference }, linkPath: '/account/returns', dedupeKey: `refund-done:${id}` });
      }
      await this.audit.record(tx, { action: 'refund.executed', entityType: 'refund', entityId: id, after: { status: final, manualReference } });
      return { id, status: final };
    });
  }
}
