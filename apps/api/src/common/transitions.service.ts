import { Injectable } from '@nestjs/common';
import { type MachineName, assertTransition } from '@hedax/domain';
import type { EventSubject } from '../generated/prisma/enums.js';
import type { Tx } from './prisma.service.js';
import { Prisma } from './prisma.service.js';
import { currentActor } from './request-context.js';
import { toJsonSafe } from './serialize.js';

export interface TransitionInput {
  machine: MachineName;
  subjectType: EventSubject;
  subjectId: string;
  from: string;
  to: string;
  reason?: string | null;
  data?: Record<string, unknown>;
  customerVisible?: boolean;
  actorKind?: 'CUSTOMER' | 'STAFF' | 'SYSTEM' | 'PROVIDER';
  actorId?: string | null;
}

/**
 * Validates a state change against the backend state machine and appends it to
 * the history (actor, time, from/to, reason). Callers must perform the actual
 * row update with a `WHERE status = from` condition inside the same transaction.
 */
@Injectable()
export class TransitionsService {
  async record(tx: Tx, input: TransitionInput): Promise<void> {
    assertTransition(input.machine, input.from, input.to, input.reason);
    const actor = currentActor();
    await tx.orderEvent.create({
      data: {
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        type: 'STATUS_CHANGED',
        fromState: input.from,
        toState: input.to,
        reason: input.reason ?? null,
        actorKind: input.actorKind ?? (actor ? actor.kind : 'SYSTEM'),
        actorId: input.actorId !== undefined ? input.actorId : (actor?.userId ?? null),
        customerVisible: input.customerVisible ?? true,
        data: toJsonSafe(input.data ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async note(
    tx: Tx,
    input: { subjectType: EventSubject; subjectId: string; type: string; data?: Record<string, unknown>; customerVisible?: boolean; reason?: string | null },
  ): Promise<void> {
    const actor = currentActor();
    await tx.orderEvent.create({
      data: {
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        type: input.type,
        reason: input.reason ?? null,
        actorKind: actor ? actor.kind : 'SYSTEM',
        actorId: actor?.userId ?? null,
        customerVisible: input.customerVisible ?? true,
        data: toJsonSafe(input.data ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
