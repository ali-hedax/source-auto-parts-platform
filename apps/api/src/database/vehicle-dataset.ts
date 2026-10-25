import { vehicleKey, vehicleSlug } from '@hedax/domain';
import { z } from 'zod';

/**
 * The reviewed Iran-market vehicle dataset (database/datasets/vehicles) and the import plan made from
 * it. Pure: the plan is computed from the dataset and a snapshot of the current rows, so the dry-run
 * report and the import use the same decisions, and a second run plans no new rows.
 *
 * Rules (owner, 2026-10-25): existing ids, slugs, names and product links are kept; a dataset vehicle
 * reuses an existing row only when it names it (`existing.slug`); records still needing review are
 * reported, not imported; model years are imported only when their cited source is official; years
 * stay in their own calendar.
 */

const GROUPS = ['IKCO', 'SAIPA', 'TOYOTA', 'HYUNDAI'] as const;
const key = z.string().regex(/^[a-z0-9][a-z0-9.-]{1,150}$/);
const localized = z.object({ fa: z.string().trim().min(1).max(80), en: z.string().trim().min(1).max(80) });
const sourceRef = z.object({ ref: z.string().min(1).max(80), claim: z.string().trim().min(1).max(300), page: z.string().trim().max(60).optional() });
const status = z.enum(['official', 'secondary', 'needs_review']);
const years = z.object({ from: z.number().int(), to: z.number().int(), calendar: z.enum(['jalali', 'gregorian']), source: sourceRef })
  .refine((y) => y.from <= y.to, { message: 'YEARS_REVERSED' })
  .refine((y) => (y.calendar === 'jalali' ? y.from >= 1300 && y.to <= 1499 : y.from >= 1900 && y.to <= 2100), { message: 'YEAR_OUTSIDE_CALENDAR' });

export const vehicleDatasetSchema = z.object({
  version: z.literal(1),
  market: z.literal('IR'),
  generatedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sources: z.record(z.string(), z.object({
    url: z.string().url().max(600),
    title: z.string().trim().min(1).max(240),
    publisher: z.string().trim().min(1).max(120),
    kind: z.enum(['official', 'secondary']),
    market: z.string().max(20),
    checkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })),
  vehicles: z.array(z.object({
    key,
    groups: z.array(z.enum(GROUPS)).min(1).max(4),
    name: localized,
    aliases: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    /** The original make; null when no cited source states it (reported, never guessed). */
    make: localized.nullable(),
    existing: z.object({ slug: z.string().min(1).max(80) }).optional(),
    status,
    note: z.string().max(400).optional(),
    sources: z.array(sourceRef).min(1),
    models: z.array(z.object({
      key,
      name: localized,
      aliases: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
      supply: z.enum(['domestic', 'assembled', 'imported']).nullable().default(null),
      supplier: localized.nullable().default(null),
      years: years.nullable().default(null),
      status,
      note: z.string().max(400).optional(),
      sources: z.array(sourceRef).min(1),
    })).default([]),
    equivalences: z.array(z.object({
      key,
      model: key.nullable().default(null),
      legacy: z.object({ vehicleSlug: z.string().min(1).max(80), modelSlug: z.string().min(1).max(80).nullable().default(null) }),
      status: z.enum(['confirmed', 'uncertain']),
      note: z.string().trim().min(1).max(300),
    })).default([]),
  })),
});
export type VehicleDataset = z.infer<typeof vehicleDatasetSchema>;

/** The current rows the plan is compared with. */
export interface VehicleSnapshot {
  groups: Array<{ id: string; code: string }>;
  vehicles: Array<{ id: string; slug: string; name: string; nameEn: string | null; nameKey: string; dataKey: string | null; groupIds: string[]; makeFa: string | null; finderVisible: boolean }>;
  models: Array<{ id: string; vehicleId: string; slug: string; name: string; nameKey: string; dataKey: string | null }>;
  /** Data keys of equivalences already imported (reported as unchanged on a re-run). */
  equivalenceKeys?: string[];
}

export type ReportKind = 'new' | 'matched' | 'unchanged' | 'duplicate' | 'conflict' | 'uncertain';
export interface ReportItem { kind: ReportKind; entity: 'vehicle' | 'model' | 'equivalence' | 'years' | 'source'; key: string; name?: string; detail: string }

export interface PlannedVehicle {
  key: string; existingId: string | null; groupIds: string[]; name: string; nameEn: string; nameKey: string; slug: string;
  makeFa: string | null; makeEn: string | null; aliases: string[]; status: 'official' | 'secondary'; setNameEn: boolean;
}
export interface PlannedModel {
  key: string; vehicleKey: string; existingId: string | null; name: string; nameEn: string; nameKey: string; slug: string; sortOrder: number;
  aliases: string[]; supply: string | null; supplierFa: string | null; supplierEn: string | null;
  yearFrom: number | null; yearTo: number | null; yearCalendar: string | null; status: 'official' | 'secondary';
}
export interface PlannedSource { sourceKey: string; vehicleKey: string | null; modelKey: string | null; url: string; title: string; market: string; checkedOn: string; status: 'official' | 'secondary'; claim: string }
export interface PlannedEquivalence { key: string; vehicleKey: string; modelKey: string | null; legacyVehicleId: string; legacyModelId: string | null; note: string }
export interface VehicleImportPlan {
  vehicles: PlannedVehicle[]; models: PlannedModel[]; sources: PlannedSource[]; equivalences: PlannedEquivalence[];
  report: ReportItem[];
  counts: Record<ReportKind, number>;
}

const modelSlug = (en: string, fallback: string) => vehicleSlug(en, fallback);

export function planVehicleImport(dataset: VehicleDataset, db: VehicleSnapshot): VehicleImportPlan {
  const report: ReportItem[] = [];
  const add = (item: ReportItem) => report.push(item);
  const groupId = new Map(db.groups.map((g) => [g.code, g.id]));
  const byDataKey = new Map(db.vehicles.filter((v) => v.dataKey).map((v) => [v.dataKey!, v]));
  const bySlug = new Map(db.vehicles.map((v) => [v.slug, v]));
  const byNameKey = new Map(db.vehicles.map((v) => [v.nameKey, v]));
  const modelByDataKey = new Map(db.models.filter((m) => m.dataKey).map((m) => [m.dataKey!, m]));
  const vehicles: PlannedVehicle[] = [];
  const models: PlannedModel[] = [];
  const sources: PlannedSource[] = [];
  const equivalences: PlannedEquivalence[] = [];
  const seenKeys = new Set<string>();
  const seenNames = new Map<string, string>();
  const takenSlugs = new Set(db.vehicles.map((v) => v.slug));
  const claimed = new Set<string>();
  const sourceOf = (ref: string) => dataset.sources[ref];

  for (const v of dataset.vehicles) {
    const nameKey = vehicleKey(v.name.fa);
    if (seenKeys.has(v.key)) { add({ kind: 'duplicate', entity: 'vehicle', key: v.key, name: v.name.fa, detail: 'Same dataset key appears twice; the later entry is ignored.' }); continue; }
    seenKeys.add(v.key);
    if (seenNames.has(nameKey)) { add({ kind: 'duplicate', entity: 'vehicle', key: v.key, name: v.name.fa, detail: `Same normalized name as ${seenNames.get(nameKey)}; ignored.` }); continue; }
    seenNames.set(nameKey, v.key);
    if (v.status === 'needs_review') { add({ kind: 'uncertain', entity: 'vehicle', key: v.key, name: v.name.fa, detail: `Not imported: ${v.note ?? 'Iran-market presence not confirmed by a cited source.'}` }); continue; }
    const missingRef = [...v.sources, ...v.models.flatMap((m) => [...m.sources, ...(m.years ? [m.years.source] : [])])].find((s) => !sourceOf(s.ref));
    if (missingRef) { add({ kind: 'conflict', entity: 'source', key: v.key, name: v.name.fa, detail: `Unknown source reference "${missingRef.ref}"; vehicle skipped.` }); continue; }
    const groupIds = [...new Set(v.groups)].map((g) => groupId.get(g));
    if (groupIds.some((g) => !g)) { add({ kind: 'conflict', entity: 'vehicle', key: v.key, name: v.name.fa, detail: `Group ${v.groups.join('/')} does not exist; skipped.` }); continue; }
    const group = groupIds as string[];

    // Which row: the one with this data key, else the existing row the dataset names, else a new row.
    let existing = byDataKey.get(v.key) ?? null;
    if (!existing && v.existing) {
      existing = bySlug.get(v.existing.slug) ?? null;
      if (!existing) { add({ kind: 'conflict', entity: 'vehicle', key: v.key, name: v.name.fa, detail: `Existing slug "${v.existing.slug}" not found; skipped.` }); continue; }
      if (existing.dataKey && existing.dataKey !== v.key) { add({ kind: 'conflict', entity: 'vehicle', key: v.key, name: v.name.fa, detail: `Row "${existing.slug}" already belongs to ${existing.dataKey}; skipped.` }); continue; }
    }
    if (existing && claimed.has(existing.id)) { add({ kind: 'duplicate', entity: 'vehicle', key: v.key, name: v.name.fa, detail: `Row "${existing.slug}" is already used by another dataset vehicle; skipped.` }); continue; }
    if (!existing) {
      const sameName = byNameKey.get(nameKey);
      if (sameName) { add({ kind: 'conflict', entity: 'vehicle', key: v.key, name: v.name.fa, detail: `An existing vehicle "${sameName.name}" (${sameName.slug}) has the same normalized name; name it in "existing" to reuse it. Skipped.` }); continue; }
    }
    if (existing && existing.nameKey !== nameKey) add({ kind: 'conflict', entity: 'vehicle', key: v.key, name: v.name.fa, detail: `Existing name "${existing.name}" differs; the existing name is kept (renames need approval).` });
    let slug = existing?.slug ?? vehicleSlug(v.name.en, `vehicle-${v.key.replace(/\./g, '-')}`.slice(0, 80));
    if (!existing && takenSlugs.has(slug)) {
      const alt = `${slug}-${v.groups[0]!.toLowerCase()}`.slice(0, 80);
      if (takenSlugs.has(alt)) { add({ kind: 'conflict', entity: 'vehicle', key: v.key, name: v.name.fa, detail: `Slug "${slug}" is taken; skipped.` }); continue; }
      slug = alt;
    }
    takenSlugs.add(slug);
    if (existing) claimed.add(existing.id);
    const planned: PlannedVehicle = {
      key: v.key, existingId: existing?.id ?? null, groupIds: group, name: existing?.name ?? v.name.fa, nameEn: v.name.en, nameKey: existing?.nameKey ?? nameKey, slug,
      makeFa: v.make?.fa ?? null, makeEn: v.make?.en ?? null, aliases: [...new Set(v.aliases)], status: v.status, setNameEn: !existing || !existing.nameEn,
    };
    vehicles.push(planned);
    const unchanged = existing && existing.dataKey === v.key && [...existing.groupIds].sort().join() === [...group].sort().join() && existing.makeFa === (v.make?.fa ?? null) && existing.finderVisible;
    if (!v.make) add({ kind: 'uncertain', entity: 'vehicle', key: v.key, name: v.name.fa, detail: 'Make not stated by a cited source; imported without a make.' });
    add({ kind: !existing ? 'new' : unchanged ? 'unchanged' : 'matched', entity: 'vehicle', key: v.key, name: v.name.fa, detail: !existing ? `New vehicle "${slug}" under ${v.groups.join(' + ')}.` : `Existing "${existing.slug}" ${unchanged ? 'already imported' : 'gets group, make and finder listing (name, slug and links kept)'}.` });
    for (const s of v.sources) {
      const src = sourceOf(s.ref)!;
      sources.push({ sourceKey: `${v.key}#${s.ref}`, vehicleKey: v.key, modelKey: null, url: src.url, title: s.page ? `${src.title} — ${s.page}` : src.title, market: src.market, checkedOn: src.checkedOn, status: src.kind, claim: s.claim });
    }

    const existingModels = db.models.filter((m) => existing && m.vehicleId === existing.id);
    const modelNames = new Set<string>();
    const modelSlugs = new Set(existingModels.map((m) => m.slug));
    v.models.forEach((m, index) => {
      const mKey = vehicleKey(m.name.fa);
      if (seenKeys.has(m.key)) { add({ kind: 'duplicate', entity: 'model', key: m.key, name: `${v.name.fa} ${m.name.fa}`, detail: 'Same dataset key appears twice; ignored.' }); return; }
      seenKeys.add(m.key);
      if (modelNames.has(mKey)) { add({ kind: 'duplicate', entity: 'model', key: m.key, name: `${v.name.fa} ${m.name.fa}`, detail: 'Same normalized model name twice under this vehicle; ignored.' }); return; }
      modelNames.add(mKey);
      if (m.status === 'needs_review') { add({ kind: 'uncertain', entity: 'model', key: m.key, name: `${v.name.fa} ${m.name.fa}`, detail: `Not imported: ${m.note ?? 'not confirmed by a cited source.'}` }); return; }
      const prev = modelByDataKey.get(m.key) ?? existingModels.find((x) => x.nameKey === mKey) ?? null;
      if (prev && prev.dataKey !== null && prev.dataKey !== m.key) { add({ kind: 'conflict', entity: 'model', key: m.key, name: `${v.name.fa} ${m.name.fa}`, detail: `Model row already belongs to ${prev.dataKey}; skipped.` }); return; }
      if (prev && !prev.dataKey) { add({ kind: 'conflict', entity: 'model', key: m.key, name: `${v.name.fa} ${m.name.fa}`, detail: `An existing model "${prev.name}" has the same name and no data key; review before reuse. Skipped.` }); return; }
      let yearsOk = m.years;
      if (m.years && sourceOf(m.years.source.ref)?.kind !== 'official') {
        add({ kind: 'uncertain', entity: 'years', key: m.key, name: `${v.name.fa} ${m.name.fa}`, detail: `Years ${m.years.from}–${m.years.to} (${m.years.calendar}) only from a secondary source; not imported.` });
        yearsOk = null;
      }
      let mSlug = prev?.slug ?? modelSlug(m.name.en, `model-${index + 1}`);
      if (!prev) { let n = 2; const base = mSlug; while (modelSlugs.has(mSlug)) mSlug = `${base}-${n++}`.slice(0, 80); }
      modelSlugs.add(mSlug);
      models.push({
        key: m.key, vehicleKey: v.key, existingId: prev?.id ?? null, name: prev?.name ?? m.name.fa, nameEn: m.name.en, nameKey: prev?.nameKey ?? mKey, slug: mSlug, sortOrder: index,
        aliases: [...new Set(m.aliases)], supply: m.supply, supplierFa: m.supplier?.fa ?? null, supplierEn: m.supplier?.en ?? null,
        yearFrom: yearsOk?.from ?? null, yearTo: yearsOk?.to ?? null, yearCalendar: yearsOk?.calendar ?? null, status: m.status,
      });
      add({ kind: prev ? (prev.dataKey === m.key ? 'unchanged' : 'matched') : 'new', entity: 'model', key: m.key, name: `${v.name.fa} ${m.name.fa}`, detail: `${prev ? 'Updated' : 'New'} model${yearsOk ? `, years ${yearsOk.from}–${yearsOk.to} (${yearsOk.calendar})` : ', no confirmed years'}.` });
      for (const s of [...m.sources, ...(yearsOk ? [yearsOk.source] : [])]) {
        const src = sourceOf(s.ref)!;
        const sourceKey = `${m.key}#${s.ref}${s === yearsOk?.source ? '#years' : ''}`;
        if (!sources.some((x) => x.sourceKey === sourceKey)) sources.push({ sourceKey, vehicleKey: null, modelKey: m.key, url: src.url, title: s.page ? `${src.title} — ${s.page}` : src.title, market: src.market, checkedOn: src.checkedOn, status: src.kind, claim: s.claim });
      }
    });

    for (const e of v.equivalences) {
      if (e.status === 'uncertain') { add({ kind: 'uncertain', entity: 'equivalence', key: e.key, name: v.name.fa, detail: `Not imported: ${e.note}` }); continue; }
      const legacy = bySlug.get(e.legacy.vehicleSlug);
      const legacyModel = legacy && e.legacy.modelSlug ? db.models.find((m) => m.vehicleId === legacy.id && m.slug === e.legacy.modelSlug) : null;
      if (!legacy || (e.legacy.modelSlug && !legacyModel)) { add({ kind: 'conflict', entity: 'equivalence', key: e.key, name: v.name.fa, detail: `Older row ${e.legacy.vehicleSlug}/${e.legacy.modelSlug ?? '-'} not found; skipped.` }); continue; }
      if (e.model && !models.some((m) => m.key === e.model)) { add({ kind: 'conflict', entity: 'equivalence', key: e.key, name: v.name.fa, detail: `Model ${e.model} is not imported; skipped.` }); continue; }
      equivalences.push({ key: e.key, vehicleKey: v.key, modelKey: e.model, legacyVehicleId: legacy.id, legacyModelId: legacyModel?.id ?? null, note: e.note });
      add({ kind: db.equivalenceKeys?.includes(e.key) ? 'unchanged' : 'matched', entity: 'equivalence', key: e.key, name: v.name.fa, detail: `Parts linked to ${legacy.name}${legacyModel ? ` / ${legacyModel.name}` : ''} are shown for this ${e.model ? 'model' : 'vehicle'}: ${e.note}` });
    }
  }
  const counts = { new: 0, matched: 0, unchanged: 0, duplicate: 0, conflict: 0, uncertain: 0 } as Record<ReportKind, number>;
  for (const r of report) counts[r.kind]++;
  return { vehicles, models, sources, equivalences, report, counts };
}
