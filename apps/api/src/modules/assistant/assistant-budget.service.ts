import { Inject, Injectable, ServiceUnavailableException, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV, isProduction, type Env } from '../../config/env.js';

export interface BudgetReservation {
  budgetKey: string;
  concurrencyKey: string;
  reservedIrr: number;
}

@Injectable()
export class AssistantBudgetService implements OnModuleDestroy {
  private readonly redis: Redis;
  private memory = new Map<string, number>();
  constructor(@Inject(ENV) private readonly env: Env) { this.redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false }); this.redis.on('error', () => undefined); }

  estimate(input: string, maxOutputTokens: number) {
    const inputTokens = Math.ceil(Buffer.byteLength(input, 'utf8') / 3);
    return Math.ceil((inputTokens * this.env.ASSISTANT_INPUT_PRICE_IRR_PER_MILLION + maxOutputTokens * this.env.ASSISTANT_OUTPUT_PRICE_IRR_PER_MILLION) / 1_000_000);
  }
  actual(usage: unknown, fallback: number) {
    const u = usage as { prompt_tokens?: unknown; completion_tokens?: unknown } | null;
    if (!u || typeof u.prompt_tokens !== 'number' || typeof u.completion_tokens !== 'number') return fallback;
    return Math.ceil((u.prompt_tokens * this.env.ASSISTANT_INPUT_PRICE_IRR_PER_MILLION + u.completion_tokens * this.env.ASSISTANT_OUTPUT_PRICE_IRR_PER_MILLION) / 1_000_000);
  }
  async reserve(estimatedIrr: number, requestLimit: number, mode: 'test' | 'public' = 'public'): Promise<BudgetReservation> {
    const cap = mode === 'test' ? this.env.ASSISTANT_TEST_BUDGET_IRR : this.env.ASSISTANT_DAILY_BUDGET_IRR;
    if (cap <= 0 || estimatedIrr > cap) throw new ServiceUnavailableException('Assistant cost budget is disabled or exhausted');
    const effectiveRequestLimit = Math.min(requestLimit, this.env.ASSISTANT_DAILY_REQUEST_LIMIT);
    const day = new Date().toISOString().slice(0, 10);
    const budgetKey = `assistant:budget:${mode}:${day}`;
    const requestKey = `assistant:requests:${mode}:${day}`;
    const concurrencyKey = `assistant:concurrency:${mode}`;
    try {
      if (this.redis.status !== 'ready') await this.redis.connect();
      const value = Number(await this.redis.eval(
        "local cost=tonumber(redis.call('GET',KEYS[1]) or '0'); local requests=tonumber(redis.call('GET',KEYS[2]) or '0'); local active=tonumber(redis.call('GET',KEYS[3]) or '0'); local add=tonumber(ARGV[1]); if cost+add>tonumber(ARGV[2]) then return -1 end; if requests+1>tonumber(ARGV[3]) then return -2 end; if active+1>tonumber(ARGV[4]) then return -3 end; redis.call('INCRBY',KEYS[1],add); redis.call('INCR',KEYS[2]); redis.call('INCR',KEYS[3]); redis.call('EXPIRE',KEYS[1],172800); redis.call('EXPIRE',KEYS[2],172800); redis.call('EXPIRE',KEYS[3],60); return 1",
        3, budgetKey, requestKey, concurrencyKey, estimatedIrr, cap, effectiveRequestLimit, this.env.ASSISTANT_MAX_CONCURRENT,
      ));
      if (value === -1) throw new ServiceUnavailableException('Assistant cost budget is exhausted');
      if (value === -2) throw new ServiceUnavailableException('Assistant daily request limit reached');
      if (value === -3) throw new ServiceUnavailableException('Assistant is busy');
    } catch (e) {
      if (e instanceof ServiceUnavailableException) throw e;
      if (isProduction(this.env)) throw new ServiceUnavailableException('Assistant budget control unavailable');
      const nextCost = (this.memory.get(budgetKey) ?? 0) + estimatedIrr;
      const nextRequests = (this.memory.get(requestKey) ?? 0) + 1;
      const nextConcurrent = (this.memory.get(concurrencyKey) ?? 0) + 1;
      if (nextCost > cap) throw new ServiceUnavailableException('Assistant cost budget is exhausted');
      if (nextRequests > effectiveRequestLimit) throw new ServiceUnavailableException('Assistant daily request limit reached');
      if (nextConcurrent > this.env.ASSISTANT_MAX_CONCURRENT) throw new ServiceUnavailableException('Assistant is busy');
      this.memory.set(budgetKey, nextCost);
      this.memory.set(requestKey, nextRequests);
      this.memory.set(concurrencyKey, nextConcurrent);
    }
    return { budgetKey, concurrencyKey, reservedIrr: estimatedIrr };
  }
  async settle(reservation: BudgetReservation, actualIrr?: number) {
    const refund = actualIrr === undefined ? 0 : Math.max(0, reservation.reservedIrr - actualIrr);
    try {
      if (this.redis.status !== 'ready') await this.redis.connect();
      await this.redis.eval(
        "local active=tonumber(redis.call('GET',KEYS[2]) or '0'); if tonumber(ARGV[1])>0 then redis.call('DECRBY',KEYS[1],ARGV[1]) end; if active>0 then redis.call('DECR',KEYS[2]) end; return 1",
        2, reservation.budgetKey, reservation.concurrencyKey, refund,
      );
    } catch {
      if (!isProduction(this.env)) {
        if (refund) this.memory.set(reservation.budgetKey, Math.max(0, (this.memory.get(reservation.budgetKey) ?? 0) - refund));
        this.memory.set(reservation.concurrencyKey, Math.max(0, (this.memory.get(reservation.concurrencyKey) ?? 0) - 1));
      }
    }
  }
  onModuleDestroy() { this.redis.disconnect(); }
}
