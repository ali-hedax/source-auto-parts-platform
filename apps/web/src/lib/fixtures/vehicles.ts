import type { FitmentView, VehicleAdminView, VehicleCategoryView, VehicleOption, VehiclePublicView } from '@hedax/contracts';

/**
 * Preview copy of the vehicle list (database/prisma/migrations/20261015110000_vehicle_fitment):
 * the sixteen starting vehicles without a category, a «سواری» category and a few sample models.
 */
interface FixtureVehicle { id: string; slug: string; fa: string; en: string; categoryId: string | null; models: Array<{ id: string; slug: string; fa: string }> }

const vid = (n: number) => `00000000-0000-7000-8000-00000000c${String(n).padStart(3, '0')}`;
const SEED: Array<[string, string, string]> = [
  ['suzuki', 'سوزوکی', 'Suzuki'], ['samand', 'سمند', 'Samand'], ['renault', 'رنو', 'Renault'], ['rana', 'رانا', 'Rana'], ['dena', 'دنا', 'Dena'],
  ['dena-plus', 'دنا پلاس', 'Dena Plus'], ['haima', 'هایما', 'Haima'], ['peugeot', 'پژو', 'Peugeot'], ['paykan-pickup', 'پیکان وانت', 'Paykan Pickup'],
  ['rd', 'آردی', 'RD'], ['dongfeng', 'دانگ‌فنگ', 'Dongfeng'], ['arisan', 'آریسان', 'Arisan'], ['tara', 'تارا', 'Tara'], ['rira', 'ری‌را', 'Rira'],
  ['electric-vehicles', 'خودروهای برقی', 'Electric vehicles'], ['safir', 'سفیر', 'Safir'],
];

export const fixtureVehicleCategories: VehicleCategoryView[] = [
  { id: 'vc-passenger', name: 'سواری', nameEn: 'Passenger', slug: 'passenger', sortOrder: 1, active: true, vehicleCount: 0 },
];

export const fixtureVehicles: FixtureVehicle[] = SEED.map(([slug, fa, en], i) => ({
  id: vid(i + 1), slug, fa, en, categoryId: null,
  models: slug === 'peugeot'
    ? [{ id: 'vm-206', slug: '206', fa: '۲۰۶' }, { id: 'vm-405', slug: '405', fa: '۴۰۵' }, { id: 'vm-pars', slug: 'pars', fa: 'پارس' }]
    : slug === 'dena' ? [{ id: 'vm-dena-turbo', slug: 'turbo', fa: 'توربو' }] : [],
}));

/** Sample parts and the vehicles they fit (by SKU). */
export const fixtureFitments: Record<string, Array<{ vehicle: string; model: string | null }>> = {
  'DEMO-0001': [{ vehicle: 'peugeot', model: '206' }, { vehicle: 'peugeot', model: 'pars' }, { vehicle: 'dena', model: null }],
  'DEMO-0002': [{ vehicle: 'samand', model: null }, { vehicle: 'dena', model: null }],
  'DEMO-0008': [{ vehicle: 'peugeot', model: '405' }],
};

const bySlug = (slug: string) => fixtureVehicles.find((v) => v.slug === slug);

export function fixtureFitmentViews(sku: string): FitmentView[] {
  return (fixtureFitments[sku] ?? []).flatMap((f) => {
    const v = bySlug(f.vehicle);
    if (!v) return [];
    const m = f.model ? v.models.find((x) => x.slug === f.model) : null;
    return [{ vehicle: { slug: v.slug, name: { fa: v.fa, en: v.en } }, model: m ? { slug: m.slug, name: { fa: m.fa, en: null } } : null }];
  });
}

/** Whether a sample part fits the vehicle (and the model, when given: model links plus whole-vehicle links). */
export function fixtureFits(sku: string, vehicle: string, model: string | null): boolean {
  return (fixtureFitments[sku] ?? []).some((f) => f.vehicle === vehicle && (!model || f.model === null || f.model === model));
}

const productCount = (slug: string) => Object.values(fixtureFitments).filter((list) => list.some((f) => f.vehicle === slug)).length;

export function fixturePublicVehicles(): VehiclePublicView[] {
  return fixtureVehicles.map((v) => ({
    slug: v.slug, name: { fa: v.fa, en: v.en }, category: null, models: v.models.map((m) => ({ slug: m.slug, name: { fa: m.fa, en: null } })),
    productCount: productCount(v.slug), seoTitle: null, seoDescription: null,
  }));
}

export function fixtureAdminVehicles(): { categories: VehicleCategoryView[]; vehicles: VehicleAdminView[] } {
  return {
    categories: fixtureVehicleCategories,
    vehicles: fixtureVehicles.map((v, i) => ({
      id: v.id, name: v.fa, nameEn: v.en, slug: v.slug, categoryId: v.categoryId, sortOrder: i + 1, active: true, seoTitle: null, seoDescription: null,
      productCount: productCount(v.slug),
      models: v.models.map((m, j) => ({ id: m.id, name: m.fa, nameEn: null, slug: m.slug, sortOrder: j + 1, active: true, productCount: Object.values(fixtureFitments).filter((l) => l.some((f) => f.vehicle === v.slug && f.model === m.slug)).length })),
    })),
  };
}

export function fixtureVehicleOptions(): VehicleOption[] {
  return fixtureVehicles.map((v) => ({ id: v.id, name: v.fa, nameEn: v.en, active: true, category: null, models: v.models.map((m) => ({ id: m.id, name: m.fa, nameEn: null, active: true })) }));
}

/** A product's fitment as the admin product form receives it. */
export function fixtureAdminFitment(sku: string): Array<{ vehicleId: string; modelId: string | null; vehicleName: string; modelName: string | null }> {
  return (fixtureFitments[sku] ?? []).flatMap((f) => {
    const v = bySlug(f.vehicle);
    const m = v && f.model ? v.models.find((x) => x.slug === f.model) : null;
    return v ? [{ vehicleId: v.id, modelId: m?.id ?? null, vehicleName: v.fa, modelName: m?.fa ?? null }] : [];
  });
}

// ---------------------------------------------------------------------------
// Vehicle finder (fixture preview): group → vehicle → model → year. Sample data only; each finder
// vehicle points at the sample fitments above (like a reviewed equivalence), never by similar names.
// ---------------------------------------------------------------------------

interface FixtureFinderModel { slug: string; fa: string; en: string; years: { from: number; to: number; calendar: 'jalali' | 'gregorian' } | null; fits: { vehicle: string; model: string | null } }
interface FixtureFinderVehicle { slug: string; fa: string; en: string; make: { fa: string; en: string }; fits: { vehicle: string; model: string | null }; models: FixtureFinderModel[] }
export const fixtureFinder: Record<string, FixtureFinderVehicle[]> = {
  'iran-khodro': [
    { slug: 'peugeot-206', fa: 'پژو ۲۰۶', en: 'Peugeot 206', make: { fa: 'پژو', en: 'Peugeot' }, fits: { vehicle: 'peugeot', model: '206' }, models: [
      { slug: 'type-2', fa: 'تیپ ۲', en: 'Type 2', years: { from: 1381, to: 1402, calendar: 'jalali' }, fits: { vehicle: 'peugeot', model: '206' } },
      { slug: 'type-5', fa: 'تیپ ۵', en: 'Type 5', years: null, fits: { vehicle: 'peugeot', model: '206' } },
    ] },
    { slug: 'samand', fa: 'سمند', en: 'Samand', make: { fa: 'ایران خودرو', en: 'Iran Khodro' }, fits: { vehicle: 'samand', model: null }, models: [] },
    { slug: 'dena', fa: 'دنا', en: 'Dena', make: { fa: 'ایران خودرو', en: 'Iran Khodro' }, fits: { vehicle: 'dena', model: null }, models: [
      { slug: 'turbo', fa: 'توربو', en: 'Turbo', years: { from: 1397, to: 1404, calendar: 'jalali' }, fits: { vehicle: 'dena', model: 'turbo' } },
    ] },
  ],
  saipa: [
    { slug: 'pride', fa: 'پراید', en: 'Pride', make: { fa: 'کیا', en: 'Kia' }, fits: { vehicle: 'pride', model: null }, models: [
      { slug: 'saba', fa: 'صبا', en: 'Saba', years: { from: 1373, to: 1399, calendar: 'jalali' }, fits: { vehicle: 'pride', model: 'saba' } },
    ] },
  ],
  toyota: [],
  hyundai: [],
};

type FixtureMatch = { tier: 'verified' | 'relevant' | 'related' | 'text'; reason: 'MODEL' | 'VEHICLE' | 'GROUP' | 'YEAR_UNCONFIRMED' | 'NAME_MATCH' | 'TEXT' };
export type FixtureFinderResolution =
  | { invalid: 'group' | 'vehicle' | 'model' | 'year' }
  | { selection: { group: { slug: string; name: { fa: string; en: string } }; vehicle: { slug: string; name: { fa: string; en: string } } | null; model: { slug: string; name: { fa: string; en: string } } | null; year: number | null; calendar: 'jalali' | 'gregorian' | null }; match: (sku: string, name: string, typed: boolean) => FixtureMatch | null };

/** Like the API: every step optional, results ranked (sample links carry no years, so a year is never confirmed). */
export function fixtureFinderResolve(group: string, vehicle: string | null, model: string | null, year: string | null): FixtureFinderResolution {
  const list = fixtureFinder[group];
  const brand = { 'iran-khodro': { fa: 'ایران خودرو', en: 'Iran Khodro' }, saipa: { fa: 'سایپا', en: 'Saipa' }, toyota: { fa: 'تویوتا', en: 'Toyota' }, hyundai: { fa: 'هیوندای', en: 'Hyundai' } }[group];
  if (!list || !brand) return { invalid: 'group' };
  const v = vehicle ? list.find((x) => x.slug === vehicle) : undefined;
  if (vehicle && !v) return { invalid: 'vehicle' };
  if (model && !v) return { invalid: 'model' };
  const m = model && v ? v.models.find((x) => x.slug === model) : undefined;
  if (model && !m) return { invalid: 'model' };
  const y = year ? Number(year) : null;
  if (year && (!v || !Number.isInteger(y) || (m?.years && (y! < m.years.from || y! > m.years.to)))) return { invalid: 'year' };
  const calendar = m?.years?.calendar ?? (y === null ? null : y >= 1300 && y <= 1499 ? 'jalali' : 'gregorian');
  const target = m?.fits ?? v?.fits;
  const match = (sku: string, name: string, typed: boolean): FixtureMatch | null => {
    if (!v) return list.some((x) => fixtureFits(sku, x.fits.vehicle, x.fits.model)) ? { tier: 'verified', reason: 'GROUP' } : typed ? { tier: 'text', reason: 'TEXT' } : null;
    if (target && fixtureFits(sku, target.vehicle, target.model)) return y !== null ? { tier: 'relevant', reason: 'YEAR_UNCONFIRMED' } : { tier: 'verified', reason: m ? 'MODEL' : 'VEHICLE' };
    if (name.replace(/\s|\u200c/g, '').includes(v.fa.replace(/\s|\u200c/g, ''))) return { tier: 'related', reason: 'NAME_MATCH' };
    return typed ? { tier: 'text', reason: 'TEXT' } : null;
  };
  return {
    selection: { group: { slug: group, name: brand }, vehicle: v ? { slug: v.slug, name: { fa: v.fa, en: v.en } } : null, model: m ? { slug: m.slug, name: { fa: m.fa, en: m.en } } : null, year: y, calendar },
    match,
  };
}
