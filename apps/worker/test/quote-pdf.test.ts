import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { QuoteVersionView } from '@hedax/contracts';
import { afterAll, describe, expect, it } from 'vitest';
import { renderQuoteHtml } from '@hedax/api/worker';
import { PdfRenderer, documentFontCss } from '../src/pdf.js';

/**
 * A31: Persian and English quote documents rendered by the same code the worker
 * uses (headless browser, embedded fonts). Data below is clearly labelled test data.
 * The browser comes from PDF_BROWSER_CHANNEL / PDF_BROWSER_EXECUTABLE (default: msedge).
 */
const artifacts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'test-artifacts');
const renderer = new PdfRenderer({
  headless: true,
  ...(process.env.PDF_BROWSER_EXECUTABLE ? { executablePath: process.env.PDF_BROWSER_EXECUTABLE } : { channel: process.env.PDF_BROWSER_CHANNEL ?? 'msedge' }),
});

afterAll(async () => {
  await renderer.close();
});

const irr = (amountMinor: string) => ({ currency: 'IRR' as const, amountMinor });
const view: QuoteVersionView = {
  quoteId: '00000000-0000-7000-8000-00000000a001',
  reference: 'HX-Q-TEST-0001',
  versionId: '00000000-0000-7000-8000-00000000a002',
  versionNumber: 2,
  status: 'SENT',
  issuedAt: '2026-10-01T06:30:00.000Z',
  validUntil: '2026-10-02T06:30:00.000Z',
  items: [
    {
      id: 'i1', description: 'پمپ هیدرولیک فرمان (آزمایشی)', quantity: 1, manufacturer: 'Sample Maker A', partType: 'GENUINE', condition: 'NEW', compatibility: 'CONFIRMED',
      alternativeNote: null, availability: 'AVAILABLE', included: true, unitPrice: { currency: 'AED', amountMinor: '45000' }, discount: null, lineTotalIrr: irr('72000000'),
      leadTime: { min: 5, max: 7, unit: 'DAYS', dayKind: 'CALENDAR' },
    },
    {
      id: 'i2', description: 'Pressure hose (TEST)', quantity: 2, manufacturer: null, partType: 'AFTERMARKET', condition: 'NEW', compatibility: 'NEEDS_CUSTOMER_CONFIRMATION',
      alternativeNote: 'جایگزین مشابه با کیفیت تأییدشده', availability: 'AVAILABLE', included: true, unitPrice: irr('3500000'), discount: null, lineTotalIrr: irr('7000000'),
      leadTime: { min: 48, max: 48, unit: 'HOURS', dayKind: 'CALENDAR' },
    },
    {
      id: 'i3', description: 'مخزن روغن', quantity: 1, manufacturer: null, partType: 'OEM', condition: 'USED', compatibility: 'LIKELY',
      alternativeNote: null, availability: 'UNAVAILABLE', included: false, unitPrice: irr('1'), discount: null, lineTotalIrr: null,
      leadTime: { min: 1, max: 2, unit: 'DAYS', dayKind: 'BUSINESS' },
    },
  ],
  costs: [{ code: 'SHIPPING', label: 'هزینهٔ حمل', amount: irr('2000000'), amountIrr: irr('2000000') }],
  totals: { itemsIrr: irr('79000000'), costsIrr: irr('2000000'), taxIrr: irr('0'), totalPayableIrr: irr('81000000'), referenceTotalAed: { currency: 'AED', amountMinor: '50625' } },
  fx: { irrPerAed: '160000', rateId: '00000000-0000-7000-8000-00000000a003' },
  schedule: { origin: 'PAYMENT_VERIFIED', wording: 'ESTIMATE', readyToShip: { minDays: 5, maxDays: 7, unitsLabel: 'DAYS' }, shipping: { min: 1, max: 2, unit: 'DAYS', dayKind: 'CALENDAR' }, governingItemIds: ['i1'] },
  terms: { policyVersionId: '00000000-0000-7000-8000-00000000a004', title: 'شرایط فروش (نسخهٔ آزمایشی)', body: 'متن آزمایشی شرایط.\nTEST TERMS.' },
  payable: { allowed: false, blockers: ['NOT_ACCEPTED'] },
  pdfUrl: null,
  pdfUrls: { fa: null, en: null },
};

describe('A31 — quote PDF in Persian and English', () => {
  it.each(['fa', 'en'] as const)('%s: direction, digits, currency, version and totals are correct; fonts are embedded', async (locale) => {
    const css = await documentFontCss();
    const html = renderQuoteHtml(view, 'مشتری آزمایشی', css, locale);
    if (locale === 'fa') {
      expect(html).toContain('<html lang="fa" dir="rtl">');
      expect(html).toContain('نسخه: ۲');
      expect(html).toContain('۸۱٬۰۰۰٬۰۰۰ ریال'); // payable total, Persian digits and unit
      expect(html).toContain('۱۴۰۵'); // Jalali year of 2026-10-01
      expect(html).toContain('قابل تأمین نیست');
      expect(html).toContain('نرخ ثبت‌شده: ۱۶۰٬۰۰۰ ریال');
    } else {
      expect(html).toContain('<html lang="en" dir="ltr">');
      expect(html).toContain('Version: 2');
      expect(html).toMatch(/IRR\s81,000,000/);
      expect(html).toContain('2026');
      expect(html).toContain('<bdi dir="auto">پمپ هیدرولیک فرمان (آزمایشی)</bdi>'); // Persian text isolated inside LTR
      expect(html).toContain('Not available');
      expect(html).toContain('recorded rate: 160,000 IRR per AED');
    }
    expect(html).toContain('HX-Q-TEST-0001');
    expect(html).not.toMatch(/<script/i);

    const pdf = await renderer.render(html);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const raw = pdf.toString('latin1');
    expect((raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(raw).toContain('Vazirmatn');
    if (locale === 'en') expect(raw).toContain('Montserrat');

    mkdirSync(artifacts, { recursive: true });
    writeFileSync(path.join(artifacts, `quote-${locale}.pdf`), pdf);
    writeFileSync(path.join(artifacts, `quote-${locale}.png`), await renderer.screenshot(html));
  }, 120_000);
});
