import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, type Services, type TestApp, bootApp, drainOutbox, idemKey, loginOwner, services } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Excel import with «واحد» and «کاربرد در خودرو» (headers like «کاربرد», «خودرو», «مدل خودرو»):
 * quantities follow the unit (row-numbered errors for an unknown unit or a decimal in a
 * whole-number unit), vehicles and models are matched after normalization, new ones are
 * created only when confirmed, very similar names are only linked when chosen.
 */
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

const HEADERS = ['کد کالا', 'نام قطعه', 'کد دسته', 'نوع قطعه', 'وضعیت فیزیکی', 'منشا', 'ارز پایه', 'قیمت پایه', 'موجودی', 'واحد'];

async function workbook(fitmentHeader: string, rows: Array<Array<string | number | null>>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('کالاها');
  ws.addRow([...HEADERS, fitmentHeader]);
  ws.getColumn(1).numFmt = '@';
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const row = (sku: string, onHand: string | number, unit: string | null, fitment: string | null) =>
  [sku, `قطعهٔ آزمایشی ${sku}`, 'BRAKE', 'افترمارکت', 'نو', 'داخلی', 'ریال', '1000000', onHand, unit, fitment];

async function preview(file: Buffer) {
  const up = await owner.upload('/attachments', { purpose: 'IMPORT' }, [{ name: 'products.xlsx', data: file }]);
  expect(up.status).toBe(201);
  await drainOutbox(s, ['attachment.scan'], up.body[0].id);
  const start = await owner.post<any>('/admin/imports', { attachmentId: up.body[0].id, mode: 'CREATE_AND_UPDATE' }, { 'idempotency-key': idemKey() });
  expect(start.status, JSON.stringify(start.body)).toBe(201);
  await drainOutbox(s, ['import.parse'], start.body.jobId);
  const job = (await owner.get<any>(`/admin/imports/${start.body.jobId}?pageSize=100`)).body;
  expect(job.status).toBe('PREVIEW_READY');
  return job;
}
async function commit(job: any, body: Record<string, unknown>) {
  const res = await owner.post<any>(`/admin/imports/${job.jobId}/commit`, { planChecksum: job.planChecksum, ...body });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  await drainOutbox(s, ['import.commit'], job.jobId);
  return (await owner.get<any>(`/admin/imports/${job.jobId}`)).body;
}
const fits = async (sku: string) => {
  const p = await s.prisma.product.findUniqueOrThrow({ where: { sku }, include: { vehicles: { include: { vehicle: true, model: true } }, salesUnit: true, inventory: true } });
  return { p, names: p.vehicles.map((v) => (v.model ? `${v.vehicle.name} ${v.model.name}` : v.vehicle.name)).sort() };
};

describe('Excel with «واحد» and «کاربرد در خودرو»', () => {
  it('previews counts, new vehicles, suspected duplicates and row-numbered errors; applies only what was confirmed', { timeout: 150_000 }, async () => {
    const newName = `کوییک ${run}`;
    // A vehicle of this test only, and the same name with one letter missing (very similar).
    const real = `کاروان ${run}`;
    const typo = `کاروا ${run}`;
    expect((await owner.post('/admin/vehicles', { name: real })).status).toBe(201);
    // A model of its own, so the shared test database cannot already hold one with this name.
    const peugeot = (await owner.get<any>('/admin/vehicles')).body.vehicles.find((v: any) => v.name === 'پژو');
    expect((await owner.post(`/admin/vehicles/${peugeot.id}/models`, { name: `۲۰۶ ${run}` })).status).toBe(201);
    const job = await preview(await workbook('کاربرد', [
      row(`XU1-${run}`, '۱۲٫۵', 'لیتر', `پژو 206 ${run.toLowerCase()}، دناپلاس`),
      row(`XU2-${run}`, '2.5', 'دست', 'سمند'),
      row(`XU3-${run}`, '3', 'کیلو', null),
      row(`XU4-${run}`, '4', null, `${typo}، ${newName}, پژو پارس ${run}`),
      row(`XU5-${run}`, '1.25', 'لیتر', null),
    ]));
    const issues = (n: number) => job.rows.find((r: any) => r.rowNumber === n).issues.map((i: any) => i.code);
    expect(issues(3)).toContain('NOT_A_WHOLE_NUMBER');
    expect(issues(4)).toContain('UNKNOWN_UNIT');
    expect(issues(6)).toContain('UNIT_QUANTITY_INVALID');
    expect(job.summary).toMatchObject({ create: 2, error: 3 });
    expect(job.summary.vehicles.newVehicles).toEqual([{ name: newName, rows: [5] }]);
    expect(job.summary.vehicles.newModels).toEqual([{ vehicle: 'پژو', name: `پارس ${run}`, rows: [5] }]);
    expect(job.summary.vehicles.similar).toEqual([{ text: typo, suggestion: real, rows: [5] }]);
    // Nothing exists before «تأیید».
    expect(await s.prisma.product.count({ where: { sku: { startsWith: `XU` , endsWith: run } } })).toBe(0);
    expect(await s.prisma.vehicle.count({ where: { name: newName } })).toBe(0);

    const done = await commit(job, { skipErrorRows: true, createVehicles: true, linkSimilar: [typo] });
    expect(done.status).toBe('COMMITTED');
    expect(done.summary.result).toMatchObject({ created: 2, skipped: 3, vehiclesCreated: 1, modelsCreated: 1 });

    const litre = await fits(`XU1-${run}`);
    expect(litre.p.salesUnit.name).toBe('لیتر');
    expect(litre.p.inventory[0]?.onHand).toBe(25); // 12.5 litres in steps of 0.5
    const page = (await owner.get<any>(`/admin/products/${litre.p.id}`)).body;
    expect(page.inventory.onHand).toBe(12.5);
    expect(litre.names).toEqual(['دنا پلاس', `پژو ۲۰۶ ${run}`].sort());

    const second = await fits(`XU4-${run}`);
    expect(second.p.salesUnit.name).toBe('عدد');
    expect(second.names).toEqual([real, newName, `پژو پارس ${run}`].sort());
    expect(await s.prisma.vehicle.count({ where: { name: typo } })).toBe(0);
    // Search knows the vehicles of imported parts.
    const found = (await owner.get<any>(`/admin/products?q=${encodeURIComponent(`پژو 206 ${run}`)}&pageSize=100`)).body.items.map((p: any) => p.sku);
    expect(found).toContain(`XU1-${run}`);
  });

  it('without confirmation nothing new is created and similar names stay unlinked; «خودرو» and «مدل خودرو» headers work too', { timeout: 150_000 }, async () => {
    const real = `سپهر ${run}`;
    expect((await owner.post('/admin/vehicles', { name: real })).status).toBe(201);
    for (const header of ['خودرو', 'مدل خودرو']) {
      const sku = `XV-${header === 'خودرو' ? 'A' : 'B'}-${run}`;
      const job = await preview(await workbook(header, [row(sku, '2', 'عدد', `سمند، سپه ${run}، نیسان ${run}${header.length}`)]));
      expect(job.summary.vehicles.similar.map((x: any) => x.suggestion)).toEqual([real]);
      expect(job.summary.vehicles.newVehicles.map((v: any) => v.name)).toEqual([`نیسان ${run}${header.length}`]);
      const done = await commit(job, {});
      expect(done.status).toBe('COMMITTED');
      expect((await fits(sku)).names).toEqual(['سمند']);
      expect(await s.prisma.vehicle.count({ where: { name: `نیسان ${run}${header.length}` } })).toBe(0);
    }
  });

  it('the template has the two columns with an example row', async () => {
    const res = await owner.raw('GET', '/admin/imports/template');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as never);
    const header = (wb.worksheets[0]!.getRow(1).values as unknown[]).slice(1);
    expect(header).toEqual(expect.arrayContaining(['واحد', 'کاربرد در خودرو']));
    const sample = wb.worksheets[1]!;
    const values = (n: number) => (sample.getRow(n).values as unknown[]).slice(1);
    expect(values(3)).toEqual(expect.arrayContaining(['دست', 'پژو ۲۰۶، دنا پلاس']));
    expect(values(4)).toEqual(expect.arrayContaining(['لیتر', '12.5']));
  });
});
