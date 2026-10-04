import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { DashboardView } from '@hedax/contracts';
import { maskPhone } from '@hedax/domain';
import { z } from 'zod';
import { ENV, type Env } from '../../config/env.js';
import { AuditService } from '../../common/audit.service.js';
import { CurrentActor, RequirePermissions, StaffOnly } from '../../common/auth/decorators.js';
import { SessionService } from '../../common/auth/session.service.js';
import { badRequest, notFound } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Actor } from '../../common/request-context.js';
import { SCANNER, type MalwareScanner } from '../../common/storage/scanner.js';
import { STORAGE, type StorageDriver } from '../../common/storage/storage.js';
import { irr } from '../../common/serialize.js';
import { zod } from '../../common/zod.js';
import { PaymentProviderRegistry } from '../payments/provider-registry.js';
import { SettingsService } from '../settings/settings.service.js';

const rangeQuery = z.object({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});
const groupDecisionSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), note: z.string().max(500).optional() });
const auditQuery = z.object({ entityType: z.string().max(60).optional(), entityId: z.string().max(80).optional(), actorId: z.uuid().optional() });

const GROUP_FOR_TYPE: Record<string, string> = { WORKSHOP: 'workshop', WHOLESALER: 'wholesale' };

@ApiTags('admin/operations')
@Controller('admin')
export class OperationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    private readonly settings: SettingsService,
    private readonly registry: PaymentProviderRegistry,
    @Inject(ENV) private readonly env: Env,
    @Inject(STORAGE) private readonly storage: StorageDriver,
    @Inject(SCANNER) private readonly scanner: MalwareScanner,
  ) {}

  /** Work queues + an honest launch-readiness list (what is live vs simulated vs missing). */
  @StaffOnly()
  @RequirePermissions('dashboard.view')
  @Get('dashboard')
  async dashboard(): Promise<DashboardView> {
    const now = new Date();
    const [ordersNeedingAction, newSourcingRequests, paymentsPendingVerification, delayedProcurements, lowStock, unread, terms, rate] = await Promise.all([
      this.prisma.order.count({ where: { status: { in: ['CONFIRMED', 'PREPARING', 'EXCEPTION'] } } }),
      this.prisma.sourcingRequest.count({ where: { status: 'SUBMITTED' } }),
      this.prisma.paymentAttempt.count({ where: { status: 'PENDING_VERIFICATION' } }),
      this.prisma.procurement.count({ where: { currentReadyEstimate: { lt: now }, status: { in: ['PROCUREMENT_PENDING', 'SOURCING', 'PURCHASED', 'IN_TRANSIT_TO_WAREHOUSE', 'RECEIVED'] } } }),
      this.prisma.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*)::bigint AS n FROM "inventory_balance" ib JOIN "product" p ON p."id" = ib."product_id" WHERE p."archived_at" IS NULL AND p."published" AND ib."on_hand" - ib."reserved" <= ib."low_stock_threshold"`,
      this.prisma.conversation.count({ where: { lastMessageAt: { not: null }, messages: { some: { senderKind: 'CUSTOMER', createdAt: { gt: new Date(Date.now() - 7 * 86_400_000) } } } } }),
      this.settings.publishedPolicy('TERMS'),
      this.prisma.exchangeRate.findFirst({ where: { effectiveFrom: { lte: now } }, orderBy: { effectiveFrom: 'desc' } }),
    ]);
    const site = await this.settings.site();
    const storageOk = await this.storage.ping().catch(() => false);
    const launchReadiness: DashboardView['launchReadiness'] = [
      { key: 'payment_gateway', status: this.registry.simulator() ? 'SIMULATED' : this.registry.isConfigured() ? 'READY' : 'MISSING', note: this.registry.simulator() ? 'Test simulator only — no real payments' : this.registry.isConfigured() ? '' : 'No live gateway chosen/configured' },
      { key: 'sms', status: this.env.SMS_PROVIDER === 'dev-log' ? 'SIMULATED' : 'MISSING', note: this.env.SMS_PROVIDER === 'dev-log' ? 'Codes are only written to the dev log' : 'No SMS provider configured' },
      { key: 'malware_scanner', status: this.scanner.name === 'clamav' ? 'READY' : 'SIMULATED', note: this.scanner.name === 'clamav' ? '' : 'Files are not scanned (dev)' },
      { key: 'private_storage', status: this.storage.name === 's3' && storageOk ? 'READY' : this.storage.name === 'local' ? 'SIMULATED' : 'MISSING', note: this.storage.name === 'local' ? 'Local disk storage (development)' : '' },
      { key: 'domain', status: site.domain ? 'READY' : 'MISSING', note: site.domain ? '' : 'Domain not configured' },
      { key: 'terms_published', status: terms ? 'READY' : 'MISSING', note: terms ? '' : 'Publish terms of sale before selling' },
      { key: 'fx_rate', status: rate ? 'READY' : 'MISSING', note: rate ? '' : 'No AED rate recorded (AED prices show "inquiry")' },
      { key: 'contact_info', status: site.contactPhone || site.contactEmail ? 'READY' : 'MISSING', note: '' },
    ];
    return {
      ordersNeedingAction,
      newSourcingRequests,
      paymentsPendingVerification,
      delayedProcurements,
      lowStockProducts: Number(lowStock[0]?.n ?? 0n),
      unreadConversations: unread,
      launchReadiness,
    };
  }

  // ---- Customers & business groups ----

  @RequirePermissions('customers.read')
  @Get('customers')
  async customers(@Query('q') q?: string, @Query('pending') pending?: string) {
    const rows = await this.prisma.user.findMany({
      where: {
        kind: 'CUSTOMER',
        ...(q ? { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { mobileE164: { contains: q.replace(/\D/g, '').slice(-9) || '---' } }] } : {}),
        ...(pending === '1' ? { customerProfile: { groupStatus: 'PENDING' } } : {}),
      },
      include: { customerProfile: { include: { customerGroup: true } }, _count: { select: { orders: true, sourcingRequests: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((u) => ({
      id: u.id, fullName: u.fullName, mobile: u.mobileE164 ? maskPhone(u.mobileE164) : null, status: u.status,
      customerType: u.customerProfile?.customerType ?? 'CONSUMER', groupStatus: u.customerProfile?.groupStatus ?? 'NONE',
      requestedType: u.customerProfile?.requestedType ?? null, businessName: u.customerProfile?.businessName ?? null,
      group: u.customerProfile?.customerGroup?.key ?? null, orders: u._count.orders, requests: u._count.sourcingRequests, createdAt: u.createdAt.toISOString(),
    }));
  }

  /** Customer detail for authorized staff. The full phone number is shown only here, never in public payloads. */
  @RequirePermissions('customers.read')
  @Get('customers/:id')
  async customer(@Param('id', ParseUUIDPipe) id: string) {
    const u = await this.prisma.user.findFirst({
      where: { id, kind: 'CUSTOMER' },
      include: { customerProfile: { include: { customerGroup: true } }, addresses: { where: { archivedAt: null } }, orders: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
    if (!u) throw notFound();
    const files = await this.prisma.attachment.findMany({ where: { subjectType: 'BUSINESS_VERIFICATION', subjectId: id, deletedAt: null } });
    return {
      id: u.id, fullName: u.fullName, mobile: u.mobileE164, email: u.email, profile: u.customerProfile,
      addresses: u.addresses.map((a) => ({ id: a.id, city: a.city, province: a.province })),
      orders: u.orders.map((o) => ({ id: o.id, reference: o.reference, status: o.status, total: irr(o.grandTotalMinor) })),
      verificationFiles: files.map((f) => ({ id: f.id, filename: f.originalFilename, status: f.status })),
    };
  }

  /** Business/wholesale approval: the only way a customer gets group prices. */
  @RequirePermissions('customers.groups.approve')
  @Post('customers/:id/group-decision')
  async groupDecision(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(groupDecisionSchema)) body: z.infer<typeof groupDecisionSchema>) {
    await this.prisma.tx(async (tx) => {
      const profile = await tx.customerProfile.findUnique({ where: { userId: id } });
      if (!profile || profile.groupStatus !== 'PENDING' || !profile.requestedType) throw badRequest('NO_PENDING_REQUEST');
      const group = await tx.customerGroup.findUnique({ where: { key: GROUP_FOR_TYPE[profile.requestedType] ?? '' } });
      if (body.decision === 'APPROVED' && !group) throw badRequest('GROUP_NOT_CONFIGURED');
      await tx.customerProfile.update({
        where: { userId: id },
        data: body.decision === 'APPROVED'
          ? { groupStatus: 'APPROVED', customerType: profile.requestedType, customerGroupId: group?.id ?? null, groupDecidedById: actor.userId, groupDecidedAt: new Date(), groupDecisionNote: body.note ?? null }
          : { groupStatus: 'REJECTED', groupDecidedById: actor.userId, groupDecidedAt: new Date(), groupDecisionNote: body.note ?? null },
      });
      await this.audit.record(tx, { action: `customer.group_${body.decision.toLowerCase()}`, entityType: 'customer', entityId: id, after: { requestedType: profile.requestedType, note: body.note } });
    });
    // New price visibility applies from the next request; sessions are refreshed.
    await this.sessions.revokeAllForUser(id, 'GROUP_CHANGED');
    return { id, decision: body.decision };
  }

  // ---- Reports (quotes issued ≠ sales; collections = verified IRR payments) ----

  @RequirePermissions('reports.read')
  @Get('reports/summary')
  async summary(@CurrentActor() actor: Actor, @Query(zod(rangeQuery)) q: z.infer<typeof rangeQuery>) {
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 30 * 86_400_000);
    const to = q.to ? new Date(q.to) : new Date();
    const [ordersByStatus, topItems, requests, converted, quotesIssued] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], where: { createdAt: { gte: from, lt: to } }, _count: true }),
      this.prisma.$queryRaw<Array<{ sku: string; name: string; qty: bigint; revenue: bigint }>>`
        SELECT oi."sku_snapshot" AS sku, oi."name_fa_snapshot" AS name, SUM(oi."quantity")::bigint AS qty, SUM(oi."line_total_minor")::bigint AS revenue
          FROM "order_item" oi JOIN "order" o ON o."id" = oi."order_id"
         WHERE o."payment_status" IN ('PAID', 'PARTIALLY_REFUNDED') AND o."created_at" >= ${from} AND o."created_at" < ${to}
         GROUP BY 1, 2 ORDER BY qty DESC LIMIT 10`,
      this.prisma.sourcingRequest.count({ where: { createdAt: { gte: from, lt: to } } }),
      this.prisma.sourcingRequest.count({ where: { createdAt: { gte: from, lt: to }, status: { in: ['CONVERTED', 'CLOSED'] }, quotes: { some: { versions: { some: { procurement: { paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] } } } } } } } }),
      this.prisma.quoteVersion.aggregate({ where: { sentAt: { gte: from, lt: to } }, _sum: { totalPayableIrrMinor: true }, _count: true }),
    ]);
    const base = {
      range: { from: from.toISOString(), to: to.toISOString() },
      ordersByStatus: ordersByStatus.map((o) => ({ status: o.status, count: o._count })),
      topItems: topItems.map((t) => ({ sku: t.sku, name: t.name, quantity: Number(t.qty), revenue: irr(t.revenue) })),
      sourcing: { requests, convertedToPaidOrders: converted },
      // Value of issued quotes is NOT revenue; it is reported separately on purpose.
      quotesIssued: { count: quotesIssued._count, totalValue: irr(quotesIssued._sum.totalPayableIrrMinor ?? 0n) },
    };
    if (!actor.permissions.has('reports.financial')) return base;
    const [collected, refunded] = await Promise.all([
      this.prisma.paymentAttempt.aggregate({ where: { status: 'SUCCEEDED', verifiedAt: { gte: from, lt: to } }, _sum: { verifiedAmountIrrMinor: true }, _count: true }),
      this.prisma.refund.aggregate({ where: { status: 'SUCCEEDED', completedAt: { gte: from, lt: to } }, _sum: { amountIrrMinor: true }, _count: true }),
    ]);
    const c = collected._sum.verifiedAmountIrrMinor ?? 0n;
    const r = refunded._sum.amountIrrMinor ?? 0n;
    return { ...base, financial: { collections: irr(c), collectionsCount: collected._count, refunds: irr(r), refundsCount: refunded._count, net: irr(c - r), currency: 'IRR' } };
  }

  @RequirePermissions('audit.read')
  @Get('audit')
  async auditLog(@Query(zod(auditQuery)) q: z.infer<typeof auditQuery>) {
    const rows = await this.prisma.auditLog.findMany({
      where: { ...(q.entityType ? { entityType: q.entityType } : {}), ...(q.entityId ? { entityId: q.entityId } : {}), ...(q.actorId ? { actorId: q.actorId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { actor: { select: { fullName: true } } },
    });
    return rows.map((a) => ({
      id: a.id, at: a.createdAt.toISOString(), actor: a.actor?.fullName ?? a.actorKind, action: a.action, entityType: a.entityType, entityId: a.entityId,
      before: a.before, after: a.after, requestId: a.requestId,
    }));
  }
}
