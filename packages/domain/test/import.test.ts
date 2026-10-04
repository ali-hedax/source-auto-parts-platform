import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { type ExistingProductSnapshot, type ImportContext, type RawRow, describeImportCode, importColumnLabel, importFieldLabel, mapHeaders, planImport } from '../src/index.js';

const existing: ExistingProductSnapshot = {
  productId: 'p1',
  version: 3,
  nameFa: 'لنت ترمز جلو',
  nameEn: 'Front brake pad',
  categoryCode: 'BRAKE',
  vehicleBrandCodes: ['IKCO'],
  manufacturerBrand: 'Isaco',
  partType: 'GENUINE',
  condition: 'NEW',
  origin: 'DOMESTIC',
  baseCurrency: 'IRR',
  basePriceMinor: 12_000_000n,
  overridePriceIrrMinor: null,
  overridePriceAedMinor: null,
  onHand: 10,
  reserved: 3,
  inventoryVersion: 7,
  lowStockThreshold: 2,
  unit: 'عدد',
  descriptionFa: null,
  descriptionEn: null,
  isActive: true,
};

const ctx = (over: Partial<ImportContext> = {}): ImportContext => ({
  mode: 'CREATE_AND_UPDATE',
  existing: new Map([['00123', existing]]),
  categoryCodes: new Set(['BRAKE', 'FILTER']),
  vehicleBrandCodes: new Set(['IKCO', 'SAIPA', 'TOYOTA', 'HYUNDAI']),
  manufacturerBrands: new Map([['isaco', 'mb1']]),
  clearWhenEmpty: new Set(),
  ...over,
});

const c = (value: string | number | null, extra: Partial<{ isFormula: boolean; isNumeric: boolean }> = {}) => ({ value, ...extra });

const newRow: RawRow = {
  sku: c('HX-900'),
  name_fa: c('فیلتر روغن'),
  category_code: c('FILTER'),
  part_type: c('افترمارکت'),
  condition: c('نو'),
  origin: c('وارداتی'),
  base_currency: c('AED'),
  base_price: c('12.50'),
  on_hand: c('4'),
};

describe('Excel import planning (§12)', () => {
  it('maps Persian and English headers', () => {
    const { mapping, unknownHeaders } = mapHeaders(['کد کالا', 'نام فارسی', 'base_price', 'ستون عجیب']);
    expect(mapping.sku).toBe(0);
    expect(mapping.name_fa).toBe(1);
    expect(mapping.base_price).toBe(2);
    expect(unknownHeaders).toEqual(['ستون عجیب']);
  });

  it('plans a create with fils and keeps leading zeros in SKU', () => {
    const plan = planImport([newRow, { sku: c('00123'), base_price: c('13000000') }], ctx());
    expect(plan.summary).toMatchObject({ create: 1, update: 1, error: 0 });
    expect(plan.rows[0]?.values?.basePriceMinor).toBe(1250n);
    expect(plan.rows[1]?.sku).toBe('00123');
    expect(plan.rows[1]?.expectedProductVersion).toBe(3);
    expect(plan.rows[1]?.changes).toEqual([{ field: 'basePriceMinor', before: '12000000', after: '13000000', currency: 'IRR' }]);
    expect(plan.canCommit).toBe(true);
  });

  it('treats empty cells in update mode as "no change" unless clearing is explicit', () => {
    const noChange = planImport([{ sku: c('00123'), name_en: c('') }], ctx());
    expect(noChange.rows[0]?.action).toBe('UNCHANGED');
    const clear = planImport([{ sku: c('00123'), name_en: c('') }], ctx({ clearWhenEmpty: new Set(['name_en']) }));
    expect(clear.rows[0]?.changes).toEqual([{ field: 'nameEn', before: 'Front brake pad', after: null }]);
  });

  it('blocks the whole batch on any row error', () => {
    const plan = planImport(
      [
        newRow,
        { sku: c('HX-901'), name_fa: c('x'), category_code: c('UNKNOWN'), part_type: c('GENUINE'), condition: c('NEW'),
          origin: c('DOMESTIC'), base_currency: c('USD'), base_price: c('-5'), on_hand: c('2.5') },
      ],
      ctx(),
    );
    expect(plan.canCommit).toBe(false);
    const codes = plan.rows[1]?.issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['UNKNOWN_CATEGORY', 'UNKNOWN_CURRENCY', 'NOT_A_WHOLE_NUMBER']));
  });

  it('rejects duplicates, formulas in price/qty and on_hand below reserved', () => {
    const plan = planImport(
      [
        { sku: c('00123'), on_hand: c('2') },
        { sku: c('HX-900'), base_price: c(5, { isFormula: true }) },
        { sku: c('HX-900') },
      ],
      ctx(),
    );
    expect(plan.rows[0]?.issues.map((i) => i.code)).toContain('ON_HAND_BELOW_RESERVED');
    expect(plan.rows[1]?.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['FORMULA_NOT_ALLOWED', 'DUPLICATE_SKU_IN_FILE']));
  });

  it('refuses creates in update-only mode and unknown manufacturer brands', () => {
    const plan = planImport([newRow, { sku: c('00123'), manufacturer_brand: c('Isako') }], ctx({ mode: 'UPDATE_ONLY' }));
    expect(plan.rows[0]?.issues.map((i) => i.code)).toContain('SKU_NOT_FOUND_UPDATE_ONLY');
    expect(plan.rows[1]?.issues.map((i) => i.code)).toContain('UNKNOWN_MANUFACTURER_BRAND');
  });

  it('caps a file at 5000 rows', () => {
    const rows = new Array(5001).fill({ sku: c('00123') });
    expect(planImport(rows, ctx()).fileErrors).toContain('TOO_MANY_ROWS');
  });
});

describe('import messages for people (§12, §15)', () => {
  it('every code the planner can emit, and every job failure reason, has Persian and English text', () => {
    const source = readFileSync(new URL('../src/product-import.ts', import.meta.url), 'utf8');
    const emitted = source
      .split('\n')
      .map((line) => line.search(/\b(?:err|warn)\(|fileErrors\.push\(/) >= 0 ? line.slice(line.search(/\b(?:err|warn)\(|fileErrors\.push\(/)) : '')
      .flatMap((call) => [...call.matchAll(/'([A-Z][A-Z_]{2,})'/g)].map((m) => m[1]));
    const failures = ['TOO_MANY_ROWS', 'DUPLICATE_COLUMNS', 'SKU_COLUMN_MISSING', 'UNREADABLE_FILE', 'VERSION_CONFLICT', 'ON_HAND_BELOW_RESERVED', 'COMMIT_FAILED'];
    const codes = new Set([...emitted, ...failures].filter((c): c is string => !!c));
    expect(codes.size).toBeGreaterThan(20);
    for (const code of codes) {
      for (const locale of ['fa', 'en'] as const) expect(describeImportCode(code, locale), `${code} (${locale})`).not.toBe(code);
    }
    expect(describeImportCode('SOMETHING_NEW', 'fa')).toBe('SOMETHING_NEW');
  });

  it('labels columns with the template header in Persian and the key in English', () => {
    expect(importColumnLabel('sku', 'fa')).toBe('کد کالا');
    expect(importColumnLabel('base_price', 'fa')).toBe('قیمت پایه');
    expect(importColumnLabel('sku', 'en')).toBe('sku');
    expect(importColumnLabel('unknown_column', 'fa')).toBe('unknown_column');
    expect(importFieldLabel('basePriceMinor', 'fa')).toBe('قیمت پایه');
    expect(importFieldLabel('onHand', 'en')).toBe('on_hand');
  });
});
