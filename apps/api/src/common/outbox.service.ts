import { Injectable } from '@nestjs/common';
import type { Tx } from './prisma.service.js';
import { Prisma } from './prisma.service.js';
import { toJsonSafe } from './serialize.js';

/** Outbox event types consumed by the worker. */
export type OutboxType =
  | 'notification.send'
  | 'payment.settled'
  | 'payment.reconcile'
  | 'procurement.started'
  | 'quote.sent'
  | 'quote.pdf.render'
  | 'attachment.scan'
  | 'import.parse'
  | 'import.commit'
  | 'message.created';

export interface OutboxInput {
  type: OutboxType;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  /** Same dedupeKey = same event; duplicates (e.g. repeated callbacks) are ignored. */
  dedupeKey: string;
  availableAt?: Date;
}

/**
 * Transactional outbox (spec §9.2): events are inserted in the same DB
 * transaction as the business change and dispatched by the worker, so nothing
 * is lost if the process dies right after commit.
 */
@Injectable()
export class OutboxService {
  async enqueue(tx: Tx, input: OutboxInput): Promise<void> {
    await tx.outboxEvent.createMany({
      data: [
        {
          type: input.type,
          aggregateType: input.aggregateType,
          aggregateId: input.aggregateId,
          payload: toJsonSafe(input.payload) as Prisma.InputJsonValue,
          dedupeKey: input.dedupeKey,
          availableAt: input.availableAt ?? new Date(),
        },
      ],
      skipDuplicates: true,
    });
  }

  /** Convenience for in-app (+ optional SMS) notifications with a dedupe key. */
  async notify(
    tx: Tx,
    input: { userId: string; type: string; params?: Record<string, unknown>; linkPath?: string | null; dedupeKey: string; sms?: boolean },
  ): Promise<void> {
    await this.enqueue(tx, {
      type: 'notification.send',
      aggregateType: 'user',
      aggregateId: input.userId,
      payload: { userId: input.userId, type: input.type, params: input.params ?? {}, linkPath: input.linkPath ?? null, sms: input.sms ?? false },
      dedupeKey: `notify:${input.dedupeKey}`,
    });
  }
}
