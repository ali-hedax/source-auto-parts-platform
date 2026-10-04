import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env.js';

export type BusEvent =
  | { type: 'session.revoked'; sessionIds: string[]; userId: string }
  | { type: 'user.auth-changed'; userId: string }
  | { type: 'message.created'; conversationId: string; messageId: string }
  | { type: 'conversation.access-changed'; conversationId: string };

const CHANNEL = 'hedax:bus';

/**
 * Cross-instance event bus (Redis pub/sub) used to push revocations and new
 * messages to every API instance's WebSocket gateway. Local listeners are
 * always notified, so a single instance works even while Redis reconnects.
 */
@Injectable()
export class RealtimeBus implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeBus.name);
  private readonly local = new EventEmitter();
  private readonly instanceId = Math.random().toString(36).slice(2);
  private readonly pub: Redis;
  private readonly sub: Redis;

  private lastRedisError = '';

  /** Logs a Redis connectivity problem once per distinct error instead of on every retry. */
  private logRedisError(e: Error & { code?: string }): void {
    const code = e.code ?? e.name;
    if (code === this.lastRedisError) return;
    this.lastRedisError = code;
    this.logger.warn(`redis unavailable: ${code}`);
  }

  constructor(@Inject(ENV) env: Env) {
    const opts = { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false } as const;
    this.pub = new Redis(env.REDIS_URL, opts);
    this.sub = new Redis(env.REDIS_URL, { lazyConnect: true });
    for (const client of [this.pub, this.sub]) client.on('error', (e: Error & { code?: string }) => this.logRedisError(e));
    // (Re)subscribe every time the connection becomes ready, including after Redis restarts.
    this.sub.on('ready', () => {
      this.lastRedisError = '';
      this.sub.subscribe(CHANNEL).catch((e: Error) => this.logger.warn(`bus subscribe failed: ${e.message}`));
    });
    this.sub.connect().catch(() => undefined);
    this.sub.on('message', (_channel: string, raw: string) => {
      try {
        const { origin, event } = JSON.parse(raw) as { origin: string; event: BusEvent };
        if (origin !== this.instanceId) this.local.emit('event', event);
      } catch {
        /* ignore malformed */
      }
    });
    this.pub.connect().catch((e: Error) => this.logger.warn(`bus publish connection failed: ${e.message}`));
  }

  publish(event: BusEvent): void {
    this.local.emit('event', event);
    this.pub.publish(CHANNEL, JSON.stringify({ origin: this.instanceId, event })).catch(() => undefined);
  }

  on(listener: (event: BusEvent) => void): () => void {
    this.local.on('event', listener);
    return () => this.local.off('event', listener);
  }

  async onModuleDestroy(): Promise<void> {
    this.pub.disconnect();
    this.sub.disconnect();
  }
}
