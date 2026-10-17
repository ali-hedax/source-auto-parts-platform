import { describe, expect, it } from 'vitest';
import { catalogSlug, mapCatalogHeaders, parseCatalogRow, parseFitmentList, parseNumberList, parseSpecs, partNumberKey } from '../src/index.js';

describe('technical catalog: part numbers', () => {
  it('ignores spaces, dashes, dots, slashes, case and Persian/Arabic digits', () => {
    for (const raw of ['0450102805', '0450-102-805', '0450 102 805', '۰۴۵۰-۱۰۲-۸۰۵', '٠٤٥٠١٠٢٨٠٥', '0450.102/805']) expect(partNumberKey(raw)).toBe('0450102805');
    expect(partNumberKey('ab-12 c')).toBe('AB12C');
    expect(partNumberKey('  -  ')).toBe('');
  });

  it('makes readable addresses from the number', () => {
    expect(catalogSlug('0450-102-805', 'x')).toBe('0450-102-805');
    expect(catalogSlug('AB 12/C', 'x')).toBe('ab-12-c');
    expect(catalogSlug('۱۲۳۴ الف', 'x')).toBe('1234');
    expect(catalogSlug('الف', 'fallback')).toBe('fallback');
  });

  it('splits number lists without repeats or the same number twice', () => {
    expect(parseNumberList('A-1, A1؛ B 2\nC3 | ')).toEqual(['A-1', 'B 2', 'C3']);
  });
});

describe('technical catalog: specs and fitment cells', () => {
  it('reads «label: value» pairs and reports the rest', () => {
    expect(parseSpecs('ولتاژ: 12V؛ قطر: 40mm\nوزن：2kg')).toEqual({ specs: [{ label: 'ولتاژ', value: '12V' }, { label: 'قطر', value: '40mm' }, { label: 'وزن', value: '2kg' }], invalid: [] });
    expect(parseSpecs('بدون مقدار; : x').invalid).toEqual(['بدون مقدار', ': x']);
  });

  it('reads vehicles with optional years', () => {
    expect(parseFitmentList('پژو 405 (1390-1400)، سمند، دنا (۱۳۹۸)، Pride (2005 تا 2010)')).toEqual({
      items: [
        { text: 'پژو 405', yearFrom: 1390, yearTo: 1400 },
        { text: 'سمند', yearFrom: null, yearTo: null },
        { text: 'دنا', yearFrom: 1398, yearTo: 1398 },
        { text: 'Pride', yearFrom: 2005, yearTo: 2010 },
      ],
      invalid: [],
    });
    expect(parseFitmentList('پژو (1400-1390), رانا (0042)').invalid).toEqual(['پژو (1400-1390)', 'رانا (0042)']);
  });
});

describe('technical catalog: Excel rows', () => {
  it('finds columns by Persian or English headers and lists missing required ones', () => {
    const { columns, missing } = mapCatalogHeaders(['Part number', 'نام فارسی', 'شماره های معادل', 'کاربرد در خودرو', 'ستون ناشناخته']);
    expect(columns).toEqual({ partNumber: 0, nameFa: 1, equivalents: 2, fitments: 3 });
    expect(missing).toEqual([]);
    expect(mapCatalogHeaders(['نام انگلیسی']).missing).toEqual(['partNumber', 'nameFa']);
  });

  it('parses a full row and drops the main number from the equivalents', () => {
    const r = parseCatalogRow({
      partNumber: ' 0450-102-805 ', nameFa: 'فیلتر  بنزین', nameEn: 'Fuel filter', equivalents: '0450102805, MANN WK 512', replacements: 'X-1',
      manufacturer: 'بوش', category: 'فیلتر', vehicleBrands: 'ایران خودرو، سایپا', fitments: 'پژو 405 (1390-1400)', specs: 'قطر: 80mm', description: 'شرح', status: 'منتشرشده',
    });
    expect(r.issues).toEqual([]);
    expect(r.values).toMatchObject({
      partNumber: '0450-102-805', partNumberKey: '0450102805', nameFa: 'فیلتر بنزین', equivalents: ['MANN WK 512'], replacements: ['X-1'],
      vehicleBrands: ['ایران خودرو', 'سایپا'], fitments: [{ text: 'پژو 405', yearFrom: 1390, yearTo: 1400 }], specs: [{ label: 'قطر', value: '80mm' }], status: 'PUBLISHED',
    });
    expect(parseCatalogRow({ partNumber: 'A1', nameFa: 'x' }).values?.status).toBe('DRAFT');
  });

  it('reports every reason a row cannot be imported', () => {
    const r = parseCatalogRow({ partNumber: ' - ', nameFa: '', specs: 'بی‌مقدار', fitments: 'پژو (1400-1300)', status: 'شاید' });
    expect(r.values).toBeNull();
    expect(r.issues).toEqual(['PART_NUMBER_REQUIRED', 'NAME_REQUIRED', 'SPECS_INVALID', 'FITMENT_INVALID', 'STATUS_INVALID']);
  });
});
