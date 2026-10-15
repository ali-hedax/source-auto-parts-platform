import { buildSearchDocument } from '@hedax/domain';
import type { Tx } from '../../common/prisma.service.js';

/**
 * Rebuilds a product's search text: names, aliases, SKU, technical codes and the vehicles it fits
 * («لنت دنا» finds brake pads for Dena; «پژو ۲۰۶» finds parts for that model and for Peugeot as a whole).
 */
export async function rebuildProductSearch(tx: Tx, productId: string): Promise<void> {
  const p = await tx.product.findUniqueOrThrow({
    where: { id: productId },
    include: { translations: true, vehicles: { include: { vehicle: true, model: true } } },
  });
  const fitment = p.vehicles.flatMap((link) => [
    link.vehicle.name,
    link.vehicle.nameEn,
    ...(link.model ? [`${link.vehicle.name} ${link.model.name}`, link.model.nameEn ? `${link.vehicle.nameEn ?? ''} ${link.model.nameEn}` : null] : []),
  ]);
  const doc = buildSearchDocument([...p.translations.flatMap((t) => [t.name, ...t.aliases]), p.sku, ...p.oemCodes, ...fitment]);
  await tx.product.update({ where: { id: productId }, data: { searchText: doc.text, searchCompact: doc.compact } });
}
