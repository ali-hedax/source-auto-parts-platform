import { readOutline, readSheet } from '../imports/spreadsheet.js';

export interface ExtractedCatalogChunk {
  ordinal: number;
  contentText: string;
  rowStart: number;
  rowEnd: number;
  metadata: { sheet: string; fields: Record<string, string>; candidatePartNumber: string | null; candidatePartName: string | null; candidateVehicle: string | null };
}

const MAX_ROWS = 2000;
const MAX_SHEETS = 10;
const MAX_TEXT = 2500;
const MAX_CELL = 500;
const CODE_HEADERS = /^(sku|oem|oem code|part number|part no|technical number|شماره فنی|کد فنی|کد قطعه|کد کالا)$/i;
const NAME_HEADERS = /^(name|part name|description|نام قطعه|نام کالا|شرح کالا|شرح قطعه)$/i;
const VEHICLE_HEADERS = /^(vehicle|vehicle model|model|car model|مدل خودرو|نام خودرو|کاربرد در خودرو)$/i;

function normalizeHeader(value: string, index: number): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 100) || `column_${index + 1}`;
}

function cellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return '';
  return [...String(value)].filter((ch) => ch.charCodeAt(0) >= 32 || ch === '\\n' || ch === '\\r' || ch === '\\t').join('').trim().slice(0, MAX_CELL);
}

/**
 * Extracts candidate rows only. No product, price, inventory or fitment record is
 * created here; a reviewer must verify every claim against the source.
 */
export async function extractCatalogRows(bytes: Buffer, extension: string): Promise<{ chunks: ExtractedCatalogChunk[]; truncated: boolean }> {
  if (extension === 'pdf') throw new Error('PDF_TEXT_EXTRACTION_NOT_CONFIGURED');
  if (extension !== 'csv' && extension !== 'xlsx') throw new Error('CATALOG_FORMAT_NOT_ALLOWED');
  const sheets = await readOutline(bytes, extension);
  const chunks: ExtractedCatalogChunk[] = [];
  let truncated = sheets.length > MAX_SHEETS;
  for (const sheet of sheets.slice(0, MAX_SHEETS)) {
    if (sheet.hidden) continue;
    const headerRow = sheet.rows[0]?.rowNumber;
    if (!headerRow) continue;
    const remaining = MAX_ROWS - chunks.length;
    if (remaining <= 0) { truncated = true; break; }
    const parsed = await readSheet(bytes, extension, { sheet: sheet.index, headerRow, maxRows: remaining });
    if (!parsed) continue;
    const headers = parsed.headers.map(normalizeHeader);
    for (const row of parsed.rows) {
      const fields: Record<string, string> = {};
      for (let i = 0; i < Math.min(headers.length, row.cells.length); i += 1) {
        // Never evaluate spreadsheet formulas: use only the stored, literal value.
        if (row.cells[i]?.isFormula || row.cells[i]?.error) continue;
        const value = cellValue(row.cells[i]?.value);
        if (value) fields[headers[i]!] = value;
      }
      if (Object.keys(fields).length === 0) continue;
      const pick = (pattern: RegExp) => Object.entries(fields).find(([key]) => pattern.test(key))?.[1] ?? null;
      const contentText = Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join('\n').slice(0, MAX_TEXT);
      chunks.push({
        ordinal: chunks.length,
        contentText,
        rowStart: row.rowNumber,
        rowEnd: row.rowNumber,
        metadata: {
          sheet: sheet.name.slice(0, 100),
          fields,
          candidatePartNumber: pick(CODE_HEADERS),
          candidatePartName: pick(NAME_HEADERS),
          candidateVehicle: pick(VEHICLE_HEADERS),
        },
      });
    }
    truncated ||= parsed.truncated;
  }
  return { chunks, truncated };
}
