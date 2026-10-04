import type {
  CategoryView,
  ConversationSummary,
  MessageView,
  OrderView,
  QuoteVersionView,
  SourcingRequestView,
  VehicleBrandView,
} from '@hedax/contracts';

/**
 * DEVELOPMENT PREVIEW DATA. Every name carries «نمونه» / "SAMPLE"; SKUs start
 * with DEMO-; the exchange rate is a placeholder. This module is only reachable
 * when HEDAX_DATA_SOURCE=fixtures, which production builds refuse.
 */
export const FIXTURE_RATE = { id: '00000000-0000-7000-8000-00000000f001', irrPerAed: '160000', effectiveFrom: '2026-09-01T00:00:00.000Z' };

export const fixtureCategories: CategoryView[] = [
  { code: 'BRAKE', slug: 'brake', name: { fa: 'ترمز', en: 'Brakes' }, parentSlug: null, productCount: 2 },
  { code: 'FILTER', slug: 'filters', name: { fa: 'فیلتر', en: 'Filters' }, parentSlug: null, productCount: 2 },
  { code: 'ENGINE', slug: 'engine', name: { fa: 'موتور', en: 'Engine' }, parentSlug: null, productCount: 2 },
  { code: 'SUSPENSION', slug: 'suspension', name: { fa: 'جلوبندی و تعلیق', en: 'Suspension' }, parentSlug: null, productCount: 1 },
  { code: 'ELECTRICAL', slug: 'electrical', name: { fa: 'برق خودرو', en: 'Electrical' }, parentSlug: null, productCount: 1 },
  { code: 'BODY', slug: 'body', name: { fa: 'بدنه و چراغ', en: 'Body & lights' }, parentSlug: null, productCount: 1 },
];

export const fixtureBrands: VehicleBrandView[] = [
  { code: 'IKCO', slug: 'iran-khodro', name: { fa: 'ایران خودرو', en: 'Iran Khodro' }, isFeatured: true, productCount: 3 },
  { code: 'SAIPA', slug: 'saipa', name: { fa: 'سایپا', en: 'Saipa' }, isFeatured: true, productCount: 2 },
  { code: 'TOYOTA', slug: 'toyota', name: { fa: 'تویوتا', en: 'Toyota' }, isFeatured: true, productCount: 2 },
  { code: 'HYUNDAI', slug: 'hyundai', name: { fa: 'هیوندای', en: 'Hyundai' }, isFeatured: true, productCount: 2 },
];

export interface FixtureProduct {
  id: string;
  sku: string;
  slug: string;
  fa: string;
  en: string | null;
  aliases: string[];
  category: string;
  brands: string[];
  maker: { slug: string; fa: string; en: string } | null;
  partType: 'GENUINE' | 'OEM' | 'AFTERMARKET';
  condition: 'NEW' | 'USED' | 'REFURBISHED';
  origin: 'DOMESTIC' | 'IMPORTED' | 'UNKNOWN';
  currency: 'IRR' | 'AED';
  price: bigint;
  manualIrr?: bigint;
  onHand: number;
  reserved: number;
  descriptionFa?: string;
  descriptionEn?: string;
  published: boolean;
  archived?: boolean;
}

const makerA = { slug: 'sample-maker-a', fa: 'سازندهٔ نمونه الف', en: 'Sample Maker A' };
const makerB = { slug: 'sample-maker-b', fa: 'سازندهٔ نمونه ب', en: 'Sample Maker B' };

const pid = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`;

export const fixtureProducts: FixtureProduct[] = [
  { id: pid(1), sku: 'DEMO-0001', slug: 'demo-front-brake-pad-206', fa: 'لنت ترمز جلو پژو ۲۰۶ (نمونه)', en: 'Front brake pad, Peugeot 206 (SAMPLE)', aliases: ['لنت‌ترمز'], category: 'BRAKE', brands: ['IKCO'], maker: makerA, partType: 'AFTERMARKET', condition: 'NEW', origin: 'DOMESTIC', currency: 'IRR', price: 18_500_000n, onHand: 14, reserved: 2, descriptionFa: 'دادهٔ نمونه برای پیش‌نمایش رابط کاربری.', descriptionEn: 'Sample data for UI preview.', published: true },
  { id: pid(2), sku: 'DEMO-0002', slug: 'demo-oil-filter-samand', fa: 'فيلتر روغن سمند (نمونه)', en: 'Oil filter, Samand (SAMPLE)', aliases: [], category: 'FILTER', brands: ['IKCO'], maker: makerB, partType: 'OEM', condition: 'NEW', origin: 'DOMESTIC', currency: 'IRR', price: 3_200_000n, onHand: 40, reserved: 0, published: true },
  { id: pid(3), sku: 'DEMO-0003', slug: 'demo-rear-shock-pride', fa: 'كمك فنر عقب پراید (نمونه)', en: 'Rear shock absorber, Pride (SAMPLE)', aliases: [], category: 'SUSPENSION', brands: ['SAIPA'], maker: null, partType: 'AFTERMARKET', condition: 'NEW', origin: 'DOMESTIC', currency: 'IRR', price: 24_000_000n, onHand: 6, reserved: 5, published: true },
  { id: pid(4), sku: 'DEMO-0004', slug: 'demo-headlamp-tiba', fa: 'چراغ جلو تیبا (نمونه)', en: null, aliases: [], category: 'BODY', brands: ['SAIPA'], maker: null, partType: 'GENUINE', condition: 'NEW', origin: 'DOMESTIC', currency: 'IRR', price: 41_000_000n, onHand: 2, reserved: 0, published: true },
  { id: pid(5), sku: 'DEMO-0005', slug: 'demo-air-filter-corolla', fa: 'فیلتر هوای کرولا (نمونه)', en: 'Air filter, Corolla (SAMPLE)', aliases: [], category: 'FILTER', brands: ['TOYOTA'], maker: makerA, partType: 'GENUINE', condition: 'NEW', origin: 'IMPORTED', currency: 'AED', price: 6_500n, onHand: 9, reserved: 0, published: true },
  { id: pid(6), sku: 'DEMO-0006', slug: 'demo-spark-plug-elantra', fa: 'شمع موتور النترا (نمونه)', en: 'Spark plug, Elantra (SAMPLE)', aliases: [], category: 'ENGINE', brands: ['HYUNDAI'], maker: null, partType: 'OEM', condition: 'NEW', origin: 'IMPORTED', currency: 'AED', price: 2_750n, manualIrr: 450_000n, onHand: 30, reserved: 0, published: true },
  { id: pid(7), sku: 'DEMO-0007', slug: 'demo-alternator-sonata-used', fa: 'دینام استوک سوناتا (نمونه)', en: 'Alternator, Sonata — used stock (SAMPLE)', aliases: [], category: 'ELECTRICAL', brands: ['HYUNDAI'], maker: null, partType: 'GENUINE', condition: 'USED', origin: 'IMPORTED', currency: 'AED', price: 48_000n, onHand: 1, reserved: 0, descriptionFa: 'قطعهٔ استوک (کارکرده). در محیط واقعی عکس واقعی همین قلم الزامی است.', published: true },
  { id: pid(8), sku: 'DEMO-0008', slug: 'demo-water-pump-405', fa: 'واتر پمپ پژو ۴۰۵ (نمونه)', en: 'Water pump, Peugeot 405 (SAMPLE)', aliases: [], category: 'ENGINE', brands: ['IKCO'], maker: null, partType: 'AFTERMARKET', condition: 'NEW', origin: 'DOMESTIC', currency: 'IRR', price: 15_900_000n, onHand: 0, reserved: 0, published: true },
  { id: pid(9), sku: '00123', slug: 'demo-brake-disc-camry-refurb', fa: 'دیسک ترمز کمری بازسازی‌شده (نمونه)', en: 'Brake disc, Camry — refurbished (SAMPLE)', aliases: [], category: 'BRAKE', brands: ['TOYOTA'], maker: null, partType: 'GENUINE', condition: 'REFURBISHED', origin: 'IMPORTED', currency: 'AED', price: 21_000n, onHand: 3, reserved: 0, published: true },
];

const now = Date.parse('2026-09-30T08:00:00Z');
const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
const irr = (n: bigint) => ({ currency: 'IRR' as const, amountMinor: n.toString() });
const aed = (n: bigint) => ({ currency: 'AED' as const, amountMinor: n.toString() });

export const fixtureOrders: OrderView[] = [
  {
    id: '00000000-0000-7000-8000-0000000a0001', reference: 'HX-O-DEMO01', kind: 'STOCK_ORDER', status: 'SHIPPED', paymentStatus: 'PAID', createdAt: iso(3000),
    lines: [{ id: '00000000-0000-7000-8000-0000000d0001', returnableQuantity: 0, sku: 'DEMO-0001', name: { fa: 'لنت ترمز جلو پژو ۲۰۶ (نمونه)', en: 'Front brake pad, Peugeot 206 (SAMPLE)' }, partType: 'AFTERMARKET', condition: 'NEW', quantity: 2, unitPrice: irr(18_500_000n), lineTotal: irr(37_000_000n) }],
    totals: { items: irr(37_000_000n), shipping: irr(800_000n), tax: irr(0n), discount: irr(0n), grandTotal: irr(37_800_000n) },
    fx: { irrPerAed: FIXTURE_RATE.irrPerAed, recordedAt: iso(3000) },
    address: { recipientName: 'مشتری نمونه', province: 'تهران', city: 'تهران', addressLine: 'نشانی نمونه — دادهٔ آزمایشی', postalCode: '1234567890' },
    shipment: { method: 'ارسال آزمایشی (نمونه)', trackingCode: 'TEST-TRACK-001', trackingUrl: null, shippedAt: iso(600), deliveredAt: null },
    schedule: null,
    timeline: [
      { at: iso(3000), type: 'ORDER_CREATED', fromState: null, toState: null, note: null, actor: 'CUSTOMER' },
      { at: iso(2990), type: 'STATUS_CHANGED', fromState: 'AWAITING_PAYMENT', toState: 'CONFIRMED', note: null, actor: 'SYSTEM' },
      { at: iso(1500), type: 'STATUS_CHANGED', fromState: 'CONFIRMED', toState: 'PREPARING', note: null, actor: 'STAFF' },
      { at: iso(600), type: 'STATUS_CHANGED', fromState: 'READY_TO_SHIP', toState: 'SHIPPED', note: null, actor: 'STAFF' },
    ],
    receipts: [{ attemptId: '00000000-0000-7000-8000-0000000b0001', amount: irr(37_800_000n), paidAt: iso(2990), providerReference: 'SIMTX-DEMO' }],
    policyVersion: { id: '00000000-0000-7000-8000-0000000c0001', version: 1 },
    conversationId: null,
  },
  {
    id: '00000000-0000-7000-8000-0000000a0002', reference: 'HX-O-DEMO02', kind: 'STOCK_ORDER', status: 'AWAITING_PAYMENT', paymentStatus: 'UNPAID', createdAt: iso(40),
    lines: [{ id: '00000000-0000-7000-8000-0000000d0002', returnableQuantity: 0, sku: 'DEMO-0005', name: { fa: 'فیلتر هوای کرولا (نمونه)', en: 'Air filter, Corolla (SAMPLE)' }, partType: 'GENUINE', condition: 'NEW', quantity: 1, unitPrice: irr(1_040_000n), lineTotal: irr(1_040_000n) }],
    totals: { items: irr(1_040_000n), shipping: irr(1_500_000n), tax: irr(0n), discount: irr(0n), grandTotal: irr(2_540_000n) },
    fx: { irrPerAed: FIXTURE_RATE.irrPerAed, recordedAt: iso(40) },
    address: { recipientName: 'مشتری نمونه', province: 'اصفهان', city: 'اصفهان', addressLine: 'نشانی نمونه', postalCode: '1234567890' },
    shipment: null, schedule: null,
    timeline: [{ at: iso(40), type: 'ORDER_CREATED', fromState: null, toState: null, note: null, actor: 'CUSTOMER' }],
    receipts: [], policyVersion: { id: '00000000-0000-7000-8000-0000000c0001', version: 1 }, conversationId: null,
  },
];

export const fixtureConversationId = '00000000-0000-7000-8000-0000000d0001';

export const fixtureRequest: SourcingRequestView = {
  id: '00000000-0000-7000-8000-0000000e0001', reference: 'HX-R-DEMO01', title: 'قطعات جلوبندی کیا سراتو ۲۰۱۸ (نمونه)', status: 'QUOTED', urgency: 'NORMAL',
  createdAt: iso(4000), updatedAt: iso(200),
  items: [
    { id: '00000000-0000-7000-8000-0000000e1001', partName: 'طبق پایین چپ', quantity: 1, vehicleBrand: 'Kia', vehicleModel: 'Cerato', vehicleYear: 2018, partCode: null, preference: 'GENUINE', notes: null },
    { id: '00000000-0000-7000-8000-0000000e1002', partName: 'سیبک فرمان', quantity: 2, vehicleBrand: 'Kia', vehicleModel: 'Cerato', vehicleYear: 2018, partCode: null, preference: 'ANY', notes: null },
  ],
  conversationId: fixtureConversationId,
  assignee: { displayName: 'کارشناس' },
  quotes: [
    { quoteId: '00000000-0000-7000-8000-0000000f0001', reference: 'HX-Q-DEMO01', versionId: '00000000-0000-7000-8000-0000000f1001', versionNumber: 1, status: 'SUPERSEDED', totalPayable: irr(96_000_000n), validUntil: iso(2000) },
    { quoteId: '00000000-0000-7000-8000-0000000f0001', reference: 'HX-Q-DEMO01', versionId: '00000000-0000-7000-8000-0000000f1002', versionNumber: 2, status: 'SENT', totalPayable: irr(88_640_000n), validUntil: new Date(now + 20 * 3_600_000).toISOString() },
  ],
};

export const fixtureQuote: QuoteVersionView = {
  quoteId: '00000000-0000-7000-8000-0000000f0001', reference: 'HX-Q-DEMO01', versionId: '00000000-0000-7000-8000-0000000f1002', versionNumber: 2, status: 'SENT',
  issuedAt: iso(200), validUntil: new Date(now + 20 * 3_600_000).toISOString(),
  items: [
    { id: '00000000-0000-7000-8000-0000000f2001', description: 'طبق پایین چپ سراتو (نمونه)', quantity: 1, manufacturer: 'سازندهٔ نمونه', partType: 'GENUINE', condition: 'NEW', compatibility: 'CONFIRMED', alternativeNote: null, availability: 'AVAILABLE', included: true, unitPrice: aed(32_000n), discount: null, lineTotalIrr: irr(51_200_000n), leadTime: { min: 4, max: 7, unit: 'DAYS', dayKind: 'CALENDAR' } },
    { id: '00000000-0000-7000-8000-0000000f2002', description: 'سیبک فرمان سراتو (نمونه)', quantity: 2, manufacturer: null, partType: 'AFTERMARKET', condition: 'NEW', compatibility: 'LIKELY', alternativeNote: 'نسخهٔ اصلی موجود نبود؛ افترمارکت هم‌خوان پیشنهاد شده است.', availability: 'AVAILABLE', included: true, unitPrice: irr(17_120_000n), discount: null, lineTotalIrr: irr(34_240_000n), leadTime: { min: 48, max: 48, unit: 'HOURS', dayKind: 'CALENDAR' } },
    { id: '00000000-0000-7000-8000-0000000f2003', description: 'گردگیر پلوس (نمونه)', quantity: 1, manufacturer: null, partType: 'GENUINE', condition: 'NEW', compatibility: 'NEEDS_CUSTOMER_CONFIRMATION', alternativeNote: null, availability: 'UNAVAILABLE', included: false, unitPrice: irr(0n), discount: null, lineTotalIrr: null, leadTime: { min: 0, max: 0, unit: 'DAYS', dayKind: 'CALENDAR' } },
  ],
  costs: [{ code: 'SHIPPING', label: 'هزینهٔ حمل تا انبار (نمونه)', amount: irr(3_200_000n), amountIrr: irr(3_200_000n) }],
  totals: { itemsIrr: irr(85_440_000n), costsIrr: irr(3_200_000n), taxIrr: irr(0n), totalPayableIrr: irr(88_640_000n), referenceTotalAed: aed(55_400n) },
  fx: { irrPerAed: FIXTURE_RATE.irrPerAed, rateId: FIXTURE_RATE.id },
  schedule: { origin: 'PAYMENT_VERIFIED', wording: 'ESTIMATE', readyToShip: { minDays: 4, maxDays: 7, unitsLabel: 'DAYS' }, shipping: { min: 1, max: 3, unit: 'DAYS', dayKind: 'CALENDAR' }, governingItemIds: ['00000000-0000-7000-8000-0000000f2001'] },
  terms: { policyVersionId: '00000000-0000-7000-8000-0000000c0001', title: 'شرایط فروش (نسخهٔ آزمایشی)', body: 'متن آزمایشی؛ پیش از راه‌اندازی متن تأییدشدهٔ مالک جایگزین می‌شود.' },
  payable: { allowed: false, blockers: ['NOT_ACCEPTED'] },
  pdfUrl: null,
  pdfUrls: { fa: null, en: null },
};

export const fixtureConversations: ConversationSummary[] = [
  { id: fixtureConversationId, subject: 'HX-R-DEMO01 — قطعات جلوبندی کیا سراتو ۲۰۱۸ (نمونه)', subjectKind: 'SOURCING_REQUEST', subjectId: fixtureRequest.id, lastMessageAt: iso(190), lastMessagePreview: 'پیش‌فاکتور نسخهٔ ۲ صادر شد. / Quote version 2 issued.', lastMessageFromSystem: true, unreadCount: 1, assignee: 'کارشناس' },
];

export const fixtureMessages: MessageView[] = [
  { id: '00000000-0000-7000-8000-000000100001', conversationId: fixtureConversationId, clientMessageId: null, sender: { kind: 'SYSTEM', displayName: 'HEDAX', isSelf: false }, body: 'درخواست HX-R-DEMO01 ثبت شد.', attachments: [], quoteCard: null, createdAt: iso(4000), readByOther: true },
  { id: '00000000-0000-7000-8000-000000100002', conversationId: fixtureConversationId, clientMessageId: 'demo-client-1', sender: { kind: 'CUSTOMER', displayName: 'شما', isSelf: true }, body: 'سلام، برای مدل ۲۰۱۸ با موتور ۲۰۰۰ می‌خواهم. (پیام نمونه)', attachments: [{ id: '00000000-0000-7000-8000-000000200001', filename: 'photo-sample.jpg', sizeBytes: 245_000, mime: 'image/webp', status: 'READY', rejectReason: null, downloadUrl: null }], quoteCard: null, createdAt: iso(3900), readByOther: true },
  { id: '00000000-0000-7000-8000-000000100003', conversationId: fixtureConversationId, clientMessageId: null, sender: { kind: 'STAFF', displayName: 'کارشناس', isSelf: false }, body: 'ممنون. برای سیبک، نسخهٔ اصلی موجود نیست؛ افترمارکت هم‌خوان را پیشنهاد می‌کنم. (پیام نمونه)', attachments: [], quoteCard: null, createdAt: iso(300), readByOther: true },
  { id: '00000000-0000-7000-8000-000000100004', conversationId: fixtureConversationId, clientMessageId: null, sender: { kind: 'SYSTEM', displayName: 'HEDAX', isSelf: false }, body: 'پیش‌فاکتور نسخهٔ ۲ صادر شد. / Quote version 2 issued.', attachments: [], quoteCard: { quoteVersionId: fixtureQuote.versionId, versionNumber: 2, reference: 'HX-Q-DEMO01' }, createdAt: iso(190), readByOther: false },
];

export const fixtureProcurement: OrderView = {
  id: '00000000-0000-7000-8000-0000001a0001', reference: 'HX-P-DEMO01', kind: 'PROCUREMENT', status: 'SOURCING', paymentStatus: 'PAID', createdAt: iso(9000),
  lines: [{ id: '00000000-0000-7000-8000-0000000d0003', returnableQuantity: 0, sku: '', name: { fa: 'کیت تسمه تایم النترا (نمونه)', en: null }, partType: 'GENUINE', condition: 'NEW', quantity: 1, unitPrice: aed(21_000n), lineTotal: irr(33_600_000n) }],
  totals: { items: irr(33_600_000n), shipping: null, tax: irr(0n), discount: irr(0n), grandTotal: irr(35_600_000n) },
  fx: { irrPerAed: FIXTURE_RATE.irrPerAed, recordedAt: iso(9100) }, address: null, shipment: null,
  schedule: { promisedReadyAt: new Date(now + 2 * 86_400_000).toISOString(), currentReadyEstimate: new Date(now + 3 * 86_400_000).toISOString(), changeReason: 'تأخیر حمل‌ونقل تأمین‌کننده (نمونه)' },
  timeline: [
    { at: iso(9000), type: 'CREATED_FROM_QUOTE', fromState: null, toState: null, note: null, actor: 'CUSTOMER' },
    { at: iso(8990), type: 'STATUS_CHANGED', fromState: 'AWAITING_PAYMENT', toState: 'PROCUREMENT_PENDING', note: null, actor: 'SYSTEM' },
    { at: iso(6000), type: 'STATUS_CHANGED', fromState: 'PROCUREMENT_PENDING', toState: 'SOURCING', note: null, actor: 'STAFF' },
    { at: iso(1000), type: 'ESTIMATE_CHANGED', fromState: null, toState: null, note: 'تأخیر حمل‌ونقل تأمین‌کننده (نمونه)', actor: 'STAFF' },
  ],
  receipts: [{ attemptId: '00000000-0000-7000-8000-0000000b0002', amount: irr(35_600_000n), paidAt: iso(8990), providerReference: 'SIMTX-DEMO2' }],
  policyVersion: { id: '00000000-0000-7000-8000-0000000c0001', version: 1 }, conversationId: fixtureConversationId,
};
