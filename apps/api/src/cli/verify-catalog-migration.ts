import { partNumberKey } from '@hedax/domain';
import { scriptPrisma } from '../database/base-data.js';
import type { Tx } from '../common/prisma.service.js';
import { rebuildProductSearch } from '../modules/catalog/product-search.js';

/** One line of output (CLI scripts write to stdout, never through console). */
const out = (...parts: unknown[]) => process.stdout.write(`${parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p, null, 2))).join(' ')}\n`);

/**
 * Migration check after «قطعه» became one concept (technical catalog entries → parts).
 *
 *   docker compose ... run --rm tools node dist/cli/verify-catalog-migration.js
 *
 * Compares, entry by entry, the technical catalog (catalog_entry*, left untouched) with the parts it
 * became: every entry has a part; its numbers, fitment, vehicle brands and photos are on that part;
 * published entries are published parts (new ones). It also finishes two things the SQL migration
 * could only approximate, with the application's own functions: the search text of those parts, and
 * the normalized key of every main technical number. Exit code 0 = all matches, 1 = differences found.
 */
async function main(): Promise<void> {
  const prisma = scriptPrisma();
  const problems: string[] = [];
  try {
    const [entries, mapped] = await Promise.all([
      prisma.catalogEntry.findMany({ include: { numbers: true, vehicles: true, vehicleBrands: true, images: true } }),
      prisma.catalogEntryMigration.findMany(),
    ]);
    const byEntry = new Map(mapped.map((m) => [m.entryId, m]));
    let checked = 0;
    for (const e of entries) {
      const m = byEntry.get(e.id);
      if (!m) { problems.push(`entry ${e.partNumber} (${e.id}) has no part`); continue; }
      const p = await prisma.product.findUnique({
        where: { id: m.productId },
        include: { numbers: true, vehicles: true, vehicleBrands: true, media: { where: { deletedAt: null } }, translations: true },
      });
      if (!p) { problems.push(`entry ${e.partNumber}: part ${m.productId} is missing`); continue; }
      const keys = new Set([p.partNumberKey, ...p.numbers.map((n) => n.numberKey), ...p.oemCodes.map(partNumberKey)]);
      if (!keys.has(e.partNumberKey)) problems.push(`entry ${e.partNumber}: its number is not on part ${p.sku}`);
      for (const n of e.numbers) if (!keys.has(n.numberKey)) problems.push(`entry ${e.partNumber}: number ${n.number} is not on part ${p.sku}`);
      for (const v of e.vehicles) {
        if (!p.vehicles.some((x) => x.vehicleId === v.vehicleId && x.modelId === v.modelId)) problems.push(`entry ${e.partNumber}: a fitment is not on part ${p.sku}`);
      }
      for (const b of e.vehicleBrands) if (!p.vehicleBrands.some((x) => x.vehicleBrandId === b.vehicleBrandId)) problems.push(`entry ${e.partNumber}: a vehicle brand is not on part ${p.sku}`);
      for (const i of e.images) if (!p.media.some((x) => x.storageKey === i.storageKey)) problems.push(`entry ${e.partNumber}: a photo is not on part ${p.sku}`);
      if (!m.merged && (e.status === 'PUBLISHED') !== p.published) problems.push(`entry ${e.partNumber}: published state differs on part ${p.sku}`);
      if (!p.translations.some((t) => t.locale === 'fa')) problems.push(`entry ${e.partNumber}: part ${p.sku} has no Persian name`);
      checked += 1;
    }

    // Search text of the migrated parts, written with the application's normalizer.
    const ids = [...new Set(mapped.map((m) => m.productId))];
    for (const id of ids) await prisma.$transaction((tx) => rebuildProductSearch(tx as unknown as Tx, id));

    // Main technical numbers whose key differs from partNumberKey (the SQL backfill only knew Latin codes).
    let rekeyed = 0;
    let rekeyConflicts = 0;
    const withNumber = await prisma.product.findMany({ where: { partNumber: { not: null } }, select: { id: true, partNumber: true, partNumberKey: true, manufacturerBrandId: true } });
    for (const p of withNumber) {
      const key = partNumberKey(p.partNumber as string) || null;
      if (key === p.partNumberKey) continue;
      const clash = key ? await prisma.product.findFirst({ where: { partNumberKey: key, manufacturerBrandId: p.manufacturerBrandId, id: { not: p.id } }, select: { sku: true } }) : null;
      if (clash) { rekeyConflicts += 1; problems.push(`part ${p.id}: technical number ${p.partNumber} is also on ${clash.sku} (same manufacturer); left unchanged`); continue; }
      await prisma.product.update({ where: { id: p.id }, data: { partNumberKey: key } });
      rekeyed += 1;
    }

    const merged = mapped.filter((m) => m.merged).length;
    const report = {
      catalogEntries: entries.length,
      migrated: mapped.length,
      mergedIntoExistingParts: merged,
      newParts: mapped.length - merged,
      entriesChecked: checked,
      searchTextRebuilt: ids.length,
      technicalNumberKeysFixed: rekeyed,
      technicalNumberKeyConflicts: rekeyConflicts,
      differences: problems.length,
    };
    out(JSON.stringify(report, null, 2));
    for (const p of problems.slice(0, 200)) out(`- ${p}`);
    if (problems.length > 200) out(`… ${problems.length - 200} more`);
    out(problems.length ? 'RESULT: differences found (see the list above)' : 'RESULT: OK — every catalog entry is a part with its numbers, fitment, brands and photos');
    process.exitCode = problems.length ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  out(e instanceof Error ? e.message : e);
  process.exit(2);
});
