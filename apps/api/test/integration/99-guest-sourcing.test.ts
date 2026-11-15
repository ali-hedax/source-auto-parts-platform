import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Services, type TestApp, bootApp, idemKey, loginCustomer, pngBytes, services, uniqueMobile } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * «درخواست تأمین قطعه» without signing in (owner, 2026-11-15; same items as the signed-in form): a new number gets a new, unverified
 * customer account; a number with an account files the request there without changing the account;
 * a repeated submit is one request; the trap field, bad numbers and too many submissions are refused.
 * Runs against the throwaway test database (never Production).
 */
let t: TestApp;
let s: Services;
const e164 = (mobile: string) => `+98${mobile.slice(1)}`;
const fa = (mobile: string) => mobile.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);

async function send(c: Client, payload: Record<string, unknown>, files: Array<{ name: string; data: Uint8Array; type: string }> = []) {
  const form = new FormData();
  form.set('payload', JSON.stringify(payload));
  for (const f of files) form.append('files', new Blob([f.data], { type: f.type }), f.name);
  const res = await c.raw('POST', '/sourcing-requests/guest', { form });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}
const item = (over: Record<string, unknown> = {}) => ({ partName: 'چراغ جلو راست', quantity: 1, vehicleBrandText: 'پژو ۲۰۰۸', preference: 'ANY', ...over });
const payload = (over: Record<string, unknown> = {}) => ({ clientRequestId: `guest-${idemKey()}`, items: [item()], ...over });

beforeAll(async () => {
  t = await bootApp();
  s = await services(t);
});
afterAll(async () => {
  await t?.close();
});

describe('guest sourcing request', () => {
  it('a new number: creates an unverified customer account and files the request with its photo', async () => {
    const mobile = uniqueMobile();
    const res = await send(new Client(t), payload({ mobile: fa(mobile), fullName: 'علی آزمایشی', note: 'فوری نیست', deliveryCity: 'قم', items: [item({ vehicleModel: 'تیپ ۲، سال ۱۳۹۸', partCode: '05402068', notes: 'سمت راست' }), item({ partName: 'آینه بغل چپ', quantity: 2 })] }), [
      { name: 'part.png', data: await pngBytes(), type: 'image/png' },
    ]);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(Object.keys(res.body)).toEqual(['reference']);
    const user = await s.prisma.user.findUnique({ where: { mobileE164: e164(mobile) } });
    expect(user).toMatchObject({ kind: 'CUSTOMER', status: 'ACTIVE', mobileVerifiedAt: null, fullName: 'علی آزمایشی' });
    const req = await s.prisma.sourcingRequest.findFirst({ where: { reference: res.body.reference }, include: { items: true } });
    expect(req.customerId).toBe(user.id);
    expect(req.title).toBe('چراغ جلو راست — تیپ ۲، سال ۱۳۹۸');
    expect(req.note).toContain('فوری نیست');
    expect(req.note).toContain('ثبت بدون ورود');
    expect(req.deliveryCity).toBe('قم');
    expect(req.items).toHaveLength(2);
    const first = req.items.find((i: any) => i.partName === 'چراغ جلو راست');
    expect(first).toMatchObject({ vehicleBrandText: 'پژو ۲۰۰۸', vehicleModel: 'تیپ ۲، سال ۱۳۹۸', partCode: '05402068', notes: 'سمت راست' });
    expect(req.items.find((i: any) => i.partName === 'آینه بغل چپ').quantity).toBe(2);
    const files = await s.prisma.attachment.findMany({ where: { subjectId: req.id } });
    expect(files).toHaveLength(1);
  });

  it('a number with an account: the request joins that account, which is left unchanged', async () => {
    const customer = await loginCustomer(t);
    const before = await s.prisma.user.findUnique({ where: { mobileE164: e164(customer.mobile) } });
    const res = await send(new Client(t), payload({ mobile: customer.mobile, fullName: 'نام دیگر', title: 'قطعات پژو', items: [item({ vehicleYear: 2019 })] }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(Object.keys(res.body)).toEqual(['reference']);
    expect(await s.prisma.user.count({ where: { mobileE164: e164(customer.mobile) } })).toBe(1);
    const after = await s.prisma.user.findUnique({ where: { mobileE164: e164(customer.mobile) } });
    expect(after.fullName).toBe(before.fullName);
    const req = await s.prisma.sourcingRequest.findFirst({ where: { reference: res.body.reference }, include: { items: true } });
    expect(req.customerId).toBe(before.id);
    expect(req.items[0].vehicleYear).toBe(2019);
    expect(req.title).toBe('قطعات پژو');
    // The owner of the number sees it after signing in.
    const mine = await customer.get('/sourcing-requests');
    expect(mine.body.map((r: any) => r.reference)).toContain(res.body.reference);
  });

  it('the same submit sent twice is one request', async () => {
    const mobile = uniqueMobile();
    const body = payload({ mobile });
    const first = await send(new Client(t), body);
    const second = await send(new Client(t), body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.reference).toBe(first.body.reference);
    expect(await s.prisma.sourcingRequest.count({ where: { clientRequestId: body.clientRequestId } })).toBe(1);
  });

  it('refuses an item without its vehicle, the trap field and a missing number, and stops a flood of submissions', async () => {
    const noVehicle = await send(new Client(t), payload({ mobile: uniqueMobile(), items: [item({ vehicleBrandText: undefined })] }));
    expect(noVehicle.status).toBe(400);
    const trap = await send(new Client(t), payload({ mobile: uniqueMobile(), website: 'http://spam.example' }));
    expect(trap.status).toBe(400);
    const bad = await send(new Client(t), payload());
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_MOBILE');
    // Five guest submissions per hour from one address (four in the tests above, the missing number counted too): the next is refused.
    const flood = await send(new Client(t), payload({ mobile: uniqueMobile() }));
    expect(flood.status).toBe(429);
    expect(flood.body.error.code).toBe('RATE_LIMITED');
  });

  it('a signed-in customer files it under their own account without a number', async () => {
    const customer = await loginCustomer(t);
    const res = await send(customer, payload());
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const req = await s.prisma.sourcingRequest.findFirst({ where: { reference: res.body.reference } });
    const user = await s.prisma.user.findUnique({ where: { mobileE164: e164(customer.mobile) } });
    expect(req.customerId).toBe(user.id);
    expect(req.note).toBeNull();
  });
});
