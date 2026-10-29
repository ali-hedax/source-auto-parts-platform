import { afterEach, describe, expect, it } from 'vitest';
import type { Env } from '../../src/config/env.js';
import { AssistantBudgetService } from '../../src/modules/assistant/assistant-budget.service.js';

let service: AssistantBudgetService | undefined;
afterEach(() => service?.onModuleDestroy());

describe('AssistantBudgetService', () => {
  it('reserves byte-level input and chat framing for Persian instead of an average token ratio', () => {
    service = new AssistantBudgetService({ APP_ENV: 'test', REDIS_URL: 'redis://127.0.0.1:1', ASSISTANT_INPUT_PRICE_IRR_PER_MILLION: 1_000_000, ASSISTANT_OUTPUT_PRICE_IRR_PER_MILLION: 1_000_000 } as Env);
    const input = JSON.stringify({ messages: [{ role: 'user', content: 'شماره فنی ۰۰۰۱۲۳؟' }] });
    expect(service.estimate(input, 400)).toBe(Buffer.byteLength(input, 'utf8') + 8192 + 400);
    expect(service.estimate(input, 400)).toBeGreaterThan(service.actual({ prompt_tokens: 4511, completion_tokens: 61 }, 0));
  });
  it('accounts for higher reported usage so an underestimate cannot silently bypass later caps', async () => {
    service = new AssistantBudgetService({ APP_ENV: 'test', REDIS_URL: 'redis://127.0.0.1:1', ASSISTANT_TEST_BUDGET_IRR: 50, ASSISTANT_DAILY_REQUEST_LIMIT: 100, ASSISTANT_MAX_CONCURRENT: 3 } as Env);
    const reservation = await service.reserve(20, 100, 'test');
    await service.settle(reservation, 45);
    await expect(service.reserve(6, 100, 'test')).rejects.toThrow('budget is exhausted');
  });
  it('gives the whole reservation back when it is settled at 0 (no response, nothing billed)', async () => {
    service = new AssistantBudgetService({ APP_ENV: 'test', REDIS_URL: 'redis://127.0.0.1:1', ASSISTANT_TEST_BUDGET_IRR: 50, ASSISTANT_DAILY_REQUEST_LIMIT: 100, ASSISTANT_MAX_CONCURRENT: 3 } as Env);
    await service.settle(await service.reserve(40, 100, 'test'), 0);
    await expect(service.reserve(40, 100, 'test')).resolves.toMatchObject({ reservedIrr: 40 });
  });
  it('keeps the whole reservation when the provider answered but its cost is unknown', async () => {
    service = new AssistantBudgetService({ APP_ENV: 'test', REDIS_URL: 'redis://127.0.0.1:1', ASSISTANT_TEST_BUDGET_IRR: 50, ASSISTANT_DAILY_REQUEST_LIMIT: 100, ASSISTANT_MAX_CONCURRENT: 3 } as Env);
    await service.settle(await service.reserve(40, 100, 'test'), undefined);
    await expect(service.reserve(40, 100, 'test')).rejects.toThrow('budget is exhausted');
  });
  it('reserves before use and hard-rejects a request that exceeds the approved cap', async () => {
    service = new AssistantBudgetService({ APP_ENV: 'test', REDIS_URL: 'redis://127.0.0.1:1', ASSISTANT_TEST_BUDGET_IRR: 50, ASSISTANT_DAILY_BUDGET_IRR: 300, ASSISTANT_DAILY_REQUEST_LIMIT: 100, ASSISTANT_MAX_CONCURRENT: 3, ASSISTANT_INPUT_PRICE_IRR_PER_MILLION: 624000, ASSISTANT_OUTPUT_PRICE_IRR_PER_MILLION: 3744000 } as Env);
    await expect(service.reserve(40, 100, 'test')).resolves.toMatchObject({ reservedIrr: 40 });
    await expect(service.reserve(11, 100, 'test')).rejects.toThrow('budget is exhausted');
  });
  it('uses actual provider token usage to calculate settlement cost', () => {
    service = new AssistantBudgetService({ APP_ENV: 'test', REDIS_URL: 'redis://127.0.0.1:1', ASSISTANT_TEST_BUDGET_IRR: 50000, ASSISTANT_DAILY_BUDGET_IRR: 300000, ASSISTANT_DAILY_REQUEST_LIMIT: 100, ASSISTANT_MAX_CONCURRENT: 3, ASSISTANT_INPUT_PRICE_IRR_PER_MILLION: 624000, ASSISTANT_OUTPUT_PRICE_IRR_PER_MILLION: 3744000 } as Env);
    expect(service.actual({ prompt_tokens: 1000, completion_tokens: 100 }, 9999)).toBe(999);
    expect(service.actual(undefined, 9999)).toBe(9999);
  });
  it('enforces the daily request and concurrent limits before provider use', async () => {
    service = new AssistantBudgetService({ APP_ENV: 'test', REDIS_URL: 'redis://127.0.0.1:1', ASSISTANT_TEST_BUDGET_IRR: 50000, ASSISTANT_DAILY_BUDGET_IRR: 300000, ASSISTANT_DAILY_REQUEST_LIMIT: 100, ASSISTANT_MAX_CONCURRENT: 1, ASSISTANT_INPUT_PRICE_IRR_PER_MILLION: 624000, ASSISTANT_OUTPUT_PRICE_IRR_PER_MILLION: 3744000 } as Env);
    const first = await service.reserve(10, 100, 'test');
    await expect(service.reserve(10, 100, 'test')).rejects.toThrow('Assistant is busy');
    await service.settle(first, 10);
    const second = await service.reserve(10, 2, 'test');
    await service.settle(second, 10);
    await expect(service.reserve(10, 2, 'test')).rejects.toThrow('daily request limit');
  });
});
