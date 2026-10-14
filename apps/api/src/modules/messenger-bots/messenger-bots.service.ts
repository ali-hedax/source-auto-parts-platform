import { timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { productListQuerySchema } from '@hedax/contracts';
import { ENV, type Env } from '../../config/env.js';
import { CatalogService } from '../catalog/catalog.service.js';

type Provider = 'telegram' | 'bale';
type Incoming = { update_id?: number; message?: { text?: string; chat?: { id?: number | string } } };
const secureEqual = (a: string | undefined, b: string | undefined): boolean => {
  if (!a || !b || a.length < 32 || b.length < 32) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Public product search only. Checkout and order history remain on the authenticated website. */
@Injectable()
export class MessengerBotsService {
  private readonly logger = new Logger(MessengerBotsService.name);
  constructor(@Inject(ENV) private readonly env: Env, private readonly catalog: CatalogService) {}

  authorize(provider: Provider, supplied: string | undefined): void {
    const expected = provider === 'telegram' ? this.env.TELEGRAM_WEBHOOK_SECRET : this.env.BALE_WEBHOOK_SECRET;
    const token = provider === 'telegram' ? this.env.TELEGRAM_BOT_TOKEN : this.env.BALE_BOT_TOKEN;
    if (!token || !secureEqual(supplied, expected)) throw new UnauthorizedException();
  }

  async handle(provider: Provider, payload: unknown): Promise<void> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
    const update = payload as Incoming;
    const message = update.message;
    const chatId = message?.chat?.id;
    if (typeof chatId !== 'number' && typeof chatId !== 'string') return;
    if (!/^-?\d{1,20}$/.test(String(chatId))) return;
    if (typeof message?.text !== 'string') return;
    const raw = message.text.trim().slice(0, 120);
    if (!raw) return;
    const home = this.env.PUBLIC_BASE_URL.replace(/\/$/, '');
    let reply: string;
    if (/^\/(start|help)(?:@\w+)?$/i.test(raw)) {
      reply = 'به Source by HEDAX خوش آمدید!\nنام یا کد قطعه را بنویسید تا قیمت و موجودی عمومی آن را جست‌وجو کنم.\nبرای ثبت سفارش و پیگیری سفارش‌ها وارد سایت شوید:\n' + home + '/fa';
    } else if (/^\/(order|orders|track)(?:@\w+)?$/i.test(raw) || /^(سفارش|پیگیری سفارش)$/.test(raw)) {
      reply = 'ثبت سفارش و مشاهده وضعیت سفارش فقط پس از ورود امن به حساب مشتری در سایت انجام می‌شود:\n' + home + '/fa\nربات هنوز به حساب مشتری متصل نیست و اطلاعات سفارش را در چت نمایش نمی‌دهد.';
    } else if (raw.startsWith('/')) {
      reply = 'برای جست‌وجوی قطعه، نام یا کد آن را بدون / ارسال کنید. برای راهنما /start را بفرستید.';
    } else {
      const query = productListQuerySchema.parse({ q: raw, page: 1, pageSize: 5 });
      const result = await this.catalog.list(query, { approvedGroupId: null, display: 'IRR' });
      if (!result.items.length) {
        reply = 'قطعه‌ای با این عبارت پیدا نشد. در سایت می‌توانید درخواست تأمین ثبت کنید:\n' + home + '/fa';
      } else {
        const lines = result.items.map((p, i) => {
          const price = p.price.kind === 'price'
            ? String(p.price.display.amountMinor) + ' (' + p.price.display.currency + '، واحد خرد)'
            : 'استعلام قیمت';
          const stock = p.availability === 'IN_STOCK' ? 'موجود' : p.availability === 'LOW_STOCK' ? 'موجودی محدود' : 'ناموجود';
          return (i + 1) + '. ' + (p.name.fa || p.name.en || p.sku) + '\nکد: ' + p.sku + '\nوضعیت: ' + stock + '\nقیمت: ' + price + '\n' + home + '/fa/parts/' + encodeURIComponent(p.slug);
        });
        reply = lines.join('\n\n') + '\n\nبرای ثبت سفارش و پیگیری آن وارد سایت شوید:\n' + home + '/fa';
      }
    }
    await this.send(provider, String(chatId), reply);
  }

  private async send(provider: Provider, chatId: string, text: string): Promise<void> {
    const token = provider === 'telegram' ? this.env.TELEGRAM_BOT_TOKEN : this.env.BALE_BOT_TOKEN;
    if (!token) return;
    const base = provider === 'telegram' ? 'https://api.telegram.org' : 'https://tapi.bale.ai';
    // Token is used only server-side; never log request URLs or provider response bodies.
    const response = await fetch(base + '/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 3900) }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) this.logger.warn(provider + ' sendMessage failed (HTTP ' + response.status + ')');
  }
}
