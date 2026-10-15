import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { productListQuerySchema } from '@hedax/contracts';
import { formatMoney, money } from '@hedax/domain';
import { z } from 'zod';
import { ENV, type Env } from '../../config/env.js';
import { OutboxService } from '../../common/outbox.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { RateLimitService } from '../../common/rate-limit.service.js';
import { CatalogService } from '../catalog/catalog.service.js';

export type Provider = 'telegram' | 'bale';
const identifier = z.union([z.number().int().safe().positive(), z.string().regex(/^[1-9]\d{0,19}$/)]);
const incomingSchema = z.object({
  update_id: z.number().int().safe().nonnegative(),
  message: z.object({
    text: z.string().max(4096),
    chat: z.object({ id: identifier, type: z.literal('private') }),
    from: z.object({ id: identifier, is_bot: z.literal(false).optional() }),
  }),
});
const jobSchema = z.object({
  provider: z.enum(['telegram', 'bale']),
  botKey: z.string().regex(/^[a-f0-9]{64}$/),
  chatId: z.string().regex(/^[1-9]\d{0,19}$/),
  text: z.string().min(1).max(120),
});

const secureEqual = (a: unknown, b: string | undefined): boolean => {
  if (typeof a !== 'string' || !b || !/^[A-Za-z0-9_-]{32,256}$/.test(a)) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
// Bale always interprets Markdown; remove syntax from untrusted catalog labels.
// eslint-disable-next-line no-control-regex -- intentionally strip controls from externally supplied labels
const plain = (s: string, limit: number) => Array.from(s.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069*_[\]()`\\]/g, ' ')).slice(0, limit).join('');

/** Public catalog only. Orders and checkout require the existing website session. */
@Injectable()
export class MessengerBotsService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly catalog: CatalogService,
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly limits: RateLimitService,
  ) {}

  private token(provider: Provider): string | undefined {
    return provider === 'telegram' ? this.env.TELEGRAM_BOT_TOKEN : this.env.BALE_BOT_TOKEN;
  }

  private botKey(provider: Provider): string {
    // Stable across token rotation for the same bot; no credential stored in jobs.
    return createHash('sha256').update(this.token(provider)?.split(':')[0] ?? '').digest('hex');
  }

  authorize(provider: Provider, supplied: unknown): void {
    const expected = provider === 'telegram' ? this.env.TELEGRAM_WEBHOOK_SECRET : this.env.BALE_WEBHOOK_SECRET;
    if (!this.token(provider) || !secureEqual(supplied, expected)) throw new UnauthorizedException();
  }

  /** Acknowledge only after durable insertion. The DB unique key handles concurrent retries. */
  async handle(provider: Provider, payload: unknown): Promise<void> {
    const parsed = incomingSchema.safeParse(payload);
    if (!parsed.success) return; // Acknowledge unsupported events without retry storms.
    const { update_id: updateId, message } = parsed.data;
    if (String(message.from.id) !== String(message.chat.id)) return;
    const text = message.text.trim();
    if (!text) return;
    const botKey = this.botKey(provider);
    const dedupeKey = `messenger:${provider}:${botKey}:${updateId}`;
    if (await this.prisma.outboxEvent.findUnique({ where: { dedupeKey }, select: { id: true } })) return;
    await this.limits.hit({ bucket: `messenger:${provider}`, limit: 20, windowSeconds: 60 }, String(message.chat.id));
    await this.outbox.enqueue(this.prisma, {
      type: 'messenger.reply', aggregateType: 'messenger', aggregateId: randomUUID(), dedupeKey,
      payload: { provider, botKey, chatId: String(message.chat.id), text: text.slice(0, 120) },
    });
  }

  /** Invoked only by the durable outbox worker, never inside the webhook request. */
  async deliver(payload: Record<string, unknown>): Promise<void> {
    const parsed = jobSchema.safeParse(payload);
    if (!parsed.success) throw new Error('Invalid messenger job');
    const { provider, botKey, chatId, text: raw } = parsed.data;
    const secret = provider === 'telegram' ? this.env.TELEGRAM_WEBHOOK_SECRET : this.env.BALE_WEBHOOK_SECRET;
    if (!this.token(provider) || !secret || botKey !== this.botKey(provider)) throw new Error('Messenger bot disabled or identity changed');
    const home = new URL(this.env.PUBLIC_BASE_URL).origin;
    const orders = `${home}/fa/account/orders`;
    const parts = `${home}/fa/parts`;
    let reply: string;
    if (/^\/(start|help)(?:@SourceByHedaxBot)?(?:\s.*)?$/i.test(raw)) {
      reply = `به Source by HEDAX خوش آمدید!\nنام یا کد قطعه را بنویسید تا قیمت و موجودی عمومی آن را جست‌وجو کنم.\nثبت سفارش: ${parts}\nپیگیری سفارش پس از ورود به حساب: ${orders}`;
    } else if (/^\/(order|orders|track)(?:@SourceByHedaxBot)?(?:\s.*)?$/i.test(raw) || /^(سفارش|پیگیری سفارش)(?:\s.*)?$/.test(raw)) {
      reply = `ثبت سفارش: قطعه را در سایت انتخاب و به سبد خرید اضافه کنید:\n${parts}\nپیگیری سفارش فقط پس از ورود امن به حساب مشتری:\n${orders}\nاطلاعات سفارش و کد ورود را در چت ارسال نکنید.`;
    } else if (raw.startsWith('/')) {
      reply = 'برای جست‌وجوی قطعه، نام یا کد آن را بدون / ارسال کنید. برای راهنما /start را بفرستید.';
    } else {
      const query = productListQuerySchema.parse({ q: raw, page: 1, pageSize: 5 });
      const result = await this.catalog.list(query, { approvedGroupId: null, display: 'IRR' });
      if (!result.items.length) {
        reply = `قطعه‌ای با این عبارت پیدا نشد. درخواست تأمین قطعه:\n${home}/fa/request-part`;
      } else {
        const lines = result.items.slice(0, 5).map((p, i) => {
          const price = p.price.kind === 'price'
            ? formatMoney(money(p.price.payable.currency, p.price.payable.amountMinor), 'fa')
            : 'استعلام قیمت';
          const stock = p.availability === 'IN_STOCK' ? 'موجود' : p.availability === 'LOW_STOCK' ? 'موجودی محدود' : 'ناموجود';
          return `${i + 1}. ${plain(p.name.fa || p.name.en || p.sku, 120)}\nکد: ${plain(p.sku, 80)}\nوضعیت: ${stock}\nقیمت: ${price}\n${parts}/${encodeURIComponent(p.slug)}`;
        });
        const footer = `\n\nقیمت و موجودی نهایی در مرحلهٔ ثبت سفارش بررسی می‌شود.\nپیگیری سفارش: ${orders}`;
        // Keep whole product links, never cut a URL or a surrogate pair in half.
        while (lines.length && lines.join('\n\n').length + footer.length > 3900) lines.pop();
        reply = lines.length ? lines.join('\n\n') + footer : `نتایج جست‌وجو و ثبت سفارش:\n${parts}`;
      }
    }
    await this.send(provider, chatId, reply);
  }

  private async send(provider: Provider, chatId: string, text: string): Promise<void> {
    const base = provider === 'telegram' ? 'https://api.telegram.org' : 'https://tapi.bale.ai';
    try {
      const response = await fetch(`${base}/bot${this.token(provider)}/sendMessage`, {
        method: 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) { await response.body?.cancel(); throw new Error('Provider HTTP error'); }
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true) throw new Error('Provider API error');
    } catch {
      // Never attach the original error/cause: fetch errors may contain the token URL or provider body.
      throw new Error(`${provider} message delivery failed`);
    }
  }
}
