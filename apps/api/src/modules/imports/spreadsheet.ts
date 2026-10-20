import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type { ImportSheetOutline } from '@hedax/contracts';
import type { RawCell } from '@hedax/domain';
import { zeroPaddedInteger } from './number-format.js';

/** Widest sheet read (columns); wider sheets are cut, which the mapping screen shows. */
export const MAX_COLUMNS = 60;
/** Rows of each sheet kept for the mapping screen: header candidates and samples. */
const OUTLINE_ROWS = 15;
const OUTLINE_COLUMNS = 40;
const OUTLINE_CELL_CHARS = 80;

export interface SheetRow {
  /** Row number in the spreadsheet (or record number in a CSV file). */
  rowNumber: number;
  cells: RawCell[];
}

export interface ParsedSheet {
  headers: string[];
  rows: SheetRow[];
  truncated: boolean;
}

/**
 * Nothing in a workbook is evaluated: a formula shows only the result Excel
 * stored with it (isFormula marks it), error values are reported as errors,
 * hyperlinks and rich text become plain text, external links are never followed,
 * and macro-enabled files never get here (rejected on upload).
 */
function toRawCell(v: ExcelJS.CellValue): RawCell {
  if (v === null || v === undefined) return { value: null };
  if (typeof v === 'number') return { value: v, isNumeric: true };
  if (typeof v === 'boolean') return { value: v };
  if (typeof v === 'string') return { value: v === '' ? null : v };
  if (v instanceof Date) return { value: v.toISOString().slice(0, 10) };
  if (typeof v === 'object') {
    if ('formula' in v || 'sharedFormula' in v) {
      const result = (v as { result?: unknown }).result;
      if (result && typeof result === 'object' && 'error' in result) return { value: null, isFormula: true, error: String((result as { error: unknown }).error) };
      if (result instanceof Date) return { value: result.toISOString().slice(0, 10), isFormula: true };
      return { value: result === undefined || result === null || typeof result === 'object' ? null : (result as string | number | boolean), isFormula: true, ...(typeof result === 'number' ? { isNumeric: true } : {}) };
    }
    if ('error' in v) return { value: null, error: String((v as { error: unknown }).error) };
    if ('richText' in v) return { value: v.richText.map((t) => t.text).join('') || null };
    if ('text' in v && typeof v.text === 'string') return { value: v.text || null };
  }
  return { value: null };
}

function cellText(cell: RawCell): string {
  if (cell.error) return cell.error;
  return cell.value === null ? '' : String(cell.value);
}

const SPREADSHEET_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const PARTS = /^xl\/(workbook|sharedStrings|styles|worksheets\/[^/]+)\.xml$/;

/**
 * Some exporters write SpreadsheetML with a namespace prefix (<x:worksheet xmlns:x="…">, <x:row>, <x:c>)
 * instead of the default namespace. The XML means the same, but ExcelJS only understands unprefixed
 * element names. Only the prefix bound to the SpreadsheetML namespace is removed; other prefixes stay.
 */
export async function unprefixSpreadsheetXml(bytes: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(bytes);
  let changed = false;
  for (const name of Object.keys(zip.files).filter((n) => PARTS.test(n))) {
    const xml = await zip.file(name)!.async('string');
    const prefix = new RegExp(`xmlns:([A-Za-z_][\\w.-]*)="${SPREADSHEET_NS.replace(/[.]/g, '\\.')}"`).exec(xml.slice(0, 2000))?.[1];
    if (!prefix || /<[A-Za-z_][\w.-]*\s[^>]*xmlns="http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main"/.test(xml.slice(0, 2000))) continue;
    const out = xml
      .replace(new RegExp(`xmlns:${prefix}="`), 'xmlns="')
      .replace(new RegExp(`<(/?)${prefix}:`, 'g'), '<$1');
    zip.file(name, out);
    changed = true;
  }
  return changed ? Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })) : bytes;
}

async function loadWorkbook(bytes: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await unprefixSpreadsheetXml(bytes)) as unknown as ArrayBuffer);
  return wb;
}

function rowCells(row: ExcelJS.Row, width: number): RawCell[] {
  const cells: RawCell[] = [];
  for (let c = 1; c <= width; c += 1) {
    const source = row.getCell(c);
    const raw = toRawCell(source.value);
    const padded = zeroPaddedInteger(raw.value, source.numFmt);
    cells.push(padded === null ? raw : { ...raw, value: padded });
  }
  return cells;
}

/** Sheet names and their first rows as text, for choosing the sheet, header row and columns. */
export async function readOutline(bytes: Buffer, extension: string): Promise<ImportSheetOutline[]> {
  if (extension === 'csv') {
    const records = readCsvRecords(bytes, OUTLINE_ROWS);
    const width = Math.min(Math.max(0, ...records.all.map((r) => r.cells.length)), OUTLINE_COLUMNS);
    return [{
      index: 0, name: 'CSV', hidden: false, rowCount: records.total, columnCount: width,
      rows: records.all.slice(0, OUTLINE_ROWS).map((r) => ({ rowNumber: r.rowNumber, cells: r.cells.slice(0, width).map((c) => c.slice(0, OUTLINE_CELL_CHARS)) })),
    }];
  }
  const wb = await loadWorkbook(bytes);
  return wb.worksheets.map((ws, index) => {
    const width = Math.min(ws.columnCount, OUTLINE_COLUMNS);
    const rows: ImportSheetOutline['rows'] = [];
    for (let r = 1; r <= ws.rowCount && rows.length < OUTLINE_ROWS; r += 1) {
      const row = ws.getRow(r);
      if (!row.hasValues) continue;
      rows.push({ rowNumber: r, cells: rowCells(row, width).map((c) => cellText(c).slice(0, OUTLINE_CELL_CHARS)) });
    }
    return { index, name: ws.name, hidden: ws.state !== 'visible', rowCount: ws.actualRowCount, columnCount: width, rows };
  });
}

/**
 * Header row and data rows of one sheet. Empty rows are skipped but every row
 * keeps its spreadsheet row number, so the preview names the row a person sees in Excel.
 * Returns null when the sheet does not exist.
 */
export async function readSheet(bytes: Buffer, extension: string, opts: { sheet: number; headerRow: number; maxRows: number }): Promise<ParsedSheet | null> {
  if (extension === 'csv') {
    if (opts.sheet !== 0) return null;
    const records = readCsvRecords(bytes, Number.MAX_SAFE_INTEGER);
    const header = records.all.find((r) => r.rowNumber === opts.headerRow);
    const body = records.all.filter((r) => r.rowNumber > opts.headerRow);
    const width = Math.min(Math.max(header?.cells.length ?? 0, ...body.map((r) => r.cells.length)), MAX_COLUMNS);
    return {
      headers: (header?.cells ?? []).slice(0, width).map((h) => h.trim()),
      // CSV has no formula cells; values starting with "=" are plain text here.
      rows: body.slice(0, opts.maxRows).map((r) => ({ rowNumber: r.rowNumber, cells: Array.from({ length: width }, (_, i) => ({ value: r.cells[i] ? r.cells[i] as string : null })) })),
      truncated: body.length > opts.maxRows,
    };
  }
  const wb = await loadWorkbook(bytes);
  const ws = wb.worksheets[opts.sheet];
  if (!ws) return null;
  const width = Math.min(ws.columnCount, MAX_COLUMNS);
  const headers = rowCells(ws.getRow(opts.headerRow), width).map((c) => cellText(c).trim());
  const rows: SheetRow[] = [];
  let truncated = false;
  for (let r = opts.headerRow + 1; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    if (!row.hasValues) continue;
    const cells = rowCells(row, width);
    if (cells.every((c) => c.value === null && !c.error)) continue;
    if (rows.length >= opts.maxRows) {
      truncated = true;
      break;
    }
    rows.push({ rowNumber: r, cells });
  }
  return { headers, rows, truncated };
}

/** Minimal RFC 4180 CSV reader (quoted fields, escaped quotes, CRLF). UTF-8 BOM is stripped. Empty records are skipped. */
function readCsvRecords(bytes: Buffer, maxRecords: number): { all: Array<{ rowNumber: number; cells: string[] }>; total: number } {
  let text = bytes.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const all: Array<{ rowNumber: number; cells: string[] }> = [];
  let total = 0;
  let field = '';
  let record: string[] = [];
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  const push = () => {
    record.push(field);
    field = '';
    if (record.some((f) => f !== '')) {
      total += 1;
      if (all.length < maxRecords) all.push({ rowNumber: recordLine, cells: record });
    }
    record = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else {
        if (ch === '\n') line += 1;
        field += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      push();
      line += 1;
      recordLine = line;
    } else field += ch;
  }
  if (field !== '' || record.length) push();
  return { all, total };
}
