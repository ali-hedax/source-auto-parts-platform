import ExcelJS from 'exceljs';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mapHeaders, planImport } from '@hedax/domain';
import { readSheet } from '../../src/modules/imports/spreadsheet.js';
import {
  type Client,
  type Services,
  type TestApp,
  addAddress,
  addToCart,
  bootApp,
  checkout,
  createProduct,
  drainOutbox,
  idemKey,
  loginCustomer,
  loginOwner,
  services,
} from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

let t: TestApp;
let s: Services;
let owner: Client;
const run = Date.now().toString(36).toUpperCase();
/** Deliverable samples (spec §22): the import template and a real row-error report. */
const samples = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'docs', 'import');

const COLUMNS = [
  'sku', 'name_fa', 'name_en', 'category_code', 'vehicle_brand_codes', 'manufacturer_brand', 'part_type', 'condition', 'origin',
  'base_currency', 'base_price', 'override_price_irr', 'override_price_aed', 'on_hand', 'low_stock_threshold', 'unit', 'description_fa',
  'description_en', 'is_active',
] as const;
type Cell = string | number | null | { formula: string; result?: number };

beforeAll(async () => {
  t = await bootApp();
  s = await services(t);
  owner = await loginOwner(t);
});
afterAll(async () => {
  await t?.close();
});

async function workbook(rows: Array<Partial<Record<(typeof COLUMNS)[number], Cell>>>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('products');
  ws.addRow([...COLUMNS]);
  ws.getColumn(1).numFmt = '@';
  for (const r of rows) ws.addRow(COLUMNS.map((c) => r[c] ?? null));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const newRow = (sku: Cell, over: Partial<Record<(typeof COLUMNS)[number], Cell>> = {}) => ({
  sku, name_fa: 'قطعهٔ واردشده آزمایشی', category_code: 'BRAKE', vehicle_brand_codes: 'IKCO', part_type: 'AFTERMARKET', condition: 'NEW',
  origin: 'DOMESTIC', base_currency: 'IRR', base_price: '12000000', on_hand: 4, low_stock_threshold: 1, unit: 'عدد', is_active: 1, ...over,
});

async function startImport(file: Buffer, mode: 'UPDATE_ONLY' | 'CREATE_AND_UPDATE', key = idemKey()) {
  const up = await owner.upload('/attachments', { purpose: 'IMPORT' }, [{ name: 'products.xlsx', data: file }]);
  expect(up.status).toBe(201);
  const attachmentId = up.body[0].id as string;
  await drainOutbox(s, ['attachment.scan'], attachmentId);
  const start = await owner.post('/admin/imports', { attachmentId, mode }, { 'idempotency-key': key });
  expect(start.status, JSON.stringify(start.body)).toBe(201);
  await drainOutbox(s, ['import.parse'], start.body.jobId);
  const preview = await owner.get(`/admin/imports/${start.body.jobId}`);
  expect(preview.body.status).toBe('PREVIEW_READY');
  return { jobId: start.body.jobId as string, preview: preview.body, attachmentId, key };
}

async function commit(jobId: string, planChecksum: string) {
  const res = await owner.post(`/admin/imports/${jobId}/commit`, { planChecksum });
  if (res.status === 201) await drainOutbox(s, ['import.commit'], jobId);
  const job = await owner.get(`/admin/imports/${jobId}`);
  return { res, job: job.body };
}

const product = (sku: string) => s.prisma.product.findUnique({ where: { sku }, include: { basePrice: true, inventory: true } });

describe('A22 — leading-zero SKU, duplicate rows and invalid data', () => {
  it('a numeric cell that lost the zeros of an existing SKU (00123 → 123) is an error, not a new product', async () => {
    const digits = `9${String(Date.now()).slice(-6)}`;
    const created = await startImport(await workbook([newRow(`00${digits}`)]), 'CREATE_AND_UPDATE');
    expect(created.preview.summary.canCommit, JSON.stringify(created.preview.rows[0]?.issues)).toBe(true);
    expect((await commit(created.jobId, created.preview.planChecksum)).job.status).toBe('COMMITTED');

    const { preview } = await startImport(await workbook([newRow(Number(digits), { name_fa: 'همان کالا با کد عددی' })]), 'CREATE_AND_UPDATE');
    const row = preview.rows[0];
    expect(row.action).toBe('ERROR');
    expect(row.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SKU_LEADING_ZEROS_LOST', detail: `00${digits}` })]));
    expect(await product(digits)).toBeNull();
  });

  it('identifiers kept as text, row-level errors, nothing changes before confirmation', async () => {
    const skuZero = `00${run.slice(-5)}`;
    const file = await workbook([
      newRow(skuZero),
      newRow(skuZero, { name_fa: 'ردیف تکراری' }),
      newRow(77_001, { name_fa: 'کد عددی' }),
      newRow(`CUR-${run}`, { base_currency: 'TOMAN' }),
      newRow(`QTY-${run}`, { on_hand: 2.5 }),
      newRow(`NEG-${run}`, { base_price: '-5' }),
      newRow(`CAT-${run}`, { category_code: 'NOPE' }),
      newRow(`FX-${run}`, { base_price: { formula: '1000*12', result: 12000 } }),
    ]);
    const { jobId, preview } = await startImport(file, 'CREATE_AND_UPDATE');
    expect(preview.summary.canCommit).toBe(false);
    const codes = (rowNumber: number) => (preview.rows.find((r: any) => r.rowNumber === rowNumber)?.issues ?? []).map((i: any) => i.code);
    expect(preview.rows.find((r: any) => r.rowNumber === 2).sku).toBe(skuZero);
    expect(codes(3)).toContain('DUPLICATE_SKU_IN_FILE');
    expect(codes(4)).toContain('SKU_STORED_AS_NUMBER');
    // Toman is never assumed: a currency cell saying TOMAN needs the explicit toman → rial choice.
    expect(codes(5)).toContain('TOMAN_NEEDS_CONVERSION');
    expect(codes(6)).toContain('NOT_A_WHOLE_NUMBER');
    expect(codes(7).some((c: string) => ['NEGATIVE_NOT_ALLOWED', 'INVALID_AMOUNT'].includes(c))).toBe(true);
    expect(codes(8)).toContain('UNKNOWN_CATEGORY');
    expect(codes(9)).toContain('FORMULA_NOT_ALLOWED');

    // Preview changed nothing; commit is refused while errors remain.
    expect(await product(skuZero)).toBeNull();
    const refused = await owner.post(`/admin/imports/${jobId}/commit`, { planChecksum: preview.planChecksum });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('IMPORT_HAS_ERRORS');
    const stale = await owner.post(`/admin/imports/${jobId}/commit`, { planChecksum: '0'.repeat(64) });
    expect(stale.status).toBe(409);

    // Row error report: SKU stays text with its leading zeros.
    const report = await owner.raw('GET', `/admin/imports/${jobId}/errors.xlsx`);
    expect(report.headers.get('content-type')).toContain('spreadsheetml');
    const reportBytes = Buffer.from(await report.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(reportBytes as never);
    const template = await owner.raw('GET', '/admin/imports/template');
    expect(template.status).toBe(200);
    const templateBytes = Buffer.from(await template.arrayBuffer());
    // The operator template: nine Persian headers the importer maps, SKU as text, Persian drop-downs,
    // and its Persian sample rows parse without errors through the same reader and planner.
    const blank = await readSheet(templateBytes, 'xlsx', { sheet: 0, headerRow: 1, maxRows: 10 });
    expect(blank?.headers).toEqual(['کد کالا', 'نام قطعه', 'کد دسته', 'نوع قطعه', 'وضعیت فیزیکی', 'منشا', 'ارز پایه', 'قیمت پایه', 'موجودی']);
    expect(Object.keys(mapHeaders(blank!.headers).mapping).sort()).toEqual(['base_currency', 'base_price', 'category_code', 'condition', 'name_fa', 'on_hand', 'origin', 'part_type', 'sku'].sort());
    const templateWb = new ExcelJS.Workbook();
    await templateWb.xlsx.load(templateBytes as never);
    expect(templateWb.worksheets[0]!.getColumn(1).numFmt).toBe('@');
    expect(JSON.stringify((templateWb.worksheets[0] as any).dataValidations.model)).toContain('بازسازی شده');
    const sample = await readSheet(templateBytes, 'xlsx', { sheet: 1, headerRow: 1, maxRows: 10 });
    const { mapping } = mapHeaders(sample!.headers);
    const samplePlan = planImport(sample!.rows.map(({ cells }) => Object.fromEntries(Object.entries(mapping).map(([col, i]) => [col, cells[i as number]]))), {
      mode: 'CREATE_AND_UPDATE', existing: new Map(), categoryCodes: new Set(['FILTER', 'BRAKE']), vehicleBrandCodes: new Set(), manufacturerBrands: new Map(), clearWhenEmpty: new Set(),
    });
    expect(samplePlan.rows.map((r) => [r.sku, r.action, r.values?.partType, r.values?.condition, r.values?.origin, r.values?.baseCurrency])).toEqual([
      ['00123', 'CREATE', 'GENUINE', 'NEW', 'DOMESTIC', 'IRR'],
      ['TEST-SAMPLE-002', 'CREATE', 'AFTERMARKET', 'USED', 'IMPORTED', 'AED'],
    ]);
    mkdirSync(samples, { recursive: true });
    writeFileSync(path.join(samples, 'hedax-products-template.xlsx'), templateBytes);
    writeFileSync(path.join(samples, 'sample-row-errors.xlsx'), reportBytes);
    writeFileSync(path.join(samples, 'sample-import-with-errors.xlsx'), file);
    const rows = wb.worksheets[0]!.getSheetValues().filter(Boolean) as unknown[][];
    expect(rows.some((r) => r[2] === skuZero && r[7] === 'DUPLICATE_SKU_IN_FILE' && String(r[8]).includes('بیش از یک بار'))).toBe(true);
    expect(rows[0]?.slice(1)).toEqual(['ردیف', 'کد کالا', 'شماره فنی', 'نام قطعه', 'نوع', 'ستون', 'کد خطا', 'توضیح', 'جزئیات']);
    const reportEn = new ExcelJS.Workbook();
    await reportEn.xlsx.load(Buffer.from(await (await owner.raw('GET', `/admin/imports/${jobId}/errors.xlsx?locale=en`)).arrayBuffer()) as never);
    const rowsEn = reportEn.worksheets[0]!.getSheetValues().filter(Boolean) as unknown[][];
    expect(rowsEn.some((r) => r[7] === 'DUPLICATE_SKU_IN_FILE' && String(r[8]).includes('more than once'))).toBe(true);

    // A clean file creates the product with the exact SKU, unpublished, with one stock entry.
    const clean = await startImport(await workbook([newRow(skuZero)]), 'CREATE_AND_UPDATE');
    expect(clean.preview.summary).toMatchObject({ create: 1, error: 0, canCommit: true });
    const done = await commit(clean.jobId, clean.preview.planChecksum);
    expect(done.job.status).toBe('COMMITTED');
    const created = await product(skuZero);
    expect(created).toMatchObject({ sku: skuZero, published: false });
    expect(created?.inventory[0]?.onHand).toBe(4);
    expect(created?.basePrice?.baseAmountMinor).toBe(12_000_000n);
    expect(await s.prisma.inventoryMovement.count({ where: { productId: created?.id, type: 'IMPORT_ADJUSTMENT' } })).toBe(1);
  });
});

describe('A23 — stock changes after the preview', () => {
  it('the conflict is detected and newer data is not overwritten; nothing in the file is applied', async () => {
    const a = await createProduct(owner, { sku: `A23-A-${run}`, nameFa: 'قطعهٔ الف', priceIrr: 5_000_000n, onHand: 5 });
    const b = await createProduct(owner, { sku: `A23-B-${run}`, nameFa: 'قطعهٔ ب', priceIrr: 7_000_000n, onHand: 2 });
    const { jobId, preview } = await startImport(await workbook([
      { sku: `A23-A-${run}`, on_hand: 9, base_currency: 'IRR', base_price: '5500000' },
      { sku: `A23-B-${run}`, on_hand: 3 },
    ]), 'UPDATE_ONLY');
    expect(preview.summary).toMatchObject({ update: 2, canCommit: true });
    // Warehouse recounts A after the preview.
    const detail = await owner.get(`/admin/products/${a.id}`);
    await owner.post('/admin/inventory/adjust', { productId: a.id, newOnHand: 6, reason: 'PHYSICAL_COUNT', expectedVersion: detail.body.inventory.version });
    const done = await commit(jobId, preview.planChecksum);
    expect(done.job).toMatchObject({ status: 'CONFLICT', failureReason: 'VERSION_CONFLICT' });
    const pa = await product(`A23-A-${run}`);
    const pb = await product(`A23-B-${run}`);
    expect(pa?.inventory[0]?.onHand).toBe(6);
    expect(pa?.basePrice?.baseAmountMinor).toBe(5_000_000n);
    expect(pb?.inventory[0]?.onHand).toBe(2); // atomic: the valid row was not applied either
    expect(b.id).toBe(pb?.id);
  });
});

describe('A24 — import below the reserved quantity', () => {
  it('refused atomically with a reason; the customer reservation survives', async () => {
    const p = await createProduct(owner, { sku: `A24-${run}`, nameFa: 'قطعهٔ رزروی', priceIrr: 8_000_000n, onHand: 3 });
    // Preview taken before the reservation exists…
    const early = await startImport(await workbook([{ sku: `A24-${run}`, on_hand: 1 }]), 'UPDATE_ONLY');
    expect(early.preview.summary.canCommit).toBe(true);
    const customer = await loginCustomer(t);
    await addToCart(customer, p.id, 2);
    const order = await checkout(customer, await addAddress(customer));
    expect(order.status).toBe(201);
    // …is rejected at commit.
    const done = await commit(early.jobId, early.preview.planChecksum);
    expect(done.job.status).toBe('CONFLICT');
    expect(['VERSION_CONFLICT', 'ON_HAND_BELOW_RESERVED']).toContain(done.job.failureReason);
    // A preview taken now shows the row error with its reason.
    const late = await startImport(await workbook([{ sku: `A24-${run}`, on_hand: 1 }]), 'UPDATE_ONLY');
    expect(late.preview.summary.canCommit).toBe(false);
    expect(late.preview.rows[0].issues.map((i: any) => i.code)).toContain('ON_HAND_BELOW_RESERVED');
    const bal = await s.prisma.inventoryBalance.findFirstOrThrow({ where: { productId: p.id } });
    expect(bal).toMatchObject({ onHand: 3, reserved: 2 });
    expect(await s.prisma.inventoryReservation.count({ where: { orderId: order.body.orderId, status: 'ACTIVE' } })).toBe(1);
  });
});

describe('A25 — the same import run again with the same key', () => {
  it('no duplicate product or stock adjustment', async () => {
    const sku = `A25-${run}`;
    const file = await workbook([newRow(sku, { on_hand: 6 })]);
    const first = await startImport(file, 'CREATE_AND_UPDATE');
    // Same key + same body → the same job, not a second one.
    const again = await owner.post('/admin/imports', { attachmentId: first.attachmentId, mode: 'CREATE_AND_UPDATE' }, { 'idempotency-key': first.key });
    expect(again.body.jobId).toBe(first.jobId);
    const reused = await owner.post('/admin/imports', { attachmentId: first.attachmentId, mode: 'UPDATE_ONLY' }, { 'idempotency-key': first.key });
    expect(reused.status).toBe(422);
    expect(await s.prisma.importJob.count({ where: { attachmentId: first.attachmentId } })).toBe(1);

    const done = await commit(first.jobId, first.preview.planChecksum);
    expect(done.job.status).toBe('COMMITTED');
    // Double-submitted commit and a re-delivered worker job are no-ops.
    const repeat = await owner.post(`/admin/imports/${first.jobId}/commit`, { planChecksum: first.preview.planChecksum });
    expect(repeat.body.status).toBe('COMMITTED');
    await s.runAsWorker(() => s.imports.commit(first.jobId));
    const created = await product(sku);
    expect(await s.prisma.product.count({ where: { sku } })).toBe(1);
    expect(await s.prisma.inventoryMovement.count({ where: { productId: created?.id } })).toBe(1);

    // Uploading the same file again later: every row is UNCHANGED and nothing is written.
    const second = await startImport(file, 'CREATE_AND_UPDATE');
    expect(second.preview.summary).toMatchObject({ create: 0, update: 0, unchanged: 1 });
    await commit(second.jobId, second.preview.planChecksum);
    expect(await s.prisma.inventoryMovement.count({ where: { productId: created?.id } })).toBe(1);
    expect((await product(sku))?.inventory[0]?.onHand).toBe(6);
  });
});

describe('§12 — column mapping made visible and explicit clearing', () => {
  it('reports the columns read and the ignored ones; an empty cell clears only when that column is chosen', async () => {
    const sku = `MAP-${run}`;
    // Persian template headers plus a column the template does not know.
    const persian = async (rows: Cell[][]) => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('products');
      ws.addRow(['کد کالا', 'نام فارسی', 'نام انگلیسی', 'کد دسته', 'نوع قطعه', 'وضعیت فیزیکی', 'منشأ', 'ارز پایه', 'قیمت پایه', 'موجودی فیزیکی', 'یادداشت انبار']);
      ws.getColumn(1).numFmt = '@';
      for (const r of rows) ws.addRow(r);
      return Buffer.from(await wb.xlsx.writeBuffer());
    };
    const created = await startImport(await persian([[sku, 'لنت نگاشت', 'Mapping pad', 'BRAKE', 'OEM', 'NEW', 'DOMESTIC', 'IRR', '5000000', 2, 'قفسهٔ ۳']]), 'CREATE_AND_UPDATE');
    expect(created.preview.summary.columns).toEqual(expect.arrayContaining(['sku', 'name_fa', 'name_en', 'base_price', 'on_hand']));
    expect(created.preview.summary.ignoredHeaders).toEqual(['یادداشت انبار']);
    await commit(created.jobId, created.preview.planChecksum);

    // Same file with the English name left empty: by default nothing changes …
    const emptyName = await persian([[sku, 'لنت نگاشت', null, 'BRAKE', 'OEM', 'NEW', 'DOMESTIC', 'IRR', '5000000', 2, null]]);
    const keep = await startImport(emptyName, 'UPDATE_ONLY');
    expect(keep.preview.summary).toMatchObject({ update: 0, unchanged: 1, error: 0 });

    // … and only an explicit choice clears it.
    const up = await owner.upload('/attachments', { purpose: 'IMPORT' }, [{ name: 'products.xlsx', data: emptyName }]);
    const attachmentId = up.body[0].id as string;
    await drainOutbox(s, ['attachment.scan'], attachmentId);
    const start = await owner.post('/admin/imports', { attachmentId, mode: 'UPDATE_ONLY', clearWhenEmpty: ['name_en'] }, { 'idempotency-key': idemKey() });
    expect(start.status, JSON.stringify(start.body)).toBe(201);
    await drainOutbox(s, ['import.parse'], start.body.jobId);
    const cleared = (await owner.get(`/admin/imports/${start.body.jobId}`)).body;
    expect(cleared.summary).toMatchObject({ update: 1, error: 0 });
    expect(cleared.rows[0].changes).toEqual([{ field: 'nameEn', before: 'Mapping pad', after: null }]);
  });
});
