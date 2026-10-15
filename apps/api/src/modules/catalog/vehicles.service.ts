import { Injectable } from '@nestjs/common';
import type { VehicleAdminView, VehicleCategoryView, VehicleOption, VehiclePublicView, vehicleCategorySchema, vehicleModelSchema, vehicleSchema } from '@hedax/contracts';
import { isSimilarVehicleName, vehicleKey, vehicleSlug } from '@hedax/domain';
import type { z } from 'zod';
import { AuditService } from '../../common/audit.service.js';
import { badRequest, conflict, notFound } from '../../common/errors.js';
import { PrismaService, type Tx } from '../../common/prisma.service.js';
import { PublicCacheService } from '../../common/public-cache.service.js';
import { rebuildProductSearch } from './product-search.js';

type VehicleInput = z.infer<typeof vehicleSchema>;
type CategoryInput = z.infer<typeof vehicleCategorySchema>;
type ModelInput = z.infer<typeof vehicleModelSchema>;

const LIVE_PRODUCT = { published: true, archivedAt: null } as const;

/**
 * Vehicle fitment («کاربرد در خودرو»), managed in the panel without code changes: categories
 * (سواری، وانت …), vehicles (پژو، دنا پلاس …) and optional models/trims (۲۰۶، ۴۰۵ …). Names are
 * unique by their normalized key, so «دنا پلاس» and «دناپلاس» are one vehicle. A vehicle or model
 * linked to products is never deleted directly: merge it into another or deactivate it. Every
 * change is in the audit trail; renames and merges refresh the search text of the products.
 */
@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly publicCache: PublicCacheService,
  ) {}

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  async adminList(): Promise<{ categories: VehicleCategoryView[]; vehicles: VehicleAdminView[] }> {
    const [categories, vehicles] = await Promise.all([
      this.prisma.vehicleCategory.findMany({ include: { _count: { select: { vehicles: true } } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.vehicle.findMany({
        include: { models: { include: { _count: { select: { products: true } } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }, _count: { select: { products: true } } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);
    const productCounts = await this.productCounts(vehicles.map((v) => v.id));
    return {
      categories: categories.map((c) => ({ id: c.id, name: c.name, nameEn: c.nameEn, slug: c.slug, sortOrder: c.sortOrder, active: c.active, vehicleCount: c._count.vehicles })),
      vehicles: vehicles.map((v) => ({
        id: v.id, name: v.name, nameEn: v.nameEn, slug: v.slug, categoryId: v.categoryId, sortOrder: v.sortOrder, active: v.active,
        seoTitle: v.seoTitle, seoDescription: v.seoDescription, productCount: productCounts.get(v.id) ?? 0,
        models: v.models.map((m) => ({ id: m.id, name: m.name, nameEn: m.nameEn, slug: m.slug, sortOrder: m.sortOrder, active: m.active, productCount: m._count.products })),
      })),
    };
  }

  /** Distinct products linked to each vehicle (whole vehicle or any of its models). */
  private async productCounts(vehicleIds: string[], tx?: Tx): Promise<Map<string, number>> {
    if (!vehicleIds.length) return new Map();
    const rows = await (tx ?? this.prisma).productVehicle.groupBy({ by: ['vehicleId', 'productId'], where: { vehicleId: { in: vehicleIds } } });
    const out = new Map<string, number>();
    for (const r of rows) out.set(r.vehicleId, (out.get(r.vehicleId) ?? 0) + 1);
    return out;
  }

  /** Active vehicles with their active models, for the product form picker (any product editor). */
  async options(): Promise<VehicleOption[]> {
    const rows = await this.prisma.vehicle.findMany({
      include: { category: true, models: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((v) => ({
      id: v.id, name: v.name, nameEn: v.nameEn, active: v.active, category: v.category?.name ?? null,
      models: v.models.map((m) => ({ id: m.id, name: m.name, nameEn: m.nameEn, active: m.active })),
    }));
  }

  /** Public list (filters, /cars): active vehicles with active models and how many live parts fit each. */
  async publicList(): Promise<VehiclePublicView[]> {
    const rows = await this.prisma.vehicle.findMany({
      where: { active: true },
      include: { category: true, models: { where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const links = await this.prisma.productVehicle.groupBy({ by: ['vehicleId', 'productId'], where: { vehicleId: { in: rows.map((r) => r.id) }, product: LIVE_PRODUCT } });
    const counts = new Map<string, number>();
    for (const l of links) counts.set(l.vehicleId, (counts.get(l.vehicleId) ?? 0) + 1);
    return rows.map((v) => this.publicView(v, counts.get(v.id) ?? 0));
  }

  async publicBySlug(slug: string): Promise<VehiclePublicView | null> {
    const v = await this.prisma.vehicle.findFirst({
      where: { slug, active: true },
      include: { category: true, models: { where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] } },
    });
    if (!v) return null;
    const links = await this.prisma.productVehicle.groupBy({ by: ['productId'], where: { vehicleId: v.id, product: LIVE_PRODUCT } });
    return this.publicView(v, links.length);
  }

  private publicView(
    v: { id: string; name: string; nameEn: string | null; slug: string; seoTitle: string | null; seoDescription: string | null; category: { name: string; nameEn: string | null; slug: string } | null; models: Array<{ name: string; nameEn: string | null; slug: string }> },
    productCount: number,
  ): VehiclePublicView {
    return {
      slug: v.slug, name: { fa: v.name, en: v.nameEn }, category: v.category ? { slug: v.category.slug, name: { fa: v.category.name, en: v.category.nameEn } } : null,
      models: v.models.map((m) => ({ slug: m.slug, name: { fa: m.name, en: m.nameEn } })), productCount, seoTitle: v.seoTitle, seoDescription: v.seoDescription,
    };
  }

  // ---------------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------------

  async createCategory(body: CategoryInput) {
    return this.prisma.tx(async (tx) => {
      const slug = await this.freeSlug(tx, 'category', body.slug || vehicleSlug(body.nameEn, `category-${Date.now().toString(36)}`), null);
      const row = await tx.vehicleCategory.create({ data: { name: body.name, nameEn: body.nameEn || null, slug, sortOrder: body.sortOrder ?? (await tx.vehicleCategory.count()), active: body.active ?? true } });
      await this.audit.record(tx, { action: 'vehicle_category.created', entityType: 'vehicle_category', entityId: row.id, after: { name: row.name, slug } });
      this.publicCache.invalidate();
      return { id: row.id };
    });
  }

  async updateCategory(id: string, body: Partial<CategoryInput>) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.vehicleCategory.findUnique({ where: { id } });
      if (!before) throw notFound();
      const slug = body.slug && body.slug !== before.slug ? await this.freeSlug(tx, 'category', body.slug, id) : undefined;
      const row = await tx.vehicleCategory.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}), ...(body.nameEn !== undefined ? { nameEn: body.nameEn || null } : {}),
          ...(slug ? { slug } : {}), ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}), ...(body.active !== undefined ? { active: body.active } : {}),
        },
      });
      await this.audit.record(tx, { action: 'vehicle_category.updated', entityType: 'vehicle_category', entityId: id, before: { name: before.name, active: before.active }, after: { name: row.name, active: row.active } });
      this.publicCache.invalidate();
      return { id };
    });
  }

  /** Its vehicles stay, without a category. */
  async deleteCategory(id: string) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.vehicleCategory.findUnique({ where: { id }, include: { _count: { select: { vehicles: true } } } });
      if (!before) throw notFound();
      await tx.vehicle.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
      await tx.vehicleCategory.delete({ where: { id } });
      await this.audit.record(tx, { action: 'vehicle_category.deleted', entityType: 'vehicle_category', entityId: id, before: { name: before.name, vehicles: before._count.vehicles } });
      this.publicCache.invalidate();
      return { id, deleted: true };
    });
  }

  // ---------------------------------------------------------------------------
  // Vehicles
  // ---------------------------------------------------------------------------

  async createVehicle(body: VehicleInput) {
    return this.prisma.tx(async (tx) => {
      const row = await this.insertVehicle(tx, body);
      this.publicCache.invalidate();
      return { id: row.id, slug: row.slug };
    });
  }

  private async insertVehicle(tx: Tx, body: Pick<VehicleInput, 'name'> & Partial<VehicleInput>) {
    const nameKey = vehicleKey(body.name);
    if (!nameKey) throw badRequest('VEHICLE_NAME_REQUIRED');
    const same = await tx.vehicle.findUnique({ where: { nameKey }, select: { id: true, name: true } });
    if (same) throw conflict('VEHICLE_EXISTS', 'A vehicle with this name already exists', { id: same.id, name: same.name });
    if (body.categoryId && !(await tx.vehicleCategory.findUnique({ where: { id: body.categoryId } }))) throw badRequest('UNKNOWN_VEHICLE_CATEGORY');
    const slug = await this.freeSlug(tx, 'vehicle', body.slug || vehicleSlug(body.nameEn, `vehicle-${Date.now().toString(36)}`), null);
    const row = await tx.vehicle.create({
      data: {
        name: body.name, nameEn: body.nameEn || null, nameKey, slug, categoryId: body.categoryId ?? null, active: body.active ?? true,
        sortOrder: body.sortOrder ?? (await tx.vehicle.count()) + 1, seoTitle: body.seoTitle || null, seoDescription: body.seoDescription || null,
      },
    });
    await this.audit.record(tx, { action: 'vehicle.created', entityType: 'vehicle', entityId: row.id, after: { name: row.name, slug, categoryId: row.categoryId } });
    return row;
  }

  async updateVehicle(id: string, body: Partial<VehicleInput>) {
    const affected = await this.prisma.tx(async (tx) => {
      const before = await tx.vehicle.findUnique({ where: { id } });
      if (!before) throw notFound();
      const nameKey = body.name !== undefined ? vehicleKey(body.name) : before.nameKey;
      if (!nameKey) throw badRequest('VEHICLE_NAME_REQUIRED');
      if (nameKey !== before.nameKey) {
        const same = await tx.vehicle.findUnique({ where: { nameKey }, select: { id: true, name: true } });
        if (same) throw conflict('VEHICLE_EXISTS', 'A vehicle with this name already exists; merge them instead', { id: same.id, name: same.name });
      }
      if (body.categoryId && !(await tx.vehicleCategory.findUnique({ where: { id: body.categoryId } }))) throw badRequest('UNKNOWN_VEHICLE_CATEGORY');
      const slug = body.slug && body.slug !== before.slug ? await this.freeSlug(tx, 'vehicle', body.slug, id) : undefined;
      const row = await tx.vehicle.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name, nameKey } : {}), ...(body.nameEn !== undefined ? { nameEn: body.nameEn || null } : {}),
          ...(slug ? { slug } : {}), ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
          ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}), ...(body.active !== undefined ? { active: body.active } : {}),
          ...(body.seoTitle !== undefined ? { seoTitle: body.seoTitle || null } : {}), ...(body.seoDescription !== undefined ? { seoDescription: body.seoDescription || null } : {}),
        },
      });
      await this.audit.record(tx, {
        action: 'vehicle.updated', entityType: 'vehicle', entityId: id,
        before: { name: before.name, nameEn: before.nameEn, slug: before.slug, categoryId: before.categoryId, active: before.active },
        after: { name: row.name, nameEn: row.nameEn, slug: row.slug, categoryId: row.categoryId, active: row.active },
      });
      const renamed = row.name !== before.name || row.nameEn !== before.nameEn;
      return renamed ? (await tx.productVehicle.findMany({ where: { vehicleId: id }, select: { productId: true }, distinct: ['productId'] })).map((r) => r.productId) : [];
    });
    await this.refreshSearch(affected);
    this.publicCache.invalidate();
    return { id };
  }

  /** Drag-and-drop order: the ids in their new order (vehicles, categories or one vehicle's models). */
  async reorder(kind: 'vehicle' | 'category' | 'model', ids: string[], vehicleId?: string) {
    return this.prisma.tx(async (tx) => {
      const unique = [...new Set(ids)];
      if (unique.length !== ids.length) throw badRequest('DUPLICATE_IDS');
      const count = kind === 'vehicle' ? await tx.vehicle.count({ where: { id: { in: ids } } })
        : kind === 'category' ? await tx.vehicleCategory.count({ where: { id: { in: ids } } })
          : await tx.vehicleModel.count({ where: { id: { in: ids }, vehicleId: vehicleId ?? '' } });
      if (count !== ids.length) throw badRequest('UNKNOWN_IDS');
      for (const [i, id] of ids.entries()) {
        if (kind === 'vehicle') await tx.vehicle.update({ where: { id }, data: { sortOrder: i + 1 } });
        else if (kind === 'category') await tx.vehicleCategory.update({ where: { id }, data: { sortOrder: i + 1 } });
        else await tx.vehicleModel.update({ where: { id }, data: { sortOrder: i + 1 } });
      }
      await this.audit.record(tx, { action: `${kind === 'category' ? 'vehicle_category' : kind === 'model' ? 'vehicle_model' : 'vehicle'}.reordered`, entityType: kind === 'category' ? 'vehicle_category' : 'vehicle', entityId: vehicleId ?? null, after: { ids } });
      this.publicCache.invalidate();
      return { ok: true };
    });
  }

  /** Only a vehicle without products is deleted; otherwise merge it or deactivate it. Its models go with it. */
  async deleteVehicle(id: string) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.vehicle.findUnique({ where: { id }, include: { models: true } });
      if (!before) throw notFound();
      const products = (await this.productCounts([id], tx)).get(id) ?? 0;
      if (products > 0) throw conflict('VEHICLE_IN_USE', 'Products use this vehicle; merge it into another or deactivate it', { products });
      await tx.vehicleModel.deleteMany({ where: { vehicleId: id } });
      await tx.vehicle.delete({ where: { id } });
      await this.audit.record(tx, { action: 'vehicle.deleted', entityType: 'vehicle', entityId: id, before: { name: before.name, slug: before.slug, models: before.models.map((m) => m.name) } });
      this.publicCache.invalidate();
      return { id, deleted: true };
    });
  }

  /**
   * Merges a duplicate into the vehicle that stays: every product link and model moves over (a
   * model with the same name is joined, not doubled), then the duplicate is deleted.
   */
  async merge(targetId: string, sourceId: string) {
    if (targetId === sourceId) throw badRequest('MERGE_SAME_VEHICLE');
    const affected = await this.prisma.tx(async (tx) => {
      const [target, source] = await Promise.all([
        tx.vehicle.findUnique({ where: { id: targetId }, include: { models: true } }),
        tx.vehicle.findUnique({ where: { id: sourceId }, include: { models: true } }),
      ]);
      if (!target || !source) throw notFound();
      const links = await tx.productVehicle.findMany({ where: { vehicleId: sourceId } });
      const productIds = [...new Set(links.map((l) => l.productId))];
      // Models: join by name, or move under the vehicle that stays.
      const modelMap = new Map<string, string>();
      for (const m of source.models) {
        const same = target.models.find((t) => t.nameKey === m.nameKey);
        if (same) {
          modelMap.set(m.id, same.id);
        } else {
          const slug = await this.freeModelSlug(tx, targetId, m.slug, null);
          await tx.vehicleModel.update({ where: { id: m.id }, data: { vehicleId: targetId, slug, sortOrder: m.sortOrder + 1000 } });
          modelMap.set(m.id, m.id);
        }
      }
      // Product links: re-point, skipping what the product already has on the vehicle that stays.
      for (const link of links) {
        const modelId = link.modelId ? (modelMap.get(link.modelId) ?? null) : null;
        const exists = await tx.productVehicle.findFirst({ where: { productId: link.productId, vehicleId: targetId, modelId }, select: { id: true } });
        if (exists) await tx.productVehicle.delete({ where: { id: link.id } });
        else await tx.productVehicle.update({ where: { id: link.id }, data: { vehicleId: targetId, modelId } });
      }
      await tx.vehicleModel.deleteMany({ where: { vehicleId: sourceId } });
      await tx.vehicle.delete({ where: { id: sourceId } });
      await this.audit.record(tx, {
        action: 'vehicle.merged', entityType: 'vehicle', entityId: targetId,
        before: { merged: { id: sourceId, name: source.name, slug: source.slug } }, after: { into: { id: targetId, name: target.name }, products: productIds.length, models: source.models.length },
      });
      return productIds;
    });
    await this.refreshSearch(affected);
    this.publicCache.invalidate();
    return { id: targetId, mergedProducts: affected.length };
  }

  /**
   * From the product form (any product editor): adds a vehicle that is not in the list yet. The
   * same name (as normalized) returns the existing vehicle; a very similar one is refused with a
   * suggestion unless `confirmNew` is sent.
   */
  async quickAdd(name: string, confirmNew: boolean) {
    const key = vehicleKey(name);
    const all = await this.prisma.vehicle.findMany({ select: { id: true, name: true, nameKey: true, active: true } });
    const same = all.find((v) => v.nameKey === key);
    if (same) return { id: same.id, name: same.name, created: false };
    const similar = all.find((v) => isSimilarVehicleName(v.name, name));
    if (similar && !confirmNew) throw conflict('VEHICLE_SIMILAR', 'A vehicle with a very similar name exists', { id: similar.id, name: similar.name });
    const row = await this.prisma.tx((tx) => this.insertVehicle(tx, { name: name.replace(/\s+/g, ' ').trim() }));
    this.publicCache.invalidate();
    return { id: row.id, name: row.name, created: true };
  }

  // ---------------------------------------------------------------------------
  // Models / trims
  // ---------------------------------------------------------------------------

  async createModel(vehicleId: string, body: ModelInput) {
    return this.prisma.tx(async (tx) => {
      const vehicle = await tx.vehicle.findUnique({ where: { id: vehicleId } });
      if (!vehicle) throw notFound();
      const row = await this.insertModel(tx, vehicleId, body);
      this.publicCache.invalidate();
      return { id: row.id, name: row.name, created: true };
    });
  }

  async insertModel(tx: Tx, vehicleId: string, body: Pick<ModelInput, 'name'> & Partial<ModelInput>) {
    const nameKey = vehicleKey(body.name);
    if (!nameKey) throw badRequest('VEHICLE_NAME_REQUIRED');
    const same = await tx.vehicleModel.findUnique({ where: { vehicleId_nameKey: { vehicleId, nameKey } } });
    if (same) throw conflict('MODEL_EXISTS', 'This vehicle already has a model with this name', { id: same.id, name: same.name });
    const slug = await this.freeModelSlug(tx, vehicleId, body.slug || vehicleSlug(body.nameEn ?? (/^[\x20-\x7e]+$/.test(body.name) ? body.name : null), vehicleSlug(nameKey.replace(/[^\x20-\x7e]/g, ''), `model-${Date.now().toString(36)}`)), null);
    const row = await tx.vehicleModel.create({
      data: { vehicleId, name: body.name, nameEn: body.nameEn || null, nameKey, slug, active: body.active ?? true, sortOrder: body.sortOrder ?? (await tx.vehicleModel.count({ where: { vehicleId } })) + 1 },
    });
    await this.audit.record(tx, { action: 'vehicle_model.created', entityType: 'vehicle', entityId: vehicleId, after: { model: row.name, slug } });
    return row;
  }

  async updateModel(vehicleId: string, modelId: string, body: Partial<ModelInput>) {
    const affected = await this.prisma.tx(async (tx) => {
      const before = await tx.vehicleModel.findFirst({ where: { id: modelId, vehicleId } });
      if (!before) throw notFound();
      const nameKey = body.name !== undefined ? vehicleKey(body.name) : before.nameKey;
      if (!nameKey) throw badRequest('VEHICLE_NAME_REQUIRED');
      if (nameKey !== before.nameKey && (await tx.vehicleModel.findUnique({ where: { vehicleId_nameKey: { vehicleId, nameKey } } }))) throw conflict('MODEL_EXISTS');
      const slug = body.slug && body.slug !== before.slug ? await this.freeModelSlug(tx, vehicleId, body.slug, modelId) : undefined;
      const row = await tx.vehicleModel.update({
        where: { id: modelId },
        data: {
          ...(body.name !== undefined ? { name: body.name, nameKey } : {}), ...(body.nameEn !== undefined ? { nameEn: body.nameEn || null } : {}),
          ...(slug ? { slug } : {}), ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}), ...(body.active !== undefined ? { active: body.active } : {}),
        },
      });
      await this.audit.record(tx, { action: 'vehicle_model.updated', entityType: 'vehicle', entityId: vehicleId, before: { model: before.name, active: before.active }, after: { model: row.name, active: row.active } });
      const renamed = row.name !== before.name || row.nameEn !== before.nameEn;
      return renamed ? (await tx.productVehicle.findMany({ where: { modelId }, select: { productId: true } })).map((r) => r.productId) : [];
    });
    await this.refreshSearch(affected);
    this.publicCache.invalidate();
    return { id: modelId };
  }

  async deleteModel(vehicleId: string, modelId: string) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.vehicleModel.findFirst({ where: { id: modelId, vehicleId }, include: { _count: { select: { products: true } } } });
      if (!before) throw notFound();
      if (before._count.products > 0) throw conflict('MODEL_IN_USE', 'Products use this model; deactivate it instead', { products: before._count.products });
      await tx.vehicleModel.delete({ where: { id: modelId } });
      await this.audit.record(tx, { action: 'vehicle_model.deleted', entityType: 'vehicle', entityId: vehicleId, before: { model: before.name } });
      this.publicCache.invalidate();
      return { id: modelId, deleted: true };
    });
  }

  // ---------------------------------------------------------------------------
  // Product links
  // ---------------------------------------------------------------------------

  /**
   * Replaces a product's fitment: whole vehicles (modelId null) and/or specific models. A vehicle
   * or model must be active unless the product already had it.
   */
  async setProductVehicles(tx: Tx, productId: string, wanted: ReadonlyArray<{ vehicleId: string; modelId: string | null }>): Promise<void> {
    const current = await tx.productVehicle.findMany({ where: { productId } });
    const had = new Set(current.map((c) => `${c.vehicleId}:${c.modelId ?? ''}`));
    const unique = [...new Map(wanted.map((w) => [`${w.vehicleId}:${w.modelId ?? ''}`, w])).values()];
    const vehicleIds = [...new Set(unique.map((w) => w.vehicleId))];
    const modelIds = unique.flatMap((w) => (w.modelId ? [w.modelId] : []));
    const [vehicles, models] = await Promise.all([
      tx.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, active: true } }),
      tx.vehicleModel.findMany({ where: { id: { in: modelIds } }, select: { id: true, vehicleId: true, active: true } }),
    ]);
    for (const w of unique) {
      const v = vehicles.find((x) => x.id === w.vehicleId);
      const m = w.modelId ? models.find((x) => x.id === w.modelId) : null;
      const key = `${w.vehicleId}:${w.modelId ?? ''}`;
      if (!v || (w.modelId && (!m || m.vehicleId !== w.vehicleId))) throw badRequest('UNKNOWN_VEHICLE');
      if (!had.has(key) && (!v.active || (m && !m.active))) throw badRequest('VEHICLE_INACTIVE');
    }
    await tx.productVehicle.deleteMany({ where: { productId } });
    if (unique.length) await tx.productVehicle.createMany({ data: unique.map((w) => ({ productId, vehicleId: w.vehicleId, modelId: w.modelId })) });
  }

  /** Excel import (after the person confirmed new vehicles): the vehicle with this name, created when missing. */
  async ensureVehicle(tx: Tx, name: string): Promise<{ id: string; created: boolean }> {
    const same = await tx.vehicle.findUnique({ where: { nameKey: vehicleKey(name) }, select: { id: true } });
    if (same) return { id: same.id, created: false };
    const row = await this.insertVehicle(tx, { name: name.replace(/\s+/g, ' ').trim() });
    return { id: row.id, created: true };
  }

  /** Excel import: the vehicle's model with this name, created when missing. */
  async ensureModel(tx: Tx, vehicleId: string, name: string): Promise<{ id: string; created: boolean }> {
    const same = await tx.vehicleModel.findUnique({ where: { vehicleId_nameKey: { vehicleId, nameKey: vehicleKey(name) } }, select: { id: true } });
    if (same) return { id: same.id, created: false };
    const row = await this.insertModel(tx, vehicleId, { name: name.replace(/\s+/g, ' ').trim() });
    return { id: row.id, created: true };
  }

  /** Adds one fitment link to a product unless it already has it (imports only ever add fitment). */
  async addProductVehicle(tx: Tx, productId: string, vehicleId: string, modelId: string | null): Promise<void> {
    const exists = await tx.productVehicle.findFirst({ where: { productId, vehicleId, modelId }, select: { id: true } });
    if (!exists) await tx.productVehicle.create({ data: { productId, vehicleId, modelId } });
  }

  private async refreshSearch(productIds: string[]): Promise<void> {
    for (const productId of productIds) await this.prisma.tx((tx) => rebuildProductSearch(tx, productId));
  }

  private async freeSlug(tx: Tx, kind: 'vehicle' | 'category', wanted: string, exceptId: string | null): Promise<string> {
    const base = wanted.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || `${kind}-${Date.now().toString(36)}`;
    for (let i = 1; i < 50; i += 1) {
      const slug = i === 1 ? base : `${base}-${i}`;
      const clash = kind === 'vehicle' ? await tx.vehicle.findUnique({ where: { slug }, select: { id: true } }) : await tx.vehicleCategory.findUnique({ where: { slug }, select: { id: true } });
      if (!clash || clash.id === exceptId) return slug;
    }
    return `${base}-${Date.now().toString(36)}`;
  }

  private async freeModelSlug(tx: Tx, vehicleId: string, wanted: string, exceptId: string | null): Promise<string> {
    const base = wanted.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || `model-${Date.now().toString(36)}`;
    for (let i = 1; i < 50; i += 1) {
      const slug = i === 1 ? base : `${base}-${i}`;
      const clash = await tx.vehicleModel.findUnique({ where: { vehicleId_slug: { vehicleId, slug } }, select: { id: true } });
      if (!clash || clash.id === exceptId) return slug;
    }
    return `${base}-${Date.now().toString(36)}`;
  }
}
