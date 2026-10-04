import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV, type Env, isProduction } from '../config/env.js';
import { tooMany, unavailable } from './errors.js';

export interface LimitRule {
  /** Short bucket name, e.g. "otp:phone". */
  bucket: string;
  limit: number;
  windowSeconds: number;
}

export const LIMITS = {
  otpPerPhone: { bucket: 'otp:phone', limit: 5, windowSeconds: 3600 },
  otpPerIp: { bucket: 'otp:ip', limit: 20, windowSeconds: 3600 },
  otpVerifyPerIp: { bucket: 'otp-verify:ip', limit: 30, windowSeconds: 900 },
  staffLoginPerIp: { bucket: 'staff-login:ip', limit: 20, windowSeconds: 900 },
  staffLoginPerEmail: { bucket: 'staff-login:email', limit: 8, windowSeconds: 900 },
  uploadPerUser: { bucket: 'upload:user', limit: 60, windowSeconds: 3600 },
  searchPerIp: { bucket: 'search:ip', limit: 120, windowSeconds: 60 },
  chatPerUser: { bucket: 'chat:user', limit: 40, windowSeconds: 60 },
  sourcingPerUser: { bucket: 'sourcing:user', limit: 20, windowSeconds: 3600 },
} as const satisfies Record<string, LimitRule>;

/**
 * Fixed-window rate limiter backed by Redis (shared across instances).
 * Outside production an in-memory fallback keeps local development usable
 * without Redis; production fails closed for sensitive buckets.
 */
@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly redis: Redis;
  private readonly memory = new Map<string, { count: number; resetAt: number }>();
  private readonly prod: boolean;

  private lastRedisError = '';

  /** Logs a Redis connectivity problem once per distinct error instead of on every retry. */
  private logRedisError(e: Error & { code?: string }): void {
    const code = e.code ?? e.name;
    if (code === this.lastRedisError) return;
    this.lastRedisError = code;
    this.logger.warn(`redis unavailable: ${code}`);
  }

  constructor(@Inject(ENV) env: Env) {
    this.prod = isProduction(env);
    this.redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
    this.redis.on('error', (e: Error & { code?: string }) => this.logRedisError(e));
    this.redis.connect().catch(() => undefined);
  }

  async hit(rule: LimitRule, subject: string | null | undefined): Promise<void> {
    if (!subject) return;
    const key = `rl:${rule.bucket}:${subject}`;
    let count: number;
    try {
      if (this.redis.status !== 'ready') throw new Error('redis not ready');
      const results = await this.redis.multi().incr(key).expire(key, rule.windowSeconds, 'NX').exec();
      count = Number(results?.[0]?.[1] ?? 0);
    } catch {
      if (this.prod) throw unavailable('RATE_LIMITER_UNAVAILABLE', 'Temporarily unavailable, please retry');
      count = this.memoryHit(key, rule.windowSeconds);
    }
    if (count > rule.limit) throw tooMany();
  }

  private memoryHit(key: string, windowSeconds: number): number {
    const now = Date.now();
    const entry = this.memory.get(key);
    if (!entry || entry.resetAt <= now) {
      this.memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }

  async onModuleDestroy(): Promise<void> {
    this.redis.disconnect();
  }
}
