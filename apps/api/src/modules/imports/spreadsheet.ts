import ExcelJS from 'exceljs';
import type { RawCell } from '@hedax/domain';

export interface ParsedSheet {
  headers: string[];
  rows: RawCell[][];
  truncated: boolean;
}

/**
 * Reads the first worksheet of an XLSX file without evaluating anything:
 * formulas are reported (isFormula) and only their cached result is visible;
 * hyperlinks/rich text are flattened to plain text. External links are never followed.
 */
export async function readXlsx(bytes: Buffer, maxRows: number): Promise<ParsedSheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [], truncated: false };
  const headerRow = ws.getRow(1);
  const width = Math.min(headerRow.cellCount, 60);
  const headers: string[] = [];
  for (let c = 1; c <= width; c += 1) headers.push(cellText(headerRow.getCell(c).value));
  const rows: RawCell[][] = [];
  let truncated = false;
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    if (!row.hasValues) continue;
    if (rows.length >= maxRows) {
      truncated = true;
      break;
    }
    const cells: RawCell[] = [];
    for (let c = 1; c <= width; c += 1) cells.push(toRawCell(row.getCell(c)));
    rows.push(cells);
  }
  return { headers, rows, truncated };
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('result' in v) return v.result === undefined || v.result === null ? '' : String(v.result);
    if (v instanceof Date) return v.toISOString();
  }
  return String(v);
}

function toRawCell(cell: ExcelJS.Cell): RawCell {
  const v = cell.value;
  if (v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v)) {
    const result = (v as { result?: unknown }).result;
    return { value: result === undefined || result === null || typeof result === 'object' ? null : (result as string | number | boolean), isFormula: true };
  }
  if (typeof v === 'number') return { value: v, isNumeric: true };
  if (typeof v === 'boolean') return { value: v };
  const text = cellText(v);
  return { value: text === '' ? null : text };
}

/** Minimal RFC 4180 CSV reader (quoted fields, escaped quotes, CRLF). UTF-8 BOM is stripped. */
export function readCsv(bytes: Buffer, maxRows: number): ParsedSheet {
  let text = bytes.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      record.push(field);
      field = '';
      if (record.some((f) => f !== '')) records.push(record);
      record = [];
      if (records.length > maxRows + 1) break;
    } else field += ch;
  }
  if (field !== '' || record.length) {
    record.push(field);
    if (record.some((f) => f !== '')) records.push(record);
  }
  const [header = [], ...body] = records;
  const truncated = body.length > maxRows;
  return {
    headers: header.map((h) => h.trim()),
    // CSV has no formula cells; values starting with "=" are plain text here.
    rows: body.slice(0, maxRows).map((r) => r.map((v) => ({ value: v === '' ? null : v }))),
    truncated,
  };
}
