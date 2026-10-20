import { mkdtemp, open, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { legacyXlsRecords, MAX_XLS_BYTES } from '../../src/modules/brand-imports/legacy-xls.js';
import { readBrandFile } from '../../src/modules/brand-imports/brand-file.js';

const temporary = vi.hoisted(() => ({ workbooks: [] as string[] }));
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, mkdtemp: async (...args: Parameters<typeof actual.mkdtemp>) => {
    const result = await actual.mkdtemp(...args);
    if (String(args[0]).includes('hedax-brand-workbook-')) temporary.workbooks.push(String(result));
    return result;
  } };
});

afterEach(() => vi.restoreAllMocks());

async function fixture(run: (file: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), 'hedax-xls-limits-'));
  try { await run(path.join(dir, 'parts.xls')); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

async function consume(file: string) {
  for await (const _row of legacyXlsRecords(file)) { /* exhaust bounded reader */ }
}

function workbook(rows: unknown[][], sheets = 1) {
  const book = XLSX.utils.book_new();
  for (let i = 0; i < sheets; i++) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), `Sheet${i}`);
  return XLSX.write(book, { type: 'buffer', bookType: 'biff8' }) as Buffer;
}

describe('legacy XLS real worker limits', () => {
  it.each(['limit rejection', 'consumer cancellation'])('removes ZIP spool files after %s', async mode => fixture(async file => {
    temporary.workbooks.length = 0;
    const rows = mode === 'limit rejection' ? [Array(201).fill('column')] : Array.from({ length: 250 }, (_, i) => [`part${i}`]);
    await writeFile(file, await new JSZip().file('parts.xls', workbook(rows)).generateAsync({ type: 'nodebuffer' }));
    const terminate = vi.spyOn(Worker.prototype, 'terminate');
    const reader = readBrandFile(file, 'zip');
    if (mode === 'limit rejection') await expect(reader.next()).rejects.toThrow('FILE_TOO_MANY_COLUMNS');
    else { expect((await reader.next()).done).toBe(false); await reader.return(undefined); }
    expect(terminate).toHaveBeenCalledOnce();
    expect(temporary.workbooks).toHaveLength(1);
    await expect(stat(temporary.workbooks[0]!)).rejects.toMatchObject({ code: 'ENOENT' });
  }));

  it('rejects oversized files before starting a parser', async () => fixture(async file => {
    const handle = await open(file, 'w');
    try { await handle.truncate(MAX_XLS_BYTES + 1); } finally { await handle.close(); }
    const terminate = vi.spyOn(Worker.prototype, 'terminate');
    await expect(consume(file)).rejects.toThrow('XLS_TOO_LARGE');
    expect(terminate).not.toHaveBeenCalled();
  }));

  it.each([
    ['sheet count', () => workbook([['part']], 101), 'XLS_TOO_MANY_SHEETS'],
    ['column count', () => workbook([Array.from({ length: 201 }, (_, i) => `c${i}`)]), 'FILE_TOO_MANY_COLUMNS'],
  ] as const)('rejects excessive %s and waits for worker exit', async (_name, bytes, error) => fixture(async file => {
    await writeFile(file, bytes());
    const terminate = vi.spyOn(Worker.prototype, 'terminate');
    await expect(consume(file)).rejects.toThrow(error);
    expect(terminate).toHaveBeenCalledOnce();
    await expect(terminate.mock.results[0]!.value).resolves.toEqual(expect.any(Number));
    await rm(file); // No remaining parser file handle, including on Windows.
  }));

  it('terminates a worker waiting for acknowledgement when the consumer cancels', async () => fixture(async file => {
    await writeFile(file, workbook(Array.from({ length: 250 }, (_, i) => [`000${i}`, 'part'])));
    const terminate = vi.spyOn(Worker.prototype, 'terminate');
    const rows = legacyXlsRecords(file);
    expect((await rows.next()).value).toMatchObject({ line: 1, cells: ['0000', 'part'] });
    await rows.return(undefined);
    expect(terminate).toHaveBeenCalledOnce();
    await expect(terminate.mock.results[0]!.value).resolves.toEqual(expect.any(Number));
    await rm(file);
  }));
});
