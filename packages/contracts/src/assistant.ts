import { z } from 'zod';
import { DEFAULT_ASSISTANT_AI } from './assistant-prompt.js';
import { contentImageSchema } from './content.js';

// Plain text only. Settings cannot inject markup, styles, executable URLs or bidi overrides.
/** Long enough for a full persona prompt; the base identity rules live on the server, not here. */
export const ASSISTANT_SYSTEM_PROMPT_MAX = 8000;
/** Days a guide conversation is kept for review before the cleanup job deletes it. */
export const ASSISTANT_LOG_RETENTION_DAYS = 90;

const text = (max: number) => z.string().trim().min(1).max(max).refine((v) => !/[<>\u202a-\u202e\u2066-\u2069]/u.test(v) && [...v].every((c) => c.charCodeAt(0) >= 32 || c === '\n' || c === '\t'), 'Plain text only');
const bilingual = (max: number) => z.strictObject({ fa: text(max), en: text(max) });
const topicCopy = z.strictObject({ label: bilingual(80), answer: bilingual(500) });
const assistantAiSchema = z.strictObject({
  /** The owner's instructions for the guide (persona, tone, rules); added after the fixed base prompt. */
  systemPrompt: bilingual(ASSISTANT_SYSTEM_PROMPT_MAX),
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
  ai: assistantAiSchema.default(DEFAULT_ASSISTANT_AI),
});
export type AssistantSettings = z.infer<typeof assistantSettingsSchema>;
export type AssistantPublicSettings = Omit<AssistantSettings, 'ai'>;
export const assistantUpdateSchema = assistantSettingsSchema.extend({ version: z.number().int().min(0) });
export type AssistantSettingsView = AssistantSettings & { version: number };

export const assistantMessageSchema = z.strictObject({
  locale: z.enum(['fa', 'en']),
  message: text(500),
  history: z.array(z.strictObject({ role: z.enum(['user', 'assistant']), content: text(4000) })).max(8).default([]),
  /** Random id the browser generates for one chat session; groups the messages in the admin log. */
  conversationId: z.uuid().optional(),
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

// ---- Conversation log (admin) ----

export type AssistantLogStatus = 'ANSWERED' | 'FAILED';
export interface AssistantConversationSummary {
  id: string;
  locale: 'fa' | 'en';
  signedIn: boolean;
  messageCount: number;
  failedCount: number;
  startedAt: string;
  lastMessageAt: string;
  firstQuestion: string;
  lastAnswer: string | null;
}
export interface AssistantLogMessageView {
  id: string;
  question: string;
  answer: string | null;
  status: AssistantLogStatus;
  errorReason: string | null;
  productSkus: string[];
  provider: string | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number | null;
  createdAt: string;
}
export interface AssistantConversationList {
  items: AssistantConversationSummary[];
  total: number;
  page: number;
  pageSize: number;
  retentionDays: number;
  stats: { conversations7d: number; messages7d: number; failed7d: number };
}
export interface AssistantConversationDetail extends AssistantConversationSummary {
  messages: AssistantLogMessageView[];
}
export const assistantConversationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  q: z.string().trim().max(120).optional(),
  status: z.enum(['all', 'failed']).default('all'),
});

export * from './assistant-public.js';
export * from './assistant-prompt.js';
