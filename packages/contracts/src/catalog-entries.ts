import { z } from 'zod';
import type { BrandRef, MediaView } from './catalog.js';
import { idSchema, type LocalizedText } from './common.js';

/**
 * Technical parts catalog («کاتالوگ فنی قطعات»): reference entries edited in panel → knowledge
 * center → catalog parts and shown on /catalog. No price, no stock; an entry may be linked by hand
 * to one shop product.
 */
export const CATALOG_ENTRY_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export type CatalogEntryStatus = (typeof CATALOG_ENTRY_STATUSES)[number];

const text = (max: number) => z.string().trim().max(max);
const numberList = z.array(text(80).min(1)).max(50).default([]);

export const catalogEntryVehicleSchema = z.object({
  vehicleId: idSchema,
  modelId: idSchema.nullable().default(null),
  yearFrom: z.number().int().min(1300).max(2100).nullable().default(null),
  yearTo: z.number().int().min(1300).max(2100).nullable().default(null),
  note: text(200).nullable().default(null),
}).refine((v) => v.yearFrom === null || v.yearTo === null || v.yearTo >= v.yearFrom, { message: 'yearTo must not be before yearFrom', path: ['yearTo'] });

export const catalogSpecSchema = z.object({ label: text(80).min(1), value: text(200).min(1) });

/** Create and edit (the whole entry is sent each time). */
export const catalogEntryInputSchema = z.object({
  partNumber: text(80).min(1),
  nameFa: text(200).min(1),
  nameEn: text(200).nullable().default(null),
  equivalents: numberList,
  replacements: numberList,
  manufacturerBrandId: idSchema.nullable().default(null),
  categoryId: idSchema.nullable().default(null),
  vehicleBrandIds: z.array(idSchema).max(30).default([]),
  vehicles: z.array(catalogEntryVehicleSchema).max(100).default([]),
  specs: z.array(catalogSpecSchema).max(60).default([]),
  descriptionFa: text(5000).nullable().default(null),
  descriptionEn: text(5000).nullable().default(null),
  sourceDocumentId: idSchema.nullable().default(null),
  /** Only by hand: nothing becomes a shop product, and no product is linked, automatically. */
  productId: idSchema.nullable().default(null),
  status: z.enum(CATALOG_ENTRY_STATUSES).default('DRAFT'),
});
export type CatalogEntryInput = z.infer<typeof catalogEntryInputSchema>;

export const catalogEntryAdminQuerySchema = z.object({
  q: text(120).optional(),
  vehicleBrand: idSchema.optional(),
  vehicle: idSchema.optional(),
  category: idSchema.optional(),
  status: z.enum(CATALOG_ENTRY_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/** Public search: name or any technical number (spaces, dashes and Persian digits do not matter). */
export const catalogEntryPublicQuerySchema = z.object({
  q: text(120).optional(),
  /** Vehicle brand slug (ایران خودرو …). */
  brand: z.string().max(80).optional(),
  /** Vehicle slug (پژو …) and, with it, a model slug. */
  vehicle: z.string().max(80).optional(),
  model: z.string().max(80).optional(),
  /** Category slug. */
  category: z.string().max(80).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
});
export type CatalogEntryPublicQuery = z.infer<typeof catalogEntryPublicQuerySchema>;

export const catalogImageOrderSchema = z.object({ ids: z.array(idSchema).min(1).max(30) });
export const catalogImportStartSchema = z.object({ attachmentId: idSchema });
/** Rows whose technical number already exists: update those entries, or leave them out. */
export const catalogImportCommitSchema = z.object({ duplicates: z.enum(['update', 'skip']) });

export interface CatalogFitmentView {
  vehicle: { slug: string; name: LocalizedText };
  model: { slug: string; name: LocalizedText } | null;
  yearFrom: number | null;
  yearTo: number | null;
  note: string | null;
}

/** One result on /catalog and the home page. */
export interface CatalogEntryCard {
  slug: string;
  partNumber: string;
  name: LocalizedText;
  manufacturer: BrandRef | null;
  category: BrandRef | null;
  image: MediaView | null;
  fitments: CatalogFitmentView[];
  /** Linked to a shop product (the detail page offers «مشاهده و خرید در فروشگاه»). */
  inShop: boolean;
}

export interface CatalogEntryDetail extends CatalogEntryCard {
  equivalents: string[];
  replacements: string[];
  vehicleBrands: BrandRef[];
  specs: Array<{ label: string; value: string }>;
  description: LocalizedText | null;
  images: MediaView[];
  /** The linked shop product's page slug, when there is one. */
  product: { slug: string; name: LocalizedText } | null;
  updatedAt: string;
}

export interface CatalogEntrySearchResult {
  items: CatalogEntryCard[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CatalogEntryAdminRow {
  id: string;
  slug: string;
  partNumber: string;
  nameFa: string;
  nameEn: string | null;
  status: CatalogEntryStatus;
  category: string | null;
  manufacturer: string | null;
  imageUrl: string | null;
  imageCount: number;
  vehicleCount: number;
  product: { id: string; sku: string; nameFa: string } | null;
  updatedAt: string;
}

export interface CatalogEntryImageView {
  id: string;
  url: string;
  width: number;
  height: number;
  sortOrder: number;
}

export interface CatalogEntryAdminDetail extends Omit<CatalogEntryInput, 'vehicles'> {
  id: string;
  slug: string;
  vehicles: Array<z.infer<typeof catalogEntryVehicleSchema> & { vehicleName: string; modelName: string | null }>;
  images: CatalogEntryImageView[];
  product: { id: string; sku: string; nameFa: string } | null;
  sourceDocument: { id: string; title: string } | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

/** A form pre-filled from an extracted candidate row («تبدیل به آیتم کاتالوگ»). */
export interface CatalogEntryDraftView {
  partNumber: string;
  nameFa: string;
  sourceDocumentId: string;
  vehicles: Array<{ vehicleId: string; modelId: string | null; vehicleName: string; modelName: string | null }>;
  /** Vehicle text from the file that matches no known vehicle (shown so it can be added by hand). */
  unmatchedVehicles: string[];
  /** The entry that already has this number, if any (the form opens it instead of a new one). */
  existingId: string | null;
}

export type CatalogImportRowState = 'NEW' | 'DUPLICATE' | 'ERROR';

export interface CatalogImportRowView {
  rowNumber: number;
  partNumber: string;
  nameFa: string;
  state: CatalogImportRowState;
  /** Error codes (CatalogRowIssue, or DUPLICATE_IN_FILE) — the row cannot be imported. */
  issues: string[];
  /** Cell parts behind the errors (e.g. a spec without «:»). */
  details: string[];
  /** Names in the file that match nothing in the site (not linked; the row is still imported). */
  warnings: string[];
}

export interface CatalogImportView {
  id: string;
  status: 'QUEUED' | 'PARSING' | 'PREVIEW_READY' | 'FAILED' | 'COMMITTING' | 'COMMITTED';
  filename: string;
  failureReason: string | null;
  missingColumns: string[];
  summary: { total: number; valid: number; duplicates: number; errors: number; created?: number; updated?: number; skipped?: number } | null;
  rows: CatalogImportRowView[];
  truncated: boolean;
  committedAt: string | null;
}

/** Bulk photos: catalog entries a file-name code belongs to (main or other technical number). */
export interface CatalogCodeLookupView {
  matches: Record<string, Array<{ id: string; partNumber: string; nameFa: string; photoCount: number }>>;
}
