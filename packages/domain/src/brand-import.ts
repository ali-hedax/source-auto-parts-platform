import { parseFitmentList, parseNumberList, partNumberKey, type FitmentItem, type SpecPair } from './part-numbers.js';
import { compactSearchText } from './search-normalize.js';

/**
 * Brand database import («ورود دیتابیس برند»): a whole parts database from one manufacturer
 * (Toyota, Hyundai …) as large xlsx / csv files or a zip of csv files. The person maps the file's
 * columns to our fields once per brand; the mapping is saved and applied again next time. Rows are
 * keyed by the normalized technical number + the manufacturer brand, so importing the same brand
 * again updates instead of duplicating.
 */

export const BRAND_FIELDS = [
  { key: 'partNumber', fa: 'شمارهٔ فنی', en: 'Part number', multi: false, required: true, aliases: ['part number', 'part no', 'partno', 'part #', 'pn', 'oem', 'oem number', 'oem no', 'شماره فنی', 'شماره قطعه', 'کد فنی', 'پارت نامبر', 'number', 'item number', 'material'] },
  { key: 'nameFa', fa: 'نام فارسی', en: 'Persian name', multi: false, required: false, aliases: ['نام فارسی', 'نام قطعه', 'نام', 'شرح فارسی', 'عنوان'] },
  { key: 'nameEn', fa: 'نام انگلیسی', en: 'English name', multi: false, required: false, aliases: ['name', 'part name', 'description en', 'english name', 'name en', 'designation', 'نام انگلیسی'] },
  { key: 'equivalents', fa: 'شماره‌های معادل', en: 'Equivalent numbers', multi: true, required: false, aliases: ['equivalent', 'equivalents', 'cross reference', 'cross ref', 'interchange', 'alternative', 'alt number', 'oe number', 'معادل', 'شماره معادل', 'شماره های معادل'] },
  { key: 'replacements', fa: 'شماره‌های جایگزین', en: 'Replacement numbers', multi: true, required: false, aliases: ['replacement', 'replaced by', 'superseded by', 'supersession', 'new number', 'جایگزین', 'شماره جایگزین', 'شماره های جایگزین'] },
  { key: 'category', fa: 'گروه قطعه', en: 'Part group', multi: false, required: false, aliases: ['category', 'group', 'part group', 'product group', 'گروه', 'گروه قطعه', 'دسته', 'دسته بندی'] },
  { key: 'vehicleBrand', fa: 'برند خودرو', en: 'Vehicle brand', multi: false, required: false, aliases: ['make', 'vehicle make', 'car make', 'vehicle brand', 'برند خودرو', 'خودروساز'] },
  { key: 'fitment', fa: 'کاربرد در خودرو (ستون‌ها ترکیب می‌شوند)', en: 'Fitment (columns are combined)', multi: true, required: false, aliases: ['model', 'vehicle', 'vehicle model', 'car model', 'application', 'fitment', 'applications', 'مدل', 'مدل خودرو', 'خودرو', 'کاربرد', 'کاربرد در خودرو'] },
  { key: 'years', fa: 'بازهٔ سال (مثل 2010-2015)', en: 'Year range (e.g. 2010-2015)', multi: false, required: false, aliases: ['years', 'year range', 'model years', 'سال', 'سال ساخت', 'بازه سال'] },
  { key: 'yearFrom', fa: 'از سال', en: 'Year from', multi: false, required: false, aliases: ['year from', 'from year', 'start year', 'از سال'] },
  { key: 'yearTo', fa: 'تا سال', en: 'Year to', multi: false, required: false, aliases: ['year to', 'to year', 'end year', 'تا سال'] },
  { key: 'description', fa: 'توضیحات', en: 'Description', multi: false, required: false, aliases: ['description', 'remarks', 'notes', 'comment', 'توضیحات', 'شرح'] },
  { key: 'specs', fa: 'مشخصات فنی (هر ستون یک ردیف)', en: 'Specs (one row per column)', multi: true, required: false, aliases: ['weight', 'length', 'width', 'height', 'diameter', 'dimensions', 'وزن', 'طول', 'عرض', 'ارتفاع', 'قطر', 'ابعاد'] },
] as const;

export type BrandField = (typeof BRAND_FIELDS)[number]['key'];
/** Field → header names of the file (several for multi fields). Saved per brand by header name, not position. */
export type BrandMapping = Partial<Record<BrandField, string[]>>;

const headerKey = (h: string) => compactSearchText(h);

/** Suggested mapping from the header names; a header is used once, in the order of BRAND_FIELDS. */
export function suggestBrandMapping(headers: readonly string[]): BrandMapping {
  const out: BrandMapping = {};
  const used = new Set<string>();
  for (const field of BRAND_FIELDS) {
    const aliases = new Set([field.fa, field.en, ...field.aliases].map(headerKey));
    const hits = headers.filter((h) => !used.has(h) && aliases.has(headerKey(h)));
    const chosen = field.multi ? hits : hits.slice(0, 1);
    if (chosen.length) {
      out[field.key] = chosen;
      for (const h of chosen) used.add(h);
    }
  }
  return out;
}

/**
 * A saved mapping applied to a new file: kept where the file still has the header (compared
 * normalized), filled from the suggestion where it does not. Returns what could not be found.
 */
export function reuseBrandMapping(saved: BrandMapping, headers: readonly string[]): { mapping: BrandMapping; missing: string[] } {
  const byKey = new Map(headers.map((h) => [headerKey(h), h]));
  const mapping: BrandMapping = {};
  const missing: string[] = [];
  for (const field of BRAND_FIELDS) {
    const list = saved[field.key] ?? [];
    const found = list.map((h) => byKey.get(headerKey(h))).filter((h): h is string => !!h);
    for (const h of list) if (!byKey.has(headerKey(h))) missing.push(h);
    if (found.length) mapping[field.key] = found;
  }
  const suggested = suggestBrandMapping(headers.filter((h) => !Object.values(mapping).flat().includes(h)));
  for (const [k, v] of Object.entries(suggested) as Array<[BrandField, string[]]>) if (!mapping[k]) mapping[k] = v;
  return { mapping, missing };
}

/** Problems of a mapping before it is used (the technical number is required; one column per single field). */
export function brandMappingProblems(mapping: BrandMapping, headers: readonly string[]): string[] {
  const known = new Set(headers);
  const out: string[] = [];
  if (!mapping.partNumber?.length) out.push('PART_NUMBER_COLUMN_REQUIRED');
  for (const field of BRAND_FIELDS) {
    const cols = mapping[field.key] ?? [];
    if (!field.multi && cols.length > 1) out.push(`ONE_COLUMN_ONLY:${field.key}`);
    for (const c of cols) if (!known.has(c)) out.push(`UNKNOWN_COLUMN:${c}`);
  }
  return out;
}

export interface BrandRowValues {
  partNumber: string;
  partNumberKey: string;
  /** Persian name, or the English name / description / number when the file has no Persian name. */
  nameFa: string;
  nameEn: string | null;
  equivalents: string[];
  replacements: string[];
  category: string | null;
  vehicleBrand: string | null;
  fitments: FitmentItem[];
  specs: SpecPair[];
  description: string | null;
}

export type BrandRowIssue = 'PART_NUMBER_REQUIRED' | 'PART_NUMBER_TOO_LONG' | 'YEAR_INVALID' | 'FITMENT_INVALID';

const yearOf = (s: string): number | null => {
  const m = /^\s*([0-9۰-۹٠-٩]{4})\s*$/.exec(s);
  if (!m) return null;
  return Number(m[1]!.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))));
};
const plausible = (y: number) => (y >= 1300 && y <= 1500) || (y >= 1950 && y <= 2100);

/**
 * One row (cell text by header) → values, or the reasons it cannot be used. Fitment columns are
 * joined into one text per row («Corolla» + «1.8» → «Corolla 1.8»), then split on list separators;
 * the year columns (or a «2010-2015» range) apply to every vehicle of the row without own years.
 */
export function applyBrandMapping(cells: Readonly<Record<string, string>>, mapping: BrandMapping): { values: BrandRowValues | null; issues: BrandRowIssue[] } {
  const get = (field: BrandField) => (mapping[field] ?? []).map((h) => (cells[h] ?? '').replace(/\r/g, '').trim()).filter(Boolean);
  const one = (field: BrandField) => get(field)[0] ?? '';
  const issues: BrandRowIssue[] = [];
  const partNumber = one('partNumber').replace(/\s+/g, ' ');
  const key = partNumberKey(partNumber);
  if (!key) issues.push('PART_NUMBER_REQUIRED');
  else if (partNumber.length > 80) issues.push('PART_NUMBER_TOO_LONG');

  let yearFrom: number | null = null;
  let yearTo: number | null = null;
  const range = one('years');
  if (range) {
    const m = /^\s*([0-9۰-۹٠-٩]{4})\s*(?:[-–—/]|تا|to)?\s*([0-9۰-۹٠-٩]{4})?\s*$/i.exec(range);
    yearFrom = m ? yearOf(m[1]!) : null;
    yearTo = m?.[2] ? yearOf(m[2]) : yearFrom;
    if (!m) issues.push('YEAR_INVALID');
  }
  if (one('yearFrom')) yearFrom = yearOf(one('yearFrom'));
  if (one('yearTo')) yearTo = yearOf(one('yearTo'));
  if ((one('yearFrom') && yearFrom === null) || (one('yearTo') && yearTo === null)) issues.push('YEAR_INVALID');
  if (yearFrom !== null && yearTo === null) yearTo = yearFrom;
  if (yearFrom !== null && (!plausible(yearFrom) || !plausible(yearTo as number) || (yearTo as number) < yearFrom)) issues.push('YEAR_INVALID');

  const fitText = get('fitment').join(' ');
  const fit = parseFitmentList(fitText);
  if (fit.invalid.length) issues.push('FITMENT_INVALID');
  if (issues.length) return { values: null, issues: [...new Set(issues)] };

  const specs: SpecPair[] = [];
  for (const h of mapping.specs ?? []) {
    const v = (cells[h] ?? '').trim();
    if (v) specs.push({ label: h.trim().slice(0, 80), value: v.slice(0, 200) });
  }
  const nameEn = one('nameEn').replace(/\s+/g, ' ').slice(0, 200) || null;
  const description = one('description').slice(0, 5000) || null;
  const nameFa = (one('nameFa').replace(/\s+/g, ' ') || nameEn || description?.split('\n')[0] || partNumber).slice(0, 200);
  const own = new Set([key]);
  const numbers = (field: BrandField) => [...new Set(get(field).flatMap(parseNumberList))].filter((n) => !own.has(partNumberKey(n)));
  return {
    values: {
      partNumber, partNumberKey: key, nameFa: nameFa.length >= 2 ? nameFa : `${nameFa} ${partNumber}`.trim(), nameEn,
      equivalents: numbers('equivalents'), replacements: numbers('replacements'),
      category: one('category') || null, vehicleBrand: one('vehicleBrand') || null,
      fitments: fit.items.map((f) => (f.yearFrom === null && yearFrom !== null ? { ...f, yearFrom, yearTo } : f)),
      specs, description,
    },
    issues,
  };
}

// ---------------------------------------------------------------------------
// Text encoding and CSV
// ---------------------------------------------------------------------------

export type TextEncodingName = 'utf-8' | 'windows-1256';

/**
 * The encoding of a CSV file from its first bytes: UTF-8 when they decode as valid UTF-8 (a BOM
 * also says so), otherwise Windows-1256, the usual encoding of Persian files saved by Excel.
 */
export function detectEncoding(sample: Uint8Array): TextEncodingName {
  if (sample[0] === 0xef && sample[1] === 0xbb && sample[2] === 0xbf) return 'utf-8';
  // A multi-byte character may be cut at the end of the sample: ignore an incomplete tail.
  let end = sample.length;
  for (let i = Math.max(0, end - 3); i < end; i += 1) if ((sample[i]! & 0xc0) === 0xc0) { end = i; break; }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample.subarray(0, end));
    return 'utf-8';
  } catch {
    return 'windows-1256';
  }
}

/** The CSV separator from the header line: comma, semicolon, tab or pipe (most frequent outside quotes). */
export function detectDelimiter(headerLine: string): ',' | ';' | '\t' | '|' {
  const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 } as Record<',' | ';' | '\t' | '|', number>;
  let quoted = false;
  for (const ch of headerLine) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch as keyof typeof counts] += 1;
  }
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0]) as ',' | ';' | '\t' | '|';
}

/**
 * Incremental RFC 4180 CSV parser for large files: text is pushed in chunks (a quoted field may span
 * chunks and lines) and complete records come out; memory stays bounded by one record.
 */
export class CsvStreamParser {
  private field = '';
  private record: string[] = [];
  private quoted = false;
  /** A quote seen inside a quoted field: either the end of the quotes or the first half of "". */
  private quotePending = false;
  private line = 1;
  private recordLine = 1;
  private bomChecked = false;

  constructor(private readonly delimiter: string = ',') {}

  /** Records completed by this chunk, each with its line number in the file. */
  push(chunk: string): Array<{ line: number; cells: string[] }> {
    const out: Array<{ line: number; cells: string[] }> = [];
    let text = chunk;
    if (!this.bomChecked) {
      this.bomChecked = true;
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    }
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i]!;
      if (this.quotePending) {
        this.quotePending = false;
        if (ch === '"') { this.field += '"'; continue; }
        this.quoted = false;
      }
      if (this.quoted) {
        if (ch === '"') this.quotePending = true;
        else {
          if (ch === '\n') this.line += 1;
          this.field += ch;
        }
        continue;
      }
      if (ch === '"' && this.field === '') this.quoted = true;
      else if (ch === this.delimiter) { this.record.push(this.field); this.field = ''; }
      else if (ch === '\n') { this.end(out); this.line += 1; this.recordLine = this.line; }
      else if (ch !== '\r') this.field += ch;
    }
    return out;
  }

  /** The last record when the file does not end with a newline. */
  finish(): Array<{ line: number; cells: string[] }> {
    const out: Array<{ line: number; cells: string[] }> = [];
    this.quotePending = false;
    this.quoted = false;
    if (this.field !== '' || this.record.length) this.end(out);
    return out;
  }

  private end(out: Array<{ line: number; cells: string[] }>): void {
    this.record.push(this.field);
    this.field = '';
    if (this.record.some((c) => c.trim() !== '')) out.push({ line: this.recordLine, cells: this.record });
    this.record = [];
  }
}
