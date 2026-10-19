import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client, type Services, type TestApp, bootApp, drainOutbox, loginOwner, services } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- compiled service and fault-injection transaction proxies */
let app: TestApp;
let s: Services;
let owner: Client;
const run = Date.now().toString(36).toUpperCase();
const number = (i: number) => `REC-${run}-${i}`;
const dataRow = (i: number) => `${number(i)},${i === 1 ? 'stable' : `after ${i}`},${i === 0 || i === 500 ? 'Unknown recovery vehicle' : ''}`;
// Invalid/duplicate rows straddle the raw-row batch boundary; vehicle errors occur on both sides.
const input = [...Array.from({ length: 248 }, (_, i) => dataRow(i)), ',missing number,',
  ...Array.from({ length: 252 }, (_, i) => dataRow(i + 248)), dataRow(0), ',missing again,', dataRow(500), dataRow(501), dataRow(0)];
const expected = { created: 500, updated: 1, unchanged: 1, duplicate: 2, error: 2, unknownVehicles: 2 };

beforeAll(async () => {
  app = await bootApp();
  s = await services(app);
  owner = await loginOwner(app);
});
afterAll(async () => { vi.restoreAllMocks(); await app?.close(); });

async function maker(label: string) {
  const res = await owner.post<any>('/admin/manufacturer-brands', { nameFa: `Recovery ${run} ${label}`, nameEn: `Recovery ${label}`, active: true });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function queue(makerId: string, rows: string[]) {
  const up = await owner.upload<any>('/admin/brand-imports/upload', { manufacturerBrandId: makerId, source: 'recovery' }, [
    { name: 'recovery.csv', data: Buffer.from(['Part No,Description,Model', ...rows].join('\n')), field: 'file' },
  ]);
  expect(up.status, JSON.stringify(up.body)).toBe(201);
  const id = up.body.id as string;
  await drainOutbox(s, ['brand-import.inspect'], id);
  const mapped = await owner.put(`/admin/brand-imports/${id}/mapping`, {
    mapping: { partNumber: ['Part No'], nameFa: ['Description'], fitment: ['Model'] },
    options: { publish: false, partType: 'GENUINE', encoding: 'auto' },
  });
  expect(mapped.status).toBe(200);
  await drainOutbox(s, ['brand-import.preview'], id);
  expect((await owner.post(`/admin/brand-imports/${id}/start`, {})).status).toBe(201);
  return id;
}

async function seeded(label: string) {
  const makerId = await maker(label);
  const seed = await queue(makerId, [`${number(0)},before 0,`, `${number(1)},stable,`]);
  await s.brandImports.run(seed);
  expect((await s.prisma.brandImport.findUniqueOrThrow({ where: { id: seed } })).status).toBe('COMPLETED');
  return { makerId, id: await queue(makerId, input) };
}

async function errors(id: string) {
  const rows = await s.prisma.brandImportError.findMany({ where: { importId: id }, select: { rowRef: true, partNumber: true, codes: true, detail: true } });
  return rows.sort((a: any, b: any) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

/** Simulate a committed batch followed by a lost worker/DB connection, before run() can acknowledge it. */
async function interruptAfterCommit(id: string) {
  const stopped = new Error('Simulated worker connection lost after commit');
  const apply = s.brandImports.applyBatch.bind(s.brandImports);
  const tx = s.prisma.tx.bind(s.prisma);
  let disconnected = false;
  const txSpy = vi.spyOn(s.prisma, 'tx').mockImplementation((...args: any[]) => disconnected ? Promise.reject(stopped) : tx(...args));
  const batchSpy = vi.spyOn(s.brandImports, 'applyBatch').mockImplementation(async (...args: any[]) => {
    await apply(...args);
    disconnected = true;
    throw stopped;
  });
  try { await expect(s.brandImports.run(id)).rejects.toThrow(stopped.message); }
  finally { batchSpy.mockRestore(); txSpy.mockRestore(); }
  expect((await s.prisma.brandImport.findUniqueOrThrow({ where: { id } })).status).toBe('RUNNING');
}

describe('brand import durable recovery', () => {
  it('resumes after a committed batch with the same totals/report as an uninterrupted run and preserves an edited number', async () => {
    const baseline = await seeded('baseline');
    await s.brandImports.run(baseline.id);
    const normal = await s.prisma.brandImport.findUniqueOrThrow({ where: { id: baseline.id } });
    expect(normal.stats).toMatchObject(expected);

    const resumed = await seeded('resumed');
    await interruptAfterCommit(resumed.id);
    const partial = await s.prisma.brandImport.findUniqueOrThrow({ where: { id: resumed.id } });
    expect(partial.processedRows).toBeGreaterThan(0);
    expect(partial.stats.created).toBe(await s.prisma.product.count({ where: { sourceBrandImportId: resumed.id } }));
    const original = await s.prisma.product.findFirstOrThrow({ where: { sourceBrandImportId: resumed.id, partNumber: number(2) } });
    await s.prisma.product.update({ where: { id: original.id }, data: { partNumber: 'STAFF-EDITED', partNumberKey: 'STAFFEDITED', version: { increment: 1 } } });
    const committedErrorCount = await s.prisma.brandImportError.count({ where: { importId: resumed.id } });
    expect(committedErrorCount).toBeGreaterThan(0);

    await s.brandImports.run(resumed.id);
    const done = await s.prisma.brandImport.findUniqueOrThrow({ where: { id: resumed.id } });
    expect(done).toMatchObject({ status: 'COMPLETED', processedRows: input.length, totalRows: input.length, stats: expected });
    expect(await errors(resumed.id)).toEqual(await errors(baseline.id));
    expect(await s.prisma.product.count({ where: { manufacturerBrandId: resumed.makerId } })).toBe(502);
    expect(await s.prisma.product.count({ where: { manufacturerBrandId: resumed.makerId, partNumber: number(2) } })).toBe(0);
    expect(await s.prisma.product.findUniqueOrThrow({ where: { id: original.id } })).toMatchObject({ partNumber: 'STAFF-EDITED', version: original.version + 1 });
    expect(await s.prisma.brandImportChange.count({ where: { importId: resumed.id, action: 'CREATED' } })).toBe(500);
    expect(await s.prisma.brandImportChange.count({ where: { importId: resumed.id, action: 'UPDATED' } })).toBe(1);
    expect(await s.prisma.auditLog.count({ where: { entityId: resumed.id, action: 'brand_import.completed' } })).toBe(1);
    expect(await s.prisma.auditLog.count({ where: { entityId: resumed.id, action: 'brand_import.failed' } })).toBe(0);
    await s.brandImports.run(resumed.id); // Terminal redelivery is a no-op.
    expect((await s.prisma.brandImport.findUniqueOrThrow({ where: { id: resumed.id } })).stats).toEqual(done.stats);
    expect((await owner.post(`/admin/brand-imports/${resumed.id}/rollback`, {})).status).toBe(201);
    await s.brandImports.undo(resumed.id);
    expect((await s.prisma.brandImport.findUniqueOrThrow({ where: { id: resumed.id } })).stats).toMatchObject({ preserved: 1, deleted: 499, restored: 1 });
    expect(await s.prisma.brandImportChange.count({ where: { importId: resumed.id } })).toBe(0);
  });

  it('rejects a stale competing delivery without overwriting the winning counters, report or completion', async () => {
    const job = await seeded('competing');
    const apply = s.brandImports.applyBatch.bind(s.brandImports);
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    let first = true;
    const spy = vi.spyOn(s.brandImports, 'applyBatch').mockImplementation(async (...args: any[]) => {
      if (first) { first = false; entered(); await gate; }
      return apply(...args);
    });
    const losing = s.brandImports.run(job.id).then(() => null, (error: Error) => error);
    try {
      await started;
      await s.brandImports.run(job.id);
    } finally { release(); }
    try { expect(await losing).toBeInstanceOf(Error); }
    finally { spy.mockRestore(); }
    const done = await s.prisma.brandImport.findUniqueOrThrow({ where: { id: job.id } });
    expect(done).toMatchObject({ status: 'COMPLETED', processedRows: input.length, stats: expected });
    expect((await errors(job.id)).length).toBe(6);
    expect(await s.prisma.product.count({ where: { manufacturerBrandId: job.makerId } })).toBe(502);
    expect(await s.prisma.auditLog.count({ where: { entityId: job.id, action: 'brand_import.completed' } })).toBe(1);
    expect(await s.prisma.auditLog.count({ where: { entityId: job.id, action: 'brand_import.failed' } })).toBe(0);
  });

  it('rolls back products, errors and undo records if saving the batch checkpoint fails', async () => {
    const makerId = await maker('atomic');
    const id = await queue(makerId, [dataRow(0), ',missing number,']);
    const tx = s.prisma.tx.bind(s.prisma);
    let injected = false;
    const spy = vi.spyOn(s.prisma, 'tx').mockImplementation((fn: any, options: any) => tx(async (client: any) => {
      const guarded = new Proxy(client, { get(target, key) {
        if (key !== 'brandImport') return Reflect.get(target, key);
        return new Proxy(client.brandImport, { get(model, method) {
          if (method !== 'update') return Reflect.get(model, method);
          return async (args: any) => {
            if (!injected && args.data.processedRows > 0) { injected = true; throw new Error('Synthetic checkpoint write failure'); }
            return model.update(args);
          };
        } });
      } });
      return fn(guarded);
    }, options));
    try { await s.brandImports.run(id); } finally { spy.mockRestore(); }
    expect(injected).toBe(true);
    expect(await s.prisma.product.count({ where: { manufacturerBrandId: makerId } })).toBe(0);
    expect(await s.prisma.brandImportChange.count({ where: { importId: id } })).toBe(0);
    expect(await s.prisma.brandImportError.count({ where: { importId: id } })).toBe(0);
    expect(await s.prisma.brandImport.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'FAILED', processedRows: 0, stats: { created: 0, error: 0, unknownVehicles: 0 } });
    expect(await s.prisma.auditLog.count({ where: { entityId: id, action: 'brand_import.failed' } })).toBe(1);
  });

  it('holds a legacy RUNNING import without a checkpoint for review, retaining its data and report', async () => {
    const makerId = await maker('legacy-running');
    const id = await queue(makerId, [dataRow(0)]);
    await s.brandImports.run(id);
    const completed = await s.prisma.brandImport.findUniqueOrThrow({ where: { id } });
    const legacyStats = { ...completed.stats };
    delete legacyStats.runCheckpoint;
    await s.prisma.brandImport.update({ where: { id }, data: { status: 'RUNNING', processedRows: 0, finishedAt: null, stats: legacyStats } });
    const beforeErrors = await errors(id);
    const p = await s.prisma.product.findFirstOrThrow({ where: { sourceBrandImportId: id } });
    await s.prisma.product.update({ where: { id: p.id }, data: { partNumber: 'LEGACY-EDITED', partNumberKey: 'LEGACYEDITED', version: { increment: 1 } } });
    await s.brandImports.run(id);
    expect(await s.prisma.brandImport.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'FAILED', failureReason: 'IMPORT_RECOVERY_REVIEW_REQUIRED', stats: legacyStats });
    expect(await errors(id)).toEqual(beforeErrors);
    expect(await s.prisma.product.count({ where: { manufacturerBrandId: makerId } })).toBe(1);
    expect(await s.prisma.brandImportChange.count({ where: { importId: id } })).toBe(1);
    expect((await owner.get<any>(`/admin/brand-imports/${id}`)).body.canRollback).toBe(true);
  });

  it('initializes a legacy QUEUED import only when it has no committed work or report', async () => {
    const id = await queue(await maker('legacy-queued'), [dataRow(2)]);
    const queued = await s.prisma.brandImport.findUniqueOrThrow({ where: { id } });
    const legacyStats = { ...queued.stats };
    delete legacyStats.runCheckpoint;
    await s.prisma.brandImport.update({ where: { id }, data: { stats: legacyStats } });
    await s.brandImports.run(id);
    expect(await s.prisma.brandImport.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'COMPLETED', processedRows: 1, stats: { created: 1 } });
  });

  it.each(['changed', 'shortened'])('stops recovery if the committed source prefix is %s', async (mode) => {
    const makerId = await maker(`source-${mode}`);
    const id = await queue(makerId, [dataRow(0)]);
    await interruptAfterCommit(id); // Last batch committed, completion not yet acknowledged.
    const before = await s.prisma.brandImport.findUniqueOrThrow({ where: { id } });
    const beforeErrors = await errors(id);
    const rows = s.brandImports.rows.bind(s.brandImports);
    const spy = vi.spyOn(s.brandImports, 'rows').mockImplementation(async function* (...args: any[]) {
      if (mode === 'shortened') return;
      for await (const row of rows(...args)) yield { ...row, cells: { ...row.cells, Description: 'different source content' } };
    });
    try { await s.brandImports.run(id); } finally { spy.mockRestore(); }
    expect(await s.prisma.brandImport.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'FAILED', processedRows: before.processedRows, stats: before.stats });
    expect(await errors(id)).toEqual(beforeErrors);
    expect(await s.prisma.product.count({ where: { manufacturerBrandId: makerId } })).toBe(1);
    expect(await s.prisma.brandImportChange.count({ where: { importId: id } })).toBe(1);
    expect(await s.prisma.auditLog.count({ where: { entityId: id, action: 'brand_import.completed' } })).toBe(0);
  });
});
