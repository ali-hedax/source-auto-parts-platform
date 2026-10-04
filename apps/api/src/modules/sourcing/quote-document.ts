import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { QuoteVersionView } from '@hedax/contracts';
import { formatDateTime, formatDecimalString, formatMoney, money } from '@hedax/domain';
import { PrismaService } from '../../common/prisma.service.js';
import { STORAGE, type StorageDriver } from '../../common/storage/storage.js';
import { QuotesService } from './quotes.service.js';

export type QuoteDocumentLocale = 'fa' | 'en';

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const LABELS = {
  fa: {
    dir: 'rtl', subtitle: 'پیش‌فاکتور تأمین قطعه', number: 'شمارهٔ پیش‌فاکتور', version: 'نسخه', issued: 'صدور', validUntil: 'اعتبار تا', customer: 'مشتری',
    cols: ['#', 'شرح', 'سازنده', 'نوع / وضعیت', 'سازگاری', 'تعداد', 'قیمت واحد', 'جمع (ریال)', 'زمان تأمین'],
    items: 'جمع اقلام', costs: 'هزینه‌ها', tax: 'مالیات', payable: 'مبلغ قابل پرداخت', reference: 'معادل مرجع (غیرقابل پرداخت)',
    rate: (r: string) => `نرخ ثبت‌شده: ${r} ریال به‌ازای هر درهم`,
    unavailable: 'قابل تأمین نیست', notSelected: 'انتخاب نشده', hours: 'ساعت', businessDays: 'روز کاری', days: 'روز',
    schedule: (wording: 'ESTIMATE' | 'COMMITMENT', max: string) =>
      `زمان‌ها ${wording === 'COMMITMENT' ? '(تعهد)' : '(برآورد)'} از زمان تأیید پرداخت در سرور محاسبه می‌شود. آماده‌شدن برای ارسال: حداکثر ${max} روز؛ همهٔ اقلام یکجا ارسال می‌شوند.`,
    shipping: (min: string, max: string) => ` زمان حمل: ${min}–${max} روز پس از آماده‌شدن.`,
    shippingUnknown: ' زمان حمل جداگانه اعلام می‌شود.',
    partType: { GENUINE: 'اصلی (جنیون)', OEM: 'OEM', AFTERMARKET: 'افترمارکت' } as Record<string, string>,
    condition: { NEW: 'نو', USED: 'کارکرده', REFURBISHED: 'بازسازی‌شده' } as Record<string, string>,
    compat: { CONFIRMED: 'تأییدشده', LIKELY: 'محتمل', NEEDS_CUSTOMER_CONFIRMATION: 'نیازمند تأیید مشتری' } as Record<string, string>,
    font: 'Vazirmatn, sans-serif',
  },
  en: {
    dir: 'ltr', subtitle: 'Parts sourcing quote', number: 'Quote no.', version: 'Version', issued: 'Issued', validUntil: 'Valid until', customer: 'Customer',
    cols: ['#', 'Description', 'Manufacturer', 'Type / condition', 'Fit', 'Qty', 'Unit price', 'Line total (IRR)', 'Lead time'],
    items: 'Items', costs: 'Costs', tax: 'Tax', payable: 'Amount payable', reference: 'Reference equivalent (not payable)',
    rate: (r: string) => `recorded rate: ${r} IRR per AED`,
    unavailable: 'Not available', notSelected: 'Not selected', hours: 'hours', businessDays: 'business days', days: 'days',
    schedule: (wording: 'ESTIMATE' | 'COMMITMENT', max: string) =>
      `Times are ${wording === 'COMMITMENT' ? 'a commitment' : 'an estimate'} counted from the server-verified payment. Ready to ship within ${max} days at most; all items ship together.`,
    shipping: (min: string, max: string) => ` Shipping takes ${min}–${max} days after that.`,
    shippingUnknown: ' Shipping time will be confirmed separately.',
    partType: { GENUINE: 'Genuine', OEM: 'OEM', AFTERMARKET: 'Aftermarket' } as Record<string, string>,
    condition: { NEW: 'New', USED: 'Used', REFURBISHED: 'Refurbished' } as Record<string, string>,
    compat: { CONFIRMED: 'Confirmed', LIKELY: 'Likely', NEEDS_CUSTOMER_CONFIRMATION: 'Needs your confirmation' } as Record<string, string>,
    font: 'Montserrat, Vazirmatn, sans-serif',
  },
} as const;

/**
 * Printable quote built only from the stored version data (never from chat text).
 * Persian is RTL with Persian digits and the Jalali calendar; English is LTR with
 * Latin digits. Free text typed by staff (descriptions, names, terms) is isolated
 * with dir="auto" so mixed Persian/English renders in the right direction.
 * Internal costs/notes are not part of QuoteVersionView, so they cannot leak here.
 */
export function renderQuoteHtml(view: QuoteVersionView, customerName: string | null, fontCss: string, locale: QuoteDocumentLocale): string {
  const L = LABELS[locale];
  const num = (n: number) => (locale === 'fa' ? n.toLocaleString('fa-IR') : n.toLocaleString('en-US'));
  const m = (d: { currency: 'IRR' | 'AED'; amountMinor: string }) => formatMoney(money(d.currency, d.amountMinor), locale);
  const free = (s: string | null | undefined) => `<bdi dir="auto">${esc(s)}</bdi>`;
  // Recorded rate (decimal string) in the document's digits, grouped; display only.
  const rate = (irrPerAed: string) => formatDecimalString(irrPerAed, locale);
  const rows = view.items
    .map((i, n) => `<tr class="${i.availability === 'UNAVAILABLE' || !i.included ? 'muted' : ''}">
<td>${num(n + 1)}</td><td>${free(i.description)}${i.alternativeNote ? `<div class="note">${free(i.alternativeNote)}</div>` : ''}</td>
<td>${free(i.manufacturer)}</td><td>${L.partType[i.partType] ?? esc(i.partType)} / ${L.condition[i.condition] ?? esc(i.condition)}</td>
<td>${L.compat[i.compatibility] ?? esc(i.compatibility)}</td><td>${num(i.quantity)}</td>
<td class="num">${m(i.unitPrice)}</td><td class="num">${i.lineTotalIrr ? m(i.lineTotalIrr) : i.availability === 'UNAVAILABLE' ? L.unavailable : L.notSelected}</td>
<td>${num(i.leadTime.min)}–${num(i.leadTime.max)} ${i.leadTime.unit === 'HOURS' ? L.hours : i.leadTime.dayKind === 'BUSINESS' ? L.businessDays : L.days}</td></tr>`)
    .join('');
  const costs = view.costs.map((c) => `<tr><td colspan="7">${free(c.label)}</td><td class="num" colspan="2">${m(c.amountIrr)}</td></tr>`).join('');
  const s = view.schedule;
  return `<!doctype html><html lang="${locale}" dir="${L.dir}"><head><meta charset="utf-8"><title>${esc(view.reference)} v${view.versionNumber}</title>
<style>${fontCss}
@page{size:A4;margin:14mm}
body{font-family:${L.font};color:#1A202C;font-size:11pt;line-height:1.7}
header{background:#1A202C;color:#E2E8F0;padding:10px 14px;border-radius:8px;display:flex;justify-content:space-between;align-items:center}
h1{font-size:15pt;margin:0}.meta{font-size:9.5pt}
table{width:100%;border-collapse:collapse;margin-top:12px;font-size:9.5pt}th,td{border:1px solid #CBD5E0;padding:4px 6px;vertical-align:top;text-align:start}
th{background:#E2E8F0}.num{direction:ltr;text-align:end;unicode-bidi:isolate;white-space:nowrap}.muted{color:#718096}
.note{font-size:8.5pt;color:#4A5568}.ltr{direction:ltr;unicode-bidi:isolate}.box{border:1px solid #CBD5E0;border-radius:8px;padding:8px 12px;margin-top:10px}
.total{font-size:13pt;font-weight:700}
</style></head><body>
<header><div><h1>${locale === 'fa' ? 'هداکس | HEDAX' : 'HEDAX | <bdi dir="rtl">هداکس</bdi>'}</h1><div class="meta">${L.subtitle}</div></div>
<div class="meta">${L.number}: <span class="ltr">${esc(view.reference)}</span><br>${L.version}: ${num(view.versionNumber)}<br>
${L.issued}: ${view.issuedAt ? esc(formatDateTime(new Date(view.issuedAt), locale)) : '—'}<br>${L.validUntil}: ${esc(formatDateTime(new Date(view.validUntil), locale))}</div></header>
<p>${L.customer}: ${free(customerName ?? '—')}</p>
<table><thead><tr>${L.cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
<tbody>${rows}${costs}</tbody></table>
<div class="box">
<div>${L.items}: <span class="num">${m(view.totals.itemsIrr)}</span></div>
<div>${L.costs}: <span class="num">${m(view.totals.costsIrr)}</span></div>
<div>${L.tax}: <span class="num">${m(view.totals.taxIrr)}</span></div>
<div class="total">${L.payable}: <span class="num">${m(view.totals.totalPayableIrr)}</span></div>
${view.totals.referenceTotalAed ? `<div>${L.reference}: <span class="num">${m(view.totals.referenceTotalAed)}</span>${view.fx ? ` — ${L.rate(esc(rate(view.fx.irrPerAed)))}` : ''}</div>` : ''}
</div>
<div class="box">${L.schedule(s.wording, num(s.readyToShip.maxDays))}${s.shipping ? L.shipping(num(s.shipping.min), num(s.shipping.max)) : L.shippingUnknown}</div>
<div class="box"><b>${free(view.terms.title)}</b><div dir="auto">${esc(view.terms.body).replace(/\n/g, '<br>')}</div></div>
</body></html>`;
}

/**
 * Loads the customer-facing projection of a version and stores rendered PDFs
 * privately (one per language), linked to the version.
 */
@Injectable()
export class QuoteDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quotes: QuotesService,
    @Inject(STORAGE) private readonly storage: StorageDriver,
  ) {}

  async load(versionId: string, locale: QuoteDocumentLocale = 'fa'): Promise<{ view: QuoteVersionView; customerName: string | null } | null> {
    const v = await this.prisma.quoteVersion.findUnique({
      where: { id: versionId },
      include: {
        quote: { include: { request: true, customer: true } },
        items: { orderBy: { sortOrder: 'asc' }, include: { internalCost: true } },
        costs: true,
        termsPolicy: true,
        procurement: { include: { payments: true } },
      },
    });
    if (!v || v.status === 'DRAFT') return null;
    return { view: await this.quotes.toView(v, false, locale), customerName: v.quote.customer.fullName };
  }

  html(view: QuoteVersionView, customerName: string | null, fontCss: string, locale: QuoteDocumentLocale = 'fa'): string {
    return renderQuoteHtml(view, customerName, fontCss, locale);
  }

  /** Stores the PDF privately and links it to the version (idempotent per language). */
  async save(versionId: string, pdf: Buffer, locale: QuoteDocumentLocale = 'fa'): Promise<string> {
    const v = await this.prisma.quoteVersion.findUniqueOrThrow({ where: { id: versionId }, include: { quote: true } });
    const existing = locale === 'en' ? v.pdfEnAttachmentId : v.pdfAttachmentId;
    if (existing) return existing;
    const key = `quotes/${v.quoteId}/${randomUUID()}.pdf`;
    await this.storage.putPrivate(key, pdf, 'application/pdf');
    return this.prisma.$transaction(async (tx) => {
      const a = await tx.attachment.create({
        data: {
          ownerId: v.createdById, purpose: 'QUOTE_PDF', status: 'READY', storageKey: key,
          originalFilename: `${v.quote.reference}-v${v.versionNumber}${locale === 'en' ? '-en' : ''}.pdf`,
          extension: 'pdf', detectedMime: 'application/pdf', sizeBytes: pdf.length, sha256: createHash('sha256').update(pdf).digest('hex'),
          scanEngine: 'generated', scannedAt: new Date(), subjectType: 'QUOTE_VERSION', subjectId: v.id,
        },
      });
      await tx.quoteVersion.update({ where: { id: v.id }, data: locale === 'en' ? { pdfEnAttachmentId: a.id } : { pdfAttachmentId: a.id } });
      return a.id;
    });
  }
}
