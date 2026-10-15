import ExcelJS from 'exceljs';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Client,
  type Services,
  type TestApp,
  bootApp,
  createProduct,
  drainOutbox,
  idemKey,
  inviteStaff,
  loginOwner,
  services,
  zipStore,
} from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

let t: TestApp;
let s: Services;
let owner: Client;
let brandId: string;
const run = Date.now().toString(36).toUpperCase();
const digits = String(Date.now()).slice(-7);
const code = (n: number) => `0${digits}${n}`;

beforeAll(async () => {
  t = await bootApp();
  s = await services(t);
  owner = await loginOwner(t);
  const brand = await owner.post('/admin/manufacturer-brands', { nameFa: `ایساکو آزمایشی ${run}`, nameEn: `Isaco Test ${run}` });
  expect(brand.status, JSON.stringify(brand.body)).toBe(201);
  brandId = brand.body.id;
});
afterAll(async () => {
  await t?.close();
});

type Cell = string | number | null;

/** A supplier price list like the owner's: technical number, title, price in rial; optional title row and a notes sheet first. */
async function priceList(rows: Cell[][], opts: { headers?: string[]; titleRow?: boolean; notesSheet?: boolean } = {}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  if (opts.notesSheet) wb.addWorksheet('توضیحات').addRow(['این فایل نمونهٔ آزمایشی است']);
  const ws = wb.addWorksheet('Sheet1', { views: [{ rightToLeft: true }] });
  if (opts.titleRow) {
    ws.addRow(['لیست قیمت قطعات — آزمایشی']);
    ws.addRow([]);
  }
  ws.addRow(opts.headers ?? ['کد فنی', 'عنوان', '(ریال)قیمت']);
  ws.getColumn(1).numFmt = '@';
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function upload(c: Client, file: Buffer, name = 'price-list.xlsx'): Promise<{ id: string; status: string; rejectReason: string | null }> {
  const up = await c.upload('/attachments', { purpose: 'IMPORT' }, [{ name, data: file }]);
  expect(up.status, JSON.stringify(up.body)).toBe(201);
  const id = up.body[0].id as string;
  await drainOutbox(s, ['attachment.scan'], id);
  const a = await c.get(`/attachments/${id}`);
  return { id, status: a.body.status, rejectReason: a.body.rejectReason };
}

async function inspect(c: Client, file: Buffer) {
  const att = await upload(c, file);
  const res = await c.post('/admin/imports/inspect', { attachmentId: att.id }, { 'idempotency-key': idemKey() });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  await drainOutbox(s, ['import.inspect'], res.body.jobId);
  const job = await c.get(`/admin/imports/${res.body.jobId}`);
  expect(job.body.status).toBe('AWAITING_MAPPING');
  return job.body;
}

const noDefaults = { categoryCode: null, partType: null, condition: null, origin: null, manufacturerBrandId: null, vehicleBrandCodes: [], unit: null, initialOnHand: null };
const settingsFor = (job: any, over: Record<string, unknown> = {}) => ({
  sheet: job.outline.suggestion.sheet, headerRow: job.outline.suggestion.headerRow, columns: job.outline.suggestion.columns,
  mode: 'CREATE_AND_UPDATE', priceUnit: job.outline.suggestion.priceUnit, stockMode: 'SET', defaults: noDefaults, clearWhenEmpty: [], ...over,
});

async function configure(c: Client, jobId: string, settings: unknown) {
  const res = await c.put(`/admin/imports/${jobId}/settings`, settings);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  await drainOutbox(s, ['import.parse'], jobId);
  return (await c.get(`/admin/imports/${jobId}`)).body;
}

async function commit(c: Client, job: any, extra: Record<string, unknown> = {}) {
  const res = await c.post(`/admin/imports/${job.jobId}/commit`, { planChecksum: job.planChecksum, ...extra });
  if (res.status === 201) await drainOutbox(s, ['import.commit'], job.jobId);
  return { res, job: (await c.get(`/admin/imports/${job.jobId}`)).body };
}

const products = (skus: string[]) => s.prisma.product.findMany({ where: { sku: { in: skus } }, include: { basePrice: true, inventory: true } });
const png = (r: number, g: number, b: number) => sharp({ create: { width: 80, height: 60, channels: 3, background: { r, g, b } } }).png().toBuffer();

describe('a supplier price list (technical number, title, price in rial) — mapping, preview, approved rows only', () => {
  let jobId = '';

  it('finds the sheet and header row, reads the unit from the header, writes nothing before approval', async () => {
    const file = await priceList(
      [
        [code(1), 'بلبرینگ چرخ جلو آزمایشی', '200,000,000'],
        [code(2), 'آینه جانبی آزمایشی', '۲۵۰٬۰۰۰٬۰۰۰'],
        [code(3), null, '36,000,000'],
        [code(1), 'ردیف تکراری', '1,000'],
        [Number(`5${digits}`), 'کد ذخیره‌شده به‌صورت عدد', 45_000_000],
      ],
      { titleRow: true, notesSheet: true },
    );
    const job = await inspect(owner, file);
    jobId = job.jobId;
    expect(job.outline.sheets.map((x: any) => x.name)).toEqual(['توضیحات', 'Sheet1']);
    expect(job.outline.suggestion).toEqual({ sheet: 1, headerRow: 3, columns: { technical_number: 0, sku: 0, name_fa: 1, base_price: 2 }, priceUnit: 'IRR' });

    // Without values for the new parts, the preview says exactly what is missing; the catalog is untouched.
    const bare = await configure(owner, jobId, settingsFor(job));
    expect(bare.status).toBe('PREVIEW_READY');
    expect(bare.summary).toMatchObject({ create: 0, error: 5, canCommit: false, canCommitValid: false });
    expect(bare.rows[0].issues.map((i: any) => `${i.column}:${i.code}`)).toEqual(expect.arrayContaining(['category_code:REQUIRED_FOR_NEW', 'part_type:REQUIRED_FOR_NEW', 'condition:REQUIRED_FOR_NEW', 'origin:REQUIRED_FOR_NEW']));
    expect(await products([code(1), code(2), code(3)])).toHaveLength(0);

    const preview = await configure(owner, jobId, settingsFor(job, { defaults: { ...noDefaults, categoryCode: 'BRAKE', partType: 'GENUINE', condition: 'NEW', origin: 'UNKNOWN', manufacturerBrandId: brandId } }));
    expect(preview.summary).toMatchObject({ create: 2, error: 3, canCommit: false, canCommitValid: true, requiredPermissions: ['prices.write', 'products.write'] });
    const byRow = (n: number) => preview.rows.find((r: any) => r.rowNumber === n);
    expect(byRow(4)).toMatchObject({ sku: code(1), action: 'ERROR' });
    expect(byRow(4).issues.map((i: any) => i.code)).toContain('DUPLICATE_SKU_IN_FILE');
    expect(byRow(5)).toMatchObject({ sku: code(2), action: 'CREATE', display: { name: 'آینه جانبی آزمایشی', technicalNumber: code(2), price: { amountMinor: '250000000', currency: 'IRR', fromToman: false } } });
    expect(byRow(6).issues.map((i: any) => `${i.column}:${i.code}`)).toContain('name_fa:REQUIRED');
    expect(byRow(8).issues.map((i: any) => i.code)).toEqual(expect.arrayContaining(['SKU_STORED_AS_NUMBER', 'TECHNICAL_NUMBER_STORED_AS_NUMBER']));
    expect(byRow(8).action).toBe('CREATE');
    const errorsOnly = (await owner.get(`/admin/imports/${jobId}?filter=errors`)).body;
    expect(errorsOnly.rows.map((r: any) => r.rowNumber)).toEqual([4, 6, 7]);
    expect(await products([code(1), code(2), `5${digits}`])).toHaveLength(0);
  });

  it('applies only the rows without errors when chosen explicitly; reports them; a repeated request changes nothing', async () => {
    const job = (await owner.get(`/admin/imports/${jobId}`)).body;
    const refused = await owner.post(`/admin/imports/${jobId}/commit`, { planChecksum: job.planChecksum });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('IMPORT_HAS_ERRORS');

    const done = await commit(owner, job, { skipErrorRows: true });
    expect(done.res.status).toBe(201);
    expect(done.job.status).toBe('COMMITTED');
    expect(done.job.summary.result).toEqual({ created: 2, updated: 0, unchanged: 0, skipped: 3, vehiclesCreated: 0, modelsCreated: 0 });
    const created = await products([code(2), `5${digits}`]);
    expect(created).toHaveLength(2);
    const mirror = created.find((p: any) => p.sku === code(2));
    expect(mirror).toMatchObject({ published: false, oemCodes: [code(2)], manufacturerBrandId: brandId, partType: 'GENUINE', condition: 'NEW', origin: 'UNKNOWN' });
    expect(mirror.basePrice).toMatchObject({ baseCurrency: 'IRR', baseAmountMinor: 250_000_000n });
    expect(mirror.inventory[0].onHand).toBe(0);
    expect(await products([code(1), code(3)])).toHaveLength(0);
    expect(done.job.rows.filter((r: any) => r.applied).map((r: any) => r.rowNumber)).toEqual([5, 8]);
    expect(done.job.rows.find((r: any) => r.rowNumber === 5).productId).toBe(mirror.id);
    const audit = await s.prisma.auditLog.findFirst({ where: { action: 'import.committed', entityId: jobId } });
    expect(audit?.after).toMatchObject({ created: 2, skipped: 3, skipErrorRows: true });

    // Double-clicked or repeated network request, and a re-delivered worker job: no second product or movement.
    const again = await owner.post(`/admin/imports/${jobId}/commit`, { planChecksum: job.planChecksum, skipErrorRows: true });
    expect(again.body.status).toBe('COMMITTED');
    await s.runAsWorker(() => s.imports.commit(jobId));
    expect(await s.prisma.product.count({ where: { sku: code(2) } })).toBe(1);

    // Reports: every issue, and every row with what happened to it.
    const book = async (path: string) => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(await (await owner.raw('GET', path)).arrayBuffer()) as never);
      return wb.worksheets[0]!.getSheetValues().filter(Boolean) as unknown[][];
    };
    const errors = await book(`/admin/imports/${jobId}/errors.xlsx`);
    expect(errors.some((r) => r[1] === 6 && r[7] === 'REQUIRED')).toBe(true);
    const all = await book(`/admin/imports/${jobId}/report.xlsx`);
    expect(all.find((r) => r[1] === 5)?.[6]).toBe('ثبت شد');
    expect(all.find((r) => r[1] === 4)?.[6]).toBe('ثبت نشد');
    expect(all.find((r) => r[1] === 5)?.[2]).toBe(code(2));
  });

  it('the same file again creates nothing; the imported parts are listed by name and technical number', async () => {
    const file = await priceList([[code(2), 'آینه جانبی آزمایشی', '۲۵۰٬۰۰۰٬۰۰۰']]);
    const job = await inspect(owner, file);
    const preview = await configure(owner, job.jobId, settingsFor(job, { defaults: { ...noDefaults, categoryCode: 'BRAKE', partType: 'GENUINE', condition: 'NEW', origin: 'UNKNOWN', manufacturerBrandId: brandId } }));
    expect(preview.summary).toMatchObject({ create: 0, update: 0, unchanged: 1, error: 0, canCommit: false, canCommitValid: false });
    expect((await owner.post(`/admin/imports/${job.jobId}/commit`, { planChecksum: preview.planChecksum })).status).toBe(409);
    expect(await s.prisma.product.count({ where: { sku: code(2) } })).toBe(1);

    const listed = await owner.get(`/admin/imports/${jobId}/products`);
    expect(listed.status).toBe(200);
    expect(listed.body.items.map((p: any) => [p.rowNumber, p.sku, p.technicalNumbers, p.photoCount])).toEqual([[5, code(2), [code(2)], 0], [8, `5${digits}`, [`5${digits}`], 0]]);
    expect(listed.body.items[0]).toMatchObject({ nameFa: 'آینه جانبی آزمایشی', brand: `ایساکو آزمایشی ${run}`, published: false });
    expect((await owner.get(`/admin/imports/${jobId}/products?q=${encodeURIComponent('آینه')}`)).body.items).toHaveLength(1);
    expect((await owner.get(`/admin/imports/${jobId}/products?q=${code(2)}`)).body.items).toHaveLength(1);
    expect((await owner.get(`/admin/imports/${jobId}/products?noPhoto=1`)).body.total).toBe(2);
  });
});

describe('prices and stock: toman only by choice, replace or add, the same added file never added twice by accident', () => {
  it('works on an existing product', async () => {
    const sku = `PS-${run}`;
    const p = await createProduct(owner, { sku, nameFa: 'قطعهٔ قیمت و موجودی', priceIrr: 5_000_000n, onHand: 5 });
    const file = await priceList([[sku, '600,000', '3']], { headers: ['کد کالا', 'قیمت (تومان)', 'موجودی'] });
    const job = await inspect(owner, file);
    expect(job.outline.suggestion).toMatchObject({ headerRow: 1, columns: { sku: 0, base_price: 1, on_hand: 2 }, priceUnit: 'TOMAN' });

    const set = await configure(owner, job.jobId, settingsFor(job, { mode: 'UPDATE_ONLY' }));
    // 600,000 toman = 6,000,000 rial (converted because toman was chosen); the stock count is replaced.
    expect(set.rows[0].changes).toEqual([
      { field: 'basePriceMinor', before: '5000000', after: '6000000', currency: 'IRR' },
      { field: 'onHand', before: '5', after: '3' },
    ]);
    expect(set.summary.requiredPermissions).toEqual(['inventory.adjust', 'prices.write']);

    const add = await configure(owner, job.jobId, settingsFor(job, { mode: 'UPDATE_ONLY', stockMode: 'ADD' }));
    expect(add.rows[0].changes).toContainEqual({ field: 'onHandAdd', before: '5', after: '8', delta: 3 });
    expect(add.rows[0].display.stock).toEqual({ mode: 'ADD', quantity: 3, before: 5, after: 8 });
    expect(add.repeatAdd).toBeNull();
    const applied = await commit(owner, add);
    expect(applied.job.status).toBe('COMMITTED');
    const after = (await products([sku]))[0] as any;
    expect(after.inventory[0].onHand).toBe(8);
    expect(after.basePrice.baseAmountMinor).toBe(6_000_000n);
    expect(await s.prisma.inventoryMovement.count({ where: { productId: p.id, reason: 'IMPORT_ADD', onHandDelta: 3 } })).toBe(1);

    // The very same file again in "add" mode: refused until the person confirms it is a new delivery.
    const repeat = await inspect(owner, file);
    const repeatPreview = await configure(owner, repeat.jobId, settingsFor(repeat, { mode: 'UPDATE_ONLY', stockMode: 'ADD' }));
    expect(repeatPreview.repeatAdd).toMatchObject({ jobId: job.jobId });
    const refused = await owner.post(`/admin/imports/${repeat.jobId}/commit`, { planChecksum: repeatPreview.planChecksum });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('REPEAT_ADD_NOT_CONFIRMED');
    expect(((await products([sku]))[0] as any).inventory[0].onHand).toBe(8);
    const confirmed = await commit(owner, repeatPreview, { confirmRepeatAdd: true });
    expect(confirmed.job.status).toBe('COMMITTED');
    expect(((await products([sku]))[0] as any).inventory[0].onHand).toBe(11);
  });

  it('an empty stock or price cell never clears or zeroes the current value', async () => {
    const sku = `EMPTY-${run}`;
    await createProduct(owner, { sku, nameFa: 'قطعهٔ سلول خالی', priceIrr: 7_000_000n, onHand: 4 });
    const job = await inspect(owner, await priceList([[sku, null, null]], { headers: ['کد کالا', 'قیمت', 'موجودی'] }));
    const preview = await configure(owner, job.jobId, settingsFor(job, { mode: 'UPDATE_ONLY', priceUnit: 'IRR' }));
    expect(preview.summary).toMatchObject({ unchanged: 1, update: 0, error: 0 });
  });
});

describe('staff permissions and refused files', () => {
  it('previewing needs imports.run; applying needs the permissions of what changes', async () => {
    const warehouse = await inviteStaff(t, owner, 'catalog_warehouse'); // imports.run, products.write, inventory.adjust — no prices.write
    const sku = `PERM-${run}`;
    await createProduct(owner, { sku, nameFa: 'قطعهٔ مجوز', priceIrr: 1_000_000n, onHand: 1 });
    const priceJob = await inspect(warehouse, await priceList([[sku, '2,000,000', '2']], { headers: ['کد کالا', 'قیمت', 'موجودی'] }));
    const pricePreview = await configure(warehouse, priceJob.jobId, settingsFor(priceJob, { mode: 'UPDATE_ONLY', priceUnit: 'IRR' }));
    expect(pricePreview.summary.requiredPermissions).toEqual(['inventory.adjust', 'prices.write']);
    const denied = await warehouse.post(`/admin/imports/${priceJob.jobId}/commit`, { planChecksum: pricePreview.planChecksum });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('MISSING_PERMISSION');
    expect(((await products([sku]))[0] as any).basePrice.baseAmountMinor).toBe(1_000_000n);

    const stockJob = await inspect(warehouse, await priceList([[sku, '2']], { headers: ['کد کالا', 'موجودی'] }));
    const stockPreview = await configure(warehouse, stockJob.jobId, settingsFor(stockJob, { mode: 'UPDATE_ONLY' }));
    expect(stockPreview.summary.requiredPermissions).toEqual(['inventory.adjust']);
    expect((await commit(warehouse, stockPreview)).job.status).toBe('COMMITTED');
    expect(((await products([sku]))[0] as any).inventory[0].onHand).toBe(2);
    // Someone else's import is not visible, even with imports.run.
    expect((await warehouse.get(`/admin/imports/${(await inspect(owner, await priceList([[sku, '3']], { headers: ['کد کالا', 'موجودی'] }))).jobId}`)).status).toBe(404);

    const support = await inviteStaff(t, owner, 'support'); // no imports.run
    const up = await support.upload('/attachments', { purpose: 'IMPORT' }, [{ name: 'list.xlsx', data: await priceList([[sku, '1']]) }]);
    expect(up.status).toBe(403);
    expect((await support.get('/admin/imports')).status).toBe(403);
    expect((await support.post('/admin/imports/inspect', { attachmentId: priceJob.jobId }, { 'idempotency-key': idemKey() })).status).toBe(403);
  });

  it('a text file renamed to .xlsx, a Word file and a macro workbook are refused before any import', async () => {
    const fake = await upload(owner, Buffer.from('sku,price\n1,2\n'), 'list.xlsx');
    expect(fake).toMatchObject({ status: 'REJECTED', rejectReason: 'CONTENT_MISMATCH' });
    expect((await owner.post('/admin/imports/inspect', { attachmentId: fake.id }, { 'idempotency-key': idemKey() })).status).toBe(409);
    const macro = zipStore([
      { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
      { name: 'xl/workbook.xml', data: '<?xml version="1.0"?><workbook/>' },
      { name: 'xl/vbaProject.bin', data: 'macro' },
    ]);
    expect(await upload(owner, macro, 'list.xlsx')).toMatchObject({ status: 'REJECTED', rejectReason: 'MACRO_CONTENT' });
  });
});

describe('photos of imported parts', () => {
  it('several photos, one main photo, an order, deletion; checked on the server; the shop shows the main photo', async () => {
    const file = await priceList([[code(9), 'قطعهٔ عکس‌دار آزمایشی', '9,000,000']]);
    const job = await inspect(owner, file);
    const preview = await configure(owner, job.jobId, settingsFor(job, { defaults: { ...noDefaults, categoryCode: 'BRAKE', partType: 'GENUINE', condition: 'NEW', origin: 'DOMESTIC' } }));
    await commit(owner, preview);
    const [item] = (await owner.get(`/admin/imports/${job.jobId}/products`)).body.items;
    const id = item.productId as string;

    // Three photos sent at the same time (as the panel's drag & drop can): exactly one becomes the main photo.
    const images = await Promise.all([png(200, 30, 30), png(30, 200, 30), png(30, 30, 200)]);
    const ups = await Promise.all(images.map((data, i) =>
      owner.upload(`/admin/products/${id}/media`, {}, [{ name: `photo-${i}.png`, data, field: 'file', type: 'image/png' }])));
    expect(ups.map((u) => u.status)).toEqual([201, 201, 201]);
    let media = (await owner.get(`/admin/products/${id}/media`)).body as any[];
    expect(media).toHaveLength(3);
    expect(media.filter((m) => m.isPrimary)).toHaveLength(1);
    expect(new Set(media.map((m) => m.sortOrder)).size).toBe(3);
    expect(media[0].altFa).toBe('قطعهٔ عکس‌دار آزمایشی');

    const before = (await owner.get(`/admin/products/${id}`)).body;
    const bad = await owner.upload(`/admin/products/${id}/media`, {}, [{ name: 'not-a-photo.png', data: Buffer.from('not an image'), field: 'file', type: 'image/png' }]);
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_IMAGE');
    const afterBad = (await owner.get(`/admin/products/${id}`)).body;
    expect([afterBad.nameFa, afterBad.basePrice, afterBad.version, afterBad.media.length]).toEqual([before.nameFa, before.basePrice, before.version, 3]);

    const [m0, m1, m2] = media;
    expect((await owner.patch(`/admin/products/${id}/media/${m2.id}`, { isPrimary: true })).status).toBe(200);
    expect((await owner.put(`/admin/products/${id}/media/order`, { ids: [m2.id, m0.id, m1.id] })).status).toBe(200);
    expect((await owner.put(`/admin/products/${id}/media/order`, { ids: [m2.id, m0.id] })).body.error.code).toBe('MEDIA_ORDER_MISMATCH');
    media = (await owner.get(`/admin/products/${id}/media`)).body;
    expect(media.map((m) => [m.id, m.isPrimary])).toEqual([[m2.id, true], [m0.id, false], [m1.id, false]]);

    // The shop (after publishing) shows the main photo first, then the others in order.
    const fresh = (await owner.get(`/admin/products/${id}`)).body;
    expect((await owner.post(`/admin/products/${id}/publish`, { published: true, version: fresh.version })).status).toBe(201);
    const shopper = new Client(t);
    const page = await shopper.get(`/catalog/products/${fresh.slug}?currency=IRR`);
    expect(page.status).toBe(200);
    expect(page.body.primaryImage.url).toContain(m2.storageKey);
    expect(page.body.images.map((x: any) => x.url)).toEqual([m2, m0, m1].map((m) => expect.stringContaining(m.storageKey)));

    // Deleting the main photo makes the next one the main photo.
    expect((await owner.del(`/admin/products/${id}/media/${m2.id}`)).status).toBe(200);
    media = (await owner.get(`/admin/products/${id}/media`)).body;
    expect(media.map((m) => [m.id, m.isPrimary, m.sortOrder])).toEqual([[m0.id, true, 0], [m1.id, false, 1]]);
    expect((await owner.get(`/admin/imports/${job.jobId}/products`)).body.items[0]).toMatchObject({ photoCount: 2, primaryPhoto: { storageKey: m0.storageKey } });
    expect((await owner.get(`/admin/imports/${job.jobId}/products?noPhoto=1`)).body.total).toBe(0);

    const support = await inviteStaff(t, owner, 'support');
    expect((await support.upload(`/admin/products/${id}/media`, {}, [{ name: 'x.png', data: await png(1, 2, 3), field: 'file', type: 'image/png' }])).status).toBe(403);
  });

  it('a used part from an import stays a draft until a real photo exists (publish rule kept)', async () => {
    const file = await priceList([[code(8), 'قطعهٔ کارکردهٔ آزمایشی', '3,000,000']]);
    const job = await inspect(owner, file);
    const preview = await configure(owner, job.jobId, settingsFor(job, { defaults: { ...noDefaults, categoryCode: 'BRAKE', partType: 'GENUINE', condition: 'USED', origin: 'DOMESTIC' } }));
    await commit(owner, preview);
    const [item] = (await owner.get(`/admin/imports/${job.jobId}/products`)).body.items;
    expect(item).toMatchObject({ condition: 'USED', published: false, photoRequiredToPublish: true });
    const detail = (await owner.get(`/admin/products/${item.productId}`)).body;
    const refused = await owner.post(`/admin/products/${item.productId}/publish`, { published: true, version: detail.version });
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('REAL_PHOTO_REQUIRED');
    await owner.upload(`/admin/products/${item.productId}/media`, {}, [{ name: 'real.png', data: await png(90, 90, 90), field: 'file', type: 'image/png' }]);
    const withPhoto = (await owner.get(`/admin/products/${item.productId}`)).body;
    expect((await owner.post(`/admin/products/${item.productId}/publish`, { published: true, version: withPhoto.version })).status).toBe(201);
  });
});
