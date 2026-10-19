import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSheet } from '../../src/modules/imports/spreadsheet.js';
import { readBrandFile } from '../../src/modules/brand-imports/brand-file.js';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

async function workbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('کالاها');
  ws.addRow(['کد کالا', 'نام قطعه', 'موجودی']);
  ws.addRow(['00777', 'فیلتر هوا', '5']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** The same file written the way some exporters do: every SpreadsheetML element as <x:…>. */
async function withPrefix(bytes: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(bytes);
  for (const name of Object.keys(zip.files).filter((n) => /^xl\/(worksheets\/sheet\d+|workbook|sharedStrings|styles)\.xml$/.test(n))) {
    const xml = await zip.file(name)!.async('string');
    zip.file(name, xml.replace(` xmlns="${NS}"`, ` xmlns:x="${NS}"`).replace(/<(\/?)(?![?!])([A-Za-z]\w*)(?=[\s>/])/g, '<$1x:$2'));
  }
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
}

describe('spreadsheet reader (ExcelJS)', () => {
  it('preserves zero masks in both import paths without formatting monetary or decimal values', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Numbers');
    ws.addRow(['Part No', 'Formula', 'Amount', 'Weight', 'Literal']);
    ws.addRow([777, { formula: '700+77', result: 777 }, 1250, 1.25, '000777']);
    ws.getCell('A2').numFmt = '000000';
    ws.getCell('B2').numFmt = '000000';
    ws.getCell('C2').numFmt = '#,##0.00';
    ws.getCell('D2').numFmt = '0.00';
    const bytes = Buffer.from(await wb.xlsx.writeBuffer());
    const parsed = await readSheet(bytes, 'xlsx', { sheet: 0, headerRow: 1, maxRows: 10 });
    expect(parsed?.rows[0]?.cells.map((c) => c.value)).toEqual(['000777', '000777', 1250, 1.25, '000777']);
    expect(parsed?.rows[0]?.cells[1]?.isFormula).toBe(true);
    const dir = await mkdtemp(path.join(tmpdir(), 'hedax-number-format-'));
    try {
      const file = path.join(dir, 'numbers.xlsx');
      await writeFile(file, bytes);
      const rows = [];
      for await (const row of readBrandFile(file, 'xlsx')) rows.push(row);
      expect(rows[1]?.cells).toEqual(['000777', '000777', '1250', '1.25', '000777']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reads Persian headers and keeps leading zeros of a text SKU', async () => {
    const sheet = await readSheet(await workbook(), 'xlsx', { sheet: 0, headerRow: 1, maxRows: 10 });
    expect(sheet?.headers).toEqual(['کد کالا', 'نام قطعه', 'موجودی']);
    expect(sheet?.rows[0]?.cells[0]).toEqual({ value: '00777' });
  });

  it('reads a workbook whose XML uses a namespace prefix (x:worksheet, x:row)', async () => {
    const prefixed = await withPrefix(await workbook());
    // Plain ExcelJS cannot read this file; the reader normalises it first.
    await expect(new ExcelJS.Workbook().xlsx.load(prefixed as unknown as ArrayBuffer)).rejects.toThrow();
    const sheet = await readSheet(prefixed, 'xlsx', { sheet: 0, headerRow: 1, maxRows: 10 });
    expect(sheet?.headers).toEqual(['کد کالا', 'نام قطعه', 'موجودی']);
    expect(sheet?.rows.map((r) => r.cells.map((c) => c.value))).toEqual([['00777', 'فیلتر هوا', '5']]);
  });
});
