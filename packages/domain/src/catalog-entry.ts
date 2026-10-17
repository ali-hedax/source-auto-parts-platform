import { toAsciiDigits } from './money.js';
import { compactSearchText } from './search-normalize.js';
import { splitVehicleList } from './vehicles.js';

/**
 * Technical parts catalog («کاتالوگ فنی قطعات»): reference entries (no price, no stock) that customers
 * can search by name or technical number. Numbers are compared by a key that ignores how people
 * type them: spaces, dashes, dots and slashes, case, and Persian/Arabic digits
 * («۰۴۵۰-۱۰۲ ۸۰۵» = «0450102805» = «0450.102.805»).
 */
export function partNumberKey(raw: string): string {
  return compactSearchText(raw).toUpperCase().slice(0, 80);
}

/** The readable address of an entry, from its technical number («0450-102-805» → «0450-102-805»). */
export function catalogSlug(partNumber: string, fallback: string): string {
  const slug = toAsciiDigits(partNumber.normalize('NFKC'))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return slug || fallback;
}

/** A list cell («A-1, B 2؛ C3») → unique numbers in order (compared by partNumberKey). */
export function parseNumberList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[،,؛;\n|]+/)) {
    const item = part.replace(/\s+/g, ' ').trim();
    const key = partNumberKey(item);
    if (!item || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.slice(0, 80));
  }
  return out;
}

export interface SpecPair {
  label: string;
  value: string;
}

/** «ولتاژ: 12V؛ قطر: 40mm» (or one per line) → [{label: 'ولتاژ', value: '12V'}, …]; parts without «:» are reported. */
export function parseSpecs(text: string): { specs: SpecPair[]; invalid: string[] } {
  const specs: SpecPair[] = [];
  const invalid: string[] = [];
  for (const part of text.split(/[؛;\n]+/)) {
    const item = part.trim();
    if (!item) continue;
    const at = item.search(/[:：]/);
    const label = at > 0 ? item.slice(0, at).trim() : '';
    const value = at > 0 ? item.slice(at + 1).trim() : '';
    if (!label || !value) invalid.push(item.slice(0, 60));
    else specs.push({ label: label.slice(0, 80), value: value.slice(0, 200) });
  }
  return { specs, invalid };
}

export interface FitmentItem {
  /** The vehicle (and model) as written: «پژو 405». */
  text: string;
  yearFrom: number | null;
  yearTo: number | null;
}

const YEARS = /\(\s*([0-9۰-۹٠-٩]{4})\s*(?:[-–—]|تا)?\s*([0-9۰-۹٠-٩]{4})?\s*\)\s*$/;
const digits = (s: string) => Number(toAsciiDigits(s));

/** A year of manufacture: Persian (1300–1500) or Gregorian (1950–2100). */
export function isPlausibleYear(year: number): boolean {
  return (year >= 1300 && year <= 1500) || (year >= 1950 && year <= 2100);
}

/** «پژو 405 (1390-1400)، سمند، دنا (1398)» → vehicle texts with optional years. */
export function parseFitmentList(text: string): { items: FitmentItem[]; invalid: string[] } {
  const items: FitmentItem[] = [];
  const invalid: string[] = [];
  for (const raw of splitVehicleList(text)) {
    const m = YEARS.exec(raw);
    const name = (m ? raw.slice(0, m.index) : raw).trim();
    const from = m?.[1] ? digits(m[1]) : null;
    const to = m?.[2] ? digits(m[2]) : from;
    if (!name || (from !== null && (!isPlausibleYear(from) || !isPlausibleYear(to as number) || (to as number) < from))) {
      invalid.push(raw.slice(0, 60));
      continue;
    }
    items.push({ text: name, yearFrom: from, yearTo: to });
  }
  return { items, invalid };
}

/** Columns of the catalog Excel/CSV file (the sample file has these headers in this order). */
export const CATALOG_COLUMNS = [
  { key: 'partNumber', fa: 'شماره فنی', en: 'Part number', required: true, aliases: ['part no', 'part number', 'oem', 'شماره قطعه', 'کد فنی'] },
  { key: 'nameFa', fa: 'نام فارسی', en: 'Persian name', required: true, aliases: ['نام قطعه', 'نام', 'name fa'] },
  { key: 'nameEn', fa: 'نام انگلیسی', en: 'English name', required: false, aliases: ['name', 'name en', 'english name'] },
  { key: 'equivalents', fa: 'شماره‌های معادل', en: 'Equivalent numbers', required: false, aliases: ['شماره های معادل', 'معادل', 'equivalents', 'cross reference'] },
  { key: 'replacements', fa: 'شماره‌های جایگزین', en: 'Replacement numbers', required: false, aliases: ['شماره های جایگزین', 'جایگزین', 'replacements', 'superseded by'] },
  { key: 'manufacturer', fa: 'برند قطعه', en: 'Part brand', required: false, aliases: ['سازنده', 'برند', 'manufacturer', 'brand'] },
  { key: 'category', fa: 'گروه قطعه', en: 'Part group', required: false, aliases: ['گروه', 'دسته', 'دسته‌بندی', 'category', 'group'] },
  { key: 'vehicleBrands', fa: 'برند خودرو', en: 'Vehicle brand', required: false, aliases: ['برندهای خودرو', 'خودروساز', 'vehicle brands', 'car brand'] },
  { key: 'fitments', fa: 'کاربرد در خودرو', en: 'Fits vehicles', required: false, aliases: ['کاربرد', 'خودرو', 'vehicles', 'fitment'] },
  { key: 'specs', fa: 'مشخصات فنی', en: 'Technical specs', required: false, aliases: ['مشخصات', 'specs', 'specifications'] },
  { key: 'description', fa: 'توضیحات', en: 'Description', required: false, aliases: ['شرح', 'description'] },
  { key: 'status', fa: 'وضعیت', en: 'Status', required: false, aliases: ['status'] },
] as const;

export type CatalogColumnKey = (typeof CATALOG_COLUMNS)[number]['key'];

const headerKey = (h: string) => compactSearchText(h);

/** Header row → column index per field; unknown headers are ignored. Missing required columns are listed. */
export function mapCatalogHeaders(headers: readonly string[]): { columns: Partial<Record<CatalogColumnKey, number>>; missing: CatalogColumnKey[] } {
  const columns: Partial<Record<CatalogColumnKey, number>> = {};
  headers.forEach((h, i) => {
    const k = headerKey(h);
    if (!k) return;
    const col = CATALOG_COLUMNS.find((c) => [c.fa, c.en, ...c.aliases].some((name) => headerKey(name) === k));
    if (col && columns[col.key] === undefined) columns[col.key] = i;
  });
  return { columns, missing: CATALOG_COLUMNS.filter((c) => c.required && columns[c.key] === undefined).map((c) => c.key) };
}

export interface CatalogRowValues {
  partNumber: string;
  partNumberKey: string;
  nameFa: string;
  nameEn: string | null;
  equivalents: string[];
  replacements: string[];
  manufacturer: string | null;
  category: string | null;
  vehicleBrands: string[];
  fitments: FitmentItem[];
  specs: SpecPair[];
  description: string | null;
  status: 'DRAFT' | 'PUBLISHED';
}

export type CatalogRowIssue =
  | 'PART_NUMBER_REQUIRED'
  | 'PART_NUMBER_TOO_LONG'
  | 'NAME_REQUIRED'
  | 'NAME_TOO_LONG'
  | 'SPECS_INVALID'
  | 'FITMENT_INVALID'
  | 'STATUS_INVALID'
  | 'DESCRIPTION_TOO_LONG';

const STATUS: Record<string, 'DRAFT' | 'PUBLISHED'> = {
  [headerKey('پیش‌نویس')]: 'DRAFT', [headerKey('پیش نویس')]: 'DRAFT', draft: 'DRAFT',
  [headerKey('منتشرشده')]: 'PUBLISHED', [headerKey('منتشر شده')]: 'PUBLISHED', [headerKey('منتشر')]: 'PUBLISHED', published: 'PUBLISHED',
};

/** One data row (cell texts by field) → values, or the reasons it cannot be imported. */
export function parseCatalogRow(cells: Partial<Record<CatalogColumnKey, string>>): { values: CatalogRowValues | null; issues: CatalogRowIssue[]; details: string[] } {
  const get = (k: CatalogColumnKey) => (cells[k] ?? '').replace(/\r/g, '').trim();
  const issues: CatalogRowIssue[] = [];
  const details: string[] = [];
  const partNumber = get('partNumber').replace(/\s+/g, ' ');
  const key = partNumberKey(partNumber);
  if (!key) issues.push('PART_NUMBER_REQUIRED');
  else if (partNumber.length > 80) issues.push('PART_NUMBER_TOO_LONG');
  const nameFa = get('nameFa').replace(/\s+/g, ' ');
  if (!nameFa) issues.push('NAME_REQUIRED');
  else if (nameFa.length > 200 || get('nameEn').length > 200) issues.push('NAME_TOO_LONG');
  const specs = parseSpecs(get('specs'));
  if (specs.invalid.length) { issues.push('SPECS_INVALID'); details.push(...specs.invalid); }
  const fitments = parseFitmentList(get('fitments'));
  if (fitments.invalid.length) { issues.push('FITMENT_INVALID'); details.push(...fitments.invalid); }
  const statusText = headerKey(get('status'));
  const status = statusText ? STATUS[statusText] : 'DRAFT';
  if (!status) issues.push('STATUS_INVALID');
  const description = get('description');
  if (description.length > 5000) issues.push('DESCRIPTION_TOO_LONG');
  if (issues.length) return { values: null, issues, details };
  const own = new Set([key]);
  const numbers = (text: string) => parseNumberList(text).filter((n) => !own.has(partNumberKey(n)));
  return {
    values: {
      partNumber, partNumberKey: key, nameFa, nameEn: get('nameEn').replace(/\s+/g, ' ') || null,
      equivalents: numbers(get('equivalents')), replacements: numbers(get('replacements')),
      manufacturer: get('manufacturer') || null, category: get('category') || null,
      vehicleBrands: splitVehicleList(get('vehicleBrands')),
      fitments: fitments.items, specs: specs.specs, description: description || null, status: status as 'DRAFT' | 'PUBLISHED',
    },
    issues, details,
  };
}
