import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { readBrandFile } from '../../src/modules/brand-imports/brand-file.js';

async function readZip(bytes: Buffer) {
  const dir = await mkdtemp(path.join(tmpdir(), 'hedax-archive-test-'));
  try {
    const file = path.join(dir, 'catalog.zip');
    await writeFile(file, bytes);
    const rows = [];
    for await (const row of readBrandFile(file, 'zip')) rows.push(row);
    return rows;
  } finally { await rm(dir, { recursive: true, force: true }); }
}

describe('brand archive bounds', () => {
  it('reads mixed XLS/XLSX/CSV files with distinct source names and padded part numbers', async () => {
    const modern = new ExcelJS.Workbook();
    const sheet = modern.addWorksheet('Parts');
    sheet.addRow(['Part No', 'Name']);
    sheet.addRow([7, 'modern']);
    sheet.getCell('A2').numFmt = '000000';
    const legacy = XLSX.utils.book_new();
    const oldSheet = XLSX.utils.aoa_to_sheet([['Part No', 'Name'], [8, 'legacy']]);
    oldSheet.A2!.z = '000000';
    XLSX.utils.book_append_sheet(legacy, oldSheet, 'Parts');
    const zip = new JSZip()
      .file('modern/parts.xlsx', await modern.xlsx.writeBuffer())
      .file('legacy/parts.xls', XLSX.write(legacy, { type: 'buffer', bookType: 'biff8' }) as Buffer)
      .file('parts.csv', 'Part No,Name\n000009,text\n');
    const rows = await readZip(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
    expect(rows.filter(r => r.line === 2).map(r => [r.source, r.cells[0]])).toEqual([
      ['modern/parts.xlsx / Parts', '000007'], ['legacy/parts.xls / Parts', '000008'], ['parts.csv', '000009'],
    ]);
  });

  it('rejects traversal paths and nested archives before reading records', async () => {
    await expect(readZip(await new JSZip().file('../parts.csv', 'Part No\n001').generateAsync({ type: 'nodebuffer' }))).rejects.toThrow('ZIP_INVALID_NAMES');
    await expect(readZip(await new JSZip().file('other.zip', 'bytes').generateAsync({ type: 'nodebuffer' }))).rejects.toThrow('ZIP_UNSUPPORTED_SPREADSHEET');
  });

  it('rejects a fake XLS entry instead of treating text as an Excel workbook', async () => {
    await expect(readZip(await new JSZip().file('parts.xls', 'Part No\n001').generateAsync({ type: 'nodebuffer' }))).rejects.toThrow('WORKBOOK_FORMAT_MISMATCH');
  });
  it('keeps CSVs with the same basename in different folders separate', async () => {
    const zip = new JSZip();
    zip.file('hyundai/parts.csv', 'Part No,Name\n001,first\n');
    zip.file('kia/parts.csv', 'Number,Description\n002,second\n');
    const rows = await readZip(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
    expect(rows.map((r) => r.source)).toEqual(['hyundai/parts.csv', 'hyundai/parts.csv', 'kia/parts.csv', 'kia/parts.csv']);
  });

  it('rejects a forged multi-gigabyte directory before allocating it', async () => {
    const zip = new JSZip().file('parts.csv', 'Part No\n001\n');
    const bytes = await zip.generateAsync({ type: 'nodebuffer' });
    const eocd = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    bytes.writeUInt32LE(0xffffffff, eocd + 12);
    await expect(readZip(bytes)).rejects.toThrow('ZIP_INVALID');
  });

  it('rejects actual decompression beyond the declared size', async () => {
    const zip = new JSZip().file('parts.csv', 'Part No\n001\n002\n');
    const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const cd = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bytes.writeUInt32LE(1, cd + 24);
    await expect(readZip(bytes)).rejects.toThrow('ZIP_SIZE_MISMATCH');
  });
});
