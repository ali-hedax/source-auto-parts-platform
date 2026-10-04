import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '../generated/prisma/client.js';
import { ENV, type Env } from '../config/env.js';
import { createPgAdapter } from './pg-adapter.js';

export type Tx = Prisma.TransactionClient;

/**
 * Single Prisma client per process (driver adapter: node-postgres).
 * Connection happens lazily on first query, so the process can boot and
 * report readiness=false while the database is unavailable.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({ adapter: createPgAdapter(env.DATABASE_URL, 20) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Interactive transaction with sane defaults for business operations. */
  tx<T>(fn: (tx: Tx) => Promise<T>, options?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeoutMs?: number }): Promise<T> {
    return this.$transaction(fn, {
      isolationLevel: options?.isolationLevel ?? Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: options?.timeoutMs ?? 15_000,
      maxWait: 5_000,
    });
  }
}

export { Prisma };
