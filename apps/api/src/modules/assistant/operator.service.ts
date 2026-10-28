import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type {
  OperatorMessageView,
  OperatorRequestCreated,
  OperatorRequestDetail,
  OperatorRequestList,
  OperatorRequestStatus,
  OperatorRequestSummary,
  OperatorThreadView,
} from '@hedax/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../../common/audit.service.js';
import { conflict, notFound } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';

const PAGE_SIZE = 20;
/** A guest may add follow-ups, but not flood an unanswered request. */
const MAX_VISITOR_MESSAGES_IN_A_ROW = 5;

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

type RequestRow = Prisma.OperatorRequestGetPayload<{ include: { messages: { include: { staff: { select: { fullName: true } } } } } }>;

/**
 * "Contact an operator" from the site guide. Visitors leave a message with their name and phone;
 * staff reply in the admin panel. A guest reads replies with a random key kept in their browser
 * (only its hash is stored); a signed-in customer also sees them in their account.
 * Owners get an in-app notification for every new request.
 */
@Injectable()
export class OperatorService {
  private readonly logger = new Logger(OperatorService.name);
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async create(input: { locale: 'fa' | 'en'; name: string; phone: string; message: string }, ctx: { userId: string | null; ipHash: string | null }): Promise<OperatorRequestCreated> {
    const key = randomBytes(24).toString('base64url');
    const row = await this.prisma.tx(async (tx) => {
      const created = await tx.operatorRequest.create({
        data: { accessKeyHash: hashKey(key), locale: input.locale, name: input.name, phone: input.phone, userId: ctx.userId, ipHash: ctx.ipHash, messages: { create: { sender: 'VISITOR', body: input.message } } },
        select: { id: true },
      });
      await this.notifyOwners(tx, created.id, input.name);
      return created;
    });
    return { id: row.id, key };
  }

  async thread(id: string, key: string): Promise<OperatorThreadView> {
    const row = await this.authorized(id, key);
    return this.threadView(row);
  }

  async visitorMessage(id: string, key: string, message: string): Promise<OperatorThreadView> {
    const row = await this.authorized(id, key);
    if (row.status === 'CLOSED') throw conflict('OPERATOR_REQUEST_CLOSED', 'This conversation is closed');
    let inARow = 0;
    for (let i = row.messages.length - 1; i >= 0 && row.messages[i]!.sender === 'VISITOR'; i--) inARow++;
    if (inARow >= MAX_VISITOR_MESSAGES_IN_A_ROW) throw conflict('OPERATOR_WAIT_FOR_REPLY', 'Please wait for the operator to reply');
    await this.prisma.tx(async (tx) => {
      await tx.operatorMessage.create({ data: { requestId: id, sender: 'VISITOR', body: message } });
      await tx.operatorRequest.update({ where: { id }, data: { status: 'OPEN', unreadByStaff: true, lastMessageAt: new Date() } });
    });
    return this.threadView(await this.load(id));
  }

  /** A signed-in customer's own requests (account → messages). */
  async forCustomer(userId: string): Promise<OperatorThreadView[]> {
    const rows = await this.prisma.operatorRequest.findMany({ where: { userId }, orderBy: { lastMessageAt: 'desc' }, take: 50, include: { messages: { orderBy: { createdAt: 'asc' }, include: { staff: { select: { fullName: true } } } } } });
    return rows.map((r) => this.threadView(r));
  }

  async list(query: { page: number; status: 'open' | 'all' | 'closed'; q?: string }): Promise<OperatorRequestList> {
    const q = query.q?.trim();
    const where: Prisma.OperatorRequestWhereInput = {
      ...(query.status === 'open' ? { status: { in: ['OPEN', 'ANSWERED'] } } : query.status === 'closed' ? { status: 'CLOSED' } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }, { messages: { some: { body: { contains: q, mode: 'insensitive' } } } }] } : {}),
    };
    const [total, rows, openCount, unreadCount] = await Promise.all([
      this.prisma.operatorRequest.count({ where }),
      this.prisma.operatorRequest.findMany({ where, orderBy: [{ unreadByStaff: 'desc' }, { lastMessageAt: 'desc' }], skip: (query.page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { messages: { orderBy: { createdAt: 'asc' }, include: { staff: { select: { fullName: true } } } } } }),
      this.prisma.operatorRequest.count({ where: { status: 'OPEN' } }),
      this.prisma.operatorRequest.count({ where: { unreadByStaff: true, status: { not: 'CLOSED' } } }),
    ]);
    return { items: rows.map((r) => this.summary(r)), total, page: query.page, pageSize: PAGE_SIZE, openCount, unreadCount };
  }

  async detail(id: string): Promise<OperatorRequestDetail> {
    const row = await this.load(id);
    if (row.unreadByStaff) await this.prisma.operatorRequest.update({ where: { id }, data: { unreadByStaff: false } });
    return { ...this.summary({ ...row, unreadByStaff: false }), messages: row.messages.map((m) => ({ ...this.messageView(m), staffName: m.staff?.fullName ?? null })) };
  }

  async reply(id: string, message: string, staffId: string): Promise<OperatorRequestDetail> {
    const row = await this.load(id);
    await this.prisma.tx(async (tx) => {
      await tx.operatorMessage.create({ data: { requestId: id, sender: 'STAFF', staffId, body: message } });
      await tx.operatorRequest.update({ where: { id }, data: { status: 'ANSWERED', unreadByStaff: false, closedAt: null, lastMessageAt: new Date() } });
      await this.audit.record(tx, { action: 'assistant.operator_replied', entityType: 'operator_request', entityId: id, after: { length: message.length } });
      if (row.userId) {
        await tx.notification.createMany({ data: [{ userId: row.userId, type: 'operator.reply', params: {}, linkPath: '/account/messages', dedupeKey: `operator.reply:${id}:${Date.now()}` }], skipDuplicates: true });
      }
    });
    return this.detail(id);
  }

  async setStatus(id: string, status: 'OPEN' | 'CLOSED'): Promise<OperatorRequestDetail> {
    await this.load(id);
    await this.prisma.tx(async (tx) => {
      await tx.operatorRequest.update({ where: { id }, data: { status, closedAt: status === 'CLOSED' ? new Date() : null, ...(status === 'CLOSED' ? { unreadByStaff: false } : {}) } });
      await this.audit.record(tx, { action: 'assistant.operator_status_changed', entityType: 'operator_request', entityId: id, after: { status } });
    });
    return this.detail(id);
  }

  private async notifyOwners(tx: Prisma.TransactionClient, requestId: string, name: string) {
    try {
      const owners = await tx.user.findMany({ where: { kind: 'STAFF', roles: { some: { role: { isOwner: true } } } }, select: { id: true } });
      if (owners.length) await tx.notification.createMany({ data: owners.map((o) => ({ userId: o.id, type: 'operator.request', params: { name }, linkPath: '/admin/assistant?tab=operator', dedupeKey: `operator.request:${requestId}:${o.id}` })), skipDuplicates: true });
    } catch (e) {
      this.logger.warn(`operator: owner notification failed: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  private async authorized(id: string, key: string): Promise<RequestRow> {
    const row = await this.prisma.operatorRequest.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: 'asc' }, include: { staff: { select: { fullName: true } } } } } });
    const given = Buffer.from(hashKey(key));
    const stored = Buffer.from(row?.accessKeyHash ?? '0'.repeat(64));
    if (!row || given.length !== stored.length || !timingSafeEqual(given, stored)) throw notFound('OPERATOR_REQUEST_NOT_FOUND', 'Conversation not found');
    return row;
  }

  private async load(id: string): Promise<RequestRow> {
    const row = await this.prisma.operatorRequest.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: 'asc' }, include: { staff: { select: { fullName: true } } } } } });
    if (!row) throw notFound('OPERATOR_REQUEST_NOT_FOUND', 'Conversation not found');
    return row;
  }

  private messageView(m: RequestRow['messages'][number]): OperatorMessageView {
    return { id: m.id, sender: m.sender === 'STAFF' ? 'STAFF' : 'VISITOR', body: m.body, createdAt: m.createdAt.toISOString() };
  }

  private threadView(r: RequestRow): OperatorThreadView {
    return { id: r.id, status: r.status as OperatorRequestStatus, createdAt: r.createdAt.toISOString(), messages: r.messages.map((m) => this.messageView(m)) };
  }

  private summary(r: RequestRow): OperatorRequestSummary {
    return {
      id: r.id, name: r.name, phone: r.phone, locale: r.locale === 'en' ? 'en' : 'fa', status: r.status as OperatorRequestStatus, unreadByStaff: r.unreadByStaff,
      signedIn: r.userId !== null, messageCount: r.messages.length, firstMessage: r.messages[0]?.body ?? '', lastMessage: r.messages.at(-1)?.body ?? '',
      lastMessageAt: r.lastMessageAt.toISOString(), createdAt: r.createdAt.toISOString(),
    };
  }
}
