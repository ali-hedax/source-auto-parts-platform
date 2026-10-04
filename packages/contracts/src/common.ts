import { z } from 'zod';

export const LOCALES = ['fa', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fa';

export const currencySchema = z.enum(['IRR', 'AED']);
export type Currency = z.infer<typeof currencySchema>;

/** Integer minor-unit amount carried as a string (rial for IRR, fils for AED). */
export const amountMinorSchema = z.string().regex(/^\d{1,20}$/, 'amountMinor must be a non-negative integer string');

export const moneySchema = z.object({
  currency: currencySchema,
  amountMinor: amountMinorSchema,
});
export type MoneyDto = z.infer<typeof moneySchema>;

export const idSchema = z.uuid();
export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
export const skuSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._\-/]{0,63}$/);

/** Idempotency key header value used on every retry-sensitive mutation. */
export const idempotencyKeySchema = z.string().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/);

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const cursorQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

/** Uniform error contract returned by every endpoint. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId: string;
    fields?: Array<{ path: string; code: string; message: string }>;
    details?: Record<string, unknown>;
  };
}

/** Translatable text: Persian is required, English optional with an explicit fallback flag in responses. */
export interface LocalizedText {
  fa: string;
  en: string | null;
}

export const mobileInputSchema = z.string().min(9).max(20);
export const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v === '' ? undefined : v));
