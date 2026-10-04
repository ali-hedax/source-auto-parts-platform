import { z } from 'zod';
import { type Currency, type LocalizedText, type MoneyDto, amountMinorSchema, currencySchema, idSchema, skuSchema, slugSchema } from './common.js';

export const PART_TYPE_VALUES = ['GENUINE', 'OEM', 'AFTERMARKET'] as const;
export const CONDITION_VALUES = ['NEW', 'USED', 'REFURBISHED'] as const;
export const ORIGIN_VALUES = ['DOMESTIC', 'IMPORTED', 'UNKNOWN'] as const;
export const partTypeSchema = z.enum(PART_TYPE_VALUES);
export const conditionSchema = z.enum(CONDITION_VALUES);
export const originSchema = z.enum(ORIGIN_VALUES);
export type PartType = z.infer<typeof partTypeSchema>;
export type PhysicalCondition = z.infer<typeof conditionSchema>;
export type Origin = z.infer<typeof originSchema>;

export const PRODUCT_SORTS = ['relevance', 'newest', 'price_asc', 'price_desc', 'name'] as const;

/** Public catalog listing query. Every filter lives in the URL. */
export const productListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  brand: z.string().max(64).optional(), // vehicle brand slug
  category: z.string().max(64).optional(),
  partType: partTypeSchema.optional(),
  condition: conditionSchema.optional(),
  origin: originSchema.optional(),
  inStock: z.enum(['1', '0']).optional(),
  sort: z.enum(PRODUCT_SORTS).default('relevance'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export type Availability = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

/** Price as shown to the current viewer. `payable` is always IRR; `display` follows the chosen currency. */
export type PriceView =
  | { kind: 'inquiry'; reason: 'NO_PRICE' | 'NO_VALID_FX_RATE' }
  | {
      kind: 'price';
      payable: MoneyDto; // IRR
      display: MoneyDto; // IRR or AED
      displayIsReference: boolean;
    };

export interface MediaView {
  url: string;
  width: number;
  height: number;
  alt: LocalizedText;
}

export interface BrandRef {
  slug: string;
  name: LocalizedText;
}

export interface ProductCard {
  id: string;
  slug: string;
  sku: string;
  name: LocalizedText;
  partType: PartType;
  condition: PhysicalCondition;
  origin: Origin;
  category: BrandRef | null;
  vehicleBrands: BrandRef[];
  manufacturer: BrandRef | null;
  primaryImage: MediaView | null;
  availability: Availability;
  price: PriceView;
}

export interface ProductDetail extends ProductCard {
  description: LocalizedText | null;
  technicalNotes: LocalizedText | null;
  unit: string;
  packQuantity: number;
  countryOfManufacture: string | null;
  warranty: LocalizedText | null;
  oemCodes: string[];
  specs: Array<{ key: string; label: LocalizedText; value: string }>;
  images: MediaView[];
  /** Maximum quantity the viewer may add right now (never exposes exact reserved counts). */
  maxOrderQuantity: number;
  updatedAt: string;
}

export interface CategoryView {
  code: string;
  slug: string;
  name: LocalizedText;
  parentSlug: string | null;
  productCount: number;
}

export interface VehicleBrandView {
  code: string;
  slug: string;
  name: LocalizedText;
  isFeatured: boolean;
  productCount: number;
}

export interface SearchResult {
  items: ProductCard[];
  total: number;
  page: number;
  pageSize: number;
  /** Echo of the normalized query, used to prefill a sourcing request when nothing matches. */
  query: string | null;
}

// ---------------------------------------------------------------------------
// Admin product management
// ---------------------------------------------------------------------------

export const productUpsertSchema = z.object({
  sku: skuSchema,
  slug: slugSchema.optional(),
  nameFa: z.string().trim().min(2).max(200),
  nameEn: z.string().trim().max(200).optional().nullable(),
  aliases: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  descriptionFa: z.string().max(5000).optional().nullable(),
  descriptionEn: z.string().max(5000).optional().nullable(),
  categoryId: idSchema,
  manufacturerBrandId: idSchema.optional().nullable(),
  vehicleBrandIds: z.array(idSchema).max(20).default([]),
  partType: partTypeSchema,
  condition: conditionSchema,
  origin: originSchema,
  countryOfManufacture: z.string().length(2).toUpperCase().optional().nullable(),
  warrantyFa: z.string().max(500).optional().nullable(),
  warrantyEn: z.string().max(500).optional().nullable(),
  unit: z.string().trim().min(1).max(30).default('عدد'),
  packQuantity: z.number().int().min(1).max(10_000).default(1),
  oemCodes: z.array(z.string().trim().min(1).max(64)).max(30).default([]),
  specs: z.array(z.object({ key: z.string().max(64), labelFa: z.string().max(100), labelEn: z.string().max(100).optional(), value: z.string().max(300) })).max(50).default([]),
  basePrice: z.object({ currency: currencySchema, amountMinor: amountMinorSchema }),
  manualPriceIrr: amountMinorSchema.optional().nullable(),
  manualPriceAed: amountMinorSchema.optional().nullable(),
  lowStockThreshold: z.number().int().min(0).max(1_000_000).default(0),
  isSellable: z.boolean().default(true),
  /** Optimistic lock: required for updates. */
  version: z.number().int().min(0).optional(),
});
export type ProductUpsert = z.infer<typeof productUpsertSchema>;

export const productPublishSchema = z.object({ published: z.boolean(), version: z.number().int().min(0) });

export const priceRuleSchema = z.object({
  customerGroupId: idSchema.nullable(),
  minQty: z.number().int().min(1),
  maxQty: z.number().int().min(1).nullable(),
  basePrice: z.object({ currency: currencySchema, amountMinor: amountMinorSchema }),
  manualPriceIrr: amountMinorSchema.nullable().optional(),
  manualPriceAed: amountMinorSchema.nullable().optional(),
  validFrom: z.iso.datetime().nullable().optional(),
  validTo: z.iso.datetime().nullable().optional(),
});

export const mediaUpdateSchema = z.object({
  altFa: z.string().trim().min(2).max(200),
  altEn: z.string().trim().max(200).optional().nullable(),
  sortOrder: z.number().int().min(0).max(100),
  isPrimary: z.boolean(),
});

export interface AdminProductRow {
  id: string;
  sku: string;
  nameFa: string;
  nameEn: string | null;
  categoryName: string | null;
  published: boolean;
  archived: boolean;
  basePrice: MoneyDto;
  priceSource: string;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  version: number;
  updatedAt: string;
}

export const DISPLAY_CURRENCIES: readonly Currency[] = ['IRR', 'AED'];
