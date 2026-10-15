import type { ImportJobListItem, ImportJobView } from '@hedax/contracts';

/**
 * Preview of an Excel import with «واحد» and «کاربرد در خودرو» (sample data): a litre product,
 * a decimal for a whole-number unit, an unknown unit, new vehicles and a name very similar to an
 * existing vehicle — waiting for «تأیید».
 */
const AT = '2026-10-15T08:30:00.000Z';
export const FIXTURE_IMPORT_ID = '00000000-0000-7000-8000-0000000e0001';

const headers = ['کد کالا', 'نام قطعه', 'کد دسته', 'نوع قطعه', 'وضعیت فیزیکی', 'منشا', 'ارز پایه', 'قیمت پایه', 'موجودی', 'واحد', 'کاربرد در خودرو'];
const sample: string[][] = [
  ['OIL-5W30', 'روغن موتور ۵W30 (نمونه)', 'ENGINE', 'افترمارکت', 'نو', 'وارداتی', 'ریال', '4500000', '12.5', 'لیتر', 'پژو ۲۰۶، دناپلاس'],
  ['PAD-REAR', 'لنت عقب (نمونه)', 'BRAKE', 'افترمارکت', 'نو', 'داخلی', 'ریال', '1800000', '2.5', 'دست', 'سمند'],
  ['BELT-01', 'تسمه تایم (نمونه)', 'ENGINE', 'اصلی', 'نو', 'داخلی', 'ریال', '3200000', '6', 'کیلو', 'رانا'],
  ['FLT-AIR', 'فیلتر هوا (نمونه)', 'FILTER', 'افترمارکت', 'نو', 'داخلی', 'ریال', '900000', '10', 'عدد', 'سوزکی، کوییک، پژو پارس'],
];

const display = (r: string[], stock: number | null, defaults: string[] = []) => ({
  name: r[1] ?? null, technicalNumber: null, brand: null,
  price: { amountMinor: r[7] ?? '0', currency: 'IRR' as const, fromToman: false },
  stock: stock === null ? { text: r[8] ?? '' } : { mode: 'SET' as const, quantity: stock, before: null, after: stock },
  defaults,
});

export function fixtureImportJob(): ImportJobView {
  return {
    jobId: FIXTURE_IMPORT_ID, status: 'PREVIEW_READY', mode: 'CREATE_AND_UPDATE', progress: 100, totalRows: 4, failureReason: null, filename: 'products-units-vehicles.xlsx',
    createdAt: AT, committedAt: null,
    outline: {
      sheets: [{ index: 0, name: 'کالاها', hidden: false, rowCount: 5, columnCount: headers.length, rows: [{ rowNumber: 1, cells: headers }, ...sample.map((cells, i) => ({ rowNumber: i + 2, cells }))] }],
      suggestion: { sheet: 0, headerRow: 1, columns: Object.fromEntries(['sku', 'name_fa', 'category_code', 'part_type', 'condition', 'origin', 'base_currency', 'base_price', 'on_hand', 'unit', 'vehicle_models'].map((c, i) => [c, i])), priceUnit: 'IRR' },
    },
    settings: {
      sheet: 0, headerRow: 1, mode: 'CREATE_AND_UPDATE', priceUnit: 'IRR', stockMode: 'SET', clearWhenEmpty: [],
      columns: Object.fromEntries(['sku', 'name_fa', 'category_code', 'part_type', 'condition', 'origin', 'base_currency', 'base_price', 'on_hand', 'unit', 'vehicle_models'].map((c, i) => [c, i])),
      defaults: { categoryCode: null, partType: null, condition: null, origin: null, manufacturerBrandId: null, vehicleBrandCodes: [], unit: null, initialOnHand: null },
    },
    summary: {
      create: 2, update: 0, unchanged: 0, error: 2, warnings: 4, fileErrors: [], canCommit: false, canCommitValid: true,
      requiredPermissions: ['inventory.adjust', 'prices.write', 'products.write'],
      columns: ['sku', 'name_fa', 'category_code', 'part_type', 'condition', 'origin', 'base_currency', 'base_price', 'on_hand', 'unit', 'vehicle_models'],
      ignoredHeaders: [],
      topIssues: [
        { code: 'NOT_A_WHOLE_NUMBER', severity: 'error', rows: 1, columns: ['on_hand'] },
        { code: 'UNKNOWN_UNIT', severity: 'error', rows: 1, columns: ['unit'] },
        { code: 'NEW_VEHICLE', severity: 'warning', rows: 1, columns: ['vehicle_models'] },
        { code: 'VEHICLE_SIMILAR', severity: 'warning', rows: 1, columns: ['vehicle_models'] },
      ],
      vehicles: {
        newVehicles: [{ name: 'کوییک', rows: [5] }],
        newModels: [{ vehicle: 'پژو', name: 'پارس', rows: [5] }],
        similar: [{ text: 'سوزکی', suggestion: 'سوزوکی', rows: [5] }],
      },
    },
    planChecksum: 'f'.repeat(64),
    repeatAdd: null,
    rows: [
      { productId: null, applied: false, rowNumber: 2, sku: 'OIL-5W30', action: 'CREATE', issues: [], changes: [], display: display(sample[0]!, 12.5) },
      { productId: null, applied: false, rowNumber: 3, sku: 'PAD-REAR', action: 'ERROR', issues: [{ column: 'on_hand', code: 'NOT_A_WHOLE_NUMBER', severity: 'error', detail: 'دست' }], changes: [], display: display(sample[1]!, null) },
      { productId: null, applied: false, rowNumber: 4, sku: 'BELT-01', action: 'ERROR', issues: [{ column: 'unit', code: 'UNKNOWN_UNIT', severity: 'error', detail: 'کیلو' }], changes: [], display: display(sample[2]!, 6) },
      {
        productId: null, applied: false, rowNumber: 5, sku: 'FLT-AIR', action: 'CREATE', changes: [], display: display(sample[3]!, 10),
        issues: [
          { column: 'vehicle_models', code: 'VEHICLE_SIMILAR', severity: 'warning', detail: 'سوزکی → سوزوکی' },
          { column: 'vehicle_models', code: 'NEW_VEHICLE', severity: 'warning', detail: 'کوییک' },
          { column: 'vehicle_models', code: 'NEW_VEHICLE_MODEL', severity: 'warning', detail: 'پژو پارس' },
        ],
      },
    ],
    rowsTotal: 4, page: 1, pageSize: 50,
  };
}

export function fixtureImportList(): ImportJobListItem[] {
  const j = fixtureImportJob();
  return [{ jobId: j.jobId, status: j.status, filename: j.filename, createdAt: j.createdAt, committedAt: null, summary: { create: 2, update: 0, unchanged: 0, error: 2 } }];
}
