import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { idempotencyKeySchema } from '@hedax/contracts';
import { badRequest, conflict, unprocessable } from './errors.js';
import { PrismaService, Prisma } from './prisma.service.js';
import { toJsonSafe } from './serialize.js';

const TTL_MS = 24 * 3_600_000;

/**
 * Request-level idempotency for retry-sensitive mutations (checkout, payment
 * start, quote acceptance, refunds, imports). The same key + same body returns
 * the stored response; the same key with a different body is refused. Business
 * tables additionally carry unique constraints, so correctness never depends on
 * this cache alone.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(scope: string, actorKey: string, rawKey: string | undefined, body: unknown, fn: () => Promise<T>): Promise<T> {
    const parsed = idempotencyKeySchema.safeParse(rawKey);
    if (!parsed.success) throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key header is required');
    const key = parsed.data;
    const requestHash = createHash('sha256').update(JSON.stringify(toJsonSafe(body ?? null))).digest('hex');

    try {
      await this.prisma.idempotencyRecord.create({
        data: { scope, actorKey, key, requestHash, expiresAt: new Date(Date.now() + TTL_MS) },
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') throw e;
      const existing = await this.prisma.idempotencyRecord.findUnique({ where: { scope_actorKey_key: { scope, actorKey, key } } });
      if (!existing) throw conflict('REQUEST_IN_PROGRESS', 'Please retry');
      if (existing.requestHash !== requestHash) throw unprocessable('IDEMPOTENCY_KEY_REUSED', 'This key was used for a different request');
      if (existing.status !== 'COMPLETED') throw conflict('REQUEST_IN_PROGRESS', 'The same request is still being processed');
      return existing.responseBody as T;
    }

    try {
      const result = await fn();
      await this.prisma.idempotencyRecord.update({
        where: { scope_actorKey_key: { scope, actorKey, key } },
        data: { status: 'COMPLETED', responseStatus: 200, responseBody: toJsonSafe(result) as Prisma.InputJsonValue },
      });
      return result;
    } catch (e) {
      // Failed attempts are forgotten so the client can retry with the same key.
      await this.prisma.idempotencyRecord.delete({ where: { scope_actorKey_key: { scope, actorKey, key } } }).catch(() => undefined);
      throw e;
    }
  }
}
