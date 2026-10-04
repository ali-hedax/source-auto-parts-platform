import { type CurrencyCode, isCurrencyCode, parseDecimalAmount, toAsciiDigits } from './money.js';
import { normalizeSearchText } from './search-normalize.js';

/**
 * Excel/CSV product import validation (spec §12). Pure: the parser produces
 * RawCells, the service supplies the existing catalog snapshot, and this module
 * returns a per-row plan. Preview never mutates; commit re-validates versions.
 */
export const IMPORT_COLUMNS = [
  'sku', 'name_fa', 'name_en', 'category_code', 'vehicle_brand_codes', 'manufacturer_brand', 'part_type', 'condition',
  'origin', 'base_currency', 'base_price', 'override_price_irr', 'override_price_aed', 'on_hand', 'low_stock_threshold',
  'unit', 'description_fa', 'description_en', 'is_active',
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export const MAX_IMPORT_ROWS = 5000;

/** Header aliases (normalized) → canonical column. Persian headers from the template are included. */
export const HEADER_ALIASES: Record<ImportColumn, readonly string[]> = {
  sku: ['sku', 'کد کالا', 'شناسه کالا', 'کد انبار'],
  name_fa: ['name_fa', 'نام فارسی', 'نام قطعه'],
  name_en: ['name_en', 'نام انگلیسی'],
  category_code: ['category_code', 'کد دسته', 'دسته'],
  vehicle_brand_codes: ['vehicle_brand_codes', 'برند خودرو', 'کد برند خودرو'],
  manufacturer_brand: ['manufacturer_brand', 'برند سازنده', 'سازنده'],
  part_type: ['part_type', 'نوع قطعه', 'نوع عرضه'],
  condition: ['condition', 'وضعیت فیزیکی', 'وضعیت'],
  origin: ['origin', 'منشا', 'منشأ'],
  base_currency: ['base_currency', 'ارز پایه', 'واحد پول'],
  base_price: ['base_price', 'قیمت پایه'],
  override_price_irr: ['override_price_irr', 'قیمت دستی ریال'],
  override_price_aed: ['override_price_aed', 'قیمت دستی درهم'],
  on_hand: ['on_hand', 'موجودی فیزیکی', 'موجودی'],
  low_stock_threshold: ['low_stock_threshold', 'حد هشدار موجودی', 'حد هشدار'],
  unit: ['unit', 'واحد فروش', 'واحد'],
  description_fa: ['description_fa', 'توضیحات فارسی'],
  description_en: ['description_en', 'توضیحات انگلیسی'],
  is_active: ['is_active', 'فعال'],
};

export const REQUIRED_ON_CREATE: readonly ImportColumn[] = [
  'sku', 'name_fa', 'category_code', 'part_type', 'condition', 'origin', 'base_currency', 'base_price', 'on_hand',
];

const PRICE_OR_QTY: ReadonlySet<ImportColumn> = new Set([
  'base_price', 'override_price_irr', 'override_price_aed', 'on_hand', 'low_stock_threshold',
]);

export const PART_TYPES = ['GENUINE', 'OEM', 'AFTERMARKET'] as const;
export const CONDITIONS = ['NEW', 'USED', 'REFURBISHED'] as const;
export const ORIGINS = ['DOMESTIC', 'IMPORTED', 'UNKNOWN'] as const;
export type PartType = (typeof PART_TYPES)[number];
export type PhysicalCondition = (typeof CONDITIONS)[number];
export type Origin = (typeof ORIGINS)[number];

const ENUM_ALIASES: Record<string, string> = {
  'اصلی': 'GENUINE', 'جنیون': 'GENUINE', 'او ای ام': 'OEM', 'oem': 'OEM', 'افترمارکت': 'AFTERMARKET', 'غیر اصلی': 'AFTERMARKET',
  'نو': 'NEW', 'کارکرده': 'USED', 'دست دوم': 'USED', 'بازسازی شده': 'REFURBISHED',
  'داخلی': 'DOMESTIC', 'وارداتی': 'IMPORTED', 'نامشخص': 'UNKNOWN',
  'ریال': 'IRR', 'درهم': 'AED',
};

export interface RawCell {
  value: string | number | boolean | null;
  /** True when the source cell contained a formula (never evaluated). */
  isFormula?: boolean;
  /** True when the spreadsheet stored the cell as a number (leading zeros may be lost). */
  isNumeric?: boolean;
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
}

export interface ImportContext {
  mode: 'UPDATE_ONLY' | 'CREATE_AND_UPDATE';
  existing: ReadonlyMap<string, ExistingProductSnapshot>;
  categoryCodes: ReadonlySet<string>;
  vehicleBrandCodes: ReadonlySet<string>;
  /** Normalized manufacturer brand name → id. Unknown names need explicit mapping. */
  manufacturerBrands: ReadonlyMap<string, string>;
  /** Columns the user explicitly chose to clear when the cell is empty (update mode). */
  clearWhenEmpty: ReadonlySet<ImportColumn>;
}

export interface ImportIssue {
  column: ImportColumn | null;
  code: string;
  severity: 'error' | 'warning';
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
  onHand?: number;
  lowStockThreshold?: number;
  unit?: string;
  descriptionFa?: string | null;
  descriptionEn?: string | null;
  isActive?: boolean;
}

export interface FieldChange {
  field: keyof ParsedImportValues;
  before: string | null;
  after: string | null;
  /** For amount fields: the currency of before/after (minor units: IRR = rial, AED = fils). */
  currency?: CurrencyCode;
}

export interface ImportRowPlan {
  rowNumber: number;
  sku: string | null;
  action: 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'ERROR';
  issues: ImportIssue[];
  values: ParsedImportValues | null;
  changes: FieldChange[];
  /** Versions captured at preview and re-checked at commit (optimistic locking). */
  expectedProductVersion: number | null;
  expectedInventoryVersion: number | null;
}

export interface ImportPlan {
  rows: ImportRowPlan[];
  summary: { create: number; update: number; unchanged: number; error: number; warnings: number };
  fileErrors: string[];
  canCommit: boolean;
}

export function mapHeaders(headers: readonly string[]): {
  mapping: Partial<Record<ImportColumn, number>>;
  unknownHeaders: string[];
  duplicateColumns: ImportColumn[];
} {
  const lookup = new Map<string, ImportColumn>();
  for (const col of IMPORT_COLUMNS) for (const alias of HEADER_ALIASES[col]) lookup.set(normalizeSearchText(alias), col);
  const mapping: Partial<Record<ImportColumn, number>> = {};
  const unknownHeaders: string[] = [];
  const duplicateColumns: ImportColumn[] = [];
  headers.forEach((h, index) => {
    const col = lookup.get(normalizeSearchText(h ?? ''));
    if (!col) {
      if ((h ?? '').trim()) unknownHeaders.push(h);
      return;
    }
    if (mapping[col] !== undefined) duplicateColumns.push(col);
    else mapping[col] = index;
  });
  return { mapping, unknownHeaders, duplicateColumns };
}

const SKU_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,63}$/;
const LIMITS = { name: 200, description: 5000, unit: 30, code: 64 };

function cellText(cell: RawCell | undefined): string {
  if (!cell || cell.value === null || cell.value === undefined) return '';
  return String(cell.value).trim();
}

function parseEnum<T extends string>(raw: string, allowed: readonly T[]): T | null {
  const upper = raw.trim().toUpperCase();
  if ((allowed as readonly string[]).includes(upper)) return upper as T;
  const alias = ENUM_ALIASES[normalizeSearchText(raw)];
  return alias && (allowed as readonly string[]).includes(alias) ? (alias as T) : null;
}

function parseNonNegativeInt(raw: string): number | null {
  const t = toAsciiDigits(raw).replace(/[,٬]/g, '');
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

function show(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.join(',');
  return String(value);
}

export function planImport(rows: readonly RawRow[], ctx: ImportContext): ImportPlan {
  const fileErrors: string[] = [];
  if (rows.length > MAX_IMPORT_ROWS) fileErrors.push('TOO_MANY_ROWS');

  const skuCounts = new Map<string, number>();
  for (const r of rows) {
    const s = cellText(r.sku);
    if (s) skuCounts.set(s.toUpperCase(), (skuCounts.get(s.toUpperCase()) ?? 0) + 1);
  }

  const plans: ImportRowPlan[] = rows.map((row, i) => planRow(row, i + 2, ctx, skuCounts));
  const summary = { create: 0, update: 0, unchanged: 0, error: 0, warnings: 0 };
  for (const p of plans) {
    if (p.action === 'CREATE') summary.create += 1;
    else if (p.action === 'UPDATE') summary.update += 1;
    else if (p.action === 'UNCHANGED') summary.unchanged += 1;
    else summary.error += 1;
    summary.warnings += p.issues.filter((x) => x.severity === 'warning').length;
  }
  return {
    rows: plans,
    summary,
    fileErrors,
    // Default policy: any row error or file error blocks the whole batch.
    canCommit: fileErrors.length === 0 && summary.error === 0 && summary.create + summary.update > 0,
  };
}

function planRow(row: RawRow, rowNumber: number, ctx: ImportContext, skuCounts: Map<string, number>): ImportRowPlan {
  const issues: ImportIssue[] = [];
  const err = (column: ImportColumn | null, code: string) => issues.push({ column, code, severity: 'error' });
  const warn = (column: ImportColumn | null, code: string) => issues.push({ column, code, severity: 'warning' });

  for (const col of IMPORT_COLUMNS) {
    const cell = row[col];
    if (cell?.isFormula) {
      if (PRICE_OR_QTY.has(col) || col === 'sku') err(col, 'FORMULA_NOT_ALLOWED');
      else warn(col, 'FORMULA_RESULT_USED');
    }
  }

  const sku = cellText(row.sku);
  if (!sku) err('sku', 'REQUIRED');
  else if (!SKU_RE.test(sku)) err('sku', 'INVALID_SKU');
  if (row.sku?.isNumeric) warn('sku', 'SKU_STORED_AS_NUMBER');
  if (sku && (skuCounts.get(sku.toUpperCase()) ?? 0) > 1) err('sku', 'DUPLICATE_SKU_IN_FILE');

  const existing = sku ? ctx.existing.get(sku) : undefined;
  const isCreate = !existing;
  if (isCreate && ctx.mode === 'UPDATE_ONLY' && sku) err('sku', 'SKU_NOT_FOUND_UPDATE_ONLY');

  const values: ParsedImportValues = { sku };
  const empty = (col: ImportColumn) => cellText(row[col]) === '';

  if (isCreate) for (const col of REQUIRED_ON_CREATE) if (empty(col)) err(col, 'REQUIRED');

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
  text('name_fa', LIMITS.name, (v) => { if (v !== null) values.nameFa = v; }, false);
  text('name_en', LIMITS.name, (v) => { values.nameEn = v; }, true);
  text('description_fa', LIMITS.description, (v) => { values.descriptionFa = v; }, true);
  text('description_en', LIMITS.description, (v) => { values.descriptionEn = v; }, true);
  text('unit', LIMITS.unit, (v) => { if (v !== null) values.unit = v; }, false);

  const category = cellText(row.category_code);
  if (category) {
    if (!ctx.categoryCodes.has(category)) err('category_code', 'UNKNOWN_CATEGORY');
    else values.categoryCode = category;
  }

  const vb = cellText(row.vehicle_brand_codes);
  if (vb) {
    const codes = [...new Set(vb.split(/[,،;|]/).map((c) => c.trim()).filter(Boolean))];
    const unknown = codes.filter((c) => !ctx.vehicleBrandCodes.has(c));
    if (unknown.length) err('vehicle_brand_codes', 'UNKNOWN_VEHICLE_BRAND');
    else values.vehicleBrandCodes = codes;
  } else if (!isCreate && ctx.clearWhenEmpty.has('vehicle_brand_codes')) {
    values.vehicleBrandCodes = [];
  }

  const mb = cellText(row.manufacturer_brand);
  if (mb) {
    if (!ctx.manufacturerBrands.has(normalizeSearchText(mb))) err('manufacturer_brand', 'UNKNOWN_MANUFACTURER_BRAND');
    else values.manufacturerBrand = mb;
  } else if (!isCreate && ctx.clearWhenEmpty.has('manufacturer_brand')) {
    values.manufacturerBrand = null;
  }

  const enumField = <T extends string>(col: ImportColumn, allowed: readonly T[], set: (v: T) => void) => {
    const raw = cellText(row[col]);
    if (!raw) return;
    const parsed = parseEnum(raw, allowed);
    if (!parsed) err(col, 'INVALID_VALUE');
    else set(parsed);
  };
  enumField('part_type', PART_TYPES, (v) => { values.partType = v; });
  enumField('condition', CONDITIONS, (v) => { values.condition = v; });
  enumField('origin', ORIGINS, (v) => { values.origin = v; });

  const cur = cellText(row.base_currency);
  if (cur) {
    const mapped = parseEnum(cur, ['IRR', 'AED'] as const);
    if (!mapped || !isCurrencyCode(mapped)) err('base_currency', 'UNKNOWN_CURRENCY');
    else values.baseCurrency = mapped;
  }

  const money = (col: ImportColumn, currency: CurrencyCode | undefined, set: (v: bigint | null) => void, nullable: boolean) => {
    const raw = cellText(row[col]);
    if (!raw) {
      if (!isCreate && nullable && ctx.clearWhenEmpty.has(col)) set(null);
      return;
    }
    if (!currency) {
      err(col, 'CURRENCY_REQUIRED');
      return;
    }
    try {
      const minor = parseDecimalAmount(raw, currency);
      if (minor < 0n) err(col, 'NEGATIVE_NOT_ALLOWED');
      else if (minor === 0n && col === 'base_price') err(col, 'ZERO_PRICE_NOT_ALLOWED');
      else set(minor);
    } catch {
      err(col, 'INVALID_AMOUNT');
    }
  };
  const baseCurrency = values.baseCurrency ?? existing?.baseCurrency;
  money('base_price', baseCurrency, (v) => { if (v !== null) values.basePriceMinor = v; }, false);
  money('override_price_irr', 'IRR', (v) => { values.overridePriceIrrMinor = v; }, true);
  money('override_price_aed', 'AED', (v) => { values.overridePriceAedMinor = v; }, true);
  if (values.baseCurrency && existing && values.baseCurrency !== existing.baseCurrency && values.basePriceMinor === undefined) {
    err('base_price', 'PRICE_REQUIRED_WHEN_CURRENCY_CHANGES');
  }

  const intField = (col: ImportColumn, set: (v: number) => void) => {
    const raw = cellText(row[col]);
    if (!raw) return;
    const n = parseNonNegativeInt(raw);
    if (n === null) err(col, raw.trim().startsWith('-') ? 'NEGATIVE_NOT_ALLOWED' : 'NOT_A_WHOLE_NUMBER');
    else set(n);
  };
  intField('on_hand', (v) => { values.onHand = v; });
  intField('low_stock_threshold', (v) => { values.lowStockThreshold = v; });
  if (existing && values.onHand !== undefined && values.onHand < existing.reserved) err('on_hand', 'ON_HAND_BELOW_RESERVED');

  const active = cellText(row.is_active);
  if (active) {
    const b = parseBool(active);
    if (b === null) err('is_active', 'INVALID_VALUE');
    else values.isActive = b;
  }

  const hasErrors = issues.some((x) => x.severity === 'error');
  const changes = existing && !hasErrors ? diff(existing, values) : [];
  const action: ImportRowPlan['action'] = hasErrors ? 'ERROR' : isCreate ? 'CREATE' : changes.length ? 'UPDATE' : 'UNCHANGED';
  return {
    rowNumber,
    sku: sku || null,
    action,
    issues,
    values: hasErrors ? null : values,
    changes,
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
  cmp('lowStockThreshold', e.lowStockThreshold, v.lowStockThreshold);
  cmp('unit', e.unit, v.unit);
  cmp('descriptionFa', e.descriptionFa, v.descriptionFa);
  cmp('descriptionEn', e.descriptionEn, v.descriptionEn);
  cmp('isActive', e.isActive, v.isActive);
  return out;
}

/**
 * Plain-language text for row issues, file errors and job failure reasons, used
 * by the admin import screen and the downloadable row-error report. Unknown
 * codes fall back to the code itself.
 */
const IMPORT_CODE_TEXT: Readonly<Record<string, { fa: string; en: string }>> = {
  REQUIRED: { fa: 'این ستون الزامی است.', en: 'This column is required.' },
  INVALID_SKU: { fa: 'کد کالا فقط حروف انگلیسی، عدد و نویسه‌های . _ - / می‌پذیرد (حداکثر ۶۴ نویسه).', en: 'SKU allows only Latin letters, digits and . _ - / (up to 64 characters).' },
  SKU_STORED_AS_NUMBER: { fa: 'کد کالا در فایل عددی ذخیره شده بود و ممکن است صفرهای ابتدایی‌اش حذف شده باشد؛ قالب ستون را «متن» کنید.', en: 'The SKU was stored as a number and may have lost leading zeros; format the column as text.' },
  DUPLICATE_SKU_IN_FILE: { fa: 'این کد کالا بیش از یک بار در فایل آمده است.', en: 'This SKU appears more than once in the file.' },
  SKU_NOT_FOUND_UPDATE_ONLY: { fa: 'کالایی با این کد وجود ندارد؛ در حالت «فقط به‌روزرسانی» کالای جدید ساخته نمی‌شود.', en: 'No product has this SKU; “update only” mode does not create products.' },
  CANNOT_CLEAR_REQUIRED: { fa: 'مقدار این ستون الزامی است و خالی نمی‌شود.', en: 'This value is required and cannot be cleared.' },
  TOO_LONG: { fa: 'متن از حد مجاز طولانی‌تر است.', en: 'The text is too long.' },
  UNKNOWN_CATEGORY: { fa: 'این کد دسته در پنل ثبت نشده است.', en: 'This category code does not exist.' },
  UNKNOWN_VEHICLE_BRAND: { fa: 'این کد برند خودرو در پنل ثبت نشده است.', en: 'This vehicle brand code does not exist.' },
  UNKNOWN_MANUFACTURER_BRAND: { fa: 'این برند سازنده در پنل ثبت نشده است.', en: 'This manufacturer brand does not exist.' },
  INVALID_VALUE: { fa: 'این مقدار مجاز نیست.', en: 'This value is not allowed.' },
  UNKNOWN_CURRENCY: { fa: 'ارز فقط IRR (ریال) یا AED (درهم) است؛ تومان پذیرفته نمی‌شود.', en: 'Currency must be IRR or AED; toman is not accepted.' },
  CURRENCY_REQUIRED: { fa: 'برای این مبلغ، ارز پایه را هم وارد کنید.', en: 'Enter the base currency for this amount.' },
  NEGATIVE_NOT_ALLOWED: { fa: 'عدد منفی مجاز نیست.', en: 'Negative numbers are not allowed.' },
  ZERO_PRICE_NOT_ALLOWED: { fa: 'قیمت پایه نمی‌تواند صفر باشد.', en: 'The base price cannot be zero.' },
  INVALID_AMOUNT: { fa: 'مبلغ نامعتبر است (ریال بدون اعشار، درهم حداکثر دو رقم اعشار).', en: 'Invalid amount (IRR without decimals, AED with up to 2 decimals).' },
  PRICE_REQUIRED_WHEN_CURRENCY_CHANGES: { fa: 'با تغییر ارز پایه، قیمت پایه را هم وارد کنید.', en: 'Enter the base price when the base currency changes.' },
  NOT_A_WHOLE_NUMBER: { fa: 'فقط عدد صحیح مجاز است.', en: 'Only whole numbers are allowed.' },
  ON_HAND_BELOW_RESERVED: { fa: 'موجودی جدید کمتر از مقدار رزروشده برای مشتریان است.', en: 'The new stock is below the quantity reserved for customers.' },
  FORMULA_NOT_ALLOWED: { fa: 'در این ستون فرمول مجاز نیست؛ مقدار ثابت وارد کنید.', en: 'Formulas are not allowed in this column; enter a fixed value.' },
  FORMULA_RESULT_USED: { fa: 'به‌جای فرمول، نتیجهٔ محاسبه‌شدهٔ آن استفاده شد.', en: 'The calculated result of the formula was used.' },
  TOO_MANY_ROWS: { fa: 'فایل بیش از ۵۰۰۰ ردیف دارد.', en: 'The file has more than 5000 rows.' },
  DUPLICATE_COLUMNS: { fa: 'یک ستون بیش از یک بار در سطر عنوان آمده است.', en: 'A column appears more than once in the header row.' },
  SKU_COLUMN_MISSING: { fa: 'ستون «کد کالا» (sku) پیدا نشد.', en: 'The SKU column was not found.' },
  UNREADABLE_FILE: { fa: 'فایل خوانده نشد؛ یک فایل سالم XLSX یا CSV بارگذاری کنید.', en: 'The file could not be read; upload a valid XLSX or CSV file.' },
  VERSION_CONFLICT: { fa: 'اطلاعات کالا پس از پیش‌نمایش تغییر کرده است؛ هیچ تغییری اعمال نشد. فایل را دوباره بارگذاری کنید.', en: 'Products changed after the preview; nothing was applied. Upload the file again.' },
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
  lowStockThreshold: 'low_stock_threshold', unit: 'unit', descriptionFa: 'description_fa', descriptionEn: 'description_en', isActive: 'is_active',
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
