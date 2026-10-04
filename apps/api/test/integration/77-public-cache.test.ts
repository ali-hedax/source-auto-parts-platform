import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, type TestApp, bootApp, createProduct, loginCustomer, loginOwner } from './helpers.js';

/**
 * Spec §15: after a change that affects public pages the API asks the web app to
 * purge its public cache (with the shared secret, bursts coalesced). Reads and
 * private writes do not. A stub stands in for the web app's internal route.
 */
const secret = 'integration-test-revalidate-secret-0123456789';
const calls: Array<{ method: string; path: string; secret: string | undefined }> = [];
const stub = createServer((req, res) => {
  calls.push({ method: req.method ?? '', path: req.url ?? '', secret: req.headers['x-hedax-revalidate'] as string | undefined });
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end('{"revalidated":true}');
});
const run = Date.now().toString(36).toUpperCase();
let t: TestApp;
let owner: Client;

beforeAll(async () => {
  await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', () => resolve()));
  const { port } = stub.address() as { port: number };
  // Before the (cached) environment is loaded; this file runs in its own process.
  process.env.WEB_INTERNAL_URL = `http://127.0.0.1:${port}`;
  process.env.REVALIDATE_SECRET = secret;
  t = await bootApp();
  owner = await loginOwner(t);
});

afterAll(async () => {
  await t?.close();
  stub.close();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 800));

describe('public cache purge', () => {
  it('a catalog change purges with the shared secret; reads and private writes do not', async () => {
    await settle();
    calls.length = 0;

    // Reads, a customer sign-in and a private profile write: no purge.
    expect((await owner.get('/admin/products')).status).toBe(200);
    const customer = await loginCustomer(t); // OTP + profile update
    expect((await customer.get('/catalog/products')).status).toBe(200);
    await settle();
    expect(calls).toEqual([]);

    // Creating, pricing, stocking and publishing a product: purged (a burst becomes few calls).
    await createProduct(owner, { sku: `PC-${run}`, nameFa: 'قطعهٔ آزمایشی کش', priceIrr: 1_000_000n, onHand: 1 });
    await settle();
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls.every((c) => c.method === 'POST' && c.path === '/api/internal/revalidate' && c.secret === secret)).toBe(true);

    // A new exchange rate changes AED-based prices: purged.
    calls.length = 0;
    const rate = await owner.post('/admin/exchange-rates', { irrPerAed: '161000', effectiveFrom: new Date().toISOString(), note: 'نرخ آزمایشی کش' });
    expect(rate.status, JSON.stringify(rate.body)).toBe(201);
    await settle();
    expect(calls).toHaveLength(1);
  });
});
