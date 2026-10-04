import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp, { type OutputInfo } from 'sharp';
import type { AdminProductRow, ProductUpsert } from '@hedax/contracts';
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
        include: { translations: true, category: true, basePrice: true, priceRules: { where: { active: true } }, inventory: { where: { warehouseId } } },
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
          priceSource: describePrice(this.pricing.resolve(p.basePrice, p.priceRules, 1, null, rate)),
          onHand: bal?.onHand ?? 0,
          reserved: bal?.reserved ?? 0,
          available: (bal?.onHand ?? 0) - (bal?.reserved ?? 0),
          lowStockThreshold: bal?.lowStockThreshold ?? 0,
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
        media: { where: { deletedAt: null }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
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
    const resolved = this.pricing.resolve(p.basePrice, p.priceRules, 1, null, rate);
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
      unit: p.unit,
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
        minQty: r.minQty,
        maxQty: r.maxQty,
        base: { currency: r.baseCurrency, amountMinor: r.baseAmountMinor.toString() },
        manualIrr: r.manualIrrMinor?.toString() ?? null,
        manualAed: r.manualAedMinor?.toString() ?? null,
        validFrom: r.validFrom?.toISOString() ?? null,
        validTo: r.validTo?.toISOString() ?? null,
        active: r.active,
      })),
      inventory: p.inventory[0]
        ? { onHand: p.inventory[0].onHand, reserved: p.inventory[0].reserved, version: p.inventory[0].version, lowStockThreshold: p.inventory[0].lowStockThreshold }
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
      const common = {
        categoryId: input.categoryId,
        manufacturerBrandId: input.manufacturerBrandId ?? null,
        partType: input.partType,
        condition: input.condition,
        origin: input.origin,
        countryOfManufacture: input.countryOfManufacture ?? null,
        unit: input.unit,
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

      await tx.inventoryBalance.updateMany({ where: { productId }, data: { lowStockThreshold: input.lowStockThreshold } });
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
        after: { sku: input.sku, price: priceData },
      });
      const fresh = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { version: true } });
      return { id: productId, version: fresh.version };
    });
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

  /**
   * Product image upload: bytes are inspected, scanned, re-encoded to WebP
   * (EXIF stripped, orientation applied), then written to the PUBLIC store.
   */
  async addMedia(productId: string, file: { originalname: string; buffer: Buffer }, alt: { altFa: string; altEn?: string | null }) {
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
    return this.prisma.tx(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId }, include: { media: { where: { deletedAt: null } } } });
      if (!product) throw notFound();
      const media = await tx.productMedia.create({
        data: {
          productId,
          storageKey: key,
          width: info.width,
          height: info.height,
          mime: 'image/webp',
          sizeBytes: output.length,
          altFa: alt.altFa,
          altEn: alt.altEn ?? null,
          sortOrder: product.media.length,
          isPrimary: product.media.length === 0,
        },
      });
      await tx.product.update({ where: { id: productId }, data: { version: { increment: 1 } } });
      await this.audit.record(tx, { action: 'product.media.added', entityType: 'product', entityId: productId, after: { mediaId: media.id } });
      return { id: media.id, width: media.width, height: media.height };
    });
  }

  async updateMedia(productId: string, mediaId: string, input: z.infer<typeof mediaUpdateSchema>) {
    return this.prisma.tx(async (tx) => {
      const media = await tx.productMedia.findFirst({ where: { id: mediaId, productId, deletedAt: null } });
      if (!media) throw notFound();
      if (input.isPrimary) await tx.productMedia.updateMany({ where: { productId, isPrimary: true }, data: { isPrimary: false } });
      await tx.productMedia.update({
        where: { id: mediaId },
        data: { altFa: input.altFa, altEn: input.altEn ?? null, sortOrder: input.sortOrder, isPrimary: input.isPrimary },
      });
      return { id: mediaId };
    });
  }

  async removeMedia(productId: string, mediaId: string) {
    return this.prisma.tx(async (tx) => {
      const media = await tx.productMedia.findFirst({ where: { id: mediaId, productId, deletedAt: null } });
      if (!media) throw notFound();
      await tx.productMedia.update({ where: { id: mediaId }, data: { deletedAt: new Date(), isPrimary: false } });
      await this.audit.record(tx, { action: 'product.media.removed', entityType: 'product', entityId: productId, after: { mediaId } });
      await this.storage.deletePublic(media.storageKey).catch(() => undefined);
      return { id: mediaId };
    });
  }

  async addPriceRule(productId: string, input: z.infer<typeof priceRuleSchema>, actorId: string) {
    return this.prisma.tx(async (tx) => {
      if (input.customerGroupId) {
        const group = await tx.customerGroup.findUnique({ where: { id: input.customerGroupId } });
        if (!group) throw badRequest('UNKNOWN_GROUP');
      }
      if (input.maxQty !== null && input.maxQty < input.minQty) throw badRequest('INVALID_QTY_RANGE');
      const rule = await tx.quantityPriceRule.create({
        data: {
          productId,
          customerGroupId: input.customerGroupId,
          minQty: input.minQty,
          maxQty: input.maxQty,
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
