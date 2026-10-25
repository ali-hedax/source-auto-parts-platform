import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { scriptPrisma } from './base-data.js';
import { type VehicleImportPlan, planVehicleImport, vehicleDatasetSchema } from './vehicle-dataset.js';

/**
 * Iran-market vehicle dataset import (home-page vehicle finder).
 *
 *   node dist/database/import-vehicles.js --file <dataset.json> --report <dir>            dry run (default)
 *   node dist/database/import-vehicles.js --file <dataset.json> --report <dir> --apply    write
 *
 * The dry run writes report.json and report.md (new / matched / unchanged / duplicate / conflict /
 * uncertain) without changing anything. --apply runs the same plan in one transaction; a second run
 * creates nothing. It never links vehicles to products, never renames or deletes rows and never
 * touches prices or stock. With APP_ENV=production it refuses unless
 * HEDAX_VEHICLE_IMPORT_PRODUCTION=approved (an explicit owner decision).
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function markdown(plan: VehicleImportPlan, file: string, applied: boolean): string {
  const lines = [`# Vehicle dataset ${applied ? 'import' : 'dry run'}`, '', `Dataset: \`${path.basename(file)}\` · ${new Date().toISOString()}`, '',
    '| kind | count |', '| --- | --- |', ...Object.entries(plan.counts).map(([k, n]) => `| ${k} | ${n} |`), ''];
  for (const kind of ['conflict', 'uncertain', 'duplicate', 'new', 'matched', 'unchanged'] as const) {
    const rows = plan.report.filter((r) => r.kind === kind);
    if (!rows.length) continue;
    lines.push(`## ${kind} (${rows.length})`, '', '| entity | key | name | detail |', '| --- | --- | --- | --- |');
    for (const r of rows) lines.push(`| ${r.entity} | ${r.key} | ${r.name ?? ''} | ${r.detail.replace(/\|/g, '\\|')} |`);
    lines.push('');
  }
  return lines.join('\n');
}

async function main() {
  const file = arg('--file');
  const reportDir = arg('--report');
  const apply = process.argv.includes('--apply');
  if (!file || !reportDir) throw new Error('usage: import-vehicles --file <dataset.json> --report <dir> [--apply]');
  if (apply && process.env.APP_ENV === 'production' && process.env.HEDAX_VEHICLE_IMPORT_PRODUCTION !== 'approved') {
    throw new Error('refused: APP_ENV=production needs HEDAX_VEHICLE_IMPORT_PRODUCTION=approved (owner approval)');
  }
  const dataset = vehicleDatasetSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  const prisma = scriptPrisma();
  try {
    const [groups, vehicles, models, equivalences] = await Promise.all([
      prisma.vehicleBrand.findMany({ select: { id: true, code: true } }),
      prisma.vehicle.findMany({ select: { id: true, slug: true, name: true, nameEn: true, nameKey: true, dataKey: true, makeFa: true, finderVisible: true, finderGroups: { select: { vehicleBrandId: true } } } }),
      prisma.vehicleModel.findMany({ select: { id: true, vehicleId: true, slug: true, name: true, nameKey: true, dataKey: true } }),
      prisma.vehicleEquivalence.findMany({ select: { dataKey: true } }),
    ]);
    const plan = planVehicleImport(dataset, { groups, vehicles: vehicles.map(({ finderGroups, ...v }) => ({ ...v, groupIds: finderGroups.map((g) => g.vehicleBrandId) })), models, equivalenceKeys: equivalences.map((e) => e.dataKey) });
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(path.join(reportDir, 'report.json'), JSON.stringify({ applied: apply, counts: plan.counts, report: plan.report }, null, 1));
    writeFileSync(path.join(reportDir, 'report.md'), markdown(plan, file, apply));
    process.stdout.write(`${apply ? 'import' : 'dry run'}: ${JSON.stringify(plan.counts)}\n`);
    if (!apply) return;

    await prisma.$transaction(async (tx) => {
      const vehicleId = new Map<string, string>();
      for (const v of plan.vehicles) {
        const fields = { makeFa: v.makeFa, makeEn: v.makeEn, aliases: v.aliases, finderVisible: true, dataKey: v.key, dataStatus: v.status, ...(v.setNameEn ? { nameEn: v.nameEn } : {}) };
        const row = v.existingId
          ? await tx.vehicle.update({ where: { id: v.existingId }, data: fields, select: { id: true } })
          : await tx.vehicle.create({ data: { ...fields, name: v.name, nameKey: v.nameKey, slug: v.slug, active: true }, select: { id: true } });
        vehicleId.set(v.key, row.id);
        // The dataset decides the finder groups of its own vehicles (finder metadata only).
        await tx.vehicleFinderGroup.deleteMany({ where: { vehicleId: row.id, vehicleBrandId: { notIn: v.groupIds } } });
        await tx.vehicleFinderGroup.createMany({ data: v.groupIds.map((g) => ({ vehicleId: row.id, vehicleBrandId: g })), skipDuplicates: true });
      }
      const modelId = new Map<string, string>();
      for (const m of plan.models) {
        const fields = {
          nameEn: m.nameEn, sortOrder: m.sortOrder, aliases: m.aliases, supply: m.supply, supplierFa: m.supplierFa, supplierEn: m.supplierEn,
          yearFrom: m.yearFrom, yearTo: m.yearTo, yearCalendar: m.yearCalendar, dataKey: m.key, dataStatus: m.status,
        };
        const row = m.existingId
          ? await tx.vehicleModel.update({ where: { id: m.existingId }, data: fields, select: { id: true } })
          : await tx.vehicleModel.create({ data: { ...fields, vehicleId: vehicleId.get(m.vehicleKey)!, name: m.name, nameKey: m.nameKey, slug: m.slug, active: true }, select: { id: true } });
        modelId.set(m.key, row.id);
      }
      for (const s of plan.sources) {
        const data = {
          vehicleId: s.vehicleKey ? vehicleId.get(s.vehicleKey)! : null, modelId: s.modelKey ? modelId.get(s.modelKey)! : null,
          url: s.url, title: s.title.slice(0, 240), market: s.market, checkedOn: new Date(`${s.checkedOn}T00:00:00Z`), status: s.status, claim: s.claim,
        };
        await tx.vehicleSource.upsert({ where: { sourceKey: s.sourceKey }, update: data, create: { ...data, sourceKey: s.sourceKey } });
      }
      for (const e of plan.equivalences) {
        const data = { vehicleId: vehicleId.get(e.vehicleKey)!, modelId: e.modelKey ? modelId.get(e.modelKey)! : null, legacyVehicleId: e.legacyVehicleId, legacyModelId: e.legacyModelId, note: e.note };
        await tx.vehicleEquivalence.upsert({ where: { dataKey: e.key }, update: data, create: { ...data, dataKey: e.key } });
      }
      await tx.auditLog.create({ data: { actorKind: 'SYSTEM', action: 'vehicles.dataset_imported', entityType: 'vehicle_dataset', entityId: dataset.generatedOn, after: { file: path.basename(file), counts: plan.counts } } });
    }, { timeout: 300_000 });
    process.stdout.write('applied\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
