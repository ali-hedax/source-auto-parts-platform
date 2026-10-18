import type { BrandImportListItem, BrandImportView } from '@hedax/contracts';
import { makerToyota } from './data';

/**
 * Preview copy of panel → «ورود دیتابیس برند» (HEDAX_DATA_SOURCE=fixtures): one finished import of a
 * sample Toyota database (the two «قابل تأمین» sample parts on the site come from it) and one waiting
 * for its column mapping.
 */
const maker = { id: '00000000-0000-7000-8000-00000000b001', nameFa: makerToyota.fa };
const DONE = '00000000-0000-7000-8000-00000000b101';
const WAITING = '00000000-0000-7000-8000-00000000b102';
const at = (h: number) => new Date(Date.parse('2026-10-18T07:00:00Z') - h * 3_600_000).toISOString();

const headers = ['Part No', 'Description', 'OE Number', 'Interchange', 'Model', 'Years', 'Weight'];
const outline = [{
  name: 'toyota-parts.csv', headers, encoding: 'windows-1256', delimiter: ',',
  samples: [
    ['04465-33471', 'لنت ترمز جلو کمری', '04465 33480', 'GDB3425', 'Camry', '2006-2011', '1.2 kg'],
    ['17801-21050', 'فیلتر هوای کرولا', '', 'C 2512', 'Corolla', '2007-2013', '0.3 kg'],
    ['90915-YZZE1', 'فیلتر روغن', '', 'W 712', 'Camry', '', '0.4 kg'],
  ],
}];
const mapping = { partNumber: ['Part No'], nameFa: ['Description'], equivalents: ['OE Number', 'Interchange'], fitment: ['Model'], years: ['Years'], specs: ['Weight'] };

const views: BrandImportView[] = [
  {
    id: DONE, manufacturer: maker, source: 'کاتالوگ رسمی ۱۴۰۵', filename: 'toyota-parts.csv', status: 'COMPLETED', outline, mapping,
    options: { publish: true, partType: 'GENUINE', encoding: 'auto' }, missingColumns: [],
    preview: [
      { rowRef: 'toyota-parts.csv:2', state: 'NEW', partNumber: '04465-33471', nameFa: 'لنت ترمز جلو کمری', equivalents: ['04465 33480', 'GDB3425'], fitments: ['Camry (2006-2011)'], specs: ['Weight: 1.2 kg'], issues: [] },
      { rowRef: 'toyota-parts.csv:3', state: 'NEW', partNumber: '17801-21050', nameFa: 'فیلتر هوای کرولا', equivalents: ['C 2512'], fitments: ['Corolla (2007-2013)'], specs: ['Weight: 0.3 kg'], issues: [] },
      { rowRef: 'toyota-parts.csv:9', state: 'ERROR', partNumber: '', nameFa: null, equivalents: [], fitments: [], specs: [], issues: ['PART_NUMBER_REQUIRED'] },
    ],
    stats: { rows: 1250, new: 1180, update: 52, duplicate: 6, error: 12, created: 1180, updated: 52, unchanged: 0, unknownVehicles: 40 },
    totalRows: 1250, processedRows: 1250, failureReason: null, createdBy: 'مالک نمونه', createdAt: at(26), startedAt: at(25.9), finishedAt: at(25.5), rolledBackAt: null,
    canRollback: true, errorCount: 58,
  },
  {
    id: WAITING, manufacturer: maker, source: 'کاتالوگ رسمی ۱۴۰۵', filename: 'toyota-parts-update.zip', status: 'AWAITING_MAPPING', outline, mapping,
    options: { publish: false, partType: 'GENUINE', encoding: 'auto' }, missingColumns: [], preview: [], stats: {},
    totalRows: 1320, processedRows: 0, failureReason: null, createdBy: 'مالک نمونه', createdAt: at(1), startedAt: null, finishedAt: null, rolledBackAt: null,
    canRollback: false, errorCount: 0,
  },
];

export function fixtureBrandImports(): BrandImportListItem[] {
  return views.map(({ outline: _o, mapping: _m, options: _p, missingColumns: _c, preview: _r, failureReason: _f, startedAt: _s, ...rest }) => rest);
}

export function fixtureBrandImport(id: string): BrandImportView | null {
  return views.find((v) => v.id === id) ?? null;
}
