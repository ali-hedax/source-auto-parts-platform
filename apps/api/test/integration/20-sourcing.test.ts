import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type Client,
  type Customer,
  type Services,
  type TestApp,
  bootApp,
  drainOutbox,
  idemKey,
  inviteStaff,
  loginCustomer,
  loginOwner,
  pngBytes,
  services,
  simplePdf,
  simulatorPay,
} from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

let t: TestApp;
let s: Services;
let owner: Client;
let termsId: string;
const run = Date.now().toString(36);

beforeAll(async () => {
  t = await bootApp();
  s = await services(t);
  owner = await loginOwner(t);
  const policies = await owner.get('/admin/policies');
  termsId = policies.body.find((p: any) => p.kind === 'TERMS' && p.status === 'PUBLISHED').id;
});
afterAll(async () => {
  await t?.close();
});

async function newRequest(customer: Customer, items: any[], extra: Record<string, unknown> = {}) {
  const res = await customer.post('/sourcing-requests', { title: `درخواست آزمایشی ${run}`, items, clientRequestId: `cr-${idemKey()}`, ...extra });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

const item = (over: Record<string, unknown> = {}) => ({
  description: 'لنت ترمز جلو', quantity: 1, manufacturer: 'سازندهٔ آزمایشی', partType: 'GENUINE', condition: 'NEW', compatibility: 'CONFIRMED',
  availability: 'AVAILABLE', unitPrice: { currency: 'IRR', amountMinor: '10000000' }, leadTime: { min: 2, max: 3, unit: 'DAYS', dayKind: 'CALENDAR' }, ...over,
});

async function quote(requestId: string, items: any[], extra: Record<string, unknown> = {}) {
  const draft = await owner.put(`/admin/sourcing-requests/${requestId}/quote-draft`, { items, costs: [], validityHours: 24, termsPolicyVersionId: termsId, ...extra });
  expect(draft.status, JSON.stringify(draft.body)).toBe(200);
  const sent = await owner.post(`/admin/quotes/${draft.body.versionId}/send`);
  expect(sent.status, JSON.stringify(sent.body)).toBe(201);
  return draft.body as { versionId: string; versionNumber: number; quoteId: string };
}

describe('A03 — request for a brand outside the four initial ones', () => {
  it('free-text brand, a file and the conversation are stored; brands are data, not code', async () => {
    const customer = await loginCustomer(t);
    const upload = await customer.upload('/attachments', { purpose: 'SOURCING_REQUEST' }, [
      { name: 'parts-list.pdf', data: simplePdf('Chery Tiggo 7 parts'), type: 'application/pdf' },
      { name: 'photo.png', data: await pngBytes(), type: 'image/png' },
    ]);
    expect(upload.status).toBe(201);
    expect(upload.body.map((a: any) => a.status)).toEqual(['SCANNING', 'SCANNING']);
    const req = await newRequest(customer, [
      { partName: 'سنسور ABS چرخ جلو', quantity: 2, vehicleBrandText: 'Chery', vehicleModel: 'Tiggo 7', vehicleYear: 2022, preference: 'GENUINE' },
    ], { attachmentIds: upload.body.map((a: any) => a.id), urgency: 'URGENT', note: 'فایل فهرست قطعات پیوست است' });
    expect(req.reference).toMatch(/^[A-Z]{2,4}-/);
    expect(req.status).toBe('SUBMITTED');
    expect(req.items[0]).toMatchObject({ partName: 'سنسور ABS چرخ جلو', vehicleBrand: 'Chery', vehicleModel: 'Tiggo 7', vehicleYear: 2022 });
    // A retried submit (same client id) does not create a second request.
    const again = await customer.post('/sourcing-requests', { title: 'x', items: [{ partName: 'xx', quantity: 1, vehicleBrandText: 'Chery' }], clientRequestId: 'dup-check-0000000001' });
    const again2 = await customer.post('/sourcing-requests', { title: 'x', items: [{ partName: 'xx', quantity: 1, vehicleBrandText: 'Chery' }], clientRequestId: 'dup-check-0000000001' });
    expect(again2.body.id).toBe(again.body.id);

    // Conversation exists with a system message; both sides can write.
    const history = await customer.get(`/conversations/${req.conversationId}/messages`);
    expect(history.body.items[0].sender.kind).toBe('SYSTEM');
    const msg = await customer.post(`/conversations/${req.conversationId}/messages`, { clientMessageId: `m-${idemKey()}`, body: 'سلام، نسخهٔ ۲۰۲۲ است' });
    expect(msg.status).toBe(201);
    const staffView = await owner.get(`/admin/sourcing-requests/${req.id}`);
    expect(staffView.body.items[0].vehicleBrand).toBe('Chery');
    expect(staffView.body.files).toHaveLength(2);
    const reply = await owner.post(`/conversations/${req.conversationId}/messages`, { clientMessageId: `s-${idemKey()}`, body: 'بررسی می‌کنیم.' });
    expect(reply.status).toBe(201);
    expect((await customer.get(`/conversations/${req.conversationId}/messages`)).body.items.map((m: any) => m.body)).toContain('بررسی می‌کنیم.');

    // A brand added by the owner later is immediately usable — nothing is hardcoded.
    const brand = await owner.post('/admin/vehicle-brands', { code: `MVM_${run.toUpperCase()}`.slice(0, 40), nameFa: 'ام‌وی‌ام', nameEn: 'MVM', sortOrder: 50 });
    expect(brand.status).toBe(201);
    const withCode = await newRequest(customer, [{ partName: 'فیلتر هوا', quantity: 1, vehicleBrandCode: brand.body.code }]);
    expect(withCode.items[0].vehicleBrand).toBe('ام‌وی‌ام');
    expect((await customer.get('/catalog/vehicle-brands')).body.map((b: any) => b.code)).toContain(brand.body.code);
    // Neither a code nor a name: refused with a clear reason.
    const none = await customer.post('/sourcing-requests', { title: 'بدون برند', items: [{ partName: 'قطعه', quantity: 1 }], clientRequestId: `cr-${idemKey()}` });
    expect(none.status).toBe(400);
    expect(none.body.error.code).toBe('BRAND_REQUIRED');
    // Files only (no items) is allowed: a short title plus a parts-list file.
    const fileOnly = await customer.upload('/attachments', { purpose: 'SOURCING_REQUEST' }, [{ name: 'list.pdf', data: simplePdf('list'), type: 'application/pdf' }]);
    expect((await customer.post('/sourcing-requests', { title: 'فهرست پیوست', attachmentIds: [fileOnly.body[0].id], clientRequestId: `cr-${idemKey()}` })).status).toBe(201);
  });
});

describe('A13 + A14 — superseded quote versions and a failed payment', () => {
  it('old version accepts no payment and history stays; a failed payment starts nothing and can be retried', async () => {
    const customer = await loginCustomer(t);
    const req = await newRequest(customer, [{ partName: 'دیسک و صفحه', quantity: 1, vehicleBrandText: 'Geely' }]);
    const v1 = await quote(req.id, [item({ unitPrice: { currency: 'IRR', amountMinor: '20000000' } })]);
    const view1 = await customer.get(`/quotes/${v1.versionId}`);
    expect(view1.body).toMatchObject({ status: 'SENT', versionNumber: 1, payable: { allowed: false } });
    const accepted1 = await customer.post('/quote-acceptance', { decision: 'ACCEPT', quoteVersionId: v1.versionId, versionNumber: 1 });
    expect(accepted1.status).toBe(201);
    // Double click on accept: still one procurement order.
    const acceptedAgain = await customer.post('/quote-acceptance', { decision: 'ACCEPT', quoteVersionId: v1.versionId, versionNumber: 1 });
    expect(acceptedAgain.body.procurementId).toBe(accepted1.body.procurementId);
    expect(await s.prisma.procurement.count({ where: { quoteVersionId: v1.versionId } })).toBe(1);

    // Staff replaces the offer before payment → v1 superseded, its unpaid procurement cancelled.
    const v2 = await quote(req.id, [item({ unitPrice: { currency: 'IRR', amountMinor: '18000000' } })]);
    expect(v2.versionNumber).toBe(2);
    const old = await customer.get(`/quotes/${v1.versionId}`);
    expect(old.body.status).toBe('SUPERSEDED');
    expect(old.body.payable.allowed).toBe(false);
    const payOld = await customer.post(`/procurements/${accepted1.body.procurementId}/pay`, {}, { 'idempotency-key': idemKey() });
    expect(payOld.status).toBe(409);
    const acceptOld = await customer.post('/quote-acceptance', { decision: 'ACCEPT', quoteVersionId: v1.versionId, versionNumber: 1 });
    expect(acceptOld.status).toBe(409);
    expect(acceptOld.body.error.code).toBe('QUOTE_NOT_OPEN');
    // Accepting with the wrong version number (not what the customer reviewed) is refused.
    const wrongNumber = await customer.post('/quote-acceptance', { decision: 'ACCEPT', quoteVersionId: v2.versionId, versionNumber: 1 });
    expect(wrongNumber.status).toBe(409);
    const detail = await customer.get(`/sourcing-requests/${req.id}`);
    expect(detail.body.quotes.map((q: any) => [q.versionNumber, q.status]).sort()).toEqual([[1, 'SUPERSEDED'], [2, 'SENT']]);

    // A14: accept v2, the payment fails → nothing starts; a retry is possible.
    const accepted2 = await customer.post('/quote-acceptance', { decision: 'ACCEPT', quoteVersionId: v2.versionId, versionNumber: 2 });
    const procurementId = accepted2.body.procurementId as string;
    const pay1 = await customer.post(`/procurements/${procurementId}/pay`, {}, { 'idempotency-key': idemKey() });
    expect(pay1.status).toBe(201);
    expect(pay1.body.reservationExpiresAt).toBeNull();
    await simulatorPay(customer, pay1.body.redirectUrl, 'FAILED');
    const afterFail = await customer.get(`/procurements/${procurementId}`);
    expect(afterFail.body).toMatchObject({ status: 'AWAITING_PAYMENT', paymentStatus: 'UNPAID' });
    expect(afterFail.body.schedule.promisedReadyAt).toBeNull();
    const pp = await owner.get(`/admin/procurements/${procurementId}`);
    const forced = await owner.post(`/admin/procurements/${procurementId}/transition`, { toState: 'PROCUREMENT_PENDING', version: pp.body.version });
    expect(forced.status).toBe(400);
    expect(forced.body.error.code).toBe('PAYMENT_REQUIRED');
    expect((await customer.get(`/sourcing-requests/${req.id}`)).body.status).toBe('QUOTED');

    const pay2 = await customer.post(`/procurements/${procurementId}/pay`, {}, { 'idempotency-key': idemKey() });
    expect(pay2.status).toBe(201);
    expect(pay2.body.attemptId).not.toBe(pay1.body.attemptId);
    await simulatorPay(customer, pay2.body.redirectUrl, 'SUCCEEDED');
    const paid = await customer.get(`/procurements/${procurementId}`);
    expect(paid.body).toMatchObject({ status: 'PROCUREMENT_PENDING', paymentStatus: 'PAID' });
    expect(paid.body.receipts).toHaveLength(1);
    expect((await customer.get(`/sourcing-requests/${req.id}`)).body.status).toBe('CONVERTED');
    // A paid version can no longer be replaced silently.
    const draft3 = await owner.put(`/admin/sourcing-requests/${req.id}/quote-draft`, { items: [item()], costs: [], validityHours: 24, termsPolicyVersionId: termsId });
    expect(draft3.status).toBe(409);
  });
});

describe('A15 — multi-item offer with different lead times', () => {
  it('one combined shipment time and the sourcing/shipping split are known before payment; dates fixed at verification', async () => {
    const customer = await loginCustomer(t);
    const req = await newRequest(customer, [
      { partName: 'پمپ هیدرولیک', quantity: 1, vehicleBrandCode: 'TOYOTA' },
      { partName: 'شیلنگ', quantity: 2, vehicleBrandCode: 'TOYOTA' },
    ]);
    const detail = await owner.get(`/admin/sourcing-requests/${req.id}`);
    const [i1, i2] = detail.body.items;
    const v = await quote(req.id, [
      item({ sourcingItemId: i1.id, description: 'پمپ هیدرولیک فرمان', leadTime: { min: 5, max: 7, unit: 'DAYS', dayKind: 'CALENDAR' }, unitPrice: { currency: 'AED', amountMinor: '45000' } }),
      item({ sourcingItemId: i2.id, description: 'شیلنگ فشار قوی', quantity: 2, leadTime: { min: 48, max: 48, unit: 'HOURS', dayKind: 'CALENDAR' }, unitPrice: { currency: 'IRR', amountMinor: '3500000' } }),
      item({ description: 'مخزن روغن (موجود نیست)', availability: 'UNAVAILABLE', unitPrice: { currency: 'IRR', amountMinor: '1' } }),
    ], {
      shippingLeadTime: { min: 1, max: 2, unit: 'DAYS', dayKind: 'CALENDAR' },
      costs: [{ code: 'SHIPPING', label: 'هزینهٔ حمل', amount: { currency: 'IRR', amountMinor: '2000000' } }],
      leadTimeWording: 'ESTIMATE',
    });
    const view = await customer.get(`/quotes/${v.versionId}`);
    expect(view.body.schedule).toMatchObject({ origin: 'PAYMENT_VERIFIED', wording: 'ESTIMATE', readyToShip: { minDays: 5, maxDays: 7 }, shipping: { min: 1, max: 2, unit: 'DAYS' } });
    expect(view.body.schedule.governingItemIds).toEqual([view.body.items[0].id]);
    const unavailable = view.body.items.find((x: any) => x.availability === 'UNAVAILABLE');
    expect(unavailable).toMatchObject({ included: false, lineTotalIrr: null });
    // Payable = available items (AED converted at the recorded rate) + shipping; reference AED shown separately.
    const rate = BigInt(view.body.fx.irrPerAed.split('.')[0]);
    const expected = (45_000n * rate) / 100n + 2n * 3_500_000n + 2_000_000n;
    expect(BigInt(view.body.totals.totalPayableIrr.amountMinor)).toBe(expected);
    expect(view.body.totals.referenceTotalAed.currency).toBe('AED');

    const accepted = await customer.post('/quote-acceptance', { decision: 'ACCEPT', quoteVersionId: v.versionId, versionNumber: 1 });
    const pay = await customer.post(`/procurements/${accepted.body.procurementId}/pay`, {}, { 'idempotency-key': idemKey() });
    await simulatorPay(customer, pay.body.redirectUrl, 'SUCCEEDED');
    const proc = await s.prisma.procurement.findUniqueOrThrow({ where: { id: accepted.body.procurementId } });
    const paidAt = (proc.paidAt as Date).getTime();
    const day = 86_400_000;
    expect((proc.promisedReadyAt as Date).getTime() - paidAt).toBe(7 * day);
    expect((proc.promisedDeliveryAt as Date).getTime() - paidAt).toBe(9 * day);
    expect(Math.abs(paidAt - Date.now())).toBeLessThan(60_000);

    // A later delay keeps the original promise and records a reason the customer can see.
    const later = new Date(paidAt + 10 * day).toISOString();
    expect((await owner.post(`/admin/procurements/${proc.id}/estimate`, { field: 'READY', newEstimate: later, reason: 'تأخیر تأمین‌کننده در ارسال' })).status).toBe(201);
    const after = await customer.get(`/procurements/${proc.id}`);
    expect(after.body.schedule).toMatchObject({ promisedReadyAt: (proc.promisedReadyAt as Date).toISOString(), currentReadyEstimate: later, changeReason: 'تأخیر تأمین‌کننده در ارسال' });
    await drainOutbox(s, ['attachment.scan']);
  });
});

describe('A31 — quote documents: no internal data, both languages, right people only', () => {
  it('customer projection and documents exclude internal cost and notes; FA/EN PDFs download only for allowed users', async () => {
    const customer = await loginCustomer(t);
    const req = await newRequest(customer, [{ partName: 'رادیاتور', quantity: 1, vehicleBrandText: 'Dongfeng' }]);
    expect((await owner.post(`/conversations/${req.conversationId}/notes`, { body: 'یادداشت داخلی: حاشیهٔ سود INTERNAL-NOTE-MARKER' })).status).toBe(201);
    const v = await quote(req.id, [item({ description: 'رادیاتور آب', unitPrice: { currency: 'IRR', amountMinor: '12345678' }, internalCost: { currency: 'IRR', amountMinor: '7777777' } })]);
    expect(await s.prisma.outboxEvent.count({ where: { type: 'quote.pdf.render', aggregateId: v.versionId } })).toBe(1);

    const view = await customer.get(`/quotes/${v.versionId}`);
    const json = JSON.stringify(view.body);
    for (const secret of ['7777777', 'INTERNAL-NOTE-MARKER', 'internalCost']) expect(json).not.toContain(secret);
    expect(JSON.stringify((await owner.get(`/admin/quotes/${v.versionId}`)).body.internalCosts)).toContain('7777777'); // staff with costs.read only

    // The document service belongs to the worker process; built here from the app's own instances.
    const { QuoteDocumentService } = await import('../../dist/modules/sourcing/quote-document.js');
    const { STORAGE } = await import('../../dist/common/storage/storage.js');
    const docs: any = new QuoteDocumentService(s.prisma, s.quotes, t.get<any>(STORAGE));
    for (const locale of ['fa', 'en'] as const) {
      const loaded = await docs.load(v.versionId, locale);
      const html: string = docs.html(loaded.view, loaded.customerName, '', locale);
      expect(html).toContain(`lang="${locale}" dir="${locale === 'fa' ? 'rtl' : 'ltr'}"`);
      expect(html).toContain(locale === 'fa' ? '۱۲٬۳۴۵٬۶۷۸ ریال' : 'IRR 12,345,678');
      for (const secret of ['7777777', '۷٬۷۷۷٬۷۷۷', 'INTERNAL-NOTE-MARKER']) expect(html).not.toContain(secret);
    }
    // Rendered bytes are produced by the worker (apps/worker/test/quote-pdf.test.ts); stored here as stand-ins.
    const faId = await docs.save(v.versionId, simplePdf('fa'), 'fa');
    const enId = await docs.save(v.versionId, simplePdf('en'), 'en');
    expect(await docs.save(v.versionId, simplePdf('again'), 'fa')).toBe(faId); // idempotent per language
    const after = await customer.get(`/quotes/${v.versionId}`);
    expect(after.body.pdfUrls).toEqual({ fa: `/api/v1/attachments/${faId}/download`, en: `/api/v1/attachments/${enId}/download` });
    expect(after.body.pdfUrl).toBe(after.body.pdfUrls.fa);
    await customer.put('/account/profile', { fullName: 'Test Customer', preferredLocale: 'en' });
    expect((await customer.get(`/quotes/${v.versionId}`)).body.pdfUrl).toBe(after.body.pdfUrls.en);

    for (const id of [faId, enId]) {
      const res = await customer.raw('GET', `/attachments/${id}/download`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename\*=UTF-8''.*\.pdf$/);
      expect((await owner.raw('GET', `/attachments/${id}/download`)).status).toBe(200);
    }
    const stranger = await loginCustomer(t);
    expect((await stranger.raw('GET', `/attachments/${enId}/download`)).status).toBe(404);
  });
});

describe('§5.3 — quotes list in the panel', () => {
  it('lists versions newest first with the current one marked, filters by status, and refuses roles without quote rights', async () => {
    const customer = await loginCustomer(t);
    const req = await newRequest(customer, [{ partName: 'چراغ عقب', quantity: 1, vehicleBrandText: 'Chery' }]);
    const v1 = await quote(req.id, [item()]);
    const v2 = await quote(req.id, [item({ unitPrice: { currency: 'IRR', amountMinor: '9000000' } })]);

    const list = await owner.get('/admin/quotes');
    expect(list.status).toBe(200);
    const mine = list.body.filter((r: any) => r.request.id === req.id);
    expect(mine.map((r: any) => [r.versionNumber, r.status, r.isCurrent])).toEqual([[2, 'SENT', true], [1, 'SUPERSEDED', false]]);
    expect(mine[0]).toMatchObject({ versionId: v2.versionId, request: { reference: req.reference }, totalPayableIrr: { currency: 'IRR', amountMinor: '9000000' } });

    const superseded = await owner.get('/admin/quotes?status=SUPERSEDED');
    expect(superseded.body.some((r: any) => r.versionId === v1.versionId)).toBe(true);
    expect(superseded.body.some((r: any) => r.versionId === v2.versionId)).toBe(false);
    expect((await owner.get('/admin/quotes?status=NOPE')).status).toBe(400);

    const support = await inviteStaff(t, owner, 'support');
    expect((await support.get('/admin/quotes')).status).toBe(403);
  });
});
