import { z } from 'zod';
import { contentImageSchema } from './content.js';

// Plain text only. Settings cannot inject markup, styles, executable URLs or bidi overrides.
const text = (max: number) => z.string().trim().min(1).max(max).refine((v) => !/[<>\u202a-\u202e\u2066-\u2069]/u.test(v) && [...v].every((c) => c.charCodeAt(0) >= 32 || c === '\n' || c === '\t'), 'Plain text only');
const bilingual = (max: number) => z.strictObject({ fa: text(max), en: text(max) });
const topicCopy = z.strictObject({ label: bilingual(80), answer: bilingual(500) });
const assistantAiSchema = z.strictObject({
  systemPrompt: bilingual(2000),
  maxOutputTokens: z.number().int().min(64).max(1000),
  dailyRequestLimit: z.number().int().min(1).max(10000),
});
export const assistantSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  name: bilingual(60),
  introduction: bilingual(240),
  greeting: bilingual(300),
  animationEnabled: z.boolean(),
  mobileSize: z.number().int().min(48).max(80),
  desktopSize: z.number().int().min(72).max(128),
  placement: z.enum(['start', 'end']),
  /** The launcher's round avatar (media library image); empty = the built-in guide character. */
  avatarUrl: contentImageSchema.default(''),
  topics: z.strictObject({ search: topicCopy, stock: topicCopy, order: topicCopy, support: topicCopy }),
  ai: assistantAiSchema.default({ systemPrompt: { fa: 'کوتاه، دقیق و فقط بر پایه اطلاعات ثبت‌شده پاسخ بده.', en: 'Answer concisely and only from registered facts.' }, maxOutputTokens: 400, dailyRequestLimit: 100 }),
});
export type AssistantSettings = z.infer<typeof assistantSettingsSchema>;
export type AssistantPublicSettings = Omit<AssistantSettings, 'ai'>;
export const assistantUpdateSchema = assistantSettingsSchema.extend({ version: z.number().int().min(0) });
export type AssistantSettingsView = AssistantSettings & { version: number };

export const assistantMessageSchema = z.strictObject({
  locale: z.enum(['fa', 'en']),
  message: text(500),
  history: z.array(z.strictObject({ role: z.enum(['user', 'assistant']), content: text(1000) })).max(8).default([]),
});
export type AssistantMessageInput = z.infer<typeof assistantMessageSchema>;

export interface AssistantProductCard {
  slug: string;
  sku: string;
  name: { fa: string; en: string | null };
  partNumber: string | null;
  availability: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  unit: { name: string; nameEn: string | null };
  price: import('./catalog.js').PriceView;
  fitments: import('./vehicles.js').FitmentView[];
  primaryImage: import('./catalog.js').MediaView | null;
}
export interface AssistantMessageResult {
  text: string;
  products: AssistantProductCard[];
  provider: 'mock' | 'arvan';
  model: string;
}

export * from './assistant-public.js';
