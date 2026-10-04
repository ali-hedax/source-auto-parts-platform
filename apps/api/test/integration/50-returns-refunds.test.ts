import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type Client,
  type Services,
  type TestApp,
  addAddress,
  addToCart,
  bootApp,
  checkout,
  createProduct,
  idemKey,
  loginCustomer,
  loginOwner,
  services,
  simulatorPay,
} from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

let t: TestApp;
let s: Services;
let owner: Client;
let simulator: any;

beforeAll(async () => {
  t = await bootApp();
  s = await services(t);
  owner = await loginOwner(t);
  const { PaymentProviderRegistry } = await import('../../dist/modules/payments/provider-registry.js');
  simulator = t.get<any>(PaymentProviderRegistry).simulator();
});
afterAll(async () => {
  await t?.close();
});

const balance = (productId: string) => s.prisma.inventoryBalance.findFirstOrThrow({ where: { productId } });

async function paidOrder(quantity: number, priceIrr: bigint, onHand: number) {
  const p = await createProduct(owner, { sku: `A28-${quantity}-${idemKey().slice(-6)}`, nameFa: 'قطعهٔ مرجوعی آزمایشی', priceIrr, onHand });
  const customer = await loginCustomer(t);
  await addToCart(customer, p.id, quantity);
  const start = await checkout(customer, await addAddress(customer));
  expect(start.status).toBe(201);
  await simulatorPay(customer, start.body.redirectUrl, 'SUCCEEDED');
  return { p, customer, orderId: start.body.orderId as string, attemptId: start.body.attemptId as string };
}

async function move(orderId: string, toState: string, extra: Record<string, unknown> = {}) {
  const current = await owner.get(`/admin/orders/${orderId}`);
  const res = await owner.post(`/admin/orders/${orderId}/transition`, { toState, version: current.body.version, ...extra });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
}

async function refund(attemptId: string, amountIrr: bigint | string, extra: Record<string, unknown> = {}) {
  return owner.post('/admin/refunds', { paymentAttemptId: attemptId, amountIrr: amountIrr.toString(), reason: 'استرداد آزمایشی', ...extra }, { 'idempotency-key': idemKey() });
}

describe('A28 — cancellation, return, refund and a failed refund', () => {
  it('requests are separate from outcomes; stock and money are applied once and never beyond what was paid', async () => {
    const { p, customer, orderId, attemptId } = await paidOrder(2, 5_000_000n, 5);
    const methods = await owner.get('/admin/shipping-methods');
    await move(orderId, 'PREPARING');
    await move(orderId, 'READY_TO_SHIP');
    await move(orderId, 'SHIPPED', { shipment: { shippingMethodId: methods.body[0].id, trackingCode: 'TRK-TEST-0001' } });
    await move(orderId, 'DELIVERED');
    expect(await balance(p.id)).toMatchObject({ onHand: 3, reserved: 0 });
    const delivered = await customer.get(`/orders/${orderId}`);
    expect(delivered.body.shipment).toMatchObject({ trackingCode: 'TRK-TEST-0001' });
    const line = delivered.body.lines[0];
    expect(line.returnableQuantity).toBe(2);

    // A return names items; quantities are validated.
    expect((await customer.post('/returns', { orderId, kind: 'RETURN', reason: 'سایز مناسب نبود', items: [] })).body.error.code).toBe('ITEMS_REQUIRED');
    expect((await customer.post('/returns', { orderId, kind: 'RETURN', reason: 'سایز مناسب نبود', items: [{ orderItemId: line.id, quantity: 3 }] })).body.error.code).toBe('INVALID_RETURN_QUANTITY');
    const request = await customer.post('/returns', { orderId, kind: 'RETURN', reason: 'یک عدد اضافه سفارش داده شد', items: [{ orderItemId: line.id, quantity: 1 }] });
    expect(request.status).toBe(201);
    expect(request.body.status).toBe('REQUESTED');
    expect((await customer.post('/returns', { orderId, kind: 'RETURN', reason: 'درخواست دوباره', items: [{ orderItemId: line.id, quantity: 1 }] })).body.error.code).toBe('REQUEST_OPEN');
    // A request alone changes neither stock nor money.
    expect(await balance(p.id)).toMatchObject({ onHand: 3 });
    expect((await customer.get(`/orders/${orderId}`)).body.paymentStatus).toBe('PAID');

    expect((await owner.post(`/admin/returns/${request.body.id}/decision`, { decision: 'APPROVED', reason: 'مطابق سیاست مرجوعی' })).status).toBe(201);
    const staffRow = (await owner.get('/admin/returns')).body.find((r: any) => r.id === request.body.id);
    const receive = { items: [{ itemId: staffRow.items[0].id, receivedQuantity: 1, restockQuantity: 1, inspectionNote: 'سالم و قابل فروش' }] };
    expect((await owner.post(`/admin/returns/${request.body.id}/receive`, receive)).status).toBe(201);
    expect(await balance(p.id)).toMatchObject({ onHand: 4 });
    // Receiving the same items again is refused: no double restock.
    expect((await owner.post(`/admin/returns/${request.body.id}/receive`, receive)).status).toBe(409);
    expect(await balance(p.id)).toMatchObject({ onHand: 4 });
    expect(await s.prisma.inventoryMovement.count({ where: { productId: p.id, type: 'RETURN_RESTOCK' } })).toBe(1);
    expect((await customer.get(`/orders/${orderId}`)).body.lines[0].returnableQuantity).toBe(1);

    // Refunds: capped by the captured amount; requested ≠ executed.
    const captured = (await s.prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } })).amountIrrMinor as bigint;
    const over = await refund(attemptId, captured + 1n);
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('REFUND_EXCEEDS_REMAINING');
    // The staff list carries what is needed to settle the return on the same screen.
    const settled = (await owner.get('/admin/returns')).body.find((r: any) => r.id === request.body.id);
    expect(settled).toMatchObject({ status: 'ITEMS_RECEIVED', payment: { id: attemptId }, suggestedRefund: { currency: 'IRR', amountMinor: '5000000' } });
    expect(settled.items[0]).toMatchObject({ quantity: 1, receivedQuantity: 1, unitPrice: { currency: 'IRR', amountMinor: '5000000' } });
    expect(typeof settled.items[0].name).toBe('string');
    // Staff name the payment by its reference; giving both or neither identifier is refused.
    const byReference = (extra: Record<string, unknown>) =>
      owner.post('/admin/refunds', { amountIrr: '5000000', reason: 'استرداد مرجوعی', returnRequestId: request.body.id, ...extra }, { 'idempotency-key': idemKey() });
    expect((await byReference({})).status).toBe(400);
    expect((await byReference({ paymentReference: settled.payment.reference, paymentAttemptId: attemptId })).status).toBe(400);
    const r1 = await byReference({ paymentReference: settled.payment.reference.toLowerCase() });
    expect(r1.status, JSON.stringify(r1.body)).toBe(201);
    expect(r1.body.status).toBe('REQUESTED');
    expect((await customer.get(`/orders/${orderId}`)).body.paymentStatus).toBe('PAID');
    expect((await owner.post(`/admin/refunds/${r1.body.id}/decision`, { decision: 'APPROVED' })).status).toBe(201);
    expect((await owner.post(`/admin/refunds/${r1.body.id}/execute`, {})).body.status).toBe('SUCCEEDED');
    expect((await customer.get(`/orders/${orderId}`)).body.paymentStatus).toBe('PARTIALLY_REFUNDED');

    // A failed refund is recorded as failed (not "done") and can be retried.
    const realRefund = simulator.refund.bind(simulator);
    simulator.refund = async () => {
      throw new Error('bank refund endpoint unreachable (test double)');
    };
    const r2 = await refund(attemptId, 3_000_000n);
    await owner.post(`/admin/refunds/${r2.body.id}/decision`, { decision: 'APPROVED' });
    expect((await owner.post(`/admin/refunds/${r2.body.id}/execute`, {})).body.status).toBe('FAILED');
    expect((await customer.get(`/orders/${orderId}`)).body.paymentStatus).toBe('PARTIALLY_REFUNDED');
    simulator.refund = realRefund;
    expect((await owner.post(`/admin/refunds/${r2.body.id}/execute`, {})).body.status).toBe('SUCCEEDED');

    // Remaining amount: one refund fails, another is approved for the same money, the failed one is retried.
    const remaining = captured - 8_000_000n;
    simulator.refund = async () => {
      throw new Error('bank refund endpoint unreachable (test double)');
    };
    const r3 = await refund(attemptId, remaining);
    await owner.post(`/admin/refunds/${r3.body.id}/decision`, { decision: 'APPROVED' });
    expect((await owner.post(`/admin/refunds/${r3.body.id}/execute`, {})).body.status).toBe('FAILED');
    simulator.refund = realRefund;
    const r4 = await refund(attemptId, remaining);
    await owner.post(`/admin/refunds/${r4.body.id}/decision`, { decision: 'APPROVED' });
    expect((await owner.post(`/admin/refunds/${r4.body.id}/execute`, {})).body.status).toBe('SUCCEEDED');
    expect((await customer.get(`/orders/${orderId}`)).body.paymentStatus).toBe('REFUNDED');
    const retryOld = await owner.post(`/admin/refunds/${r3.body.id}/execute`, {});
    expect(retryOld.status).toBe(409);
    expect(retryOld.body.error.code).toBe('REFUND_EXCEEDS_REMAINING');
    expect((await s.prisma.refund.findUniqueOrThrow({ where: { id: r3.body.id } })).status).toBe('FAILED');
    expect((await owner.post(`/admin/refunds/${r3.body.id}/decision`, { decision: 'REJECTED', reason: 'با استرداد دیگری پرداخت شد' })).status).toBe(201);
    const succeeded = await s.prisma.refund.aggregate({ where: { paymentAttemptId: attemptId, status: 'SUCCEEDED' }, _sum: { amountIrrMinor: true } });
    expect(succeeded._sum.amountIrrMinor).toBe(captured);
    // A payment that never succeeded cannot be refunded.
    const failedAttempt = await s.prisma.paymentAttempt.findFirst({ where: { status: 'FAILED' } });
    if (failedAttempt) expect((await refund(failedAttempt.id, 1n)).body.error.code).toBe('PAYMENT_NOT_CAPTURED');
  });

  it('cancelling a paid order: request first, then the decision; refund case opened; stock back only after a recorded check', async () => {
    const { p, customer, orderId, attemptId } = await paidOrder(1, 9_000_000n, 2);
    expect(await balance(p.id)).toMatchObject({ onHand: 1, reserved: 0 });
    const request = await customer.post('/returns', { orderId, kind: 'CANCEL', reason: 'دیگر نیاز ندارم' });
    expect(request.status).toBe(201);
    expect((await customer.get(`/orders/${orderId}`)).body.status).toBe('CONFIRMED'); // a request is not the cancellation
    await owner.post(`/admin/returns/${request.body.id}/decision`, { decision: 'APPROVED', reason: 'قبل از ارسال' });
    await move(orderId, 'CANCELLED', { reason: 'لغو به درخواست مشتری' });
    const cases = await owner.get('/payments/admin/cases');
    expect(cases.body.find((c: any) => c.subjectId === orderId)).toMatchObject({ kind: 'UNFULFILLABLE_AFTER_PAYMENT', status: 'OPEN' });
    // Goods never left: staff count them back in once, with a reason.
    const detail = await owner.get(`/admin/products/${p.id}`);
    expect((await owner.post('/admin/inventory/adjust', { productId: p.id, newOnHand: 2, reason: 'RETURN_RESTOCK', note: `لغو سفارش ${orderId.slice(0, 8)}`, expectedVersion: detail.body.inventory.version })).status).toBe(201);
    expect(await balance(p.id)).toMatchObject({ onHand: 2, reserved: 0 });
    const attempt = await s.prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    const full = await refund(attemptId, attempt.amountIrrMinor as bigint);
    await owner.post(`/admin/refunds/${full.body.id}/decision`, { decision: 'APPROVED' });
    expect((await owner.post(`/admin/refunds/${full.body.id}/execute`, {})).body.status).toBe('SUCCEEDED');
    expect((await customer.get(`/orders/${orderId}`)).body).toMatchObject({ status: 'CANCELLED', paymentStatus: 'REFUNDED' });
    const mine = await customer.get('/returns');
    expect(mine.body.find((r: any) => r.id === request.body.id)).toMatchObject({ kind: 'CANCEL', status: 'APPROVED' });
  });
});
