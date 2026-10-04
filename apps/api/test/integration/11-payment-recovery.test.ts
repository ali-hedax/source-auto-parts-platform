import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Client,
  type Services,
  type TestApp,
  addAddress,
  addToCart,
  bootApp,
  checkout,
  createProduct,
  idemKey,
  loginCustomer,
  loginCustomerAgain,
  loginOwner,
  reviewCheckout,
  services,
  simulatorPay,
  taxonomy,
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

const balance = (productId: string) => s.prisma.inventoryBalance.findFirstOrThrow({ where: { productId } });

async function setBasePrice(productId: string, amountMinor: string): Promise<void> {
  const p = await owner.get(`/admin/products/${productId}`);
  const res = await owner.put(`/admin/products/${productId}`, {
    sku: p.body.sku, nameFa: p.body.nameFa, nameEn: p.body.nameEn, categoryId: p.body.categoryId, vehicleBrandIds: p.body.vehicleBrandIds,
    partType: p.body.partType, condition: p.body.condition, origin: p.body.origin, basePrice: { currency: 'IRR', amountMinor }, version: p.body.version,
  });
  expect(res.status).toBe(200);
}

/** Simulates the passage of time for a checkout: its reservation and the gateway window are over. */
async function expireCheckout(orderId: string, attemptId: string): Promise<void> {
  await s.prisma.$executeRaw`UPDATE "inventory_reservation" SET "expires_at" = now() - interval '1 minute' WHERE "order_id" = ${orderId}::uuid AND "status" = 'ACTIVE'`;
  await s.prisma.$executeRaw`UPDATE "payment_attempt" SET "provider_deadline" = now() - interval '10 minutes' WHERE "id" = ${attemptId}::uuid`;
}

describe('A11 — the customer closes the browser right after paying', () => {
  it('result-page inquiry recovers the verified payment and completes the order', async () => {
    const p = await createProduct(owner, { sku: `A11-R-${run}`, nameFa: 'تسمه تایم آزمایشی', priceIrr: 12_000_000n, onHand: 3 });
    const customer = await loginCustomer(t);
    await addToCart(customer, p.id, 1);
    const start = await checkout(customer, await addAddress(customer));
    await simulatorPay(customer, start.body.redirectUrl, 'SUCCEEDED', false); // paid at the bank, never returned
    expect((await s.prisma.paymentAttempt.findUniqueOrThrow({ where: { id: start.body.attemptId } })).status).toBe('PENDING');
    expect((await customer.get(`/orders/${start.body.orderId}`)).body.status).toBe('AWAITING_PAYMENT');

    const result = await customer.get(`/payments/attempts/${start.body.attemptId}`);
    expect(result.body).toMatchObject({ status: 'SUCCEEDED', message: 'VERIFIED' });
    const order = await customer.get(`/orders/${start.body.orderId}`);
    expect(order.body.status).toBe('CONFIRMED');
    expect(order.body.receipts).toHaveLength(1);
    expect(await balance(p.id)).toMatchObject({ onHand: 2, reserved: 0 });
  });

  it('the worker reconciliation job recovers it without any customer action', async () => {
    const p = await createProduct(owner, { sku: `A11-W-${run}`, nameFa: 'پمپ بنزین آزمایشی', priceIrr: 21_000_000n, onHand: 3 });
    const customer = await loginCustomer(t);
    await addToCart(customer, p.id, 1);
    const start = await checkout(customer, await addAddress(customer));
    await simulatorPay(customer, start.body.redirectUrl, 'SUCCEEDED', false);
    // The job waits a few minutes before the first inquiry; move this attempt past that window.
    await s.prisma.$executeRaw`UPDATE "payment_attempt" SET "created_at" = now() - interval '4 minutes' WHERE "id" = ${start.body.attemptId}::uuid`;
    const processed = await s.runAsWorker(() => s.payments.reconcileDue());
    expect(processed).toBeGreaterThanOrEqual(1);
    const attempt = await s.prisma.paymentAttempt.findUniqueOrThrow({ where: { id: start.body.attemptId } });
    expect(attempt.status).toBe('SUCCEEDED');
    expect((await customer.get(`/orders/${start.body.orderId}`)).body.status).toBe('CONFIRMED');
    // The customer is told through a notification queued in the same transaction.
    expect(await s.prisma.outboxEvent.count({ where: { type: 'notification.send', dedupeKey: `notify:order-paid:${start.body.orderId}` } })).toBe(1);
  });
});

describe('A12 — verified success arriving after the reservation expired', () => {
  it('stock still available: re-allocated and the order is confirmed', async () => {
    const p = await createProduct(owner, { sku: `A12-OK-${run}`, nameFa: 'کمک فنر جلو آزمایشی', priceIrr: 30_000_000n, onHand: 2 });
    const customer = await loginCustomer(t);
    await addToCart(customer, p.id, 1);
    const start = await checkout(customer, await addAddress(customer));
    await expireCheckout(start.body.orderId, start.body.attemptId);
    const swept = await s.runAsWorker(() => s.settlement.sweepExpiredReservations());
    expect(swept.released).toBeGreaterThanOrEqual(1);
    expect(await balance(p.id)).toMatchObject({ onHand: 2, reserved: 0 });

    await simulatorPay(customer, start.body.redirectUrl, 'SUCCEEDED');
    const order = await customer.get(`/orders/${start.body.orderId}`);
    expect(order.body.status).toBe('CONFIRMED');
    expect(await balance(p.id)).toMatchObject({ onHand: 1, reserved: 0 });
    expect(await s.prisma.inventoryMovement.count({ where: { productId: p.id, type: 'REALLOCATE' } })).toBe(1);
  });

  it('stock sold meanwhile: money recorded, order in EXCEPTION with a refund case — never lost or oversold', async () => {
    const p = await createProduct(owner, { sku: `A12-NO-${run}`, nameFa: 'آخرین گیربکس آزمایشی', priceIrr: 90_000_000n, onHand: 1 });
    const late = await loginCustomer(t);
    await addToCart(late, p.id, 1);
    const lateStart = await checkout(late, await addAddress(late));
    await expireCheckout(lateStart.body.orderId, lateStart.body.attemptId);
    await s.runAsWorker(() => s.settlement.sweepExpiredReservations());

    const other = await loginCustomer(t);
    await addToCart(other, p.id, 1);
    const otherStart = await checkout(other, await addAddress(other));
    expect(otherStart.status).toBe(201);
    await simulatorPay(other, otherStart.body.redirectUrl, 'SUCCEEDED');
    expect(await balance(p.id)).toMatchObject({ onHand: 0, reserved: 0 });

    await simulatorPay(late, lateStart.body.redirectUrl, 'SUCCEEDED');
    const attempt = await s.prisma.paymentAttempt.findUniqueOrThrow({ where: { id: lateStart.body.attemptId } });
    expect(attempt.status).toBe('SUCCEEDED');
    expect(await s.prisma.paymentSettlement.count({ where: { paymentAttemptId: attempt.id } })).toBe(1);
    const order = await late.get(`/orders/${lateStart.body.orderId}`);
    expect(order.body.status).toBe('EXCEPTION');
    expect(order.body.paymentStatus).toBe('PAID');
    const cases = await owner.get('/payments/admin/cases');
    const mine = cases.body.find((c: any) => c.paymentAttemptId === attempt.id);
    expect(mine).toMatchObject({ kind: 'LATE_PAYMENT_NO_STOCK', status: 'OPEN', amount: { currency: 'IRR', amountMinor: attempt.amountIrrMinor.toString() } });
    expect(await balance(p.id)).toMatchObject({ onHand: 0, reserved: 0 });
    expect(await s.prisma.outboxEvent.count({ where: { dedupeKey: `notify:order-exception:${lateStart.body.orderId}` } })).toBe(1);
  });
});

describe('A26 — self-declared wholesaler', () => {
  it('no private price before an authorized approval; afterwards only that customer sees it', async () => {
    const p = await createProduct(owner, { sku: `A26-${run}`, nameFa: 'دیسک ترمز عمده آزمایشی', priceIrr: 10_000_000n, onHand: 50 });
    const tax = await taxonomy(owner);
    const wholesale = tax.customerGroups.find((g) => g.key === 'wholesale') as any;
    const rule = await owner.post(`/admin/products/${p.id}/price-rules`, { customerGroupId: wholesale.id, minQty: 1, maxQty: null, basePrice: { currency: 'IRR', amountMinor: '8000000' } });
    expect(rule.status).toBe(201);

    const w = await loginCustomer(t);
    const request = await w.post('/account/business-request', { requestedType: 'WHOLESALER', businessName: 'فروشگاه آزمایشی', city: 'تهران' });
    expect(request.status).toBe(201);
    expect(request.body.status).toBe('PENDING');
    const pending = await w.get(`/catalog/products/${p.slug}`);
    expect(pending.body.price.payable.amountMinor).toBe('10000000');
    await addToCart(w, p.id, 3);
    const addressId = await addAddress(w);
    expect((await reviewCheckout(w, addressId)).preview.totals.itemsTotal.amountMinor).toBe('30000000');

    expect((await w.get('/account/profile')).body.groupStatus).toBe('PENDING');
    const me = await w.get('/me');
    expect(me.body.customerGroup).toBeNull(); // nothing granted while pending
    const approve = await owner.post(`/admin/customers/${me.body.id}/group-decision`, { decision: 'APPROVED', note: 'مدارک بررسی شد (آزمون)' });
    expect(approve.status).toBe(201);
    // Group changes end existing sessions; the next sign-in carries the new price visibility.
    expect((await w.get('/me')).status).toBe(401);
    const again = await loginCustomerAgain(t, s, w.mobile);
    const approved = await again.get(`/catalog/products/${p.slug}`);
    expect(approved.body.price.payable.amountMinor).toBe('8000000');
    expect(approved.headers.get('cache-control')).toBe('private, no-store');
    const { preview } = await reviewCheckout(again, addressId);
    expect(preview.totals.itemsTotal.amountMinor).toBe('24000000');

    const consumer = await loginCustomer(t);
    expect((await consumer.get(`/catalog/products/${p.slug}`)).body.price.payable.amountMinor).toBe('10000000');
    const anon = new Client(t);
    expect((await anon.get(`/catalog/products/${p.slug}`)).body.price.payable.amountMinor).toBe('10000000');
  });

  it('a rejected request keeps public prices', async () => {
    const p = await createProduct(owner, { sku: `A26-R-${run}`, nameFa: 'لنت عمده رد شده آزمایشی', priceIrr: 5_000_000n, onHand: 5 });
    const tax = await taxonomy(owner);
    const workshop = tax.customerGroups.find((g) => g.key === 'workshop') as any;
    await owner.post(`/admin/products/${p.id}/price-rules`, { customerGroupId: workshop.id, minQty: 1, maxQty: null, basePrice: { currency: 'IRR', amountMinor: '4000000' } });
    const c = await loginCustomer(t);
    await c.post('/account/business-request', { requestedType: 'WORKSHOP', businessName: 'تعمیرگاه آزمایشی', city: 'کرج' });
    const me = await c.get('/me');
    expect((await owner.post(`/admin/customers/${me.body.id}/group-decision`, { decision: 'REJECTED', note: 'مدرک ناقص' })).status).toBe(201);
    const again = await loginCustomerAgain(t, s, c.mobile);
    expect((await again.get(`/catalog/products/${p.slug}`)).body.price.payable.amountMinor).toBe('5000000');
    expect((await again.get('/account/profile')).body.groupStatus).toBe('REJECTED');
  });
});

describe('A27 — caching and fresh prices at checkout', () => {
  it('anonymous responses are shared-cacheable, signed-in ones are private; cart/checkout never cached', async () => {
    const p = await createProduct(owner, { sku: `A27-C-${run}`, nameFa: 'آینه بغل آزمایشی', priceIrr: 7_000_000n, onHand: 5 });
    const anon = new Client(t);
    const pub = await anon.get(`/catalog/products/${p.slug}`);
    expect(pub.headers.get('cache-control')).toMatch(/^public, s-maxage=\d+/);
    expect(pub.headers.get('vary')).toMatch(/Cookie/i);
    const customer = await loginCustomer(t);
    for (const path of [`/catalog/products/${p.slug}`, '/catalog/products', '/cart', '/me']) {
      const res = await customer.get(path);
      expect(res.headers.get('cache-control'), path).toMatch(/private, no-store/);
    }
    await addToCart(customer, p.id, 1);
    const addressId = await addAddress(customer);
    const preview = await customer.get(`/checkout/preview?addressId=${addressId}`);
    expect(preview.headers.get('cache-control')).toBe('private, no-store');
  });

  it('a price change after the review step is caught at checkout; the customer must accept the new total', async () => {
    const p = await createProduct(owner, { sku: `A27-P-${run}`, nameFa: 'چراغ مه شکن آزمایشی', priceIrr: 6_000_000n, onHand: 5 });
    const customer = await loginCustomer(t);
    await addToCart(customer, p.id, 2);
    const addressId = await addAddress(customer);
    const { preview, shippingMethodId } = await reviewCheckout(customer, addressId);
    const oldTotal = preview.totals.grandTotal.amountMinor as string;

    await setBasePrice(p.id, '6500000');
    const stale = await customer.post('/checkout', { addressId, shippingMethodId, acceptedPolicyVersionId: preview.policy.id, expectedGrandTotalIrr: oldTotal }, { 'idempotency-key': idemKey() });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('TOTAL_CHANGED');
    const newTotal = stale.body.error.details.grandTotalIrr as string;
    expect(BigInt(newTotal) - BigInt(oldTotal)).toBe(1_000_000n);
    expect(await s.prisma.order.count({ where: { items: { some: { productId: p.id } } } })).toBe(0);

    const accepted = await customer.post('/checkout', { addressId, shippingMethodId, acceptedPolicyVersionId: preview.policy.id, expectedGrandTotalIrr: newTotal }, { 'idempotency-key': idemKey() });
    expect(accepted.status).toBe(201);
    const attempt = await s.prisma.paymentAttempt.findUniqueOrThrow({ where: { id: accepted.body.attemptId } });
    expect(attempt.amountIrrMinor.toString()).toBe(newTotal);
  });
});
