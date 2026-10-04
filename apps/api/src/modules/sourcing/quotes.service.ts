import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { type QuoteDraft, type QuoteVersionStatus, type QuoteVersionView, type StaffQuoteRow, composeSystemText } from '@hedax/contracts';
import { DomainError, computeQuoteTotals, money, quotePaymentBlockers, sourcingScope, toPersianDigits, type QuoteItemInput } from '@hedax/domain';
import { REFERENCE_PREFIX, humanReference } from '@hedax/domain/server';
import type { PaymentRedirect } from '@hedax/contracts';
import { AuditService } from '../../common/audit.service.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors.js';
import { IdempotencyService } from '../../common/idempotency.service.js';
import { OutboxService } from '../../common/outbox.service.js';
import { Prisma, PrismaService, type Tx } from '../../common/prisma.service.js';
import type { Actor } from '../../common/request-context.js';
import { irr, moneyDto, toJsonSafe } from '../../common/serialize.js';
import { TransitionsService } from '../../common/transitions.service.js';
import { ConversationsService } from '../conversations/conversations.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { PricingService } from '../pricing/pricing.service.js';
import { SettingsService } from '../settings/settings.service.js';

const versionInclude = {
  quote: { include: { request: true } },
  items: { orderBy: { sortOrder: 'asc' }, include: { internalCost: true } },
  costs: true,
  termsPolicy: true,
  procurement: { include: { payments: true } },
} satisfies Prisma.QuoteVersionInclude;
type VersionRow = Prisma.QuoteVersionGetPayload<{ include: typeof versionInclude }>;

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly settings: SettingsService,
    private readonly payments: PaymentsService,
    private readonly conversations: ConversationsService,
    private readonly transitions: TransitionsService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
  ) {}

  private assertStaffScope(actor: Actor, request: { assigneeId: string | null }): void {
    const scope = sourcingScope(actor.permissions);
    if (scope === 'ALL' || (scope === 'ASSIGNED' && request.assigneeId === actor.userId)) return;
    throw notFound();
  }

  private itemsForTotals(items: VersionRow['items'] | QuoteDraft['items'], useIncluded: boolean): QuoteItemInput[] {
    return (items as Array<Record<string, unknown>>).map((raw, index) => {
      const i = raw as {
        id?: string; availability: 'AVAILABLE' | 'UNAVAILABLE'; included?: boolean; quantity: number;
        unitPriceCurrency?: 'IRR' | 'AED'; unitPriceMinor?: bigint; discountCurrency?: 'IRR' | 'AED' | null; discountMinor?: bigint | null;
        unitPrice?: { currency: 'IRR' | 'AED'; amountMinor: string }; discount?: { currency: 'IRR' | 'AED'; amountMinor: string } | null;
      };
      const unitPrice = i.unitPrice ? money(i.unitPrice.currency, i.unitPrice.amountMinor) : money(i.unitPriceCurrency as 'IRR', i.unitPriceMinor as bigint);
      const discount = i.discount
        ? money(i.discount.currency, i.discount.amountMinor)
        : i.discountCurrency && i.discountMinor !== null && i.discountMinor !== undefined
          ? money(i.discountCurrency, i.discountMinor)
          : null;
      return {
        id: i.id ?? String(index),
        availability: i.availability,
        included: useIncluded ? (i.included ?? true) : true,
        quantity: i.quantity,
        unitPrice,
        discount,
      };
    });
  }

  private hash(content: unknown): string {
    return createHash('sha256').update(JSON.stringify(toJsonSafe(content))).digest('hex');
  }

  /** Creates or replaces the single DRAFT version of a request's quote. Nothing is visible to the customer yet. */
  async saveDraft(actor: Actor, requestId: string, body: QuoteDraft) {
    const request = await this.prisma.sourcingRequest.findUnique({ where: { id: requestId } });
    if (!request) throw notFound();
    this.assertStaffScope(actor, request);
    if (['CANCELLED', 'CLOSED', 'CONVERTED'].includes(request.status)) throw conflict('REQUEST_CLOSED');
    const policy = await this.prisma.policyVersion.findUnique({ where: { id: body.termsPolicyVersionId } });
    if (!policy || policy.status !== 'PUBLISHED' || !['TERMS', 'SOURCING'].includes(policy.kind)) throw badRequest('TERMS_NOT_PUBLISHED', 'Choose a published terms/sourcing policy');
    const hasBusiness = body.items.some((i) => i.leadTime.dayKind === 'BUSINESS') || body.shippingLeadTime?.dayKind === 'BUSINESS';
    const calendar = body.businessCalendarId ? await this.settings.calendarById(body.businessCalendarId) : await this.settings.defaultCalendar();
    if (hasBusiness && !calendar) throw badRequest('BUSINESS_CALENDAR_REQUIRED', 'Configure a business calendar before using business days');

    const usesAed = body.items.some((i) => i.unitPrice.currency === 'AED' || i.discount?.currency === 'AED') || body.costs.some((c) => c.amount.currency === 'AED');
    const rate = await this.pricing.currentRate();
    if (usesAed && !rate) throw badRequest('FX_RATE_UNAVAILABLE', 'Record an exchange rate before quoting in AED');
    const tax = await this.settings.taxRule();
    const totals = computeQuoteTotals({
      items: this.itemsForTotals(body.items, false),
      costs: body.costs.map((c) => ({ code: c.code, label: c.label, amount: money(c.amount.currency, c.amount.amountMinor) })),
      irrPerAed: rate?.irrPerAed ?? null,
      tax,
    });
    if (totals.totalPayableIrr <= 0n) throw badRequest('NOTHING_PAYABLE', 'At least one available item with a price is required');

    return this.prisma.tx(async (tx) => {
      let quote = await tx.quote.findFirst({ where: { requestId } });
      if (!quote) quote = await tx.quote.create({ data: { reference: humanReference(REFERENCE_PREFIX.quote), requestId, customerId: request.customerId } });
      const draft = await tx.quoteVersion.findFirst({ where: { quoteId: quote.id, status: 'DRAFT' } });
      if (draft && body.version !== undefined && draft.version !== body.version) throw new DomainError('VERSION_CONFLICT');
      const last = await tx.quoteVersion.findFirst({ where: { quoteId: quote.id }, orderBy: { versionNumber: 'desc' } });
      const data = {
        validityHours: body.validityHours,
        fxRateId: usesAed || rate ? (rate?.id ?? null) : null,
        irrPerAed: rate?.irrPerAed ?? null,
        roundingRule: totals.roundingRule,
        taxSnapshot: tax ? (toJsonSafe(tax) as Prisma.InputJsonValue) : Prisma.DbNull,
        itemsIrrMinor: totals.itemsIrr,
        costsIrrMinor: totals.costsIrr,
        taxIrrMinor: totals.taxIrr,
        totalPayableIrrMinor: totals.totalPayableIrr,
        referenceTotalAedMinor: totals.referenceTotalAed,
        leadTimeWording: body.leadTimeWording,
        leadTimeOrigin: body.leadTimeOrigin,
        businessCalendarId: calendar?.id ?? null,
        calendarSnapshot: calendar ? (toJsonSafe(calendar) as Prisma.InputJsonValue) : Prisma.DbNull,
        shippingLeadTime: body.shippingLeadTime ? (body.shippingLeadTime as Prisma.InputJsonValue) : Prisma.DbNull,
        termsPolicyVersionId: body.termsPolicyVersionId,
        customerNote: body.customerNote ?? null,
      };
      let versionId: string;
      if (draft) {
        await tx.quoteItemInternalCost.deleteMany({ where: { quoteItem: { quoteVersionId: draft.id } } });
        await tx.quoteItem.deleteMany({ where: { quoteVersionId: draft.id } });
        await tx.quoteCost.deleteMany({ where: { quoteVersionId: draft.id } });
        await tx.quoteVersion.update({ where: { id: draft.id }, data: { ...data, version: { increment: 1 } } });
        versionId = draft.id;
      } else {
        const created = await tx.quoteVersion.create({ data: { ...data, quoteId: quote.id, versionNumber: (last?.versionNumber ?? 0) + 1, createdById: actor.userId } });
        versionId = created.id;
      }
      for (const [index, i] of body.items.entries()) {
        const line = totals.itemLines[index];
        const item = await tx.quoteItem.create({
          data: {
            quoteVersionId: versionId, sourcingItemId: i.sourcingItemId ?? null, description: i.description, quantity: i.quantity,
            manufacturer: i.manufacturer ?? null, partType: i.partType, condition: i.condition, compatibility: i.compatibility,
            alternativeNote: i.alternativeNote ?? null, availability: i.availability, included: i.availability === 'AVAILABLE',
            unitPriceCurrency: i.unitPrice.currency, unitPriceMinor: BigInt(i.unitPrice.amountMinor),
            discountCurrency: i.discount?.currency ?? null, discountMinor: i.discount ? BigInt(i.discount.amountMinor) : null,
            lineTotalIrrMinor: line?.lineIrr ?? null, leadMin: i.leadTime.min, leadMax: i.leadTime.max, leadUnit: i.leadTime.unit,
            leadDayKind: i.leadTime.dayKind, sortOrder: index,
          },
        });
        if (i.internalCost) {
          await tx.quoteItemInternalCost.create({ data: { quoteItemId: item.id, currency: i.internalCost.currency, amountMinor: BigInt(i.internalCost.amountMinor) } });
        }
      }
      if (body.costs.length) {
        await tx.quoteCost.createMany({
          data: body.costs.map((c) => {
            const m = money(c.amount.currency, c.amount.amountMinor);
            return {
              quoteVersionId: versionId, code: c.code, label: c.label, currency: m.currency, amountMinor: m.minor,
              amountIrrMinor: m.currency === 'IRR' ? m.minor : computeQuoteTotals({ items: [], costs: [{ code: c.code, label: c.label, amount: m }], irrPerAed: rate?.irrPerAed ?? null, tax: null }).costsIrr,
            };
          }),
        });
      }
      await this.audit.record(tx, { action: 'quote.draft_saved', entityType: 'quote_version', entityId: versionId, after: { totalPayableIrr: totals.totalPayableIrr } });
      const fresh = await tx.quoteVersion.findUniqueOrThrow({ where: { id: versionId } });
      return { quoteId: quote.id, versionId, versionNumber: fresh.versionNumber, version: fresh.version };
    });
  }

  /**
   * Publishes the draft: validity starts now; the previous open version is
   * SUPERSEDED (history kept, A13). Refused while a payment is in flight.
   */
  async send(actor: Actor, versionId: string) {
    return this.prisma.tx(async (tx) => {
      const v = await tx.quoteVersion.findUnique({ where: { id: versionId }, include: { quote: { include: { request: true } } } });
      if (!v) throw notFound();
      this.assertStaffScope(actor, v.quote.request);
      if (v.status !== 'DRAFT') throw conflict('NOT_A_DRAFT');
      const open = await tx.quoteVersion.findMany({
        where: { quoteId: v.quoteId, status: { in: ['SENT', 'ACCEPTED'] } },
        include: { procurement: { include: { payments: true } } },
      });
      for (const o of open) {
        const busy = o.procurement?.payments.some((p) => ['CREATED', 'PENDING', 'PENDING_VERIFICATION', 'SUCCEEDED'].includes(p.status));
        if (busy) throw conflict('PAYMENT_IN_PROGRESS', 'A payment for the current version is in progress or completed; use an amendment instead');
        await this.transitions.record(tx, { machine: 'quoteVersion', subjectType: 'QUOTE_VERSION', subjectId: o.id, from: o.status, to: 'SUPERSEDED' });
        await tx.quoteVersion.update({ where: { id: o.id }, data: { status: 'SUPERSEDED', supersededAt: new Date(), supersededByVersionId: v.id } });
        if (o.procurement && o.procurement.status === 'AWAITING_PAYMENT') {
          await this.transitions.record(tx, { machine: 'procurement', subjectType: 'PROCUREMENT', subjectId: o.procurement.id, from: 'AWAITING_PAYMENT', to: 'CANCELLED', reason: 'QUOTE_SUPERSEDED' });
          await tx.procurement.update({ where: { id: o.procurement.id }, data: { status: 'CANCELLED' } });
        }
      }
      const now = new Date();
      const validUntil = new Date(now.getTime() + v.validityHours * 3_600_000);
      const items = await tx.quoteItem.findMany({ where: { quoteVersionId: v.id }, orderBy: { sortOrder: 'asc' } });
      const costs = await tx.quoteCost.findMany({ where: { quoteVersionId: v.id } });
      const contentHash = this.hash({
        n: v.versionNumber, items: items.map(({ id: _i, quoteVersionId: _q, ...rest }) => rest), costs: costs.map(({ id: _i, quoteVersionId: _q, ...rest }) => rest),
        total: v.totalPayableIrrMinor, rate: v.irrPerAed?.toString() ?? null, terms: v.termsPolicyVersionId, validUntil,
      });
      await this.transitions.record(tx, { machine: 'quoteVersion', subjectType: 'QUOTE_VERSION', subjectId: v.id, from: 'DRAFT', to: 'SENT' });
      await tx.quoteVersion.update({ where: { id: v.id }, data: { status: 'SENT', sentAt: now, validUntil, contentHash } });
      await tx.quote.update({ where: { id: v.quoteId }, data: { currentVersionId: v.id } });
      const req = v.quote.request;
      if (req.status !== 'QUOTED') {
        // Preparing and sending a quote is a review: a request still waiting (SUBMITTED / NEEDS_CUSTOMER_INFO)
        // passes through UNDER_REVIEW first, so the history shows both steps.
        let from = req.status;
        if (from === 'SUBMITTED' || from === 'NEEDS_CUSTOMER_INFO') {
          await this.transitions.record(tx, { machine: 'sourcingRequest', subjectType: 'SOURCING_REQUEST', subjectId: req.id, from, to: 'UNDER_REVIEW', reason: 'QUOTE_PREPARED' });
          from = 'UNDER_REVIEW';
        }
        await this.transitions.record(tx, { machine: 'sourcingRequest', subjectType: 'SOURCING_REQUEST', subjectId: req.id, from, to: 'QUOTED' });
        await tx.sourcingRequest.update({ where: { id: req.id }, data: { status: 'QUOTED', version: { increment: 1 } } });
      }
      const conv = await this.conversations.ensureForSubject(tx, { kind: 'SOURCING_REQUEST', subjectId: req.id, subject: req.title, customerId: req.customerId });
      await this.conversations.postSystemMessage(
        tx, conv.id, `quote:${v.id}`,
        composeSystemText(`پیش‌فاکتور نسخهٔ ${toPersianDigits(String(v.versionNumber))} صادر شد.`, `Quote version ${v.versionNumber} issued.`), v.id,
      );
      await this.outbox.notify(tx, { userId: req.customerId, type: 'quote.sent', params: { reference: v.quote.reference, version: v.versionNumber }, linkPath: `/account/quotes/${v.id}`, dedupeKey: `quote-sent:${v.id}`, sms: true });
      await this.outbox.enqueue(tx, { type: 'quote.pdf.render', aggregateType: 'quote_version', aggregateId: v.id, payload: { quoteVersionId: v.id }, dedupeKey: `pdf:${v.id}` });
      await this.audit.record(tx, { action: 'quote.sent', entityType: 'quote_version', entityId: v.id, after: { validUntil, contentHash } });
      return { versionId: v.id, status: 'SENT', validUntil: validUntil.toISOString() };
    });
  }

  async cancel(actor: Actor, versionId: string, reason: string) {
    return this.prisma.tx(async (tx) => {
      const v = await tx.quoteVersion.findUnique({ where: { id: versionId }, include: { quote: { include: { request: true } }, procurement: { include: { payments: true } } } });
      if (!v) throw notFound();
      this.assertStaffScope(actor, v.quote.request);
      if (v.procurement?.payments.some((p) => ['CREATED', 'PENDING', 'PENDING_VERIFICATION', 'SUCCEEDED'].includes(p.status))) throw conflict('PAYMENT_IN_PROGRESS');
      await this.transitions.record(tx, { machine: 'quoteVersion', subjectType: 'QUOTE_VERSION', subjectId: v.id, from: v.status, to: 'CANCELLED', reason });
      await tx.quoteVersion.update({ where: { id: v.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason } });
      if (v.procurement?.status === 'AWAITING_PAYMENT') {
        await this.transitions.record(tx, { machine: 'procurement', subjectType: 'PROCUREMENT', subjectId: v.procurement.id, from: 'AWAITING_PAYMENT', to: 'CANCELLED', reason: 'QUOTE_CANCELLED' });
        await tx.procurement.update({ where: { id: v.procurement.id }, data: { status: 'CANCELLED' } });
      }
      await this.audit.record(tx, { action: 'quote.cancelled', entityType: 'quote_version', entityId: v.id, after: { reason } });
      return { versionId: v.id, status: 'CANCELLED' };
    });
  }

  async viewForCustomer(actor: Actor, versionId: string): Promise<QuoteVersionView> {
    const v = await this.prisma.quoteVersion.findUnique({ where: { id: versionId }, include: versionInclude });
    if (!v || v.quote.customerId !== actor.userId || v.status === 'DRAFT') throw notFound();
    return this.toView(v, false, actor.locale);
  }

  /** All quote versions the staff member may see (sourcing scope), newest first. */
  async listForStaff(actor: Actor, status?: QuoteVersionStatus): Promise<StaffQuoteRow[]> {
    const scope = sourcingScope(actor.permissions);
    if (scope === 'NONE') throw forbidden();
    const rows = await this.prisma.quoteVersion.findMany({
      where: { ...(status ? { status } : {}), ...(scope === 'ASSIGNED' ? { quote: { request: { assigneeId: actor.userId } } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { quote: { include: { request: { select: { id: true, reference: true } }, customer: { select: { fullName: true } } } } },
    });
    return rows.map((v) => ({
      versionId: v.id, reference: v.quote.reference, versionNumber: v.versionNumber, status: v.status, isCurrent: v.quote.currentVersionId === v.id,
      request: { id: v.quote.request.id, reference: v.quote.request.reference }, customer: v.quote.customer.fullName,
      totalPayableIrr: moneyDto('IRR', v.totalPayableIrrMinor), sentAt: v.sentAt?.toISOString() ?? null,
      validUntil: v.validUntil?.toISOString() ?? null, createdAt: v.createdAt.toISOString(),
    }));
  }

  async viewForStaff(actor: Actor, versionId: string) {
    const v = await this.prisma.quoteVersion.findUnique({ where: { id: versionId }, include: versionInclude });
    if (!v) throw notFound();
    this.assertStaffScope(actor, v.quote.request);
    const view = await this.toView(v, true, actor.locale);
    return {
      ...view,
      version: v.version,
      internalCosts: actor.permissions.has('costs.read')
        ? v.items.map((i) => ({ itemId: i.id, cost: i.internalCost ? moneyDto(i.internalCost.currency, i.internalCost.amountMinor) : null }))
        : null,
    };
  }

  /** Customer-facing projection: never includes internal costs or notes. */
  async toView(v: VersionRow, staff: boolean, locale: 'fa' | 'en' = 'fa'): Promise<QuoteVersionView> {
    const hasSucceeded = !!v.procurement?.payments.some((p) => p.status === 'SUCCEEDED');
    const payableTotal = v.procurement?.totalPayableIrrMinor ?? v.totalPayableIrrMinor;
    const blockers = v.validUntil
      ? quotePaymentBlockers({ status: v.status, validUntil: v.validUntil, now: new Date(), totalPayableIrr: payableTotal, hasSucceededPayment: hasSucceeded })
      : ['NOT_ACCEPTED'];
    if (v.procurement?.payments.some((p) => ['PENDING', 'PENDING_VERIFICATION'].includes(p.status))) blockers.push('PAYMENT_IN_PROGRESS' as never);
    const included = v.items.filter((i) => i.availability === 'AVAILABLE' && i.included);
    const maxLead = included.reduce((acc, i) => Math.max(acc, i.leadUnit === 'HOURS' ? Math.ceil(i.leadMax / 24) : i.leadMax), 0);
    const minLead = included.reduce((acc, i) => Math.max(acc, i.leadUnit === 'HOURS' ? Math.ceil(i.leadMin / 24) : i.leadMin), 0);
    const download = (id: string | null) => (id ? `/api/v1/attachments/${id}/download` : null);
    const pdfUrls = { fa: download(v.pdfAttachmentId), en: download(v.pdfEnAttachmentId) };
    const governing = included.filter((i) => (i.leadUnit === 'HOURS' ? Math.ceil(i.leadMax / 24) : i.leadMax) === maxLead).map((i) => i.id);
    return {
      quoteId: v.quoteId,
      reference: v.quote.reference,
      versionId: v.id,
      versionNumber: v.versionNumber,
      status: v.status,
      issuedAt: v.sentAt?.toISOString() ?? null,
      validUntil: (v.validUntil ?? v.createdAt).toISOString(),
      items: v.items.map((i) => ({
        id: i.id,
        description: i.description,
        quantity: i.quantity,
        manufacturer: i.manufacturer,
        partType: i.partType,
        condition: i.condition,
        compatibility: i.compatibility,
        alternativeNote: i.alternativeNote,
        availability: i.availability,
        included: i.included,
        unitPrice: moneyDto(i.unitPriceCurrency, i.unitPriceMinor),
        discount: i.discountCurrency && i.discountMinor !== null ? moneyDto(i.discountCurrency, i.discountMinor) : null,
        lineTotalIrr: i.lineTotalIrrMinor === null ? null : irr(i.lineTotalIrrMinor),
        leadTime: { min: i.leadMin, max: i.leadMax, unit: i.leadUnit, dayKind: i.leadDayKind },
      })),
      costs: v.costs.map((c) => ({ code: c.code, label: c.label, amount: moneyDto(c.currency, c.amountMinor), amountIrr: irr(c.amountIrrMinor) })),
      totals: {
        itemsIrr: irr(v.itemsIrrMinor),
        costsIrr: irr(v.costsIrrMinor),
        taxIrr: irr(v.taxIrrMinor),
        totalPayableIrr: irr(payableTotal),
        referenceTotalAed: v.referenceTotalAedMinor === null ? null : moneyDto('AED', v.referenceTotalAedMinor),
      },
      fx: v.irrPerAed && v.fxRateId ? { irrPerAed: v.irrPerAed.toString(), rateId: v.fxRateId } : null,
      schedule: {
        origin: 'PAYMENT_VERIFIED',
        wording: v.leadTimeWording,
        readyToShip: { minDays: minLead, maxDays: maxLead, unitsLabel: 'DAYS' },
        shipping: (v.shippingLeadTime as QuoteVersionView['schedule']['shipping']) ?? null,
        governingItemIds: governing,
      },
      terms: {
        policyVersionId: v.termsPolicyVersionId,
        title: locale === 'en' ? (v.termsPolicy.titleEn ?? v.termsPolicy.titleFa) : v.termsPolicy.titleFa,
        body: locale === 'en' ? (v.termsPolicy.bodyEn ?? v.termsPolicy.bodyFa) : v.termsPolicy.bodyFa,
      },
      payable: { allowed: blockers.length === 0 && v.status === 'ACCEPTED', blockers },
      pdfUrl: pdfUrls[locale] ?? pdfUrls[locale === 'en' ? 'fa' : 'en'],
      pdfUrls,
    };
  }

  /**
   * Explicit acceptance of the exact version the customer saw. Creates at most
   * one procurement order per version (unique constraint), even on double clicks.
   */
  async decide(actor: Actor, input: { decision: 'ACCEPT' | 'REJECT'; quoteVersionId: string; versionNumber: number; rejectReason?: string; includedItemIds?: string[] }) {
    return this.prisma.tx(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "quote_version" WHERE "id" = ${input.quoteVersionId}::uuid FOR UPDATE`;
      const v = await tx.quoteVersion.findUnique({ where: { id: input.quoteVersionId }, include: { quote: { include: { request: true } }, items: true, procurement: true } });
      if (!v || v.quote.customerId !== actor.userId || v.status === 'DRAFT') throw notFound();
      if (v.versionNumber !== input.versionNumber) throw conflict('VERSION_MISMATCH', 'This is not the version you reviewed');
      if (input.decision === 'ACCEPT' && v.status === 'ACCEPTED' && v.procurement) return { status: 'ACCEPTED', procurementId: v.procurement.id };
      if (v.status !== 'SENT') throw conflict('QUOTE_NOT_OPEN', 'This quote version can no longer be answered');
      if (!v.validUntil || v.validUntil <= new Date()) throw conflict('QUOTE_EXPIRED', 'This quote has expired');

      if (input.decision === 'REJECT') {
        await this.transitions.record(tx, { machine: 'quoteVersion', subjectType: 'QUOTE_VERSION', subjectId: v.id, from: 'SENT', to: 'REJECTED', reason: input.rejectReason ?? null });
        await tx.quoteVersion.update({ where: { id: v.id }, data: { status: 'REJECTED', rejectedAt: new Date(), rejectReason: input.rejectReason ?? null } });
        if (v.quote.request.status === 'QUOTED') {
          await this.transitions.record(tx, { machine: 'sourcingRequest', subjectType: 'SOURCING_REQUEST', subjectId: v.quote.requestId, from: 'QUOTED', to: 'UNDER_REVIEW', reason: 'QUOTE_REJECTED' });
          await tx.sourcingRequest.update({ where: { id: v.quote.requestId }, data: { status: 'UNDER_REVIEW', version: { increment: 1 } } });
        }
        return { status: 'REJECTED', procurementId: null };
      }

      const available = v.items.filter((i) => i.availability === 'AVAILABLE');
      const includedIds = new Set(input.includedItemIds ?? available.map((i) => i.id));
      for (const id of includedIds) if (!available.some((i) => i.id === id)) throw badRequest('ITEM_NOT_AVAILABLE');
      const itemsForTotals = v.items.map((i) => ({ ...i, included: includedIds.has(i.id) }));
      const costs = await tx.quoteCost.findMany({ where: { quoteVersionId: v.id } });
      const totals = computeQuoteTotals({
        items: this.itemsForTotals(itemsForTotals as never, true),
        costs: costs.map((c) => ({ code: c.code as 'SHIPPING' | 'OTHER', label: c.label, amount: money(c.currency, c.amountMinor) })),
        irrPerAed: v.irrPerAed?.toString() ?? null,
        tax: (v.taxSnapshot as unknown as { id: string; version: number; rateBasisPoints: number; base: 'ITEMS' | 'ITEMS_AND_SHIPPING' } | null) ?? null,
      });
      if (totals.totalPayableIrr <= 0n) throw badRequest('NOTHING_PAYABLE');
      for (const i of v.items) await tx.quoteItem.update({ where: { id: i.id }, data: { included: includedIds.has(i.id) } });
      await this.transitions.record(tx, { machine: 'quoteVersion', subjectType: 'QUOTE_VERSION', subjectId: v.id, from: 'SENT', to: 'ACCEPTED' });
      await tx.quoteVersion.update({ where: { id: v.id }, data: { status: 'ACCEPTED', acceptedAt: new Date(), acceptedById: actor.userId } });
      await tx.policyAcceptance.createMany({
        data: [{ userId: actor.userId, policyVersionId: v.termsPolicyVersionId, subjectType: 'QUOTE_VERSION', subjectId: v.id }],
        skipDuplicates: true,
      });
      const procurement = await tx.procurement.create({
        data: {
          reference: humanReference(REFERENCE_PREFIX.procurement),
          quoteVersionId: v.id,
          customerId: actor.userId,
          totalPayableIrrMinor: totals.totalPayableIrr,
          assigneeId: v.quote.request.assigneeId,
          items: {
            create: v.items.filter((i) => includedIds.has(i.id)).map((i) => ({ quoteItemId: i.id, description: i.description, quantity: i.quantity })),
          },
        },
      });
      await this.transitions.note(tx, { subjectType: 'PROCUREMENT', subjectId: procurement.id, type: 'CREATED_FROM_QUOTE', data: { quoteVersionId: v.id, versionNumber: v.versionNumber } });
      await this.audit.record(tx, { action: 'quote.accepted', entityType: 'quote_version', entityId: v.id, after: { procurementId: procurement.id, totalPayableIrr: totals.totalPayableIrr } });
      return { status: 'ACCEPTED', procurementId: procurement.id };
    });
  }

  /**
   * Payment for an accepted quote. Old/cancelled/expired versions accept no new
   * payment (A13); failed attempts can be retried while valid (A14).
   */
  async pay(actor: Actor, procurementId: string, idempotencyKey: string | undefined): Promise<PaymentRedirect> {
    return this.idempotency.run('quote.pay', actor.userId, idempotencyKey, { procurementId }, async () => {
      const attemptId = await this.prisma.tx(async (tx: Tx) => {
        await tx.$queryRaw`SELECT "id" FROM "procurement" WHERE "id" = ${procurementId}::uuid FOR UPDATE`;
        const p = await tx.procurement.findUnique({ where: { id: procurementId }, include: { quoteVersion: { include: { quote: true } }, payments: true } });
        if (!p || p.customerId !== actor.userId) throw notFound();
        if (p.status !== 'AWAITING_PAYMENT') throw conflict('NOT_AWAITING_PAYMENT');
        const v = p.quoteVersion;
        const blockers = quotePaymentBlockers({
          status: v.status, validUntil: v.validUntil ?? new Date(0), now: new Date(), totalPayableIrr: p.totalPayableIrrMinor,
          hasSucceededPayment: p.payments.some((x) => x.status === 'SUCCEEDED'),
        });
        if (blockers.length) throw conflict('QUOTE_NOT_PAYABLE', 'This quote cannot be paid', { blockers });
        if (p.payments.some((x) => ['CREATED', 'PENDING', 'PENDING_VERIFICATION'].includes(x.status))) throw conflict('PAYMENT_IN_PROGRESS');
        const attempt = await this.payments.createAttempt(tx, {
          subjectType: 'PROCUREMENT',
          subjectId: p.id,
          customerId: actor.userId,
          amountIrr: p.totalPayableIrrMinor,
          snapshot: {
            quoteReference: v.quote.reference, quoteVersionId: v.id, versionNumber: v.versionNumber, contentHash: v.contentHash,
            totalPayableIrr: p.totalPayableIrrMinor, irrPerAed: v.irrPerAed?.toString() ?? null, validUntil: v.validUntil,
          },
          idempotencyKey: `procurement:${p.id}:${p.payments.length + 1}`,
          locale: actor.locale,
        });
        return attempt.id;
      });
      const { redirectUrl, isSimulator } = await this.payments.initiate(attemptId);
      return { orderId: procurementId, attemptId, redirectUrl, reservationExpiresAt: null, isSimulator };
    });
  }

  /** Worker: expire versions past validity unless a payment is in flight for them. */
  async expireDue(): Promise<number> {
    const due = await this.prisma.quoteVersion.findMany({
      where: { status: { in: ['SENT', 'ACCEPTED'] }, validUntil: { lt: new Date() } },
      include: { procurement: { include: { payments: true } }, quote: true },
      take: 100,
    });
    let n = 0;
    for (const v of due) {
      if (v.procurement?.payments.some((p) => ['CREATED', 'PENDING', 'PENDING_VERIFICATION', 'SUCCEEDED'].includes(p.status))) continue;
      await this.prisma.tx(async (tx) => {
        const res = await tx.quoteVersion.updateMany({ where: { id: v.id, status: v.status }, data: { status: 'EXPIRED' } });
        if (res.count !== 1) return;
        await this.transitions.record(tx, { machine: 'quoteVersion', subjectType: 'QUOTE_VERSION', subjectId: v.id, from: v.status, to: 'EXPIRED', actorKind: 'SYSTEM', actorId: null });
        if (v.procurement?.status === 'AWAITING_PAYMENT') {
          await this.transitions.record(tx, { machine: 'procurement', subjectType: 'PROCUREMENT', subjectId: v.procurement.id, from: 'AWAITING_PAYMENT', to: 'CANCELLED', reason: 'QUOTE_EXPIRED', actorKind: 'SYSTEM', actorId: null });
          await tx.procurement.update({ where: { id: v.procurement.id }, data: { status: 'CANCELLED' } });
        }
        await this.outbox.notify(tx, { userId: v.quote.customerId, type: 'quote.expired', params: { reference: v.quote.reference }, linkPath: `/account/quotes/${v.id}`, dedupeKey: `quote-expired:${v.id}` });
        n += 1;
      });
    }
    // "Expiring soon" reminders (once per version).
    const soon = await this.prisma.quoteVersion.findMany({
      where: { status: 'SENT', validUntil: { gt: new Date(), lt: new Date(Date.now() + 3 * 3_600_000) } },
      include: { quote: true },
      take: 100,
    });
    for (const v of soon) {
      await this.prisma.$transaction(async (tx) =>
        this.outbox.notify(tx, { userId: v.quote.customerId, type: 'quote.expiring', params: { reference: v.quote.reference }, linkPath: `/account/quotes/${v.id}`, dedupeKey: `quote-expiring:${v.id}` }),
      );
    }
    return n;
  }

  assertCanWrite(actor: Actor): void {
    if (!actor.permissions.has('quotes.write')) throw forbidden();
  }
}
