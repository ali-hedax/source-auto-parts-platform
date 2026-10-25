import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vehicleKey } from '@hedax/domain';
import { describe, expect, it } from 'vitest';
import { type VehicleSnapshot, planVehicleImport, vehicleDatasetSchema } from '../../src/database/vehicle-dataset.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const GROUPS = [{ id: 'g-ikco', code: 'IKCO' }, { id: 'g-saipa', code: 'SAIPA' }, { id: 'g-toyota', code: 'TOYOTA' }, { id: 'g-hyundai', code: 'HYUNDAI' }];
// The sixteen vehicles of the live catalogue (names and slugs only) and its two models.
const LIVE = [['سوزوکی', 'suzuki'], ['سمند', 'samand'], ['رنو', 'renault'], ['رانا', 'rana'], ['دنا', 'dena'], ['دنا پلاس', 'dena-plus'], ['هایما', 'haima'], ['پژو', 'peugeot'],
  ['پیکان وانت', 'paykan-pickup'], ['آردی', 'rd'], ['دانگ‌فنگ', 'dongfeng'], ['آریسان', 'arisan'], ['تارا', 'tara'], ['ری‌را', 'rira'], ['خودروهای برقی', 'electric-vehicles'], ['سفیر', 'safir']];
const live = (): VehicleSnapshot => ({
  groups: GROUPS,
  vehicles: LIVE.map(([name, slug]) => ({ id: `v-${slug}`, slug: slug!, name: name!, nameEn: null, nameKey: vehicleKey(name!), dataKey: null, groupIds: [], makeFa: null, finderVisible: false })),
  models: [
    { id: 'm-vitara', vehicleId: 'v-suzuki', slug: 'model-mv95iiyj', name: 'ویتارا کلیه مدل ها', nameKey: vehicleKey('ویتارا کلیه مدل ها'), dataKey: null },
    { id: 'm-2008', vehicleId: 'v-peugeot', slug: '2008', name: '2008', nameKey: vehicleKey('2008'), dataKey: null },
  ],
});

/** Applies a plan to a snapshot the way the importer does, so a re-run can be planned. */
function applied(db: VehicleSnapshot, plan: ReturnType<typeof planVehicleImport>): VehicleSnapshot {
  const vehicles = db.vehicles.map((v) => ({ ...v }));
  const keyToId = new Map<string, string>();
  for (const p of plan.vehicles) {
    const row = p.existingId ? vehicles.find((v) => v.id === p.existingId)! : { id: `new-${p.key}`, slug: p.slug, name: p.name, nameEn: p.nameEn, nameKey: p.nameKey, dataKey: null, groupIds: [], makeFa: null, finderVisible: false };
    if (!p.existingId) vehicles.push(row);
    Object.assign(row, { dataKey: p.key, groupIds: p.groupIds, makeFa: p.makeFa, finderVisible: true });
    keyToId.set(p.key, row.id);
  }
  const models = db.models.map((m) => ({ ...m }));
  for (const m of plan.models) {
    if (m.existingId) Object.assign(models.find((x) => x.id === m.existingId)!, { dataKey: m.key });
    else models.push({ id: `new-${m.key}`, vehicleId: keyToId.get(m.vehicleKey)!, slug: m.slug, name: m.name, nameKey: m.nameKey, dataKey: m.key });
  }
  return { groups: db.groups, vehicles, models, equivalenceKeys: plan.equivalences.map((e) => e.key) };
}

describe('the reviewed Iran-market dataset', () => {
  const dataset = vehicleDatasetSchema.parse(JSON.parse(readFileSync(path.join(repo, 'database/datasets/vehicles/iran-market.v1.json'), 'utf8')));

  it('covers the four groups, cites a known source for every record and keeps years in range', () => {
    const groups = new Set(dataset.vehicles.flatMap((v) => v.groups));
    expect([...groups].sort()).toEqual(['HYUNDAI', 'IKCO', 'SAIPA', 'TOYOTA']);
    for (const v of dataset.vehicles) {
      for (const s of [...v.sources, ...v.models.flatMap((m) => [...m.sources, ...(m.years ? [m.years.source] : [])])]) expect(dataset.sources[s.ref], `${v.key} ${s.ref}`).toBeTruthy();
    }
    expect(new Set(dataset.vehicles.map((v) => v.key)).size).toBe(dataset.vehicles.length);
  });

  it('plans against the live catalogue without conflicts, keeps its rows and imports years only from official sources', () => {
    const db = live();
    const plan = planVehicleImport(dataset, db);
    expect(plan.counts.conflict).toBe(0);
    expect(plan.counts.duplicate).toBe(0);
    const reused = plan.vehicles.filter((v) => v.existingId).map((v) => v.slug).sort();
    expect(reused).toEqual(['arisan', 'dena', 'dena-plus', 'paykan-pickup', 'rana', 'rira', 'samand', 'tara']);
    for (const v of plan.vehicles.filter((x) => x.existingId)) expect(v.name).toBe(db.vehicles.find((x) => x.id === v.existingId)!.name);
    // Make-level rows are never listed in the finder.
    for (const slug of ['peugeot', 'renault', 'suzuki', 'haima', 'dongfeng', 'electric-vehicles', 'safir', 'rd']) expect(reused).not.toContain(slug);
    const sourceKind = (ref: string) => dataset.sources[ref]!.kind;
    for (const m of plan.models.filter((x) => x.yearFrom !== null)) {
      const years = dataset.vehicles.flatMap((v) => v.models).find((x) => x.key === m.key)!.years!;
      expect(sourceKind(years.source.ref), m.key).toBe('official');
    }
    expect(plan.equivalences.map((e) => [e.key, e.legacyVehicleId, e.legacyModelId])).toEqual([['eq.peugeot-2008', 'v-peugeot', 'm-2008']]);
    const tondar = plan.vehicles.find((v) => v.key === 'ikco.renault-tondar-90')!;
    expect(tondar.groupIds.sort()).toEqual(['g-ikco', 'g-saipa']);
    expect(tondar.makeFa).toBe('رنو');
  });

  it('a second run plans nothing new', () => {
    const first = planVehicleImport(dataset, live());
    const second = planVehicleImport(dataset, applied(live(), first));
    expect(second.counts).toMatchObject({ new: 0, matched: 0, conflict: 0, duplicate: 0 });
    expect(second.vehicles.every((v) => v.existingId)).toBe(true);
    expect(second.models.every((m) => m.existingId)).toBe(true);
  });
});

describe('import rules', () => {
  const base = { version: 1 as const, market: 'IR' as const, generatedOn: '2026-10-25', sources: {
    off: { url: 'https://example.com/a', title: 'Official', publisher: 'Maker', kind: 'official' as const, market: 'IR', checkedOn: '2026-10-25' },
    sec: { url: 'https://example.com/b', title: 'Wiki', publisher: 'Wiki', kind: 'secondary' as const, market: 'IR', checkedOn: '2026-10-25' },
  } };
  const vehicle = (over: Record<string, unknown>) => ({ key: 'x.v', groups: ['IKCO'], name: { fa: 'خودرو تست', en: 'Test car' }, make: null, status: 'official', sources: [{ ref: 'off', claim: 'listed' }], ...over });
  const plan = (vehicles: unknown[], db = live()) => planVehicleImport(vehicleDatasetSchema.parse({ ...base, vehicles }), db);
  const kinds = (p: ReturnType<typeof plan>) => p.report.map((r) => `${r.kind}:${r.entity}:${r.key}`);

  it('never reuses an existing row by a similar name: an unnamed same-name vehicle is a conflict', () => {
    const p = plan([vehicle({ key: 'x.samand', name: { fa: 'سمند', en: 'Samand' } })]);
    expect(kinds(p)).toEqual(['conflict:vehicle:x.samand']);
    expect(p.vehicles).toEqual([]);
  });

  it('reports duplicates in the dataset (same key or same normalized name) and imports one', () => {
    const p = plan([vehicle({ key: 'x.a' }), vehicle({ key: 'x.a', name: { fa: 'دیگری', en: 'Other' } }), vehicle({ key: 'x.b', name: { fa: 'خودرو‌تست', en: 'Test car 2' } })]);
    expect(p.counts.duplicate).toBe(2);
    expect(p.vehicles.map((v) => v.key)).toEqual(['x.a']);
  });

  it('drops secondary-source years, rejects mixed calendars and does not import records needing review', () => {
    const p = plan([
      vehicle({ models: [{ key: 'x.v.m', name: { fa: 'تیپ', en: 'Trim' }, years: { from: 1390, to: 1395, calendar: 'jalali', source: { ref: 'sec', claim: 'years' } }, status: 'official', sources: [{ ref: 'off', claim: 'x' }] }] }),
      vehicle({ key: 'x.r', name: { fa: 'بررسی', en: 'Review' }, status: 'needs_review' }),
    ]);
    expect(p.models[0]).toMatchObject({ yearFrom: null, yearTo: null, yearCalendar: null });
    expect(kinds(p)).toEqual(expect.arrayContaining(['uncertain:years:x.v.m', 'uncertain:vehicle:x.r']));
    expect(p.vehicles.map((v) => v.key)).toEqual(['x.v']);
    const mixed = vehicleDatasetSchema.safeParse({ ...base, vehicles: [vehicle({ models: [{ key: 'x.v.m', name: { fa: 'تیپ', en: 'Trim' }, years: { from: 1390, to: 2015, calendar: 'jalali', source: { ref: 'off', claim: 'y' } }, status: 'official', sources: [{ ref: 'off', claim: 'x' }] }] })] });
    expect(mixed.success).toBe(false);
  });

  it('an unknown source, group or older row is a conflict, and an uncertain equivalence is not imported', () => {
    const p = plan([
      vehicle({ key: 'x.s', sources: [{ ref: 'missing', claim: 'x' }] }),
      vehicle({ key: 'x.e', name: { fa: 'هم‌ارز', en: 'Eq' }, equivalences: [
        { key: 'eq.gone', model: null, legacy: { vehicleSlug: 'peugeot', modelSlug: 'nope' }, status: 'confirmed', note: 'n' },
        { key: 'eq.maybe', model: null, legacy: { vehicleSlug: 'suzuki', modelSlug: 'model-mv95iiyj' }, status: 'uncertain', note: 'n' },
      ] }),
    ]);
    expect(kinds(p)).toEqual(expect.arrayContaining(['conflict:source:x.s', 'conflict:equivalence:eq.gone', 'uncertain:equivalence:eq.maybe']));
    expect(p.equivalences).toEqual([]);
  });
});
