import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/config/env.js';
import { AssistantService, claimsOtherIdentity, cleanHistory, contactNumbers, restoreMaskedNumbers } from '../../src/modules/assistant/assistant.service.js';
import type { CatalogService } from '../../src/modules/catalog/catalog.service.js';

const env = { ASSISTANT_AI_PROVIDER: 'mock', ASSISTANT_LIVE_CALLS_ENABLED: false, ASSISTANT_TEXT_MODEL: 'test-model', ASSISTANT_TIMEOUT_MS: 5000, ASSISTANT_MAX_OUTPUT_TOKENS: 200, ASSISTANT_DAILY_REQUEST_LIMIT: 5 } as Env;
const bundle = {
  brand: { siteName: { fa: 'سورس', en: 'Source' }, footerAbout: { fa: 'فروش قطعه', en: 'Parts' } },
  contact: { displayName: 'Source', phones: [{ label: { fa: 'فروش', en: 'Sales' }, number: '+98 25 1234 5678', numberFa: '', extension: '', whatsapp: true }], email: 'info@example.test', address: { fa: 'قم', en: 'Qom' }, hours: { fa: 'شنبه تا پنجشنبه', en: 'Sat-Thu' }, mapUrl: '' },
  social: { links: [{ network: 'instagram', url: 'https://instagram.com/example' }] },
  faq: [],
};
const content = () => ({ publicBundle: vi.fn().mockResolvedValue(bundle) });
const log = () => ({ record: vi.fn().mockResolvedValue(undefined) });
const product = { slug: 'brake-pad', sku: 'SYN-1', name: { fa: 'لنت ترمز', en: 'Brake pad' }, partNumber: '58101-TEST', availability: 'IN_STOCK', unit: { name: 'دست', nameEn: 'set' }, price: { kind: 'price', payable: { amount: '1000', currency: 'IRR' }, display: { amount: '1000', currency: 'IRR' }, displayIsReference: false }, fitments: [], primaryImage: null };

describe('AssistantService isolated provider', () => {
  it('does not infer remote knowledge connectivity from the local product retrieval path', async () => {
    const list = vi.fn(); const fetchMock = vi.spyOn(globalThis, 'fetch');
    const service = new AssistantService(env, { list } as unknown as CatalogService, { assistant: vi.fn().mockResolvedValue({ enabled: true, ai: { maxOutputTokens: 200, dailyRequestLimit: 5 } }) } as never, {} as never, content() as never, log() as never);
    try {
      expect(await service.status()).toMatchObject({ knowledgeSource: 'catalog_products', referenceDocumentsSynced: false, referenceDocumentsConnected: null, externalKnowledgeStatus: 'UNVERIFIED', connectionVerified: false });
      expect(fetchMock).not.toHaveBeenCalled(); expect(list).not.toHaveBeenCalled();
    } finally { fetchMock.mockRestore(); }
  });
  it('uses CatalogService facts and never asks the mock model to invent product fields', async () => {
    const list = vi.fn().mockResolvedValue({ items: [product], total: 1, page: 1, pageSize: 4, query: 'لنت' });
    const service = new AssistantService(env, { list } as unknown as CatalogService, { assistant: vi.fn().mockResolvedValue({ enabled: true, name: { fa: 'هکسی', en: 'Hexi' }, ai: { systemPrompt: { fa: 'test', en: 'test' }, maxOutputTokens: 200, dailyRequestLimit: 5 } }) } as never, { estimate: vi.fn(), reserve: vi.fn(), actual: vi.fn(), settle: vi.fn() } as never, content() as never, log() as never);
    const result = await service.message({ locale: 'fa', message: 'لنت', history: [] }, null);
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ q: 'لنت', pageSize: 4 }), { approvedGroupId: null, display: 'IRR' });
    expect(result.provider).toBe('mock'); expect(result.products[0]).toMatchObject({ partNumber: '58101-TEST', availability: 'IN_STOCK' });
  });
  it('uses the Arvan Chat Completions contract and scoped apikey header', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'پاسخ واقعی' } }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const arvan = { ...env, ASSISTANT_AI_PROVIDER: 'arvan', ASSISTANT_LIVE_CALLS_ENABLED: true, ARVAN_AI_ENDPOINT: 'https://example.arvancloudai.ir/gateway/models/test/v1', ARVAN_AI_API_KEY: 'apikey-test-secret-value', ASSISTANT_TEXT_MODEL: 'gpt-5.6-luna', ASSISTANT_MAX_CONCURRENT: 3 } as Env;
    const budget = { estimate: vi.fn().mockReturnValue(100), reserve: vi.fn().mockResolvedValue({ budgetKey: 'test', concurrencyKey: 'active', reservedIrr: 100 }), actual: vi.fn().mockReturnValue(10), settle: vi.fn().mockResolvedValue(undefined) };
    const service = new AssistantService(arvan, { list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 4, query: '' }) } as unknown as CatalogService, { assistant: vi.fn().mockResolvedValue({ enabled: true, name: { fa: 'هکسی', en: 'Hexi' }, ai: { systemPrompt: { fa: 'test', en: 'test' }, maxOutputTokens: 200, dailyRequestLimit: 5 } }) } as never, budget as never, content() as never, log() as never);
    const result = await service.message({ locale: 'fa', message: 'سلام', history: [] }, null);
    expect(result).toMatchObject({ provider: 'arvan', model: 'gpt-5.6-luna', text: 'پاسخ واقعی' });
    expect(fetchMock).toHaveBeenCalledWith('https://example.arvancloudai.ir/gateway/models/test/v1/chat/completions', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'apikey apikey-test-secret-value' }) }));
    expect(budget.reserve).toHaveBeenCalledWith(100, 5, 'test'); expect(budget.settle).toHaveBeenCalled();
    fetchMock.mockRestore();
  });
  it('sends Hexi\'s fixed identity rules, the owner prompt and the footer contact facts, and logs the answer', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'سلام! من هکسی‌ام' } }], usage: { prompt_tokens: 900, completion_tokens: 40 } }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const arvan = { ...env, ASSISTANT_AI_PROVIDER: 'arvan', ASSISTANT_LIVE_CALLS_ENABLED: true, ARVAN_AI_ENDPOINT: 'https://example.test/v1', ARVAN_AI_API_KEY: 'k', ASSISTANT_TEXT_MODEL: 'm', ASSISTANT_MAX_CONCURRENT: 3 } as Env;
    const budget = { estimate: vi.fn().mockReturnValue(100), reserve: vi.fn().mockResolvedValue({ budgetKey: 'b', concurrencyKey: 'c', reservedIrr: 100 }), actual: vi.fn().mockReturnValue(10), settle: vi.fn().mockResolvedValue(undefined) };
    const recorder = log();
    const service = new AssistantService(arvan, { list: vi.fn().mockResolvedValue({ items: [product], total: 1, page: 1, pageSize: 4, query: '' }) } as unknown as CatalogService, { assistant: vi.fn().mockResolvedValue({ enabled: true, name: { fa: 'هکسی', en: 'Hexi' }, ai: { systemPrompt: { fa: 'OWNER-PERSONA', en: 'owner' }, maxOutputTokens: 200, dailyRequestLimit: 5 } }) } as never, budget as never, content() as never, recorder as never);
    try {
      const conversationId = '0195f1e2-3c4d-7e8f-9a0b-1c2d3e4f5a6b';
      await service.message({ locale: 'fa', message: 'شماره تماس؟', history: [], conversationId }, null);
      const sent = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as { messages: Array<{ role: string; content: string }> };
      const system = sent.messages[0]!.content;
      expect(system).toContain('Never say you are ChatGPT');
      // The full instructions travel in the latest user turn, because some gateway setups drop system messages.
      const user = sent.messages.at(-1)!.content;
      expect(user).toContain('You are Hexi (Persian name: هکسی)');
      expect(user).toContain('never say you are ChatGPT');
      expect(user.indexOf('never say you are ChatGPT')).toBeLessThan(user.indexOf('OWNER-PERSONA'));
      expect(user).toContain('+98 25 1234 5678');
      expect(user).toContain('https://instagram.com/example');
      expect(user).toContain('SYN-1');
      expect(user.trimEnd().endsWith('شماره تماس؟')).toBe(true);
      expect(recorder.record).toHaveBeenCalledWith(expect.objectContaining({ clientKey: conversationId, question: 'شماره تماس؟', answer: 'سلام! من هکسی‌ام', status: 'ANSWERED', productSkus: ['SYN-1'], usage: { prompt_tokens: 900, completion_tokens: 40 } }));
    } finally { fetchMock.mockRestore(); }
  });
  it('logs a failed answer and still reports the failure to the visitor', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('down', { status: 503 }));
    const arvan = { ...env, ASSISTANT_AI_PROVIDER: 'arvan', ASSISTANT_LIVE_CALLS_ENABLED: true, ARVAN_AI_ENDPOINT: 'https://example.test/v1', ARVAN_AI_API_KEY: 'k', ASSISTANT_TEXT_MODEL: 'm', ASSISTANT_MAX_CONCURRENT: 3 } as Env;
    const budget = { estimate: vi.fn().mockReturnValue(100), reserve: vi.fn().mockResolvedValue({ budgetKey: 'b', concurrencyKey: 'c', reservedIrr: 100 }), actual: vi.fn(), settle: vi.fn().mockResolvedValue(undefined) };
    const recorder = log();
    const service = new AssistantService(arvan, { list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 4, query: '' }) } as unknown as CatalogService, { assistant: vi.fn().mockResolvedValue({ enabled: true, name: { fa: 'هکسی', en: 'Hexi' }, ai: { systemPrompt: { fa: 'p', en: 'p' }, maxOutputTokens: 200, dailyRequestLimit: 5 } }) } as never, budget as never, content() as never, recorder as never);
    try {
      await expect(service.message({ locale: 'fa', message: 'سلام', history: [] }, null)).rejects.toThrow('Assistant provider unavailable');
      expect(recorder.record).toHaveBeenCalledWith(expect.objectContaining({ question: 'سلام', answer: null, status: 'FAILED', errorReason: 'Assistant provider unavailable' }));
    } finally { fetchMock.mockRestore(); }
  });
  it('replaces a reply in which the model claims to be ChatGPT with Hexi\'s introduction', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'بله، من ChatGPT هستم؛ یک دستیار هوش مصنوعی از OpenAI.' } }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const arvan = { ...env, ASSISTANT_AI_PROVIDER: 'arvan', ASSISTANT_LIVE_CALLS_ENABLED: true, ARVAN_AI_ENDPOINT: 'https://example.test/v1', ARVAN_AI_API_KEY: 'k', ASSISTANT_TEXT_MODEL: 'm', ASSISTANT_MAX_CONCURRENT: 3 } as Env;
    const budget = { estimate: vi.fn().mockReturnValue(100), reserve: vi.fn().mockResolvedValue({ budgetKey: 'b', concurrencyKey: 'c', reservedIrr: 100 }), actual: vi.fn().mockReturnValue(10), settle: vi.fn().mockResolvedValue(undefined) };
    const service = new AssistantService(arvan, { list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 4, query: '' }) } as unknown as CatalogService, { assistant: vi.fn().mockResolvedValue({ enabled: true, name: { fa: 'هکسی', en: 'Hexi' }, ai: { systemPrompt: { fa: 'p', en: 'p' }, maxOutputTokens: 200, dailyRequestLimit: 5 } }) } as never, budget as never, content() as never, log() as never);
    try {
      const result = await service.message({ locale: 'fa', message: 'شما ChatGPT هستید؟', history: [] }, null);
      expect(result.text).toContain('من هکسی هستم');
      expect(result.text).not.toContain('ChatGPT');
    } finally { fetchMock.mockRestore(); }
  });
  it('detects identity claims but not denials, and drops such turns from history', () => {
    for (const t of ['بله، من ChatGPT هستم.', 'من ChatGPT هستم.', "I'm ChatGPT, an AI assistant.", 'I am a GPT model.', 'من توسط OpenAI ساخته شده‌ام.']) expect(claimsOtherIdentity(t)).toBe(true);
    for (const t of ['من هکسی‌ام، ChatGPT نیستم!', "I'm Hexi, not ChatGPT.", 'لنت جلو پژو ۲۰۶ موجود است.', 'برای سازگاری شماره فنی را چک کنید.']) expect(claimsOtherIdentity(t)).toBe(false);
    expect(cleanHistory([
      { role: 'user', content: 'اسمت چیه؟' }, { role: 'assistant', content: 'من ChatGPT هستم.' },
      { role: 'user', content: 'لنت دارید؟' }, { role: 'assistant', content: 'بله، لنت جلو موجود است.' },
    ])).toEqual([{ role: 'user', content: 'لنت دارید؟' }, { role: 'assistant', content: 'بله، لنت جلو موجود است.' }]);
  });
  it('puts the footer phone numbers back where the gateway masked them', () => {
    const numbers = contactNumbers([{ number: '+98 25 3666 8006', numberFa: '' }, { number: '+971 50 144 1797', numberFa: '' }], 'fa');
    expect(numbers).toEqual(['02536668006', '971501441797']);
    const out = restoreMaskedNumbers('شماره تلفن فروشگاه: *********** داخلی ۱۱۹\n\nواتس‌اپ: ************', numbers, 'fa');
    expect(out).toContain('02536668006');
    expect(out).toContain('971501441797');
    expect(out).not.toMatch(/\*{5,}/);
    expect(restoreMaskedNumbers('لنت موجود است.', numbers, 'fa')).toBe('لنت موجود است.');
    expect(restoreMaskedNumbers('تلفن: *******', [], 'fa')).toContain('پایین صفحهٔ سایت');
    expect(contactNumbers([{ number: '+98 25 3666 8006', numberFa: '۰۲۵-۳۶۶۶۸۰۰۶' }], 'fa')).toEqual(['۰۲۵-۳۶۶۶۸۰۰۶']);
  });
});
