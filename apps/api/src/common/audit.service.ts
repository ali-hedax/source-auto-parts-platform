import { Injectable } from '@nestjs/common';
import type { Tx } from './prisma.service.js';
import { Prisma } from './prisma.service.js';
import { currentContext } from './request-context.js';
import { toJsonSafe } from './serialize.js';

const REDACT = /password|secret|token|otp|code_hash|codeHash|card|pan|cvv|authorization/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = REDACT.test(k) ? '[redacted]' : redact(v);
    return out;
  }
  return value;
}

export interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  actorKind?: 'CUSTOMER' | 'STAFF' | 'SYSTEM' | 'PROVIDER';
  actorId?: string | null;
}

/** Append-only audit trail for price, stock, role, rate, quote, refund and order-state changes (spec §13). */
@Injectable()
export class AuditService {
  async record(tx: Tx, input: AuditInput): Promise<void> {
    const ctx = currentContext();
    const actor = ctx?.actor ?? null;
    await tx.auditLog.create({
      data: {
        actorId: input.actorId !== undefined ? input.actorId : (actor?.userId ?? null),
        actorKind: input.actorKind ?? (actor ? actor.kind : 'SYSTEM'),
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        before: input.before === undefined ? Prisma.DbNull : (redact(toJsonSafe(input.before)) as Prisma.InputJsonValue),
        after: input.after === undefined ? Prisma.DbNull : (redact(toJsonSafe(input.after)) as Prisma.InputJsonValue),
        requestId: ctx?.requestId ?? null,
        ipHash: ctx?.ipHash ?? null,
      },
    });
  }
}
