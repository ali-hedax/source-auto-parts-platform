import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp, { type OutputInfo } from 'sharp';
import type { AdminProductRow, ProductMediaView, ProductUpsert } from '@hedax/contracts';
import { DomainError, IMAGE_KINDS, buildSearchDocument, describePriceSource as describePrice, inspectFile, normalizeSearchText } from '@hedax/domain';
import type { z } from 'zod';
import type { mediaUpdateSchema, priceRuleSchema } from '@hedax/contracts';
import { AuditService } from '../../common/audit.service.js';
import { badRequest, conflict, notFound } from '../../common/errors.js';
import { Prisma, PrismaService, type Tx } from '../../common/prisma.service.js';
import { SCANNER, type MalwareScanner } from '../../common/storage/scanner.js';
import { STORAGE, type StorageDriver } from '../../common/storage/storage.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { PricingService } from '../pricing/pricing.service.js';
import { UnitsService, fromSteps, toSteps, unitRef } from './units.service.js';

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly pricing: PricingService,
    private readonly audit: AuditService,
    private readonly units: UnitsService,
    @Inject(STORAGE) private readonly storage: StorageDriver,
    @Inject(SCANNER) private readonly scanner: MalwareScanner,
  ) {}

  async list(q: { q?: string; published?: boolean; archived?: boolean; page: number; pageSize: number }): Promise<{ items: AdminProductRow[]; total: number }> {
    const warehouseId = await this.inventory.defaultWarehouseId();
    const where: Prisma.ProductWhereInput = {
      ...(q.archived ? { archivedAt: { not: null } } : { archivedAt: null }),
      ...(q.published === undefined ? {} : { published: q.published }),
      ...(q.q ? { OR: [{ sku: { contains: q.q, mode: 'insensitive' } }, { searchText: { contains: normalizeSearchText(q.q) } }] } : {}),
    };
    const [rows, total, rate] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { translations: true, category: true, salesUnit: true, basePrice: true, priceRules: { where: { active: true } }, inventory: { where: { warehouseId } } },
        orderBy: { updatedAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.product.count({ where }),
      this.pricing.currentRate(),
    ]);
    return {
      total,
      items: rows.map((p) => {
        const bal = p.inventory[0];
        return {
          id: p.id,
          sku: p.sku,
          nameFa: p.translations.find((t) => t.locale === 'fa')?.name ?? '',
          nameEn: p.translations.find((t) => t.locale === 'en')?.name ?? null,
          categoryName: p.category.nameFa,
          published: p.published,
          archived: !!p.archivedAt,
          basePrice: { currency: p.basePrice?.baseCurrency ?? 'IRR', amountMinor: (p.basePrice?.baseAmountMinor ?? 0n).toString() },
          priceSource: describePrice(this.pricing.resolve(p.basePrice, p.priceRules, 1, null, rate, p.salesUnit.stepMilli)),
          // Quantities in the product's unit (stored as steps of it).
          unit: unitRef(p.salesUnit),
          onHand: fromSteps(bal?.onHand ?? 0, p.salesUnit),
          reserved: fromSteps(bal?.reserved ?? 0, p.salesUnit),
          available: fromSteps((bal?.onHand ?? 0) - (bal?.reserved ?? 0), p.salesUnit),
          lowStockThreshold: fromSteps(bal?.lowStockThreshold ?? 0, p.salesUnit),
          version: p.version,
          updatedAt: p.updatedAt.toISOString(),
        };
      }),
    };
  }

  async get(id: string) {
    const warehouseId = await this.inventory.defaultWarehouseId();
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: {
        translations: true,
        vehicleBrands: true,
        salesUnit: true,
        media: { where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        basePrice: true,
        priceRules: { orderBy: [{ customerGroupId: 'asc' }, { minQty: 'asc' }] },
        inventory: { where: { warehouseId } },
        fitments: true,
      },
    });
    if (!p) throw notFound();
    const rate = await this.pricing.currentRate();
    const fa = p.translations.find((t) => t.locale === 'fa');
    const en = p.translations.find((t) => t.locale === 'en');
    const resolved = this.pricing.resolve(p.basePrice, p.priceRules, 1, null, rate, p.salesUnit.stepMilli);
    const u = p.salesUnit;
    return {
      id: p.id,
      sku: p.sku,
      slug: p.slug,
      nameFa: fa?.name ?? '',
      nameEn: en?.name ?? null,
      aliases: fa?.aliases ?? [],
      descriptionFa: fa?.description ?? null,
      descriptionEn: en?.description ?? null,
      warrantyFa: fa?.warranty ?? null,
      warrantyEn: en?.warranty ?? null,
      categoryId: p.categoryId,
      manufacturerBrandId: p.manufacturerBrandId,
      vehicleBrandIds: p.vehicleBrands.map((v) => v.vehicleBrandId),
      partType: p.partType,
      condition: p.condition,
      origin: p.origin,
      countryOfManufacture: p.countryOfManufacture,
      unitId: p.unitId,
      unit: { id: u.id, ...unitRef(u), active: u.active },
      packQuantity: p.packQuantity,
      oemCodes: p.oemCodes,
      specs: p.specs,
      published: p.published,
      archived: !!p.archivedAt,
      isSellable: p.isSellable,
      version: p.version,
      basePrice: p.basePrice
        ? {
            currency: p.basePrice.baseCurrency,
            amountMinor: p.basePrice.baseAmountMinor.toString(),
            manualIrr: p.basePrice.manualIrrMinor?.toString() ?? null,
            manualAed: p.basePrice.manualAedMinor?.toString() ?? null,
          }
        : null,
      /** Where the public payable price comes from, plus consistency warnings (spec §9.1). */
      priceExplanation: resolved.status === 'PRICED'
        ? { source: describePrice(resolved), unitPayableIrr: resolved.unitPayableIrr.toString(), warnings: resolved.warnings }
        : { source: describePrice(resolved), unitPayableIrr: null, warnings: [] },
      priceRules: p.priceRules.map((r) => ({
        id: r.id,
        customerGroupId: r.customerGroupId,
        minQty: fromSteps(r.minQty, u),
        maxQty: r.maxQty === null ? null : fromSteps(r.maxQty, u),
        base: { currency: r.baseCurrency, amountMinor: r.baseAmountMinor.toString() },
        manualIrr: r.manualIrrMinor?.toString() ?? null,
        manualAed: r.manualAedMinor?.toString() ?? null,
        validFrom: r.validFrom?.toISOString() ?? null,
        validTo: r.validTo?.toISOString() ?? null,
        active: r.active,
      })),
      inventory: p.inventory[0]
        ? { onHand: fromSteps(p.inventory[0].onHand, u), reserved: fromSteps(p.inventory[0].reserved, u), version: p.inventory[0].version, lowStockThreshold: fromSteps(p.inventory[0].lowStockThreshold, u) }
        : null,
      media: p.media.map((m) => ({ id: m.id, storageKey: m.storageKey, width: m.width, height: m.height, altFa: m.altFa, altEn: m.altEn, isPrimary: m.isPrimary, sortOrder: m.sortOrder })),
    };
  }

  private async rebuildSearch(tx: Tx, productId: string): Promise<void> {
    const p = await tx.product.findUniqueOrThrow({ where: { id: productId }, include: { translations: true } });
    const doc = buildSearchDocument([
      ...p.translations.flatMap((t) => [t.name, ...t.aliases]),
      p.sku,
      ...p.oemCodes,
    ]);
    await tx.product.update({ where: { id: productId }, data: { searchText: doc.text, searchCompact: doc.compact } });
  }

  private async uniqueSlug(tx: Tx, wanted: string, excludeId?: string): Promise<string> {
    const base = wanted || `part-${randomUUID().slice(0, 8)}`;
    let slug = base;
    for (let i = 2; i < 50; i += 1) {
      const clash = await tx.product.findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
      if (!clash) return slug;
      slug = `${base}-${i}`;
    }
    return `${base}-${randomUUID().slice(0, 6)}`;
  }

  async upsert(id: string | null, input: ProductUpsert, actorId: string): Promise<{ id: string; version: number }> {
    return this.prisma.tx(async (tx) => {
      const category = await tx.category.findUnique({ where: { id: input.categoryId } });
      if (!category) throw badRequest('UNKNOWN_CATEGORY');
      if (input.vehicleBrandIds.length) {
        const count = await tx.vehicleBrand.count({ where: { id: { in: input.vehicleBrandIds } } });
        if (count !== new Set(input.vehicleBrandIds).size) throw badRequest('UNKNOWN_VEHICLE_BRAND');
      }
      const priceData = {
        baseCurrency: input.basePrice.currency,
        baseAmountMinor: BigInt(input.basePrice.amountMinor),
        manualIrrMinor: input.manualPriceIrr ? BigInt(input.manualPriceIrr) : null,
        manualAedMinor: input.manualPriceAed ? BigInt(input.manualPriceAed) : null,
        updatedById: actorId,
      };
      if (priceData.baseAmountMinor <= 0n) throw badRequest('ZERO_PRICE_NOT_ALLOWED', 'Base price must be greater than zero');
      const current = id ? await tx.product.findUnique({ where: { id }, select: { unitId: true, salesUnit: true } }) : null;
      const unit = await this.units.usable(input.unitId, current?.unitId ?? null, tx);
      if (current && current.unitId !== unit.id) await this.assertUnitChangeAllowed(tx, id!, current.salesUnit, unit);
      const lowStockSteps = toSteps(input.lowStockThreshold, unit, true);
      const common = {
        categoryId: input.categoryId,
        manufacturerBrandId: input.manufacturerBrandId ?? null,
        partType: input.partType,
        condition: input.condition,
        origin: input.origin,
        countryOfManufacture: input.countryOfManufacture ?? null,
        unitId: unit.id,
        unit: unit.name,
        packQuantity: input.packQuantity,
        oemCodes: input.oemCodes,
        specs: input.specs as Prisma.InputJsonValue,
        isSellable: input.isSellable,
        updatedById: actorId,
      };

      let productId: string;
      let before: unknown = null;
      if (id) {
        const existing = await tx.product.findUnique({ where: { id }, include: { basePrice: true } });
        if (!existing) throw notFound();
        if (input.version === undefined) throw badRequest('VERSION_REQUIRED');
        before = { sku: existing.sku, price: existing.basePrice };
        if (existing.sku !== input.sku) {
          const orders = await tx.orderItem.count({ where: { productId: id } });
          if (orders > 0) throw conflict('SKU_LOCKED', 'SKU of a product with orders cannot change');
        }
        const slug = input.slug ? await this.uniqueSlug(tx, input.slug, id) : existing.slug;
        const res = await tx.product.updateMany({
          where: { id, version: input.version },
          data: { ...common, sku: input.sku, slug, version: { increment: 1 } },
        });
        if (res.count !== 1) throw new DomainError('VERSION_CONFLICT', 'The product was changed by someone else');
        productId = id;
        await tx.productPrice.upsert({ where: { productId }, create: { productId, ...priceData }, update: { ...priceData, version: { increment: 1 } } });
      } else {
        const slug = await this.uniqueSlug(tx, input.slug || slugify(input.nameEn ?? '') || slugify(input.sku));
        const created = await tx.product.create({ data: { ...common, sku: input.sku, slug: slug || slugify(input.sku), createdById: actorId } });
        productId = created.id;
        await tx.productPrice.create({ data: { productId, ...priceData } });
        await this.inventory.ensureBalance(tx, productId);
      }

      await tx.inventoryBalance.updateMany({ where: { productId }, data: { lowStockThreshold: lowStockSteps } });
      await tx.productTranslation.upsert({
        where: { productId_locale: { productId, locale: 'fa' } },
        create: { productId, locale: 'fa', name: input.nameFa, description: input.descriptionFa ?? null, warranty: input.warrantyFa ?? null, aliases: input.aliases },
        update: { name: input.nameFa, description: input.descriptionFa ?? null, warranty: input.warrantyFa ?? null, aliases: input.aliases },
      });
      if (input.nameEn) {
        await tx.productTranslation.upsert({
          where: { productId_locale: { productId, locale: 'en' } },
          create: { productId, locale: 'en', name: input.nameEn, description: input.descriptionEn ?? null, warranty: input.warrantyEn ?? null, aliases: [] },
          update: { name: input.nameEn, description: input.descriptionEn ?? null, warranty: input.warrantyEn ?? null },
        });
      } else {
        await tx.productTranslation.deleteMany({ where: { productId, locale: 'en' } });
      }
      await tx.productVehicleBrand.deleteMany({ where: { productId } });
      if (input.vehicleBrandIds.length) {
        await tx.productVehicleBrand.createMany({ data: [...new Set(input.vehicleBrandIds)].map((vehicleBrandId) => ({ productId, vehicleBrandId })) });
      }
      await this.rebuildSearch(tx, productId);
      await this.audit.record(tx, {
        action: id ? 'product.updated' : 'product.created',
        entityType: 'product',
        entityId: productId,
        before,
        after: { sku: input.sku, price: priceData, unit: unit.name },
      });
      const fresh = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { version: true } });
      return { id: productId, version: fresh.version };
    });
  }

  /**
   * Stored quantities count steps of the unit, so a product with stock, orders, carts or quantity
   * prices may only move to a unit with the same step and decimal rule (e.g. «عدد» → «دست»).
   */
  private async assertUnitChangeAllowed(tx: Tx, productId: string, from: { stepMilli: number; allowDecimal: boolean }, to: { stepMilli: number; allowDecimal: boolean }): Promise<void> {
    if (from.stepMilli === to.stepMilli && from.allowDecimal === to.allowDecimal) return;
    const [stock, orders, carts, rules] = await Promise.all([
      tx.inventoryBalance.count({ where: { productId, OR: [{ onHand: { not: 0 } }, { reserved: { not: 0 } }, { lowStockThreshold: { not: 0 } }] } }),
      tx.orderItem.count({ where: { productId } }),
      tx.cartItem.count({ where: { productId } }),
      tx.quantityPriceRule.count({ where: { productId } }),
    ]);
    if (stock + orders + carts + rules > 0) {
      throw conflict('UNIT_CHANGE_LOCKED', 'This product already has stock, orders, carts or quantity prices in its unit; choose a unit with the same step', { stock, orders, carts, rules });
    }
  }

  async setPublished(id: string, published: boolean, version: number) {
    return this.prisma.tx(async (tx) => {
      const p = await tx.product.findUnique({ where: { id }, include: { basePrice: true, media: { where: { deletedAt: null } } } });
      if (!p) throw notFound();
      if (published) {
        if (p.archivedAt) throw conflict('ARCHIVED', 'Archived products cannot be published');
        if (!p.basePrice) throw badRequest('PRICE_REQUIRED', 'Set a price before publishing');
        if (p.condition !== 'NEW' && p.media.length === 0) {
          throw badRequest('REAL_PHOTO_REQUIRED', 'Used/refurbished items need a real photo of the item before publishing');
        }
      }
      const res = await tx.product.updateMany({
        where: { id, version },
        data: { published, publishedAt: published ? (p.publishedAt ?? new Date()) : p.publishedAt, version: { increment: 1 } },
      });
      if (res.count !== 1) throw new DomainError('VERSION_CONFLICT');
      await this.audit.record(tx, { action: published ? 'product.published' : 'product.unpublished', entityType: 'product', entityId: id });
      return { id, published };
    });
  }

  /** Products are archived, never deleted (DB trigger enforces it too). */
  async archive(id: string, version: number) {
    return this.prisma.tx(async (tx) => {
      const res = await tx.product.updateMany({
        where: { id, version, archivedAt: null },
        data: { archivedAt: new Date(), published: false, isSellable: false, version: { increment: 1 } },
      });
      if (res.count !== 1) throw new DomainError('VERSION_CONFLICT');
      await this.audit.record(tx, { action: 'product.archived', entityType: 'product', entityId: id });
      return { id, archived: true };
    });
  }

  /** The product's photos in display order: sort order, the main one marked. */
  async listMedia(productId: string): Promise<ProductMediaView[]> {
    const media = await this.prisma.productMedia.findMany({ where: { productId, deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    return media.map((m) => ({ id: m.id, storageKey: m.storageKey, width: m.width, height: m.height, altFa: m.altFa, altEn: m.altEn, sortOrder: m.sortOrder, isPrimary: m.isPrimary }));
  }

  /** Serializes photo changes of one product (parallel uploads would otherwise both become the main photo). */
  private async lockProduct(tx: Tx, productId: string): Promise<{ nameFa: string } | null> {
    const [row] = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "product" WHERE "id" = ${productId}::uuid FOR UPDATE`;
    if (!row) return null;
    const fa = await tx.productTranslation.findUnique({ where: { productId_locale: { productId, locale: 'fa' } }, select: { name: true } });
    return { nameFa: fa?.name ?? '' };
  }

  /**
   * Product image upload: bytes are inspected, scanned, re-encoded to WebP
   * (EXIF stripped, orientation applied), then written to the PUBLIC store.
   * Linked by the product's id; a failed upload never touches the product's data.
   */
  async addMedia(productId: string, file: { originalname: string; buffer: Buffer }, alt: { altFa?: string | undefined; altEn?: string | null | undefined }) {
    if (!(await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } }))) throw notFound();
    const inspection = inspectFile(file.originalname, new Uint8Array(file.buffer));
    if (inspection.verdict !== 'ACCEPT' || !inspection.kind || !IMAGE_KINDS.includes(inspection.kind)) {
      throw badRequest('INVALID_IMAGE', 'Only JPG, PNG or WebP images are accepted', { reason: inspection.reason ?? 'NOT_AN_IMAGE' });
    }
    const scan = await this.scanner.scan(file.buffer);
    if (!scan.clean) throw badRequest('FILE_REJECTED', 'The file did not pass the security scan');
    let output: Buffer;
    let info: OutputInfo;
    try {
      ({ data: output, info } = await sharp(file.buffer, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true }));
    } catch {
      throw badRequest('INVALID_IMAGE', 'The image could not be processed');
    }
    const key = `products/${productId}/${randomUUID()}.webp`;
    await this.storage.putPublic(key, output, 'image/webp');
    try {
      return await this.prisma.tx(async (tx) => {
        const product = await this.lockProduct(tx, productId);
        if (!product) throw notFound();
        const current = await tx.productMedia.aggregate({ where: { productId, deletedAt: null }, _count: true, _max: { sortOrder: true } });
        const media = await tx.productMedia.create({
          data: {
            productId,
            storageKey: key,
            width: info.width,
            height: info.height,
            mime: 'image/webp',
            sizeBytes: output.length,
            // Alt text defaults to the part's name; it can be changed later.
            altFa: (alt.altFa?.trim() || product.nameFa || 'تصویر قطعه').slice(0, 200),
            altEn: alt.altEn ?? null,
            sortOrder: current._count === 0 ? 0 : (current._max.sortOrder ?? 0) + 1,
            isPrimary: current._count === 0,
          },
        });
        await tx.product.update({ where: { id: productId }, data: { version: { increment: 1 } } });
        await this.audit.record(tx, { action: 'product.media.added', entityType: 'product', entityId: productId, after: { mediaId: media.id } });
        return { id: media.id, width: media.width, height: media.height, isPrimary: media.isPrimary };
      });
    } catch (e) {
      await this.storage.deletePublic(key).catch(() => undefined);
      throw e;
    }
  }

  /** Changes only what is sent: alt text, or making this the main photo (the previous main one stays in the gallery). */
  async updateMedia(productId: string, mediaId: string, input: z.infer<typeof mediaUpdateSchema>) {
    return this.prisma.tx(async (tx) => {
      if (!(await this.lockProduct(tx, productId))) throw notFound();
      const media = await tx.productMedia.findFirst({ where: { id: mediaId, productId, deletedAt: null } });
      if (!media) throw notFound();
      if (input.isPrimary) await tx.productMedia.updateMany({ where: { productId, isPrimary: true, id: { not: mediaId } }, data: { isPrimary: false } });
      await tx.productMedia.update({
        where: { id: mediaId },
        data: {
          ...(input.altFa !== undefined ? { altFa: input.altFa } : {}),
          ...(input.altEn !== undefined ? { altEn: input.altEn } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.isPrimary ? { isPrimary: true } : {}),
        },
      });
      await this.audit.record(tx, { action: 'product.media.updated', entityType: 'product', entityId: productId, before: { isPrimary: media.isPrimary, altFa: media.altFa }, after: { mediaId, ...input } });
      return { id: mediaId };
    });
  }

  /** New order of all current photos of the product (each exactly once). */
  async reorderMedia(productId: string, ids: string[]) {
    return this.prisma.tx(async (tx) => {
      if (!(await this.lockProduct(tx, productId))) throw notFound();
      const media = await tx.productMedia.findMany({ where: { productId, deletedAt: null }, select: { id: true } });
      if (ids.length !== media.length || new Set(ids).size !== ids.length || !media.every((m) => ids.includes(m.id))) {
        throw badRequest('MEDIA_ORDER_MISMATCH', 'Send every current photo of the product exactly once');
      }
      for (const [i, id] of ids.entries()) await tx.productMedia.update({ where: { id }, data: { sortOrder: i } });
      await this.audit.record(tx, { action: 'product.media.reordered', entityType: 'product', entityId: productId, after: { order: ids } });
      return { ids };
    });
  }

  /** Removes a photo; when it was the main one, the next photo in order becomes the main photo. */
  async removeMedia(productId: string, mediaId: string) {
    const removed = await this.prisma.tx(async (tx) => {
      if (!(await this.lockProduct(tx, productId))) throw notFound();
      const media = await tx.productMedia.findFirst({ where: { id: mediaId, productId, deletedAt: null } });
      if (!media) throw notFound();
      await tx.productMedia.update({ where: { id: mediaId }, data: { deletedAt: new Date(), isPrimary: false } });
      const rest = await tx.productMedia.findMany({ where: { productId, deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true, isPrimary: true } });
      for (const [i, m] of rest.entries()) {
        await tx.productMedia.update({ where: { id: m.id }, data: { sortOrder: i, ...(media.isPrimary && i === 0 ? { isPrimary: true } : {}) } });
      }
      await this.audit.record(tx, { action: 'product.media.removed', entityType: 'product', entityId: productId, after: { mediaId, newPrimary: media.isPrimary ? (rest[0]?.id ?? null) : undefined } });
      return media;
    });
    await this.storage.deletePublic(removed.storageKey).catch(() => undefined);
    return { id: mediaId };
  }

  async addPriceRule(productId: string, input: z.infer<typeof priceRuleSchema>, actorId: string) {
    return this.prisma.tx(async (tx) => {
      if (input.customerGroupId) {
        const group = await tx.customerGroup.findUnique({ where: { id: input.customerGroupId } });
        if (!group) throw badRequest('UNKNOWN_GROUP');
      }
      if (input.maxQty !== null && input.maxQty < input.minQty) throw badRequest('INVALID_QTY_RANGE');
      // Quantities come in the product's unit and are stored as its steps (like stock and carts).
      const unit = await this.units.forProduct(productId, tx);
      const rule = await tx.quantityPriceRule.create({
        data: {
          productId,
          customerGroupId: input.customerGroupId,
          minQty: toSteps(input.minQty, unit),
          maxQty: input.maxQty === null ? null : toSteps(input.maxQty, unit),
          baseCurrency: input.basePrice.currency,
          baseAmountMinor: BigInt(input.basePrice.amountMinor),
          manualIrrMinor: input.manualPriceIrr ? BigInt(input.manualPriceIrr) : null,
          manualAedMinor: input.manualPriceAed ? BigInt(input.manualPriceAed) : null,
          validFrom: input.validFrom ? new Date(input.validFrom) : null,
          validTo: input.validTo ? new Date(input.validTo) : null,
          createdById: actorId,
        },
      });
      await this.audit.record(tx, { action: 'price.rule.created', entityType: 'product', entityId: productId, after: rule });
      return { id: rule.id };
    });
  }

  async deactivatePriceRule(productId: string, ruleId: string) {
    return this.prisma.tx(async (tx) => {
      const res = await tx.quantityPriceRule.updateMany({ where: { id: ruleId, productId, active: true }, data: { active: false } });
      if (res.count !== 1) throw notFound();
      await this.audit.record(tx, { action: 'price.rule.deactivated', entityType: 'product', entityId: productId, after: { ruleId } });
      return { id: ruleId, active: false };
    });
  }
}
