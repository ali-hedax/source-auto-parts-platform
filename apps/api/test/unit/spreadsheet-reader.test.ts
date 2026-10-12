import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { readSheet } from '../../src/modules/imports/spreadsheet.js';

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
