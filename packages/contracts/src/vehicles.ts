import { z } from 'zod';
import { type LocalizedText, idSchema } from './common.js';

// ---------------------------------------------------------------------------
// Vehicle fitment («کاربرد در خودرو»): categories, vehicles, models/trims
// ---------------------------------------------------------------------------

const vehicleSlugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,69}$/, { message: 'INVALID_SLUG' });

/** A vehicle category such as «سواری», «وانت» or «برقی» (any the owner defines). */
export const vehicleCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  nameEn: z.string().trim().max(80).optional().nullable(),
  slug: vehicleSlugSchema.optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
  active: z.boolean().optional(),
});
export const vehicleCategoryUpdateSchema = vehicleCategorySchema.partial();

/** A vehicle: name, category (optional), page address, order, active, and its page's SEO texts. */
export const vehicleSchema = z.object({
  name: z.string().trim().min(1).max(80),
  nameEn: z.string().trim().max(80).optional().nullable(),
  slug: vehicleSlugSchema.optional(),
  categoryId: idSchema.nullable().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
  active: z.boolean().optional(),
  seoTitle: z.string().trim().max(120).optional().nullable(),
  seoDescription: z.string().trim().max(300).optional().nullable(),
});
export const vehicleUpdateSchema = vehicleSchema.partial();

/** A model / trim under a vehicle (پژو ← ۲۰۶، ۴۰۵، پارس). */
export const vehicleModelSchema = z.object({
  name: z.string().trim().min(1).max(80),
  nameEn: z.string().trim().max(80).optional().nullable(),
  slug: vehicleSlugSchema.optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
  active: z.boolean().optional(),
});
export const vehicleModelUpdateSchema = vehicleModelSchema.partial();

/** Drag-and-drop: the ids in their new order. */
export const vehicleReorderSchema = z.object({ ids: z.array(idSchema).min(1).max(2000) });

/** Merging a duplicate: every product of `sourceId` moves to `targetId`, then `sourceId` is deleted. */
export const vehicleMergeSchema = z.object({ sourceId: idSchema });

/** Adding a vehicle from the product form; `confirmNew` overrides the «very similar name» warning. */
export const vehicleQuickAddSchema = z.object({
  name: z.string().trim().min(1).max(80),
  confirmNew: z.boolean().default(false),
});

/** A product's fitment: a whole vehicle (modelId null) or one of its models. */
export const productVehicleSchema = z.object({
  vehicleId: idSchema,
  modelId: idSchema.nullable().default(null),
  /** Years of manufacture the part fits (Persian or Gregorian), optional. */
  yearFrom: z.number().int().min(1300).max(2100).nullable().default(null),
  yearTo: z.number().int().min(1300).max(2100).nullable().default(null),
  note: z.string().trim().max(200).nullable().default(null),
});

export interface VehicleCategoryView {
  id: string;
  name: string;
  nameEn: string | null;
  slug: string;
  sortOrder: number;
  active: boolean;
  vehicleCount: number;
}

export interface VehicleModelAdminView {
  id: string;
  name: string;
  nameEn: string | null;
  slug: string;
  sortOrder: number;
  active: boolean;
  productCount: number;
}

export interface VehicleAdminView {
  id: string;
  name: string;
  nameEn: string | null;
  slug: string;
  categoryId: string | null;
  sortOrder: number;
  active: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  /** Products linked to the vehicle or any of its models: such a vehicle is merged or deactivated, never deleted. */
  productCount: number;
  models: VehicleModelAdminView[];
}

/** Product form picker. */
export interface VehicleOption {
  id: string;
  name: string;
  nameEn: string | null;
  active: boolean;
  category: string | null;
  models: Array<{ id: string; name: string; nameEn: string | null; active: boolean }>;
}

/** Public vehicle (filters, /cars and /cars/[slug]). */
export interface VehiclePublicView {
  slug: string;
  name: LocalizedText;
  category: { slug: string; name: LocalizedText } | null;
  models: Array<{ slug: string; name: LocalizedText }>;
  /** Published parts that fit the vehicle (whole vehicle or any model). */
  productCount: number;
  seoTitle: string | null;
  seoDescription: string | null;
}

/** «مناسب برای:» on a product: a vehicle, or a vehicle's model. */
export interface FitmentView {
  vehicle: { slug: string; name: LocalizedText };
  model: { slug: string; name: LocalizedText } | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  note?: string | null;
}

// ---------------------------------------------------------------------------
// Home-page vehicle finder: group → vehicle → model/trim → year, loaded one step at a time.
// ---------------------------------------------------------------------------

export const YEAR_CALENDARS = ['jalali', 'gregorian'] as const;
/** Years are kept in the calendar their source uses; Persian and Gregorian years are never converted. */
export type YearCalendar = (typeof YEAR_CALENDARS)[number];
export type VehicleSupply = 'domestic' | 'assembled' | 'imported';

/** Step 1: a group (ایران‌خودرو، سایپا، تویوتا، هیوندای). vehicleCount = vehicles listed under it. */
export interface FinderGroupView {
  slug: string;
  name: LocalizedText;
  logoUrl: string | null;
  vehicleCount: number;
}

/** Step 2: a vehicle (family) of the group. `make` is its original brand (پژو، رنو …) when different. */
export interface FinderVehicleView {
  slug: string;
  name: LocalizedText;
  make: LocalizedText | null;
  aliases: string[];
  modelCount: number;
  /** Slugs of the groups it is listed under (a vehicle chosen first fills in its group). */
  groups: string[];
}

/** Step 3: a model/trim. `years` only when a cited source gives them (otherwise the year step says so). */
export interface FinderModelView {
  slug: string;
  name: LocalizedText;
  aliases: string[];
  supply: VehicleSupply | null;
  supplier: LocalizedText | null;
  years: { from: number; to: number; calendar: YearCalendar } | null;
}

/** The validated selection echoed with search results (names for the page heading and a sourcing link). */
export interface VehicleSelectionView {
  group: { slug: string; name: LocalizedText } | null;
  /** Null when only a group was chosen (every step of the finder is optional). */
  vehicle: { slug: string; name: LocalizedText } | null;
  model: { slug: string; name: LocalizedText } | null;
  year: number | null;
  calendar: YearCalendar | null;
}

/**
 * Ranking of a vehicle-finder result. verified: a recorded fitment link for the selection (and the
 * year, when one is chosen). relevant: linked to the vehicle, but the year or the exact model is not
 * confirmed. related: a suggestion only (another model/year of the vehicle, the same group, or the
 * vehicle named in the part). text: matches the typed search only, no fitment information.
 */
export const FINDER_MATCH_TIERS = ['verified', 'relevant', 'related', 'text'] as const;
export type FinderMatchTier = (typeof FINDER_MATCH_TIERS)[number];
export type FinderMatchReason =
  | 'MODEL' | 'VEHICLE' | 'GROUP'
  | 'YEAR_UNCONFIRMED' | 'SOME_MODEL'
  | 'OTHER_MODEL' | 'OTHER_YEARS' | 'GROUP_TAG' | 'NAME_MATCH'
  | 'TEXT';
export interface FinderMatch {
  tier: FinderMatchTier;
  reason: FinderMatchReason;
}
