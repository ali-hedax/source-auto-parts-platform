import { randomUUID } from 'node:crypto';
import { partNumberKey } from '@hedax/domain';
import { conflict } from '../../common/errors.js';
import type { Tx } from '../../common/prisma.service.js';

/**
 * Technical numbers of a part («قطعه»): the main number (unique per manufacturer brand, compared by
 * partNumberKey: spaces, dashes, dots, case and Persian digits do not matter) and the equivalent and
 * replacement numbers. Shared by the part form, the Excel import and the brand database import.
 */

/** Refuses a main number another part of the same manufacturer already has. */
export async function assertPartNumberFree(tx: Tx, key: string, manufacturerBrandId: string | null, exceptId?: string): Promise<void> {
  const clash = await tx.product.findFirst({
    where: { partNumberKey: key, manufacturerBrandId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true, sku: true, partNumber: true, translations: { where: { locale: 'fa' }, select: { name: true } } },
  });
  if (clash) {
    throw conflict('PART_NUMBER_EXISTS', 'Another part of this manufacturer has this technical number', {
      id: clash.id, sku: clash.sku, partNumber: clash.partNumber, nameFa: clash.translations[0]?.name ?? null,
    });
  }
}

/** A free SKU made from the technical number («0450-102-805» → «0450-102-805»), with a suffix when taken. */
export async function skuFromPartNumber(tx: Tx, partNumber: string | null, prefix?: string | null): Promise<string> {
  const latin = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const clean = (s: string) => latin(s).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const head = prefix ? clean(prefix).slice(0, 12) : '';
  const body = partNumber ? clean(partNumber) : '';
  const base = ([head, body].filter(Boolean).join('-') || `P-${randomUUID().slice(0, 8).toUpperCase()}`).slice(0, 56);
  for (let i = 0; i < 20; i += 1) {
    const sku = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await tx.product.findUnique({ where: { sku }, select: { id: true } }))) return sku;
  }
  return `${base}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

/** Other numbers without the main one and without repeats (first occurrence wins). */
export function otherNumbers(mainKey: string | null, equivalents: readonly string[], replacements: readonly string[]) {
  const seen = new Set(mainKey ? [mainKey] : []);
  const out: Array<{ number: string; numberKey: string; kind: 'EQUIVALENT' | 'REPLACEMENT'; sortOrder: number }> = [];
  for (const [kind, list] of [['EQUIVALENT', equivalents], ['REPLACEMENT', replacements]] as const) {
    for (const raw of list) {
      const number = raw.replace(/\s+/g, ' ').trim().slice(0, 80);
      const numberKey = partNumberKey(number);
      if (!numberKey || seen.has(numberKey)) continue;
      seen.add(numberKey);
      out.push({ number, numberKey, kind, sortOrder: out.length });
    }
  }
  return out;
}

/** Replaces the part's equivalent and replacement numbers. */
export async function setProductNumbers(tx: Tx, productId: string, mainKey: string | null, equivalents: readonly string[], replacements: readonly string[]): Promise<void> {
  await tx.productNumber.deleteMany({ where: { productId } });
  const rows = otherNumbers(mainKey, equivalents, replacements);
  if (rows.length) await tx.productNumber.createMany({ data: rows.map((r) => ({ ...r, productId })) });
}
