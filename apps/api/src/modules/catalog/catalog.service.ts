import { Inject, Injectable } from '@nestjs/common';
import type {
  Availability,
  CategoryView,
  LocalizedText,
  MediaView,
  ProductCard,
  ProductDetail,
  ProductListQuery,
  SearchResult,
  VehicleBrandView, ManufacturerView } from '@hedax/contracts';
import { type CurrencyCode, compactSearchText, normalizeSearchText, partNumberKey, searchTokens } from '@hedax/domain';
import { ENV, type Env } from '../../config/env.js';
import { Prisma, PrismaService } from '../../common/prisma.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { type CurrentRate, PricingService } from '../pricing/pricing.service.js';
import { fromSteps, unitRef } from './units.service.js';
import { VehicleFinderService } from './vehicle-finder.service.js';

/** Largest amount (in the unit) one cart line may hold. */
export const MAX_LINE_AMOUNT = 999;

const productInclude = (warehouseId: string) =>
  ({
    translations: true,
    category: true,
    salesUnit: true,
    manufacturerBrand: true,
    vehicleBrands: { include: { vehicleBrand: true } },
    vehicles: { include: { vehicle: true, model: true } },
    numbers: { orderBy: { sortOrder: 'asc' } },
    media: { where: { deletedAt: null }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
    basePrice: true,
    priceRules: { where: { active: true } },
    inventory: { where: { warehouseId } },
  }) satisfies Prisma.ProductInclude;

export type HydratedProduct = Prisma.ProductGetPayload<{ include: ReturnType<typeof productInclude> }>;

export interface Viewer {
  approvedGroupId: string | null;
  display: CurrencyCode;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly pricing: PricingService,
    @Inject(ENV) private readonly env: Env,
    private readonly finder: VehicleFinderService,
  ) {}

  /** Builder collections use the same publication checks, stock and viewer-specific prices. */
  async collection(kind: string, slugs: string[], viewer: Viewer, limit: number): Promise<ProductCard[]> {
    const warehouseId = await this.inventory.defaultWarehouseId();
    const rate = await this.pricing.currentRate();
    let ids: string[] | undefined;
    if (kind === 'bestsellers') {
      const rows = await this.prisma.$queryRaw<Array<{ product_id: string }>>`SELECT oi.product_id FROM order_item oi JOIN "order" o ON o.id = oi.order_id WHERE o.payment_status = 'PAID' AND o.cancelled_at IS NULL GROUP BY oi.product_id HAVING SUM(oi.quantity - oi.returned_quantity) > 0 ORDER BY SUM(oi.quantity - oi.returned_quantity) DESC LIMIT ${limit}`;
      ids = rows.map(r => r.product_id);
      if (!ids.length) return [];
    }
    if (['selected-products', 'offers'].includes(kind) && !slugs.length) return [];
    const products = await this.prisma.product.findMany({
      where: { published: true, archivedAt: null, ...(ids ? { id: { in: ids } } : {}), ...(slugs.length ? { slug: { in: slugs } } : {}),
        ...(kind === 'discounts' ? { priceRules: { some: { active: true, customerGroupId: null, minQty: { lte: 1 } } } } : {}) },
      include: productInclude(warehouseId), orderBy: { publishedAt: 'desc' }, take: kind === 'discounts' ? 200 : limit,
    });
    if (ids) products.sort((a, b) => ids!.indexOf(a.id) - ids!.indexOf(b.id));
    return products.filter(p => {
      if (kind !== 'discounts') return true;
      const base = this.pricing.toView(this.pricing.resolve(p.basePrice, [], 1, null, rate, p.salesUnit.stepMilli), 'IRR');
      const actual = this.toCard(p, { approvedGroupId: null, display: 'IRR' }, rate).price;
      return base.kind === 'price' && actual.kind === 'price' && BigInt(actual.payable.amountMinor) < BigInt(base.payable.amountMinor);
    }).slice(0, limit).map(p => this.toCard(p, viewer, rate));
  }

  private text(fa: string | null | undefined, en: string | null | undefined): LocalizedText {
    return { fa: fa ?? '', en: en ?? null };
  }

  private mediaView(m: HydratedProduct['media'][number]): MediaView {
    return {
      url: `${this.env.PUBLIC_MEDIA_BASE_URL.replace(/\/$/, '')}/${m.storageKey}`,
      width: m.width,
      height: m.height,
      alt: this.text(m.altFa, m.altEn),
    };
  }

  availability(p: HydratedProduct): { availability: Availability; available: number } {
    const bal = p.inventory[0];
    const available = bal ? bal.onHand - bal.reserved : 0;
    if (!p.isSellable || p.archivedAt || available <= 0) return { availability: 'OUT_OF_STOCK', available: 0 };
    if (bal && available <= bal.lowStockThreshold) return { availability: 'LOW_STOCK', available };
    return { availability: 'IN_STOCK', available };
  }

  /** «مناسب برای»: active vehicles and models, in the panel's order (vehicle first, then its models). */
  private fitments(p: HydratedProduct): ProductCard['fitments'] {
    return p.vehicles
      .filter((l) => l.vehicle.active && (!l.model || l.model.active))
      .sort((a, b) => a.vehicle.sortOrder - b.vehicle.sortOrder || a.vehicle.name.localeCompare(b.vehicle.name, 'fa') || (a.model?.sortOrder ?? -1) - (b.model?.sortOrder ?? -1))
      .map((l) => ({
        vehicle: { slug: l.vehicle.slug, name: this.text(l.vehicle.name, l.vehicle.nameEn) },
        model: l.model ? { slug: l.model.slug, name: this.text(l.model.name, l.model.nameEn) } : null,
        yearFrom: l.yearFrom, yearTo: l.yearTo, note: l.note,
      }));
  }

  /** What one cart line may hold, in the unit: the available stock, at most MAX_LINE_AMOUNT. */
  maxOrderAmount(p: HydratedProduct, availableSteps: number): number {
    return Math.min(fromSteps(Math.max(availableSteps, 0), p.salesUnit), MAX_LINE_AMOUNT);
  }

  toCard(p: HydratedProduct, viewer: Viewer, rate: CurrentRate | null): ProductCard {
    const fa = p.translations.find((t) => t.locale === 'fa');
    const en = p.translations.find((t) => t.locale === 'en');
    const primary = p.media[0];
    const price = this.pricing.resolve(p.basePrice, p.priceRules, 1, viewer.approvedGroupId, rate, p.salesUnit.stepMilli);
    const availability = this.availability(p).availability;
    return {
      id: p.id,
      slug: p.slug,
      sku: p.sku,
      name: this.text(fa?.name, en?.name),
      partType: p.partType,
      condition: p.condition,
      origin: p.origin,
      category: { slug: p.category.slug, name: this.text(p.category.nameFa, p.category.nameEn) },
      vehicleBrands: p.vehicleBrands.map((vb) => ({ slug: vb.vehicleBrand.slug, name: this.text(vb.vehicleBrand.nameFa, vb.vehicleBrand.nameEn) })),
      partNumber: p.partNumber ?? p.oemCodes[0] ?? null,
      // Price and stock are optional: without them the part is «قابل تأمین» (sourcing request).
      purchasable: price.status === 'PRICED' && availability !== 'OUT_OF_STOCK',
      // Loaded by productInclude in the same query as the list (no extra query per product).
      fitments: this.fitments(p),
      manufacturer: p.manufacturerBrand ? { slug: p.manufacturerBrand.slug, name: this.text(p.manufacturerBrand.nameFa, p.manufacturerBrand.nameEn) } : null,
      primaryImage: primary ? this.mediaView(primary) : null,
      availability,
      unit: unitRef(p.salesUnit),
      price: this.pricing.toView(price, viewer.display),
    };
  }

  toDetail(p: HydratedProduct, viewer: Viewer, rate: CurrentRate | null): ProductDetail {
    const fa = p.translations.find((t) => t.locale === 'fa');
    const en = p.translations.find((t) => t.locale === 'en');
    const specs = Array.isArray(p.specs) ? (p.specs as Array<{ key: string; labelFa: string; labelEn?: string; value: string }>) : [];
    const { available } = this.availability(p);
    return {
      ...this.toCard(p, viewer, rate),
      description: fa?.description || en?.description ? this.text(fa?.description, en?.description) : null,
      technicalNotes: fa?.technicalNotes || en?.technicalNotes ? this.text(fa?.technicalNotes, en?.technicalNotes) : null,
      packQuantity: p.packQuantity,
      countryOfManufacture: p.countryOfManufacture,
      warranty: fa?.warranty || en?.warranty ? this.text(fa?.warranty, en?.warranty) : null,
      oemCodes: p.oemCodes,
      // Older technical codes of the part count as equivalents (the main number is shown on its own).
      equivalents: [...new Set([...p.oemCodes.filter((c) => c !== (p.partNumber ?? p.oemCodes[0])), ...p.numbers.filter((n) => n.kind === 'EQUIVALENT').map((n) => n.number)])],
      replacements: p.numbers.filter((n) => n.kind === 'REPLACEMENT').map((n) => n.number),
      specs: specs.map((s) => ({ key: s.key, label: this.text(s.labelFa, s.labelEn), value: s.value })),
      images: p.media.map((m) => this.mediaView(m)),
      maxOrderQuantity: this.maxOrderAmount(p, available),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  /**
   * Public listing + search in one SQL path. Search matches normalized text
   * (every token, ی/ي, ک/ك, ZWNJ, digits) or the compact form, falling back to
   * trigram similarity for near-misses, ranked by similarity (spec §6, A04).
   */
  async list(query: ProductListQuery, viewer: Viewer, forceOrigin?: 'IMPORTED'): Promise<SearchResult> {
    const warehouseId = await this.inventory.defaultWarehouseId();
    const rate = await this.pricing.currentRate();
    const conditions: Prisma.Sql[] = [Prisma.sql`p."published" = TRUE`, Prisma.sql`p."archived_at" IS NULL`];
    // A vehicle-finder selection (group → vehicle → model → year) is checked first: an invalid one is a 400.
    const selection = await this.finder.resolve(query);

    const normalized = query.q ? normalizeSearchText(query.q) : '';
    const tokens = query.q ? searchTokens(query.q) : [];
    const compact = query.q ? compactSearchText(query.q) : '';
    // The main number or any other number, exactly. Looked up first (two index lookups) so the
    // search condition below stays a plain OR of indexed terms that Postgres can combine.
    const numberKey = query.q ? partNumberKey(query.q) : '';
    const numberIds = numberKey
      ? (await this.prisma.$queryRaw<Array<{ id: string }>>`SELECT p."id" FROM "product" p WHERE p."part_number_key" = ${numberKey}
          UNION SELECT pn."product_id" FROM "product_number" pn WHERE pn."number_key" = ${numberKey} LIMIT 500`).map((r) => r.id)
      : [];
    const numberMatch = numberIds.length ? Prisma.sql`p."id" = ANY(${numberIds}::uuid[])` : Prisma.sql`FALSE`;
    // The search condition: first the words / numbers as typed; only when that finds nothing, the
    // trigram near-miss (`%`), which on a large catalog reads many rows and is kept out of the usual path.
    let strict: Prisma.Sql | null = null;
    let fuzzy: Prisma.Sql | null = null;
    if (normalized) {
      // Every word must appear, either as typed or in the compact form, so a compound typed
      // without its half-space ("کمکفنر") still matches "کمک‌فنر" next to other words.
      const tokenMatch = tokens.length
        ? Prisma.join(
            tokens.map((t) => {
              const tc = compactSearchText(t);
              return tc
                ? Prisma.sql`(p."search_text" LIKE ${`%${escapeLike(t)}%`} OR p."search_compact" LIKE ${`%${escapeLike(tc)}%`})`
                : Prisma.sql`p."search_text" LIKE ${`%${escapeLike(t)}%`}`;
            }),
            ' AND ',
          )
        : Prisma.sql`FALSE`;
      strict = Prisma.sql`((${tokenMatch}) OR p."search_compact" LIKE ${`%${escapeLike(compact)}%`} OR ${numberMatch})`;
      fuzzy = Prisma.sql`(p."search_text" % ${normalized} OR ${numberMatch})`;
    }
    if (query.brand) {
      conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "product_vehicle_brand" pvb JOIN "vehicle_brand" vb ON vb."id" = pvb."vehicle_brand_id"
        WHERE pvb."product_id" = p."id" AND vb."slug" = ${query.brand})`);
    }
    if (selection) {
      conditions.push(this.finder.productCondition(selection));
    } else if (query.vehicle) {
      // A vehicle includes its models; a model also includes parts for the whole vehicle.
      const modelFilter = query.model
        ? Prisma.sql`AND EXISTS (SELECT 1 FROM "vehicle_model" vm WHERE vm."vehicle_id" = v."id" AND vm."slug" = ${query.model} AND vm."active"
            AND (pv."model_id" IS NULL OR pv."model_id" = vm."id"))`
        : Prisma.sql`AND (pv."model_id" IS NULL OR EXISTS (SELECT 1 FROM "vehicle_model" vm WHERE vm."id" = pv."model_id" AND vm."vehicle_id" = v."id" AND vm."active"))`;
      conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "product_vehicle" pv JOIN "vehicle" v ON v."id" = pv."vehicle_id"
        WHERE pv."product_id" = p."id" AND v."slug" = ${query.vehicle} AND v."active" ${modelFilter})`);
    } else if (query.model) {
      // Model slugs are scoped to a vehicle. An incomplete filter must not return unrelated parts.
      conditions.push(Prisma.sql`FALSE`);
    }
    if (query.category) {
      conditions.push(Prisma.sql`c."slug" = ${query.category} OR EXISTS (SELECT 1 FROM "category" pc WHERE pc."id" = c."parent_id" AND pc."slug" = ${query.category})`);
    }
    if (query.maker) {
      conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "manufacturer_brand" mb WHERE mb."id" = p."manufacturer_brand_id" AND mb."slug" = ${query.maker})`);
    }
    if (query.partType) conditions.push(Prisma.sql`p."part_type" = ${query.partType}::"PartType"`);
    if (query.condition) conditions.push(Prisma.sql`p."condition" = ${query.condition}::"PhysicalCondition"`);
    const origin = forceOrigin ?? query.origin;
    if (origin) conditions.push(Prisma.sql`p."origin" = ${origin}::"ProductOrigin"`);
    if (query.inStock === '1') conditions.push(Prisma.sql`p."is_sellable" AND pp."product_id" IS NOT NULL AND COALESCE(ib."on_hand" - ib."reserved", 0) > 0`);

    // Public IRR price expression for sorting (group prices are not used for ordering).
    const rateSql = rate ? Prisma.sql`${rate.irrPerAed}::numeric` : Prisma.sql`NULL::numeric`;
    const priceExpr = Prisma.sql`COALESCE(pp."manual_irr_minor"::numeric,
      CASE WHEN pp."base_currency" = 'IRR' THEN pp."base_amount_minor"::numeric ELSE pp."base_amount_minor"::numeric * ${rateSql} / 100 END)`;
    // A technical number typed in any form (main, equivalent or replacement) puts that part first.
    // (A bare FALSE is not allowed in ORDER BY, so the empty case compares the id.)
    const exact = numberIds.length ? numberMatch : Prisma.sql`(p."id" IS NULL)`;
    const inStock = Prisma.sql`(p."is_sellable" AND pp."product_id" IS NOT NULL AND COALESCE(ib."on_hand" - ib."reserved", 0) > 0)`;
    const score = normalized
      ? Prisma.sql`GREATEST(similarity(p."search_text", ${normalized}), similarity(p."search_compact", ${compact}))`
      : Prisma.sql`0`;
    const orderBy =
      query.sort === 'price_asc'
        ? Prisma.sql`${priceExpr} ASC NULLS LAST, p."id"`
        : query.sort === 'price_desc'
          ? Prisma.sql`${priceExpr} DESC NULLS LAST, p."id"`
          : query.sort === 'newest'
            ? Prisma.sql`p."published_at" DESC NULLS LAST, p."id"`
            : query.sort === 'name'
              ? Prisma.sql`p."search_text" ASC, p."id"`
              : normalized
                ? Prisma.sql`${exact} DESC, ${inStock} DESC, ${score} DESC, p."id"`
                : Prisma.sql`${inStock} DESC, p."published_at" DESC NULLS LAST, p."id"`;

    const from = Prisma.sql`FROM "product" p
      JOIN "category" c ON c."id" = p."category_id"
      LEFT JOIN "product_price" pp ON pp."product_id" = p."id"
      LEFT JOIN "inventory_balance" ib ON ib."product_id" = p."id" AND ib."warehouse_id" = ${warehouseId}::uuid`;
    const offset = (query.page - 1) * query.pageSize;
    const run = (search: Prisma.Sql | null) => {
      const where = Prisma.join([...conditions, ...(search ? [search] : [])].map((c) => Prisma.sql`(${c})`), ' AND ');
      return Promise.all([
        this.prisma.$queryRaw<Array<{ id: string }>>`SELECT p."id" ${from} WHERE ${where} ORDER BY ${orderBy} LIMIT ${query.pageSize} OFFSET ${offset}`,
        this.prisma.$queryRaw<Array<{ total: bigint }>>`SELECT COUNT(*)::bigint AS total ${from} WHERE ${where}`,
      ]);
    };
    let [idRows, countRows] = await run(strict);
    if (fuzzy && query.page === 1 && Number(countRows[0]?.total ?? 0n) === 0) {
      // Near misses: one page, no separate count, and at most 1.5 s — on a large catalog a short or
      // common query reads many rows; when it runs out of time the page offers a sourcing request.
      const near = fuzzy;
      idRows = await this.prisma
        .$transaction(async (tx) => {
          await tx.$executeRaw`SET LOCAL statement_timeout = 1500`;
          const where = Prisma.join([...conditions, near].map((c) => Prisma.sql`(${c})`), ' AND ');
          return tx.$queryRaw<Array<{ id: string }>>`SELECT p."id" ${from} WHERE ${where} ORDER BY ${orderBy} LIMIT ${query.pageSize}`;
        })
        .catch(() => []);
      countRows = [{ total: BigInt(idRows.length) }];
    }
    const ids = idRows.map((r) => r.id);
    const products = ids.length
      ? await this.prisma.product.findMany({ where: { id: { in: ids } }, include: productInclude(warehouseId) })
      : [];
    const byId = new Map(products.map((p) => [p.id, p]));
    const confirmed = selection?.year != null ? await this.finder.yearConfirmed(selection, ids) : null;
    return {
      items: ids.map((id) => byId.get(id)).filter((p): p is HydratedProduct => !!p).map((p) => {
        const card = this.toCard(p, viewer, rate);
        return confirmed && !confirmed.has(p.id) ? { ...card, fitmentYearUnconfirmed: true } : card;
      }),
      total: Number(countRows[0]?.total ?? 0n),
      page: query.page,
      pageSize: query.pageSize,
      query: normalized || null,
      ...(selection ? { selection: selection.view } : {}),
    };
  }

  async detail(slug: string, viewer: Viewer): Promise<ProductDetail | null> {
    const warehouseId = await this.inventory.defaultWarehouseId();
    const p = await this.prisma.product.findFirst({ where: { slug, published: true }, include: productInclude(warehouseId) });
    if (!p) return null;
    // Archived products stay visible by slug (history links) but are never buyable.
    return this.toDetail(p, viewer, await this.pricing.currentRate());
  }

  async hydrate(ids: string[]): Promise<Map<string, HydratedProduct>> {
    const warehouseId = await this.inventory.defaultWarehouseId();
    const rows = await this.prisma.product.findMany({ where: { id: { in: ids } }, include: productInclude(warehouseId) });
    return new Map(rows.map((r) => [r.id, r]));
  }

  async categories(): Promise<CategoryView[]> {
    const rows = await this.prisma.category.findMany({
      where: { active: true },
      include: { parent: { select: { slug: true } }, _count: { select: { products: { where: { published: true, archivedAt: null } } } } },
      orderBy: [{ sortOrder: 'asc' }, { nameFa: 'asc' }],
    });
    return rows.map((c) => ({
      code: c.code,
      slug: c.slug,
      name: this.text(c.nameFa, c.nameEn),
      parentSlug: c.parent?.slug ?? null,
      productCount: c._count.products,
    }));
  }

  async vehicleBrands(): Promise<VehicleBrandView[]> {
    const rows = await this.prisma.vehicleBrand.findMany({
      where: { active: true },
      include: { _count: { select: { products: { where: { product: { published: true, archivedAt: null } } } } } },
      orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }, { nameFa: 'asc' }],
    });
    return rows.map((b) => ({
      code: b.code,
      slug: b.slug,
      name: this.text(b.nameFa, b.nameEn),
      logoUrl: b.logoUrl,
      isFeatured: b.isFeatured,
      productCount: b._count.products,
    }));
  }

  /** Slugs + timestamps for the public sitemap (published, not archived). */
  /** Makers with published parts, most parts first. */
  async manufacturers(): Promise<ManufacturerView[]> {
    const rows = await this.prisma.manufacturerBrand.findMany({
      where: { active: true, products: { some: { published: true, archivedAt: null } } },
      include: { _count: { select: { products: { where: { published: true, archivedAt: null } } } } },
    });
    return rows
      .map((m) => ({ slug: m.slug, name: this.text(m.nameFa, m.nameEn), productCount: m._count.products }))
      .sort((a, b) => b.productCount - a.productCount || a.name.fa.localeCompare(b.name.fa, 'fa'));
  }

  /** Old technical catalog address (/catalog/[slug]) → the part it became, for the 301 redirect. */
  async legacyCatalogSlug(slug: string): Promise<{ slug: string } | null> {
    const row = await this.prisma.catalogEntryMigration.findUnique({ where: { legacySlug: slug }, select: { productId: true } });
    if (!row) return null;
    const p = await this.prisma.product.findUnique({ where: { id: row.productId }, select: { slug: true } });
    return p ? { slug: p.slug } : null;
  }

  /** Sitemap files hold at most this many parts each. */
  static readonly SITEMAP_PAGE = 40_000;

  async sitemapPages(): Promise<{ pages: number }> {
    const total = await this.prisma.product.count({ where: { published: true, archivedAt: null } });
    return { pages: Math.max(1, Math.ceil(total / CatalogService.SITEMAP_PAGE)) };
  }

  async sitemapEntries(page = 0): Promise<Array<{ slug: string; updatedAt: string }>> {
    const rows = await this.prisma.product.findMany({
      where: { published: true, archivedAt: null },
      select: { slug: true, updatedAt: true },
      orderBy: { id: 'asc' },
      skip: page * CatalogService.SITEMAP_PAGE,
      take: CatalogService.SITEMAP_PAGE,
    });
    return rows.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt.toISOString() }));
  }
}
