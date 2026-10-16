import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, type Services, type TestApp, bootApp, createProduct, loginCustomer, loginOwner, services } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

let t: TestApp;
let s: Services;
let owner: Client;
const run = Date.now().toString(36).toUpperCase();
const digits = String(Date.now()).slice(-7);

beforeAll(async () => {
  t = await bootApp();
  s = await services(t);
  owner = await loginOwner(t);
});
afterAll(async () => { await t?.close(); });

const png = () => sharp({ create: { width: 80, height: 60, channels: 3, background: { r: 30, g: 90, b: 160 } } }).png().toBuffer();

describe('bulk photos: codes from file names → products', () => {
  it('matches technical numbers (spacing ignored) and SKUs, lists shared codes, counts photos', async () => {
    const tech = `0${digits}05`;
    const shared = `SH-${run}`;
    const a = await createProduct(owner, { sku: `BP-${run}-A`, nameFa: 'قطعهٔ عکس گروهی', priceIrr: 1_000_000n, onHand: 1 });
    const b = await createProduct(owner, { sku: `BP-${run}-B`, nameFa: 'قطعهٔ مشترک ۱', priceIrr: 1_000_000n, onHand: 1 });
    const c = await createProduct(owner, { sku: `BP-${run}-C`, nameFa: 'قطعهٔ مشترک ۲', priceIrr: 1_000_000n, onHand: 1 });
    await s.prisma.product.update({ where: { id: a.id }, data: { oemCodes: [tech] } });
    await s.prisma.product.updateMany({ where: { id: { in: [b.id, c.id] } }, data: { oemCodes: [shared] } });

    const spaced = `${tech.slice(0, 5)} ${tech.slice(5)}`;
    const res = await owner.post('/admin/products/code-lookup', { codes: [spaced, `BP-${run}-A`, shared, `NONE-${run}`] });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const m = res.body.matches as Record<string, any[]>;
    expect(m[spaced]?.map((p) => p.id)).toEqual([a.id]);
    expect(m[`BP-${run}-A`]?.map((p) => p.id)).toEqual([a.id]);
    expect(m[shared]?.map((p) => p.id).sort()).toEqual([b.id, c.id].sort());
    expect(m[`NONE-${run}`]).toEqual([]);
    expect(m[spaced]?.[0]).toMatchObject({ sku: `BP-${run}-A`, nameFa: 'قطعهٔ عکس گروهی', photoCount: 0 });

    const up = await owner.upload(`/admin/products/${a.id}/media`, {}, [{ name: `${tech}-1.png`, data: await png(), field: 'file', type: 'image/png' }]);
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    const again = await owner.post('/admin/products/code-lookup', { codes: [tech] });
    expect(again.body.matches[tech][0].photoCount).toBe(1);
  });

  it('leaves archived products out and rejects bad input and customers', async () => {
    const d = await createProduct(owner, { sku: `BP-${run}-D`, nameFa: 'قطعهٔ بایگانی', priceIrr: 1_000_000n, onHand: 0 });
    await s.prisma.product.update({ where: { id: d.id }, data: { archivedAt: new Date() } });
    const res = await owner.post('/admin/products/code-lookup', { codes: [`BP-${run}-D`] });
    expect(res.body.matches[`BP-${run}-D`]).toEqual([]);

    expect((await owner.post('/admin/products/code-lookup', { codes: [] })).status).toBe(400);
    expect((await owner.post('/admin/products/code-lookup', { codes: Array.from({ length: 501 }, (_, i) => `X${i}`) })).status).toBe(400);
    const customer = await loginCustomer(t);
    expect((await customer.post('/admin/products/code-lookup', { codes: ['X'] })).status).toBe(403);
  });
});
