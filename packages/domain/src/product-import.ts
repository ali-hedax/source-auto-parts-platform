import { type CurrencyCode, isCurrencyCode, parseDecimalAmount, toAsciiDigits } from './money.js';
import { normalizeSearchText } from './search-normalize.js';

/**
 * Excel/CSV product import validation (spec §12). Pure: the parser produces
 * RawCells, the service supplies the existing catalog snapshot and the
 * person's choices (column mapping, price unit, stock mode, values for the
 * whole file), and this module returns a per-row plan. Preview never mutates;
 * commit re-validates versions.
 */
export const IMPORT_COLUMNS = [
  'sku', 'name_fa', 'name_en', 'category_code', 'vehicle_brand_codes', 'manufacturer_brand', 'part_type', 'condition',
  'origin', 'base_currency', 'base_price', 'override_price_irr', 'override_price_aed', 'on_hand', 'low_stock_threshold',
  'unit', 'description_fa', 'description_en', 'is_active', 'technical_number', 'vehicle_models',
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/** Column order of the downloadable template and of the mapping screen. */
export const TEMPLATE_COLUMNS: readonly ImportColumn[] = [
  'sku', 'technical_number', 'name_fa', 'name_en', 'manufacturer_brand', 'category_code', 'vehicle_brand_codes', 'vehicle_models',
  'part_type', 'condition', 'origin', 'base_currency', 'base_price', 'on_hand', 'unit', 'low_stock_threshold',
  'override_price_irr', 'override_price_aed', 'description_fa', 'description_en', 'is_active',
];

export const MAX_IMPORT_ROWS = 5000;

/**
 * Header aliases → canonical column. The second entry is the Persian header of
 * the template (used as the column's Persian label). Headers are compared after
 * normalizeSearchText, so Arabic/Persian letter variants, ZWNJ and punctuation do not matter.
 */
export const HEADER_ALIASES: Record<ImportColumn, readonly string[]> = {
  sku: ['sku', 'کد کالا', 'شناسه کالا', 'کد انبار', 'کد محصول', 'شناسه محصول', 'item code', 'product code'],
  name_fa: ['name_fa', 'نام فارسی', 'نام قطعه', 'عنوان', 'عنوان کالا', 'نام کالا', 'نام محصول', 'شرح کالا', 'شرح', 'نام', 'title'],
  name_en: ['name_en', 'نام انگلیسی', 'english name'],
  category_code: ['category_code', 'کد دسته', 'دسته', 'دسته بندی', 'گروه کالا', 'category'],
  vehicle_brand_codes: ['vehicle_brand_codes', 'برند خودرو', 'کد برند خودرو', 'خودروساز', 'vehicle brand'],
  manufacturer_brand: ['manufacturer_brand', 'برند سازنده', 'سازنده', 'برند', 'تولیدکننده', 'تولید کننده', 'مارک', 'brand', 'manufacturer'],
  part_type: ['part_type', 'نوع قطعه', 'نوع عرضه', 'part type'],
  condition: ['condition', 'وضعیت فیزیکی', 'وضعیت', 'نو یا کارکرده'],
  origin: ['origin', 'منشا', 'منشأ'],
  base_currency: ['base_currency', 'ارز پایه', 'واحد پول', 'ارز', 'currency'],
  base_price: ['base_price', 'قیمت پایه', 'قیمت', 'قیمت فروش', 'قیمت واحد', 'فی', 'price', 'unit price'],
  override_price_irr: ['override_price_irr', 'قیمت دستی ریال'],
  override_price_aed: ['override_price_aed', 'قیمت دستی درهم'],
  on_hand: ['on_hand', 'موجودی فیزیکی', 'موجودی', 'تعداد', 'تعداد موجودی', 'stock', 'quantity', 'qty'],
  low_stock_threshold: ['low_stock_threshold', 'حد هشدار موجودی', 'حد هشدار'],
  unit: ['unit', 'واحد فروش', 'واحد', 'واحد شمارش'],
  description_fa: ['description_fa', 'توضیحات فارسی', 'توضیحات', 'مشخصات', 'مشخصات فنی', 'description'],
  description_en: ['description_en', 'توضیحات انگلیسی'],
  is_active: ['is_active', 'فعال', 'وضعیت فروش'],
  technical_number: ['technical_number', 'شماره فنی', 'کد فنی', 'شماره قطعه', 'پارت نامبر', 'part number', 'part no', 'oem', 'کد oem', 'شماره oem', 'oem code'],
  vehicle_models: ['vehicle_models', 'خودروهای سازگار', 'خودرو سازگار', 'مناسب برای', 'سازگار با', 'خودرو', 'مدل خودرو', 'compatible vehicles'],
};

/** Columns that must have a value for a new product. The ones in DEFAULTABLE may come from a value chosen for the whole file. */
export const REQUIRED_ON_CREATE: readonly ImportColumn[] = [
  'sku', 'name_fa', 'category_code', 'part_type', 'condition', 'origin', 'base_currency', 'base_price',
];
export const DEFAULTABLE_ON_CREATE: readonly ImportColumn[] = [
  'category_code', 'part_type', 'condition', 'origin', 'manufacturer_brand', 'vehicle_brand_codes', 'unit', 'on_hand',
];

const PRICE_COLUMNS: ReadonlySet<ImportColumn> = new Set(['base_price', 'override_price_irr', 'override_price_aed']);
const PRICE_OR_QTY: ReadonlySet<ImportColumn> = new Set([
  'base_price', 'override_price_irr', 'override_price_aed', 'on_hand', 'low_stock_threshold',
]);
const CODE_COLUMNS: ReadonlySet<ImportColumn> = new Set(['sku', 'technical_number']);

export const PART_TYPES = ['GENUINE', 'OEM', 'AFTERMARKET'] as const;
export const CONDITIONS = ['NEW', 'USED', 'REFURBISHED'] as const;
export const ORIGINS = ['DOMESTIC', 'IMPORTED', 'UNKNOWN'] as const;
export type PartType = (typeof PART_TYPES)[number];
export type PhysicalCondition = (typeof CONDITIONS)[number];
export type Origin = (typeof ORIGINS)[number];

/** Unit of the amounts in the price column. Toman is converted to rial (×10) only when chosen explicitly. */
export const PRICE_UNITS = ['IRR', 'TOMAN', 'AED'] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];
/** SET: the file has the counted stock (replaces it). ADD: the file has quantities received (added to it). */
export const STOCK_MODES = ['SET', 'ADD'] as const;
export type StockMode = (typeof STOCK_MODES)[number];

const ENUM_ALIASES: Record<string, string> = {
  'اصلی': 'GENUINE', 'جنیون': 'GENUINE', 'او ای ام': 'OEM', 'oem': 'OEM', 'افترمارکت': 'AFTERMARKET', 'غیر اصلی': 'AFTERMARKET',
  'نو': 'NEW', 'کارکرده': 'USED', 'دست دوم': 'USED', 'بازسازی شده': 'REFURBISHED',
  'داخلی': 'DOMESTIC', 'وارداتی': 'IMPORTED', 'نامشخص': 'UNKNOWN',
  'ریال': 'IRR', 'درهم': 'AED',
};
const TOMAN_WORDS = new Set(['toman', 'تومان']);

export interface RawCell {
  value: string | number | boolean | null;
  /** True when the source cell contained a formula (never evaluated; only a stored result is visible). */
  isFormula?: boolean;
  /** True when the spreadsheet stored the cell as a number (leading zeros may be lost, long numbers rounded). */
  isNumeric?: boolean;
  /** Excel error value in the cell (#N/A, #DIV/0! …); value is null. */
  error?: string;
}

export type RawRow = Partial<Record<ImportColumn, RawCell>>;

export interface ExistingProductSnapshot {
  productId: string;
  version: number;
  nameFa: string;
  nameEn: string | null;
  categoryCode: string;
  vehicleBrandCodes: readonly string[];
  manufacturerBrand: string | null;
  manufacturerBrandId?: string | null;
  partType: PartType;
  condition: PhysicalCondition;
  origin: Origin;
  baseCurrency: CurrencyCode;
  basePriceMinor: bigint;
  overridePriceIrrMinor: bigint | null;
  overridePriceAedMinor: bigint | null;
  onHand: number;
  reserved: number;
  inventoryVersion: number;
  lowStockThreshold: number;
  unit: string;
  descriptionFa: string | null;
  descriptionEn: string | null;
  isActive: boolean;
  oemCodes?: readonly string[];
  vehicleModels?: readonly string[];
}

/** Values chosen for the whole file; used only for new products and only where the row's own cell is empty. */
export interface ImportDefaults {
  categoryCode?: string | null;
  partType?: PartType | null;
  condition?: PhysicalCondition | null;
  origin?: Origin | null;
  /** A manufacturer brand name known to ctx.manufacturerBrands. */
  manufacturerBrand?: string | null;
  vehicleBrandCodes?: readonly string[];
  unit?: string | null;
  initialOnHand?: number | null;
}

export interface ImportContext {
  mode: 'UPDATE_ONLY' | 'CREATE_AND_UPDATE';
  existing: ReadonlyMap<string, ExistingProductSnapshot>;
  categoryCodes: ReadonlySet<string>;
  /** Normalized category names → code, so a file may name the category instead of using its code. */
  categoryNames?: ReadonlyMap<string, string>;
  vehicleBrandCodes: ReadonlySet<string>;
  /** Normalized vehicle brand names → code. */
  vehicleBrandNames?: ReadonlyMap<string, string>;
  /** Normalized manufacturer brand name → id. Unknown names need explicit mapping. */
  manufacturerBrands: ReadonlyMap<string, string>;
  /** Columns the user explicitly chose to clear when the cell is empty (update mode). */
  clearWhenEmpty: ReadonlySet<ImportColumn>;
  defaults?: ImportDefaults;
  /** Unit of the price column when a row has no currency cell; null means each row must name its currency. */
  priceUnit?: PriceUnit | null;
  stockMode?: StockMode;
  /** Normalized technical number → products that already carry it (any SKU). */
  technicalNumbers?: ReadonlyMap<string, ReadonlyArray<{ sku: string; manufacturerBrandId: string | null }>>;
}

export interface ImportIssue {
  column: ImportColumn | null;
  code: string;
  severity: 'error' | 'warning';
  /** Extra fact for the person, e.g. the SKU of the product this row collides with. */
  detail?: string;
}

export interface ParsedImportValues {
  sku: string;
  nameFa?: string;
  nameEn?: string | null;
  categoryCode?: string;
  vehicleBrandCodes?: string[];
  manufacturerBrand?: string | null;
  partType?: PartType;
  condition?: PhysicalCondition;
  origin?: Origin;
  baseCurrency?: CurrencyCode;
  basePriceMinor?: bigint;
  overridePriceIrrMinor?: bigint | null;
  overridePriceAedMinor?: bigint | null;
  /** Absolute physical count (SET mode, and the first stock of a new product). */
  onHand?: number;
  /** Quantity added to the current count (ADD mode, existing products). */
  onHandAdd?: number;
  lowStockThreshold?: number;
  unit?: string;
  descriptionFa?: string | null;
  descriptionEn?: string | null;
  isActive?: boolean;
  technicalNumber?: string;
  vehicleModels?: string[];
}

export interface FieldChange {
  field: keyof ParsedImportValues;
  before: string | null;
  after: string | null;
  /** For amount fields: the currency of before/after (minor units: IRR = rial, AED = fils). */
  currency?: CurrencyCode;
  /** For stock added to the current count: the quantity added. */
  delta?: number;
}

/** What the preview table shows for a row, including rows with errors. */
export interface ImportRowDisplay {
  name: string | null;
  technicalNumber: string | null;
  brand: string | null;
  price: { amountMinor: string; currency: CurrencyCode; fromToman: boolean } | { text: string } | null;
  stock: { mode: StockMode; quantity: number | null; before: number | null; after: number | null } | { text: string } | null;
  /** Columns whose value came from the values chosen for the whole file. */
  defaults: ImportColumn[];
}

export interface ImportRowPlan {
  rowNumber: number;
  sku: string | null;
  action: 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'ERROR';
  issues: ImportIssue[];
  values: ParsedImportValues | null;
  changes: FieldChange[];
  display: ImportRowDisplay;
  /** Versions captured at preview and re-checked at commit (optimistic locking). */
  expectedProductVersion: number | null;
  expectedInventoryVersion: number | null;
}

export type ImportPermission = 'products.write' | 'prices.write' | 'inventory.adjust';

export interface ImportPlan {
  rows: ImportRowPlan[];
  summary: { create: number; update: number; unchanged: number; error: number; warnings: number };
  fileErrors: string[];
  /** Nothing has an error and something will change. */
  canCommit: boolean;
  /** Something would change if the rows with errors are explicitly left out. */
  canCommitValid: boolean;
  /** Permissions the changes in this plan need, besides imports.run. */
  requiredPermissions: ImportPermission[];
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

const ALIAS_LOOKUP: ReadonlyMap<string, ImportColumn> = (() => {
  const map = new Map<string, ImportColumn>();
  for (const col of IMPORT_COLUMNS) for (const alias of HEADER_ALIASES[col]) map.set(normalizeSearchText(alias), col);
  return map;
})();

const UNIT_TOKENS: ReadonlyArray<readonly [RegExp, PriceUnit]> = [
  [/^(ریال|ریالی|irr|rial|rials)$/, 'IRR'],
  [/^(تومان|تومانی|toman|tomans)$/, 'TOMAN'],
  [/^(درهم|درهمی|aed|dirham|dirhams)$/, 'AED'],
];
const HEADER_FILLER = new Set(['به', 'بر', 'حسب', 'in', 'per']);

export interface HeaderMatch {
  column: ImportColumn | null;
  /** Unit named in the header of a price column, e.g. "قیمت (ریال)". A hint only: the person confirms the unit. */
  unitHint: PriceUnit | null;
}

/** Recognizes one header: template keys, Persian headers and common synonyms; a unit in parentheses is read as a hint. */
export function matchHeader(header: string | null | undefined): HeaderMatch {
  const norm = normalizeSearchText(header ?? '');
  if (!norm) return { column: null, unitHint: null };
  const direct = ALIAS_LOOKUP.get(norm);
  let unitHint: PriceUnit | null = null;
  const rest: string[] = [];
  for (const token of norm.split(' ')) {
    const unit = UNIT_TOKENS.find(([re]) => re.test(token));
    if (unit) unitHint = unit[1];
    else rest.push(token);
  }
  const column = direct ?? ALIAS_LOOKUP.get(rest.join(' ')) ?? ALIAS_LOOKUP.get(rest.filter((t) => !HEADER_FILLER.has(t)).join(' ')) ?? null;
  return { column, unitHint: column && PRICE_COLUMNS.has(column) && column === 'base_price' ? unitHint : null };
}

export function mapHeaders(headers: readonly string[]): {
  mapping: Partial<Record<ImportColumn, number>>;
  unknownHeaders: string[];
  duplicateColumns: ImportColumn[];
  priceUnitHint: PriceUnit | null;
} {
  const mapping: Partial<Record<ImportColumn, number>> = {};
  const unknownHeaders: string[] = [];
  const duplicateColumns: ImportColumn[] = [];
  let priceUnitHint: PriceUnit | null = null;
  headers.forEach((h, index) => {
    const { column, unitHint } = matchHeader(h);
    if (!column) {
      if ((h ?? '').trim()) unknownHeaders.push(h);
      return;
    }
    if (mapping[column] !== undefined) duplicateColumns.push(column);
    else {
      mapping[column] = index;
      if (unitHint) priceUnitHint = unitHint;
    }
  });
  return { mapping, unknownHeaders, duplicateColumns, priceUnitHint };
}

/**
 * Picks the header row among the first rows of a sheet: the row naming the
 * most known columns; without any, the first row with at least two filled cells.
 * Returns an index into `rows`.
 */
export function suggestHeaderRow(rows: ReadonlyArray<ReadonlyArray<string | null>>): number {
  let best = -1;
  let bestScore = 0;
  rows.slice(0, 10).forEach((cells, i) => {
    const score = new Set(cells.map((c) => matchHeader(c).column).filter(Boolean)).size;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  if (best >= 0) return best;
  const filled = rows.findIndex((cells) => cells.filter((c) => (c ?? '').trim() !== '').length >= 2);
  return filled >= 0 ? filled : 0;
}

// ---------------------------------------------------------------------------
// Cell reading
// ---------------------------------------------------------------------------

/** Direction marks and embedding controls that spreadsheets copy along with text (ZWNJ is kept: it is part of Persian words). */
const BIDI_RE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
/** In codes and numbers every invisible joiner or space is noise. */
const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00A0\u202F]/g;

const SKU_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,63}$/;
const LIMITS = { name: 200, description: 5000, unit: 30, code: 64, model: 120, models: 20 };

function cellText(cell: RawCell | undefined): string {
  if (!cell || cell.value === null || cell.value === undefined) return '';
  return String(cell.value).replace(BIDI_RE, '').trim();
}

/** SKU and technical numbers: text as written, with Persian/Arabic digits made ASCII and spaces collapsed. */
function codeText(cell: RawCell | undefined): string {
  return toAsciiDigits(cellText(cell)).replace(INVISIBLE_RE, ' ').replace(/\s+/g, ' ').trim();
}

/** A code Excel kept as a number: leading zeros are gone, and above 15 digits the value itself was rounded. */
function numericCodeProblem(cell: RawCell | undefined): 'PRECISION' | 'NUMBER' | null {
  if (!cell?.isNumeric || typeof cell.value !== 'number') return null;
  const v = cell.value;
  if (!Number.isFinite(v) || !Number.isInteger(v) || Math.abs(v) > Number.MAX_SAFE_INTEGER) return 'PRECISION';
  const digits = String(Math.abs(v)).replace(/\D/g, '').length;
  return digits >= 16 || /e/i.test(String(v)) ? 'PRECISION' : 'NUMBER';
}

function parseEnum<T extends string>(raw: string, allowed: readonly T[]): T | null {
  const upper = raw.trim().toUpperCase();
  if ((allowed as readonly string[]).includes(upper)) return upper as T;
  const alias = ENUM_ALIASES[normalizeSearchText(raw)];
  return alias && (allowed as readonly string[]).includes(alias) ? (alias as T) : null;
}

function parseNonNegativeInt(cell: RawCell | undefined): number | null | 'NEGATIVE' {
  if (cell && typeof cell.value === 'number') {
    if (cell.value < 0) return 'NEGATIVE';
    return Number.isSafeInteger(cell.value) ? cell.value : null;
  }
  const t = toAsciiDigits(cellText(cell)).replace(INVISIBLE_RE, '').replace(/[\s,٬،]/g, '');
  if (t.startsWith('-')) return 'NEGATIVE';
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

function parseBool(raw: string): boolean | null {
  const t = normalizeSearchText(raw);
  if (['1', 'true', 'yes', 'بله', 'فعال'].includes(t)) return true;
  if (['0', 'false', 'no', 'خیر', 'غیرفعال', 'غیر فعال'].includes(t)) return false;
  return null;
}

const UNIT_IN_CELL: ReadonlyArray<readonly [RegExp, PriceUnit]> = [
  [/ریال|\brials?\b|\birr\b/gi, 'IRR'],
  [/تومان|\btomans?\b/gi, 'TOMAN'],
  [/درهم|\bdirhams?\b|\baed\b/gi, 'AED'],
];

export type AmountResult = { minor: bigint; currency: CurrencyCode; fromToman: boolean } | { code: string };

/**
 * Reads a price written in `unit`: Persian/Arabic digits, thousands separators
 * (, ٬ ، space and 1.250.000), the Persian decimal sign ٫ and a unit word in the
 * cell. A unit word different from `unit` is an error, never a conversion.
 * Toman becomes rial (×10) because the person chose toman for this column.
 */
export function parseImportAmount(cell: RawCell, unit: PriceUnit): AmountResult {
  const currency: CurrencyCode = unit === 'AED' ? 'AED' : 'IRR';
  const scale = unit === 'AED' ? 2 : unit === 'TOMAN' ? 1 : 0;
  let text: string;
  if (typeof cell.value === 'number') {
    const n = cell.value;
    if (!Number.isFinite(n) || Math.abs(n) >= 1e15) return { code: 'NUMBER_PRECISION_LOST' };
    if (n < 0) return { code: 'NEGATIVE_NOT_ALLOWED' };
    text = n.toFixed(scale + 2);
  } else {
    text = toAsciiDigits(cellText(cell)).replace(INVISIBLE_RE, ' ');
    for (const [re, u] of UNIT_IN_CELL) {
      if (re.test(text)) {
        if (u !== unit) return { code: 'PRICE_UNIT_MISMATCH' };
        text = text.replace(re, ' ');
      }
      re.lastIndex = 0;
    }
    text = text.replace(/[\s,٬،'’]/g, '').replace(/٫/g, '.');
    if (/^\d{1,3}(\.\d{3}){2,}$/.test(text)) text = text.replace(/\./g, '');
  }
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m) return { code: 'INVALID_AMOUNT' };
  if (m[1] === '-') return { code: 'NEGATIVE_NOT_ALLOWED' };
  const whole = m[2] ?? '0';
  const fraction = (m[3] ?? '').replace(/0+$/, '');
  if (fraction.length > scale) return { code: 'INVALID_AMOUNT' };
  if (unit === 'TOMAN') return { minor: BigInt(whole) * 10n + BigInt(fraction || '0'), currency, fromToman: true };
  try {
    return { minor: parseDecimalAmount(fraction ? `${whole}.${fraction}` : whole, currency), currency, fromToman: false };
  } catch {
    return { code: 'INVALID_AMOUNT' };
  }
}

/**
 * Comparison key of a technical number: case, spaces and separators do not
 * matter ("04501-028 05" = "0450102805"); the stored value keeps its spelling.
 */
export function technicalKey(code: string): string {
  return normalizeSearchText(code).replace(/ /g, '');
}

/** Splits a list cell ("IKCO, SAIPA" / "پژو ۲۰۶ ، سمند") into unique trimmed items. */
function listItems(raw: string): string[] {
  return [...new Set(raw.split(/[,،;|\n]/).map((c) => c.replace(/\s+/g, ' ').trim()).filter(Boolean))];
}

function show(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.join(',');
  return String(value);
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/** `rowNumbers` are the rows' numbers in the spreadsheet (header excluded); default: rows start at 2. */
export function planImport(rows: readonly RawRow[], ctx: ImportContext, rowNumbers?: readonly number[]): ImportPlan {
  const fileErrors: string[] = [];
  if (rows.length > MAX_IMPORT_ROWS) fileErrors.push('TOO_MANY_ROWS');

  const skuCounts = new Map<string, number>();
  const technicalCounts = new Map<string, number>();
  for (const r of rows) {
    const s = codeText(r.sku);
    if (s) skuCounts.set(s.toUpperCase(), (skuCounts.get(s.toUpperCase()) ?? 0) + 1);
    const tech = codeText(r.technical_number);
    if (tech) {
      const key = `${technicalKey(tech)}|${brandKey(r, ctx)}`;
      technicalCounts.set(key, (technicalCounts.get(key) ?? 0) + 1);
    }
  }

  const plans: ImportRowPlan[] = rows.map((row, i) => planRow(row, rowNumbers?.[i] ?? i + 2, ctx, skuCounts, technicalCounts));
  const summary = { create: 0, update: 0, unchanged: 0, error: 0, warnings: 0 };
  const required = new Set<ImportPermission>();
  for (const p of plans) {
    if (p.action === 'CREATE') summary.create += 1;
    else if (p.action === 'UPDATE') summary.update += 1;
    else if (p.action === 'UNCHANGED') summary.unchanged += 1;
    else summary.error += 1;
    summary.warnings += p.issues.filter((x) => x.severity === 'warning').length;
    for (const perm of permissionsFor(p)) required.add(perm);
  }
  const applicable = summary.create + summary.update > 0 && fileErrors.length === 0;
  return {
    rows: plans,
    summary,
    fileErrors,
    // Default policy: any row error or file error blocks the whole batch, unless the person explicitly leaves those rows out.
    canCommit: applicable && summary.error === 0,
    canCommitValid: applicable,
    requiredPermissions: [...required].sort(),
  };
}

const PRICE_FIELDS: ReadonlySet<keyof ParsedImportValues> = new Set(['baseCurrency', 'basePriceMinor', 'overridePriceIrrMinor', 'overridePriceAedMinor']);
const STOCK_FIELDS: ReadonlySet<keyof ParsedImportValues> = new Set(['onHand', 'onHandAdd', 'lowStockThreshold']);

/** Which permissions applying this row needs: product details, prices, stock (spec §5 roles). */
export function permissionsFor(row: Pick<ImportRowPlan, 'action' | 'changes' | 'values'>): ImportPermission[] {
  const out = new Set<ImportPermission>();
  if (row.action === 'CREATE') {
    out.add('products.write');
    out.add('prices.write');
    if ((row.values?.onHand ?? 0) > 0 || row.values?.lowStockThreshold !== undefined) out.add('inventory.adjust');
  } else if (row.action === 'UPDATE') {
    for (const c of row.changes) {
      if (PRICE_FIELDS.has(c.field)) out.add('prices.write');
      else if (STOCK_FIELDS.has(c.field)) out.add('inventory.adjust');
      else out.add('products.write');
    }
  }
  return [...out];
}

/** Brand a row would carry, for comparing technical numbers: the row's own brand, or the file's value for new products. */
function brandKey(row: RawRow, ctx: ImportContext): string {
  const own = cellText(row.manufacturer_brand);
  const name = own || (ctx.defaults?.manufacturerBrand ?? '');
  return name ? (ctx.manufacturerBrands.get(normalizeSearchText(name)) ?? `?${normalizeSearchText(name)}`) : '';
}

function planRow(row: RawRow, rowNumber: number, ctx: ImportContext, skuCounts: Map<string, number>, technicalCounts: Map<string, number>): ImportRowPlan {
  const issues: ImportIssue[] = [];
  const err = (column: ImportColumn | null, code: string, detail?: string) => issues.push({ column, code, severity: 'error', ...(detail ? { detail } : {}) });
  const warn = (column: ImportColumn | null, code: string, detail?: string) => issues.push({ column, code, severity: 'warning', ...(detail ? { detail } : {}) });
  const defaults = ctx.defaults ?? {};
  const stockMode = ctx.stockMode ?? 'SET';
  const usedDefaults: ImportColumn[] = [];

  for (const col of IMPORT_COLUMNS) {
    const cell = row[col];
    if (cell?.error) err(col, 'CELL_ERROR_VALUE', cell.error);
    else if (cell?.isFormula) {
      if (PRICE_OR_QTY.has(col) || CODE_COLUMNS.has(col)) err(col, 'FORMULA_NOT_ALLOWED');
      else if (cell.value === null) err(col, 'FORMULA_WITHOUT_VALUE');
      else warn(col, 'FORMULA_RESULT_USED');
    }
  }

  const sku = codeText(row.sku);
  if (!sku) err('sku', 'REQUIRED');
  else if (!SKU_RE.test(sku)) err('sku', 'INVALID_SKU');
  const skuNumber = numericCodeProblem(row.sku);
  if (skuNumber === 'PRECISION') err('sku', 'NUMBER_PRECISION_LOST');
  else if (skuNumber === 'NUMBER') warn('sku', 'SKU_STORED_AS_NUMBER');
  if (sku && (skuCounts.get(sku.toUpperCase()) ?? 0) > 1) err('sku', 'DUPLICATE_SKU_IN_FILE');

  const existing = sku ? ctx.existing.get(sku) : undefined;
  const isCreate = !existing;
  if (isCreate && ctx.mode === 'UPDATE_ONLY' && sku) err('sku', 'SKU_NOT_FOUND_UPDATE_ONLY');

  const values: ParsedImportValues = { sku };
  const empty = (col: ImportColumn) => cellText(row[col]) === '';

  // Text fields
  const text = (col: ImportColumn, max: number, set: (v: string | null) => void, nullable: boolean) => {
    const raw = cellText(row[col]);
    if (raw === '') {
      if (!isCreate && ctx.clearWhenEmpty.has(col)) {
        if (nullable) set(null);
        else err(col, 'CANNOT_CLEAR_REQUIRED');
      }
      return;
    }
    if (raw.length > max) err(col, 'TOO_LONG');
    else set(raw);
  };
  text('name_fa', LIMITS.name, (v) => { if (v !== null) values.nameFa = v.replace(/\s+/g, ' '); }, false);
  text('name_en', LIMITS.name, (v) => { values.nameEn = v; }, true);
  text('description_fa', LIMITS.description, (v) => { values.descriptionFa = v; }, true);
  text('description_en', LIMITS.description, (v) => { values.descriptionEn = v; }, true);
  text('unit', LIMITS.unit, (v) => { if (v !== null) values.unit = v; }, false);
  if (isCreate && values.unit === undefined && defaults.unit) {
    values.unit = defaults.unit;
    usedDefaults.push('unit');
  }

  // Technical number (kept as text, like the SKU)
  const technical = codeText(row.technical_number);
  if (technical) {
    if (technical.length > LIMITS.code) err('technical_number', 'TOO_LONG');
    else values.technicalNumber = technical;
    const techNumber = numericCodeProblem(row.technical_number);
    if (techNumber === 'PRECISION') err('technical_number', 'NUMBER_PRECISION_LOST');
    else if (techNumber === 'NUMBER') warn('technical_number', 'TECHNICAL_NUMBER_STORED_AS_NUMBER');
  }

  // Category: code or name as registered in the panel.
  const category = cellText(row.category_code);
  if (category) {
    const code = ctx.categoryCodes.has(category) ? category : ctx.categoryNames?.get(normalizeSearchText(category));
    if (!code) err('category_code', 'UNKNOWN_CATEGORY');
    else values.categoryCode = code;
  } else if (isCreate && defaults.categoryCode) {
    values.categoryCode = defaults.categoryCode;
    usedDefaults.push('category_code');
  }

  const vb = cellText(row.vehicle_brand_codes);
  if (vb) {
    const items = listItems(vb);
    const codes = items.map((c) => (ctx.vehicleBrandCodes.has(c) ? c : ctx.vehicleBrandNames?.get(normalizeSearchText(c))));
    if (codes.some((c) => !c)) err('vehicle_brand_codes', 'UNKNOWN_VEHICLE_BRAND', items.filter((_, i) => !codes[i]).join('، '));
    else values.vehicleBrandCodes = [...new Set(codes as string[])];
  } else if (!isCreate && ctx.clearWhenEmpty.has('vehicle_brand_codes')) {
    values.vehicleBrandCodes = [];
  } else if (isCreate && defaults.vehicleBrandCodes?.length) {
    values.vehicleBrandCodes = [...defaults.vehicleBrandCodes];
    usedDefaults.push('vehicle_brand_codes');
  }

  const models = cellText(row.vehicle_models);
  if (models) {
    const items = listItems(models);
    if (items.length > LIMITS.models || items.some((m) => m.length > LIMITS.model)) err('vehicle_models', 'TOO_LONG');
    else values.vehicleModels = items;
  }

  const mb = cellText(row.manufacturer_brand);
  let rowBrandId: string | null = null;
  if (mb) {
    const id = ctx.manufacturerBrands.get(normalizeSearchText(mb));
    if (!id) err('manufacturer_brand', 'UNKNOWN_MANUFACTURER_BRAND', mb);
    else {
      values.manufacturerBrand = mb;
      rowBrandId = id;
    }
  } else if (!isCreate && ctx.clearWhenEmpty.has('manufacturer_brand')) {
    values.manufacturerBrand = null;
  } else if (isCreate && defaults.manufacturerBrand) {
    values.manufacturerBrand = defaults.manufacturerBrand;
    rowBrandId = ctx.manufacturerBrands.get(normalizeSearchText(defaults.manufacturerBrand)) ?? null;
    usedDefaults.push('manufacturer_brand');
  }

  const enumField = <T extends string>(col: ImportColumn, allowed: readonly T[], fallback: T | null | undefined, set: (v: T) => void) => {
    const raw = cellText(row[col]);
    if (!raw) {
      if (isCreate && fallback) {
        set(fallback);
        usedDefaults.push(col);
      }
      return;
    }
    const parsed = parseEnum(raw, allowed);
    if (!parsed) err(col, 'INVALID_VALUE', raw);
    else set(parsed);
  };
  enumField('part_type', PART_TYPES, defaults.partType, (v) => { values.partType = v; });
  enumField('condition', CONDITIONS, defaults.condition, (v) => { values.condition = v; });
  enumField('origin', ORIGINS, defaults.origin, (v) => { values.origin = v; });

  // Currency and prices. A currency cell decides the row; otherwise the unit chosen for the price column.
  let unit: PriceUnit | null = null;
  const cur = cellText(row.base_currency);
  if (cur) {
    if (TOMAN_WORDS.has(normalizeSearchText(cur))) {
      if (ctx.priceUnit === 'TOMAN') unit = 'TOMAN';
      else err('base_currency', 'TOMAN_NEEDS_CONVERSION');
    } else {
      const mapped = parseEnum(cur, ['IRR', 'AED'] as const);
      if (!mapped || !isCurrencyCode(mapped)) err('base_currency', 'UNKNOWN_CURRENCY', cur);
      else unit = mapped;
    }
  } else if (ctx.priceUnit) {
    unit = ctx.priceUnit;
  }
  if (unit) values.baseCurrency = unit === 'AED' ? 'AED' : 'IRR';
  const priceUnit: PriceUnit | null = unit ?? (existing ? existing.baseCurrency : null);

  const shown: { price: ImportRowDisplay['price'] } = { price: null };
  const money = (col: ImportColumn, u: PriceUnit | null, set: (v: bigint | null) => void, nullable: boolean, forDisplay = false) => {
    const cell = row[col];
    const raw = cellText(cell);
    if (!raw || !cell) {
      if (!isCreate && nullable && ctx.clearWhenEmpty.has(col)) set(null);
      return;
    }
    if (forDisplay) shown.price = { text: raw };
    if (cell.error || (cell.isFormula && PRICE_OR_QTY.has(col))) return;
    if (!u) {
      err(col, 'CURRENCY_REQUIRED');
      return;
    }
    const parsed = parseImportAmount(cell, u);
    if ('code' in parsed) {
      err(col, parsed.code);
      return;
    }
    if (parsed.minor === 0n && col === 'base_price') {
      err(col, 'ZERO_PRICE_NOT_ALLOWED');
      return;
    }
    if (forDisplay) shown.price = { amountMinor: parsed.minor.toString(), currency: parsed.currency, fromToman: parsed.fromToman };
    set(parsed.minor);
  };
  money('base_price', priceUnit, (v) => { if (v !== null) values.basePriceMinor = v; }, false, true);
  money('override_price_irr', 'IRR', (v) => { values.overridePriceIrrMinor = v; }, true);
  money('override_price_aed', 'AED', (v) => { values.overridePriceAedMinor = v; }, true);
  if (values.baseCurrency && existing && values.baseCurrency !== existing.baseCurrency && values.basePriceMinor === undefined) {
    err('base_price', 'PRICE_REQUIRED_WHEN_CURRENCY_CHANGES');
  }
  // A unit chosen for the file must not silently become every new product's currency when it has no price.
  if (values.basePriceMinor === undefined && !cur) delete values.baseCurrency;

  // Stock
  let stockDisplay: ImportRowDisplay['stock'] = null;
  const qtyCell = row.on_hand;
  const qtyRaw = cellText(qtyCell);
  if (qtyRaw && qtyCell && !qtyCell.error && !qtyCell.isFormula) {
    const n = parseNonNegativeInt(qtyCell);
    if (n === 'NEGATIVE') err('on_hand', 'NEGATIVE_NOT_ALLOWED');
    else if (n === null) err('on_hand', 'NOT_A_WHOLE_NUMBER');
    else if (isCreate || stockMode === 'SET') values.onHand = n;
    else values.onHandAdd = n;
    if (typeof n !== 'number') stockDisplay = { text: qtyRaw };
  } else if (isCreate && defaults.initialOnHand !== undefined && defaults.initialOnHand !== null) {
    values.onHand = defaults.initialOnHand;
    usedDefaults.push('on_hand');
  }
  if (existing && stockMode === 'SET' && values.onHand !== undefined && values.onHand < existing.reserved) err('on_hand', 'ON_HAND_BELOW_RESERVED');
  const lowCell = row.low_stock_threshold;
  if (cellText(lowCell) && lowCell && !lowCell.error && !lowCell.isFormula) {
    const n = parseNonNegativeInt(lowCell);
    if (n === 'NEGATIVE') err('low_stock_threshold', 'NEGATIVE_NOT_ALLOWED');
    else if (n === null) err('low_stock_threshold', 'NOT_A_WHOLE_NUMBER');
    else values.lowStockThreshold = n;
  }
  if (!stockDisplay) {
    if (values.onHandAdd !== undefined && existing) {
      stockDisplay = { mode: 'ADD', quantity: values.onHandAdd, before: existing.onHand, after: existing.onHand + values.onHandAdd };
    } else if (values.onHand !== undefined) {
      stockDisplay = { mode: isCreate ? 'SET' : stockMode, quantity: values.onHand, before: existing?.onHand ?? null, after: values.onHand };
    } else if (isCreate) {
      stockDisplay = { mode: 'SET', quantity: null, before: null, after: 0 };
    } else if (existing) {
      stockDisplay = { mode: stockMode, quantity: null, before: existing.onHand, after: existing.onHand };
    }
  }

  const active = cellText(row.is_active);
  if (active) {
    const b = parseBool(active);
    if (b === null) err('is_active', 'INVALID_VALUE', active);
    else values.isActive = b;
  }

  // Required values for a new product (after the values chosen for the whole file).
  if (isCreate) {
    const has: Partial<Record<ImportColumn, boolean>> = {
      sku: !!sku, name_fa: values.nameFa !== undefined, category_code: values.categoryCode !== undefined, part_type: values.partType !== undefined,
      condition: values.condition !== undefined, origin: values.origin !== undefined, base_currency: values.baseCurrency !== undefined || !empty('base_currency'),
      base_price: !empty('base_price'),
    };
    for (const col of REQUIRED_ON_CREATE) {
      if (col === 'sku' || has[col] || issues.some((x) => x.column === col)) continue;
      // Without a price, or with its unit already reported on the price, a separate currency error says nothing new.
      if (col === 'base_currency' && (empty('base_price') || issues.some((x) => x.column === 'base_price'))) continue;
      if (DEFAULTABLE_ON_CREATE.includes(col) || col === 'base_currency') err(col, 'REQUIRED_FOR_NEW');
      else err(col, 'REQUIRED');
    }
  }

  // Same SKU, another manufacturer: never merge two brands' parts because their codes match.
  const existingBrandId = existing?.manufacturerBrandId ?? null;
  const ownBrandId = mb ? rowBrandId : null;
  if (existing && existingBrandId && ownBrandId && existingBrandId !== ownBrandId) err('manufacturer_brand', 'SKU_BRAND_CONFLICT', existing.manufacturerBrand ?? undefined);

  // The technical number already belongs to another SKU: same brand → duplicate; brand unknown → ask to check.
  if (values.technicalNumber) {
    const key = technicalKey(values.technicalNumber);
    for (const other of ctx.technicalNumbers?.get(key) ?? []) {
      if (other.sku === sku) continue;
      if (rowBrandId && other.manufacturerBrandId) {
        if (rowBrandId === other.manufacturerBrandId) {
          if (isCreate) err('technical_number', 'DUPLICATE_TECHNICAL_NUMBER', other.sku);
          else warn('technical_number', 'POSSIBLE_DUPLICATE', other.sku);
        }
      } else {
        warn('technical_number', 'POSSIBLE_DUPLICATE', other.sku);
      }
    }
    if ((technicalCounts.get(`${key}|${brandKey(row, ctx)}`) ?? 0) > 1) warn('technical_number', 'TECHNICAL_NUMBER_REPEATED_IN_FILE');
  }

  const hasErrors = issues.some((x) => x.severity === 'error');
  const changes = existing && !hasErrors ? diff(existing, values) : [];
  const action: ImportRowPlan['action'] = hasErrors ? 'ERROR' : isCreate ? 'CREATE' : changes.length ? 'UPDATE' : 'UNCHANGED';
  const display: ImportRowDisplay = {
    name: values.nameFa ?? (cellText(row.name_fa) || existing?.nameFa || null),
    technicalNumber: values.technicalNumber ?? (codeText(row.technical_number) || null),
    brand: values.manufacturerBrand ?? (mb || existing?.manufacturerBrand || null),
    price: shown.price ?? (existing ? { amountMinor: existing.basePriceMinor.toString(), currency: existing.baseCurrency, fromToman: false } : null),
    stock: stockDisplay,
    defaults: usedDefaults,
  };
  return {
    rowNumber,
    sku: sku || null,
    action,
    issues,
    values: hasErrors ? null : values,
    changes,
    display,
    expectedProductVersion: existing?.version ?? null,
    expectedInventoryVersion: existing?.inventoryVersion ?? null,
  };
}

function diff(e: ExistingProductSnapshot, v: ParsedImportValues): FieldChange[] {
  const out: FieldChange[] = [];
  const cmp = (field: keyof ParsedImportValues, before: unknown, after: unknown, currency?: CurrencyCode) => {
    if (after === undefined) return;
    const b = show(before);
    const a = show(after);
    if (b !== a) out.push({ field, before: b, after: a, ...(currency ? { currency } : {}) });
  };
  cmp('nameFa', e.nameFa, v.nameFa);
  cmp('nameEn', e.nameEn, v.nameEn);
  cmp('categoryCode', e.categoryCode, v.categoryCode);
  cmp('vehicleBrandCodes', [...e.vehicleBrandCodes].sort(), v.vehicleBrandCodes ? [...v.vehicleBrandCodes].sort() : undefined);
  cmp('manufacturerBrand', e.manufacturerBrand, v.manufacturerBrand);
  cmp('partType', e.partType, v.partType);
  cmp('condition', e.condition, v.condition);
  cmp('origin', e.origin, v.origin);
  cmp('baseCurrency', e.baseCurrency, v.baseCurrency);
  cmp('basePriceMinor', e.basePriceMinor, v.basePriceMinor, v.baseCurrency ?? e.baseCurrency);
  cmp('overridePriceIrrMinor', e.overridePriceIrrMinor, v.overridePriceIrrMinor, 'IRR');
  cmp('overridePriceAedMinor', e.overridePriceAedMinor, v.overridePriceAedMinor, 'AED');
  cmp('onHand', e.onHand, v.onHand);
  if (v.onHandAdd) out.push({ field: 'onHandAdd', before: String(e.onHand), after: String(e.onHand + v.onHandAdd), delta: v.onHandAdd });
  cmp('lowStockThreshold', e.lowStockThreshold, v.lowStockThreshold);
  cmp('unit', e.unit, v.unit);
  cmp('descriptionFa', e.descriptionFa, v.descriptionFa);
  cmp('descriptionEn', e.descriptionEn, v.descriptionEn);
  cmp('isActive', e.isActive, v.isActive);
  // Technical numbers and compatible vehicles are only ever added by an import, never removed.
  const oem = e.oemCodes ?? [];
  if (v.technicalNumber && !oem.some((c) => technicalKey(c) === technicalKey(v.technicalNumber as string))) {
    out.push({ field: 'technicalNumber', before: oem.length ? oem.join('، ') : null, after: [...oem, v.technicalNumber].join('، ') });
  }
  const models = e.vehicleModels ?? [];
  const added = (v.vehicleModels ?? []).filter((m) => !models.some((x) => normalizeSearchText(x) === normalizeSearchText(m)));
  if (added.length) out.push({ field: 'vehicleModels', before: models.length ? models.join('، ') : null, after: [...models, ...added].join('، ') });
  return out;
}

/**
 * Plain-language text for row issues, file errors and job failure reasons, used
 * by the admin import screen and the downloadable row-error report. Unknown
 * codes fall back to the code itself.
 */
const IMPORT_CODE_TEXT: Readonly<Record<string, { fa: string; en: string }>> = {
  REQUIRED: { fa: 'این ستون الزامی است.', en: 'This column is required.' },
  REQUIRED_FOR_NEW: {
    fa: 'برای ثبت کالای تازه لازم است؛ آن را در فایل وارد کنید یا در مرحلهٔ تطبیق ستون‌ها یک مقدار برای همهٔ کالاهای تازهٔ این فایل انتخاب کنید.',
    en: 'Needed to create a new product: add it to the file, or choose one value for all new products of this file in the mapping step.',
  },
  INVALID_SKU: { fa: 'کد کالا فقط حروف انگلیسی، عدد و نویسه‌های . _ - / می‌پذیرد (حداکثر ۶۴ نویسه).', en: 'SKU allows only Latin letters, digits and . _ - / (up to 64 characters).' },
  SKU_STORED_AS_NUMBER: { fa: 'کد کالا در فایل عددی ذخیره شده بود و ممکن است صفرهای ابتدایی‌اش حذف شده باشد؛ قالب ستون را «متن» کنید.', en: 'The SKU was stored as a number and may have lost leading zeros; format the column as text.' },
  TECHNICAL_NUMBER_STORED_AS_NUMBER: {
    fa: 'شماره فنی در فایل عددی ذخیره شده و ممکن است صفرهای ابتدایی‌اش حذف شده باشد؛ آن را با اصل مقایسه کنید و ستون را «متن» کنید.',
    en: 'The technical number was stored as a number and may have lost leading zeros; check it against the original and format the column as text.',
  },
  NUMBER_PRECISION_LOST: {
    fa: 'Excel این عدد را عددی ذخیره کرده و ارقامش را گرد یا کوتاه کرده است؛ مقدار اصلی قابل بازیابی نیست. ستون را «متن» کنید و مقدار درست را دوباره بنویسید.',
    en: 'Excel stored this as a number and rounded or shortened it; the original value cannot be recovered. Format the column as text and type the correct value again.',
  },
  DUPLICATE_SKU_IN_FILE: { fa: 'این کد کالا بیش از یک بار در فایل آمده است.', en: 'This SKU appears more than once in the file.' },
  SKU_NOT_FOUND_UPDATE_ONLY: { fa: 'کالایی با این کد وجود ندارد؛ در حالت «فقط به‌روزرسانی» کالای جدید ساخته نمی‌شود.', en: 'No product has this SKU; “update only” mode does not create products.' },
  SKU_BRAND_CONFLICT: {
    fa: 'کالایی با همین کد کالا ولی برند سازندهٔ دیگری ثبت شده است؛ این ردیف با آن یکی نمی‌شود. برای کالای این برند کد کالای جداگانه بنویسید.',
    en: 'A product with this SKU exists under another manufacturer brand; this row is not merged into it. Give this brand’s part its own SKU.',
  },
  DUPLICATE_TECHNICAL_NUMBER: {
    fa: 'کالای دیگری با همین شماره فنی و همین برند سازنده ثبت شده است؛ برای به‌روزرسانی آن از کد کالای همان کالا استفاده کنید.',
    en: 'Another product with this technical number and manufacturer brand exists; use that product’s SKU to update it.',
  },
  POSSIBLE_DUPLICATE: {
    fa: 'کالای دیگری با همین شماره فنی ثبت شده و برند یکی از آن‌ها مشخص نیست؛ پیش از ثبت بررسی کنید که تکراری نباشد.',
    en: 'Another product has this technical number and one of them has no manufacturer brand; check it is not a duplicate before applying.',
  },
  TECHNICAL_NUMBER_REPEATED_IN_FILE: { fa: 'همین شماره فنی با همین برند در ردیف دیگری از فایل هم آمده است.', en: 'The same technical number and brand appear in another row of the file.' },
  CANNOT_CLEAR_REQUIRED: { fa: 'مقدار این ستون الزامی است و خالی نمی‌شود.', en: 'This value is required and cannot be cleared.' },
  TOO_LONG: { fa: 'متن از حد مجاز طولانی‌تر است.', en: 'The text is too long.' },
  UNKNOWN_CATEGORY: { fa: 'این دسته در پنل ثبت نشده است؛ کد یا نام دسته را همان‌طور که در پنل است بنویسید.', en: 'This category does not exist; write its code or name as registered in the panel.' },
  UNKNOWN_VEHICLE_BRAND: { fa: 'این برند خودرو در پنل ثبت نشده است.', en: 'This vehicle brand does not exist.' },
  UNKNOWN_MANUFACTURER_BRAND: { fa: 'این برند سازنده در پنل ثبت نشده است.', en: 'This manufacturer brand does not exist.' },
  INVALID_VALUE: { fa: 'این مقدار مجاز نیست.', en: 'This value is not allowed.' },
  UNKNOWN_CURRENCY: { fa: 'ارز فقط IRR (ریال) یا AED (درهم) است.', en: 'Currency must be IRR or AED.' },
  TOMAN_NEEDS_CONVERSION: {
    fa: 'ارز این ردیف تومان است. تومان فقط وقتی پذیرفته می‌شود که واحد قیمت را «تومان، تبدیل به ریال» انتخاب کنید.',
    en: 'This row’s currency is toman. Toman is accepted only when you choose “toman, converted to rial” as the price unit.',
  },
  PRICE_UNIT_MISMATCH: { fa: 'واحدی که در سلول قیمت نوشته شده با واحد انتخاب‌شده برای ستون قیمت یکی نیست.', en: 'The unit written in the price cell differs from the unit chosen for the price column.' },
  CURRENCY_REQUIRED: { fa: 'واحد این مبلغ مشخص نیست؛ واحد قیمت را در مرحلهٔ تطبیق ستون‌ها انتخاب کنید یا ستون ارز داشته باشید.', en: 'The unit of this amount is unknown; choose the price unit in the mapping step or include a currency column.' },
  NEGATIVE_NOT_ALLOWED: { fa: 'عدد منفی مجاز نیست.', en: 'Negative numbers are not allowed.' },
  ZERO_PRICE_NOT_ALLOWED: { fa: 'قیمت پایه نمی‌تواند صفر باشد.', en: 'The base price cannot be zero.' },
  INVALID_AMOUNT: { fa: 'مبلغ خوانده نشد (ریال بدون اعشار، تومان حداکثر یک رقم اعشار، درهم حداکثر دو رقم اعشار).', en: 'The amount could not be read (IRR without decimals, toman up to 1 decimal, AED up to 2).' },
  PRICE_REQUIRED_WHEN_CURRENCY_CHANGES: { fa: 'با تغییر ارز پایه، قیمت پایه را هم وارد کنید.', en: 'Enter the base price when the base currency changes.' },
  NOT_A_WHOLE_NUMBER: { fa: 'فقط عدد صحیح مجاز است.', en: 'Only whole numbers are allowed.' },
  ON_HAND_BELOW_RESERVED: { fa: 'موجودی جدید کمتر از مقدار رزروشده برای مشتریان است.', en: 'The new stock is below the quantity reserved for customers.' },
  FORMULA_NOT_ALLOWED: { fa: 'در این ستون فرمول مجاز نیست؛ مقدار ثابت وارد کنید.', en: 'Formulas are not allowed in this column; enter a fixed value.' },
  FORMULA_WITHOUT_VALUE: { fa: 'این سلول فرمول است و نتیجهٔ ذخیره‌شده ندارد؛ فایل را با «فقط مقادیر» ذخیره کنید.', en: 'This cell is a formula without a stored result; save the file as values only.' },
  FORMULA_RESULT_USED: { fa: 'به‌جای فرمول، نتیجهٔ محاسبه‌شدهٔ آن استفاده شد.', en: 'The calculated result of the formula was used.' },
  CELL_ERROR_VALUE: { fa: 'این سلول در Excel خطا دارد (مثل ‎#N/A‎) و خوانده نشد.', en: 'This cell holds an Excel error (such as #N/A) and was not read.' },
  TOO_MANY_ROWS: { fa: 'فایل بیش از ۵۰۰۰ ردیف دارد.', en: 'The file has more than 5000 rows.' },
  DUPLICATE_COLUMNS: { fa: 'یک ستون بیش از یک بار در سطر عنوان آمده است.', en: 'A column appears more than once in the header row.' },
  SKU_COLUMN_MISSING: { fa: 'ستون «کد کالا» (sku) پیدا نشد.', en: 'The SKU column was not found.' },
  UNREADABLE_FILE: { fa: 'فایل خوانده نشد؛ یک فایل سالم XLSX یا CSV بارگذاری کنید.', en: 'The file could not be read; upload a valid XLSX or CSV file.' },
  SHEET_NOT_FOUND: { fa: 'شیت انتخاب‌شده در فایل نیست.', en: 'The chosen sheet is not in the file.' },
  NO_DATA_ROWS: { fa: 'زیر سطر عنوان هیچ ردیف داده‌ای نیست.', en: 'There are no data rows below the header row.' },
  VERSION_CONFLICT: { fa: 'اطلاعات کالا پس از پیش‌نمایش تغییر کرده است؛ هیچ تغییری اعمال نشد. پیش‌نمایش را دوباره بسازید.', en: 'Products changed after the preview; nothing was applied. Build the preview again.' },
  COMMIT_FAILED: { fa: 'اعمال تغییرات ناموفق بود و هیچ تغییری ثبت نشد.', en: 'Applying failed and nothing was changed.' },
};

export function describeImportCode(code: string, locale: 'fa' | 'en'): string {
  return IMPORT_CODE_TEXT[code]?.[locale] ?? code;
}

/** Column name as the template shows it: the Persian header in fa, the canonical key in en. */
export function importColumnLabel(column: string, locale: 'fa' | 'en'): string {
  const aliases = (HEADER_ALIASES as Readonly<Record<string, readonly string[]>>)[column];
  return locale === 'fa' && aliases?.[1] ? aliases[1] : column;
}

/** The template column each parsed value comes from (labels for preview changes). */
const FIELD_COLUMN: Readonly<Record<keyof ParsedImportValues, ImportColumn>> = {
  sku: 'sku', nameFa: 'name_fa', nameEn: 'name_en', categoryCode: 'category_code', vehicleBrandCodes: 'vehicle_brand_codes',
  manufacturerBrand: 'manufacturer_brand', partType: 'part_type', condition: 'condition', origin: 'origin', baseCurrency: 'base_currency',
  basePriceMinor: 'base_price', overridePriceIrrMinor: 'override_price_irr', overridePriceAedMinor: 'override_price_aed', onHand: 'on_hand',
  onHandAdd: 'on_hand', lowStockThreshold: 'low_stock_threshold', unit: 'unit', descriptionFa: 'description_fa', descriptionEn: 'description_en',
  isActive: 'is_active', technicalNumber: 'technical_number', vehicleModels: 'vehicle_models',
};

export function importFieldLabel(field: string, locale: 'fa' | 'en'): string {
  const column = (FIELD_COLUMN as Readonly<Record<string, ImportColumn>>)[field];
  return column ? importColumnLabel(column, locale) : field;
}

/**
 * Columns an empty cell may clear in update mode, when the person explicitly
 * chooses so (spec §12). Everything else treats an empty cell as "no change".
 */
export const CLEARABLE_IMPORT_COLUMNS: readonly ImportColumn[] = [
  'name_en', 'vehicle_brand_codes', 'manufacturer_brand', 'override_price_irr', 'override_price_aed', 'description_fa', 'description_en',
];
