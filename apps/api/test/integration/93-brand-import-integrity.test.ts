import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client, type Services, type TestApp, bootApp, drainOutbox, loginOwner, services } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: TestApp;
let s: Services;
let owner: Client;
let makerId: string;
const run = Date.now().toString(36).toUpperCase();

beforeAll(async () => {
  t = await bootApp();
  s = await services(t);
  owner = await loginOwner(t);
  const res = await owner.post<any>('/admin/manufacturer-brands', { nameFa: `Integrity ${run}`, nameEn: `Integrity ${run}`, active: true });
  expect(res.status).toBe(201);
  makerId = res.body.id;
});
afterAll(async () => { await t?.close(); });

async function importCsv(rows: string[], execute = true) {
  const up = await owner.upload<any>('/admin/brand-imports/upload', { manufacturerBrandId: makerId, source: 'integrity' }, [
    { name: 'integrity.csv', data: Buffer.from(['Part No,Description,Interchange', ...rows].join('\n')), field: 'file' },
  ]);
  expect(up.status, JSON.stringify(up.body)).toBe(201);
  const id = up.body.id as string;
  await drainOutbox(s, ['brand-import.inspect'], id);
  const mapped = await owner.put<any>(`/admin/brand-imports/${id}/mapping`, {
    mapping: { partNumber: ['Part No'], nameFa: ['Description'], equivalents: ['Interchange'] },
    options: { publish: true, partType: 'GENUINE', encoding: 'auto' },
  });
  expect(mapped.status).toBe(200);
  await drainOutbox(s, ['brand-import.preview'], id);
  if (!execute) return id;
  expect((await owner.post(`/admin/brand-imports/${id}/start`, {})).status).toBe(201);
  await drainOutbox(s, ['brand-import.run'], id);
  expect((await owner.get<any>(`/admin/brand-imports/${id}`)).body.status).toBe('COMPLETED');
  return id;
}

async function undo(id: string) {
  expect((await owner.post(`/admin/brand-imports/${id}/rollback`, {})).status).toBe(201);
  // Direct invocation gives a useful failure if the worker throws; a bounded timeout catches loops.
  await s.brandImports.undo(id);
  const view = (await owner.get<any>(`/admin/brand-imports/${id}`)).body;
  expect(view.status).toBe('ROLLED_BACK');
  expect(await s.prisma.brandImportChange.count({ where: { importId: id } })).toBe(0);
  return view;
}

describe('brand import preserves later work', () => {
  it('serializes imports of the same brand and reports a worker failure honestly', async () => {
    const first = await importCsv([`SAFE-${run}-BUSY1,first,`], false);
    const second = await importCsv([`SAFE-${run}-BUSY2,second,`], false);
    expect((await owner.post(`/admin/brand-imports/${first}/start`, {})).status).toBe(201);
    const blocked = await owner.post<any>(`/admin/brand-imports/${second}/start`, {});
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('BRAND_IMPORT_BUSY');
    const failure = vi.spyOn(s.brandImports, 'applyBatch').mockRejectedValueOnce(new Error('Synthetic batch failure'));
    try { await s.brandImports.run(first); } finally { failure.mockRestore(); }
    const failed = (await owner.get<any>(`/admin/brand-imports/${first}`)).body;
    expect(failed).toMatchObject({ status: 'FAILED', failureReason: 'STOPPED_WITH_ERROR', canRollback: true });
    expect(await s.prisma.auditLog.count({ where: { entityId: first, action: 'brand_import.failed' } })).toBe(1);
    expect(await s.prisma.auditLog.count({ where: { entityId: first, action: 'brand_import.completed' } })).toBe(0);
    await undo(first);
  });

  it('undo preserves a priced new part, completes, and is idempotent', { timeout: 45_000 }, async () => {
    const id = await importCsv([`SAFE-${run}-1,original,`]);
    const p = await s.prisma.product.findFirstOrThrow({ where: { sourceBrandImportId: id } });
    await s.prisma.productPrice.create({ data: { productId: p.id, baseCurrency: 'IRR', baseAmountMinor: 123456n } });
    const view = await undo(id);
    expect(view.stats).toMatchObject({ preserved: 1, deleted: 0 });
    const kept = await s.prisma.product.findUniqueOrThrow({ where: { id: p.id }, include: { basePrice: true } });
    expect(kept).toMatchObject({ archivedAt: null, published: true, partNumberKey: p.partNumberKey, basePrice: { baseAmountMinor: 123456n } });
    await s.brandImports.undo(id);
    expect((await s.prisma.brandImport.findUniqueOrThrow({ where: { id } })).stats.preserved).toBe(1);
    expect(await s.prisma.auditLog.count({ where: { entityId: id, action: 'brand_import.rolled_back' } })).toBe(1);
  });

  it('undo preserves a later staff edit, including translated name and equivalent number', async () => {
    const first = await importCsv([`SAFE-${run}-2,first,EQ-FIRST`]);
    const p = await s.prisma.product.findFirstOrThrow({ where: { sourceBrandImportId: first } });
    const second = await importCsv([`SAFE-${run}-2,second,EQ-SECOND`]);
    const current = await s.prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    // Same transaction and optimistic product version used by the staff editor.
    await s.prisma.tx(async (tx: any) => {
      await tx.product.update({ where: { id: p.id }, data: { version: { increment: 1 } } });
      await tx.productTranslation.update({ where: { productId_locale: { productId: p.id, locale: 'fa' } }, data: { name: 'Later staff edit' } });
      await tx.productNumber.create({ data: { productId: p.id, number: 'MANUAL-3', numberKey: 'MANUAL3', kind: 'EQUIVALENT', sortOrder: 3 } });
    });
    expect((await undo(second)).stats).toMatchObject({ preserved: 1, restored: 0 });
    const kept = await s.prisma.product.findUniqueOrThrow({ where: { id: p.id }, include: { translations: true, numbers: true } });
    expect(kept.version).toBe(current.version + 1);
    expect(kept.translations.find((x: any) => x.locale === 'fa').name).toBe('Later staff edit');
    expect(kept.numbers.map((x: any) => x.number)).toContain('MANUAL-3');
  });

  it('relation-only imports advance the version and untouched changes can be restored', async () => {
    const first = await importCsv([`SAFE-${run}-3,same,EQ-A`]);
    const p = await s.prisma.product.findFirstOrThrow({ where: { sourceBrandImportId: first } });
    const second = await importCsv([`SAFE-${run}-3,same,EQ-B`]);
    expect((await s.prisma.product.findUniqueOrThrow({ where: { id: p.id } })).version).toBe(p.version + 1);
    expect((await undo(second)).stats.restored).toBe(1);
    expect((await s.prisma.productNumber.findMany({ where: { productId: p.id } })).map((n: any) => n.number)).toEqual(['EQ-A']);
  });

  it('legacy imports without checkpoints are preserved and explained', async () => {
    const id = await importCsv([`SAFE-${run}-4,legacy,`]);
    const c = await s.prisma.brandImportChange.findFirstOrThrow({ where: { importId: id } });
    await s.prisma.brandImportChange.update({ where: { id: c.id }, data: { before: {} } });
    expect((await undo(id)).stats.preserved).toBe(1);
    const report = await (await owner.raw('GET', `/admin/brand-imports/${id}/errors.csv`)).text();
    expect(report).toContain('Legacy import has no safe undo checkpoint');
  });

  it('CSV error reports neutralize spreadsheet formulas in untrusted cells', async () => {
    const id = await importCsv([`SAFE-${run}-5,report,`]);
    await s.prisma.brandImportError.create({ data: { importId: id, rowRef: '=1+1', partNumber: '+2+2', codes: ['TEST'], detail: '@SUM(1)' } });
    const report = await (await owner.raw('GET', `/admin/brand-imports/${id}/errors.csv`)).text();
    expect(report).toContain('"\'=1+1"');
    expect(report).toContain('"\'+2+2"');
    expect(report).toContain('"\'@SUM(1)"');
    expect((await undo(id)).stats.deleted).toBe(1);
  });
});
