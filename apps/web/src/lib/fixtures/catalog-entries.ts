import type {
  CatalogEntryAdminDetail, CatalogEntryAdminRow, CatalogEntryCard, CatalogEntryDetail, CatalogEntrySearchResult, CatalogFitmentView,
} from '@hedax/contracts';
import { normalizeSearchText, partNumberKey } from '@hedax/domain';
import { fixtureBrands, fixtureCategories } from './data';
import { fixtureVehicles } from './vehicles';

/**
 * Preview copy of the technical catalog (HEDAX_DATA_SOURCE=fixtures): a few published parts with
 * numbers, fitments and specs, one linked to a shop product, and one draft that is never public.
 */
interface FixtureEntry {
  id: string;
  partNumber: string;
  fa: string;
  en: string;
  equivalents: string[];
  replacements: string[];
  category: string;
  brands: string[];
  fits: Array<{ vehicle: string; model: string | null; yearFrom: number | null; yearTo: number | null }>;
  specs: Array<{ label: string; value: string }>;
  description: string | null;
  productSlug: string | null;
  status: 'DRAFT' | 'PUBLISHED';
}

const ENTRIES: FixtureEntry[] = [
  {
    id: '00000000-0000-7000-8000-0000000ce001', partNumber: '0450-102-805', fa: 'فیلتر بنزین انژکتوری (نمونه)', en: 'Injection fuel filter (SAMPLE)',
    equivalents: ['WK 512', '0 450 905 133'], replacements: ['0450102806'], category: 'FILTER', brands: ['IKCO'],
    fits: [{ vehicle: 'peugeot', model: '405', yearFrom: 1390, yearTo: 1400 }, { vehicle: 'samand', model: null, yearFrom: null, yearTo: null }],
    specs: [{ label: 'قطر', value: '80mm' }, { label: 'طول', value: '150mm' }], description: 'دادهٔ نمونه برای پیش‌نمایش کاتالوگ فنی.', productSlug: null, status: 'PUBLISHED',
  },
  {
    id: '00000000-0000-7000-8000-0000000ce002', partNumber: 'DEMO-0001', fa: 'لنت ترمز جلو پژو ۲۰۶ (نمونهٔ کاتالوگ)', en: 'Front brake pad, Peugeot 206 (catalogue SAMPLE)',
    equivalents: ['GDB 1234'], replacements: [], category: 'BRAKE', brands: ['IKCO'],
    fits: [{ vehicle: 'peugeot', model: '206', yearFrom: 1385, yearTo: 1402 }, { vehicle: 'peugeot', model: 'pars', yearFrom: null, yearTo: null }, { vehicle: 'dena', model: null, yearFrom: null, yearTo: null }],
    specs: [{ label: 'جنس', value: 'سرامیکی' }], description: null, productSlug: 'demo-front-brake-pad-206', status: 'PUBLISHED',
  },
  {
    id: '00000000-0000-7000-8000-0000000ce003', partNumber: 'SP-1182-A', fa: 'کمک فنر عقب (نمونهٔ کاتالوگ)', en: 'Rear shock absorber (catalogue SAMPLE)',
    equivalents: [], replacements: [], category: 'SUSPENSION', brands: ['SAIPA'],
    fits: [{ vehicle: 'rana', model: null, yearFrom: 1392, yearTo: null }], specs: [], description: null, productSlug: null, status: 'PUBLISHED',
  },
  {
    id: '00000000-0000-7000-8000-0000000ce004', partNumber: 'DRAFT-001', fa: 'قطعهٔ پیش‌نویس (نمونه)', en: 'Draft part (SAMPLE)',
    equivalents: [], replacements: [], category: 'ENGINE', brands: [], fits: [], specs: [], description: null, productSlug: null, status: 'DRAFT',
  },
];

const slugOf = (e: FixtureEntry) => e.partNumber.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const UPDATED = '2026-10-17T08:00:00.000Z';

function fitments(e: FixtureEntry): CatalogFitmentView[] {
  return e.fits.flatMap((f) => {
    const v = fixtureVehicles.find((x) => x.slug === f.vehicle);
    if (!v) return [];
    const m = f.model ? v.models.find((x) => x.slug === f.model) : null;
    return [{ vehicle: { slug: v.slug, name: { fa: v.fa, en: v.en } }, model: m ? { slug: m.slug, name: { fa: m.fa, en: null } } : null, yearFrom: f.yearFrom, yearTo: f.yearTo, note: null }];
  });
}

function card(e: FixtureEntry): CatalogEntryCard {
  const cat = fixtureCategories.find((c) => c.code === e.category);
  return {
    slug: slugOf(e), partNumber: e.partNumber, name: { fa: e.fa, en: e.en }, manufacturer: null,
    category: cat ? { slug: cat.slug, name: cat.name } : null, image: null, fitments: fitments(e), inShop: !!e.productSlug,
  };
}

function matches(e: FixtureEntry, q: string): boolean {
  const key = partNumberKey(q);
  const words = normalizeSearchText(q).split(' ').filter(Boolean);
  const keys = [e.partNumber, ...e.equivalents, ...e.replacements].map(partNumberKey);
  const text = normalizeSearchText(`${e.fa} ${e.en}`);
  return (!!key && keys.some((k) => k.includes(key))) || (!!words.length && words.every((w) => text.includes(w)));
}

export function fixtureCatalogList(params: URLSearchParams): CatalogEntrySearchResult {
  const q = params.get('q')?.trim() ?? '';
  const brand = params.get('brand');
  const vehicle = params.get('vehicle');
  const model = params.get('model');
  const category = params.get('category');
  const pageSize = Math.min(Number(params.get('pageSize') ?? 24) || 24, 48);
  const page = Math.max(Number(params.get('page') ?? 1) || 1, 1);
  const items = ENTRIES.filter((e) => e.status === 'PUBLISHED')
    .filter((e) => !q || matches(e, q))
    .filter((e) => !brand || e.brands.some((b) => fixtureBrands.find((x) => x.code === b)?.slug === brand))
    .filter((e) => !vehicle || e.fits.some((f) => f.vehicle === vehicle && (!model || f.model === null || f.model === model)))
    .filter((e) => !category || fixtureCategories.find((c) => c.code === e.category)?.slug === category);
  return { items: items.slice((page - 1) * pageSize, page * pageSize).map(card), total: items.length, page, pageSize };
}

export function fixtureCatalogDetail(slug: string): CatalogEntryDetail | null {
  const e = ENTRIES.find((x) => x.status === 'PUBLISHED' && slugOf(x) === slug);
  if (!e) return null;
  return {
    ...card(e), equivalents: e.equivalents, replacements: e.replacements,
    vehicleBrands: fixtureBrands.filter((b) => e.brands.includes(b.code)).map((b) => ({ slug: b.slug, name: b.name })),
    specs: e.specs, description: e.description ? { fa: e.description, en: 'Sample data for the technical catalogue preview.' } : null, images: [],
    product: e.productSlug ? { slug: e.productSlug, name: { fa: e.fa, en: e.en } } : null, updatedAt: UPDATED,
  };
}

export function fixtureCatalogSitemap() {
  return ENTRIES.filter((e) => e.status === 'PUBLISHED').map((e) => ({ slug: slugOf(e), updatedAt: UPDATED }));
}

export function fixtureCatalogAdminList(params: URLSearchParams) {
  const q = params.get('q')?.trim() ?? '';
  const status = params.get('status');
  const items: CatalogEntryAdminRow[] = ENTRIES.filter((e) => (!q || matches(e, q)) && (!status || e.status === status)).map((e) => ({
    id: e.id, slug: slugOf(e), partNumber: e.partNumber, nameFa: e.fa, nameEn: e.en, status: e.status,
    category: fixtureCategories.find((c) => c.code === e.category)?.name.fa ?? null, manufacturer: null, imageUrl: null, imageCount: 0, vehicleCount: e.fits.length,
    product: e.productSlug ? { id: 'fixture-product', sku: 'DEMO-0001', nameFa: e.fa } : null, updatedAt: UPDATED,
  }));
  return { items, total: items.length, page: 1, pageSize: 25 };
}

export function fixtureCatalogAdminDetail(id: string): CatalogEntryAdminDetail | null {
  const e = ENTRIES.find((x) => x.id === id);
  if (!e) return null;
  return {
    id: e.id, slug: slugOf(e), partNumber: e.partNumber, nameFa: e.fa, nameEn: e.en, equivalents: e.equivalents, replacements: e.replacements,
    manufacturerBrandId: null, categoryId: `cat-${fixtureCategories.findIndex((c) => c.code === e.category)}`, vehicleBrandIds: e.brands.map((b) => `vb-${fixtureBrands.findIndex((x) => x.code === b)}`),
    vehicles: e.fits.flatMap((f) => {
      const v = fixtureVehicles.find((x) => x.slug === f.vehicle);
      const m = v && f.model ? v.models.find((x) => x.slug === f.model) : null;
      return v ? [{ vehicleId: v.id, modelId: m?.id ?? null, yearFrom: f.yearFrom, yearTo: f.yearTo, note: null, vehicleName: v.fa, modelName: m?.fa ?? null }] : [];
    }),
    specs: e.specs, descriptionFa: e.description, descriptionEn: null, sourceDocumentId: null, productId: e.productSlug ? 'fixture-product' : null, status: e.status,
    images: [], product: e.productSlug ? { id: 'fixture-product', sku: 'DEMO-0001', nameFa: e.fa } : null, sourceDocument: null,
    createdAt: UPDATED, updatedAt: UPDATED, publishedAt: e.status === 'PUBLISHED' ? UPDATED : null,
  };
}
