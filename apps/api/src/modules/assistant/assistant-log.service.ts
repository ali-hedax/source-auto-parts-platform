import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  ASSISTANT_LOG_RETENTION_DAYS,
  type AssistantConversationDetail,
  type AssistantConversationList,
  type AssistantConversationSummary,
  type AssistantLogStatus,
} from '@hedax/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../../common/audit.service.js';
import { notFound } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';

const DAY_MS = 86_400_000;
const PAGE_SIZE = 20;

export interface AssistantLogEntry {
  /** The browser's chat-session id; a fresh one is used when the visitor sent none. */
  clientKey?: string;
  locale: 'fa' | 'en';
  userId: string | null;
  ipHash: string | null;
  question: string;
  answer: string | null;
  status: AssistantLogStatus;
  errorReason?: string | null;
  productSkus: string[];
  provider?: string | null;
  model?: string | null;
  usage?: unknown;
  latencyMs: number;
}

type ConversationRow = Prisma.AssistantConversationGetPayload<{ include: { messages: true } }>;

/**
 * The guide's conversation log, reviewed by the owner under Admin → AI Chatbot → Messages.
 * Recording never blocks or fails a visitor's reply: a database error is logged and swallowed.
 */
@Injectable()
export class AssistantLogService {
  private readonly logger = new Logger(AssistantLogService.name);
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async record(entry: AssistantLogEntry): Promise<void> {
    try {
      const u = entry.usage as { prompt_tokens?: unknown; completion_tokens?: unknown } | null | undefined;
      const tokens = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
      const failed = entry.status === 'FAILED' ? 1 : 0;
      const now = new Date();
      const clientKey = entry.clientKey ?? randomUUID();
      await this.prisma.tx(async (tx) => {
        const conversation = await tx.assistantConversation.upsert({
          where: { clientKey },
          create: { clientKey, locale: entry.locale, userId: entry.userId, ipHash: entry.ipHash, messageCount: 1, failedCount: failed, startedAt: now, lastMessageAt: now },
          update: { messageCount: { increment: 1 }, failedCount: { increment: failed }, lastMessageAt: now, ...(entry.userId ? { userId: entry.userId } : {}) },
          select: { id: true },
        });
        await tx.assistantMessage.create({
          data: {
            conversationId: conversation.id,
            question: entry.question,
            answer: entry.answer,
            status: entry.status,
            errorReason: entry.errorReason?.slice(0, 120) ?? null,
            productSkus: entry.productSkus.slice(0, 20),
            provider: entry.provider ?? null,
            model: entry.model?.slice(0, 120) ?? null,
            promptTokens: tokens(u?.prompt_tokens),
            completionTokens: tokens(u?.completion_tokens),
            latencyMs: Math.max(0, Math.round(entry.latencyMs)),
          },
        });
      });
    } catch (e) {
      this.logger.warn(`assistant log: recording failed: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  async list(query: { page: number; q?: string; status: 'all' | 'failed' }): Promise<AssistantConversationList> {
    const q = query.q?.trim();
    const where: Prisma.AssistantConversationWhereInput = {
      ...(query.status === 'failed' ? { failedCount: { gt: 0 } } : {}),
      ...(q ? { messages: { some: { OR: [{ question: { contains: q, mode: 'insensitive' } }, { answer: { contains: q, mode: 'insensitive' } }] } } } : {}),
    };
    const since = new Date(Date.now() - 7 * DAY_MS);
    const [total, rows, conversations7d, messages7d, failed7d] = await Promise.all([
      this.prisma.assistantConversation.count({ where }),
      this.prisma.assistantConversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: (query.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      }),
      this.prisma.assistantConversation.count({ where: { lastMessageAt: { gte: since } } }),
      this.prisma.assistantMessage.count({ where: { createdAt: { gte: since } } }),
      this.prisma.assistantMessage.count({ where: { createdAt: { gte: since }, status: 'FAILED' } }),
    ]);
    return {
      items: rows.map((r) => this.summary(r)),
      total,
      page: query.page,
      pageSize: PAGE_SIZE,
      retentionDays: ASSISTANT_LOG_RETENTION_DAYS,
      stats: { conversations7d, messages7d, failed7d },
    };
  }

  async get(id: string): Promise<AssistantConversationDetail> {
    const row = await this.prisma.assistantConversation.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
    if (!row) throw notFound('CONVERSATION_NOT_FOUND', 'Conversation not found');
    return {
      ...this.summary(row),
      messages: row.messages.map((m) => ({
        id: m.id,
        question: m.question,
        answer: m.answer,
        status: m.status as AssistantLogStatus,
        errorReason: m.errorReason,
        productSkus: m.productSkus,
        provider: m.provider,
        model: m.model,
        promptTokens: m.promptTokens,
        completionTokens: m.completionTokens,
        latencyMs: m.latencyMs,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async remove(id: string, actorId: string | null): Promise<{ deleted: true }> {
    return this.prisma.tx(async (tx) => {
      const row = await tx.assistantConversation.findUnique({ where: { id }, select: { id: true, messageCount: true, startedAt: true } });
      if (!row) throw notFound('CONVERSATION_NOT_FOUND', 'Conversation not found');
      await tx.assistantConversation.delete({ where: { id } });
      // The audit keeps that a conversation was deleted, never its content.
      await this.audit.record(tx, { action: 'assistant.conversation_deleted', entityType: 'assistant_conversation', entityId: id, before: { messageCount: row.messageCount, startedAt: row.startedAt.toISOString() }, actorId });
      return { deleted: true as const };
    });
  }

  private summary(r: ConversationRow): AssistantConversationSummary {
    const first = r.messages[0];
    const lastAnswered = [...r.messages].reverse().find((m) => m.answer);
    return {
      id: r.id,
      locale: r.locale === 'en' ? 'en' : 'fa',
      signedIn: r.userId !== null,
      messageCount: r.messageCount,
      failedCount: r.failedCount,
      startedAt: r.startedAt.toISOString(),
      lastMessageAt: r.lastMessageAt.toISOString(),
      firstQuestion: first?.question ?? '',
      lastAnswer: lastAnswered?.answer ?? null,
    };
  }
}
