import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  CatalogCodeLookupView, CatalogEntryAdminDetail, CatalogEntryAdminRow, CatalogEntryCard, CatalogEntryDetail, CatalogEntryDraftView,
  CatalogEntryInput, CatalogEntryPublicQuery, CatalogEntrySearchResult, CatalogEntryStatus, CatalogFitmentView, MediaView,
} from '@hedax/contracts';
import { catalogSlug, matchFitment, normalizeSearchText, partNumberKey, splitVehicleList } from '@hedax/domain';
import { AuditService } from '../../common/audit.service.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors.js';
import { Prisma, PrismaService, type Tx } from '../../common/prisma.service.js';
import { PublicCacheService } from '../../common/public-cache.service.js';
import type { Actor } from '../../common/request-context.js';
import { SCANNER, type MalwareScanner } from '../../common/storage/scanner.js';
import { STORAGE, type StorageDriver } from '../../common/storage/storage.js';
import { ENV, type Env } from '../../config/env.js';
import { processPublicImage } from './catalog-images.js';

const MAX_IMAGES = 30;

const publicInclude = {
  manufacturerBrand: true,
  category: true,
  images: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  vehicles: { include: { vehicle: true, model: true }, orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.CatalogEntryInclude;
type PublicRow = Prisma.CatalogEntryGetPayload<{ include: typeof publicInclude }>;

const detailInclude = {
  ...publicInclude,
  numbers: { orderBy: { sortOrder: 'asc' } },
  vehicleBrands: { include: { vehicleBrand: true } },
  product: { include: { translations: true } },
  sourceDocument: { select: { id: true, title: true } },
} satisfies Prisma.CatalogEntryInclude;
type DetailRow = Prisma.CatalogEntryGetPayload<{ include: typeof detailInclude }>;

/** Who may see the catalog in the panel: importers or catalog editors. Editing needs products.write (controller). */
export function assertCanViewCatalog(actor: Actor): void {
  if (!actor.permissions.has('imports.run') && !actor.permissions.has('products.write')) throw forbidden('MISSING_PERMISSION');
}

/** What the import and the form both write: the entry's own fields with ids already resolved. */
export interface CatalogEntryData {
  partNumber: string;
  nameFa: string;
  nameEn: string | null;
  equivalents: string[];
  replacements: string[];
  manufacturerBrandId: string | null;
  categoryId: string | null;
  vehicleBrandIds: string[];
  vehicles: Array<{ vehicleId: string; modelId: string | null; yearFrom: number | null; yearTo: number | null; note: string | null }>;
  specs: Array<{ label: string; value: string }>;
  descriptionFa: string | null;
  descriptionEn: string | null;
  status: CatalogEntryStatus;
}

/** Fields a spreadsheet column replaces when it updates an existing entry (absent columns keep the entry's values). */
export type CatalogDataField = keyof CatalogEntryData;

/**
 * Technical parts catalog («کاتالوگ فنی قطعات»). Entries are reference data: no price or stock, never
 * created from or turned into shop products automatically; a product is linked only by hand. Only
 * PUBLISHED entries are public. Every change is in the audit trail and refreshes the public pages.
 */
@Injectable()
export class CatalogEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly publicCache: PublicCacheService,
    @Inject(ENV) private readonly env: Env,
    @Inject(STORAGE) private readonly storage: StorageDriver,
    @Inject(SCANNER) private readonly scanner: MalwareScanner,
  ) {}

  private mediaUrl(key: string): string {
    return `${this.env.PUBLIC_MEDIA_BASE_URL.replace(/\/$/, '')}/${key}`;
  }

  // ---------------------------------------------------------------------------
  // Writing (form and import)
  // ---------------------------------------------------------------------------

  /** Ids sent by the panel must exist (and a model must belong to its vehicle). */
  private async checkReferences(tx: Tx, input: CatalogEntryInput): Promise<void> {
    const bad = (field: string) => badRequest('UNKNOWN_REFERENCE', `Unknown ${field}`, { field });
    if (input.manufacturerBrandId && !(await tx.manufacturerBrand.findUnique({ where: { id: input.manufacturerBrandId }, select: { id: true } }))) throw bad('manufacturerBrandId');
    if (input.categoryId && !(await tx.category.findUnique({ where: { id: input.categoryId }, select: { id: true } }))) throw bad('categoryId');
    if (input.sourceDocumentId && !(await tx.catalogDocument.findUnique({ where: { id: input.sourceDocumentId }, select: { id: true } }))) throw bad('sourceDocumentId');
    if (input.productId && !(await tx.product.findFirst({ where: { id: input.productId, archivedAt: null }, select: { id: true } }))) throw bad('productId');
    const brandIds = [...new Set(input.vehicleBrandIds)];
    if (brandIds.length && (await tx.vehicleBrand.count({ where: { id: { in: brandIds } } })) !== brandIds.length) throw bad('vehicleBrandIds');
    const vehicleIds = [...new Set(input.vehicles.map((v) => v.vehicleId))];
    if (vehicleIds.length && (await tx.vehicle.count({ where: { id: { in: vehicleIds } } })) !== vehicleIds.length) throw bad('vehicles');
    const modelIds = input.vehicles.filter((v) => v.modelId).map((v) => v.modelId as string);
    if (modelIds.length) {
      const models = await tx.vehicleModel.findMany({ where: { id: { in: modelIds } }, select: { id: true, vehicleId: true } });
      const byId = new Map(models.map((m) => [m.id, m.vehicleId]));
      if (input.vehicles.some((v) => v.modelId && byId.get(v.modelId) !== v.vehicleId)) throw bad('vehicles');
    }
  }

  private async uniqueSlug(tx: Tx, partNumber: string, exceptId?: string): Promise<string> {
    const base = catalogSlug(partNumber, `part-${randomUUID().slice(0, 8)}`).slice(0, 100);
    for (let i = 1; ; i += 1) {
      const slug = i === 1 ? base : `${base}-${i}`;
      const taken = await tx.catalogEntry.findUnique({ where: { slug }, select: { id: true } });
      if (!taken || taken.id === exceptId) return slug;
    }
  }

  private async searchText(tx: Tx, data: Pick<CatalogEntryData, 'nameFa' | 'nameEn' | 'manufacturerBrandId'>): Promise<string> {
    const maker = data.manufacturerBrandId ? await tx.manufacturerBrand.findUnique({ where: { id: data.manufacturerBrandId }, select: { nameFa: true, nameEn: true } }) : null;
    return normalizeSearchText([data.nameFa, data.nameEn, maker?.nameFa, maker?.nameEn].filter(Boolean).join(' '));
  }

  /** Other numbers without the main one and without repeats (compared like the search does). */
  private numbers(data: Pick<CatalogEntryData, 'equivalents' | 'replacements'>, mainKey: string) {
    const seen = new Set([mainKey]);
    const out: Array<{ number: string; numberKey: string; kind: 'EQUIVALENT' | 'REPLACEMENT'; sortOrder: number }> = [];
    for (const [kind, list] of [['EQUIVALENT', data.equivalents], ['REPLACEMENT', data.replacements]] as const) {
      for (const number of list) {
        const numberKey = partNumberKey(number);
        if (!numberKey || seen.has(numberKey)) continue;
        seen.add(numberKey);
        out.push({ number: number.trim().slice(0, 80), numberKey, kind, sortOrder: out.length });
      }
    }
    return out;
  }

  /** Replaces the entry's numbers, vehicles and vehicle brands (only the parts listed in `fields`). */
  private async writeChildren(tx: Tx, entryId: string, data: CatalogEntryData, mainKey: string, fields: ReadonlySet<CatalogDataField>): Promise<void> {
    if (fields.has('equivalents') || fields.has('replacements')) {
      const current = await tx.catalogEntryNumber.findMany({ where: { entryId } });
      const keep = {
        equivalents: fields.has('equivalents') ? data.equivalents : current.filter((n) => n.kind === 'EQUIVALENT').map((n) => n.number),
        replacements: fields.has('replacements') ? data.replacements : current.filter((n) => n.kind === 'REPLACEMENT').map((n) => n.number),
      };
      await tx.catalogEntryNumber.deleteMany({ where: { entryId } });
      const rows = this.numbers(keep, mainKey);
      if (rows.length) await tx.catalogEntryNumber.createMany({ data: rows.map((r) => ({ ...r, entryId })) });
    }
    if (fields.has('vehicles')) {
      await tx.catalogEntryVehicle.deleteMany({ where: { entryId } });
      if (data.vehicles.length) await tx.catalogEntryVehicle.createMany({ data: data.vehicles.map((v, i) => ({ ...v, entryId, sortOrder: i })) });
    }
    if (fields.has('vehicleBrandIds')) {
      await tx.catalogEntryVehicleBrand.deleteMany({ where: { entryId } });
      const ids = [...new Set(data.vehicleBrandIds)];
      if (ids.length) await tx.catalogEntryVehicleBrand.createMany({ data: ids.map((vehicleBrandId) => ({ entryId, vehicleBrandId })) });
    }
  }

  /**
   * Creates a new entry, or updates the entry with this technical number when `existingId` is given.
   * Used by the form (all fields) and by the spreadsheet import (only the columns the file has).
   */
  async write(tx: Tx, actorId: string, data: CatalogEntryData, opts: { existingId?: string; fields?: ReadonlySet<CatalogDataField>; links?: { productId: string | null; sourceDocumentId: string | null } }) {
    const key = partNumberKey(data.partNumber);
    if (!key) throw badRequest('PART_NUMBER_INVALID', 'The technical number is empty');
    const all = new Set(Object.keys(data) as CatalogDataField[]);
    const fields = opts.fields ?? all;
    const clash = await tx.catalogEntry.findUnique({ where: { partNumberKey: key }, select: { id: true, partNumber: true, nameFa: true } });
    if (clash && clash.id !== opts.existingId) throw conflict('CATALOG_PART_NUMBER_EXISTS', 'Another catalog entry has this technical number', { id: clash.id, partNumber: clash.partNumber, nameFa: clash.nameFa });
    const pick = <K extends CatalogDataField>(k: K) => (fields.has(k) ? { [k]: data[k] } : {});
    if (!opts.existingId) {
      const slug = await this.uniqueSlug(tx, data.partNumber);
      const entry = await tx.catalogEntry.create({
        data: {
          slug, partNumber: data.partNumber.trim(), partNumberKey: key, nameFa: data.nameFa, nameEn: data.nameEn,
          manufacturerBrandId: data.manufacturerBrandId, categoryId: data.categoryId, specs: data.specs,
          descriptionFa: data.descriptionFa, descriptionEn: data.descriptionEn, status: data.status,
          publishedAt: data.status === 'PUBLISHED' ? new Date() : null,
          productId: opts.links?.productId ?? null, sourceDocumentId: opts.links?.sourceDocumentId ?? null,
          searchText: await this.searchText(tx, data), createdById: actorId, updatedById: actorId,
        },
      });
      await this.writeChildren(tx, entry.id, data, key, all);
      await this.audit.record(tx, { action: 'catalog_entry.created', entityType: 'catalog_entry', entityId: entry.id, after: { partNumber: entry.partNumber, nameFa: entry.nameFa, status: entry.status, productId: entry.productId } });
      return { id: entry.id, slug: entry.slug, status: entry.status, created: true, wasPublished: false };
    }
    const before = await tx.catalogEntry.findUnique({ where: { id: opts.existingId } });
    if (!before) throw notFound();
    const merged = {
      nameFa: fields.has('nameFa') ? data.nameFa : before.nameFa,
      nameEn: fields.has('nameEn') ? data.nameEn : before.nameEn,
      manufacturerBrandId: fields.has('manufacturerBrandId') ? data.manufacturerBrandId : before.manufacturerBrandId,
    };
    const status = fields.has('status') ? data.status : before.status;
    const numberChanged = data.partNumber.trim() !== before.partNumber;
    const entry = await tx.catalogEntry.update({
      where: { id: before.id },
      data: {
        ...(numberChanged ? { partNumber: data.partNumber.trim(), partNumberKey: key, slug: await this.uniqueSlug(tx, data.partNumber, before.id) } : {}),
        ...pick('nameFa'), ...pick('nameEn'), ...pick('manufacturerBrandId'), ...pick('categoryId'), ...pick('specs'), ...pick('descriptionFa'), ...pick('descriptionEn'),
        status, publishedAt: status === 'PUBLISHED' ? (before.publishedAt ?? new Date()) : null,
        ...(opts.links ? { productId: opts.links.productId, sourceDocumentId: opts.links.sourceDocumentId } : {}),
        searchText: await this.searchText(tx, merged), updatedById: actorId,
      },
    });
    await this.writeChildren(tx, entry.id, data, key, fields);
    await this.audit.record(tx, {
      action: 'catalog_entry.updated', entityType: 'catalog_entry', entityId: entry.id,
      before: { partNumber: before.partNumber, nameFa: before.nameFa, status: before.status, productId: before.productId },
      after: { partNumber: entry.partNumber, nameFa: entry.nameFa, status: entry.status, productId: entry.productId, fields: [...fields].sort() },
    });
    return { id: entry.id, slug: entry.slug, status: entry.status, created: false, wasPublished: before.status === 'PUBLISHED' };
  }

  private toData(input: CatalogEntryInput): CatalogEntryData {
    return {
      partNumber: input.partNumber, nameFa: input.nameFa, nameEn: input.nameEn || null, equivalents: input.equivalents, replacements: input.replacements,
      manufacturerBrandId: input.manufacturerBrandId, categoryId: input.categoryId, vehicleBrandIds: input.vehicleBrandIds,
      vehicles: input.vehicles.map((v) => ({ vehicleId: v.vehicleId, modelId: v.modelId, yearFrom: v.yearFrom, yearTo: v.yearTo, note: v.note || null })),
      specs: input.specs, descriptionFa: input.descriptionFa || null, descriptionEn: input.descriptionEn || null, status: input.status,
    };
  }

  async create(actor: Actor, input: CatalogEntryInput) {
    const res = await this.prisma.tx(async (tx) => {
      await this.checkReferences(tx, input);
      return this.write(tx, actor.userId, this.toData(input), { links: { productId: input.productId, sourceDocumentId: input.sourceDocumentId } });
    });
    if (res.status === 'PUBLISHED') this.publicCache.invalidate();
    return this.adminDetail(res.id);
  }

  async update(actor: Actor, id: string, input: CatalogEntryInput) {
    const res = await this.prisma.tx(async (tx) => {
      await this.checkReferences(tx, input);
      return this.write(tx, actor.userId, this.toData(input), { existingId: id, links: { productId: input.productId, sourceDocumentId: input.sourceDocumentId } });
    });
    if (res.status === 'PUBLISHED' || res.wasPublished) this.publicCache.invalidate();
    return this.adminDetail(res.id);
  }

  async setStatus(actor: Actor, id: string, status: CatalogEntryStatus) {
    await this.prisma.tx(async (tx) => {
      const before = await tx.catalogEntry.findUnique({ where: { id }, select: { status: true, publishedAt: true } });
      if (!before) throw notFound();
      await tx.catalogEntry.update({ where: { id }, data: { status, publishedAt: status === 'PUBLISHED' ? (before.publishedAt ?? new Date()) : null, updatedById: actor.userId } });
      await this.audit.record(tx, { action: 'catalog_entry.status_changed', entityType: 'catalog_entry', entityId: id, before: { status: before.status }, after: { status } });
    });
    this.publicCache.invalidate();
    return this.adminDetail(id);
  }

  /** Deletes the entry, its numbers, fitments and photos (photo files are removed from the public store). */
  async remove(actor: Actor, id: string) {
    const images = await this.prisma.tx(async (tx) => {
      const entry = await tx.catalogEntry.findUnique({ where: { id }, include: { images: true } });
      if (!entry) throw notFound();
      await tx.catalogEntry.delete({ where: { id } });
      await this.audit.record(tx, { action: 'catalog_entry.deleted', entityType: 'catalog_entry', entityId: id, before: { partNumber: entry.partNumber, nameFa: entry.nameFa, status: entry.status, images: entry.images.length } });
      return entry.images.map((i) => i.storageKey);
    });
    for (const key of images) await this.storage.deletePublic(key).catch(() => undefined);
    this.publicCache.invalidate();
    return { id, deleted: true };
  }

  // ---------------------------------------------------------------------------
  // Photos
  // ---------------------------------------------------------------------------

  private async lockEntry(tx: Tx, id: string): Promise<{ nameFa: string; status: CatalogEntryStatus } | null> {
    const [row] = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "catalog_entry" WHERE "id" = ${id}::uuid FOR UPDATE`;
    if (!row) return null;
    return tx.catalogEntry.findUnique({ where: { id }, select: { nameFa: true, status: true } });
  }

  async addImage(actor: Actor, id: string, file: { originalname: string; buffer: Buffer }) {
    if (!(await this.prisma.catalogEntry.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
    const image = await processPublicImage(this.scanner, file);
    const key = `catalog/${id}/${randomUUID()}.webp`;
    await this.storage.putPublic(key, image.data, 'image/webp');
    try {
      const res = await this.prisma.tx(async (tx) => {
        const entry = await this.lockEntry(tx, id);
        if (!entry) throw notFound();
        const current = await tx.catalogEntryImage.aggregate({ where: { entryId: id }, _count: true, _max: { sortOrder: true } });
        if (current._count >= MAX_IMAGES) throw badRequest('TOO_MANY_IMAGES', `At most ${MAX_IMAGES} photos per entry`);
        const row = await tx.catalogEntryImage.create({
          data: { entryId: id, storageKey: key, width: image.width, height: image.height, mime: 'image/webp', sizeBytes: image.data.length, altFa: entry.nameFa.slice(0, 200), sortOrder: current._count === 0 ? 0 : (current._max.sortOrder ?? 0) + 1 },
        });
        await tx.catalogEntry.update({ where: { id }, data: { updatedById: actor.userId } });
        await this.audit.record(tx, { action: 'catalog_entry.image_added', entityType: 'catalog_entry', entityId: id, after: { imageId: row.id } });
        return { row, status: entry.status };
      });
      if (res.status === 'PUBLISHED') this.publicCache.invalidate();
      return { id: res.row.id, url: this.mediaUrl(res.row.storageKey), width: res.row.width, height: res.row.height, sortOrder: res.row.sortOrder };
    } catch (e) {
      await this.storage.deletePublic(key).catch(() => undefined);
      throw e;
    }
  }

  /** New order of all photos of the entry (each exactly once); the first is the main photo. */
  async reorderImages(actor: Actor, id: string, ids: string[]) {
    const status = await this.prisma.tx(async (tx) => {
      const entry = await this.lockEntry(tx, id);
      if (!entry) throw notFound();
      const images = await tx.catalogEntryImage.findMany({ where: { entryId: id }, select: { id: true } });
      if (ids.length !== images.length || new Set(ids).size !== ids.length || !images.every((m) => ids.includes(m.id))) {
        throw badRequest('MEDIA_ORDER_MISMATCH', 'Send every current photo of the entry exactly once');
      }
      for (const [i, imageId] of ids.entries()) await tx.catalogEntryImage.update({ where: { id: imageId }, data: { sortOrder: i } });
      await this.audit.record(tx, { action: 'catalog_entry.images_reordered', entityType: 'catalog_entry', entityId: id, after: { order: ids } });
      return entry.status;
    });
    if (status === 'PUBLISHED') this.publicCache.invalidate();
    return { ids };
  }

  async removeImage(actor: Actor, id: string, imageId: string) {
    const res = await this.prisma.tx(async (tx) => {
      const entry = await this.lockEntry(tx, id);
      if (!entry) throw notFound();
      const image = await tx.catalogEntryImage.findFirst({ where: { id: imageId, entryId: id } });
      if (!image) throw notFound();
      await tx.catalogEntryImage.delete({ where: { id: imageId } });
      await this.audit.record(tx, { action: 'catalog_entry.image_removed', entityType: 'catalog_entry', entityId: id, before: { imageId } });
      return { key: image.storageKey, status: entry.status };
    });
    await this.storage.deletePublic(res.key).catch(() => undefined);
    if (res.status === 'PUBLISHED') this.publicCache.invalidate();
    return { id: imageId, removed: true };
  }

  // ---------------------------------------------------------------------------
  // Panel reads
  // ---------------------------------------------------------------------------

  /** Name (all words) or a technical number, main or other (spaces, dashes, digits ignored). */
  private searchWhere(q: string | undefined): Prisma.CatalogEntryWhereInput {
    const text = (q ?? '').trim();
    if (!text) return {};
    const key = partNumberKey(text);
    const words = normalizeSearchText(text).split(' ').filter(Boolean);
    const or: Prisma.CatalogEntryWhereInput[] = [];
    if (key) or.push({ partNumberKey: { contains: key } }, { numbers: { some: { numberKey: { contains: key } } } });
    if (words.length) or.push({ AND: words.map((w) => ({ searchText: { contains: w } })) });
    return or.length ? { OR: or } : {};
  }

  async adminList(q: { q?: string | undefined; vehicleBrand?: string | undefined; vehicle?: string | undefined; category?: string | undefined; status?: CatalogEntryStatus | undefined; page: number; pageSize: number }) {
    const where: Prisma.CatalogEntryWhereInput = {
      AND: [
        this.searchWhere(q.q),
        q.vehicleBrand ? { vehicleBrands: { some: { vehicleBrandId: q.vehicleBrand } } } : {},
        q.vehicle ? { vehicles: { some: { vehicleId: q.vehicle } } } : {},
        q.category ? { categoryId: q.category } : {},
        q.status ? { status: q.status } : {},
      ],
    };
    const [total, rows] = await Promise.all([
      this.prisma.catalogEntry.count({ where }),
      this.prisma.catalogEntry.findMany({
        where, orderBy: [{ updatedAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize,
        include: {
          category: true, manufacturerBrand: true, images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          product: { select: { id: true, sku: true, translations: { where: { locale: 'fa' }, select: { name: true } } } },
          _count: { select: { images: true, vehicles: true } },
        },
      }),
    ]);
    const items: CatalogEntryAdminRow[] = rows.map((r) => ({
      id: r.id, slug: r.slug, partNumber: r.partNumber, nameFa: r.nameFa, nameEn: r.nameEn, status: r.status,
      category: r.category?.nameFa ?? null, manufacturer: r.manufacturerBrand?.nameFa ?? null,
      imageUrl: r.images[0] ? this.mediaUrl(r.images[0].storageKey) : null, imageCount: r._count.images, vehicleCount: r._count.vehicles,
      product: r.product ? { id: r.product.id, sku: r.product.sku, nameFa: r.product.translations[0]?.name ?? r.product.sku } : null,
      updatedAt: r.updatedAt.toISOString(),
    }));
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async adminDetail(id: string): Promise<CatalogEntryAdminDetail> {
    const r = await this.prisma.catalogEntry.findUnique({ where: { id }, include: detailInclude });
    if (!r) throw notFound();
    return {
      id: r.id, slug: r.slug, partNumber: r.partNumber, nameFa: r.nameFa, nameEn: r.nameEn,
      equivalents: r.numbers.filter((n) => n.kind === 'EQUIVALENT').map((n) => n.number),
      replacements: r.numbers.filter((n) => n.kind === 'REPLACEMENT').map((n) => n.number),
      manufacturerBrandId: r.manufacturerBrandId, categoryId: r.categoryId,
      vehicleBrandIds: r.vehicleBrands.map((b) => b.vehicleBrandId),
      vehicles: r.vehicles.map((v) => ({ vehicleId: v.vehicleId, modelId: v.modelId, yearFrom: v.yearFrom, yearTo: v.yearTo, note: v.note, vehicleName: v.vehicle.name, modelName: v.model?.name ?? null })),
      specs: specList(r.specs), descriptionFa: r.descriptionFa, descriptionEn: r.descriptionEn,
      sourceDocumentId: r.sourceDocumentId, productId: r.productId, status: r.status,
      images: r.images.map((i) => ({ id: i.id, url: this.mediaUrl(i.storageKey), width: i.width, height: i.height, sortOrder: i.sortOrder })),
      product: r.product ? { id: r.product.id, sku: r.product.sku, nameFa: r.product.translations.find((t) => t.locale === 'fa')?.name ?? r.product.sku } : null,
      sourceDocument: r.sourceDocument,
      createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), publishedAt: r.publishedAt?.toISOString() ?? null,
    };
  }

  /** Shop products for the «لینک به محصول فروشگاه» picker: by SKU, technical number or name. */
  async productLookup(q: string) {
    const text = q.trim();
    if (!text) return [];
    const words = normalizeSearchText(text).split(' ').filter(Boolean);
    const rows = await this.prisma.product.findMany({
      where: {
        archivedAt: null,
        OR: [
          { sku: { contains: text, mode: 'insensitive' } },
          { oemCodes: { has: text } },
          ...(words.length ? [{ translations: { some: { AND: words.map((w) => ({ name: { contains: w, mode: 'insensitive' as const } })) } } }] : []),
        ],
      },
      select: { id: true, sku: true, translations: { where: { locale: 'fa' }, select: { name: true } } },
      orderBy: { updatedAt: 'desc' }, take: 10,
    });
    return rows.map((r) => ({ id: r.id, sku: r.sku, nameFa: r.translations[0]?.name ?? r.sku }));
  }

  /**
   * «تبدیل به آیتم کاتالوگ»: a form filled from an extracted candidate row. Vehicles are matched to
   * known ones only; anything else is listed so it can be added by hand. Nothing is saved here.
   */
  async draftFromCandidate(documentId: string, ordinal: number): Promise<CatalogEntryDraftView> {
    const chunk = await this.prisma.catalogDocumentChunk.findUnique({ where: { documentId_ordinal: { documentId, ordinal } } });
    if (!chunk) throw notFound();
    const meta = (chunk.metadata ?? {}) as { candidatePartNumber?: string | null; candidatePartName?: string | null; candidateVehicle?: string | null };
    const partNumber = (meta.candidatePartNumber ?? '').trim().slice(0, 80);
    const nameFa = (meta.candidatePartName ?? '').trim().slice(0, 200);
    const known = await this.prisma.vehicle.findMany({ include: { models: true } });
    const vehicles: CatalogEntryDraftView['vehicles'] = [];
    const unmatchedVehicles: string[] = [];
    for (const text of splitVehicleList(meta.candidateVehicle ?? '')) {
      const m = matchFitment(text, known);
      if (m.kind === 'KNOWN') vehicles.push({ vehicleId: m.vehicleId, modelId: m.modelId, vehicleName: m.vehicleName, modelName: m.modelName });
      else unmatchedVehicles.push(text);
    }
    const key = partNumberKey(partNumber);
    const existing = key ? await this.prisma.catalogEntry.findUnique({ where: { partNumberKey: key }, select: { id: true } }) : null;
    return { partNumber, nameFa, sourceDocumentId: documentId, vehicles, unmatchedVehicles, existingId: existing?.id ?? null };
  }

  /** Bulk photos: entries whose main or other technical number equals a file-name code. */
  async lookupCodes(codes: readonly string[]): Promise<CatalogCodeLookupView> {
    const unique = [...new Set(codes)];
    const matches: CatalogCodeLookupView['matches'] = Object.fromEntries(unique.map((c) => [c, []]));
    const keys = new Map<string, string[]>();
    for (const code of unique) {
      const key = partNumberKey(code);
      if (key) keys.set(key, [...(keys.get(key) ?? []), code]);
    }
    if (!keys.size) return { matches };
    const list = [...keys.keys()];
    const rows = await this.prisma.catalogEntry.findMany({
      where: { OR: [{ partNumberKey: { in: list } }, { numbers: { some: { numberKey: { in: list } } } }] },
      select: { id: true, partNumber: true, partNumberKey: true, nameFa: true, numbers: { select: { numberKey: true } }, _count: { select: { images: true } } },
      orderBy: { partNumber: 'asc' },
    });
    for (const r of rows) {
      const view = { id: r.id, partNumber: r.partNumber, nameFa: r.nameFa, photoCount: r._count.images };
      for (const key of new Set([r.partNumberKey, ...r.numbers.map((n) => n.numberKey)])) {
        for (const code of keys.get(key) ?? []) if (!matches[code]!.some((m) => m.id === r.id)) matches[code]!.push(view);
      }
    }
    return { matches };
  }

  // ---------------------------------------------------------------------------
  // Public (published only)
  // ---------------------------------------------------------------------------

  private media(entry: { nameFa: string; nameEn: string | null }, i: { storageKey: string; width: number; height: number; altFa: string; altEn: string | null }): MediaView {
    return { url: this.mediaUrl(i.storageKey), width: i.width, height: i.height, alt: { fa: i.altFa || entry.nameFa, en: i.altEn ?? entry.nameEn } };
  }

  private fitments(r: PublicRow): CatalogFitmentView[] {
    return r.vehicles
      .filter((v) => v.vehicle.active && (!v.model || v.model.active))
      .map((v) => ({
        vehicle: { slug: v.vehicle.slug, name: { fa: v.vehicle.name, en: v.vehicle.nameEn } },
        model: v.model ? { slug: v.model.slug, name: { fa: v.model.name, en: v.model.nameEn } } : null,
        yearFrom: v.yearFrom, yearTo: v.yearTo, note: v.note,
      }));
  }

  private card(r: PublicRow & { product?: { published: boolean; archivedAt: Date | null } | null }): CatalogEntryCard {
    const first = r.images[0];
    return {
      slug: r.slug, partNumber: r.partNumber, name: { fa: r.nameFa, en: r.nameEn },
      manufacturer: r.manufacturerBrand ? { slug: r.manufacturerBrand.slug, name: { fa: r.manufacturerBrand.nameFa, en: r.manufacturerBrand.nameEn } } : null,
      category: r.category ? { slug: r.category.slug, name: { fa: r.category.nameFa, en: r.category.nameEn } } : null,
      image: first ? this.media(r, first) : null,
      fitments: this.fitments(r),
      inShop: !!r.product && r.product.published && !r.product.archivedAt,
    };
  }

  async publicList(q: CatalogEntryPublicQuery): Promise<CatalogEntrySearchResult> {
    const where: Prisma.CatalogEntryWhereInput = {
      status: 'PUBLISHED',
      AND: [
        this.searchWhere(q.q),
        q.brand ? { vehicleBrands: { some: { vehicleBrand: { slug: q.brand } } } } : {},
        q.vehicle
          ? { vehicles: { some: { vehicle: { slug: q.vehicle }, ...(q.model ? { OR: [{ modelId: null }, { model: { slug: q.model } }] } : {}) } } }
          : {},
        q.category ? { OR: [{ category: { slug: q.category } }, { category: { parent: { slug: q.category } } }] } : {},
      ],
    };
    const [total, rows] = await Promise.all([
      this.prisma.catalogEntry.count({ where }),
      this.prisma.catalogEntry.findMany({
        where, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize,
        include: { ...publicInclude, images: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], take: 1 }, product: { select: { published: true, archivedAt: true } } },
      }),
    ]);
    // An exact technical number (main or other) comes first on its page.
    const key = q.q ? partNumberKey(q.q) : '';
    const sorted = key ? [...rows].sort((a, b) => Number(b.partNumberKey === key) - Number(a.partNumberKey === key)) : rows;
    return { items: sorted.map((r) => this.card(r)), total, page: q.page, pageSize: q.pageSize };
  }

  async sitemap(): Promise<Array<{ slug: string; updatedAt: string }>> {
    const rows = await this.prisma.catalogEntry.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 10_000 });
    return rows.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt.toISOString() }));
  }

  async publicDetail(slug: string): Promise<CatalogEntryDetail> {
    const r: DetailRow | null = await this.prisma.catalogEntry.findFirst({ where: { slug, status: 'PUBLISHED' }, include: detailInclude });
    if (!r) throw notFound();
    const product = r.product && r.product.published && !r.product.archivedAt ? r.product : null;
    const fa = product?.translations.find((t) => t.locale === 'fa');
    const en = product?.translations.find((t) => t.locale === 'en');
    return {
      ...this.card({ ...r, product }),
      equivalents: r.numbers.filter((n) => n.kind === 'EQUIVALENT').map((n) => n.number),
      replacements: r.numbers.filter((n) => n.kind === 'REPLACEMENT').map((n) => n.number),
      vehicleBrands: r.vehicleBrands.filter((b) => b.vehicleBrand.active).map((b) => ({ slug: b.vehicleBrand.slug, name: { fa: b.vehicleBrand.nameFa, en: b.vehicleBrand.nameEn } })),
      specs: specList(r.specs),
      description: r.descriptionFa || r.descriptionEn ? { fa: r.descriptionFa ?? '', en: r.descriptionEn } : null,
      images: r.images.map((i) => this.media(r, i)),
      product: product ? { slug: product.slug, name: { fa: fa?.name ?? product.sku, en: en?.name ?? null } } : null,
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}

function specList(value: Prisma.JsonValue): Array<{ label: string; value: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((s) => (s && typeof s === 'object' && !Array.isArray(s) && typeof s.label === 'string' && typeof s.value === 'string' ? [{ label: s.label, value: s.value }] : []));
}
