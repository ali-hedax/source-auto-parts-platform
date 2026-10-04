import { describe, expect, it } from 'vitest';
import { checkBatch, inspectFile, neutralizeSpreadsheetText, sanitizeDisplayFilename } from '../src/index.js';

/** Builds a minimal stored (uncompressed) ZIP archive; enough for central-directory checks. */
function buildZip(entries: Array<{ name: string; data?: string; flags?: number; fakeUncompressed?: number }>): Uint8Array {
  const enc = new TextEncoder();
  const local: number[] = [];
  const central: number[] = [];
  const u16 = (arr: number[], v: number) => arr.push(v & 0xff, (v >> 8) & 0xff);
  const u32 = (arr: number[], v: number) => arr.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  for (const e of entries) {
    const name = enc.encode(e.name);
    const data = enc.encode(e.data ?? '<x/>');
    const offset = local.length;
    u32(local, 0x04034b50); u16(local, 20); u16(local, e.flags ?? 0); u16(local, 0); u32(local, 0); u32(local, 0);
    u32(local, data.length); u32(local, data.length); u16(local, name.length); u16(local, 0);
    local.push(...name, ...data);
    u32(central, 0x02014b50); u16(central, 20); u16(central, 20); u16(central, e.flags ?? 0); u16(central, 0); u32(central, 0);
    u32(central, 0); u32(central, data.length); u32(central, e.fakeUncompressed ?? data.length);
    u16(central, name.length); u16(central, 0); u16(central, 0); u16(central, 0); u16(central, 0); u32(central, 0); u32(central, offset);
    central.push(...name);
  }
  const eocd: number[] = [];
  u32(eocd, 0x06054b50); u16(eocd, 0); u16(eocd, 0); u16(eocd, entries.length); u16(eocd, entries.length);
  u32(eocd, central.length); u32(eocd, local.length); u16(eocd, 0);
  return new Uint8Array([...local, ...central, ...eocd]);
}

const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(32).fill(0x20)]);

describe('upload inspection (§11)', () => {
  it('accepts real images and PDFs by magic bytes', () => {
    expect(inspectFile('a.jpg', bytes(0xff, 0xd8, 0xff, 0xe0)).verdict).toBe('ACCEPT');
    expect(inspectFile('a.png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)).verdict).toBe('ACCEPT');
    expect(inspectFile('a.pdf', new TextEncoder().encode('%PDF-1.7\n1 0 obj<<>>endobj')).verdict).toBe('ACCEPT');
  });

  it('rejects content that does not match the extension', () => {
    expect(inspectFile('photo.jpg', bytes(0x89, 0x50, 0x4e, 0x47))).toMatchObject({ verdict: 'REJECT', reason: 'CONTENT_MISMATCH' });
    expect(inspectFile('invoice.pdf', bytes(0x4d, 0x5a, 0x90, 0x00))).toMatchObject({ verdict: 'REJECT', reason: 'EXECUTABLE_CONTENT' });
  });

  it('rejects disallowed extensions (html, svg, exe, zip, xlsm)', () => {
    for (const name of ['a.html', 'a.svg', 'a.exe', 'a.zip', 'a.xlsm', 'a.docm', 'noext']) {
      expect(inspectFile(name, bytes(0x41)).reason).toBe('EXTENSION_NOT_ALLOWED');
    }
  });

  it('rejects PDFs with active content', () => {
    const pdf = new TextEncoder().encode('%PDF-1.4\n<< /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>');
    expect(inspectFile('x.pdf', pdf).reason).toBe('PDF_ACTIVE_CONTENT');
  });

  it('validates OOXML structure, macros, encryption and zip bombs', () => {
    const xlsx = buildZip([{ name: '[Content_Types].xml' }, { name: 'xl/workbook.xml' }, { name: 'xl/worksheets/sheet1.xml' }]);
    expect(inspectFile('parts.xlsx', xlsx).verdict).toBe('ACCEPT');
    expect(inspectFile('parts.docx', xlsx).reason).toBe('CONTENT_MISMATCH');
    const macro = buildZip([{ name: '[Content_Types].xml' }, { name: 'xl/workbook.xml' }, { name: 'xl/vbaProject.bin' }]);
    expect(inspectFile('parts.xlsx', macro).reason).toBe('MACRO_CONTENT');
    const encrypted = buildZip([{ name: '[Content_Types].xml', flags: 1 }, { name: 'xl/workbook.xml' }]);
    expect(inspectFile('parts.xlsx', encrypted).reason).toBe('ENCRYPTED_OR_UNREADABLE');
    const bomb = buildZip([{ name: '[Content_Types].xml' }, { name: 'xl/workbook.xml', fakeUncompressed: 400 * 1024 * 1024 }]);
    expect(inspectFile('parts.xlsx', bomb).reason).toBe('ZIP_LIMITS_EXCEEDED');
    const traversal = buildZip([{ name: '../evil' }, { name: '[Content_Types].xml' }, { name: 'xl/workbook.xml' }]);
    expect(inspectFile('parts.xlsx', traversal).reason).toBe('ZIP_INVALID');
    const ole = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    expect(inspectFile('locked.docx', ole).reason).toBe('ENCRYPTED_OR_UNREADABLE');
    expect(inspectFile('old.doc', ole)).toMatchObject({ verdict: 'ACCEPT', flags: { legacyOffice: true } });
  });

  it('checks CSV encoding and markup', () => {
    expect(inspectFile('a.csv', new TextEncoder().encode('sku,name_fa\nHX1,فیلتر')).verdict).toBe('ACCEPT');
    expect(inspectFile('a.csv', new TextEncoder().encode('<html>')).reason).toBe('MARKUP_CONTENT');
    expect(inspectFile('a.csv', new Uint8Array([0xff, 0xfe, 0x41])).reason).toBe('INVALID_TEXT_ENCODING');
  });

  it('enforces batch limits (10 files, 20MB each, 50MB total)', () => {
    const mb = 1024 * 1024;
    expect(checkBatch(new Array(11).fill({ size: 1 }))).toEqual({ ok: false, reason: 'TOO_MANY_FILES' });
    expect(checkBatch([{ size: 21 * mb }])).toEqual({ ok: false, reason: 'FILE_TOO_LARGE' });
    expect(checkBatch([{ size: 20 * mb }, { size: 20 * mb }, { size: 11 * mb }])).toEqual({ ok: false, reason: 'BATCH_TOO_LARGE' });
    expect(checkBatch([{ size: 20 * mb }, { size: 20 * mb }])).toEqual({ ok: true });
  });

  it('sanitizes display names and spreadsheet cells', () => {
    expect(sanitizeDisplayFilename('C:\\fakepath\\invoice\u202Efdp.exe')).toBe('invoicefdp.exe');
    expect(neutralizeSpreadsheetText('=HYPERLINK("x")')).toBe('\'=HYPERLINK("x")');
    expect(neutralizeSpreadsheetText('HX-001')).toBe('HX-001');
  });
});
