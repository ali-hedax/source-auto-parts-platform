import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessengerBotsService } from '../../dist/modules/messenger-bots/messenger-bots.service.js';
import { loadEnv } from '../../src/config/env.js';
import type { Env } from '../../src/config/env.js';
import type { CatalogService } from '../../src/modules/catalog/catalog.service.js';
import type { PrismaService } from '../../src/common/prisma.service.js';
import type { OutboxService } from '../../src/common/outbox.service.js';
import type { RateLimitService } from '../../src/common/rate-limit.service.js';

const token = '12345:TEST_ONLY_FAKE_CREDENTIAL_123456';
const secret = 't'.repeat(48);
const botKey = createHash('sha256').update('12345').digest('hex');
function fixture() {
  const env = { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret, BALE_BOT_TOKEN: token, BALE_WEBHOOK_SECRET: 'b'.repeat(48), PUBLIC_BASE_URL: 'https://shop.example.test' } as Env;
  const catalog = { list: vi.fn().mockResolvedValue({ items: [] }) };
  const prisma = { outboxEvent: { findUnique: vi.fn().mockResolvedValue(null) } };
  const outbox = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const limits = { hit: vi.fn().mockResolvedValue(undefined) };
  const service = new MessengerBotsService(env, catalog as unknown as CatalogService, prisma as unknown as PrismaService, outbox as unknown as OutboxService, limits as unknown as RateLimitService);
  return { service, env, catalog, prisma, outbox, limits };
}
const update = (text = 'لنت') => ({ update_id: 17, message: { text, from: { id: 123, is_bot: false }, chat: { id: 123, type: 'private' } } });
const job = (text = 'لنت', provider: 'telegram' | 'bale' = 'telegram') => ({ provider, botKey, chatId: '123', text });
afterEach(() => vi.unstubAllGlobals());

describe('messenger webhook authentication and durable intake', () => {
  it('fails closed for missing, malformed, wrong-provider and disabled credentials', () => {
    const { service, env } = fixture();
    for (const value of [undefined, '', 'x'.repeat(48), [secret], secret + ' ', '😈'.repeat(48)]) expect(() => service.authorize('telegram', value)).toThrow();
    expect(() => service.authorize('telegram', env.BALE_WEBHOOK_SECRET)).toThrow();
    expect(() => service.authorize('bale', secret)).toThrow();
    expect(() => service.authorize('telegram', secret)).not.toThrow();
    expect(() => service.authorize('bale', env.BALE_WEBHOOK_SECRET)).not.toThrow();
    env.TELEGRAM_BOT_TOKEN = undefined;
    expect(() => service.authorize('telegram', secret)).toThrow();
  });

  it.each([null, [], {}, { update_id: -1 }, { ...update(), update_id: Number.MAX_SAFE_INTEGER + 1 }, { ...update(), update_id: '17' }, { ...update(), message: { ...update().message, chat: { id: -100, type: 'group' } } }, { ...update(), message: { ...update().message, from: { id: 124 } } }, { ...update(), message: { ...update().message, from: { id: 123, is_bot: true } } }, update('x'.repeat(4097)), update(' ')])('ignores malformed or unsupported events without work: %j', async (body) => {
    const { service, outbox, catalog } = fixture();
    await service.handle('telegram', body);
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(catalog.list).not.toHaveBeenCalled();
  });

  it('persists only bounded public input, with provider/bot/update deduplication and no secrets', async () => {
    const { service, outbox, catalog } = fixture();
    const network = vi.fn(); vi.stubGlobal('fetch', network);
    await service.handle('telegram', update('x'.repeat(150)));
    const event = outbox.enqueue.mock.calls[0]![1];
    expect(event.dedupeKey).toBe(`messenger:telegram:${botKey}:17`);
    expect(event.payload.text).toHaveLength(120);
    expect(JSON.stringify(event)).not.toContain(token);
    expect(JSON.stringify(event)).not.toContain(secret);
    expect(catalog.list).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
    await service.handle('bale', update());
    expect(outbox.enqueue.mock.calls[1]![1].dedupeKey).not.toBe(event.dedupeKey);
  });

  it('acknowledges stored duplicates before rate limiting and propagates failed durable writes', async () => {
    const { service, prisma, outbox, limits } = fixture();
    prisma.outboxEvent.findUnique.mockResolvedValueOnce({ id: 'already-stored' });
    await service.handle('telegram', update());
    expect(limits.hit).not.toHaveBeenCalled(); expect(outbox.enqueue).not.toHaveBeenCalled();
    outbox.enqueue.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.handle('telegram', update())).rejects.toThrow('database unavailable');
  });
});

describe('messenger catalog and order boundary', () => {
  function transport() {
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    return fetcher;
  }
  it.each(['telegram', 'bale'] as const)('uses public pricing, exact rial units, real routes and all stock states for %s', async (provider) => {
    const { service, catalog } = fixture();
    catalog.list.mockResolvedValue({ items: ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'].map((availability, i) => ({ name: { fa: '[لنت](https://evil.test)' }, sku: 'SKU', slug: 'لنت', availability, unit: { name: 'دست', nameEn: 'set', allowDecimal: false, step: 1 }, price: i === 2 ? { kind: 'inquiry' } : { kind: 'price', payable: { currency: 'IRR', amountMinor: '9007199254740993123' }, display: { currency: 'AED', amountMinor: '10' } } })) });
    const send = transport(); await service.deliver(job('لنت', provider));
    expect(catalog.list).toHaveBeenCalledWith(expect.objectContaining({ q: 'لنت', pageSize: 5 }), { approvedGroupId: null, display: 'IRR' });
    const text = JSON.parse(send.mock.calls[0]![1].body).text;
    // Prices are per sales unit (v1.2).
    expect(text).toContain('۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳٬۱۲۳ ریال / دست');
    for (const s of ['موجود', 'موجودی محدود', 'ناموجود', 'استعلام قیمت', '/fa/parts/%D9%84%D9%86%D8%AA', '/fa/account/orders']) expect(text).toContain(s);
    expect(text).not.toContain('[لنت]'); expect(text).not.toContain('واحد خرد');
    expect(send.mock.calls[0]![0]).toContain(provider === 'telegram' ? 'api.telegram.org' : 'tapi.bale.ai');
  });

  it.each(['1800101506', 'میل لنگ'])('shows vehicle and model after code in Bale search: %s', async (query) => {
    const { service, catalog } = fixture();
    const fitments = [
      { vehicle: { slug: 'dena', name: { fa: 'دنا', en: 'Dena' } }, model: null },
      { vehicle: { slug: 'peugeot', name: { fa: 'پژو', en: 'Peugeot' } }, model: { slug: '405', name: { fa: '405', en: null } } },
    ];
    const product = { name: { fa: 'میل لنگ' }, sku: '1800101506', slug: '1800101506', availability: 'IN_STOCK', price: { kind: 'inquiry' } };
    catalog.list.mockResolvedValue({ items: [
      { ...product, fitments }, { ...product, fitments: [] }, product,
    ] });
    const send = transport();
    await service.deliver(job(query, 'bale'));
    const text = JSON.parse(send.mock.calls[0]![1].body).text;
    expect(text).toContain('کد: 1800101506\nکاربرد در خودرو: دنا، پژو 405\nوضعیت: موجود');
    expect(text.match(/کاربرد در خودرو:/g)).toHaveLength(1);
    expect(text).toContain('/fa/parts/1800101506');
  });

  it.each(['/orders', '/track 123456', '/order@SourceByHedaxBot', 'پیگیری سفارش ۱۲۳'])('keeps order information behind website login: %s', async (command) => {
    const { service, catalog } = fixture(); const send = transport();
    await service.deliver(job(command));
    expect(catalog.list).not.toHaveBeenCalled();
    expect(JSON.parse(send.mock.calls[0]![1].body).text).toContain('/fa/account/orders');
  });

  it('supports start arguments, sourcing fallback and bounded messages with whole links', async () => {
    const { service, catalog } = fixture(); const send = transport();
    await service.deliver(job('/start from_website'));
    expect(catalog.list).not.toHaveBeenCalled();
    await service.deliver(job());
    expect(JSON.parse(send.mock.calls[1]![1].body).text).toContain('/fa/request-part');
    catalog.list.mockResolvedValue({ items: Array.from({ length: 5 }, () => ({ name: { fa: '🙂'.repeat(500) }, sku: 'x'.repeat(300), slug: 'ق'.repeat(150), availability: 'IN_STOCK', price: { kind: 'inquiry' } })) });
    await service.deliver(job());
    const text = JSON.parse(send.mock.calls[2]![1].body).text;
    expect(text.length).toBeLessThanOrEqual(3900);
    expect(text).toContain('/fa/account/orders');
    expect(text).toContain(encodeURIComponent('ق'.repeat(150)));
  });

  it.each([new Response('secret body', { status: 500 }), new Response('{"ok":false,"description":"secret body"}'), new Response('invalid JSON')])('retries delivery errors with sanitized diagnostics', async (response) => {
    const { service } = fixture(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(service.deliver(job('/start'))).rejects.toThrow(/^telegram message delivery failed$/);
  });
  it('sanitizes network failures and refuses sending after bot identity changes', async () => {
    const { service, env } = fixture(); const send = vi.fn().mockRejectedValue(new Error(`https://api.telegram.org/bot${token}`)); vi.stubGlobal('fetch', send);
    await expect(service.deliver(job('/start'))).rejects.toThrow(/^telegram message delivery failed$/);
    env.TELEGRAM_BOT_TOKEN = '67890:ANOTHER_FAKE_CREDENTIAL'; send.mockClear();
    await expect(service.deliver(job('/start'))).rejects.toThrow('identity changed');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('messenger environment guards', () => {
  const base = { DATABASE_URL: 'postgresql://test', SESSION_SECRET: 's'.repeat(48), OTP_PEPPER: 'o'.repeat(48), APP_ENCRYPTION_KEY: 'e'.repeat(44) };
  it('accepts disabled bots and complete independent pairs', () => {
    expect(() => loadEnv(base)).not.toThrow();
    expect(() => loadEnv({ ...base, TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret })).not.toThrow();
  });
  it.each([{ TELEGRAM_BOT_TOKEN: token }, { BALE_WEBHOOK_SECRET: secret }, { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: 'a/b'.repeat(20) }, { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret, BALE_BOT_TOKEN: token, BALE_WEBHOOK_SECRET: secret }])('rejects unsafe configuration without printing credentials', (env) => {
    try { loadEnv({ ...base, ...env }); throw new Error('accepted unsafe configuration'); }
    catch (error) { expect(String(error)).toContain('Invalid environment configuration'); expect(String(error)).not.toContain(token); expect(String(error)).not.toContain(secret); }
  });
});
