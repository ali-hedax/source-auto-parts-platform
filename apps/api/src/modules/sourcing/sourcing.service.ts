import { Injectable } from '@nestjs/common';
import { type GuestSourcingRequest, type GuestSourcingResult, type SourcingRequestCreate, type SourcingRequestView, composeSystemText } from '@hedax/contracts';
import { DomainError, normalizeIranMobile, sourcingScope } from '@hedax/domain';
import { REFERENCE_PREFIX, humanReference } from '@hedax/domain/server';
import type { Prisma, SourcingRequestStatus } from '../../generated/prisma/client.js';
import { AuditService } from '../../common/audit.service.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors.js';
import { OutboxService } from '../../common/outbox.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { LIMITS, RateLimitService } from '../../common/rate-limit.service.js';
import { RealtimeBus } from '../../common/realtime-bus.js';
import type { Actor } from '../../common/request-context.js';
import { irr } from '../../common/serialize.js';
import { TransitionsService } from '../../common/transitions.service.js';
import { AttachmentsService } from '../attachments/attachments.service.js';
import { ConversationsService } from '../conversations/conversations.service.js';

const requestInclude = {
  items: { orderBy: { sortOrder: 'asc' }, include: { vehicleBrand: true } },
  assignee: { select: { fullName: true } },
  quotes: { include: { versions: { where: { status: { not: 'DRAFT' } }, orderBy: { versionNumber: 'desc' } } } },
} satisfies Prisma.SourcingRequestInclude;
type RequestRow = Prisma.SourcingRequestGetPayload<{ include: typeof requestInclude }>;

@Injectable()
export class SourcingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly attachments: AttachmentsService,
    private readonly transitions: TransitionsService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly limits: RateLimitService,
    private readonly bus: RealtimeBus,
  ) {}

  private async view(r: RequestRow, viewer: Actor): Promise<SourcingRequestView> {
    const conv = await this.conversations.ensureForSubject(this.prisma, { kind: 'SOURCING_REQUEST', subjectId: r.id, subject: r.title, customerId: r.customerId });
    return {
      id: r.id,
      reference: r.reference,
      title: r.title,
      status: r.status,
      urgency: r.urgency,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      items: r.items.map((i) => ({
        id: i.id,
        partName: i.partName,
        quantity: i.quantity,
        vehicleBrand: i.vehicleBrand ? (viewer.locale === 'en' ? (i.vehicleBrand.nameEn ?? i.vehicleBrand.nameFa) : i.vehicleBrand.nameFa) : i.vehicleBrandText,
        vehicleModel: i.vehicleModel,
        vehicleYear: i.vehicleYear,
        partCode: i.partCode,
        preference: i.preference,
        notes: i.notes,
      })),
      conversationId: conv.id,
      assignee: r.assignee?.fullName ? { displayName: r.assignee.fullName.split(' ')[0] ?? '' } : null,
      quotes: r.quotes.flatMap((q) =>
        q.versions.map((v) => ({
          quoteId: q.id,
          reference: q.reference,
          versionId: v.id,
          versionNumber: v.versionNumber,
          status: v.status,
          totalPayable: irr(v.totalPayableIrrMinor),
          validUntil: (v.validUntil ?? v.createdAt).toISOString(),
        })),
      ),
    };
  }

  /**
   * Any brand (known id or free text, A03), optional VIN/part code, files.
   * Idempotent per clientRequestId so a retried submit never duplicates.
   */
  async create(actor: Actor, body: SourcingRequestCreate): Promise<SourcingRequestView> {
    const prior = await this.prisma.sourcingRequest.findUnique({
      where: { customerId_clientRequestId: { customerId: actor.userId, clientRequestId: body.clientRequestId } },
      include: requestInclude,
    });
    if (prior) return this.view(prior, actor);
    await this.limits.hit(LIMITS.sourcingPerUser, actor.userId);
    const brandCodes = [...new Set(body.items.map((i) => i.vehicleBrandCode).filter((x): x is string => !!x))];
    const brandRows = brandCodes.length ? await this.prisma.vehicleBrand.findMany({ where: { code: { in: brandCodes }, active: true } }) : [];
    if (brandRows.length !== brandCodes.length) throw badRequest('UNKNOWN_VEHICLE_BRAND');
    const brandIdByCode = new Map(brandRows.map((b) => [b.code, b.id]));
    for (const i of body.items) if (!i.vehicleBrandCode && !i.vehicleBrandText) throw badRequest('BRAND_REQUIRED', 'Choose a brand or type its name');
    await this.attachments.assertOwnedUsable(actor.userId, body.attachmentIds);

    const id = await this.prisma.tx(async (tx) => {
      const req = await tx.sourcingRequest.create({
        data: {
          reference: humanReference(REFERENCE_PREFIX.sourcingRequest),
          customerId: actor.userId,
          title: body.title,
          note: body.note ?? null,
          urgency: body.urgency,
          status: 'SUBMITTED',
          deliveryProvince: body.deliveryProvince ?? null,
          deliveryCity: body.deliveryCity ?? null,
          clientRequestId: body.clientRequestId,
          submittedAt: new Date(),
          items: {
            create: body.items.map((i, index) => ({
              partName: i.partName,
              quantity: i.quantity,
              vehicleBrandId: i.vehicleBrandCode ? (brandIdByCode.get(i.vehicleBrandCode) ?? null) : null,
              vehicleBrandText: i.vehicleBrandCode ? null : (i.vehicleBrandText ?? null),
              vehicleModel: i.vehicleModel ?? null,
              vehicleYear: i.vehicleYear ?? null,
              partCode: i.partCode ?? null,
              vin: i.vin ?? null,
              preference: i.preference,
              notes: i.notes ?? null,
              sortOrder: index,
            })),
          },
        },
      });
      if (body.attachmentIds.length) {
        await tx.attachment.updateMany({ where: { id: { in: body.attachmentIds }, ownerId: actor.userId }, data: { subjectType: 'SOURCING_REQUEST', subjectId: req.id } });
      }
      const conv = await this.conversations.ensureForSubject(tx, { kind: 'SOURCING_REQUEST', subjectId: req.id, subject: `${req.reference} — ${req.title}`, customerId: actor.userId });
      await this.conversations.postSystemMessage(tx, conv.id, `request-created:${req.id}`, composeSystemText(`درخواست ${req.reference} ثبت شد.`, `Request ${req.reference} received.`));
      await this.transitions.note(tx, { subjectType: 'SOURCING_REQUEST', subjectId: req.id, type: 'REQUEST_SUBMITTED' });
      await this.outbox.notify(tx, { userId: actor.userId, type: 'sourcing.submitted', params: { reference: req.reference }, linkPath: `/account/requests/${req.id}`, dedupeKey: `sr-submitted:${req.id}`, sms: true });
      return req.id;
    });
    const row = await this.prisma.sourcingRequest.findUniqueOrThrow({ where: { id }, include: requestInclude });
    return this.view(row, actor);
  }

  /**
   * «درخواست تأمین» without signing in. The mobile number decides the customer account: an existing
   * active customer account receives the request, otherwise a new customer account is created for that
   * number (unverified until its owner signs in with the one-time code). The answer never says which
   * happened, and no session is opened. A signed-in customer (actor) files it under their own account.
   * Limits: per IP (hour and day) and per number (day), plus a hidden trap field for scripts.
   */
  async createGuest(input: GuestSourcingRequest, files: Array<{ originalname: string; size: number; buffer: Buffer }>, meta: { ipHash: string | null; actor: Actor | null; locale: 'fa' | 'en' }): Promise<GuestSourcingResult> {
    if (input.website?.trim()) throw badRequest('REQUEST_REJECTED', 'The request could not be accepted');
    const signedIn = meta.actor?.kind === 'CUSTOMER';
    let actor = signedIn ? meta.actor : null;
    if (!actor) {
      await this.limits.hit(LIMITS.guestSourcingPerIp, meta.ipHash);
      await this.limits.hit(LIMITS.guestSourcingPerIpDay, meta.ipHash);
      const parsed = normalizeIranMobile(input.mobile ?? '');
      if (!parsed.ok) throw badRequest('INVALID_MOBILE', 'Enter a valid Iranian mobile number');
      await this.limits.hit(LIMITS.guestSourcingPerPhone, parsed.e164);
      const user = await this.customerForMobile(parsed.e164, input.fullName ?? null);
      actor = {
        userId: user.id, kind: 'CUSTOMER', sessionId: 'guest-request', sessionTokenHash: '', authVersion: user.authVersion, mfaVerified: false,
        permissions: new Set<string>(), isOwner: false, requiresMfa: false, approvedCustomerGroupId: null, displayName: null, locale: meta.locale,
      };
    }
    // A repeated submit (double tap, retry after a lost answer) is the same request; its photos are not stored again.
    const prior = await this.prisma.sourcingRequest.findUnique({ where: { customerId_clientRequestId: { customerId: actor.userId, clientRequestId: input.clientRequestId } }, select: { reference: true } });
    if (prior) return { reference: prior.reference };
    // Photos go through the normal checks (type, size, quota, virus scan); rejected files are dropped.
    const attachmentIds = files.length
      ? (await this.attachments.upload(actor, 'SOURCING_REQUEST', files)).filter((a) => a.status !== 'REJECTED').map((a) => a.id)
      : [];
    const guestNote = signedIn ? undefined : ['ثبت بدون ورود؛ شمارهٔ موبایل هنوز با کد تأیید نشده است.', input.fullName ? `نام: ${input.fullName}` : ''].filter(Boolean).join('\n');
    // The title is optional here: made from the first item («چراغ جلو — پژو ۲۰۰۸») when left empty.
    const first = input.items[0]!;
    const title = input.title || [first.partName, first.vehicleModel || first.vehicleBrandText].filter(Boolean).join(' — ');
    const view = await this.create(actor, {
      title: title.slice(0, 200),
      clientRequestId: input.clientRequestId,
      urgency: input.urgency,
      attachmentIds,
      note: [input.note, guestNote].filter(Boolean).join('\n\n') || undefined,
      deliveryCity: input.deliveryCity,
      deliveryProvince: input.deliveryProvince,
      items: input.items,
    });
    return { reference: view.reference };
  }

  /** The active customer account of a mobile number, or a new one; staff numbers and blocked accounts are refused alike. */
  private async customerForMobile(e164: string, fullName: string | null) {
    const existing = await this.prisma.user.findUnique({ where: { mobileE164: e164 } });
    if (existing) {
      if (existing.kind !== 'CUSTOMER' || existing.status !== 'ACTIVE') throw forbidden('MOBILE_NOT_ACCEPTED', 'This number cannot be used here; please sign in');
      return existing;
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({ data: { kind: 'CUSTOMER', mobileE164: e164, ...(fullName ? { fullName } : {}) } });
        await tx.customerProfile.create({ data: { userId: created.id } });
        return created;
      });
    } catch (e) {
      // Two requests for a new number at once: the other one created it.
      const again = await this.prisma.user.findUnique({ where: { mobileE164: e164 } });
      if (again?.kind === 'CUSTOMER' && again.status === 'ACTIVE') return again;
      throw e;
    }
  }

  async listForCustomer(actor: Actor) {
    const rows = await this.prisma.sourcingRequest.findMany({ where: { customerId: actor.userId }, orderBy: { createdAt: 'desc' }, take: 100, include: { _count: { select: { items: true } } } });
    return rows.map((r) => ({ id: r.id, reference: r.reference, title: r.title, status: r.status, itemCount: r._count.items, createdAt: r.createdAt.toISOString() }));
  }

  async getForCustomer(actor: Actor, id: string): Promise<SourcingRequestView> {
    const row = await this.prisma.sourcingRequest.findFirst({ where: { id, customerId: actor.userId }, include: requestInclude });
    if (!row) throw notFound();
    return this.view(row, actor);
  }

  /** Staff data scope: all requests, or only those assigned to the staff member. */
  scopeWhere(actor: Actor): Prisma.SourcingRequestWhereInput {
    const scope = sourcingScope(actor.permissions);
    if (scope === 'ALL') return {};
    if (scope === 'ASSIGNED') return { assigneeId: actor.userId };
    throw forbidden();
  }

  async listForStaff(actor: Actor, status?: SourcingRequestStatus) {
    const rows = await this.prisma.sourcingRequest.findMany({
      where: { ...this.scopeWhere(actor), ...(status ? { status } : {}) },
      orderBy: [{ urgency: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      include: { customer: { select: { fullName: true } }, assignee: { select: { fullName: true } }, _count: { select: { items: true } } },
    });
    return rows.map((r) => ({
      id: r.id, reference: r.reference, title: r.title, status: r.status, urgency: r.urgency, customer: r.customer.fullName,
      assignee: r.assignee?.fullName ?? null, itemCount: r._count.items, createdAt: r.createdAt.toISOString(), version: r.version,
    }));
  }

  async getForStaff(actor: Actor, id: string) {
    const row = await this.prisma.sourcingRequest.findFirst({ where: { id, ...this.scopeWhere(actor) }, include: { ...requestInclude, customer: { select: { fullName: true, id: true } } } });
    if (!row) throw notFound();
    const files = await this.prisma.attachment.findMany({ where: { subjectType: 'SOURCING_REQUEST', subjectId: id, deletedAt: null } });
    const base = await this.view(row, actor);
    return {
      ...base,
      version: row.version,
      customer: row.customer,
      note: row.note,
      delivery: { province: row.deliveryProvince, city: row.deliveryCity },
      itemsDetail: row.items.map((i) => ({ id: i.id, vin: i.vin, partCode: i.partCode })),
      files: await Promise.all(files.map(async (f) => this.attachments.view(f, await this.attachments.canAccess(actor, f)))),
    };
  }

  async assign(actor: Actor, id: string, assigneeId: string | null) {
    return this.prisma.tx(async (tx) => {
      const req = await tx.sourcingRequest.findUnique({ where: { id } });
      if (!req) throw notFound();
      if (assigneeId) {
        const staff = await tx.user.findFirst({ where: { id: assigneeId, kind: 'STAFF', status: 'ACTIVE' } });
        if (!staff) throw badRequest('UNKNOWN_STAFF');
      }
      await tx.sourcingRequest.update({ where: { id }, data: { assigneeId, version: { increment: 1 } } });
      await tx.conversation.updateMany({ where: { subjectKind: 'SOURCING_REQUEST', subjectId: id }, data: { assigneeId } });
      if (req.status === 'SUBMITTED') {
        await this.transitions.record(tx, { machine: 'sourcingRequest', subjectType: 'SOURCING_REQUEST', subjectId: id, from: 'SUBMITTED', to: 'UNDER_REVIEW' });
        await tx.sourcingRequest.update({ where: { id }, data: { status: 'UNDER_REVIEW' } });
      }
      await this.audit.record(tx, { action: 'sourcing.assigned', entityType: 'sourcing_request', entityId: id, before: { assigneeId: req.assigneeId }, after: { assigneeId } });
      const conv = await tx.conversation.findUnique({ where: { subjectKind_subjectId: { subjectKind: 'SOURCING_REQUEST', subjectId: id } } });
      return { id, assigneeId, conversationId: conv?.id ?? null };
    }).then((r) => {
      if (r.conversationId) this.bus.publish({ type: 'conversation.access-changed', conversationId: r.conversationId });
      return { id: r.id, assigneeId: r.assigneeId };
    });
  }

  async transition(actor: Actor, id: string, to: SourcingRequestStatus, reason: string | undefined, version: number) {
    return this.prisma.tx(async (tx) => {
      const req = await tx.sourcingRequest.findFirst({ where: { id, ...(actor.kind === 'STAFF' ? this.scopeWhere(actor) : { customerId: actor.userId }) } });
      if (!req) throw notFound();
      if (req.version !== version) throw new DomainError('VERSION_CONFLICT');
      if (actor.kind === 'CUSTOMER' && to !== 'CANCELLED') throw forbidden();
      if (to === 'CONVERTED') throw conflict('CONVERTED_BY_PAYMENT', 'Requests convert only through a verified payment');
      await this.transitions.record(tx, { machine: 'sourcingRequest', subjectType: 'SOURCING_REQUEST', subjectId: id, from: req.status, to, reason: reason ?? null });
      await tx.sourcingRequest.update({ where: { id }, data: { status: to, version: { increment: 1 }, ...(to === 'CLOSED' || to === 'CANCELLED' ? { closedAt: new Date() } : {}) } });
      if (to === 'NEEDS_CUSTOMER_INFO') {
        await this.outbox.notify(tx, { userId: req.customerId, type: 'sourcing.needs_info', params: { reference: req.reference }, linkPath: `/account/requests/${id}`, dedupeKey: `sr-info:${id}:${req.version}`, sms: true });
      }
      return { id, status: to };
    });
  }
}
