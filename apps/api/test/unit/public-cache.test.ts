import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/config/env.js';
import { arvanPurgeUrl, PublicCacheService } from '../../src/common/public-cache.service.js';

const SECRET = 's'.repeat(40);

function service(env: Partial<Env>) {
  return new PublicCacheService(env as Env);
}

describe('public cache purge (web app, then CDN)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('purges the web app only when no CDN is configured', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await service({ WEB_INTERNAL_URL: 'http://web:3000', REVALIDATE_SECRET: SECRET }).purge();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]![0])).toBe('http://web:3000/api/internal/revalidate');
  });

  it('purges the web app first, then every CDN copy, with the Apikey header', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await service({ WEB_INTERNAL_URL: 'http://web:3000', REVALIDATE_SECRET: SECRET, ARVAN_CDN_API_KEY: 'k'.repeat(30), ARVAN_CDN_DOMAIN: 'sourcebyhedax.ir' }).purge();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[0]![0])).toContain('/api/internal/revalidate');
    expect(fetch.mock.calls[1]![0]).toBe(arvanPurgeUrl('sourcebyhedax.ir'));
    expect(fetch.mock.calls[1]![1]).toMatchObject({ method: 'DELETE', headers: { Authorization: `Apikey ${'k'.repeat(30)}` } });
  });

  it('keeps a key the panel already prefixed, and survives a CDN error', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 200 })).mockResolvedValueOnce(new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', fetch);
    await expect(service({ WEB_INTERNAL_URL: 'http://web:3000', REVALIDATE_SECRET: SECRET, ARVAN_CDN_API_KEY: `Apikey ${'k'.repeat(30)}`, ARVAN_CDN_DOMAIN: 'sourcebyhedax.ir' }).purge()).resolves.toBeUndefined();
    expect(fetch.mock.calls[1]![1]).toMatchObject({ headers: { Authorization: `Apikey ${'k'.repeat(30)}` } });
  });

  it('coalesces a burst of changes into one purge', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const s = service({ WEB_INTERNAL_URL: 'http://web:3000', REVALIDATE_SECRET: SECRET });
    for (let i = 0; i < 5; i++) s.invalidate();
    await vi.advanceTimersByTimeAsync(250);
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
