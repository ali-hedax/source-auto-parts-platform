import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/config/env.js';
import { AssistantService } from '../../src/modules/assistant/assistant.service.js';
import type { CatalogService } from '../../src/modules/catalog/catalog.service.js';

const env = { ASSISTANT_AI_PROVIDER: 'mock', ASSISTANT_LIVE_CALLS_ENABLED: false, ASSISTANT_TEXT_MODEL: 'test-model', ASSISTANT_TIMEOUT_MS: 5000, ASSISTANT_MAX_OUTPUT_TOKENS: 200, ASSISTANT_DAILY_REQUEST_LIMIT: 5 } as Env;
const product = { slug: 'brake-pad', sku: 'SYN-1', name: { fa: 'لنت ترمز', en: 'Brake pad' }, partNumber: '58101-TEST', availability: 'IN_STOCK', unit: { name: 'دست', nameEn: 'set' }, price: { kind: 'price', payable: { amount: '1000', currency: 'IRR' }, display: { amount: '1000', currency: 'IRR' }, displayIsReference: false }, fitments: [], primaryImage: null };

describe('AssistantService isolated provider', () => {
  it('does not infer remote knowledge connectivity from the local product retrieval path', async () => {
    const list = vi.fn(); const fetchMock = vi.spyOn(globalThis, 'fetch');
    const service = new AssistantService(env, { list } as unknown as CatalogService, { assistant: vi.fn().mockResolvedValue({ enabled: true, ai: { maxOutputTokens: 200, dailyRequestLimit: 5 } }) } as never, {} as never);
    try {
      expect(await service.status()).toMatchObject({ knowledgeSource: 'catalog_products', referenceDocumentsSynced: false, referenceDocumentsConnected: null, externalKnowledgeStatus: 'UNVERIFIED', connectionVerified: false });
      expect(fetchMock).not.toHaveBeenCalled(); expect(list).not.toHaveBeenCalled();
    } finally { fetchMock.mockRestore(); }
  });
  it('uses CatalogService facts and never asks the mock model to invent product fields', async () => {
    const list = vi.fn().mockResolvedValue({ items: [product], total: 1, page: 1, pageSize: 4, query: 'لنت' });
    const service = new AssistantService(env, { list } as unknown as CatalogService, { assistant: vi.fn().mockResolvedValue({ enabled: true, ai: { systemPrompt: { fa: 'test', en: 'test' }, maxOutputTokens: 200, dailyRequestLimit: 5 } }) } as never, { estimate: vi.fn(), reserve: vi.fn(), actual: vi.fn(), settle: vi.fn() } as never);
    const result = await service.message({ locale: 'fa', message: 'لنت', history: [] }, null);
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ q: 'لنت', pageSize: 4 }), { approvedGroupId: null, display: 'IRR' });
    expect(result.provider).toBe('mock'); expect(result.products[0]).toMatchObject({ partNumber: '58101-TEST', availability: 'IN_STOCK' });
  });
  it('uses the Arvan Chat Completions contract and scoped apikey header', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'پاسخ واقعی' } }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const arvan = { ...env, ASSISTANT_AI_PROVIDER: 'arvan', ASSISTANT_LIVE_CALLS_ENABLED: true, ARVAN_AI_ENDPOINT: 'https://example.arvancloudai.ir/gateway/models/test/v1', ARVAN_AI_API_KEY: 'apikey-test-secret-value', ASSISTANT_TEXT_MODEL: 'gpt-5.6-luna', ASSISTANT_MAX_CONCURRENT: 3 } as Env;
    const budget = { estimate: vi.fn().mockReturnValue(100), reserve: vi.fn().mockResolvedValue({ budgetKey: 'test', concurrencyKey: 'active', reservedIrr: 100 }), actual: vi.fn().mockReturnValue(10), settle: vi.fn().mockResolvedValue(undefined) };
    const service = new AssistantService(arvan, { list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 4, query: '' }) } as unknown as CatalogService, { assistant: vi.fn().mockResolvedValue({ enabled: true, ai: { systemPrompt: { fa: 'test', en: 'test' }, maxOutputTokens: 200, dailyRequestLimit: 5 } }) } as never, budget as never);
    const result = await service.message({ locale: 'fa', message: 'سلام', history: [] }, null);
    expect(result).toMatchObject({ provider: 'arvan', model: 'gpt-5.6-luna', text: 'پاسخ واقعی' });
    expect(fetchMock).toHaveBeenCalledWith('https://example.arvancloudai.ir/gateway/models/test/v1/chat/completions', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'apikey apikey-test-secret-value' }) }));
    expect(budget.reserve).toHaveBeenCalledWith(100, 5, 'test'); expect(budget.settle).toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
