import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Services, type TestApp, bootApp, createProduct, drainOutbox, idemKey, loginOwner, services, taxonomy } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * «قطعه» as one concept: a part (product) with technical number, equivalents, fitment years, specs and
 * an optional price; one search that finds any number written any way (in-stock parts first, the rest
 * «قابل تأمین»); the technical catalog entries migrated into parts (with the 301 lookup and the check
 * script); and the brand database import (streamed csv in Windows-1256 / zip, mapping saved per brand,
 * re-import updates instead of duplicating, priced parts only completed, undo).
 */
let t: TestApp;
let s: Services;
let owner: Client;
let anon: Client;
let tax: Awaited<ReturnType<typeof taxonomy>>;
let maker: { id: string; slug: string; nameFa: string };
let vehicle: { id: string; slug: string; name: string; model: { id: string; name: string } };
const run = Date.now().toString(36).toUpperCase();
const pexec = promisify(execFile);

beforeAll(async () => {
  t = await bootApp();
  s = await services(t);
  owner = await loginOwner(t);
  anon = new Client(t);
  tax = await taxonomy(owner);
  const m = await owner.post<any>('/admin/manufacturer-brands', { nameFa: `سازنده ${run}`, nameEn: `Maker ${run}`, active: true });
  expect(m.status, JSON.stringify(m.body)).toBe(201);
  maker = { id: m.body.id, slug: m.body.slug, nameFa: m.body.nameFa };
  const v = await owner.post<any>('/admin/vehicles', { name: `یکپارچه ${run}`, nameEn: `Unified ${run}` });
  const md = await owner.post<any>(`/admin/vehicles/${v.body.id}/models`, { name: `مدل ${run}` });
  const list = (await owner.get<any>('/admin/vehicles')).body.vehicles.find((x: any) => x.id === v.body.id);
  vehicle = { id: list.id, slug: list.slug, name: list.name, model: { id: md.body.id, name: `مدل ${run}` } };
});
afterAll(async () => {
  await t?.close();
});

const brake = () => tax.categories.find((c) => c.code === 'BRAKE')!.id;
const unitId = () => tax.units.find((u) => u.name === 'عدد')!.id;
const partBody = (over: Record<string, unknown> = {}) => ({
  partNumber: `UP-${run}-01`, nameFa: `قطعهٔ یکپارچه ${run}`, nameEn: `Unified part ${run}`, categoryId: brake(), manufacturerBrandId: maker.id, unitId: unitId(),
  partType: 'GENUINE', condition: 'NEW', origin: 'IMPORTED', equivalents: [`EQ ${run} 55`, 'gdb-3425'], replacements: [`NEW-${run}`],
  vehicles: [{ vehicleId: vehicle.id, modelId: vehicle.model.id, yearFrom: 1395, yearTo: 1400, note: null }], vehicleBrandIds: [],
  specs: [{ key: 'diameter', labelFa: 'قطر', value: '80mm' }], basePrice: null, ...over,
});
const search = async (q: string, extra = '') => (await anon.get<any>(`/catalog/products?q=${encodeURIComponent(q)}${extra}`)).body;

describe('one part with or without price', () => {
  let id: string;
  let slug: string;

  it('a part without price: SKU from the number, numbers and fitment years, published, «درخواست تأمین»', async () => {
    const res = await owner.post<any>('/admin/products', partBody());
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    id = res.body.id;
    const detail = (await owner.get<any>(`/admin/products/${id}`)).body;
    expect(detail).toMatchObject({ sku: `UP-${run}-01`, partNumber: `UP-${run}-01`, basePrice: null, equivalents: [`EQ ${run} 55`, 'gdb-3425'], replacements: [`NEW-${run}`] });
    expect(detail.vehicles[0]).toMatchObject({ vehicleId: vehicle.id, yearFrom: 1395, yearTo: 1400 });
    // Published without a price (shown with «درخواست تأمین»).
    const pub = await owner.post<any>(`/admin/products/${id}/publish`, { published: true, version: detail.version });
    expect(pub.status, JSON.stringify(pub.body)).toBe(201);
    slug = detail.slug;
    const pubDetail = (await anon.get<any>(`/catalog/products/${slug}`)).body;
    expect(pubDetail).toMatchObject({ partNumber: `UP-${run}-01`, purchasable: false, price: { kind: 'inquiry' }, equivalents: [`EQ ${run} 55`, 'gdb-3425'], replacements: [`NEW-${run}`] });
    expect(pubDetail.fitments[0]).toMatchObject({ yearFrom: 1395, yearTo: 1400 });

    // The same number (written differently) for the same maker is refused, with the existing part.
    const dup = await owner.post<any>('/admin/products', partBody({ partNumber: ` up ${run.toLowerCase()} 01 `, sku: undefined }));
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('PART_NUMBER_EXISTS');
    expect(dup.body.error.details).toMatchObject({ id });
    // Another maker may have the same number.
    const other = await owner.post<any>('/admin/products', partBody({ manufacturerBrandId: null, equivalents: [], replacements: [] }));
    expect(other.status, JSON.stringify(other.body)).toBe(201);
    expect(other.body.id).not.toBe(id);
  });

  it('one search finds name, SKU, technical number and any other number, written any way; maker filter', async () => {
    const persian = `UP-${run}-01`.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);
    for (const q of [`UP-${run}-01`, `up ${run} 01`, persian, `eq${run}55`, 'GDB 3425', `new ${run}`, `قطعهٔ یکپارچه ${run}`]) {
      const r = await search(q);
      expect(r.items.map((i: any) => i.slug), q).toContain(slug);
    }
    expect((await search(`UP-${run}-01`, `&maker=${maker.slug}`)).items.map((i: any) => i.slug)).toEqual([slug]);
    expect((await anon.get<any>('/catalog/manufacturers')).body.some((m: any) => m.slug === maker.slug)).toBe(true);
  });

  it('in-stock parts come first; the rest are «قابل تأمین»; «فقط موجود» shows only those', async () => {
    const stocked = await createProduct(owner, { sku: `UP-STOCK-${run}`, nameFa: `قطعهٔ یکپارچه ${run} موجود`, onHand: 3 });
    const r = await search(`قطعهٔ یکپارچه ${run}`);
    expect(r.items[0].slug).toBe(stocked.slug);
    expect(r.items[0].purchasable).toBe(true);
    expect(r.items.find((i: any) => i.slug === slug).purchasable).toBe(false);
    const onlyStock = await search(`قطعهٔ یکپارچه ${run}`, '&inStock=1');
    expect(onlyStock.items.map((i: any) => i.slug)).toEqual([stocked.slug]);
    // An exact number puts its part first even when it is not in stock.
    expect((await search(`UP${run}01`)).items[0].slug).toBe(slug);
  });

  it('bulk photos find a part by an equivalent number', async () => {
    const res = await owner.post<any>('/admin/products/code-lookup', { codes: [`EQ-${run}-55`, `GDB3425`] });
    expect(res.body.matches[`EQ-${run}-55`].map((m: any) => m.id)).toEqual([id]);
  });
});

describe('product Excel import: numbers, specs, years, optional price, skip existing', () => {
  async function preview(rows: Array<Array<string | number | null>>, headers: string[]) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('کالاها');
    ws.addRow(headers);
    for (let c = 1; c <= headers.length; c += 1) ws.getColumn(c).numFmt = '@';
    for (const r of rows) ws.addRow(r);
    const up = await owner.upload('/attachments', { purpose: 'IMPORT' }, [{ name: 'parts.xlsx', data: Buffer.from(await wb.xlsx.writeBuffer()) }]);
    expect(up.status).toBe(201);
    await drainOutbox(s, ['attachment.scan'], up.body[0].id);
    const start = await owner.post<any>('/admin/imports', { attachmentId: up.body[0].id, mode: 'CREATE_AND_UPDATE' }, { 'idempotency-key': idemKey() });
    expect(start.status, JSON.stringify(start.body)).toBe(201);
    await drainOutbox(s, ['import.parse'], start.body.jobId);
    return (await owner.get<any>(`/admin/imports/${start.body.jobId}?pageSize=100`)).body;
  }

  it('creates parts without price or SKU, with equivalents, specs and fitment years; existing rows can be skipped', { timeout: 150_000 }, async () => {
    const headers = ['کد کالا', 'شماره فنی', 'نام قطعه', 'شماره‌های معادل', 'کد دسته', 'نوع قطعه', 'وضعیت فیزیکی', 'منشا', 'کاربرد در خودرو', 'مشخصات فنی', 'ارز پایه', 'قیمت پایه'];
    const job = await preview([
      ['', `XL-${run}-1`, 'قطعهٔ اکسل بدون قیمت', `XEQ-${run}`, 'BRAKE', 'اصلی', 'نو', 'داخلی', `${vehicle.name} ${vehicle.model.name} (1396-1399)`, 'قطر: 50mm؛ وزن: 1kg', '', ''],
      [`XL-SKU-${run}`, `XL-${run}-2`, 'قطعهٔ اکسل با قیمت', '', 'BRAKE', 'اصلی', 'نو', 'داخلی', '', '', 'ریال', '2500000'],
      [`UP-STOCK-${run}`, '', 'نام تازه', '', '', '', '', '', '', '', '', ''],
      ['', `XL-${run}-3`, 'مشخصات غلط', '', 'BRAKE', 'اصلی', 'نو', 'داخلی', '', 'بدون دونقطه', '', ''],
    ], headers);
    expect(job.status, JSON.stringify(job.fileErrors ?? job.failureReason)).toBe('PREVIEW_READY');
    const row = (n: number) => job.rows.find((r: any) => r.rowNumber === n);
    expect(row(2).action).toBe('CREATE');
    expect(row(2).sku).toBe(`XL-${run}-1`);
    expect(row(3).action).toBe('CREATE');
    expect(row(4).action).toBe('UPDATE');
    expect(row(5).issues.map((i: any) => i.code)).toContain('SPECS_INVALID');

    const res = await owner.post<any>(`/admin/imports/${job.jobId}/commit`, { planChecksum: job.planChecksum, skipErrorRows: true, skipExisting: true });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await drainOutbox(s, ['import.commit'], job.jobId);
    const done = (await owner.get<any>(`/admin/imports/${job.jobId}`)).body;
    expect(done.status).toBe('COMMITTED');
    const a = await s.prisma.product.findUniqueOrThrow({ where: { sku: `XL-${run}-1` }, include: { basePrice: true, numbers: true, vehicles: true } });
    expect(a).toMatchObject({ partNumber: `XL-${run}-1`, basePrice: null });
    expect(a.numbers.map((n: any) => n.number)).toEqual([`XEQ-${run}`]);
    expect(a.vehicles[0]).toMatchObject({ vehicleId: vehicle.id, modelId: vehicle.model.id, yearFrom: 1396, yearTo: 1399 });
    expect(a.specs).toEqual([{ key: 'spec-1', labelFa: 'قطر', value: '50mm' }, { key: 'spec-2', labelFa: 'وزن', value: '1kg' }]);
    expect((await s.prisma.product.findUniqueOrThrow({ where: { sku: `XL-SKU-${run}` }, include: { basePrice: true } })).basePrice?.baseAmountMinor).toBe(2_500_000n);
    // Skipped: the existing part keeps its name.
    const kept = await s.prisma.productTranslation.findFirst({ where: { product: { sku: `UP-STOCK-${run}` }, locale: 'fa' } });
    expect(kept?.name).toBe(`قطعهٔ یکپارچه ${run} موجود`);
  });

  it('the template has the new columns', async () => {
    const res = await owner.raw('GET', '/admin/imports/template');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as any);
    const headers = (wb.worksheets[0]!.getRow(1).values as unknown[]).slice(1);
    for (const h of ['کد کالا', 'شماره فنی', 'شماره‌های معادل', 'شماره‌های جایگزین', 'کاربرد در خودرو', 'مشخصات فنی', 'قیمت پایه', 'موجودی']) expect(headers).toContain(h);
  });
});

describe('technical catalog entries → parts (migration)', () => {
  it('merges linked entries, creates the others, records old addresses, and the check script agrees', { timeout: 120_000 }, async () => {
    // A priced part the second entry is linked to.
    const linked = await createProduct(owner, { sku: `MIG-LINK-${run}`, nameFa: `قطعهٔ لینک‌شده ${run}`, onHand: 2 });
    const linkedRow = await s.prisma.product.findUniqueOrThrow({ where: { sku: `MIG-LINK-${run}` }, include: { basePrice: true } });
    const e1 = `00000000-0000-7000-8000-${Date.now().toString(16).slice(-12).padStart(12, '0')}`;
    const e2 = `00000000-0000-7001-8000-${Date.now().toString(16).slice(-12).padStart(12, '0')}`;
    await s.prisma.$executeRawUnsafe(`
      INSERT INTO "catalog_entry" ("id","slug","part_number","part_number_key","name_fa","name_en","category_id","specs","description_fa","status","published_at","search_text","updated_at")
      VALUES ('${e1}','mig-${run.toLowerCase()}-a','MIG-${run}-A','MIG${run}A','قطعهٔ کاتالوگی ${run}','Catalog part ${run}',NULL,'[{"label":"جنس","value":"فولاد"}]','شرح','PUBLISHED',now(),'',now()),
             ('${e2}','mig-${run.toLowerCase()}-b','MIG-${run}-B','MIG${run}B','لینک‌شده ${run}',NULL,NULL,'[]',NULL,'DRAFT',NULL,'',now())`);
    await s.prisma.$executeRawUnsafe(`UPDATE "catalog_entry" SET "product_id" = '${linked.id}' WHERE "id" = '${e2}'`);
    await s.prisma.$executeRawUnsafe(`INSERT INTO "catalog_entry_number" ("id","entry_id","number","number_key","kind","sort_order") VALUES
      (gen_random_uuid(),'${e1}','EQM ${run}','EQM${run}','EQUIVALENT',0),(gen_random_uuid(),'${e2}','EQL ${run}','EQL${run}','EQUIVALENT',0)`);
    await s.prisma.$executeRawUnsafe(`INSERT INTO "catalog_entry_vehicle" ("id","entry_id","vehicle_id","model_id","year_from","year_to","sort_order") VALUES
      (gen_random_uuid(),'${e1}','${vehicle.id}','${vehicle.model.id}',1390,1395,0)`);

    // The data migration, exactly as deployed (one connection: it uses temporary tables).
    const sql = readFileSync(path.resolve(__dirname, '../../../../database/prisma/migrations/20261018090100_catalog_entries_to_parts/migration.sql'), 'utf8');
    const statements = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(/;\s*\n/).map((x) => x.trim()).filter(Boolean);
    await s.prisma.$transaction(async (tx: any) => { for (const st of statements) await tx.$executeRawUnsafe(st); }, { timeout: 60_000 });

    const m1 = await s.prisma.catalogEntryMigration.findUniqueOrThrow({ where: { entryId: e1 } });
    const m2 = await s.prisma.catalogEntryMigration.findUniqueOrThrow({ where: { entryId: e2 } });
    expect(m2).toMatchObject({ productId: linked.id, merged: true });
    expect(m1.merged).toBe(false);
    const created = await s.prisma.product.findUniqueOrThrow({ where: { id: m1.productId }, include: { numbers: true, vehicles: true, basePrice: true, translations: true, category: true } });
    expect(created).toMatchObject({ sku: `MIG-${run}-A`, partNumber: `MIG-${run}-A`, published: true, basePrice: null });
    expect(created.category.code).toBe('OTHER');
    expect(created.numbers.map((n: any) => n.number)).toEqual([`EQM ${run}`]);
    expect(created.vehicles[0]).toMatchObject({ yearFrom: 1390, yearTo: 1395 });
    expect(created.specs).toEqual([{ key: 'spec-1', labelFa: 'جنس', value: 'فولاد' }]);
    const merged = await s.prisma.product.findUniqueOrThrow({ where: { id: linked.id }, include: { numbers: true, basePrice: true } });
    expect(merged.partNumber).toBe(`MIG-${run}-B`);
    expect(merged.numbers.map((n: any) => n.number)).toContain(`EQL ${run}`);
    expect(merged.basePrice?.baseAmountMinor).toBe(linkedRow.basePrice?.baseAmountMinor);

    // 301: the old address resolves to the part.
    expect((await anon.get<any>(`/catalog/legacy-catalog/mig-${run.toLowerCase()}-a`)).body).toEqual({ slug: created.slug });
    expect((await anon.get(`/catalog/legacy-catalog/no-such-${run.toLowerCase()}`)).status).toBe(404);

    // The check script (as run on the server after deploying).
    const { stdout } = await pexec(process.execPath, [path.resolve(__dirname, '../../dist/cli/verify-catalog-migration.js')], { env: process.env, timeout: 60_000 });
    expect(stdout).toContain('RESULT: OK');
    expect(JSON.parse(stdout.slice(stdout.indexOf('{'), stdout.indexOf('}') + 1))).toMatchObject({ differences: 0 });
    // The search finds the migrated part by its equivalent after the check rebuilt the search text.
    expect((await search(`EQM-${run}`)).items.map((i: any) => i.slug)).toContain(created.slug);
  });
});

describe('brand database import', () => {
  const header = ['Part No', 'Description', 'OE Number', 'Interchange', 'Model', 'Years', 'Weight'];
  const cp1256 = (text: string) => {
    // Windows-1256 encoder for the test (Persian letters used below and ASCII).
    const map: Record<string, number> = { 'ف': 0xdd, 'ی': 0xed, 'ل': 0xe1, 'ت': 0xca, 'ر': 0xd1, 'و': 0xe6, 'غ': 0xdb, 'ن': 0xe4, 'ک': 0x98, 'ه': 0xe5, 'ا': 0xc7, 'س': 0xd3, 'م': 0xe3, 'د': 0xcf, 'پ': 0x81, 'چ': 0x8d, 'ژ': 0x8e, 'گ': 0x90, 'ش': 0xd4, 'ب': 0xc8, 'ز': 0xd2, 'ج': 0xcc, 'خ': 0xce, 'ح': 0xcd, 'ع': 0xda, 'ق': 0xde, 'ص': 0xd5, 'ط': 0xd8, 'ظ': 0xd9, 'ض': 0xd6, 'ث': 0xcb, 'ذ': 0xd0, 'آ': 0xc2, ' ': 0x20 };
    return Buffer.from([...text].map((ch) => (ch.charCodeAt(0) < 128 ? ch.charCodeAt(0) : map[ch] ?? 0x3f)));
  };
  const csvRow = (cells: string[]) => cells.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',');

  async function upload(name: string, data: Buffer, source = 'catalog') {
    const res = await owner.upload<any>('/admin/brand-imports/upload', { manufacturerBrandId: maker.id, source }, [{ name, data, field: 'file' }]);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await drainOutbox(s, ['brand-import.inspect'], res.body.id);
    return (await owner.get<any>(`/admin/brand-imports/${res.body.id}`)).body;
  }
  async function mapAndRun(id: string, mapping: Record<string, string[]>, publish = true) {
    const m = await owner.put<any>(`/admin/brand-imports/${id}/mapping`, { mapping, options: { publish, partType: 'GENUINE', encoding: 'auto' } });
    expect(m.status, JSON.stringify(m.body)).toBe(200);
    await drainOutbox(s, ['brand-import.preview'], id);
    const pv = (await owner.get<any>(`/admin/brand-imports/${id}`)).body;
    expect(pv.status).toBe('PREVIEW_READY');
    const st = await owner.post<any>(`/admin/brand-imports/${id}/start`, {});
    expect(st.status, JSON.stringify(st.body)).toBe(201);
    await drainOutbox(s, ['brand-import.run'], id);
    return { preview: pv, done: (await owner.get<any>(`/admin/brand-imports/${id}`)).body };
  }

  it('reads Windows-1256 CSV, suggests and saves the mapping, imports without price, completes priced parts only, re-import updates, undo restores', { timeout: 240_000 }, async () => {
    // A priced part of this maker entered by hand, with its number only among its technical codes.
    const manual = await createProduct(owner, { sku: `BI-MANUAL-${run}`, nameFa: `دستی ${run}`, onHand: 5 });
    await s.prisma.product.update({ where: { id: manual.id }, data: { manufacturerBrandId: maker.id, oemCodes: [`BI${run}003`] } });
    const priceBefore = (await s.prisma.productPrice.findUniqueOrThrow({ where: { productId: manual.id } })).baseAmountMinor;

    const lines = [
      csvRow(header),
      csvRow([`BI-${run}-001`, 'فیلتر روغن', `BI${run}001X, BI-${run}-001`, 'W 712', `${vehicle.name} ${vehicle.model.name}`, '2010-2015', '0.4 kg']),
      csvRow([`BI-${run}-002`, 'لنت ترمز', '', '', 'خودروی ناشناس', '', '']),
      csvRow([`BI-${run}-003`, 'کمک فنر', `EQ3-${run}`, '', '', '', '1.1 kg']),
      csvRow(['', 'بی شماره', '', '', '', '', '']),
      csvRow([`bi ${run} 002`, 'تکراری', '', '', '', '', '']),
    ];
    const first = await upload('toyota.csv', Buffer.concat([cp1256(lines.join('\r\n'))]));
    expect(first.status).toBe('AWAITING_MAPPING');
    expect(first.outline[0]).toMatchObject({ encoding: 'windows-1256', delimiter: ',', headers: header });
    expect(first.outline[0].samples[0][1]).toBe('فیلتر روغن');
    expect(first.mapping).toMatchObject({ partNumber: ['Part No'], equivalents: ['OE Number', 'Interchange'], fitment: ['Model'], years: ['Years'], description: ['Description'], specs: ['Weight'] });

    const mapping = { ...first.mapping, nameFa: ['Description'] };
    delete (mapping as any).description;
    const { preview, done } = await mapAndRun(first.id, mapping);
    expect(preview.stats).toMatchObject({ rows: 5, new: 2, update: 1, duplicate: 1, error: 1 });
    expect(done).toMatchObject({ status: 'COMPLETED', stats: { created: 2, updated: 1, duplicate: 1, error: 1 }, canRollback: true });
    expect(done.errorCount).toBeGreaterThanOrEqual(3);

    const p1 = await s.prisma.product.findFirstOrThrow({ where: { manufacturerBrandId: maker.id, partNumberKey: `BI${run}001` }, include: { basePrice: true, numbers: true, vehicles: true, translations: true } });
    expect(p1).toMatchObject({ published: true, basePrice: null, sourceBrandImportId: first.id, partType: 'GENUINE' });
    expect(p1.numbers.map((n: any) => n.number).sort()).toEqual([`BI${run}001X`, 'W 712'].sort());
    expect(p1.vehicles[0]).toMatchObject({ vehicleId: vehicle.id, modelId: vehicle.model.id, yearFrom: 2010, yearTo: 2015 });
    expect(p1.specs).toEqual([{ key: 'spec-1', labelFa: 'Weight', value: '0.4 kg' }]);
    expect(p1.translations.find((x: any) => x.locale === 'fa')?.name).toBe('فیلتر روغن');
    // The priced part was only completed: same price, same name, number and equivalent added.
    const m = await s.prisma.product.findUniqueOrThrow({ where: { id: manual.id }, include: { basePrice: true, numbers: true, translations: true } });
    expect(m.basePrice?.baseAmountMinor).toBe(priceBefore);
    expect(m.translations.find((x: any) => x.locale === 'fa')?.name).toBe(`دستی ${run}`);
    expect(m.partNumberKey).toBe(`BI${run}003`);
    expect(m.numbers.map((n: any) => n.number)).toEqual([`EQ3-${run}`]);
    expect(m.specs).toEqual(expect.arrayContaining([expect.objectContaining({ labelFa: 'Weight', value: '1.1 kg' })]));
    // Error report (CSV).
    const report = await owner.raw('GET', `/admin/brand-imports/${first.id}/errors.csv`);
    const text = await report.text();
    expect(text).toContain('PART_NUMBER_REQUIRED');
    expect(text).toContain('DUPLICATE_IN_FILE');
    expect(text).toContain('UNKNOWN_VEHICLE');
    // The site shows the imported parts as «قابل تأمین».
    expect((await search(`BI-${run}-001`)).items[0]).toMatchObject({ purchasable: false });

    // Same brand again (a zip with the CSV, now UTF-8): the saved mapping is applied; parts are updated, not duplicated.
    const zip = new JSZip();
    zip.file('part1.csv', `${String.fromCharCode(0xfeff)}${[csvRow(header), csvRow([`BI-${run}-001`, 'فیلتر روغن نو', 'W 719', '', '', '', '0.5 kg']), csvRow([`BI-${run}-004`, 'تازه', '', '', '', '', ''])].join('\n')}`);
    const second = await upload('toyota.zip', await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
    expect(second.status).toBe('AWAITING_MAPPING');
    expect(second.mapping.nameFa).toEqual(['Description']);
    const again = await mapAndRun(second.id, second.mapping, false);
    expect(again.done.stats).toMatchObject({ created: 1, updated: 1 });
    expect(await s.prisma.product.count({ where: { manufacturerBrandId: maker.id, partNumberKey: `BI${run}001` } })).toBe(1);
    const p1b = await s.prisma.product.findUniqueOrThrow({ where: { id: p1.id }, include: { translations: true, numbers: true } });
    expect(p1b.translations.find((x: any) => x.locale === 'fa')?.name).toBe('فیلتر روغن نو');
    expect(p1b.numbers.map((n: any) => n.number)).toContain('W 719');
    expect((await owner.get<any>(`/admin/brand-imports/${first.id}`)).body.canRollback).toBe(false);

    // Undo the latest import: the part it created is deleted, the part it updated gets its fields back.
    const undo = await owner.post<any>(`/admin/brand-imports/${second.id}/rollback`, {});
    expect(undo.status, JSON.stringify(undo.body)).toBe(201);
    await drainOutbox(s, ['brand-import.rollback'], second.id);
    const undone = (await owner.get<any>(`/admin/brand-imports/${second.id}`)).body;
    expect(undone).toMatchObject({ status: 'ROLLED_BACK', stats: { deleted: 1, restored: 1 } });
    expect(await s.prisma.product.count({ where: { manufacturerBrandId: maker.id, partNumberKey: `BI${run}004` } })).toBe(0);
    const p1c = await s.prisma.product.findUniqueOrThrow({ where: { id: p1.id }, include: { translations: true, numbers: true } });
    expect(p1c.translations.find((x: any) => x.locale === 'fa')?.name).toBe('فیلتر روغن');
    expect(p1c.numbers.map((n: any) => n.number)).not.toContain('W 719');
    // Now the first import is the latest again and can be undone.
    expect((await owner.get<any>(`/admin/brand-imports/${first.id}`)).body.canRollback).toBe(true);
  });

  it('refuses files that are not xlsx, csv or zip, and staff without products.write', async () => {
    const bad = await owner.upload<any>('/admin/brand-imports/upload', { manufacturerBrandId: maker.id, source: 'x' }, [{ name: 'x.pdf', data: Buffer.from('%PDF-1.4'), field: 'file' }]);
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('BRAND_FILE_FORMAT');
    expect((await anon.get('/admin/brand-imports')).status).toBe(401);
  });
});
