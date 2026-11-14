import { Injectable } from '@nestjs/common';
import { type SourcingRequestCreate, type SourcingRequestView, composeSystemText } from '@hedax/contracts';
import { DomainError, sourcingScope } from '@hedax/domain';
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
