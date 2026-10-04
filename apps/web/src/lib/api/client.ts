'use client';

import { CSRF_COOKIE, CSRF_HEADER, IDEMPOTENCY_HEADER } from '@hedax/contracts/constants';
import { ApiRequestError } from './errors';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

let csrfRefresh: Promise<void> | null = null;

async function refreshCsrf(): Promise<void> {
  csrfRefresh ??= fetch('/api/v1/auth/csrf', { credentials: 'same-origin', cache: 'no-store' })
    .then(() => undefined)
    .finally(() => {
      csrfRefresh = null;
    });
  return csrfRefresh;
}

/** Random key for retry-safe mutations (checkout, payments, refunds, imports). */
export function newIdempotencyKey(): string {
  return crypto.randomUUID().replace(/-/g, '') + Date.now().toString(36);
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/**
 * Browser → same-origin /api/v1 (never the database). State-changing calls
 * send the double-submit CSRF token; a stale token is refreshed once.
 */
export async function api<T>(path: string, options: ApiOptions = {}, retried = false): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    if (!readCookie(CSRF_COOKIE)) await refreshCsrf();
    const token = readCookie(CSRF_COOKIE);
    if (token) headers[CSRF_HEADER] = token;
  }
  if (options.idempotencyKey) headers[IDEMPOTENCY_HEADER] = options.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: options.signal ?? null,
      body: options.body === undefined ? null : isForm ? (options.body as FormData) : JSON.stringify(options.body),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiRequestError(0, null);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = new ApiRequestError(res.status, json as never);
    if (err.code === 'CSRF_TOKEN' && !retried) {
      await refreshCsrf();
      return api<T>(path, options, true);
    }
    throw err;
  }
  return json as T;
}

/** Upload with progress (fetch has no upload progress events). */
export function uploadWithProgress<T>(path: string, form: FormData, onProgress: (ratio: number) => void): { promise: Promise<T>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = (async () => {
    if (!readCookie(CSRF_COOKIE)) await refreshCsrf();
    return new Promise<T>((resolve, reject) => {
      xhr.open('POST', `/api/v1${path}`);
      xhr.withCredentials = true;
      const token = readCookie(CSRF_COOKIE);
      if (token) xhr.setRequestHeader(CSRF_HEADER, token);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        const body = xhr.responseText ? (JSON.parse(xhr.responseText) as unknown) : null;
        if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
        else reject(new ApiRequestError(xhr.status, body as never));
      };
      xhr.onerror = () => reject(new ApiRequestError(0, null));
      xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
      xhr.send(form);
    });
  })();
  return { promise, abort: () => xhr.abort() };
}
