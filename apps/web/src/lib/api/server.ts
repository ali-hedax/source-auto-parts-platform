import 'server-only';
import { cookies, headers } from 'next/headers';
import { SESSION_COOKIE } from '@hedax/contracts/constants';
import { ApiRequestError } from './errors';
import { dataSource, apiInternalUrl } from '../config';
import { handleFixture } from '../fixtures/handler';
import { PUBLIC_CACHE_TAG } from '../public-cache';

/**
 * Server-side reads for Server Components. In "api" mode this calls the
 * backend with the visitor's cookies (so group prices apply); anonymous
 * public reads may be cached briefly, personalised ones never are.
 * In "fixtures" mode (development preview only) the same paths are served
 * from labelled sample data through the same handler the browser uses.
 */
export async function serverApi<T>(path: string, opts: { publicCache?: number } = {}): Promise<T> {
  const jar = await cookies();
  if (dataSource() === 'fixtures') {
    const res = await handleFixture('GET', path, null, Object.fromEntries(jar.getAll().map((c) => [c.name, c.value])));
    if (res.status >= 400) throw new ApiRequestError(res.status, res.body as never);
    return res.body as T;
  }
  const hasSession = jar.has(SESSION_COOKIE);
  const h = await headers();
  const res = await fetch(`${apiInternalUrl()}${path}`, {
    headers: {
      Accept: 'application/json',
      cookie: jar.toString(),
      'x-forwarded-for': h.get('x-forwarded-for') ?? '',
      'x-request-id': h.get('x-request-id') ?? '',
    },
    ...(opts.publicCache && !hasSession ? { next: { revalidate: opts.publicCache, tags: [PUBLIC_CACHE_TAG] } } : { cache: 'no-store' as const }),
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) throw new ApiRequestError(res.status, json as never);
  return json as T;
}

/** Same as serverApi but returns null for 401/404 instead of throwing. */
export async function serverApiOptional<T>(path: string, opts: { publicCache?: number } = {}): Promise<T | null> {
  try {
    return await serverApi<T>(path, opts);
  } catch (e) {
    if (e instanceof ApiRequestError && [401, 403, 404].includes(e.status)) return null;
    throw e;
  }
}
