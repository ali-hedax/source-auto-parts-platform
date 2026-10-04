import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { type Job, Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../common/prisma.service.js';
import { PublicCacheService } from '../common/public-cache.service.js';
import { runWithContext } from '../common/request-context.js';
import { AttachmentsService } from '../modules/attachments/attachments.service.js';
import { ImportsService } from '../modules/imports/imports.service.js';
import { NotificationsService } from '../modules/notifications/notifications.service.js';
import { StockOrderSettlement } from '../modules/orders/stock-order-settlement.js';
import { PaymentsService } from '../modules/payments/payments.service.js';
import { QuotesService } from '../modules/sourcing/quotes.service.js';

export const QUEUE_EVENTS = 'hedax-events';
export const QUEUE_SCHEDULED = 'hedax-scheduled';
const MAX_ATTEMPTS = 8;

/** Periodic maintenance jobs and their intervals. */
const SCHEDULES: ReadonlyArray<readonly [name: string, everyMs: number]> = [
  ['payments.reconcile', 60_000],
  ['reservations.sweep', 60_000],
  ['quotes.expire', 5 * 60_000],
  ['orders.cancel-abandoned', 60 * 60_000],
  ['sms.send', 30_000],
  ['cleanup', 60 * 60_000],
];

/** Events whose handling changes what anonymous visitors see (catalog, prices, stock). */
const PUBLIC_EVENTS = new Set(['import.commit', 'payment.reconcile']);

export type EventHandler = (payload: Record<string, unknown>, meta: { outboxId: string; dedupeKey: string }) => Promise<void>;

/**
 * Moves committed outbox rows into BullMQ (jobId = outbox id, so a row is never
 * queued twice) and runs periodic maintenance through BullMQ job schedulers.
 * Handlers must be idempotent: a job may run again after a crash.
 *
 * With QUEUE_DRIVER=inline (development without Redis; refused in production)
 * the claimed rows run directly in this process, one at a time, and the
 * schedules use timers. Handlers, retries and the outbox table are the same.
 */
@Injectable()
export class OutboxDispatcher implements OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private readonly handlers = new Map<string, EventHandler>();
  private readonly inline: boolean;
  private readonly connection: Redis | null;
  private events?: Queue;
  private scheduled?: Queue;
  private workers: Worker[] = [];
  private pollTimer: NodeJS.Timeout | null = null;
  private timers: NodeJS.Timeout[] = [];
  private readonly runningScheduled = new Set<string>();
  private stopping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly attachments: AttachmentsService,
    private readonly imports: ImportsService,
    private readonly notifications: NotificationsService,
    private readonly quotes: QuotesService,
    private readonly stockOrders: StockOrderSettlement,
    private readonly publicCache: PublicCacheService,
    @Inject(ENV) env: Env,
  ) {
    this.inline = env.QUEUE_DRIVER === 'inline';
    this.connection = this.inline ? null : new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    // Without a listener ioredis reports every reconnect failure as an unhandled error; log each distinct one once.
    let lastRedisError = '';
    this.connection?.on('error', (e: Error & { code?: string }) => {
      const code = e.code ?? e.name;
      if (code !== lastRedisError) this.logger.warn(`redis unavailable: ${code}`);
      lastRedisError = code;
    });
    this.connection?.on('ready', () => {
      lastRedisError = '';
    });
    this.register('attachment.scan', async (p) => this.attachments.scan(String(p.attachmentId)));
    this.register('import.parse', async (p) => this.imports.parse(String(p.jobId)));
    this.register('import.commit', async (p) => this.imports.commit(String(p.jobId)));
    this.register('payment.reconcile', async (p) => void (await this.payments.verify(String(p.attemptId), 'INQUIRY')));
    this.register('notification.send', async (p, meta) =>
      this.notifications.deliver(p as { userId: string; type: string; params: Record<string, unknown>; linkPath: string | null; sms: boolean }, meta.dedupeKey),
    );
    // Pure signals: other side effects already happened in the business transaction.
    for (const type of ['payment.settled', 'procurement.started', 'quote.sent', 'message.created']) this.register(type, async () => undefined);
  }

  /** Extra handlers (e.g. the PDF renderer that needs a browser) are registered by apps/worker. */
  register(type: string, handler: EventHandler): void {
    this.handlers.set(type, handler);
  }

  async start(): Promise<void> {
    if (this.connection) {
      const connection = this.connection;
      this.events = new Queue(QUEUE_EVENTS, { connection });
      this.scheduled = new Queue(QUEUE_SCHEDULED, { connection });

      this.workers.push(
        new Worker(QUEUE_EVENTS, (job: Job<{ outboxId: string }>) => this.processRow(job.data.outboxId), { connection, concurrency: 4 }),
        new Worker(QUEUE_SCHEDULED, (job: Job) => this.runScheduled(job.name), { connection, concurrency: 1 }),
      );
      for (const w of this.workers) w.on('failed', (job, err) => this.logger.warn(`job ${job?.name} failed: ${err.message}`));

      for (const [name, every] of SCHEDULES) await this.scheduled.upsertJobScheduler(name, { every }, { name, data: {} });
    } else {
      for (const [name, every] of SCHEDULES) this.timers.push(setInterval(() => void this.runScheduledInline(name), every));
      this.logger.warn('QUEUE_DRIVER=inline: jobs run in this process without Redis (development only)');
    }

    const poll = async () => {
      if (this.stopping) return;
      try {
        await this.pumpOutbox();
      } catch (e) {
        this.logger.warn(`outbox pump: ${e instanceof Error ? e.message : String(e)}`);
      }
      this.pollTimer = setTimeout(poll, 1_000);
    };
    void poll();
    this.logger.log('worker started');
  }

  /** Claims due outbox rows with SKIP LOCKED so several workers never double-queue. */
  private async pumpOutbox(): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; type: string }>>`
      UPDATE "outbox_event" SET "status" = 'PROCESSING', "locked_at" = now()
       WHERE "id" IN (
         SELECT "id" FROM "outbox_event"
          WHERE ("status" = 'PENDING' AND "available_at" <= now())
             OR ("status" = 'PROCESSING' AND "locked_at" < now() - interval '10 minutes')
          ORDER BY "available_at" LIMIT ${this.inline ? 10 : 100}
          FOR UPDATE SKIP LOCKED)
      RETURNING "id", "type"`;
    for (const r of rows) {
      // Inline: a row left unprocessed by a shutdown is reclaimed after the 10-minute lock, as after a crash.
      if (!this.events) {
        if (this.stopping) break;
        await this.processRow(r.id);
      } else {
        await this.events.add(r.type, { outboxId: r.id }, { jobId: r.id, removeOnComplete: 1000, removeOnFail: 5000, attempts: 1 });
      }
    }
  }

  private async processRow(outboxId: string): Promise<void> {
    const row = await this.prisma.outboxEvent.findUnique({ where: { id: outboxId } });
    if (!row || row.status === 'DONE') return;
    const handler = this.handlers.get(row.type);
    try {
      if (!handler) throw new Error(`no handler for ${row.type}`);
      await runWithContext({ requestId: `job-${row.id}`, ipHash: null, actor: null }, () =>
        handler(row.payload as Record<string, unknown>, { outboxId: row.id, dedupeKey: row.dedupeKey }),
      );
      await this.prisma.outboxEvent.update({ where: { id: row.id }, data: { status: 'DONE', processedAt: new Date(), attempts: { increment: 1 } } });
      if (PUBLIC_EVENTS.has(row.type)) this.publicCache.invalidate();
    } catch (e) {
      const attempts = row.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      await this.prisma.outboxEvent.update({
        where: { id: row.id },
        data: {
          attempts,
          status: failed ? 'FAILED' : 'PENDING',
          lastError: (e instanceof Error ? e.message : String(e)).slice(0, 1000),
          availableAt: new Date(Date.now() + Math.min(2 ** attempts * 15_000, 3_600_000)),
          lockedAt: null,
        },
      });
      if (failed) this.logger.error(`outbox ${row.type} ${row.id} failed permanently`);
    }
  }

  /** Timer-driven schedule (inline mode): never overlaps itself; a failure waits for the next tick. */
  private async runScheduledInline(name: string): Promise<void> {
    if (this.stopping || this.runningScheduled.has(name)) return;
    this.runningScheduled.add(name);
    try {
      await this.runScheduled(name);
    } catch (e) {
      this.logger.warn(`scheduled ${name} failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.runningScheduled.delete(name);
    }
  }

  private async runScheduled(name: string): Promise<void> {
    await runWithContext({ requestId: `sched-${name}-${Date.now().toString(36)}`, ipHash: null, actor: null }, async () => {
      switch (name) {
        case 'payments.reconcile':
          if ((await this.payments.reconcileDue()) > 0) this.publicCache.invalidate();
          break;
        case 'reservations.sweep': {
          const swept = await this.stockOrders.sweepExpiredReservations();
          if (swept.released + swept.extended > 0) this.publicCache.invalidate();
          break;
        }
        case 'quotes.expire':
          await this.quotes.expireDue();
          break;
        case 'orders.cancel-abandoned':
          if ((await this.stockOrders.cancelAbandonedOrders()) > 0) this.publicCache.invalidate();
          break;
        case 'sms.send':
          await this.notifications.sendPendingSms();
          break;
        case 'cleanup':
          await this.prisma.idempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } });
          await this.prisma.otpChallenge.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } });
          await this.prisma.session.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } });
          await this.prisma.cart.deleteMany({ where: { userId: null, expiresAt: { lt: new Date() } } });
          break;
        default:
          this.logger.warn(`unknown scheduled job ${name}`);
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    for (const timer of this.timers) clearInterval(timer);
    await Promise.all(this.workers.map((w) => w.close()));
    await this.events?.close();
    await this.scheduled?.close();
    this.connection?.disconnect();
  }
}
