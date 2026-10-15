import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  type ExistingProductSnapshot, type ImportContext, type RawRow, describeImportCode, importColumnLabel, importFieldLabel, mapHeaders, matchHeader,
  parseImportAmount, planImport, suggestHeaderRow, technicalKey,
} from '../src/index.js';

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

describe('a supplier price list: technical number, title and a price in rial (no stock, brand or category columns)', () => {
  const supplierRow = (code: string | number, title: string, price: string | number, extra: Partial<{ isNumeric: boolean }> = {}): RawRow => ({
    sku: c(code, extra), technical_number: c(code, extra), name_fa: c(title), base_price: c(price),
  });
  const forNewParts = ctx({ existing: new Map(), priceUnit: 'IRR', defaults: { categoryCode: 'BRAKE', partType: 'GENUINE', condition: 'NEW', origin: 'UNKNOWN' } });

  it('recognizes the headers, reads the unit from "(ریال)قیمت" and finds the header row below a title', () => {
    expect(matchHeader('کد فنی').column).toBe('technical_number');
    expect(matchHeader('عنوان').column).toBe('name_fa');
    expect(matchHeader('(ریال)قیمت')).toEqual({ column: 'base_price', unitHint: 'IRR' });
    expect(matchHeader('قیمت (تومان)')).toEqual({ column: 'base_price', unitHint: 'TOMAN' });
    expect(matchHeader('قیمت به درهم')).toEqual({ column: 'base_price', unitHint: 'AED' });
    expect(matchHeader('Price (IRR)')).toEqual({ column: 'base_price', unitHint: 'IRR' });
    expect(matchHeader('واحد').column).toBe('unit');
    expect(matchHeader('ریال').column).toBeNull();
    expect(mapHeaders(['کد فنی', 'عنوان', '(ریال)قیمت'])).toMatchObject({ mapping: { technical_number: 0, name_fa: 1, base_price: 2 }, priceUnitHint: 'IRR' });
    expect(suggestHeaderRow([['لیست قیمت قطعات', null], [], ['کد فنی', 'عنوان', '(ریال)قیمت'], ['0450102805', 'قطعه', '200,000']])).toBe(2);
    expect(suggestHeaderRow([['a', 'b'], ['1', '2']])).toBe(0);
  });

  it('creates the parts with the values chosen for the whole file; codes keep their leading zeros; stock starts at zero', () => {
    const plan = planImport([supplierRow('0450102805', 'بلبرینگ چرخ جلو  نمونه', '200,000,000'), supplierRow('0010124801', 'آینه جانبی نمونه', '۲۵۰٬۰۰۰٬۰۰۰')], forNewParts, [2, 3]);
    expect(plan.summary).toMatchObject({ create: 2, error: 0 });
    expect(plan.canCommit).toBe(true);
    const [first, second] = plan.rows;
    expect(first).toMatchObject({ rowNumber: 2, sku: '0450102805', action: 'CREATE' });
    expect(first?.values).toMatchObject({ technicalNumber: '0450102805', nameFa: 'بلبرینگ چرخ جلو نمونه', basePriceMinor: 200_000_000n, baseCurrency: 'IRR', categoryCode: 'BRAKE', partType: 'GENUINE', condition: 'NEW', origin: 'UNKNOWN' });
    expect(first?.values?.onHand).toBeUndefined();
    expect(first?.display).toMatchObject({ technicalNumber: '0450102805', price: { amountMinor: '200000000', currency: 'IRR', fromToman: false }, stock: { mode: 'SET', quantity: null, after: 0 } });
    expect(first?.display.defaults).toEqual(expect.arrayContaining(['category_code', 'part_type', 'condition', 'origin']));
    expect(second?.values?.basePriceMinor).toBe(250_000_000n);
    expect(plan.requiredPermissions).toEqual(['prices.write', 'products.write']);
  });

  it('says exactly what is missing when nothing is chosen for the file', () => {
    const plan = planImport([supplierRow('0450102805', 'بلبرینگ', '200,000,000')], ctx({ existing: new Map() }));
    const codes = plan.rows[0]?.issues.map((i) => `${i.column}:${i.code}`);
    expect(codes).toEqual(expect.arrayContaining(['category_code:REQUIRED_FOR_NEW', 'part_type:REQUIRED_FOR_NEW', 'condition:REQUIRED_FOR_NEW', 'origin:REQUIRED_FOR_NEW', 'base_price:CURRENCY_REQUIRED']));
    expect(codes).not.toContain('base_currency:REQUIRED_FOR_NEW');
    expect(plan.rows[0]?.display).toMatchObject({ name: 'بلبرینگ', technicalNumber: '0450102805', price: { text: '200,000,000' } });
  });

  it('warns when Excel kept a code as a number and refuses a number Excel has already rounded', () => {
    const plan = planImport([supplierRow(450102805, 'عددی', '1000', { isNumeric: true }), supplierRow(Number('12345678901234567890'), 'گرد شده', '1000', { isNumeric: true })], forNewParts);
    expect(plan.rows[0]?.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['SKU_STORED_AS_NUMBER', 'TECHNICAL_NUMBER_STORED_AS_NUMBER']));
    expect(plan.rows[0]?.action).toBe('CREATE');
    expect(plan.rows[1]?.issues.filter((i) => i.severity === 'error').map((i) => i.code)).toContain('NUMBER_PRECISION_LOST');
  });

  it('does not create a second product when Excel dropped the leading zeros of an existing SKU (00123 → 123)', () => {
    const row: RawRow = { ...newRow, sku: c(123, { isNumeric: true }) };
    const plan = planImport([row], ctx({ zeroPaddedSkus: new Map([['123', '00123']]) }));
    const issue = plan.rows[0]?.issues.find((i) => i.code === 'SKU_LEADING_ZEROS_LOST');
    expect(issue).toMatchObject({ severity: 'error', detail: '00123' });
    expect(plan.rows[0]?.action).toBe('ERROR');
    expect(plan.summary.create).toBe(0);
    // A numeric code with no zero-padded twin stays a new product with a warning.
    expect(planImport([{ ...newRow, sku: c(456, { isNumeric: true }) }], ctx({ zeroPaddedSkus: new Map() })).rows[0]?.action).toBe('CREATE');
  });
});

describe('prices: digits, separators and units', () => {
  const amount = (value: string | number, unit: 'IRR' | 'TOMAN' | 'AED') => parseImportAmount(typeof value === 'number' ? { value, isNumeric: true } : { value }, unit);

  it('reads Persian digits and the usual thousands separators', () => {
    expect(amount('200,000,000', 'IRR')).toEqual({ minor: 200_000_000n, currency: 'IRR', fromToman: false });
    expect(amount('۲۰۰٬۰۰۰٬۰۰۰ ریال', 'IRR')).toMatchObject({ minor: 200_000_000n });
    expect(amount('1.250.000', 'IRR')).toMatchObject({ minor: 1_250_000n });
    expect(amount(' 45 000 000 ', 'IRR')).toMatchObject({ minor: 45_000_000n });
    expect(amount('‏120,000,000‎', 'IRR')).toMatchObject({ minor: 120_000_000n });
    expect(amount('12٫5', 'AED')).toEqual({ minor: 1250n, currency: 'AED', fromToman: false });
    expect(amount(36_000_000, 'IRR')).toMatchObject({ minor: 36_000_000n });
  });

  it('converts toman to rial only for a toman column, and never guesses a unit written in the cell', () => {
    expect(amount('20,000,000', 'TOMAN')).toEqual({ minor: 200_000_000n, currency: 'IRR', fromToman: true });
    expect(amount('12.5 تومان', 'TOMAN')).toMatchObject({ minor: 125n });
    expect(amount('20,000,000 تومان', 'IRR')).toEqual({ code: 'PRICE_UNIT_MISMATCH' });
    expect(amount('45 درهم', 'IRR')).toEqual({ code: 'PRICE_UNIT_MISMATCH' });
  });

  it('refuses decimals the currency does not have, negatives, text and rounded numbers', () => {
    expect(amount('1250.5', 'IRR')).toEqual({ code: 'INVALID_AMOUNT' });
    expect(amount(12.345, 'AED')).toEqual({ code: 'INVALID_AMOUNT' });
    expect(amount('-5', 'IRR')).toEqual({ code: 'NEGATIVE_NOT_ALLOWED' });
    expect(amount('تماس بگیرید', 'IRR')).toEqual({ code: 'INVALID_AMOUNT' });
    expect(amount(1e16, 'IRR')).toEqual({ code: 'NUMBER_PRECISION_LOST' });
  });

  it('accepts toman in a currency column only after the explicit choice', () => {
    const row: RawRow = { sku: c('00123'), base_currency: c('تومان'), base_price: c('1,300,000') };
    expect(planImport([row], ctx()).rows[0]?.issues.map((i) => i.code)).toContain('TOMAN_NEEDS_CONVERSION');
    const converted = planImport([row], ctx({ priceUnit: 'TOMAN' })).rows[0];
    expect(converted?.changes).toEqual([{ field: 'basePriceMinor', before: '12000000', after: '13000000', currency: 'IRR' }]);
  });
});

describe('stock: replace the count or add received quantities', () => {
  it('ADD adds to the current count; SET replaces it; an empty cell changes nothing', () => {
    const add = planImport([{ sku: c('00123'), on_hand: c('3') }], ctx({ stockMode: 'ADD' })).rows[0];
    expect(add?.values).toMatchObject({ onHandAdd: 3 });
    expect(add?.values?.onHand).toBeUndefined();
    expect(add?.changes).toEqual([{ field: 'onHandAdd', before: '10', after: '13', delta: 3 }]);
    expect(add?.display.stock).toEqual({ mode: 'ADD', quantity: 3, before: 10, after: 13 });
    const set = planImport([{ sku: c('00123'), on_hand: c('۷') }], ctx({ stockMode: 'SET' })).rows[0];
    expect(set?.changes).toEqual([{ field: 'onHand', before: '10', after: '7' }]);
    const untouched = planImport([{ sku: c('00123'), on_hand: c(null), base_price: c('') }], ctx({ stockMode: 'SET' })).rows[0];
    expect(untouched?.action).toBe('UNCHANGED');
    // Adding never goes below what customers reserved, so only SET checks it.
    expect(planImport([{ sku: c('00123'), on_hand: c('1') }], ctx({ stockMode: 'ADD' })).rows[0]?.action).toBe('UPDATE');
    expect(planImport([{ sku: c('00123'), on_hand: c('1') }], ctx({ stockMode: 'SET' })).rows[0]?.issues.map((i) => i.code)).toContain('ON_HAND_BELOW_RESERVED');
  });

  it('asks for inventory.adjust only when stock changes', () => {
    expect(planImport([{ sku: c('00123'), on_hand: c('12') }], ctx()).requiredPermissions).toEqual(['inventory.adjust']);
    expect(planImport([{ sku: c('00123'), name_fa: c('نام تازه') }], ctx()).requiredPermissions).toEqual(['products.write']);
  });
});

describe('duplicates follow the real key: the SKU, with the manufacturer brand guarding technical numbers', () => {
  const withBrand = ctx({
    existing: new Map([['00123', { ...existing, manufacturerBrandId: 'mb1' }]]),
    manufacturerBrands: new Map([['isaco', 'mb1'], ['other brand', 'mb2']]),
    technicalNumbers: new Map([[technicalKey('0450102805'), [{ sku: 'ISACO-0450102805', manufacturerBrandId: 'mb1' }]]]),
    defaults: { categoryCode: 'BRAKE', partType: 'GENUINE', condition: 'NEW', origin: 'DOMESTIC' },
    priceUnit: 'IRR',
  });
  const part = (brand: string | null): RawRow => ({ sku: c('0450102805'), technical_number: c('04501-028 05'), name_fa: c('قطعه'), base_price: c('1000'), ...(brand ? { manufacturer_brand: c(brand) } : {}) });

  it('same technical number and brand under another SKU is a duplicate; another brand is a different part; an unknown brand is flagged', () => {
    const same = planImport([part('Isaco')], withBrand).rows[0];
    expect(same?.issues).toContainEqual({ column: 'technical_number', code: 'DUPLICATE_TECHNICAL_NUMBER', severity: 'error', detail: 'ISACO-0450102805' });
    expect(planImport([part('Other Brand')], withBrand).rows[0]?.action).toBe('CREATE');
    const unknown = planImport([part(null)], withBrand).rows[0];
    expect(unknown?.action).toBe('CREATE');
    expect(unknown?.issues).toContainEqual({ column: 'technical_number', code: 'POSSIBLE_DUPLICATE', severity: 'warning', detail: 'ISACO-0450102805' });
  });

  it('a SKU match under another manufacturer brand is refused instead of overwriting that product', () => {
    const plan = planImport([{ sku: c('00123'), manufacturer_brand: c('Other Brand'), base_price: c('1000') }], withBrand);
    expect(plan.rows[0]?.issues.map((i) => i.code)).toContain('SKU_BRAND_CONFLICT');
  });

  it('rows with errors can be left out explicitly; they are never dropped silently', () => {
    const plan = planImport([part('Other Brand'), { sku: c('BAD SKU'), name_fa: c('x'), base_price: c('1') }], withBrand);
    expect(plan.summary).toMatchObject({ create: 1, error: 1 });
    expect(plan.canCommit).toBe(false);
    expect(plan.canCommitValid).toBe(true);
  });
});

describe('cells Excel cannot give a value for, names instead of codes, and compatible vehicles', () => {
  it('reports Excel error cells and formulas without a stored result', () => {
    const plan = planImport([{ sku: c('00123'), name_fa: { value: null, error: '#N/A' }, description_fa: { value: null, isFormula: true } }], ctx());
    expect(plan.rows[0]?.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['CELL_ERROR_VALUE', 'FORMULA_WITHOUT_VALUE']));
  });

  it('accepts a category or vehicle brand by its name, and only adds compatible vehicles', () => {
    const plan = planImport(
      [{ sku: c('00123'), category_code: c('فیلتر'), vehicle_brand_codes: c('سایپا، IKCO'), vehicle_models: c('هایما S5، پژو ۳۰۱') }],
      ctx({
        categoryNames: new Map([['فیلتر', 'FILTER']]),
        vehicleBrandNames: new Map([['سایپا', 'SAIPA']]),
        existing: new Map([['00123', { ...existing, vehicleModels: ['هایما S5'] }]]),
      }),
    );
    expect(plan.rows[0]?.values).toMatchObject({ categoryCode: 'FILTER', vehicleBrandCodes: ['SAIPA', 'IKCO'], vehicleModels: ['هایما S5', 'پژو ۳۰۱'] });
    expect(plan.rows[0]?.changes).toContainEqual({ field: 'vehicleModels', before: 'هایما S5', after: 'هایما S5، پژو ۳۰۱' });
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

describe('Excel: units and «کاربرد در خودرو»', () => {
  const units = new Map([
    ['عدد', { name: 'عدد', allowDecimal: false, stepMilli: 1000 }],
    ['دست', { name: 'دست', allowDecimal: false, stepMilli: 1000 }],
    ['لیتر', { name: 'لیتر', allowDecimal: true, stepMilli: 500 }],
  ]);
  const vehicles = [
    { id: 'peugeot', name: 'پژو', models: [{ id: 'p206', name: '۲۰۶' }] },
    { id: 'dena-plus', name: 'دنا پلاس', models: [] },
    { id: 'samand', name: 'سمند', models: [] },
  ];
  const withFleet = (over: Partial<ImportContext> = {}) => ctx({ units, vehicles, ...over });

  it('recognizes «واحد», «کاربرد در خودرو», «کاربرد», «خودرو» and «مدل خودرو» headers', () => {
    expect(mapHeaders(['کد کالا', 'واحد', 'کاربرد در خودرو']).mapping).toMatchObject({ unit: 1, vehicle_models: 2 });
    for (const h of ['کاربرد', 'خودرو', 'مدل خودرو']) expect(matchHeader(h)?.column).toBe('vehicle_models');
    expect(importColumnLabel('vehicle_models', 'fa')).toBe('کاربرد در خودرو');
  });

  it('an unknown unit, or a decimal for a whole-number unit, is an error on that row; litres take halves', () => {
    const plan = planImport([
      { ...newRow, sku: c('U-1'), unit: c('کیلو'), on_hand: c('3') },
      { ...newRow, sku: c('U-2'), unit: c('دست'), on_hand: c('2.5') },
      { ...newRow, sku: c('U-3'), unit: c('لیتر'), on_hand: c('۲٫۵') },
      { ...newRow, sku: c('U-4'), unit: c('لیتر'), on_hand: c('2.3') },
      { ...newRow, sku: c('U-5'), unit: c('ليتر'), on_hand: c(4), low_stock_threshold: c('0.5') },
    ], withFleet());
    const codes = (i: number) => plan.rows[i]?.issues.map((x) => x.code);
    expect(plan.rows.map((r) => r.rowNumber)).toEqual([2, 3, 4, 5, 6]);
    expect(codes(0)).toContain('UNKNOWN_UNIT');
    expect(codes(1)).toContain('NOT_A_WHOLE_NUMBER');
    expect(plan.rows[2]).toMatchObject({ action: 'CREATE', values: { unit: 'لیتر', onHand: 2.5 } });
    expect(codes(3)).toContain('UNIT_QUANTITY_INVALID');
    expect(plan.rows[4]).toMatchObject({ action: 'CREATE', values: { unit: 'لیتر', onHand: 4, lowStockThreshold: 0.5 } });
  });

  it('reads vehicles and models, suggests very similar names and lists new ones for confirmation', () => {
    const plan = planImport([{ ...newRow, sku: c('F-1'), vehicle_models: c('پژو ۲۰۶، دناپلاس, سمن، پژو پارس، کوییک') }], withFleet());
    const row = plan.rows[0]!;
    expect(row.action).toBe('CREATE');
    expect(row.values?.fitments?.map((f) => f.kind)).toEqual(['KNOWN', 'KNOWN', 'SIMILAR', 'NEW_MODEL', 'NEW_VEHICLE']);
    expect(row.values?.fitments?.[0]).toMatchObject({ vehicleId: 'peugeot', modelId: 'p206' });
    expect(row.values?.fitments?.[1]).toMatchObject({ vehicleId: 'dena-plus', modelId: null });
    expect(row.issues.map((x) => x.code)).toEqual(expect.arrayContaining(['VEHICLE_SIMILAR', 'NEW_VEHICLE_MODEL', 'NEW_VEHICLE']));
    expect(row.issues.every((x) => x.severity === 'warning')).toBe(true);
  });

  it('an update adds fitment it does not have yet and never moves to a unit with another step', () => {
    const snap = { ...existing, fitmentKeys: ['peugeot:p206'] };
    const plan = planImport([{ sku: c('00123'), vehicle_models: c('پژو 206، سمند') }, { sku: c('00123B'), unit: c('لیتر') }], withFleet({ existing: new Map([['00123', snap], ['00123B', { ...existing }]]) }));
    expect(plan.rows[0]?.changes).toContainEqual({ field: 'fitments', before: null, after: 'سمند' });
    expect(plan.rows[1]?.issues.map((x) => x.code)).toContain('UNIT_CHANGE_LOCKED');
  });
});
