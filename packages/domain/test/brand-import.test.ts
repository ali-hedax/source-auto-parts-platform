import { describe, expect, it } from 'vitest';
import { CsvStreamParser, applyBrandMapping, brandColumnHeaders, brandMappingProblems, detectDelimiter, detectEncoding, reuseBrandMapping, selectBrandHeader, suggestBrandMapping } from '../src/index.js';

describe('brand import: column mapping', () => {
  it('detects a Persian header after a title, without mapping old prices or requested quantities', () => {
    const rows = [
      { line: 1, cells: ['Historical supplier list'] },
      { line: 2, cells: ['تعداد درخواستی', 'قيمت (ریال)', 'نام كالا', 'كد كالا', 'رديف'] },
      { line: 3, cells: ['', '12345', 'قطعه نمونه', '00123', '1'] },
    ];
    const selected = selectBrandHeader(rows);
    expect(selected).toMatchObject({ headerRow: 2, needsReview: false });
    expect(suggestBrandMapping(selected.headers)).toEqual({ partNumber: ['كد كالا'], nameFa: ['نام كالا'] });
  });

  it('does not mistake OEM in a data row for a header; supports explicit headerless columns', () => {
    const rows = [{ line: 1, cells: ['', '', 'Vehicle title'] }, { line: 3, cells: ['OEM', '00123', 'part', '4'] }];
    expect(selectBrandHeader(rows)).toMatchObject({ headerRow: 1, needsReview: true });
    expect(selectBrandHeader(rows, 0)).toEqual({ headerRow: 0, headers: ['Column 1', 'Column 2', 'Column 3', 'Column 4'], needsReview: false });
    expect(() => selectBrandHeader(rows, 2)).toThrow('HEADER_ROW_NOT_IN_SAMPLE');
  });

  it('keeps empty and duplicate header columns distinct', () => {
    expect(brandColumnHeaders(['', 'Code', 'Code', 'Code [2]'])).toEqual(['Column 1', 'Code', 'Code [2]', 'Code [2] [2]']);
  });
  const headers = ['Part No', 'Description', 'OE Number', 'Interchange', 'Superseded By', 'Model', 'Engine', 'Years', 'Weight', 'Width', 'Make'];

  it('suggests fields from header names; several columns may go to equivalents, fitment and specs', () => {
    expect(suggestBrandMapping(headers)).toEqual({
      partNumber: ['Part No'],
      equivalents: ['OE Number', 'Interchange'],
      replacements: ['Superseded By'],
      vehicleBrand: ['Make'],
      fitment: ['Model'],
      years: ['Years'],
      description: ['Description'],
      specs: ['Weight', 'Width'],
    });
    // Persian headers too.
    expect(suggestBrandMapping(['شماره فنی', 'نام قطعه', 'مدل خودرو'])).toEqual({ partNumber: ['شماره فنی'], nameFa: ['نام قطعه'], fitment: ['مدل خودرو'] });
  });

  it('reuses a saved mapping by header name in a new file, and lists what is gone', () => {
    const saved = { partNumber: ['Part No'], fitment: ['Model', 'Engine'], specs: ['Weight'] };
    const { mapping, missing } = reuseBrandMapping(saved, ['part  no', 'Model', 'Weight', 'Description']);
    expect(mapping).toMatchObject({ partNumber: ['part  no'], fitment: ['Model'], specs: ['Weight'], description: ['Description'] });
    expect(missing).toEqual(['Engine']);
    expect(brandMappingProblems({}, headers)).toContain('PART_NUMBER_COLUMN_REQUIRED');
    expect(brandMappingProblems({ partNumber: ['Part No', 'Model'] }, headers)).toContain('ONE_COLUMN_ONLY:partNumber');
  });

  it('applies the mapping: combined fitment columns, year range, specs by header, equivalents without the main number', () => {
    const mapping = { partNumber: ['Part No'], nameEn: ['Description'], equivalents: ['OE Number', 'Interchange'], fitment: ['Model', 'Engine'], years: ['Years'], specs: ['Weight', 'Width'] };
    const { values, issues } = applyBrandMapping({
      'Part No': '04465-33471', Description: 'Brake pad set', 'OE Number': '0446533471, 04465 33480', Interchange: 'GDB3425', Model: 'Camry', Engine: '2.4', Years: '2006-2011', Weight: '1.2 kg', Width: '',
    }, mapping);
    expect(issues).toEqual([]);
    expect(values).toMatchObject({
      partNumber: '04465-33471', partNumberKey: '0446533471', nameFa: 'Brake pad set', nameEn: 'Brake pad set',
      equivalents: ['04465 33480', 'GDB3425'], fitments: [{ text: 'Camry 2.4', yearFrom: 2006, yearTo: 2011 }], specs: [{ label: 'Weight', value: '1.2 kg' }],
    });
    expect(applyBrandMapping({ 'Part No': ' ' }, mapping).issues).toEqual(['PART_NUMBER_REQUIRED']);
    expect(applyBrandMapping({ 'Part No': 'X1', Years: '2015-2010' }, mapping).issues).toEqual(['YEAR_INVALID']);
    // Without any name the number is the name.
    expect(applyBrandMapping({ 'Part No': 'AB12' }, { partNumber: ['Part No'] }).values?.nameFa).toBe('AB12');
  });
});

describe('brand import: encodings and CSV', () => {
  it('detects UTF-8 and Windows-1256 (Persian files saved by Excel)', () => {
    const fa = 'شماره فنی,نام';
    expect(detectEncoding(new TextEncoder().encode(fa))).toBe('utf-8');
    expect(detectEncoding(Uint8Array.from([0xef, 0xbb, 0xbf, 0x41]))).toBe('utf-8');
    // «شماره» in Windows-1256.
    const cp1256 = Uint8Array.from([0xd4, 0xe3, 0xc7, 0xd1, 0xe5, 0x2c, 0x41]);
    expect(detectEncoding(cp1256)).toBe('windows-1256');
    expect(new TextDecoder('windows-1256').decode(cp1256)).toBe('شماره,A');
  });

  it('parses quoted fields across chunks and lines; detects the separator', () => {
    expect(detectDelimiter('a;b;"c;d";e')).toBe(';');
    expect(detectDelimiter('a\tb\tc')).toBe('\t');
    const p = new CsvStreamParser(',');
    const out = [
      ...p.push('﻿Part,Name\n1,"Pad, front'),
      ...p.push('\nline two",x\n2,"say ""hi"""'),
      ...p.push('\r\n\n3,last'),
      ...p.finish(),
    ];
    expect(out).toEqual([
      { line: 1, cells: ['Part', 'Name'] },
      { line: 2, cells: ['1', 'Pad, front\nline two', 'x'] },
      { line: 4, cells: ['2', 'say "hi"'] },
      { line: 6, cells: ['3', 'last'] },
    ]);
  });
});
