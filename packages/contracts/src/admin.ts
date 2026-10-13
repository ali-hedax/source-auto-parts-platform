import { z } from 'zod';
import { idSchema, optionalText } from './common.js';
import { SMS_NOTIFICATION_TYPES } from './constants.js';

export const exchangeRateSchema = z.object({
  /** Rials per one dirham, decimal string with up to 6 fractional digits, > 0. */
  irrPerAed: z.string().regex(/^\d{1,12}(\.\d{1,6})?$/),
  effectiveFrom: z.iso.datetime(),
  note: optionalText(300),
});

export const inventoryAdjustSchema = z.object({
  productId: idSchema,
  warehouseId: idSchema.optional(),
  /** Absolute physical count after counting; the server derives the delta. */
  newOnHand: z.number().int().min(0).max(10_000_000),
  reason: z.enum(['PHYSICAL_COUNT', 'RECEIVED', 'DAMAGED', 'LOST', 'RETURN_RESTOCK', 'CORRECTION']),
  note: optionalText(500),
  expectedVersion: z.number().int().min(0),
});

export const roleSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{2,40}$/),
  nameFa: z.string().trim().min(2).max(80),
  nameEn: z.string().trim().min(2).max(80),
  permissions: z.array(z.string().max(60)).max(100),
  requiresMfa: z.boolean().default(false),
});

export const staffInviteSchema = z.object({
  email: z.email().max(200),
  fullName: z.string().trim().min(2).max(120),
  roleIds: z.array(idSchema).min(1).max(10),
  /** A current authenticator code of the acting owner (Persian digits accepted); required when the owner role is granted. */
  confirmCode: z.string().trim().regex(/^[0-9۰-۹]{6}$/).optional(),
});

/** Resending replaces the link (the previous one stops working). Owner invitations need a fresh authenticator code. */
export const staffInvitationResendSchema = z.object({
  confirmCode: z.string().trim().regex(/^[0-9۰-۹]{6}$/).optional(),
});

/**
 * PENDING: e-mail queued or not configured; SENT: accepted by the SMTP server (not proof of inbox delivery);
 * FAILED: the e-mail could not be handed over; then ACCEPTED, EXPIRED or REVOKED.
 */
export type StaffInvitationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';

export interface StaffInvitationView {
  id: string;
  email: string;
  fullName: string;
  roles: Array<{ id: string; nameFa: string; nameEn: string; isOwner: boolean }>;
  status: StaffInvitationStatus;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  /** When the SMTP server accepted the latest invitation e-mail. */
  sentAt: string | null;
  /** Short, secret-free reason of the latest e-mail failure (e.g. "SMTP_AUTH_FAILED 535"). */
  lastError: string | null;
}

export const staffUpdateSchema = z.object({
  roleIds: z.array(idSchema).min(1).max(10).optional(),
  suspended: z.boolean().optional(),
  reason: optionalText(300),
  confirmCode: z.string().trim().regex(/^[0-9۰-۹]{6}$/).optional(),
});

export const shippingMethodSchema = z.object({
  code: z.string().regex(/^[a-z0-9_]{2,40}$/),
  nameFa: z.string().trim().min(2).max(120),
  nameEn: z.string().trim().max(120).optional().nullable(),
  carrierCode: optionalText(40),
  trackingUrlTemplate: z.string().url().max(300).refine((u) => u.includes('{code}'), 'Must contain {code}').optional().nullable(),
  active: z.boolean().default(true),
  zones: z
    .array(
      z.object({
        provinces: z.array(z.string().max(60)).max(40),
        costIrr: z.string().regex(/^\d+$/).nullable(), // null = cost unknown → inquiry
        minDays: z.number().int().min(0).max(120).nullable(),
        maxDays: z.number().int().min(0).max(120).nullable(),
      }),
    )
    .min(1)
    .max(40),
});

export const importStartSchema = z.object({
  attachmentId: idSchema,
  mode: z.enum(['UPDATE_ONLY', 'CREATE_AND_UPDATE']),
  columnMapping: z.record(z.string(), z.number().int().min(0).max(200)).optional(),
  clearWhenEmpty: z.array(z.string().max(40)).max(20).default([]),
  manufacturerBrandMapping: z.record(z.string(), idSchema).default({}),
});

/** Step 1 of the panel's import: read the sheets and first rows of an uploaded (scanned) file. */
export const importInspectSchema = z.object({
  attachmentId: idSchema,
});

const importDefaultsSchema = z.object({
  categoryCode: z.string().max(40).nullable().default(null),
  partType: z.enum(['GENUINE', 'OEM', 'AFTERMARKET']).nullable().default(null),
  condition: z.enum(['NEW', 'USED', 'REFURBISHED']).nullable().default(null),
  origin: z.enum(['DOMESTIC', 'IMPORTED', 'UNKNOWN']).nullable().default(null),
  manufacturerBrandId: idSchema.nullable().default(null),
  vehicleBrandCodes: z.array(z.string().max(40)).max(20).default([]),
  unit: z.string().trim().max(30).nullable().default(null),
  /** First stock of new products when the file has no stock column (null: they start at zero). */
  initialOnHand: z.number().int().min(0).max(1_000_000).nullable().default(null),
});

/**
 * Step 2: how to read the file. Column indexes are 0-based positions in the
 * header row; values for the whole file apply only to new products and only
 * where the row's own cell is empty.
 */
export const importSettingsSchema = z.object({
  sheet: z.number().int().min(0).max(100),
  /** Spreadsheet row number (1-based) of the header row. */
  headerRow: z.number().int().min(1).max(1000),
  columns: z.record(z.string().max(40), z.number().int().min(0).max(199)),
  mode: z.enum(['UPDATE_ONLY', 'CREATE_AND_UPDATE']),
  /** Unit of the price column when a row has no currency cell. TOMAN is converted to rial (×10). */
  priceUnit: z.enum(['IRR', 'TOMAN', 'AED']).nullable(),
  /** SET: the file has the counted stock. ADD: the file has received quantities added to the current stock. */
  stockMode: z.enum(['SET', 'ADD']),
  defaults: importDefaultsSchema.default(importDefaultsSchema.parse({})),
  clearWhenEmpty: z.array(z.string().max(40)).max(20).default([]),
});
export type ImportSettings = z.infer<typeof importSettingsSchema>;

export const importCommitSchema = z.object({
  jobId: idSchema,
  /** Checksum of the previewed plan; commit is refused if the plan changed. */
  planChecksum: z.string().length(64),
  /** Apply only the rows without errors; the others stay listed as not applied (never dropped silently). */
  skipErrorRows: z.boolean().default(false),
  /** The same file was already added to stock (ADD); add it once more anyway. */
  confirmRepeatAdd: z.boolean().default(false),
});

export const importRowFilterSchema = z.enum(['all', 'errors', 'create', 'update', 'unchanged', 'warnings']);

export interface ImportSheetOutline {
  index: number;
  name: string;
  hidden: boolean;
  rowCount: number;
  columnCount: number;
  /** The first rows as text (header candidates and samples), with their spreadsheet row numbers. */
  rows: Array<{ rowNumber: number; cells: string[] }>;
}

export interface ImportOutline {
  sheets: ImportSheetOutline[];
  suggestion: { sheet: number; headerRow: number; columns: Record<string, number>; priceUnit: 'IRR' | 'TOMAN' | 'AED' | null };
}

export interface ImportRowView {
  rowNumber: number;
  sku: string | null;
  action: 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'ERROR';
  issues: Array<{ column: string | null; code: string; severity: 'error' | 'warning'; detail?: string }>;
  changes: Array<{ field: string; before: string | null; after: string | null; currency?: 'IRR' | 'AED'; delta?: number }>;
  display: {
    name: string | null;
    technicalNumber: string | null;
    brand: string | null;
    price: { amountMinor: string; currency: 'IRR' | 'AED'; fromToman: boolean } | { text: string } | null;
    stock: { mode: 'SET' | 'ADD'; quantity: number | null; before: number | null; after: number | null } | { text: string } | null;
    defaults: string[];
  } | null;
  productId: string | null;
  applied: boolean;
}

export interface ImportSummaryView {
  create: number;
  update: number;
  unchanged: number;
  error: number;
  warnings: number;
  fileErrors: string[];
  canCommit: boolean;
  canCommitValid?: boolean;
  requiredPermissions?: string[];
  columns?: string[];
  ignoredHeaders?: string[];
  /** The most common row issues of the whole file: how many rows each affects and in which columns. */
  topIssues?: Array<{ code: string; severity: 'error' | 'warning'; rows: number; columns: string[] }>;
  /** After commit: what was applied. */
  result?: { created: number; updated: number; unchanged: number; skipped: number };
}

export interface ImportJobView {
  jobId: string;
  status: 'INSPECTING' | 'AWAITING_MAPPING' | 'QUEUED' | 'PARSING' | 'PREVIEW_READY' | 'FAILED' | 'COMMITTING' | 'COMMITTED' | 'CONFLICT' | 'CANCELLED';
  mode: 'UPDATE_ONLY' | 'CREATE_AND_UPDATE';
  progress: number;
  totalRows: number | null;
  failureReason: string | null;
  filename: string | null;
  createdAt: string;
  committedAt: string | null;
  outline: ImportOutline | null;
  settings: ImportSettings | null;
  summary: ImportSummaryView | null;
  planChecksum: string | null;
  /** When this exact file was already added to stock (ADD) by an earlier import. */
  repeatAdd: { jobId: string; committedAt: string } | null;
  rows: ImportRowView[];
  rowsTotal: number;
  page: number;
  pageSize: number;
}

export interface ImportJobListItem {
  jobId: string;
  status: ImportJobView['status'];
  filename: string | null;
  createdAt: string;
  committedAt: string | null;
  summary: Pick<ImportSummaryView, 'create' | 'update' | 'unchanged' | 'error'> | null;
}

export interface ImportedProductView {
  productId: string;
  rowNumber: number;
  action: 'CREATE' | 'UPDATE';
  sku: string;
  nameFa: string;
  nameEn: string | null;
  technicalNumbers: string[];
  brand: string | null;
  condition: 'NEW' | 'USED' | 'REFURBISHED';
  published: boolean;
  photoCount: number;
  primaryPhoto: { storageKey: string; width: number; height: number; alt: string } | null;
  /** Used or refurbished parts are published only with a real photo of the item (publish rule). */
  photoRequiredToPublish: boolean;
}

export const siteSettingsSchema = z.object({
  contactPhone: optionalText(40),
  contactEmail: z.email().optional().or(z.literal('')),
  contactAddressFa: optionalText(400),
  contactAddressEn: optionalText(400),
  workingHoursFa: optionalText(200),
  workingHoursEn: optionalText(200),
  domain: optionalText(200),
  reservationMinutes: z.number().int().min(5).max(60).default(15),
  quoteValidityHoursDefault: z.number().int().min(1).max(720).default(24),
  taxRateBasisPoints: z.number().int().min(0).max(5000).nullable().default(null),
  taxBase: z.enum(['ITEMS', 'ITEMS_AND_SHIPPING']).default('ITEMS'),
  manualBankTransferEnabled: z.literal(false).default(false),
  /** SMS copies switched off by the owner (in-app notifications are unaffected). */
  smsDisabledTypes: z.array(z.enum(SMS_NOTIFICATION_TYPES)).max(SMS_NOTIFICATION_TYPES.length).default([]),
});

export const policyVersionSchema = z.object({
  kind: z.enum(['TERMS', 'PRIVACY', 'RETURNS', 'SHIPPING', 'SOURCING', 'WARRANTY']),
  titleFa: z.string().trim().min(2).max(200),
  titleEn: z.string().trim().max(200).optional().nullable(),
  bodyFa: z.string().trim().min(10).max(50_000),
  bodyEn: z.string().trim().max(50_000).optional().nullable(),
});

export const businessCalendarSchema = z.object({
  name: z.string().trim().min(2).max(80),
  weekendDays: z.array(z.number().int().min(0).max(6)).max(6),
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(400),
});

export interface DashboardView {
  ordersNeedingAction: number;
  newSourcingRequests: number;
  paymentsPendingVerification: number;
  delayedProcurements: number;
  lowStockProducts: number;
  unreadConversations: number;
  /** ATTENTION: configured but needs a look (e.g. antivirus signatures too old). */
  launchReadiness: Array<{ key: string; status: 'READY' | 'MISSING' | 'SIMULATED' | 'ATTENTION'; note: string }>;
}
