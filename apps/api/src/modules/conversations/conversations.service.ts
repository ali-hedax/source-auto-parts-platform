import { Injectable } from '@nestjs/common';
import type { ConversationSummary, CursorPage, MessageView, SendMessage } from '@hedax/contracts';
import { conversationScope } from '@hedax/domain';
import type { Conversation, ConversationSubject } from '../../generated/prisma/client.js';
import { forbidden, notFound } from '../../common/errors.js';
import { OutboxService } from '../../common/outbox.service.js';
import { Prisma, PrismaService, type Tx } from '../../common/prisma.service.js';
import { LIMITS, RateLimitService } from '../../common/rate-limit.service.js';
import { RealtimeBus } from '../../common/realtime-bus.js';
import type { Actor } from '../../common/request-context.js';
import { AttachmentsService } from '../attachments/attachments.service.js';

const messageInclude = {
  sender: { select: { id: true, fullName: true, kind: true } },
  attachments: { include: { attachment: true } },
} satisfies Prisma.MessageInclude;
type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

function encodeCursor(m: { createdAt: Date; id: string }): string {
  return Buffer.from(`${m.createdAt.toISOString()}|${m.id}`).toString('base64url');
}
function decodeCursor(c: string): { createdAt: Date; id: string } | null {
  const [iso, id] = Buffer.from(c, 'base64url').toString('utf8').split('|');
  if (!iso || !id || Number.isNaN(Date.parse(iso)) || !/^[0-9a-f-]{36}$/.test(id)) return null;
  return { createdAt: new Date(iso), id };
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attachments: AttachmentsService,
    private readonly bus: RealtimeBus,
    private readonly outbox: OutboxService,
    private readonly limits: RateLimitService,
  ) {}

  /** One conversation per subject; created with the subject in the same transaction. */
  async ensureForSubject(tx: Tx, input: { kind: ConversationSubject; subjectId: string; subject: string; customerId: string; assigneeId?: string | null }): Promise<Conversation> {
    const existing = await tx.conversation.findUnique({ where: { subjectKind_subjectId: { subjectKind: input.kind, subjectId: input.subjectId } } });
    if (existing) return existing;
    const conv = await tx.conversation.create({
      data: { subjectKind: input.kind, subjectId: input.subjectId, subject: input.subject.slice(0, 200), customerId: input.customerId, assigneeId: input.assigneeId ?? null },
    });
    await tx.participant.create({ data: { conversationId: conv.id, userId: input.customerId, role: 'CUSTOMER' } });
    return conv;
  }

  canRead(actor: Actor, conv: Conversation): boolean {
    if (actor.kind === 'CUSTOMER') return conv.customerId === actor.userId;
    const scope = conversationScope(actor.permissions);
    return scope === 'ALL' || (scope === 'ASSIGNED' && conv.assigneeId === actor.userId);
  }

  canWrite(actor: Actor, conv: Conversation): boolean {
    if (!this.canRead(actor, conv)) return false;
    return actor.kind === 'CUSTOMER' || actor.permissions.has('conversations.write');
  }

  async getAuthorized(actor: Actor, id: string): Promise<Conversation> {
    const conv = await this.prisma.conversation.findUnique({ where: { id } });
    if (!conv || !this.canRead(actor, conv)) throw notFound();
    return conv;
  }

  async toMessageView(m: MessageRow, viewer: Actor): Promise<MessageView> {
    const cursors = await this.prisma.messageReadCursor.findMany({
      where: { conversationId: m.conversationId, userId: { not: viewer.userId } },
    });
    const lastReadIds = cursors.map((c) => c.lastReadMessageId);
    const readRows = lastReadIds.length
      ? await this.prisma.message.findMany({ where: { id: { in: lastReadIds } }, select: { createdAt: true } })
      : [];
    const readByOther = readRows.some((r) => r.createdAt >= m.createdAt);
    const attachments = [];
    for (const link of m.attachments) {
      attachments.push(this.attachments.view(link.attachment, await this.attachments.canAccess(viewer, link.attachment)));
    }
    let quoteCard: MessageView['quoteCard'] = null;
    if (m.quoteVersionId) {
      const qv = await this.prisma.quoteVersion.findUnique({ where: { id: m.quoteVersionId }, include: { quote: true } });
      if (qv) quoteCard = { quoteVersionId: qv.id, versionNumber: qv.versionNumber, reference: qv.quote.reference };
    }
    const senderKind = m.senderKind;
    return {
      id: m.id,
      conversationId: m.conversationId,
      clientMessageId: m.senderId === viewer.userId ? m.clientMessageId : null,
      sender: {
        kind: senderKind,
        // Staff names are shown as first names only to customers; system messages have no person.
        displayName: senderKind === 'SYSTEM' ? 'HEDAX' : (m.sender?.fullName?.split(' ')[0] ?? (senderKind === 'STAFF' ? 'HEDAX' : '')),
        isSelf: m.senderId === viewer.userId,
      },
      body: m.deletedAt ? '' : m.body,
      attachments: m.deletedAt ? [] : attachments,
      quoteCard,
      createdAt: m.createdAt.toISOString(),
      readByOther,
    };
  }

  async list(actor: Actor): Promise<ConversationSummary[]> {
    const where: Prisma.ConversationWhereInput =
      actor.kind === 'CUSTOMER'
        ? { customerId: actor.userId }
        : conversationScope(actor.permissions) === 'ALL'
          ? {}
          : conversationScope(actor.permissions) === 'ASSIGNED'
            ? { assigneeId: actor.userId }
            : { id: '00000000-0000-0000-0000-000000000000' };
    const rows = await this.prisma.conversation.findMany({
      where,
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 100,
      include: {
        assignee: { select: { fullName: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, where: { deletedAt: null } },
        readCursors: { where: { userId: actor.userId } },
      },
    });
    const out: ConversationSummary[] = [];
    for (const c of rows) {
      const cursor = c.readCursors[0];
      const lastRead = cursor ? await this.prisma.message.findUnique({ where: { id: cursor.lastReadMessageId }, select: { createdAt: true } }) : null;
      const unreadCount = await this.prisma.message.count({
        where: {
          conversationId: c.id,
          deletedAt: null,
          senderId: { not: actor.userId },
          ...(lastRead ? { createdAt: { gt: lastRead.createdAt } } : {}),
        },
      });
      out.push({
        id: c.id,
        subject: c.subject,
        subjectKind: c.subjectKind,
        subjectId: c.subjectId,
        lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
        lastMessagePreview: c.messages[0]?.body.slice(0, 120) ?? null,
        lastMessageFromSystem: c.messages[0]?.senderKind === 'SYSTEM',
        unreadCount,
        assignee: c.assignee?.fullName ?? null,
      });
    }
    return out;
  }

  /** Paginated history, newest page first; `cursor` walks backwards, `after` resyncs forwards. */
  async history(actor: Actor, conversationId: string, opts: { cursor?: string; after?: string; limit: number }): Promise<CursorPage<MessageView>> {
    await this.getAuthorized(actor, conversationId);
    if (opts.after) {
      const after = await this.prisma.message.findFirst({ where: { id: opts.after, conversationId } });
      const rows = await this.prisma.message.findMany({
        where: { conversationId, ...(after ? { OR: [{ createdAt: { gt: after.createdAt } }, { createdAt: after.createdAt, id: { gt: after.id } }] } : {}) },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: opts.limit,
        include: messageInclude,
      });
      return { items: await Promise.all(rows.map((r) => this.toMessageView(r, actor))), nextCursor: null };
    }
    const c = opts.cursor ? decodeCursor(opts.cursor) : null;
    const rows = await this.prisma.message.findMany({
      where: { conversationId, ...(c ? { OR: [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: c.id } }] } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      include: messageInclude,
    });
    const hasMore = rows.length > opts.limit;
    const page = rows.slice(0, opts.limit);
    const last = page[page.length - 1];
    return {
      items: await Promise.all(page.reverse().map((r) => this.toMessageView(r, actor))),
      nextCursor: hasMore && last ? encodeCursor(last) : null,
    };
  }

  /**
   * Persists a message before acknowledging it. A retried send with the same
   * clientMessageId returns the already stored message instead of a duplicate (A16).
   */
  async send(actor: Actor, input: SendMessage): Promise<MessageView> {
    const conv = await this.prisma.conversation.findUnique({ where: { id: input.conversationId } });
    if (!conv || !this.canRead(actor, conv)) throw notFound();
    if (!this.canWrite(actor, conv)) throw forbidden();
    await this.limits.hit(LIMITS.chatPerUser, actor.userId);
    const senderKind = actor.kind === 'CUSTOMER' ? 'CUSTOMER' : 'STAFF';
    const existing = await this.prisma.message.findUnique({
      where: { conversationId_senderKind_clientMessageId: { conversationId: conv.id, senderKind, clientMessageId: input.clientMessageId } },
      include: messageInclude,
    });
    if (existing) {
      if (existing.senderId !== actor.userId) throw forbidden();
      return this.toMessageView(existing, actor);
    }
    await this.attachments.assertOwnedUsable(actor.userId, input.attachmentIds);
    let messageId: string;
    try {
      messageId = await this.prisma.tx(async (tx) => {
        const m = await tx.message.create({
          data: { conversationId: conv.id, senderId: actor.userId, senderKind, clientMessageId: input.clientMessageId, body: input.body },
        });
        if (input.attachmentIds.length) {
          await tx.messageAttachment.createMany({ data: input.attachmentIds.map((attachmentId) => ({ messageId: m.id, attachmentId })) });
          await tx.attachment.updateMany({ where: { id: { in: input.attachmentIds } }, data: { subjectType: 'MESSAGE', subjectId: conv.id } });
        }
        await tx.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: m.createdAt } });
        await tx.messageReadCursor.upsert({
          where: { conversationId_userId: { conversationId: conv.id, userId: actor.userId } },
          create: { conversationId: conv.id, userId: actor.userId, lastReadMessageId: m.id, lastReadAt: new Date() },
          update: { lastReadMessageId: m.id, lastReadAt: new Date() },
        });
        if (actor.kind === 'STAFF') {
          await tx.participant.upsert({
            where: { conversationId_userId: { conversationId: conv.id, userId: actor.userId } },
            create: { conversationId: conv.id, userId: actor.userId, role: 'STAFF' },
            update: {},
          });
        }
        const recipient = actor.kind === 'CUSTOMER' ? conv.assigneeId : conv.customerId;
        if (recipient) {
          await this.outbox.notify(tx, {
            userId: recipient, type: 'message.new', params: { subject: conv.subject },
            linkPath: actor.kind === 'CUSTOMER' ? `/admin/conversations/${conv.id}` : `/account/messages/${conv.id}`,
            dedupeKey: `msg:${m.id}`,
          });
        }
        return m.id;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const dup = await this.prisma.message.findUnique({
          where: { conversationId_senderKind_clientMessageId: { conversationId: conv.id, senderKind, clientMessageId: input.clientMessageId } },
          include: messageInclude,
        });
        if (dup && dup.senderId === actor.userId) return this.toMessageView(dup, actor);
      }
      throw e;
    }
    this.bus.publish({ type: 'message.created', conversationId: conv.id, messageId });
    const saved = await this.prisma.message.findUniqueOrThrow({ where: { id: messageId }, include: messageInclude });
    return this.toMessageView(saved, actor);
  }

  /** System messages (e.g. quote cards) use a namespaced idempotent client id. */
  async postSystemMessage(tx: Tx, conversationId: string, dedupe: string, body: string, quoteVersionId: string | null = null): Promise<void> {
    await tx.message.createMany({
      data: [{ conversationId, senderKind: 'SYSTEM', clientMessageId: `sys:${dedupe}`.slice(0, 64), body, quoteVersionId }],
      skipDuplicates: true,
    });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
  }

  async markRead(actor: Actor, conversationId: string, messageId: string): Promise<void> {
    await this.getAuthorized(actor, conversationId);
    const msg = await this.prisma.message.findFirst({ where: { id: messageId, conversationId } });
    if (!msg) throw notFound();
    const cursor = await this.prisma.messageReadCursor.findUnique({ where: { conversationId_userId: { conversationId, userId: actor.userId } } });
    if (cursor) {
      const current = await this.prisma.message.findUnique({ where: { id: cursor.lastReadMessageId }, select: { createdAt: true } });
      if (current && current.createdAt >= msg.createdAt) return; // cursors only move forward
    }
    await this.prisma.messageReadCursor.upsert({
      where: { conversationId_userId: { conversationId, userId: actor.userId } },
      create: { conversationId, userId: actor.userId, lastReadMessageId: messageId, lastReadAt: new Date() },
      update: { lastReadMessageId: messageId, lastReadAt: new Date() },
    });
  }

  async startSupport(actor: Actor, input: { subject: string; body: string; clientMessageId: string }): Promise<{ conversationId: string; message: MessageView }> {
    const prior = await this.prisma.message.findFirst({
      where: { senderId: actor.userId, clientMessageId: input.clientMessageId, conversation: { subjectKind: 'SUPPORT', customerId: actor.userId } },
    });
    if (prior) {
      const m = await this.prisma.message.findUniqueOrThrow({ where: { id: prior.id }, include: messageInclude });
      return { conversationId: prior.conversationId, message: await this.toMessageView(m, actor) };
    }
    const conv = await this.prisma.$transaction(async (tx) => {
      const c = await tx.conversation.create({ data: { subjectKind: 'SUPPORT', subject: input.subject, customerId: actor.userId } });
      await tx.participant.create({ data: { conversationId: c.id, userId: actor.userId, role: 'CUSTOMER' } });
      return c;
    });
    const message = await this.send(actor, { conversationId: conv.id, clientMessageId: input.clientMessageId, body: input.body, attachmentIds: [] });
    return { conversationId: conv.id, message };
  }

  async assign(conversationId: string, assigneeId: string | null): Promise<void> {
    if (assigneeId) {
      const staff = await this.prisma.user.findFirst({ where: { id: assigneeId, kind: 'STAFF', status: 'ACTIVE' } });
      if (!staff) throw notFound();
    }
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { assigneeId } });
    this.bus.publish({ type: 'conversation.access-changed', conversationId });
  }

  async notes(actor: Actor, conversationId: string) {
    if (actor.kind !== 'STAFF') throw notFound();
    await this.getAuthorized(actor, conversationId);
    const rows = await this.prisma.internalNote.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' }, include: { author: { select: { fullName: true } } } });
    return rows.map((n) => ({ id: n.id, body: n.body, author: n.author.fullName, createdAt: n.createdAt.toISOString() }));
  }

  async addNote(actor: Actor, conversationId: string, body: string) {
    if (actor.kind !== 'STAFF' || !actor.permissions.has('notes.write')) throw forbidden();
    const conv = await this.getAuthorized(actor, conversationId);
    const subjectType = conv.subjectKind === 'SOURCING_REQUEST' ? 'SOURCING_REQUEST' : conv.subjectKind === 'PROCUREMENT' ? 'PROCUREMENT' : 'STOCK_ORDER';
    const note = await this.prisma.internalNote.create({ data: { conversationId, subjectType, subjectId: conv.subjectId ?? conv.id, authorId: actor.userId, body } });
    return { id: note.id };
  }
}
