import { Injectable } from '@nestjs/common';
import type { OrderView, TimelineEvent } from '@hedax/contracts';
import { DomainError } from '@hedax/domain';
import type { StockOrderStatus } from '../../generated/prisma/enums.js';
import { AuditService } from '../../common/audit.service.js';
import { badRequest, conflict, notFound } from '../../common/errors.js';
import { OutboxService } from '../../common/outbox.service.js';
import { Prisma, PrismaService } from '../../common/prisma.service.js';
import type { Actor } from '../../common/request-context.js';
import { irr } from '../../common/serialize.js';
import { TransitionsService } from '../../common/transitions.service.js';

const orderInclude = {
  items: true,
  shipments: { include: { shippingMethod: true }, orderBy: { createdAt: 'desc' } },
  payments: { where: { status: 'SUCCEEDED' } },
  shippingMethod: true,
} satisfies Prisma.OrderInclude;

type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export function trackingUrl(template: string | null, code: string | null): string | null {
  if (!template || !code) return null;
  return template.replace('{code}', encodeURIComponent(code));
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: TransitionsService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async timeline(subjectType: 'STOCK_ORDER' | 'PROCUREMENT', subjectId: string, includeInternal: boolean): Promise<TimelineEvent[]> {
    const events = await this.prisma.orderEvent.findMany({
      where: { subjectType, subjectId, ...(includeInternal ? {} : { customerVisible: true }) },
      orderBy: { createdAt: 'asc' },
    });
    return events.map((e) => ({
      at: e.createdAt.toISOString(),
      type: e.type,
      fromState: e.fromState,
      toState: e.toState,
      // Reasons for internal exceptions are shown to staff only.
      note: includeInternal || e.toState !== 'EXCEPTION' ? e.reason : null,
      actor: e.actorKind === 'CUSTOMER' ? 'CUSTOMER' : e.actorKind === 'STAFF' ? 'STAFF' : 'SYSTEM',
    }));
  }

  async toView(order: OrderWithRelations, includeInternal: boolean): Promise<OrderView> {
    const address = order.addressSnapshot as { recipientName: string; province: string; city: string; addressLine: string; postalCode: string };
    const shipment = order.shipments[0];
    const conversation = await this.prisma.conversation.findUnique({ where: { subjectKind_subjectId: { subjectKind: 'STOCK_ORDER', subjectId: order.id } }, select: { id: true } });
    return {
      id: order.id,
      reference: order.reference,
      kind: 'STOCK_ORDER',
      status: order.status,
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt.toISOString(),
      lines: order.items.map((i) => ({
        id: i.id,
        returnableQuantity: order.status === 'DELIVERED' ? Math.max(0, i.quantity - i.returnedQuantity) : 0,
        sku: i.skuSnapshot,
        name: { fa: i.nameFaSnapshot, en: i.nameEnSnapshot },
        partType: i.partType,
        condition: i.condition,
        quantity: i.quantity,
        unitPrice: irr(i.unitPriceMinor),
        lineTotal: irr(i.lineTotalMinor),
      })),
      totals: {
        items: irr(order.itemsTotalMinor),
        shipping: irr(order.shippingMinor),
        tax: irr(order.taxMinor),
        discount: irr(order.discountMinor),
        grandTotal: irr(order.grandTotalMinor),
      },
      fx: order.irrPerAed ? { irrPerAed: order.irrPerAed.toString(), recordedAt: order.createdAt.toISOString() } : null,
      address: { recipientName: address.recipientName, province: address.province, city: address.city, addressLine: address.addressLine, postalCode: address.postalCode },
      shipment: shipment
        ? {
            method: shipment.shippingMethod.nameFa,
            trackingCode: shipment.trackingCode,
            trackingUrl: trackingUrl(shipment.shippingMethod.trackingUrlTemplate, shipment.trackingCode),
            shippedAt: shipment.shippedAt?.toISOString() ?? null,
            deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
          }
        : null,
      schedule: null,
      timeline: await this.timeline('STOCK_ORDER', order.id, includeInternal),
      receipts: order.payments.map((p) => ({
        attemptId: p.id,
        amount: irr(p.amountIrrMinor),
        paidAt: (p.verifiedAt as Date).toISOString(),
        providerReference: p.providerTransactionId,
      })),
      policyVersion: { id: order.policyVersionId, version: 0 },
      conversationId: conversation?.id ?? null,
    };
  }

  async listForCustomer(actor: Actor) {
    const rows = await this.prisma.order.findMany({ where: { userId: actor.userId }, orderBy: { createdAt: 'desc' }, take: 100 });
    return rows.map((o) => ({
      id: o.id, reference: o.reference, status: o.status, paymentStatus: o.paymentStatus, grandTotal: irr(o.grandTotalMinor), createdAt: o.createdAt.toISOString(),
    }));
  }

  /** Object-level access: another customer's order id yields 404, never its data (A17). */
  async getForCustomer(actor: Actor, id: string): Promise<OrderView> {
    const order = await this.prisma.order.findFirst({ where: { id, userId: actor.userId }, include: orderInclude });
    if (!order) throw notFound();
    return this.toView(order, false);
  }

  async listForAdmin(status?: StockOrderStatus) {
    const rows = await this.prisma.order.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { fullName: true } } },
    });
    return rows.map((o) => ({
      id: o.id, reference: o.reference, status: o.status, paymentStatus: o.paymentStatus, customer: o.user.fullName,
      grandTotal: irr(o.grandTotalMinor), createdAt: o.createdAt.toISOString(), version: o.version,
    }));
  }

  async getForAdmin(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!order) throw notFound();
    return { ...(await this.toView(order, true)), version: order.version };
  }

  /**
   * Staff status change with optimistic lock. Shipping requires a shipment
   * record; cancelling a paid order opens a refund request for finance.
   */
  async transition(id: string, input: { toState: string; reason?: string; version: number; shipment?: { shippingMethodId: string; carrierCode?: string; trackingCode?: string } }) {
    const to = input.toState as StockOrderStatus;
    return this.prisma.tx(async (tx) => {
      const order = await tx.order.findUnique({ where: { id }, include: { payments: { where: { status: 'SUCCEEDED' } }, reservations: { where: { status: 'ACTIVE' } } } });
      if (!order) throw notFound();
      if (order.version !== input.version) throw new DomainError('VERSION_CONFLICT');
      if (to === 'CONFIRMED' && order.status === 'AWAITING_PAYMENT') throw conflict('PAYMENT_REQUIRED', 'Orders are confirmed only by a verified payment');
      await this.transitions.record(tx, { machine: 'stockOrder', subjectType: 'STOCK_ORDER', subjectId: id, from: order.status, to, reason: input.reason ?? null });
      const res = await tx.order.updateMany({
        where: { id, version: input.version, status: order.status },
        data: { status: to, version: { increment: 1 }, ...(to === 'CANCELLED' ? { cancelledAt: new Date() } : {}) },
      });
      if (res.count !== 1) throw new DomainError('VERSION_CONFLICT');

      if (to === 'SHIPPED') {
        if (!input.shipment) throw badRequest('SHIPMENT_REQUIRED', 'Record the shipping method (and tracking code if any)');
        await tx.shipment.create({
          data: {
            orderId: id, shippingMethodId: input.shipment.shippingMethodId, carrierCode: input.shipment.carrierCode ?? null,
            trackingCode: input.shipment.trackingCode ?? null, destinationSnapshot: order.addressSnapshot as Prisma.InputJsonValue,
            costIrrMinor: order.shippingMinor, status: 'SHIPPED', shippedAt: new Date(),
          },
        });
      }
      if (to === 'DELIVERED') {
        await tx.shipment.updateMany({ where: { orderId: id, status: 'SHIPPED' }, data: { status: 'DELIVERED', deliveredAt: new Date() } });
      }
      if (to === 'CANCELLED') {
        for (const r of order.reservations) {
          await tx.inventoryReservation.updateMany({ where: { id: r.id, status: 'ACTIVE' }, data: { status: 'RELEASED', releasedAt: new Date(), releaseReason: 'CANCELLED' } });
          await tx.$executeRaw`UPDATE "inventory_balance" SET "reserved" = "reserved" - ${r.quantity}, "version" = "version" + 1 WHERE "product_id" = ${r.productId}::uuid AND "warehouse_id" = ${r.warehouseId}::uuid`;
        }
        const paid = order.payments[0];
        if (paid) {
          await tx.resolutionCase.createMany({
            data: [{ kind: 'UNFULFILLABLE_AFTER_PAYMENT', subjectType: 'STOCK_ORDER', subjectId: id, paymentAttemptId: paid.id, amountIrrMinor: paid.amountIrrMinor, note: `Cancelled after payment: ${input.reason ?? ''}` }],
            skipDuplicates: true,
          });
        }
      }
      await this.audit.record(tx, { action: 'order.status_changed', entityType: 'order', entityId: id, before: { status: order.status }, after: { status: to, reason: input.reason } });
      await this.outbox.notify(tx, {
        userId: order.userId, type: `order.${to.toLowerCase()}`, params: { reference: order.reference }, linkPath: `/account/orders/${id}`,
        dedupeKey: `order:${id}:${to}:${order.version}`, sms: to === 'SHIPPED',
      });
      return { id, status: to };
    });
  }
}
