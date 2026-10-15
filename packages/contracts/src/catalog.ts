import { z } from 'zod';
import { type Currency, type LocalizedText, type MoneyDto, amountMinorSchema, currencySchema, idSchema, skuSchema, slugSchema } from './common.js';
import { type FitmentView, productVehicleSchema } from './vehicles.js';

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
  /** Vehicle slug (/cars/[slug]): parts for the whole vehicle and for any of its models. */
  vehicle: z.string().max(80).optional(),
  /** With `vehicle`: one model's slug; parts for that model plus parts for the whole vehicle. */
  model: z.string().max(80).optional(),
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

/**
 * A quantity in a product's sales unit (whole for «عدد», halves for «لیتر» …), up to three
 * decimals. The server checks it against the unit (decimals allowed, multiple of the step).
 */
export const unitQuantitySchema = z.number().positive().max(10_000_000).refine((n) => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6, { message: 'UNIT_QUANTITY_INVALID' });
/** Same, zero allowed (stock counts, thresholds, removing a cart line). */
export const unitQuantityOrZeroSchema = z.number().min(0).max(10_000_000).refine((n) => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6, { message: 'UNIT_QUANTITY_INVALID' });

/** A product's sales unit as shown next to quantities and prices («۲۵۰٬۰۰۰ تومان / دست»). */
export interface UnitRef {
  name: string;
  nameEn: string | null;
  allowDecimal: boolean;
  /** Smallest amount that can be sold, e.g. 0.5 for litres. */
  step: number;
}

/** Sales units, managed in the panel (products → units). */
export const unitUpsertSchema = z.object({
  name: z.string().trim().min(1).max(30),
  nameEn: z.string().trim().max(30).optional().nullable(),
  allowDecimal: z.boolean().default(false),
  step: z.number().positive().max(1000),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});
/** Partial edit: only the fields sent change (no defaults, so an edit never resets other fields). */
export const unitUpdateSchema = z.object({
  name: z.string().trim().min(1).max(30).optional(),
  nameEn: z.string().trim().max(30).optional().nullable(),
  allowDecimal: z.boolean().optional(),
  step: z.number().positive().max(1000).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

export interface UnitView extends UnitRef {
  id: string;
  active: boolean;
  sortOrder: number;
  /** Products using the unit: such a unit cannot be deleted, and its step and decimal rule are fixed. */
  productCount: number;
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
  /** The price is per this unit («… تومان / دست»). */
  unit: UnitRef;
  price: PriceView;
}

export interface ProductDetail extends ProductCard {
  description: LocalizedText | null;
  technicalNotes: LocalizedText | null;
  /** «مناسب برای:» chips under the photo (vehicles and models). */
  fitments: FitmentView[];
  packQuantity: number;
  countryOfManufacture: string | null;
  warranty: LocalizedText | null;
  oemCodes: string[];
  specs: Array<{ key: string; label: LocalizedText; value: string }>;
  images: MediaView[];
  /** Maximum quantity (in the unit) the viewer may add right now (never exposes exact reserved counts). */
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
  /** «کاربرد در خودرو»: whole vehicles (modelId null) and/or specific models. */
  vehicles: z.array(productVehicleSchema).max(100).default([]),
  partType: partTypeSchema,
  condition: conditionSchema,
  origin: originSchema,
  countryOfManufacture: z.string().length(2).toUpperCase().optional().nullable(),
  warrantyFa: z.string().max(500).optional().nullable(),
  warrantyEn: z.string().max(500).optional().nullable(),
  /** Sales unit (required; panel → units). Quantities of the product follow its rules. */
  unitId: idSchema,
  packQuantity: z.number().int().min(1).max(10_000).default(1),
  oemCodes: z.array(z.string().trim().min(1).max(64)).max(30).default([]),
  specs: z.array(z.object({ key: z.string().max(64), labelFa: z.string().max(100), labelEn: z.string().max(100).optional(), value: z.string().max(300) })).max(50).default([]),
  basePrice: z.object({ currency: currencySchema, amountMinor: amountMinorSchema }),
  manualPriceIrr: amountMinorSchema.optional().nullable(),
  manualPriceAed: amountMinorSchema.optional().nullable(),
  /** In the product's unit (e.g. 2.5 litres). */
  lowStockThreshold: unitQuantityOrZeroSchema.default(0),
  isSellable: z.boolean().default(true),
  /** Optimistic lock: required for updates. */
  version: z.number().int().min(0).optional(),
});
export type ProductUpsert = z.infer<typeof productUpsertSchema>;

export const productPublishSchema = z.object({ published: z.boolean(), version: z.number().int().min(0) });

export const priceRuleSchema = z.object({
  customerGroupId: idSchema.nullable(),
  /** In the product's unit. */
  minQty: unitQuantitySchema,
  maxQty: unitQuantitySchema.nullable(),
  basePrice: z.object({ currency: currencySchema, amountMinor: amountMinorSchema }),
  manualPriceIrr: amountMinorSchema.nullable().optional(),
  manualPriceAed: amountMinorSchema.nullable().optional(),
  validFrom: z.iso.datetime().nullable().optional(),
  validTo: z.iso.datetime().nullable().optional(),
});

/** Partial update of one product photo: only the fields sent change. */
export const mediaUpdateSchema = z.object({
  altFa: z.string().trim().min(2).max(200).optional(),
  altEn: z.string().trim().max(200).optional().nullable(),
  sortOrder: z.number().int().min(0).max(100).optional(),
  isPrimary: z.literal(true).optional(),
});

/** The product's photos in their new order (every current photo exactly once). */
export const mediaOrderSchema = z.object({
  ids: z.array(idSchema).min(1).max(50),
});

export interface ProductMediaView {
  id: string;
  storageKey: string;
  width: number;
  height: number;
  altFa: string;
  altEn: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

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
  /** Stock figures below are in this unit. */
  unit: UnitRef;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  version: number;
  updatedAt: string;
}

export const DISPLAY_CURRENCIES: readonly Currency[] = ['IRR', 'AED'];
