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
  VehicleBrandView,
} from '@hedax/contracts';
import { type CurrencyCode, compactSearchText, normalizeSearchText, searchTokens } from '@hedax/domain';
import { ENV, type Env } from '../../config/env.js';
import { Prisma, PrismaService } from '../../common/prisma.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { type CurrentRate, PricingService } from '../pricing/pricing.service.js';

const productInclude = (warehouseId: string) =>
  ({
    translations: true,
    category: true,
    manufacturerBrand: true,
    vehicleBrands: { include: { vehicleBrand: true } },
    media: { where: { deletedAt: null }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
    basePrice: true,
    priceRules: { where: { active: true } },
    inventory: { where: { warehouseId } },
  }) satisfies Prisma.ProductInclude;

type HydratedProduct = Prisma.ProductGetPayload<{ include: ReturnType<typeof productInclude> }>;

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
  ) {}

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

  toCard(p: HydratedProduct, viewer: Viewer, rate: CurrentRate | null): ProductCard {
    const fa = p.translations.find((t) => t.locale === 'fa');
    const en = p.translations.find((t) => t.locale === 'en');
    const primary = p.media[0];
    const price = this.pricing.resolve(p.basePrice, p.priceRules, 1, viewer.approvedGroupId, rate);
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
      manufacturer: p.manufacturerBrand ? { slug: p.manufacturerBrand.slug, name: this.text(p.manufacturerBrand.nameFa, p.manufacturerBrand.nameEn) } : null,
      primaryImage: primary ? this.mediaView(primary) : null,
      availability: this.availability(p).availability,
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
      unit: p.unit,
      packQuantity: p.packQuantity,
      countryOfManufacture: p.countryOfManufacture,
      warranty: fa?.warranty || en?.warranty ? this.text(fa?.warranty, en?.warranty) : null,
      oemCodes: p.oemCodes,
      specs: specs.map((s) => ({ key: s.key, label: this.text(s.labelFa, s.labelEn), value: s.value })),
      images: p.media.map((m) => this.mediaView(m)),
      maxOrderQuantity: Math.min(available, 999),
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

    const normalized = query.q ? normalizeSearchText(query.q) : '';
    const tokens = query.q ? searchTokens(query.q) : [];
    const compact = query.q ? compactSearchText(query.q) : '';
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
      conditions.push(
        Prisma.sql`((${tokenMatch}) OR p."search_compact" LIKE ${`%${escapeLike(compact)}%`} OR p."search_text" % ${normalized})`,
      );
    }
    if (query.brand) {
      conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "product_vehicle_brand" pvb JOIN "vehicle_brand" vb ON vb."id" = pvb."vehicle_brand_id"
        WHERE pvb."product_id" = p."id" AND vb."slug" = ${query.brand})`);
    }
    if (query.category) {
      conditions.push(Prisma.sql`c."slug" = ${query.category} OR EXISTS (SELECT 1 FROM "category" pc WHERE pc."id" = c."parent_id" AND pc."slug" = ${query.category})`);
    }
    if (query.partType) conditions.push(Prisma.sql`p."part_type" = ${query.partType}::"PartType"`);
    if (query.condition) conditions.push(Prisma.sql`p."condition" = ${query.condition}::"PhysicalCondition"`);
    const origin = forceOrigin ?? query.origin;
    if (origin) conditions.push(Prisma.sql`p."origin" = ${origin}::"ProductOrigin"`);
    if (query.inStock === '1') conditions.push(Prisma.sql`p."is_sellable" AND COALESCE(ib."on_hand" - ib."reserved", 0) > 0`);

    const where = Prisma.join(conditions.map((c) => Prisma.sql`(${c})`), ' AND ');
    // Public IRR price expression for sorting (group prices are not used for ordering).
    const rateSql = rate ? Prisma.sql`${rate.irrPerAed}::numeric` : Prisma.sql`NULL::numeric`;
    const priceExpr = Prisma.sql`COALESCE(pp."manual_irr_minor"::numeric,
      CASE WHEN pp."base_currency" = 'IRR' THEN pp."base_amount_minor"::numeric ELSE pp."base_amount_minor"::numeric * ${rateSql} / 100 END)`;
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
                ? Prisma.sql`${score} DESC, (COALESCE(ib."on_hand" - ib."reserved", 0) > 0) DESC, p."id"`
                : Prisma.sql`(COALESCE(ib."on_hand" - ib."reserved", 0) > 0) DESC, p."published_at" DESC NULLS LAST, p."id"`;

    const from = Prisma.sql`FROM "product" p
      JOIN "category" c ON c."id" = p."category_id"
      LEFT JOIN "product_price" pp ON pp."product_id" = p."id"
      LEFT JOIN "inventory_balance" ib ON ib."product_id" = p."id" AND ib."warehouse_id" = ${warehouseId}::uuid`;
    const offset = (query.page - 1) * query.pageSize;
    const [idRows, countRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string }>>`SELECT p."id" ${from} WHERE ${where} ORDER BY ${orderBy} LIMIT ${query.pageSize} OFFSET ${offset}`,
      this.prisma.$queryRaw<Array<{ total: bigint }>>`SELECT COUNT(*)::bigint AS total ${from} WHERE ${where}`,
    ]);
    const ids = idRows.map((r) => r.id);
    const products = ids.length
      ? await this.prisma.product.findMany({ where: { id: { in: ids } }, include: productInclude(warehouseId) })
      : [];
    const byId = new Map(products.map((p) => [p.id, p]));
    return {
      items: ids.map((id) => byId.get(id)).filter((p): p is HydratedProduct => !!p).map((p) => this.toCard(p, viewer, rate)),
      total: Number(countRows[0]?.total ?? 0n),
      page: query.page,
      pageSize: query.pageSize,
      query: normalized || null,
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
      isFeatured: b.isFeatured,
      productCount: b._count.products,
    }));
  }

  /** Slugs + timestamps for the public sitemap (published, not archived). */
  async sitemapEntries(): Promise<Array<{ slug: string; updatedAt: string }>> {
    const rows = await this.prisma.product.findMany({
      where: { published: true, archivedAt: null },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 50_000,
    });
    return rows.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt.toISOString() }));
  }
}
