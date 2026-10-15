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
