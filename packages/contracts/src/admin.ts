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

export const importCommitSchema = z.object({
  jobId: idSchema,
  /** Checksum of the previewed plan; commit is refused if the plan changed. */
  planChecksum: z.string().length(64),
});

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
