import { describe, expect, it } from 'vitest';
import { extractCatalogRows } from '../../src/modules/knowledge-catalog/catalog-extraction.js';

describe('catalog extraction candidates', () => {
  it('extracts candidate fields and preserves CSV source rows', async () => {
    const bytes = Buffer.from('شماره فنی,نام قطعه,مدل خودرو\n000123,بلبرینگ,پژو ۲۰۶\n000124,چراغ,تارا\n', 'utf8');
    const result = await extractCatalogRows(bytes, 'csv');
    expect(result.truncated).toBe(false);
    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0]).toMatchObject({
      ordinal: 0, rowStart: 2, metadata: {
        candidatePartNumber: '000123', candidatePartName: 'بلبرینگ', candidateVehicle: 'پژو ۲۰۶',
      },
    });
  });

  it('does not attempt PDF extraction without a verified parser', async () => {
    await expect(extractCatalogRows(Buffer.from('%PDF-1.4'), 'pdf')).rejects.toThrow('PDF_TEXT_EXTRACTION_NOT_CONFIGURED');
  });

  it('does not interpret CSV formula-looking strings as executable formulas', async () => {
    const result = await extractCatalogRows(Buffer.from('sku,name\n=1+1,Example\n'), 'csv');
    expect(result.chunks[0]?.metadata.candidatePartNumber).toBe('=1+1');
  });
});
