import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { bootApp, services, type TestApp, type Services } from './helpers.js';

process.env.TELEGRAM_BOT_TOKEN = '12345:INTEGRATION_TEST_ONLY_FAKE_TOKEN';
process.env.TELEGRAM_WEBHOOK_SECRET = 't'.repeat(48);
process.env.BALE_BOT_TOKEN = '67890:INTEGRATION_TEST_ONLY_FAKE_TOKEN';
process.env.BALE_WEBHOOK_SECRET = 'b'.repeat(48);
process.env.QUEUE_DRIVER = 'inline';
let t: TestApp;
let s: Services;
let worker: Awaited<ReturnType<typeof import('../../dist/worker/index.js').createWorkerContext>> | undefined;
const realFetch = globalThis.fetch;
const payload = (id: number, text = '/orders') => ({ update_id: id, message: { text, from: { id: 123, is_bot: false }, chat: { id: 123, type: 'private' } } });
const post = (path: string, body: unknown, secret?: string) => realFetch(`${t.base}/integrations/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {}) }, body: JSON.stringify(body),
});
beforeAll(async () => { t = await bootApp(); s = await services(t); });
afterAll(async () => { vi.unstubAllGlobals(); await worker?.app.close(); await t?.close(); });

describe('real HTTP and PostgreSQL messenger boundary', () => {
  it('rejects spoofed webhooks without sessions/CSRF bypass enabling order access', async () => {
    expect((await post('telegram/webhook', payload(1))).status).toBe(401);
    expect((await post('telegram/webhook', payload(1), 'wrong')).status).toBe(401);
    expect((await post(`bale/webhook/${'x'.repeat(48)}`, payload(1))).status).toBe(401);
    expect((await realFetch(`${t.base}/orders`)).status).toBe(401);
    expect(await s.prisma.outboxEvent.count({ where: { type: 'messenger.reply' } })).toBe(0);
  });

  it('concurrently receives duplicates once, separates providers and never sends before acknowledgment', async () => {
    const send = vi.fn(); vi.stubGlobal('fetch', send);
    const responses = await Promise.all(Array.from({ length: 6 }, () => post('telegram/webhook', payload(2), process.env.TELEGRAM_WEBHOOK_SECRET)));
    for (const res of responses) { expect(res.status).toBe(200); expect(res.headers.get('cache-control')).toBe('no-store'); }
    expect(send).not.toHaveBeenCalled();
    expect(await s.prisma.outboxEvent.count({ where: { type: 'messenger.reply' } })).toBe(1);
    expect((await post(`bale/webhook/${process.env.BALE_WEBHOOK_SECRET}`, payload(2))).status).toBe(200);
    expect(await s.prisma.outboxEvent.count({ where: { type: 'messenger.reply' } })).toBe(2);
    expect((await post('telegram/webhook', { update_id: 3, channel_post: { text: 'ignored' } }, process.env.TELEGRAM_WEBHOOK_SECRET)).status).toBe(200);
    expect(await s.prisma.outboxEvent.count({ where: { type: 'messenger.reply' } })).toBe(2);
    vi.unstubAllGlobals();
  });

  it('worker retries provider rejection, marks successful sends done, and ignores later replay', async () => {
    await s.prisma.outboxEvent.updateMany({ where: { type: { not: 'messenger.reply' }, status: 'PENDING' }, data: { availableAt: new Date(Date.now() + 86400000) } });
    let failing = true;
    const send = vi.fn().mockImplementation(async () => new Response(JSON.stringify(failing ? { ok: false, description: 'DO_NOT_STORE_PROVIDER_BODY' } : { ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', send);
    const { createWorkerContext } = await import('../../dist/worker/index.js');
    worker = await createWorkerContext(); await worker.dispatcher.start();
    await expect.poll(() => s.prisma.outboxEvent.count({ where: { type: 'messenger.reply', attempts: 1, status: 'PENDING' } }), { timeout: 15000 }).toBe(2);
    const rows = await s.prisma.outboxEvent.findMany({ where: { type: 'messenger.reply' } });
    expect(JSON.stringify(rows)).not.toContain('DO_NOT_STORE_PROVIDER_BODY');
    failing = false;
    await s.prisma.outboxEvent.updateMany({ where: { type: 'messenger.reply' }, data: { availableAt: new Date(0) } });
    await expect.poll(() => s.prisma.outboxEvent.count({ where: { type: 'messenger.reply', status: 'DONE' } }), { timeout: 15000 }).toBe(2);
    expect(send).toHaveBeenCalledTimes(4);
    expect((await post('telegram/webhook', payload(2), process.env.TELEGRAM_WEBHOOK_SECRET)).status).toBe(200);
    expect(await s.prisma.outboxEvent.count({ where: { type: 'messenger.reply' } })).toBe(2);
    expect(send).toHaveBeenCalledTimes(4);
  });
});
