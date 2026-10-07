import 'server-only';
import { unstable_cache } from 'next/cache';
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
  const h = await headers();
  const visitor = { 'x-forwarded-for': h.get('x-forwarded-for') ?? '', 'x-request-id': h.get('x-request-id') ?? '' };
  if (opts.publicCache && !jar.has(SESSION_COOKIE)) {
    // One shared copy per path for all anonymous visitors. Next's fetch cache keys on every
    // request header, so sending the visitor's cookies and IP gave each visitor a private copy:
    // it helped no one else and the cache grew with every new visitor. Anonymous public
    // responses depend only on the path (currency is in the query); the visitor's IP still
    // goes with a cache miss, for the per-IP search limit and the logs.
    return unstable_cache(() => getJson<T>(path, visitor), ['hedax-public-api', path], { revalidate: opts.publicCache, tags: [PUBLIC_CACHE_TAG] })();
  }
  return getJson<T>(path, { ...visitor, cookie: jar.toString() });
}

async function getJson<T>(path: string, extraHeaders: Record<string, string>): Promise<T> {
  const res = await fetch(`${apiInternalUrl()}${path}`, { headers: { Accept: 'application/json', ...extraHeaders }, cache: 'no-store' });
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
