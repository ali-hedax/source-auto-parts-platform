import type { ApiError } from '@hedax/contracts';

/** Error thrown by the API clients; carries the uniform error contract. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly fields: NonNullable<ApiError['error']['fields']>;
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, body: Partial<ApiError> | null) {
    super(body?.error?.message ?? `HTTP ${status}`);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = body?.error?.code ?? (status === 0 ? 'NETWORK_ERROR' : `HTTP_${status}`);
    this.requestId = body?.error?.requestId ?? null;
    this.fields = body?.error?.fields ?? [];
    this.details = body?.error?.details;
  }
}

export function isApiError(e: unknown): e is ApiRequestError {
  return e instanceof ApiRequestError;
}

/** The part of a next-intl translator (`useTranslations()` / `getTranslations()`) that errorText needs. */
export interface ErrorTranslator {
  (key: never): string;
  has(key: never): boolean;
}

/**
 * Text for people for any failure (spec §15): the translated message of a known
 * error code, otherwise the generic message with the code so support can trace it.
 * The API's English developer message is never shown.
 */
export function errorText(t: ErrorTranslator, e: unknown): string {
  if (isApiError(e) && t.has(`errors.${e.code}` as never)) return t(`errors.${e.code}` as never);
  const generic = t('errors.default' as never);
  return isApiError(e) ? `${generic} (${e.code})` : generic;
}
