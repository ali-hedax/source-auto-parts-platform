import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Client,
  type Services,
  type TestApp,
  addAddress,
  addToCart,
  bootApp,
  checkout,
  idemKey,
  loginCustomer,
  loginOwner,
  pngBytes,
  reviewCheckout,
  services,
  simulatorPay,
  simulatorRef,
  taxonomy,
  createProduct,
} from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

let t: TestApp;
let s: Services;
let owner: Client;
const run = Date.now().toString(36).toUpperCase();

beforeAll(async () => {
  t = await bootApp();
  s = await services(t);
  owner = await loginOwner(t);
});
afterAll(async () => {
  await t?.close();
});

async function balance(productId: string) {
  return s.prisma.inventoryBalance.findFirstOrThrow({ where: { productId } });
}

describe('A01 — product for Iran Khodro with photo and price becomes visible and purchasable after publishing', () => {
  it('admin creates, adds a real photo, publishes; storefront lists it under the brand; customer buys it', async () => {
    const tax = await taxonomy(owner);
    const ikco = tax.vehicleBrands.find((b) => b.code === 'IKCO') as any;
    const brake = tax.categories.find((c) => c.code === 'BRAKE') as any;
    const created = await owner.post('/admin/products', {
      sku: `A01-${run}`, nameFa: 'لنت ترمز عقب دنا آزمایشی', nameEn: 'Rear brake pad Dena (test)', categoryId: brake.id, vehicleBrandIds: [ikco.id],
      partType: 'GENUINE', condition: 'NEW', origin: 'DOMESTIC', basePrice: { currency: 'IRR', amountMinor: '25000000' }, lowStockThreshold: 1,
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    // Not visible before publishing.
    const anon = new Client(t);
    const before = await anon.get(`/catalog/products?brand=${ikco.slug}&q=${encodeURIComponent('دنا آزمایشی')}`);
    expect(before.body.items.find((p: any) => p.id === id)).toBeUndefined();

    const media = await owner.upload(`/admin/products/${id}/media`, { altFa: 'عکس واقعی لنت' }, [{ name: 'pad.png', data: await pngBytes(), field: 'file', type: 'image/png' }]);
    expect(media.status).toBe(201);
    const detail = await owner.get(`/admin/products/${id}`);
    await owner.post('/admin/inventory/adjust', { productId: id, newOnHand: 3, reason: 'RECEIVED', expectedVersion: detail.body.inventory.version });
    const fresh = await owner.get(`/admin/products/${id}`);
    const pub = await owner.post(`/admin/products/${id}/publish`, { published: true, version: fresh.body.version });
    expect(pub.status).toBe(201);

    const listed = await anon.get(`/catalog/products?brand=${ikco.slug}&q=${encodeURIComponent('دنا آزمایشی')}`);
    const card = listed.body.items.find((p: any) => p.id === id);
    expect(card).toBeDefined();
    expect(card.price).toMatchObject({ kind: 'price', payable: { currency: 'IRR', amountMinor: '25000000' } });
    expect(card.primaryImage.url).toMatch(/\.webp$/);
    expect(card.availability).toBe('IN_STOCK');
    // The image itself is served (local storage driver) with safe headers; private files are not reachable.
    const image = await fetch(`${t.origin}${card.primaryImage.url}`);
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/webp');
    expect(image.headers.get('x-content-type-options')).toBe('nosniff');
    expect((await fetch(`${t.origin}/media/`)).status).toBe(404);
    expect((await fetch(`${t.origin}/media/..%2Fprivate%2Fatt`)).status).toBe(404);

    const page = await anon.get(`/catalog/products/${fresh.body.slug}`);
    expect(page.status).toBe(200);
    expect(page.body.maxOrderQuantity).toBe(3);

    const customer = await loginCustomer(t);
    await addToCart(customer, id, 2);
    const addressId = await addAddress(customer);
    const start = await checkout(customer, addressId);
    expect(start.status).toBe(201);
    expect(start.body.isSimulator).toBe(true);
    const paid = await simulatorPay(customer, start.body.redirectUrl, 'SUCCEEDED');
    expect(paid.callbackStatus).toBe(303);
    expect(paid.resultLocation).toContain(`/fa/payment/result?attempt=${start.body.attemptId}`);

    const order = await customer.get(`/orders/${start.body.orderId}`);
    expect(order.body.status).toBe('CONFIRMED');
    expect(order.body.paymentStatus).toBe('PAID');
    expect(order.body.lines[0]).toMatchObject({ quantity: 2, unitPrice: { currency: 'IRR', amountMinor: '25000000' } });
    expect(order.body.receipts).toHaveLength(1);
    const bal = await balance(id);
    expect(bal).toMatchObject({ onHand: 1, reserved: 0 });
  });
});

describe('A02 — out-of-stock or archived products cannot be bought; the sourcing path stays clear', () => {
  it('out of stock: add-to-cart refused with a sourcing hint, product shows OUT_OF_STOCK', async () => {
    const p = await createProduct(owner, { sku: `A02-OOS-${run}`, nameFa: 'واتر پمپ ناموجود آزمایشی', priceIrr: 9_000_000n, onHand: 0 });
    const customer = await loginCustomer(t);
    const detail = await customer.get(`/catalog/products/${p.slug}`);
    expect(detail.body.availability).toBe('OUT_OF_STOCK');
    expect(detail.body.maxOrderQuantity).toBe(0);
    const add = await customer.post('/cart/items', { productId: p.id, quantity: 1 });
    expect(add.status).toBe(422);
    expect(add.body.error.code).toBe('OUT_OF_STOCK');
    expect(add.body.error.message).toMatch(/sourcing/i);
  });

  it('archived after being added to a cart: storefront hides it and checkout refuses', async () => {
    const p = await createProduct(owner, { sku: `A02-ARC-${run}`, nameFa: 'سنسور بایگانی آزمایشی', priceIrr: 4_000_000n, onHand: 5 });
    const customer = await loginCustomer(t);
    await addToCart(customer, p.id, 1);
    const addressId = await addAddress(customer);
    const current = await owner.get(`/admin/products/${p.id}`);
    expect((await owner.post(`/admin/products/${p.id}/archive`, { version: current.body.version })).status).toBe(201);

    expect((await customer.get(`/catalog/products/${p.slug}`)).status).toBe(404);
    const cart = await customer.get('/cart');
    expect(cart.body.canCheckout).toBe(false);
    expect(cart.body.lines[0].problems).toContain('UNAVAILABLE');
    const { preview } = await reviewCheckout(customer, addressId);
    expect(preview.blockers).toContain('CART_NOT_READY');
    // Even a hand-crafted request is refused by the server.
    const forced = await customer.post('/checkout', {
      addressId, shippingMethodId: preview.shippingOptions[0].id, acceptedPolicyVersionId: preview.policy.id, expectedGrandTotalIrr: '1',
    }, { 'idempotency-key': idemKey() });
    expect(forced.status).toBe(422);
    expect(forced.body.error.code).toBe('PRODUCT_NOT_PURCHASABLE');
    // A search that finds nothing echoes the normalized query so the UI can prefill a sourcing request.
    const none = await customer.get(`/catalog/products?q=${encodeURIComponent('قطعه‌ای که وجود ندارد ۹۹')}`);
    expect(none.body.total).toBe(0);
    expect(none.body.query).toBeTruthy();
  });
});

describe('A06 — a new exchange rate does not change paid orders or receipts', () => {
  it('AED-based product: order keeps its amount and rate snapshot after the rate changes', async () => {
    const rateBefore = (await owner.get('/exchange-rates/current')).body.irrPerAed as string;
    const p = await createProduct(owner, { sku: `A06-${run}`, nameFa: 'فیلتر کابین وارداتی آزمایشی', priceAed: 4_550n, onHand: 4, vehicleBrandCodes: ['TOYOTA'], category: 'FILTER' });
    const customer = await loginCustomer(t);
    await addToCart(customer, p.id, 1);
    const addressId = await addAddress(customer);
    const start = await checkout(customer, addressId);
    expect(start.status).toBe(201);
    await simulatorPay(customer, start.body.redirectUrl, 'SUCCEEDED');
    const before = await customer.get(`/orders/${start.body.orderId}`);
    expect(before.body.status).toBe('CONFIRMED');
    expect(before.body.fx.irrPerAed).toBe(rateBefore);

    const newRate = (Number(rateBefore) * 1.25).toFixed(0);
    const created = await owner.post('/admin/exchange-rates', { irrPerAed: newRate, effectiveFrom: new Date().toISOString(), note: 'A06 test rate (not a market rate)' });
    expect(created.status).toBe(201);
    expect((await owner.get('/exchange-rates/current')).body.irrPerAed).toBe(newRate);

    const after = await customer.get(`/orders/${start.body.orderId}`);
    expect(after.body.totals).toEqual(before.body.totals);
    expect(after.body.lines).toEqual(before.body.lines);
    expect(after.body.fx.irrPerAed).toBe(rateBefore);
    expect(after.body.receipts).toEqual(before.body.receipts);
    // New visitors see the new conversion.
    const card = await customer.get(`/catalog/products/${p.slug}`);
    expect(BigInt(card.body.price.payable.amountMinor)).toBeGreaterThan(BigInt(before.body.lines[0].unitPrice.amountMinor));
    // Rates are append-only at the database level.
    await expect(s.prisma.$executeRaw`UPDATE "exchange_rate" SET "irr_per_aed" = 1`).rejects.toThrow();
  });
});

describe('A08 — concurrent checkouts for the last unit', () => {
  it('exactly one reservation wins; no negative stock or oversell', async () => {
    const p = await createProduct(owner, { sku: `A08-${run}`, nameFa: 'آخرین دینام آزمایشی', priceIrr: 50_000_000n, onHand: 1 });
    const buyers = await Promise.all([loginCustomer(t), loginCustomer(t), loginCustomer(t), loginCustomer(t)]);
    const prepared = [];
    for (const b of buyers) {
      await addToCart(b, p.id, 1);
      const addressId = await addAddress(b);
      const { preview, shippingMethodId } = await reviewCheckout(b, addressId);
      prepared.push({ b, body: { addressId, shippingMethodId, acceptedPolicyVersionId: preview.policy.id, expectedGrandTotalIrr: preview.totals.grandTotal.amountMinor } });
    }
    const results = await Promise.all(prepared.map(({ b, body }) => b.post('/checkout', body, { 'idempotency-key': idemKey() })));
    const ok = results.filter((r) => r.status === 201);
    const refused = results.filter((r) => r.status !== 201);
    expect(ok).toHaveLength(1);
    expect(refused.every((r) => r.status === 409 && r.body.error.code === 'INSUFFICIENT_STOCK')).toBe(true);
    const bal = await balance(p.id);
    expect(bal).toMatchObject({ onHand: 1, reserved: 1 });
    expect(await s.prisma.inventoryReservation.count({ where: { productId: p.id, status: 'ACTIVE' } })).toBe(1);
    // Losing checkouts left nothing behind (whole transaction rolled back).
    expect(await s.prisma.orderItem.count({ where: { productId: p.id } })).toBe(1);
  });
});

describe('A09 — duplicate callback, double click and refresh', () => {
  it('one order, one payment application, one stock consumption', async () => {
    const p = await createProduct(owner, { sku: `A09-${run}`, nameFa: 'کیت کلاچ آزمایشی', priceIrr: 33_000_000n, onHand: 5 });
    const customer = await loginCustomer(t);
    await addToCart(customer, p.id, 2);
    const addressId = await addAddress(customer);
    const { preview, shippingMethodId } = await reviewCheckout(customer, addressId);
    const body = { addressId, shippingMethodId, acceptedPolicyVersionId: preview.policy.id, expectedGrandTotalIrr: preview.totals.grandTotal.amountMinor };
    const key = idemKey();
    // Double click: two identical submissions at once, then a retry.
    const [a, b] = await Promise.all([customer.post('/checkout', body, { 'idempotency-key': key }), customer.post('/checkout', body, { 'idempotency-key': key })]);
    const firstOk = [a, b].find((r) => r.status === 201) as any;
    expect(firstOk).toBeDefined();
    for (const r of [a, b]) if (r.status !== 201) expect(r.body.error.code).toBe('REQUEST_IN_PROGRESS');
    const retry = await customer.post('/checkout', body, { 'idempotency-key': key });
    expect(retry.status).toBe(201);
    expect(retry.body.orderId).toBe(firstOk.body.orderId);
    expect(retry.body.attemptId).toBe(firstOk.body.attemptId);
    // Same key with a different body is refused, not replayed.
    const reused = await customer.post('/checkout', { ...body, customerNote: 'changed' }, { 'idempotency-key': key });
    expect(reused.status).toBe(422);
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    const orders = await customer.get('/orders');
    expect(orders.body.filter((o: any) => o.id === firstOk.body.orderId)).toHaveLength(1);
    expect(await s.prisma.order.count({ where: { items: { some: { productId: p.id } } } })).toBe(1);

    // Bank success with a duplicated callback (fired twice server-side) + the browser callback.
    await simulatorPay(customer, firstOk.body.redirectUrl, 'DUPLICATE');
    // Refresh: the callback URL and the result page are hit again.
    const ref = simulatorRef(firstOk.body.redirectUrl);
    await customer.raw('GET', `${t.base}/payments/callback/simulator?ref=${encodeURIComponent(ref)}&status=OK`);
    for (let i = 0; i < 3; i += 1) expect((await customer.get(`/payments/attempts/${firstOk.body.attemptId}`)).body.status).toBe('SUCCEEDED');

    const attemptId = firstOk.body.attemptId;
    expect(await s.prisma.paymentSettlement.count({ where: { paymentAttemptId: attemptId } })).toBe(1);
    expect(await s.prisma.paymentEvent.count({ where: { paymentAttemptId: attemptId, type: 'VERIFIED' } })).toBe(1);
    expect(await s.prisma.paymentEvent.count({ where: { paymentAttemptId: attemptId, type: 'CALLBACK_RECEIVED' } })).toBeGreaterThanOrEqual(1);
    expect(await s.prisma.inventoryMovement.count({ where: { productId: p.id, type: 'CONSUME' } })).toBe(1);
    expect(await s.prisma.orderEvent.count({ where: { subjectId: firstOk.body.orderId, toState: 'CONFIRMED' } })).toBe(1);
    expect(await balance(p.id)).toMatchObject({ onHand: 3, reserved: 0 });
    expect(await s.prisma.resolutionCase.count({ where: { subjectId: firstOk.body.orderId } })).toBe(0);
  });
});

describe('A10 — tampered amount or a success claimed only by the browser', () => {
  it('provider reports a smaller paid amount: never a success; escalated for review', async () => {
    const p = await createProduct(owner, { sku: `A10-T-${run}`, nameFa: 'رادیاتور آزمایشی', priceIrr: 70_000_000n, onHand: 2 });
    const customer = await loginCustomer(t);
    await addToCart(customer, p.id, 1);
    const start = await checkout(customer, await addAddress(customer));
    await simulatorPay(customer, start.body.redirectUrl, 'TAMPERED');
    const result = await customer.get(`/payments/attempts/${start.body.attemptId}`);
    expect(result.body.status).toBe('FAILED');
    expect(result.body.message).toBe('NEEDS_REVIEW');
    const order = await customer.get(`/orders/${start.body.orderId}`);
    expect(order.body.status).toBe('AWAITING_PAYMENT');
    expect(order.body.paymentStatus).not.toBe('PAID');
    const cases = await s.prisma.resolutionCase.findMany({ where: { paymentAttemptId: start.body.attemptId } });
    expect(cases.map((c: any) => c.kind)).toEqual(['AMOUNT_MISMATCH']);
    expect(await s.prisma.paymentSettlement.count({ where: { paymentAttemptId: start.body.attemptId } })).toBe(0);
    expect(await balance(p.id)).toMatchObject({ onHand: 2, reserved: 0 }); // reservation released, nothing consumed
  });

  it('a forged "OK" callback without a bank decision changes nothing', async () => {
    const p = await createProduct(owner, { sku: `A10-F-${run}`, nameFa: 'استارت آزمایشی', priceIrr: 45_000_000n, onHand: 2 });
    const customer = await loginCustomer(t);
    await addToCart(customer, p.id, 1);
    const start = await checkout(customer, await addAddress(customer));
    const ref = simulatorRef(start.body.redirectUrl);
    const forged = await customer.raw('GET', `${t.base}/payments/callback/simulator?ref=${encodeURIComponent(ref)}&status=OK&amount=1`);
    expect(forged.status).toBe(303);
    const attempt = await s.prisma.paymentAttempt.findUniqueOrThrow({ where: { id: start.body.attemptId } });
    expect(attempt.status).not.toBe('SUCCEEDED');
    expect((await customer.get(`/orders/${start.body.orderId}`)).body.status).toBe('AWAITING_PAYMENT');
    const unknown = await customer.raw('GET', `${t.base}/payments/callback/simulator?ref=SIM-00000000-0000-0000-0000-000000000000&status=OK`);
    expect(unknown.status).toBe(404);
    // The amount always comes from the server: a stale/forged expected total is refused.
    const again = await loginCustomer(t);
    await addToCart(again, p.id, 1);
    const addressId = await addAddress(again);
    const { preview, shippingMethodId } = await reviewCheckout(again, addressId);
    const cheap = await again.post('/checkout', { addressId, shippingMethodId, acceptedPolicyVersionId: preview.policy.id, expectedGrandTotalIrr: '1000' }, { 'idempotency-key': idemKey() });
    expect(cheap.status).toBe(409);
    expect(cheap.body.error.code).toBe('TOTAL_CHANGED');
    expect(cheap.body.error.details.grandTotalIrr).toBe(preview.totals.grandTotal.amountMinor);
  });
});

describe('A04 — Persian search on the real database (ی/ي، ک/ك، نیم‌فاصله، digits)', () => {
  it('finds the part whatever keyboard variant the customer types; nonsense finds nothing', async () => {
    const digits = String(Date.now()).slice(-6);
    const p = await createProduct(owner, { sku: `A04-${digits}`, nameFa: 'کمک‌فنر جلو سمند پیستونی آزمونی', priceIrr: 9_500_000n, onHand: 3 });
    const anon = new Client(t);
    const finds = async (q: string) => {
      const res = await anon.get(`/catalog/products?q=${encodeURIComponent(q)}&pageSize=60`);
      expect(res.status).toBe(200);
      return res.body.items.some((x: any) => x.id === p.id);
    };
    expect(await finds('كمك فنر جلو سمند')).toBe(true); // Arabic kaf, space instead of ZWNJ
    expect(await finds('کمکفنر سمند')).toBe(true); // ZWNJ dropped entirely
    expect(await finds('کمک‌فنر')).toBe(true); // with ZWNJ
    expect(await finds('پيستوني')).toBe(true); // Arabic yeh
    expect(await finds(`A04-${digits.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] as string)}`)).toBe(true); // Persian digits in the code
    expect(await finds(`a04-${digits}`)).toBe(true); // case-insensitive code
    expect(await finds(`A04-${digits} test part`)).toBe(true); // English name
    expect(await finds('کمک فنرر جلو سمند')).toBe(true); // typo → trigram similarity
    const none = await anon.get(`/catalog/products?q=${encodeURIComponent('ظظظظظظ قققق')}`);
    expect(none.body.total).toBe(0);
    // Ranking: the exact name ranks this part first among results.
    const ranked = await anon.get(`/catalog/products?q=${encodeURIComponent('کمک‌فنر جلو سمند پیستونی آزمونی')}`);
    expect(ranked.body.items[0].id).toBe(p.id);
  });
});
