import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AssistantMessageInput, AssistantMessageResult, ProductCard } from '@hedax/contracts';
import { ENV, type Env } from '../../config/env.js';
import type { Actor } from '../../common/request-context.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { AssistantBudgetService } from './assistant-budget.service.js';

const SYSTEM_PROMPT = `You are the Source by HEDAX automotive-parts assistant. Be concise and answer in the user's language. Ask one clear follow-up question when the request is ambiguous. Catalog facts supplied below are authoritative. Never invent price, inventory, fitment, order, VIN, or personal information. If data is absent, say it is not verified. Never claim access to an account or order. When the service cannot answer, direct the user to /contact.`;

@Injectable()
export class AssistantService {
  constructor(@Inject(ENV) private readonly env: Env, private readonly catalog: CatalogService, private readonly settings: SettingsService, private readonly budget: AssistantBudgetService) {}

  async status() {
    const settings = await this.settings.assistant();
    const configured = this.env.ASSISTANT_AI_PROVIDER === 'mock' || (this.env.ASSISTANT_AI_PROVIDER === 'arvan' && Boolean(this.env.ARVAN_AI_ENDPOINT && this.env.ARVAN_AI_API_KEY));
    return { provider: this.env.ASSISTANT_AI_PROVIDER, model: this.env.ASSISTANT_TEXT_MODEL, configured, liveCallsEnabled: this.env.ASSISTANT_LIVE_CALLS_ENABLED, assistantEnabled: settings.enabled, timeoutMs: this.env.ASSISTANT_TIMEOUT_MS, maxOutputTokens: settings.ai.maxOutputTokens, dailyRequestLimit: settings.ai.dailyRequestLimit };
  }

  async message(input: AssistantMessageInput, actor: Actor | null): Promise<AssistantMessageResult> {
    this.assertAvailable();
    const settings = await this.settings.assistant();
    if (!settings.enabled) throw new ServiceUnavailableException('Assistant is disabled');
    const result = await this.catalog.list({ q: input.message, sort: 'relevance', page: 1, pageSize: 4 }, { approvedGroupId: actor?.approvedCustomerGroupId ?? null, display: 'IRR' });
    const products = result.items.map((p) => this.product(p));
    if (this.env.ASSISTANT_AI_PROVIDER === 'mock') return { text: this.mockText(input, products), products, provider: 'mock', model: 'synthetic-test-provider' };
    const catalogFacts = products.length ? JSON.stringify(products.map((p) => ({ sku: p.sku, name: p.name, partNumber: p.partNumber, availability: p.availability, unit: p.unit, price: p.price, fitments: p.fitments }))) : 'NO_CATALOG_MATCH';
    const body = { model: this.env.ASSISTANT_TEXT_MODEL, max_tokens: settings.ai.maxOutputTokens, temperature: 0.3, messages: [{ role: 'system', content: `${SYSTEM_PROMPT}\n${settings.ai.systemPrompt[input.locale]}` }, ...input.history, { role: 'user', content: `${input.message}\n\nCATALOG_FACTS:${catalogFacts}` }] };
    const estimate = this.budget.estimate(JSON.stringify(body), settings.ai.maxOutputTokens);
    const reservation = await this.budget.reserve(estimate, settings.ai.dailyRequestLimit, this.env.APP_ENV === 'production' ? 'public' : 'test');
    let response: Record<string, unknown> | undefined;
    try {
      response = await this.arvan(body);
    } finally {
      await this.budget.settle(reservation, response ? this.budget.actual(response.usage, estimate) : undefined);
    }
    const choices = Array.isArray(response.choices) ? response.choices as Array<{ message?: { content?: unknown } }> : [];
    const text = typeof choices[0]?.message?.content === 'string' ? choices[0].message.content.trim() : '';
    if (!text) throw new ServiceUnavailableException('Assistant provider returned no text');
    return { text, products, provider: 'arvan', model: this.env.ASSISTANT_TEXT_MODEL };
  }

  private assertAvailable() { if (this.env.ASSISTANT_AI_PROVIDER === 'disabled') throw new ServiceUnavailableException('Assistant provider is disabled'); }
  private async arvan(body: object): Promise<Record<string, unknown>> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.env.ASSISTANT_TIMEOUT_MS);
    try { const base = this.env.ARVAN_AI_ENDPOINT!.replace(/\/$/, ''); const res = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { Authorization: `apikey ${this.env.ARVAN_AI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal }); if (!res.ok) throw new Error(`status ${res.status}`); return await res.json() as Record<string, unknown>; }
    catch { throw new ServiceUnavailableException('Assistant provider unavailable'); } finally { clearTimeout(timer); }
  }
  private product(p: ProductCard) { return { slug: p.slug, sku: p.sku, name: p.name, partNumber: p.partNumber, availability: p.availability, unit: { name: p.unit.name, nameEn: p.unit.nameEn }, price: p.price, fitments: p.fitments, primaryImage: p.primaryImage }; }
  private mockText(input: AssistantMessageInput, products: ReturnType<AssistantService['product']>[]) { if (products.length) return input.locale === 'fa' ? `${products.length} نتیجه از کاتالوگ آزمایشی پیدا شد. جزئیات فقط از دادهٔ ثبت‌شده در کارت‌هاست.` : `${products.length} result(s) were found in the synthetic catalog. Details come only from the product cards.`; return input.locale === 'fa' ? `در provider آزمایشی پرسش «${input.message}» دریافت شد، اما نتیجهٔ کاتالوگ ثبت‌شده‌ای پیدا نشد.` : `The test provider received “${input.message}”, but no registered catalog result was found.`; }
}
