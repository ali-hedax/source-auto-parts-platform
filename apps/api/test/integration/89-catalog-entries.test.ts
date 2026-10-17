import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Services, type Staff, type TestApp, bootApp, createProduct, drainOutbox, inviteStaff, loginOwner, pngBytes, services, taxonomy } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Technical parts catalog («کاتالوگ فنی قطعات»): entries edited in panel → knowledge center → catalog
 * parts (single form, photos, bulk Excel/CSV through the outbox and worker) and searched on /catalog.
 * Only published entries are public; numbers are found with spaces, dashes or Persian digits and by
 * their equivalents; nothing becomes or links to a shop product unless chosen by hand.
 */
let t: TestApp;
let s: Services;
let owner: Client;
let anon: Client;
let tax: Awaited<ReturnType<typeof taxonomy>>;
let vehicle: { id: string; slug: string; name: string; model: { id: string; slug: string; name: string } };
const run = Date.now().toString(36).toUpperCase();
const PN = `CT-${run}-01`;

beforeAll(async () => {
  t = await bootApp();
  s = await services(t);
  owner = await loginOwner(t);
  anon = new Client(t);
  tax = await taxonomy(owner);
  // A vehicle and a model of this test only.
  const v = await owner.post<any>('/admin/vehicles', { name: `کاتالوگو ${run}`, nameEn: `Catalogo ${run}` });
  expect(v.status, JSON.stringify(v.body)).toBe(201);
  const m = await owner.post<any>(`/admin/vehicles/${v.body.id}/models`, { name: `ایکس ${run}` });
  expect(m.status, JSON.stringify(m.body)).toBe(201);
  const list = (await owner.get<any>('/admin/vehicles')).body.vehicles.find((x: any) => x.id === v.body.id);
  const model = list.models.find((x: any) => x.id === m.body.id);
  vehicle = { id: list.id, slug: list.slug, name: list.name, model: { id: model.id, slug: model.slug, name: model.name } };
});
afterAll(async () => {
  await t?.close();
});

const brake = () => tax.categories.find((c) => c.code === 'BRAKE')!;
const ikco = () => tax.vehicleBrands.find((b) => b.code === 'IKCO')!;
const input = (over: Record<string, unknown> = {}) => ({
  partNumber: PN, nameFa: `لنت کاتالوگی ${run}`, nameEn: `Catalog pad ${run}`,
  equivalents: [`EQ ${run} 77`], replacements: [`RP-${run}`],
  categoryId: brake().id, vehicleBrandIds: [ikco().id],
  vehicles: [{ vehicleId: vehicle.id, modelId: vehicle.model.id, yearFrom: 1390, yearTo: 1400, note: null }],
  specs: [{ label: 'جنس', value: 'سرامیکی' }], descriptionFa: 'توضیح آزمایشی', status: 'DRAFT', ...over,
});

describe('single entries', () => {
  let id: string;

  it('creates an entry, refuses the same technical number written differently, and audits it', async () => {
    const res = await owner.post<any>('/admin/catalog-entries', input());
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    id = res.body.id;
    expect(res.body).toMatchObject({ partNumber: PN, slug: PN.toLowerCase(), status: 'DRAFT', equivalents: [`EQ ${run} 77`], replacements: [`RP-${run}`], vehicleBrandIds: [ikco().id] });
    expect(res.body.vehicles[0]).toMatchObject({ vehicleId: vehicle.id, modelId: vehicle.model.id, yearFrom: 1390, yearTo: 1400 });

    const again = await owner.post<any>('/admin/catalog-entries', input({ partNumber: ` ct ${run.toLowerCase()} 01 ` }));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('CATALOG_PART_NUMBER_EXISTS');
    expect(again.body.error.details).toMatchObject({ id, partNumber: PN });

    // A model that is not of the chosen vehicle is refused.
    const other = (await owner.get<any>('/admin/vehicles')).body.vehicles.find((v: any) => v.id !== vehicle.id && v.models.length);
    if (other) expect((await owner.put<any>(`/admin/catalog-entries/${id}`, input({ vehicles: [{ vehicleId: vehicle.id, modelId: other.models[0].id }] }))).status).toBe(400);

    const audit = await s.prisma.auditLog.findMany({ where: { entityId: id }, select: { action: true } });
    expect(audit.map((a: any) => a.action)).toContain('catalog_entry.created');
  });

  it('is public only when published; search ignores spaces, dashes and Persian digits and finds equivalents', async () => {
    const search = async (q: string) => (await anon.get<any>(`/catalog/entries?q=${encodeURIComponent(q)}`)).body.items.map((i: any) => i.partNumber);
    expect(await search(PN)).not.toContain(PN);
    expect((await anon.get(`/catalog/entries/${PN.toLowerCase()}`)).status).toBe(404);

    const pub = await owner.post<any>(`/admin/catalog-entries/${id}/status`, { status: 'PUBLISHED' });
    expect(pub.status).toBe(201);
    expect(pub.body.publishedAt).toBeTruthy();
    const persian = PN.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);
    for (const q of [PN, PN.replace(/-/g, ' '), PN.replace(/-/g, '').toLowerCase(), persian, `eq${run}77`, `RP ${run}`, `لنت کاتالوگی ${run}`, `catalog pad ${run.toLowerCase()}`]) {
      expect(await search(q), q).toContain(PN);
    }
    // Filters: vehicle brand, vehicle and model, category.
    const filtered = async (qs: string) => (await anon.get<any>(`/catalog/entries?${qs}&q=${encodeURIComponent(PN)}`)).body.items.length;
    const brandSlug = (await s.prisma.vehicleBrand.findUnique({ where: { id: ikco().id } })).slug;
    const catSlug = (await s.prisma.category.findUnique({ where: { id: brake().id } })).slug;
    expect(await filtered(`brand=${brandSlug}`)).toBe(1);
    expect(await filtered('brand=no-such-brand')).toBe(0);
    expect(await filtered(`vehicle=${vehicle.slug}&model=${vehicle.model.slug}`)).toBe(1);
    expect(await filtered(`vehicle=${vehicle.slug}`)).toBe(1);
    expect(await filtered(`category=${catSlug}`)).toBe(1);

    const detail = await anon.get<any>(`/catalog/entries/${PN.toLowerCase()}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      partNumber: PN, equivalents: [`EQ ${run} 77`], replacements: [`RP-${run}`], specs: [{ label: 'جنس', value: 'سرامیکی' }],
      product: null, inShop: false, description: { fa: 'توضیح آزمایشی' },
    });
    expect(detail.body.fitments[0]).toMatchObject({ vehicle: { slug: vehicle.slug }, model: { slug: vehicle.model.slug }, yearFrom: 1390, yearTo: 1400 });
    expect(detail.body.vehicleBrands.map((b: any) => b.slug)).toContain(brandSlug);
  });

  it('links a shop product only by hand, and photos are added, reordered and removed', async () => {
    const product = await createProduct(owner, { sku: `CTP-${run}`, nameFa: `محصول کاتالوگ ${run}`, onHand: 1 });
    const found = await owner.get<any[]>(`/admin/catalog-entries/product-lookup?q=${encodeURIComponent(`CTP-${run}`)}`);
    expect(found.body.map((p: any) => p.id)).toContain(product.id);
    const linked = await owner.put<any>(`/admin/catalog-entries/${id}`, { ...input({ status: 'PUBLISHED' }), productId: product.id });
    expect(linked.status, JSON.stringify(linked.body)).toBe(200);
    const detail = (await anon.get<any>(`/catalog/entries/${PN.toLowerCase()}`)).body;
    expect(detail).toMatchObject({ inShop: true, product: { slug: product.slug } });

    const png = await pngBytes();
    const ids: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      const up = await owner.upload<any>(`/admin/catalog-entries/${id}/images`, {}, [{ name: `p${i}.png`, data: png, field: 'file', type: 'image/png' }]);
      expect(up.status, JSON.stringify(up.body)).toBe(201);
      ids.push(up.body.id);
    }
    expect((await owner.upload<any>(`/admin/catalog-entries/${id}/images`, {}, [{ name: 'x.png', data: Buffer.from('not an image'), field: 'file' }])).status).toBe(400);
    expect((await owner.put(`/admin/catalog-entries/${id}/images/order`, { ids: [ids[1], ids[0]] })).status).toBe(200);
    expect((await owner.put(`/admin/catalog-entries/${id}/images/order`, { ids: [ids[0]] })).status).toBe(400);
    const withPhotos = (await anon.get<any>(`/catalog/entries/${PN.toLowerCase()}`)).body;
    expect(withPhotos.images).toHaveLength(2);
    expect(withPhotos.image.url).toContain(`catalog/${id}/`);
    expect((await owner.del(`/admin/catalog-entries/${id}/images/${ids[0]}`)).status).toBe(200);
    expect((await owner.get<any>(`/admin/catalog-entries/${id}`)).body.images.map((i: any) => i.id)).toEqual([ids[1]]);

    // Bulk photos: a file name with the technical number (any way of writing it) finds the entry.
    const lookup = await owner.post<any>('/admin/catalog-entries/code-lookup', { codes: [PN.replace(/-/g, ''), `RP-${run}`, 'NOTHING-HERE'] });
    expect(lookup.status).toBe(201);
    expect(lookup.body.matches[PN.replace(/-/g, '')][0]).toMatchObject({ id, photoCount: 1 });
    expect(lookup.body.matches[`RP-${run}`][0].id).toBe(id);
    expect(lookup.body.matches['NOTHING-HERE']).toEqual([]);
  });

  it('only staff with the right permissions see and change the catalog', async () => {
    const support: Staff = await inviteStaff(t, owner, 'support');
    expect((await support.get('/admin/catalog-entries')).status).toBe(403);
    expect((await support.post('/admin/catalog-entries', input({ partNumber: `NO-${run}` }))).status).toBe(403);
    expect((await anon.get('/admin/catalog-entries')).status).toBe(401);
    const catalogStaff: Staff = await inviteStaff(t, owner, 'catalog_warehouse');
    expect((await catalogStaff.get('/admin/catalog-entries')).status).toBe(200);
  });

  it('deleting removes the entry from the site', async () => {
    const extra = await owner.post<any>('/admin/catalog-entries', input({ partNumber: `DEL-${run}`, status: 'PUBLISHED', equivalents: [], replacements: [] }));
    expect(extra.status).toBe(201);
    expect((await anon.get(`/catalog/entries/${extra.body.slug}`)).status).toBe(200);
    expect((await owner.del(`/admin/catalog-entries/${extra.body.id}`)).status).toBe(200);
    expect((await anon.get(`/catalog/entries/${extra.body.slug}`)).status).toBe(404);
    expect(await s.prisma.catalogEntryVehicle.count({ where: { entryId: extra.body.id } })).toBe(0);
  });
});

describe('bulk import (Excel/CSV through the worker)', () => {
  const HEADERS = ['شماره فنی', 'نام فارسی', 'شماره‌های معادل', 'گروه قطعه', 'برند خودرو', 'کاربرد در خودرو', 'مشخصات فنی', 'وضعیت'];

  async function workbook(rows: Array<Array<string | null>>, headers = HEADERS): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('قطعات کاتالوگ');
    ws.addRow(headers);
    for (let c = 1; c <= headers.length; c += 1) ws.getColumn(c).numFmt = '@';
    for (const r of rows) ws.addRow(r);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async function preview(file: Buffer, name = 'catalog.xlsx') {
    const up = await owner.upload<any>('/attachments', { purpose: 'IMPORT' }, [{ name, data: file }]);
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    await drainOutbox(s, ['attachment.scan'], up.body[0].id);
    const start = await owner.post<any>('/admin/catalog-entries/import', { attachmentId: up.body[0].id });
    expect(start.status, JSON.stringify(start.body)).toBe(201);
    await drainOutbox(s, ['catalog-entries.import.parse'], start.body.id);
    return (await owner.get<any>(`/admin/catalog-entries/import/${start.body.id}`)).body;
  }

  async function commit(jobId: string, duplicates: 'update' | 'skip') {
    const res = await owner.post<any>(`/admin/catalog-entries/import/${jobId}/commit`, { duplicates });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await drainOutbox(s, ['catalog-entries.import.commit'], jobId);
    return (await owner.get<any>(`/admin/catalog-entries/import/${jobId}`)).body;
  }

  it('offers a sample file with the documented columns', async () => {
    const res = await owner.raw('GET', '/admin/catalog-entries/import/template');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('spreadsheetml');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as any);
    const headers = (wb.worksheets[0]!.getRow(1).values as unknown[]).slice(1);
    expect(headers).toEqual(['شماره فنی', 'نام فارسی', 'نام انگلیسی', 'شماره‌های معادل', 'شماره‌های جایگزین', 'برند قطعه', 'گروه قطعه', 'برند خودرو', 'کاربرد در خودرو', 'مشخصات فنی', 'توضیحات', 'وضعیت']);
  });

  it('previews valid, error and existing rows; nothing is written before the commit; duplicates are updated or skipped as chosen', { timeout: 150_000 }, async () => {
    const A = `IMP-${run}-A`;
    const B = `IMP-${run}-B`;
    const vehicleText = `${vehicle.name} ${vehicle.model.name} (1395-1399)`;
    const job = await preview(await workbook([
      [A, 'قطعهٔ واردشده الف', `EQA-${run}`, 'BRAKE', 'ایران خودرو', `${vehicleText}، خودروی ناشناخته ${run}`, 'قطر: 40mm', 'منتشرشده'],
      [B, 'قطعهٔ واردشده ب', null, null, null, null, null, null],
      [PN.replace(/-/g, ' '), 'نام تازه از فایل', null, null, null, null, null, 'منتشرشده'],
      [null, 'بی شماره', null, null, null, null, null, null],
      [`imp ${run} a`, 'تکراری در فایل', null, null, null, null, null, null],
      [`ERR-${run}`, 'خطای مشخصات', null, null, null, null, 'بدون دونقطه', 'شاید'],
    ]));
    expect(job.status).toBe('PREVIEW_READY');
    expect(job.summary).toMatchObject({ total: 6, valid: 2, duplicates: 1, errors: 3 });
    const row = (n: number) => job.rows.find((r: any) => r.rowNumber === n);
    expect(row(2)).toMatchObject({ state: 'NEW', partNumber: A, issues: [] });
    expect(row(2).warnings).toEqual([`UNKNOWN_VEHICLE:خودروی ناشناخته ${run}`]);
    expect(row(4)).toMatchObject({ state: 'DUPLICATE' });
    expect(row(5).issues).toContain('PART_NUMBER_REQUIRED');
    expect(row(6).issues).toContain('DUPLICATE_IN_FILE');
    expect(row(7).issues).toEqual(expect.arrayContaining(['SPECS_INVALID', 'STATUS_INVALID']));
    expect(await s.prisma.catalogEntry.count({ where: { partNumber: { in: [A, B] } } })).toBe(0);

    const done = await commit(job.id, 'skip');
    expect(done.status).toBe('COMMITTED');
    expect(done.summary).toMatchObject({ created: 2, skipped: 1 });
    const a = await s.prisma.catalogEntry.findUnique({ where: { partNumberKey: A.replace(/-/g, '') }, include: { vehicles: true, vehicleBrands: true, numbers: true } });
    expect(a).toMatchObject({ status: 'PUBLISHED', categoryId: brake().id, productId: null });
    expect(a.vehicles).toMatchObject([{ vehicleId: vehicle.id, modelId: vehicle.model.id, yearFrom: 1395, yearTo: 1399 }]);
    expect(a.vehicleBrands.map((b: any) => b.vehicleBrandId)).toEqual([ikco().id]);
    expect(a.numbers.map((n: any) => n.number)).toEqual([`EQA-${run}`]);
    // Skipped: the existing entry keeps its name.
    expect((await s.prisma.catalogEntry.findUnique({ where: { partNumberKey: PN.replace(/-/g, '') } })).nameFa).toBe(`لنت کاتالوگی ${run}`);
    // Committing twice is refused.
    expect((await owner.post<any>(`/admin/catalog-entries/import/${job.id}/commit`, { duplicates: 'skip' })).status).toBe(409);

    // A second file (CSV) updates the existing entry: only the columns in the file change.
    const csv = Buffer.from(`${String.fromCharCode(0xfeff)}شماره فنی,نام فارسی\n${PN},نام تازه از فایل\n`, 'utf8');
    const second = await preview(csv, 'catalog.csv');
    expect(second.summary).toMatchObject({ total: 1, duplicates: 1 });
    const updated = await commit(second.id, 'update');
    expect(updated.summary).toMatchObject({ updated: 1 });
    const entry = await s.prisma.catalogEntry.findUnique({ where: { partNumberKey: PN.replace(/-/g, '') }, include: { vehicles: true, numbers: true } });
    expect(entry.nameFa).toBe('نام تازه از فایل');
    expect(entry.vehicles).toHaveLength(1);
    expect(entry.numbers).toHaveLength(2);
    expect(entry.productId).toBeTruthy();
  });

  it('a file without the required columns fails with the missing ones listed', async () => {
    const job = await preview(await workbook([['x']], ['ستون دیگر']));
    expect(job).toMatchObject({ status: 'FAILED', failureReason: 'MISSING_COLUMNS', missingColumns: ['partNumber', 'nameFa'] });
  });
});

describe('from an extracted candidate row', () => {
  it('pre-fills the form from the knowledge center without saving anything', async () => {
    const up = await owner.upload<any>('/attachments', { purpose: 'KNOWLEDGE_CATALOG' }, [{ name: 'source.csv', data: Buffer.from('part number,name\nX,Y\n') }]);
    expect(up.status).toBe(201);
    await drainOutbox(s, ['attachment.scan'], up.body[0].id);
    const doc = await owner.post<any>('/admin/knowledge-catalog', { attachmentId: up.body[0].id, title: `منبع ${run}`, version: '1' });
    expect(doc.status, JSON.stringify(doc.body)).toBe(201);
    await s.prisma.catalogDocumentChunk.create({
      data: { documentId: doc.body.id, ordinal: 1, contentText: 'row', rowStart: 2, rowEnd: 2, metadata: { sheet: 'S', fields: {}, candidatePartNumber: `DRAFT-${run}`, candidatePartName: 'قطعهٔ پیشنهادی', candidateVehicle: `${vehicle.name}، ناشناخته ${run}` } },
    });
    const before = await s.prisma.catalogEntry.count();
    const draft = await owner.get<any>(`/admin/catalog-entries/draft/${doc.body.id}/1`);
    expect(draft.status).toBe(200);
    expect(draft.body).toMatchObject({ partNumber: `DRAFT-${run}`, nameFa: 'قطعهٔ پیشنهادی', sourceDocumentId: doc.body.id, existingId: null, unmatchedVehicles: [`ناشناخته ${run}`] });
    expect(draft.body.vehicles).toEqual([{ vehicleId: vehicle.id, modelId: null, vehicleName: vehicle.name, modelName: null }]);
    expect(await s.prisma.catalogEntry.count()).toBe(before);
  });
});
