import type { CartView, MeView, PriceView, ProductCard, ProductDetail, SearchResult } from '@hedax/contracts';
import { ALL_PERMISSIONS, DEFAULT_ROLES, type PriceTier, compactSearchText, displayUnitPrice, money, normalizeSearchText, resolveUnitPrice, searchTokens } from '@hedax/domain';
import {
  FIXTURE_RATE,
  fixtureBrands,
  fixtureCategories,
  fixtureConversations,
  fixtureMessages,
  fixtureOrders,
  fixtureProcurement,
  fixtureProducts,
  fixtureQuote,
  fixtureRequest,
  type FixtureProduct,
} from './data';

export interface FixtureResponse {
  status: number;
  body: unknown;
  cookies?: Record<string, string>;
}

const ROLE_COOKIE = 'hedax_fixture_role';
const CART_COOKIE = 'hedax_fixture_cart';
const carts = new Map<string, Map<string, number>>();

const ok = (body: unknown, cookies?: Record<string, string>): FixtureResponse => ({ status: 200, body, ...(cookies ? { cookies } : {}) });
const err = (status: number, code: string, message = code): FixtureResponse => ({ status, body: { error: { code, message, requestId: 'fixture' } } });

function tiers(p: FixtureProduct): PriceTier[] {
  return [{
    id: p.id, customerGroupId: null, minQty: 1, maxQty: null, base: money(p.currency, p.price),
    manualIrrMinor: p.manualIrr ?? null, manualAedMinor: null, validFrom: null, validTo: null, active: true,
  }];
}

function priceView(p: FixtureProduct, qty: number, display: 'IRR' | 'AED'): PriceView {
  const r = resolveUnitPrice(tiers(p), { quantity: qty, approvedCustomerGroupId: null, irrPerAed: FIXTURE_RATE.irrPerAed, fxRateId: FIXTURE_RATE.id, now: new Date() });
  if (r.status !== 'PRICED') return { kind: 'inquiry', reason: r.reason === 'NO_VALID_FX_RATE' ? 'NO_VALID_FX_RATE' : 'NO_PRICE' };
  const d = displayUnitPrice(r, display);
  if (d.kind !== 'price') return { kind: 'inquiry', reason: 'NO_PRICE' };
  return { kind: 'price', payable: { currency: 'IRR', amountMinor: r.unitPayableIrr.toString() }, display: { currency: d.currency, amountMinor: d.minor.toString() }, displayIsReference: d.isReference };
}

function card(p: FixtureProduct, display: 'IRR' | 'AED'): ProductCard {
  const available = p.onHand - p.reserved;
  const cat = fixtureCategories.find((c) => c.code === p.category);
  return {
    id: p.id, slug: p.slug, sku: p.sku, name: { fa: p.fa, en: p.en }, partType: p.partType, condition: p.condition, origin: p.origin,
    category: cat ? { slug: cat.slug, name: cat.name } : null,
    vehicleBrands: fixtureBrands.filter((b) => p.brands.includes(b.code)).map((b) => ({ slug: b.slug, name: b.name })),
    manufacturer: p.maker ? { slug: p.maker.slug, name: { fa: p.maker.fa, en: p.maker.en } } : null,
    primaryImage: null,
    availability: available <= 0 ? 'OUT_OF_STOCK' : available <= 2 ? 'LOW_STOCK' : 'IN_STOCK',
    price: priceView(p, 1, display),
  };
}

function detail(p: FixtureProduct, display: 'IRR' | 'AED'): ProductDetail {
  return {
    ...card(p, display),
    description: p.descriptionFa ? { fa: p.descriptionFa, en: p.descriptionEn ?? null } : null,
    technicalNotes: null, unit: 'عدد', packQuantity: 1, countryOfManufacture: null, warranty: null, oemCodes: [], specs: [], images: [],
    maxOrderQuantity: Math.max(0, Math.min(p.onHand - p.reserved, 999)), updatedAt: '2026-09-29T10:00:00.000Z',
  };
}

function matches(p: FixtureProduct, q: string): boolean {
  const doc = normalizeSearchText([p.fa, p.en ?? '', ...p.aliases, p.sku].join(' '));
  const tokens = searchTokens(q);
  return (tokens.length > 0 && tokens.every((t) => doc.includes(t))) || doc.replace(/ /g, '').includes(compactSearchText(q));
}

function list(params: URLSearchParams, forceImported: boolean): SearchResult {
  const display = params.get('currency') === 'AED' ? 'AED' : 'IRR';
  const q = params.get('q') ?? '';
  let items = fixtureProducts.filter((p) => p.published && !p.archived);
  if (q) items = items.filter((p) => matches(p, q));
  const brand = params.get('brand');
  if (brand) items = items.filter((p) => fixtureBrands.find((b) => b.slug === brand && p.brands.includes(b.code)));
  const category = params.get('category');
  if (category) items = items.filter((p) => fixtureCategories.find((c) => c.slug === category)?.code === p.category);
  for (const key of ['partType', 'condition', 'origin'] as const) {
    const v = params.get(key);
    if (v) items = items.filter((p) => p[key] === v);
  }
  if (forceImported) items = items.filter((p) => p.origin === 'IMPORTED');
  if (params.get('inStock') === '1') items = items.filter((p) => p.onHand - p.reserved > 0);
  const payable = (p: FixtureProduct) => {
    const v = priceView(p, 1, 'IRR');
    return v.kind === 'price' ? BigInt(v.payable.amountMinor) : 0n;
  };
  const sort = params.get('sort');
  if (sort === 'price_asc') items.sort((a, b) => (payable(a) < payable(b) ? -1 : 1));
  if (sort === 'price_desc') items.sort((a, b) => (payable(a) > payable(b) ? -1 : 1));
  if (sort === 'name') items.sort((a, b) => a.fa.localeCompare(b.fa, 'fa'));
  if (!sort || sort === 'relevance') items.sort((a, b) => Number(b.onHand - b.reserved > 0) - Number(a.onHand - a.reserved > 0));
  const page = Math.max(1, Number(params.get('page') ?? 1));
  const pageSize = Math.min(60, Math.max(1, Number(params.get('pageSize') ?? 24)));
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize).map((p) => card(p, display)),
    total: items.length, page, pageSize, query: q ? normalizeSearchText(q) : null,
  };
}

function me(role: string | undefined): MeView | null {
  if (role === 'customer') {
    return { id: 'fixture-customer', kind: 'CUSTOMER', displayName: 'مشتری نمونه', mobileMasked: '+98912***0000', email: null, customerType: 'CONSUMER', customerGroup: null, permissions: [], mfaEnabled: false, preferredLocale: 'fa', unreadNotifications: 2, unreadMessages: 1 };
  }
  if (role === 'staff') {
    return { id: 'fixture-staff', kind: 'STAFF', displayName: 'مالک نمونه', mobileMasked: null, email: 'owner@example.test', customerType: null, customerGroup: null, permissions: [...ALL_PERMISSIONS], mfaEnabled: true, preferredLocale: 'fa', unreadNotifications: 0, unreadMessages: 0 };
  }
  return null;
}

function cartView(cartId: string | undefined, display: 'IRR' | 'AED'): CartView {
  const cart = cartId ? carts.get(cartId) : undefined;
  if (!cart || cart.size === 0) return { id: cartId ?? '', lines: [], itemsTotalPayableIrr: null, canCheckout: false };
  let total = 0n;
  const lines = [...cart.entries()].map(([productId, quantity]) => {
    const p = fixtureProducts.find((x) => x.id === productId) as FixtureProduct;
    const price = priceView(p, quantity, display);
    const unit = price.kind === 'price' ? BigInt(price.payable.amountMinor) : 0n;
    total += unit * BigInt(quantity);
    const available = p.onHand - p.reserved;
    return {
      id: `${cartId}:${productId}`, productId, slug: p.slug, sku: p.sku, name: { fa: p.fa, en: p.en }, imageUrl: null, quantity,
      maxOrderQuantity: Math.min(available, 999), unitPrice: price,
      lineTotalPayableIrr: { currency: 'IRR' as const, amountMinor: (unit * BigInt(quantity)).toString() },
      problems: (available <= 0 ? ['OUT_OF_STOCK'] : quantity > available ? ['QUANTITY_REDUCED'] : []) as CartView['lines'][number]['problems'],
    };
  });
  return { id: cartId ?? '', lines, itemsTotalPayableIrr: { currency: 'IRR', amountMinor: total.toString() }, canCheckout: lines.every((l) => l.problems.length === 0) };
}

const PREVIEW_OK = { ok: true, preview: true, note: 'Preview mode: nothing was saved.' };

/**
 * Minimal in-memory implementation of the API contract for the UI preview.
 * It exists so pages can be reviewed without PostgreSQL/Redis; it is not a
 * second backend and never runs in production.
 */
export async function handleFixture(method: string, pathWithQuery: string, rawBody: string | null, cookies: Record<string, string>): Promise<FixtureResponse> {
  const url = new URL(pathWithQuery, 'http://fixture.local');
  const path = url.pathname.replace(/\/+$/, '');
  const params = url.searchParams;
  const body = rawBody ? (() => { try { return JSON.parse(rawBody) as Record<string, unknown>; } catch { return {}; } })() : {};
  const role = cookies[ROLE_COOKIE];
  const display = params.get('currency') === 'AED' ? 'AED' : 'IRR';
  const route = `${method} ${path}`;
  let m: RegExpExecArray | null;

  // --- public ---
  if (route === 'GET /catalog/products') return ok(list(params, false));
  if (route === 'GET /catalog/imported-products') return ok(list(params, true));
  if ((m = /^GET \/catalog\/products\/([^/]+)$/.exec(route))) {
    const p = fixtureProducts.find((x) => x.slug === decodeURIComponent(m![1] ?? ''));
    return p ? ok(detail(p, display)) : err(404, 'NOT_FOUND');
  }
  if (route === 'GET /catalog/categories') return ok(fixtureCategories);
  if (route === 'GET /catalog/vehicle-brands') return ok(fixtureBrands);
  if (route === 'GET /catalog/sitemap') return ok(fixtureProducts.map((p) => ({ slug: p.slug, updatedAt: '2026-09-29T10:00:00.000Z' })));
  if (route === 'GET /exchange-rates/current') return ok({ irrPerAed: FIXTURE_RATE.irrPerAed, effectiveFrom: FIXTURE_RATE.effectiveFrom });
  if (route === 'GET /site/contact') return ok({ phone: null, email: null, address: { fa: null, en: null }, workingHours: { fa: null, en: null } });
  if ((m = /^GET \/site\/policies\/(\w+)$/.exec(route))) {
    if (m[1]?.toUpperCase() !== 'TERMS') return err(404, 'POLICY_NOT_PUBLISHED');
    return ok({ id: fixtureQuote.terms.policyVersionId, kind: 'TERMS', version: 1, title: { fa: 'شرایط فروش (نسخهٔ آزمایشی)', en: 'Terms of sale (placeholder)' }, body: { fa: fixtureQuote.terms.body, en: 'Placeholder text for the development preview.' }, publishedAt: null });
  }
  if (route === 'GET /attachments/policy') return ok({ maxFiles: 10, maxFileBytes: 20 * 1024 * 1024, maxBatchBytes: 50 * 1024 * 1024, acceptedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'docx', 'xlsx', 'csv', 'doc', 'xls'], importExtensions: ['xlsx', 'csv'] });

  // --- auth ---
  if (route === 'GET /auth/csrf') return ok({ token: 'fixture' }, { hedax_csrf: 'fixture' });
  if (route === 'POST /auth/otp/request') return ok({ sent: true, expiresInSeconds: 120, resendAfterSeconds: 60, devCode: '123456' });
  if (route === 'POST /auth/otp/verify') return body.code === '123456' || body.code === '۱۲۳۴۵۶' ? ok({ signedIn: true, isNew: false }, { [ROLE_COOKIE]: 'customer' }) : err(400, 'OTP_INVALID_OR_EXPIRED');
  if (route === 'POST /auth/staff/login') return ok({ status: 'SIGNED_IN' }, { [ROLE_COOKIE]: 'staff' });
  if (route === 'POST /auth/logout') return ok({ signedOut: true }, { [ROLE_COOKIE]: '' });
  if (route === 'GET /me') {
    const view = me(role);
    return view ? ok(view) : err(401, 'UNAUTHENTICATED');
  }

  // --- cart (in-memory per preview browser) ---
  if (route === 'GET /cart') return ok(cartView(cookies[CART_COOKIE], display));
  if (route === 'POST /cart/items') {
    const id = cookies[CART_COOKIE] || crypto.randomUUID();
    const cart = carts.get(id) ?? new Map<string, number>();
    const p = fixtureProducts.find((x) => x.id === body.productId);
    if (!p) return err(404, 'NOT_FOUND');
    if (p.onHand - p.reserved <= 0) return err(422, 'OUT_OF_STOCK');
    cart.set(p.id, Math.min((cart.get(p.id) ?? 0) + Number(body.quantity ?? 1), p.onHand - p.reserved));
    carts.set(id, cart);
    return ok(cartView(id, 'IRR'), { [CART_COOKIE]: id });
  }
  if ((m = /^(PATCH|DELETE) \/cart\/items\/(.+)$/.exec(route))) {
    const [cartId, productId] = decodeURIComponent(m[2] ?? '').split(':');
    const cart = cartId ? carts.get(cartId) : undefined;
    if (cart && productId) {
      const q = m[1] === 'DELETE' ? 0 : Number(body.quantity ?? 0);
      if (q <= 0) cart.delete(productId);
      else cart.set(productId, q);
    }
    return ok(cartView(cartId, 'IRR'));
  }

  // --- customer area ---
  if (role !== 'customer' && role !== 'staff') return err(401, 'UNAUTHENTICATED');

  if (route === 'GET /account/addresses') return ok([{ id: '00000000-0000-7000-8000-000000300001', label: 'خانه (نمونه)', recipientName: 'مشتری نمونه', recipientMobile: '+989120000000', province: 'تهران', city: 'تهران', addressLine: 'نشانی نمونه — دادهٔ آزمایشی', postalCode: '1234567890', isDefault: true }]);
  if (route === 'GET /account/profile') return ok({ fullName: 'مشتری نمونه', email: null, preferredLocale: 'fa', customerType: 'CONSUMER', groupStatus: 'NONE', requestedType: null, businessName: null, companyRole: null, group: null });
  if (route === 'GET /checkout/preview') {
    const c = cartView(cookies[CART_COOKIE], display);
    const shippingId = params.get('shippingMethodId');
    const items = BigInt(c.itemsTotalPayableIrr?.amountMinor ?? '0');
    const shipping = shippingId === '00000000-0000-7000-8000-000000400001' ? 800_000n : null;
    return ok({
      cart: c,
      shippingOptions: [
        { id: '00000000-0000-7000-8000-000000400001', name: { fa: 'ارسال آزمایشی (نمونه)', en: 'Test delivery (SAMPLE)' }, cost: { status: 'KNOWN', amount: { currency: 'IRR', amountMinor: '800000' } }, estimate: { minDays: 1, maxDays: 2 } },
        { id: '00000000-0000-7000-8000-000000400002', name: { fa: 'باربری (هزینه نامعلوم — نمونه)', en: 'Freight (cost unknown — SAMPLE)' }, cost: { status: 'UNKNOWN' }, estimate: null },
      ],
      totals: c.canCheckout && shippingId
        ? {
            itemsTotal: { currency: 'IRR', amountMinor: items.toString() }, discount: { currency: 'IRR', amountMinor: '0' },
            shipping: shipping === null ? null : { currency: 'IRR', amountMinor: shipping.toString() }, tax: { currency: 'IRR', amountMinor: '0' }, taxConfigured: false,
            grandTotal: shipping === null ? null : { currency: 'IRR', amountMinor: (items + shipping).toString() },
            referenceAed: shipping === null ? null : { currency: 'AED', amountMinor: (((items + shipping) * 100n) / 160000n).toString() },
          }
        : null,
      blockers: [...(c.canCheckout ? [] : ['CART_NOT_READY']), ...(params.get('addressId') ? [] : ['ADDRESS_REQUIRED']), ...(shippingId ? [] : ['SHIPPING_METHOD_REQUIRED']), ...(shippingId && shipping === null ? ['SHIPPING_COST_UNKNOWN'] : [])],
      policy: { id: fixtureQuote.terms.policyVersionId, version: 1, title: 'شرایط فروش (نسخهٔ آزمایشی)' },
      reservationMinutes: 15,
    });
  }
  if (route === 'POST /checkout') return ok({ orderId: fixtureOrders[1]!.id, attemptId: '00000000-0000-7000-8000-0000000b0009', redirectUrl: `/${params.get('locale') ?? 'fa'}/payment/result?attempt=00000000-0000-7000-8000-0000000b0009`, reservationExpiresAt: null, isSimulator: true });
  if ((m = /^GET \/payments\/attempts\/(.+)$/.exec(route))) return ok({ attemptId: m[1], status: 'SUCCEEDED', subject: { kind: 'STOCK_ORDER', id: fixtureOrders[0]!.id, reference: 'HX-O-DEMO01' }, amount: { currency: 'IRR', amountMinor: '37800000' }, paidAt: new Date().toISOString(), providerReference: 'SIMTX-DEMO', canRetry: false, message: 'VERIFIED' });
  if (route === 'GET /orders') return ok(fixtureOrders.map((o) => ({ id: o.id, reference: o.reference, status: o.status, paymentStatus: o.paymentStatus, grandTotal: o.totals.grandTotal, createdAt: o.createdAt })));
  if ((m = /^GET \/orders\/(.+)$/.exec(route))) return fixtureOrders.find((o) => o.id === m![1]) ? ok(fixtureOrders.find((o) => o.id === m![1])) : err(404, 'NOT_FOUND');
  if (route === 'GET /sourcing-requests') return ok([{ id: fixtureRequest.id, reference: fixtureRequest.reference, title: fixtureRequest.title, status: fixtureRequest.status, itemCount: 2, createdAt: fixtureRequest.createdAt }]);
  if ((m = /^GET \/sourcing-requests\/(.+)$/.exec(route))) return m[1] === fixtureRequest.id ? ok(fixtureRequest) : err(404, 'NOT_FOUND');
  if (route === 'POST /sourcing-requests') return ok({ ...fixtureRequest, reference: 'HX-R-PREVIEW', title: String(body.title ?? ''), status: 'SUBMITTED', quotes: [] });
  if ((m = /^GET \/quotes\/(.+)$/.exec(route))) return m[1] === fixtureQuote.versionId ? ok(fixtureQuote) : err(404, 'NOT_FOUND');
  if (route === 'POST /quote-acceptance') return ok({ status: body.decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED', procurementId: fixtureProcurement.id });
  if (route === 'GET /procurements') return ok([{ id: fixtureProcurement.id, reference: fixtureProcurement.reference, status: fixtureProcurement.status, paymentStatus: 'PAID', total: fixtureProcurement.totals.grandTotal, quoteReference: 'HX-Q-DEMO00', promisedReadyAt: fixtureProcurement.schedule?.promisedReadyAt, createdAt: fixtureProcurement.createdAt }]);
  if ((m = /^GET \/procurements\/(.+)$/.exec(route))) return m[1] === fixtureProcurement.id ? ok(fixtureProcurement) : err(404, 'NOT_FOUND');
  if (route === 'GET /conversations') return ok(fixtureConversations);
  if ((m = /^GET \/conversations\/([^/]+)$/.exec(route))) return ok({ id: m[1], subject: fixtureConversations[0]!.subject, subjectKind: 'SOURCING_REQUEST', subjectId: fixtureRequest.id, closedAt: null });
  if ((m = /^GET \/conversations\/([^/]+)\/messages$/.exec(route))) return ok({ items: fixtureMessages, nextCursor: null });
  if ((m = /^POST \/conversations\/([^/]+)\/messages$/.exec(route))) {
    return ok({ id: crypto.randomUUID(), conversationId: m[1], clientMessageId: body.clientMessageId, sender: { kind: 'CUSTOMER', displayName: 'شما', isSelf: true }, body: String(body.body ?? ''), attachments: [], quoteCard: null, createdAt: new Date().toISOString(), readByOther: false });
  }
  if (route === 'GET /notifications') return ok([{ id: 'n1', type: 'quote.sent', params: { reference: 'HX-Q-DEMO01', version: 2 }, linkPath: `/account/quotes/${fixtureQuote.versionId}`, readAt: null, createdAt: new Date().toISOString() }]);
  if (route === 'GET /returns') return ok([]);

  // --- admin (preview as owner) ---
  if (path.startsWith('/admin') || path.startsWith('/payments/admin')) {
    if (role !== 'staff') return err(403, 'FORBIDDEN');
    if (method !== 'GET') return ok(PREVIEW_OK);
    if (path === '/admin/dashboard') {
      return ok({
        ordersNeedingAction: 1, newSourcingRequests: 1, paymentsPendingVerification: 0, delayedProcurements: 1, lowStockProducts: 3, unreadConversations: 1,
        launchReadiness: [
          { key: 'payment_gateway', status: 'SIMULATED', note: '' }, { key: 'sms', status: 'SIMULATED', note: '' }, { key: 'malware_scanner', status: 'SIMULATED', note: '' },
          { key: 'private_storage', status: 'SIMULATED', note: '' }, { key: 'domain', status: 'MISSING', note: '' }, { key: 'terms_published', status: 'MISSING', note: '' },
          { key: 'fx_rate', status: 'READY', note: '' }, { key: 'contact_info', status: 'MISSING', note: '' },
        ],
      });
    }
    if (path === '/admin/products') {
      return ok({ page: 1, pageSize: 50, total: fixtureProducts.length, items: fixtureProducts.map((p, i) => ({
        id: p.id, sku: p.sku, nameFa: p.fa, nameEn: p.en, categoryName: fixtureCategories.find((c) => c.code === p.category)?.name.fa ?? null, published: p.published, archived: !!p.archived,
        basePrice: { currency: p.currency, amountMinor: p.price.toString() }, priceSource: p.manualIrr ? 'PUBLIC:MANUAL_IRR' : p.currency === 'AED' ? 'PUBLIC:CONVERTED_FROM_AED' : 'PUBLIC:BASE_IRR',
        onHand: p.onHand, reserved: p.reserved, available: p.onHand - p.reserved, lowStockThreshold: 2, version: i, updatedAt: '2026-09-29T10:00:00.000Z',
      })) });
    }
    if (path === '/admin/inventory') {
      return ok({ page: 1, pageSize: 50, total: fixtureProducts.length, items: fixtureProducts.map((p, i) => ({ productId: p.id, sku: p.sku, nameFa: p.fa, onHand: p.onHand, reserved: p.reserved, available: p.onHand - p.reserved, lowStockThreshold: 2, isLow: p.onHand - p.reserved <= 2, version: i, updatedAt: '2026-09-29T10:00:00.000Z' })) });
    }
    if (path === '/admin/taxonomy') return ok({ categories: fixtureCategories.map((c, i) => ({ id: `cat-${i}`, code: c.code, slug: c.slug, nameFa: c.name.fa, nameEn: c.name.en, active: true })), vehicleBrands: fixtureBrands.map((b, i) => ({ id: `vb-${i}`, code: b.code, slug: b.slug, nameFa: b.name.fa, nameEn: b.name.en, isFeatured: true, active: true })), manufacturers: [], customerGroups: [{ id: 'g1', key: 'workshop', nameFa: 'تعمیرگاه / مشتری تجاری', nameEn: 'Workshop / business' }, { id: 'g2', key: 'wholesale', nameFa: 'عمده‌فروش', nameEn: 'Wholesaler' }] });
    if (path === '/admin/sourcing-requests') return ok([{ id: fixtureRequest.id, reference: fixtureRequest.reference, title: fixtureRequest.title, status: fixtureRequest.status, urgency: 'NORMAL', customer: 'مشتری نمونه', assignee: 'کارشناس', itemCount: 2, createdAt: fixtureRequest.createdAt, version: 3 }]);
    if (path === `/admin/sourcing-requests/${fixtureRequest.id}`) return ok({ ...fixtureRequest, version: 3, customer: { id: 'fixture-customer', fullName: 'مشتری نمونه' }, note: null, delivery: { province: 'تهران', city: 'تهران' }, itemsDetail: [], files: [] });
    if (path === '/admin/quotes') {
      return ok([...fixtureRequest.quotes].reverse().map((q) => ({
        versionId: q.versionId, reference: q.reference, versionNumber: q.versionNumber, status: q.status, isCurrent: q.versionId === fixtureQuote.versionId,
        request: { id: fixtureRequest.id, reference: fixtureRequest.reference }, customer: 'مشتری نمونه', totalPayableIrr: q.totalPayable,
        sentAt: fixtureQuote.issuedAt, validUntil: q.validUntil, createdAt: fixtureQuote.issuedAt,
      })));
    }
    if (path === '/admin/orders') return ok(fixtureOrders.map((o, i) => ({ id: o.id, reference: o.reference, status: o.status, paymentStatus: o.paymentStatus, customer: 'مشتری نمونه', grandTotal: o.totals.grandTotal, createdAt: o.createdAt, version: i })));
    if ((m = /^\/admin\/orders\/(.+)$/.exec(path))) return ok({ ...(fixtureOrders.find((o) => o.id === m![1]) ?? fixtureOrders[0]), version: 1 });
    if (path === '/admin/procurements') return ok([{ id: fixtureProcurement.id, reference: fixtureProcurement.reference, status: fixtureProcurement.status, paymentStatus: 'PAID', customer: 'مشتری نمونه', assignee: 'کارشناس', total: fixtureProcurement.totals.grandTotal, promisedReadyAt: fixtureProcurement.schedule?.promisedReadyAt, currentReadyEstimate: fixtureProcurement.schedule?.currentReadyEstimate, delayed: true, version: 2 }]);
    if (path === '/payments/admin/attempts') return ok([{ id: 'pa1', reference: 'HX-PAY-DEMO1', subjectType: 'STOCK_ORDER', subjectReference: 'HX-O-DEMO01', customer: 'مشتری نمونه', amount: { currency: 'IRR', amountMinor: '37800000' }, status: 'SUCCEEDED', provider: 'simulator', failureCode: null, overpayment: { currency: 'IRR', amountMinor: '0' }, createdAt: fixtureOrders[0]!.createdAt, verifiedAt: fixtureOrders[0]!.createdAt }]);
    if (path === '/payments/admin/cases') return ok([]);
    if (path === '/admin/refunds' || path === '/admin/returns' || path === '/admin/audit') return ok([]);
    if (path === '/admin/customers') return ok([{ id: 'fixture-customer', fullName: 'مشتری نمونه', mobile: '+98912***0000', status: 'ACTIVE', customerType: 'CONSUMER', groupStatus: 'PENDING', requestedType: 'WORKSHOP', businessName: 'تعمیرگاه نمونه', group: null, orders: 2, requests: 1, createdAt: fixtureOrders[0]!.createdAt }]);
    if (path === '/admin/staff') return ok({ staff: [{ id: 'fixture-staff', email: 'owner@example.test', fullName: 'مالک نمونه', status: 'ACTIVE', mfaEnabled: true, lastLoginAt: new Date().toISOString(), roles: [{ id: 'r-owner', key: 'owner', nameFa: 'مالک', nameEn: 'Owner' }] }], pendingInvitations: [] });
    if (path === '/admin/roles') return ok(DEFAULT_ROLES.map((r) => ({ id: `r-${r.key}`, key: r.key, nameFa: r.nameFa, nameEn: r.nameEn, isSystem: true, isOwner: r.isOwner, requiresMfa: r.requiresMfa, permissions: [...r.permissions], members: r.isOwner ? 1 : 0, version: 0 })));
    if (path === '/admin/exchange-rates') return ok([{ id: FIXTURE_RATE.id, irrPerAed: FIXTURE_RATE.irrPerAed, effectiveFrom: FIXTURE_RATE.effectiveFrom, note: 'نرخ نمونه — نرخ بازار نیست', createdBy: 'مالک نمونه', createdAt: FIXTURE_RATE.effectiveFrom }]);
    if (path === '/admin/settings') return ok({ reservationMinutes: 15, quoteValidityHoursDefault: 24, taxRateBasisPoints: null, taxBase: 'ITEMS', manualBankTransferEnabled: false, version: 0 });
    if (path === '/admin/shipping-methods') return ok([]);
    if (path === '/admin/policies') return ok([]);
    if (path === '/admin/calendars') return ok([{ id: 'cal1', name: 'تقویم کاری پیش‌فرض', timeZone: 'Asia/Tehran', weekendDays: [5], holidays: [], isDefault: true, version: 0 }]);
    if (path === '/admin/reports/summary') return ok({ range: { from: '2026-09-01T00:00:00.000Z', to: '2026-09-30T00:00:00.000Z' }, ordersByStatus: [{ status: 'SHIPPED', count: 1 }, { status: 'AWAITING_PAYMENT', count: 1 }], topItems: [{ sku: 'DEMO-0001', name: 'لنت ترمز جلو پژو ۲۰۶ (نمونه)', quantity: 2, revenue: { currency: 'IRR', amountMinor: '37000000' } }], sourcing: { requests: 1, convertedToPaidOrders: 0 }, quotesIssued: { count: 2, totalValue: { currency: 'IRR', amountMinor: '184640000' } }, financial: { collections: { currency: 'IRR', amountMinor: '73400000' }, collectionsCount: 2, refunds: { currency: 'IRR', amountMinor: '0' }, refundsCount: 0, net: { currency: 'IRR', amountMinor: '73400000' }, currency: 'IRR' } });
    if (path === '/admin/permissions') return ok(ALL_PERMISSIONS.map((key) => ({ key, description: key })));
    return ok([]);
  }
  if (method !== 'GET') return ok(PREVIEW_OK);
  return err(404, 'NOT_FOUND');
}
