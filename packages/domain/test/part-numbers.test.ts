import { describe, expect, it } from 'vitest';
import { parseFitmentList, parseNumberList, parseSpecs, partNumberKey } from '../src/index.js';

describe('part numbers: part numbers', () => {
  it('ignores spaces, dashes, dots, slashes, case and Persian/Arabic digits', () => {
    for (const raw of ['0450102805', '0450-102-805', '0450 102 805', '۰۴۵۰-۱۰۲-۸۰۵', '٠٤٥٠١٠٢٨٠٥', '0450.102/805']) expect(partNumberKey(raw)).toBe('0450102805');
    expect(partNumberKey('ab-12 c')).toBe('AB12C');
    expect(partNumberKey('  -  ')).toBe('');
  });


  it('splits number lists without repeats or the same number twice', () => {
    expect(parseNumberList('A-1, A1؛ B 2\nC3 | ')).toEqual(['A-1', 'B 2', 'C3']);
  });
});

describe('part numbers: specs and fitment cells', () => {
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
