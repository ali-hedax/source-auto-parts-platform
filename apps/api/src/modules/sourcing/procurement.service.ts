import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { OrderView } from '@hedax/contracts';
import { type BusinessCalendar, DomainError, type LeadTimeRange, computeQuoteSchedule } from '@hedax/domain';
import type { PaymentAttempt, ProcurementItemStatus, ProcurementStatus } from '../../generated/prisma/client.js';
import { AuditService } from '../../common/audit.service.js';
import { badRequest, notFound } from '../../common/errors.js';
import { OutboxService } from '../../common/outbox.service.js';
import { Prisma, PrismaService, type Tx } from '../../common/prisma.service.js';
import type { Actor } from '../../common/request-context.js';
import { irr, moneyDto } from '../../common/serialize.js';
import { TransitionsService } from '../../common/transitions.service.js';
import { OrdersService, trackingUrl } from '../orders/orders.service.js';
import { PaymentsService, type SettlementHandler } from '../payments/payments.service.js';

/**
 * Procurement orders: created on quote acceptance (AWAITING_PAYMENT) and started
 * only by a server-verified payment. Promised dates are fixed at payment time;
 * later changes are recorded with a reason and notified (spec §10).
 */
@Injectable()
export class ProcurementService implements SettlementHandler, OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly transitions: TransitionsService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly orders: OrdersService,
  ) {}

  onModuleInit(): void {
    this.payments.registerHandler('PROCUREMENT', this);
  }

  async lockSubject(tx: Tx, id: string): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "procurement" WHERE "id" = ${id}::uuid FOR UPDATE`;
  }

  async onSettled(tx: Tx, attempt: PaymentAttempt, verifiedAt: Date): Promise<void> {
    const p = await tx.procurement.findUniqueOrThrow({
      where: { id: attempt.procurementId as string },
      include: { quoteVersion: { include: { items: true, quote: true } } },
    });
    await tx.procurement.update({ where: { id: p.id }, data: { paymentStatus: 'PAID' } });
    if (p.status !== 'AWAITING_PAYMENT') {
      await tx.resolutionCase.createMany({
        data: [{ kind: 'PAYMENT_AFTER_FAILURE', subjectType: 'PROCUREMENT', subjectId: p.id, paymentAttemptId: attempt.id, amountIrrMinor: attempt.verifiedAmountIrrMinor ?? attempt.amountIrrMinor, note: `Payment verified while procurement is ${p.status}` }],
        skipDuplicates: true,
      });
      return;
    }
    const v = p.quoteVersion;
    const included = v.items.filter((i) => i.included && i.availability === 'AVAILABLE');
    const calendar = (v.calendarSnapshot as unknown as BusinessCalendar | null) ?? null;
    const schedule = computeQuoteSchedule(
      verifiedAt,
      included.map((i) => ({ itemId: i.id, leadTime: { min: i.leadMin, max: i.leadMax, unit: i.leadUnit, dayKind: i.leadDayKind } })),
      (v.shippingLeadTime as unknown as LeadTimeRange | null) ?? null,
      calendar,
    );
    await this.transitions.record(tx, { machine: 'procurement', subjectType: 'PROCUREMENT', subjectId: p.id, from: 'AWAITING_PAYMENT', to: 'PROCUREMENT_PENDING', actorKind: 'SYSTEM', actorId: null, data: { attemptId: attempt.id } });
    await tx.procurement.update({
      where: { id: p.id },
      data: {
        status: 'PROCUREMENT_PENDING',
        paidAt: verifiedAt,
        promisedReadyAt: schedule.readyToShip.latest,
        currentReadyEstimate: schedule.readyToShip.latest,
        promisedDeliveryAt: schedule.delivery?.latest ?? null,
        currentDeliveryEstimate: schedule.delivery?.latest ?? null,
        version: { increment: 1 },
      },
    });
    const req = await tx.sourcingRequest.findUniqueOrThrow({ where: { id: v.quote.requestId } });
    if (req.status === 'QUOTED') {
      await this.transitions.record(tx, { machine: 'sourcingRequest', subjectType: 'SOURCING_REQUEST', subjectId: req.id, from: 'QUOTED', to: 'CONVERTED', actorKind: 'SYSTEM', actorId: null });
      await tx.sourcingRequest.update({ where: { id: req.id }, data: { status: 'CONVERTED', version: { increment: 1 } } });
    }
    await this.outbox.enqueue(tx, { type: 'procurement.started', aggregateType: 'procurement', aggregateId: p.id, payload: { procurementId: p.id }, dedupeKey: `proc-started:${p.id}` });
    await this.outbox.notify(tx, { userId: p.customerId, type: 'procurement.paid', params: { reference: p.reference }, linkPath: `/account/procurements/${p.id}`, dedupeKey: `proc-paid:${p.id}`, sms: true });
  }

  /** Failed payment: the procurement stays AWAITING_PAYMENT; nothing starts (A14). */
  async onFailed(): Promise<void> {
    return;
  }

  async listForCustomer(actor: Actor) {
    const rows = await this.prisma.procurement.findMany({ where: { customerId: actor.userId }, orderBy: { createdAt: 'desc' }, include: { quoteVersion: { include: { quote: true } } } });
    return rows.map((p) => ({
      id: p.id, reference: p.reference, status: p.status, paymentStatus: p.paymentStatus, total: irr(p.totalPayableIrrMinor),
      quoteReference: p.quoteVersion.quote.reference, promisedReadyAt: p.promisedReadyAt?.toISOString() ?? null, createdAt: p.createdAt.toISOString(),
    }));
  }

  private async toView(id: string, includeInternal: boolean): Promise<OrderView & { quoteVersionId: string }> {
    const p = await this.prisma.procurement.findUniqueOrThrow({
      where: { id },
      include: {
        items: { include: { quoteItem: true } },
        payments: { where: { status: 'SUCCEEDED' } },
        shipments: { include: { shippingMethod: true }, orderBy: { createdAt: 'desc' } },
        dateChanges: { orderBy: { createdAt: 'desc' }, take: 1 },
        quoteVersion: { include: { quote: true } },
      },
    });
    const shipment = p.shipments[0];
    const conv = await this.prisma.conversation.findUnique({ where: { subjectKind_subjectId: { subjectKind: 'SOURCING_REQUEST', subjectId: p.quoteVersion.quote.requestId } }, select: { id: true } });
    const v = p.quoteVersion;
    return {
      id: p.id,
      reference: p.reference,
      kind: 'PROCUREMENT',
      status: p.status,
      paymentStatus: p.paymentStatus,
      createdAt: p.createdAt.toISOString(),
      lines: p.items.map((i) => ({
        id: i.id,
        returnableQuantity: 0,
        sku: '',
        name: { fa: i.description, en: null },
        partType: i.quoteItem.partType,
        condition: i.quoteItem.condition,
        quantity: i.quantity,
        unitPrice: moneyDto(i.quoteItem.unitPriceCurrency, i.quoteItem.unitPriceMinor),
        lineTotal: irr(i.quoteItem.lineTotalIrrMinor ?? 0n),
      })),
      totals: { items: irr(v.itemsIrrMinor), shipping: null, tax: irr(v.taxIrrMinor), discount: irr(0n), grandTotal: irr(p.totalPayableIrrMinor) },
      fx: v.irrPerAed ? { irrPerAed: v.irrPerAed.toString(), recordedAt: (v.sentAt ?? v.createdAt).toISOString() } : null,
      address: null,
      shipment: shipment
        ? {
            method: shipment.shippingMethod.nameFa, trackingCode: shipment.trackingCode,
            trackingUrl: trackingUrl(shipment.shippingMethod.trackingUrlTemplate, shipment.trackingCode),
            shippedAt: shipment.shippedAt?.toISOString() ?? null, deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
          }
        : null,
      schedule: {
        promisedReadyAt: p.promisedReadyAt?.toISOString() ?? null,
        currentReadyEstimate: p.currentReadyEstimate?.toISOString() ?? null,
        changeReason: p.dateChanges[0]?.reason ?? null,
      },
      timeline: await this.orders.timeline('PROCUREMENT', p.id, includeInternal),
      receipts: p.payments.map((a) => ({ attemptId: a.id, amount: irr(a.amountIrrMinor), paidAt: (a.verifiedAt as Date).toISOString(), providerReference: a.providerTransactionId })),
      policyVersion: { id: v.termsPolicyVersionId, version: 0 },
      conversationId: conv?.id ?? null,
      quoteVersionId: v.id,
    };
  }

  async getForCustomer(actor: Actor, id: string) {
    const p = await this.prisma.procurement.findFirst({ where: { id, customerId: actor.userId }, select: { id: true } });
    if (!p) throw notFound();
    return this.toView(id, false);
  }

  async listForStaff(status?: ProcurementStatus) {
    const rows = await this.prisma.procurement.findMany({
      where: status ? { status } : {},
      orderBy: [{ currentReadyEstimate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 200,
      include: { customer: { select: { fullName: true } }, assignee: { select: { fullName: true } } },
    });
    const now = Date.now();
    return rows.map((p) => ({
      id: p.id, reference: p.reference, status: p.status, paymentStatus: p.paymentStatus, customer: p.customer.fullName, assignee: p.assignee?.fullName ?? null,
      total: irr(p.totalPayableIrrMinor), promisedReadyAt: p.promisedReadyAt?.toISOString() ?? null, currentReadyEstimate: p.currentReadyEstimate?.toISOString() ?? null,
      delayed: !!p.currentReadyEstimate && p.currentReadyEstimate.getTime() < now && !['READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'CANCELLED'].includes(p.status),
      version: p.version,
    }));
  }

  async getForStaff(actor: Actor, id: string) {
    const exists = await this.prisma.procurement.findUnique({ where: { id }, include: { items: { include: { supplier: true } }, dateChanges: { orderBy: { createdAt: 'desc' } } } });
    if (!exists) throw notFound();
    const view = await this.toView(id, true);
    const showCosts = actor.permissions.has('costs.read');
    return {
      ...view,
      version: exists.version,
      items: exists.items.map((i) => ({
        id: i.id, description: i.description, quantity: i.quantity, status: i.status, supplier: i.supplier?.name ?? null, supplierOrderRef: i.supplierOrderRef,
        unitCost: showCosts && i.unitCostCurrency && i.unitCostMinor !== null ? moneyDto(i.unitCostCurrency, i.unitCostMinor) : null,
        internalNote: i.internalNote,
      })),
      dateChanges: exists.dateChanges.map((d) => ({ field: d.field, previous: d.previousEstimate?.toISOString() ?? null, next: d.newEstimate.toISOString(), reason: d.reason, at: d.createdAt.toISOString() })),
    };
  }

  async transition(id: string, to: ProcurementStatus, reason: string | undefined, version: number, shipment?: { shippingMethodId: string; trackingCode?: string; carrierCode?: string }) {
    return this.prisma.tx(async (tx) => {
      const p = await tx.procurement.findUnique({ where: { id } });
      if (!p) throw notFound();
      if (p.version !== version) throw new DomainError('VERSION_CONFLICT');
      if (p.status === 'AWAITING_PAYMENT') throw badRequest('PAYMENT_REQUIRED', 'Procurement starts only after a verified payment');
      await this.transitions.record(tx, { machine: 'procurement', subjectType: 'PROCUREMENT', subjectId: id, from: p.status, to, reason: reason ?? null });
      const res = await tx.procurement.updateMany({ where: { id, version }, data: { status: to, version: { increment: 1 } } });
      if (res.count !== 1) throw new DomainError('VERSION_CONFLICT');
      if (to === 'SHIPPED') {
        if (!shipment) throw badRequest('SHIPMENT_REQUIRED');
        await tx.shipment.create({
          data: { procurementId: id, shippingMethodId: shipment.shippingMethodId, trackingCode: shipment.trackingCode ?? null, carrierCode: shipment.carrierCode ?? null, destinationSnapshot: (p.addressSnapshot ?? {}) as Prisma.InputJsonValue, status: 'SHIPPED', shippedAt: new Date() },
        });
      }
      if (to === 'DELIVERED') await tx.shipment.updateMany({ where: { procurementId: id, status: 'SHIPPED' }, data: { status: 'DELIVERED', deliveredAt: new Date() } });
      if ((to === 'CANCELLED' || to === 'EXCEPTION') && p.paymentStatus === 'PAID') {
        const paid = await tx.paymentAttempt.findFirst({ where: { procurementId: id, status: 'SUCCEEDED' } });
        await tx.resolutionCase.createMany({
          data: [{ kind: 'UNFULFILLABLE_AFTER_PAYMENT', subjectType: 'PROCUREMENT', subjectId: id, paymentAttemptId: paid?.id ?? null, amountIrrMinor: paid?.amountIrrMinor ?? null, note: reason ?? to }],
          skipDuplicates: true,
        });
      }
      await this.audit.record(tx, { action: 'procurement.status_changed', entityType: 'procurement', entityId: id, before: { status: p.status }, after: { status: to, reason } });
      await this.outbox.notify(tx, { userId: p.customerId, type: `procurement.${to.toLowerCase()}`, params: { reference: p.reference }, linkPath: `/account/procurements/${id}`, dedupeKey: `proc:${id}:${to}:${p.version}`, sms: to === 'SHIPPED' });
      return { id, status: to };
    });
  }

  /** Delay or earlier estimate: the original promise stays; every change has a reason and notifies the customer. */
  async changeEstimate(id: string, input: { field: 'READY' | 'DELIVERY'; newEstimate: Date; reason: string }, actorId: string) {
    return this.prisma.tx(async (tx) => {
      const p = await tx.procurement.findUnique({ where: { id } });
      if (!p) throw notFound();
      const previous = input.field === 'READY' ? p.currentReadyEstimate : p.currentDeliveryEstimate;
      await tx.procurementDateChange.create({ data: { procurementId: id, field: input.field, previousEstimate: previous, newEstimate: input.newEstimate, reason: input.reason, actorId, notifiedAt: new Date() } });
      await tx.procurement.update({
        where: { id },
        data: { ...(input.field === 'READY' ? { currentReadyEstimate: input.newEstimate } : { currentDeliveryEstimate: input.newEstimate }), version: { increment: 1 } },
      });
      await this.transitions.note(tx, { subjectType: 'PROCUREMENT', subjectId: id, type: 'ESTIMATE_CHANGED', reason: input.reason, data: { field: input.field, previous, next: input.newEstimate } });
      await this.outbox.notify(tx, { userId: p.customerId, type: 'procurement.delayed', params: { reference: p.reference }, linkPath: `/account/procurements/${id}`, dedupeKey: `proc-date:${id}:${input.newEstimate.toISOString()}`, sms: true });
      return { id };
    });
  }

  async updateItem(id: string, itemId: string, input: { status?: ProcurementItemStatus; supplierId?: string | null; supplierOrderRef?: string | null; unitCost?: { currency: 'IRR' | 'AED'; amountMinor: string } | null; internalNote?: string | null }) {
    return this.prisma.tx(async (tx) => {
      const item = await tx.procurementItem.findFirst({ where: { id: itemId, procurementId: id } });
      if (!item) throw notFound();
      await tx.procurementItem.update({
        where: { id: itemId },
        data: {
          ...(input.status ? { status: input.status, ...(input.status === 'PURCHASED' ? { purchasedAt: new Date() } : {}), ...(input.status === 'RECEIVED' ? { receivedAt: new Date() } : {}) } : {}),
          ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
          ...(input.supplierOrderRef !== undefined ? { supplierOrderRef: input.supplierOrderRef } : {}),
          ...(input.unitCost !== undefined ? { unitCostCurrency: input.unitCost?.currency ?? null, unitCostMinor: input.unitCost ? BigInt(input.unitCost.amountMinor) : null } : {}),
          ...(input.internalNote !== undefined ? { internalNote: input.internalNote } : {}),
        },
      });
      await this.audit.record(tx, { action: 'procurement.item_updated', entityType: 'procurement_item', entityId: itemId, after: input });
      return { id: itemId };
    });
  }
}
