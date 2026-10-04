import ExcelJS from 'exceljs';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type Client,
  type Customer,
  type Services,
  type Staff,
  type TestApp,
  addAddress,
  addToCart,
  bootApp,
  checkout,
  createProduct,
  drainOutbox,
  emitAck,
  idemKey,
  inviteStaff,
  loginCustomer,
  loginOwner,
  minimalDocx,
  pngBytes,
  services,
  simplePdf,
  waitForEvent,
} from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

let t: TestApp;
let s: Services;
let owner: Client;
let termsId: string;
const sockets: Socket[] = [];
const run = Date.now().toString(36);

beforeAll(async () => {
  t = await bootApp();
  s = await services(t);
  owner = await loginOwner(t);
  termsId = (await owner.get('/admin/policies')).body.find((p: any) => p.kind === 'TERMS' && p.status === 'PUBLISHED').id;
});
afterAll(async () => {
  for (const so of sockets) so.disconnect();
  await t?.close();
});

async function connect(c: Client): Promise<Socket> {
  const so = await c.socket();
  sockets.push(so);
  return so;
}

async function sourcingRequest(customer: Customer) {
  const res = await customer.post('/sourcing-requests', {
    title: `درخواست چت ${run}`, items: [{ partName: 'چراغ عقب', quantity: 1, vehicleBrandText: 'KMC' }], clientRequestId: `cr-${idemKey()}`,
  });
  expect(res.status).toBe(201);
  return res.body as { id: string; conversationId: string };
}

const privateFiles = () => {
  const dir = path.join(process.env.LOCAL_STORAGE_DIR as string, 'private');
  const out: string[] = [];
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name));
      else out.push(path.join(d, e.name));
    }
  };
  walk(dir);
  return out;
};

describe('A21 — valid PDF, Word, Excel and photo', () => {
  it('stored privately, status visible, downloadable only by the parties allowed to see the conversation', async () => {
    const customer = await loginCustomer(t);
    const req = await sourcingRequest(customer);
    const support = await inviteStaff(t, owner, 'support');
    const otherSupport = await inviteStaff(t, owner, 'support');
    expect((await owner.put(`/admin/sourcing-requests/${req.id}/assignee`, { assigneeId: support.userId })).status).toBe(200);

    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('parts').addRow(['sku', 'qty']);
    const xlsx = Buffer.from(await wb.xlsx.writeBuffer());
    const jpeg = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#3182CE' } }).jpeg().withExif({ IFD0: { Copyright: 'EXIF-PRIVATE-MARKER' } }).toBuffer();
    expect(jpeg.includes('EXIF-PRIVATE-MARKER')).toBe(true);
    const up = await customer.upload('/attachments', { purpose: 'MESSAGE' }, [
      { name: 'فاکتور قبلی.pdf', data: simplePdf(), type: 'application/pdf' },
      { name: 'list.docx', data: minimalDocx() },
      { name: 'parts.xlsx', data: xlsx },
      { name: 'photo.jpg', data: jpeg, type: 'image/jpeg' },
    ]);
    expect(up.status).toBe(201);
    expect(up.body.map((a: any) => a.status)).toEqual(['SCANNING', 'SCANNING', 'SCANNING', 'SCANNING']);
    expect(up.body.every((a: any) => a.downloadUrl === null && !('storageKey' in a))).toBe(true);
    const [pdf, docx, , photo] = up.body;
    // Quarantined: not downloadable before the scan, even by the owner of the file.
    expect((await customer.raw('GET', `/attachments/${pdf.id}/download`)).status).toBe(409);

    const msg = await customer.post(`/conversations/${req.conversationId}/messages`, { clientMessageId: `f-${idemKey()}`, body: 'فایل‌ها پیوست شد', attachmentIds: up.body.map((a: any) => a.id) });
    expect(msg.status).toBe(201);
    expect(msg.body.attachments.map((a: any) => a.status)).toEqual(['SCANNING', 'SCANNING', 'SCANNING', 'SCANNING']);

    expect(await drainOutbox(s, ['attachment.scan'])).toBeGreaterThanOrEqual(4);
    const views = await Promise.all(up.body.map((a: any) => customer.get(`/attachments/${a.id}`)));
    expect(views.map((v) => v.body.status)).toEqual(['READY', 'READY', 'READY', 'READY']);
    expect(views[3]?.body.mime).toBe('image/webp');

    // Customer (owner of the conversation), assigned support and an all-access manager can download.
    for (const who of [customer, support, owner] as Client[]) {
      const res = await who.raw('GET', `/attachments/${pdf.id}/download`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/octet-stream');
      expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename\*=UTF-8''/);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('content-security-policy')).toContain('sandbox');
      expect(res.headers.get('cache-control')).toBe('private, no-store');
      expect(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
    }
    const img = await support.raw('GET', `/attachments/${photo.id}/download`);
    expect(img.headers.get('content-type')).toBe('image/webp');
    const imgBytes = Buffer.from(await img.arrayBuffer());
    expect(imgBytes.includes('EXIF-PRIVATE-MARKER')).toBe(false); // re-encoded, metadata stripped
    expect((await support.raw('GET', `/attachments/${docx.id}/download`)).headers.get('content-disposition')).toMatch(/^attachment/);

    // Not allowed: another customer, an unassigned support agent.
    const stranger = await loginCustomer(t);
    for (const who of [stranger, otherSupport] as Client[]) {
      expect((await who.get(`/attachments/${pdf.id}`)).status).toBe(404);
      expect((await who.raw('GET', `/attachments/${pdf.id}/download`)).status).toBe(404);
    }
    // Bytes live only in the private store.
    expect(privateFiles().length).toBeGreaterThanOrEqual(4);
    expect(existsSync(path.join(process.env.LOCAL_STORAGE_DIR as string, 'public', 'att'))).toBe(false);
  });
});

describe('A20 — fake extension, oversize files and a positive scan', () => {
  it('suspicious content is rejected at upload with a reason', async () => {
    const customer = await loginCustomer(t);
    const png = await pngBytes();
    const up = await customer.upload('/attachments', { purpose: 'MESSAGE' }, [
      { name: 'invoice.pdf', data: png },
      { name: 'setup.exe', data: Buffer.from('MZ\x90\x00binary') },
      { name: 'page.html', data: Buffer.from('<html><script>alert(1)</script></html>') },
      { name: 'report.pdf', data: Buffer.concat([Buffer.from('MZ'), simplePdf()]) },
      { name: 'active.pdf', data: Buffer.from('%PDF-1.4\n1 0 obj<</S/JavaScript/JS(app.alert(1))>>endobj\n%%EOF') },
      { name: 'macro.docx', data: minimalDocx([{ name: 'word/vbaProject.bin', data: 'VBA' }]) },
    ]);
    expect(up.status).toBe(201);
    expect(up.body.map((a: any) => [a.status, a.rejectReason])).toEqual([
      ['REJECTED', 'CONTENT_MISMATCH'],
      ['REJECTED', 'EXTENSION_NOT_ALLOWED'],
      ['REJECTED', 'EXTENSION_NOT_ALLOWED'],
      ['REJECTED', 'EXECUTABLE_CONTENT'],
      ['REJECTED', 'PDF_ACTIVE_CONTENT'],
      ['REJECTED', 'MACRO_CONTENT'],
    ]);
    for (const a of up.body) expect((await customer.raw('GET', `/attachments/${a.id}/download`)).status).toBe(409);
    // Rejected files cannot be attached to anything.
    const req = await sourcingRequest(customer);
    const attach = await customer.post(`/conversations/${req.conversationId}/messages`, { clientMessageId: `r-${idemKey()}`, body: 'x', attachmentIds: [up.body[0].id] });
    expect(attach.status).toBe(400);
    expect(attach.body.error.code).toBe('ATTACHMENT_INVALID');
  });

  it('size limits: a single file over 20 MB and a batch over 50 MB are refused without storing anything', async () => {
    const customer = await loginCustomer(t);
    const before = await s.prisma.attachment.count();
    const big = await customer.upload('/attachments', { purpose: 'MESSAGE' }, [{ name: 'big.pdf', data: Buffer.concat([simplePdf(), Buffer.alloc(21 * 1024 * 1024, 32)]) }]);
    expect(big.status).toBe(413);
    const chunk = Buffer.concat([simplePdf(), Buffer.alloc(17 * 1024 * 1024, 32)]);
    const batch = await customer.upload('/attachments', { purpose: 'MESSAGE' }, [1, 2, 3].map((n) => ({ name: `part-${n}.pdf`, data: chunk })));
    expect(batch.status).toBe(400);
    expect(await s.prisma.attachment.count()).toBe(before);
  });

  it('a file the scanner flags is never downloadable and its bytes are removed', async () => {
    const original = s.scanner.scan.bind(s.scanner);
    // Test double standing in for ClamAV (not installed here): flags a marker string.
    s.scanner.scan = async (bytes: Buffer) => (bytes.includes('HEDAX-TEST-MALWARE-MARKER')
      ? { clean: false, engine: 'test-double', signature: 'Hedax.Test.Marker' }
      : { clean: true, engine: 'test-double', signature: null });
    try {
      const customer = await loginCustomer(t);
      const up = await customer.upload('/attachments', { purpose: 'MESSAGE' }, [{ name: 'quote.pdf', data: simplePdf('HEDAX-TEST-MALWARE-MARKER') }]);
      const id = up.body[0].id as string;
      expect(up.body[0].status).toBe('SCANNING');
      const row = await s.prisma.attachment.findUniqueOrThrow({ where: { id } });
      const stored = path.join(process.env.LOCAL_STORAGE_DIR as string, 'private', row.storageKey);
      expect(existsSync(stored)).toBe(true);
      expect((await customer.raw('GET', `/attachments/${id}/download`)).status).toBe(409);
      await drainOutbox(s, ['attachment.scan'], id);
      const after = await customer.get(`/attachments/${id}`);
      expect(after.body).toMatchObject({ status: 'REJECTED', rejectReason: 'MALWARE_DETECTED', downloadUrl: null });
      expect(existsSync(stored)).toBe(false);
      // Staff cannot reach a file that is not linked to anything they may see.
      expect((await owner.raw('GET', `/attachments/${id}/download`)).status).toBe(404);
    } finally {
      s.scanner.scan = original;
    }
  });
});

describe('A16 — chat disconnects while sending', () => {
  it('an acknowledged message is neither lost nor duplicated; history resyncs after reconnect', async () => {
    const customer = await loginCustomer(t);
    const started = await customer.post('/conversations/support', { subject: 'پیگیری سفارش', body: 'سلام', clientMessageId: `sup-${idemKey()}` });
    expect(started.status).toBe(201);
    const conversationId = started.body.conversationId as string;

    const cs = await connect(customer);
    const os = await connect(owner);
    expect(await emitAck(cs, 'conversation:join', { conversationId })).toEqual({ ok: true });
    expect(await emitAck(os, 'conversation:join', { conversationId })).toEqual({ ok: true });

    const clientMessageId = `cm-${idemKey()}`;
    const live = waitForEvent(os, 'message:new');
    const ack = await emitAck(cs, 'message:send', { conversationId, clientMessageId, body: 'قطعه را کی ارسال می‌کنید؟' });
    expect(ack.ok).toBe(true);
    // The ack is sent only after the message is stored.
    expect(await s.prisma.message.count({ where: { id: ack.message.id } })).toBe(1);
    expect((await live).id).toBe(ack.message.id);

    // The ack was "lost": the client retries over REST and over a new socket with the same client id.
    const rest = await customer.post(`/conversations/${conversationId}/messages`, { clientMessageId, body: 'قطعه را کی ارسال می‌کنید؟' });
    expect(rest.body.id).toBe(ack.message.id);
    cs.disconnect();
    const reply1 = await owner.post(`/conversations/${conversationId}/messages`, { clientMessageId: `o1-${idemKey()}`, body: 'فردا ارسال می‌شود.' });
    const reply2 = await owner.post(`/conversations/${conversationId}/messages`, { clientMessageId: `o2-${idemKey()}`, body: 'کد رهگیری را هم می‌فرستیم.' });
    const cs2 = await connect(customer);
    expect((await emitAck(cs2, 'conversation:join', { conversationId })).ok).toBe(true);
    const retry = await emitAck(cs2, 'message:send', { conversationId, clientMessageId, body: 'قطعه را کی ارسال می‌کنید؟' });
    expect(retry.message.id).toBe(ack.message.id);
    const resync = await emitAck(cs2, 'conversation:resync', { conversationId, afterMessageId: ack.message.id });
    expect(resync.ok).toBe(true);
    expect(resync.items.map((m: any) => m.id)).toEqual([reply1.body.id, reply2.body.id]);
    expect(await s.prisma.message.count({ where: { conversationId, clientMessageId } })).toBe(1);
    const history = await customer.get(`/conversations/${conversationId}/messages`);
    expect(history.body.items.filter((m: any) => m.id === ack.message.id)).toHaveLength(1);
  });
});

describe('A17 — a second customer using the first customer\'s ids', () => {
  it('API and WebSocket refuse every object of another customer', async () => {
    const a = await loginCustomer(t);
    const b = await loginCustomer(t);
    const p = await createProduct(owner, { sku: `A17-${run}`, nameFa: 'قطعهٔ خصوصی آزمایشی', priceIrr: 3_000_000n, onHand: 3 });
    await addToCart(a, p.id, 1);
    const order = await checkout(a, await addAddress(a));
    const req = await sourcingRequest(a);
    const up = await a.upload('/attachments', { purpose: 'SOURCING_REQUEST' }, [{ name: 'a.pdf', data: simplePdf() }]);
    await a.post(`/conversations/${req.conversationId}/messages`, { clientMessageId: `a-${idemKey()}`, body: 'محرمانه', attachmentIds: [up.body[0].id] });
    await drainOutbox(s, ['attachment.scan']);
    const draft = await owner.put(`/admin/sourcing-requests/${req.id}/quote-draft`, {
      items: [{ description: 'چراغ', quantity: 1, partType: 'GENUINE', condition: 'NEW', compatibility: 'CONFIRMED', availability: 'AVAILABLE', unitPrice: { currency: 'IRR', amountMinor: '5000000' }, leadTime: { min: 1, max: 2, unit: 'DAYS', dayKind: 'CALENDAR' } }],
      costs: [], validityHours: 24, termsPolicyVersionId: termsId,
    });
    await owner.post(`/admin/quotes/${draft.body.versionId}/send`);
    const accepted = await a.post('/quote-acceptance', { decision: 'ACCEPT', quoteVersionId: draft.body.versionId, versionNumber: 1 });

    const reads = [
      `/orders/${order.body.orderId}`, `/payments/attempts/${order.body.attemptId}`, `/sourcing-requests/${req.id}`, `/conversations/${req.conversationId}`,
      `/conversations/${req.conversationId}/messages`, `/attachments/${up.body[0].id}`, `/attachments/${up.body[0].id}/download`,
      `/quotes/${draft.body.versionId}`, `/procurements/${accepted.body.procurementId}`,
    ];
    for (const path of reads) expect((await b.get(path)).status, path).toBe(404);
    const writes: Array<[string, unknown, Record<string, string>?]> = [
      [`/conversations/${req.conversationId}/messages`, { clientMessageId: `b-${idemKey()}`, body: 'hi' }],
      [`/orders/${order.body.orderId}/pay`, {}, { 'idempotency-key': idemKey() }],
      [`/procurements/${accepted.body.procurementId}/pay`, {}, { 'idempotency-key': idemKey() }],
      ['/quote-acceptance', { decision: 'REJECT', quoteVersionId: draft.body.versionId, versionNumber: 1 }],
      [`/sourcing-requests/${req.id}/cancel`, { reason: 'تلاش غیرمجاز', version: 0 }],
    ];
    for (const [path, body, headers] of writes) expect((await b.post(path, body, headers)).status, path).toBe(404);
    // Someone else's file cannot be smuggled into one's own message either.
    const own = await sourcingRequest(b);
    const smuggle = await b.post(`/conversations/${own.conversationId}/messages`, { clientMessageId: `s-${idemKey()}`, body: 'x', attachmentIds: [up.body[0].id] });
    expect(smuggle.status).toBe(400);

    const bs = await connect(b);
    expect(await emitAck(bs, 'conversation:join', { conversationId: req.conversationId })).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await emitAck(bs, 'conversation:resync', { conversationId: req.conversationId })).toEqual({ ok: false, code: 'NOT_FOUND' });
    const send = await emitAck(bs, 'message:send', { conversationId: req.conversationId, clientMessageId: `ws-${idemKey()}`, body: 'x' });
    expect(send.ok).toBe(false);
    let leaked = false;
    bs.on('message:new', () => {
      leaked = true;
    });
    await a.post(`/conversations/${req.conversationId}/messages`, { clientMessageId: `a2-${idemKey()}`, body: 'پیام بعدی' });
    await new Promise((r) => setTimeout(r, 500));
    expect(leaked).toBe(false);
  });
});

describe('A18 — support agent attempts price or role changes', () => {
  it('the server refuses; hidden buttons are not the only control', async () => {
    const support = await inviteStaff(t, owner, 'support');
    const p = await createProduct(owner, { sku: `A18-${run}`, nameFa: 'قطعهٔ قیمت‌دار آزمایشی', priceIrr: 2_000_000n, onHand: 2 });
    const detail = await owner.get(`/admin/products/${p.id}`);
    const roles = await owner.get('/admin/roles');
    const ownerRole = roles.body.find((r: any) => r.key === 'owner');
    const me = await owner.get('/me');
    expect((await support.get('/admin/products')).status).toBe(200); // allowed: products.read
    const attempts: Array<[string, string, unknown]> = [
      ['PUT', `/admin/products/${p.id}`, { ...detail.body, basePrice: { currency: 'IRR', amountMinor: '1' } }],
      ['POST', `/admin/products/${p.id}/price-rules`, { customerGroupId: null, minQty: 1, maxQty: null, basePrice: { currency: 'IRR', amountMinor: '1' } }],
      ['POST', '/admin/exchange-rates', { irrPerAed: '1', effectiveFrom: new Date().toISOString() }],
      ['POST', '/admin/inventory/adjust', { productId: p.id, newOnHand: 999, reason: 'CORRECTION', expectedVersion: detail.body.inventory.version }],
      ['POST', '/admin/roles', { key: 'sneaky_role', nameFa: 'نقش', nameEn: 'Role', permissions: ['prices.write'] }],
      ['PUT', `/admin/roles/${ownerRole.id}`, { key: 'owner', nameFa: 'مالک', nameEn: 'Owner', permissions: [] }],
      ['PATCH', `/admin/staff/${support.userId}`, { roleIds: [ownerRole.id] }],
      ['PATCH', `/admin/staff/${me.body.id}`, { suspended: true }],
      ['POST', '/admin/staff/invitations', { email: `x${run}@hedax.test`, fullName: 'نفوذی', roleIds: [ownerRole.id] }],
    ];
    for (const [method, path, body] of attempts) {
      const res = await support.req(method, path, body);
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.error.code).toBe('MISSING_PERMISSION');
    }
    expect((await owner.get(`/admin/products/${p.id}`)).body.basePrice.amountMinor).toBe('2000000');

    // Delegated user management cannot escalate beyond its own permissions or touch owners.
    const custom = await owner.post('/admin/roles', { key: `people_${run}`.slice(0, 40), nameFa: 'مدیر کارکنان', nameEn: 'People admin', permissions: ['dashboard.view', 'users.manage'] });
    expect(custom.status).toBe(201);
    const people = await inviteStaff(t, owner, `people_${run}`.slice(0, 40));
    const finance = roles.body.find((r: any) => r.key === 'finance');
    const escalate = await people.post('/admin/staff/invitations', { email: `f${run}@hedax.test`, fullName: 'مالی جدید', roleIds: [finance.id] });
    expect(escalate.status).toBe(422);
    expect(escalate.body.error.code).toBe('PERMISSION_ESCALATION');
    const makeOwner = await people.post('/admin/staff/invitations', { email: `o${run}@hedax.test`, fullName: 'مالک جدید', roleIds: [ownerRole.id] });
    expect(makeOwner.status).toBe(403);
    expect((await people.patch(`/admin/staff/${me.body.id}`, { suspended: true })).body.error.code).toBe('OWNER_PROTECTED');
    expect((await people.patch(`/admin/staff/${people.userId}`, { roleIds: [finance.id] })).body.error.code).toBe('SELF_EDIT');
    expect((await owner.patch(`/admin/staff/${me.body.id}`, { suspended: true })).body.error.code).toBe('SELF_EDIT');
  });
});

describe('A19 — access removed while a chat connection is open', () => {
  it('unassignment, role change and suspension take effect immediately on sockets and later requests', async () => {
    const customer = await loginCustomer(t);
    const req = await sourcingRequest(customer);
    const agent: Staff = await inviteStaff(t, owner, 'support');
    await owner.put(`/admin/sourcing-requests/${req.id}/assignee`, { assigneeId: agent.userId });
    const so = await connect(agent);
    expect(await emitAck(so, 'conversation:join', { conversationId: req.conversationId })).toEqual({ ok: true });
    const first = waitForEvent(so, 'message:new');
    await customer.post(`/conversations/${req.conversationId}/messages`, { clientMessageId: `c1-${idemKey()}`, body: 'سلام' });
    expect((await first).body).toBe('سلام');

    // 1) Unassigned: the socket leaves the room at once; REST is refused.
    await owner.put(`/admin/sourcing-requests/${req.id}/assignee`, { assigneeId: null });
    let received = false;
    so.on('message:new', () => {
      received = true;
    });
    await customer.post(`/conversations/${req.conversationId}/messages`, { clientMessageId: `c2-${idemKey()}`, body: 'پیام محرمانه' });
    await new Promise((r) => setTimeout(r, 500));
    expect(received).toBe(false);
    expect((await agent.get(`/conversations/${req.conversationId}`)).status).toBe(404);
    expect(await emitAck(so, 'conversation:join', { conversationId: req.conversationId })).toEqual({ ok: false, code: 'NOT_FOUND' });

    // 2) Role changed: sessions end; the open socket is told and disconnected.
    await owner.put(`/admin/sourcing-requests/${req.id}/assignee`, { assigneeId: agent.userId });
    const roles = await owner.get('/admin/roles');
    const catalog = roles.body.find((r: any) => r.key === 'catalog_warehouse');
    const revoked = waitForEvent(so, 'session:revoked');
    const closed = waitForEvent(so, 'disconnect');
    expect((await owner.patch(`/admin/staff/${agent.userId}`, { roleIds: [catalog.id], reason: 'انتقال به انبار' })).status).toBe(200);
    await revoked;
    await closed;
    expect((await agent.get('/me')).status).toBe(401);

    // 3) Suspended: an open socket is cut and signing in again is refused.
    const second = await inviteStaff(t, owner, 'support');
    await owner.put(`/admin/sourcing-requests/${req.id}/assignee`, { assigneeId: second.userId });
    const so2 = await connect(second);
    expect((await emitAck(so2, 'conversation:join', { conversationId: req.conversationId })).ok).toBe(true);
    const cut = waitForEvent(so2, 'disconnect');
    expect((await owner.patch(`/admin/staff/${second.userId}`, { suspended: true, reason: 'آزمون تعلیق' })).status).toBe(200);
    await cut;
    expect((await second.post(`/conversations/${req.conversationId}/messages`, { clientMessageId: `x-${idemKey()}`, body: 'x' })).status).toBe(401);
    const relogin = await second.post('/auth/staff/login', { email: second.email, password: second.password });
    expect(relogin.status).toBe(403);
    expect(relogin.body.error.code).toBe('ACCOUNT_SUSPENDED');
    // A new socket with the old cookie is refused at connect.
    await expect(second.socket().then((x) => {
      sockets.push(x);
      return new Promise((resolve, reject) => {
        x.on('disconnect', () => reject(new Error('disconnected')));
        setTimeout(() => resolve(x.connected), 500);
      });
    })).rejects.toThrow();
  });
});
