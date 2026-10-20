import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { Client, type Services, type TestApp, bootApp, drainOutbox, loginOwner, services } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
let app: TestApp;
let s: Services;
let owner: Client;
let makerId: string;
const run = Date.now().toString(36).toUpperCase();

beforeAll(async () => {
  app = await bootApp();
  s = await services(app);
  owner = await loginOwner(app);
  const maker = await owner.post<any>('/admin/manufacturer-brands', { nameFa: `Workbook ${run}`, active: true });
  expect(maker.status).toBe(201);
  makerId = maker.body.id;
});
afterAll(async () => { await app?.close(); });

async function upload(bytes: Buffer, source: string, manufacturerBrandId = makerId) {
  const up = await owner.upload<any>('/admin/brand-imports/upload', { manufacturerBrandId, source }, [{ name: 'books.zip', data: bytes, field: 'file' }]);
  expect(up.status, JSON.stringify(up.body)).toBe(201);
  await drainOutbox(s, ['brand-import.inspect'], up.body.id);
  return (await owner.get<any>(`/admin/brand-imports/${up.body.id}`)).body;
}

async function previewAndRun(view: any) {
  const mapped = await owner.put<any>(`/admin/brand-imports/${view.id}/mapping`, { mapping: {}, options: view.options });
  expect(mapped.status, JSON.stringify(mapped.body)).toBe(200);
  await drainOutbox(s, ['brand-import.preview'], view.id);
  const preview = (await owner.get<any>(`/admin/brand-imports/${view.id}`)).body;
  expect(preview.status).toBe('PREVIEW_READY');
  expect((await owner.post(`/admin/brand-imports/${view.id}/start`, {})).status).toBe(201);
  await drainOutbox(s, ['brand-import.run'], view.id);
  const done = (await owner.get<any>(`/admin/brand-imports/${view.id}`)).body;
  expect(done.status).toBe('COMPLETED');
  return { preview, done };
}

describe('reviewed workbook sources', () => {
  it('accepts per-source mapping and exclusion for old inspections without sampled header metadata', async () => {
    // Keep this regression independent of the existing maker/profile count assertions.
    const maker = await owner.post<any>('/admin/manufacturer-brands', { nameFa: `Old inspection ${run}`, active: true });
    expect(maker.status).toBe(201);
    const zip = new JSZip()
      .file('one.csv', `Part No,Name\nOLD-${run}-A,first\n`)
      .file('two.csv', `Code,Description\nOLD-${run}-B,second\n`)
      .file('excluded.csv', 'Other,Label\nOLD-EXCLUDED,skip\n');
    const view = await upload(await zip.generateAsync({ type: 'nodebuffer' }), `old-inspection-${run}`, maker.body.id);
    const { sources: _sources, ...oldOptions } = view.options;
    const oldOutline = view.outline.map((source: any) => ({
      name: source.name, headers: source.headers, samples: source.samples,
      encoding: source.encoding, delimiter: source.delimiter,
    }));
    await s.prisma.brandImport.update({ where: { id: view.id }, data: {
      outline: oldOutline, options: oldOptions, mapping: { partNumber: ['Part No'], nameEn: ['Name'] },
    } });
    const old = (await owner.get<any>(`/admin/brand-imports/${view.id}`)).body;
    expect(old.options.sources).toBeUndefined();
    expect(old.outline.every((source: any) => source.sampleRows === undefined && source.headerRow === undefined)).toBe(true);
    old.options.sources = {
      'one.csv': { enabled: true, headerRow: 1, mapping: { partNumber: ['Part No'], nameEn: ['Name'] } },
      'two.csv': { enabled: true, headerRow: 1, mapping: { partNumber: ['Code'], nameEn: ['Description'] } },
      'excluded.csv': { enabled: false, headerRow: 1, mapping: {} },
    };
    const { preview, done } = await previewAndRun(old);
    expect(preview.stats).toMatchObject({ rows: 2, new: 2, error: 0 });
    expect(done.stats.created).toBe(2);
    const parts = await s.prisma.product.findMany({ where: { sourceBrandImportId: view.id }, include: { translations: true } });
    expect(parts.map((part: any) => [part.partNumber, part.translations.find((text: any) => text.locale === 'en')?.name]).sort()).toEqual([
      [`OLD-${run}-A`, 'first'], [`OLD-${run}-B`, 'second'],
    ]);
  });

  it('imports different sheet layouts, excludes another maker, ignores old prices, and reuses a headerless profile', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Parts');
    sheet.addRow(['Historical supplier list']);
    sheet.addRow(['كد كالا', 'نام كالا', 'قيمت (ریال)', 'تعداد درخواستی']);
    sheet.addRow([`BOOK-${run}-A`, 'قطعه نمونه', 998877, 100]);
    sheet.addRow(['كد كالا', 'نام كالا', 'قيمت (ریال)', 'تعداد درخواستی']); // repeated print heading
    const old = XLSX.utils.book_new();
    const oldSheet = XLSX.utils.aoa_to_sheet([[777, 'legacy first', 888888], [778, 'legacy second', 999999]]);
    oldSheet.A1!.z = '000000';
    oldSheet.A2!.z = '000000';
    XLSX.utils.book_append_sheet(old, oldSheet, 'Parts');
    const zip = new JSZip()
      .file('modern.xlsx', await book.xlsx.writeBuffer())
      .file('legacy.xls', XLSX.write(old, { type: 'buffer', bookType: 'biff8' }) as Buffer)
      .file('different-maker.csv', 'Part No,Name\nDO-NOT-IMPORT,other maker\n');
    const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const view = await upload(bytes, `layouts-${run}`);
    expect(view.status).toBe('AWAITING_MAPPING');
    expect(view.outline.find((x: any) => x.name === 'modern.xlsx / Parts')).toMatchObject({ headerRow: 2, needsHeaderReview: false });
    expect(view.options.sources['modern.xlsx / Parts'].mapping).toMatchObject({ partNumber: ['كد كالا'], nameFa: ['نام كالا'] });
    view.options.sources['legacy.xls / Parts'] = { enabled: true, headerRow: 0, mapping: { partNumber: ['Column 1'], nameEn: ['Column 2'] } };
    view.options.sources['different-maker.csv'].enabled = false;
    const { preview, done } = await previewAndRun(view);
    expect(preview.stats).toMatchObject({ rows: 3, new: 3, error: 0 });
    expect(done.stats.created).toBe(3);
    const parts = await s.prisma.product.findMany({ where: { sourceBrandImportId: view.id }, include: { basePrice: true, inventory: true } });
    expect(parts.map((p: any) => p.partNumber).sort()).toEqual(['000777', '000778', `BOOK-${run}-A`]);
    expect(parts.every((p: any) => p.basePrice === null && p.inventory.every((i: any) => i.onHand === 0))).toBe(true);
    expect(await s.prisma.product.count({ where: { manufacturerBrandId: makerId, partNumber: 'DO-NOT-IMPORT' } })).toBe(0);
    const again = await upload(bytes, `layouts-${run}`);
    expect(again.options.sources['legacy.xls / Parts']).toMatchObject({ headerRow: 0, mapping: { partNumber: ['Column 1'] } });
    expect(again.options.sources['different-maker.csv'].enabled).toBe(false);
    const repeated = await previewAndRun(again);
    expect(repeated.preview.stats).toMatchObject({ rows: 3, new: 0, update: 3 });
    expect(repeated.done.stats.created).toBe(0);
    expect(await s.prisma.product.count({ where: { manufacturerBrandId: makerId } })).toBe(3);
  });

  it('rejects unknown sources, uninspected header rows, missing mappings, and an empty selection', async () => {
    const zip = new JSZip().file('one.csv', 'Part No,Name\n000001,part\n').file('two.csv', 'کد کالا,نام کالا\n000002,قطعه\n');
    const view = await upload(await zip.generateAsync({ type: 'nodebuffer' }), `validation-${run}`);
    const save = (sources: any) => owner.put<any>(`/admin/brand-imports/${view.id}/mapping`, { mapping: {}, options: { ...view.options, sources } });
    expect((await save({ ...view.options.sources, 'unknown.csv': { enabled: false, headerRow: 0, mapping: {} } })).status).toBe(400);
    expect((await save({ ...view.options.sources, 'one.csv': { enabled: true, headerRow: 999, mapping: { partNumber: ['Part No'] } } })).status).toBe(400);
    expect((await save({ ...view.options.sources, 'two.csv': { enabled: true, headerRow: 1, mapping: {} } })).status).toBe(400);
    expect((await save(Object.fromEntries(Object.entries(view.options.sources).map(([name, choice]: [string, any]) => [name, { ...choice, enabled: false }])))).status).toBe(400);
    expect((await owner.get<any>(`/admin/brand-imports/${view.id}`)).body.status).toBe('AWAITING_MAPPING');
  });
});
