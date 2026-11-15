import { z } from 'zod';
import { type MoneyDto, amountMinorSchema, currencySchema, idSchema, optionalText } from './common.js';
import type { QuoteVersionStatus } from './constants.js';

export const SOURCING_PREFERENCES = ['ANY', 'GENUINE', 'AFTERMARKET', 'STOCK'] as const;
export const URGENCY_VALUES = ['NORMAL', 'URGENT'] as const;

export const sourcingItemSchema = z.object({
  partName: z.string().trim().min(2).max(200),
  quantity: z.number().int().min(1).max(10_000),
  /** Either a known vehicle brand id or a free-text brand; neither is hardcoded (A03). */
  vehicleBrandCode: z.string().regex(/^[A-Z0-9_]{2,40}$/).optional().nullable(),
  vehicleBrandText: optionalText(80),
  vehicleModel: optionalText(80),
  vehicleYear: z.number().int().min(1950).max(2100).optional().nullable(),
  partCode: optionalText(64),
  /** Optional, only for staff review; never required and never decoded automatically in v1. */
  vin: z.string().trim().toUpperCase().regex(/^[A-HJ-NPR-Z0-9]{11,17}$/).optional().or(z.literal('').transform(() => undefined)),
  preference: z.enum(SOURCING_PREFERENCES).default('ANY'),
  notes: optionalText(1000),
});

export const sourcingRequestCreateSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    items: z.array(sourcingItemSchema).max(100).default([]),
    note: optionalText(3000),
    urgency: z.enum(URGENCY_VALUES).default('NORMAL'),
    deliveryCity: optionalText(80),
    deliveryProvince: optionalText(80),
    attachmentIds: z.array(idSchema).max(10).default([]),
    /** Client draft id so a retried submit never creates a second request. */
    clientRequestId: z.string().min(16).max(64),
  })
  .refine((v) => v.items.length > 0 || v.attachmentIds.length > 0, {
    message: 'Add at least one item or attach a parts list file',
    path: ['items'],
  });
export type SourcingRequestCreate = z.infer<typeof sourcingRequestCreateSchema>;

export interface SourcingRequestView {
  id: string;
  reference: string;
  title: string;
  status: string;
  urgency: string;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    id: string;
    partName: string;
    quantity: number;
    vehicleBrand: string | null;
    vehicleModel: string | null;
    vehicleYear: number | null;
    partCode: string | null;
    preference: string;
    notes: string | null;
  }>;
  conversationId: string;
  assignee: { displayName: string } | null;
  quotes: QuoteSummaryView[];
}

// ---------------------------------------------------------------------------
// Quotes (structured, versioned; independent of chat text)
// ---------------------------------------------------------------------------

const leadTimeSchema = z
  .object({
    min: z.number().int().min(0).max(365),
    max: z.number().int().min(0).max(365),
    unit: z.enum(['HOURS', 'DAYS']),
    dayKind: z.enum(['CALENDAR', 'BUSINESS']),
  })
  .refine((v) => v.max >= v.min, { message: 'max must be ≥ min', path: ['max'] })
  .refine((v) => !(v.unit === 'HOURS' && v.dayKind === 'BUSINESS'), { message: 'Business counting needs days', path: ['dayKind'] });

export const quoteItemInputSchema = z.object({
  sourcingItemId: idSchema.optional().nullable(),
  description: z.string().trim().min(2).max(300),
  quantity: z.number().int().min(1).max(10_000),
  manufacturer: optionalText(120),
  partType: z.enum(['GENUINE', 'OEM', 'AFTERMARKET']),
  condition: z.enum(['NEW', 'USED', 'REFURBISHED']),
  compatibility: z.enum(['CONFIRMED', 'LIKELY', 'NEEDS_CUSTOMER_CONFIRMATION']),
  alternativeNote: optionalText(500),
  availability: z.enum(['AVAILABLE', 'UNAVAILABLE']),
  unitPrice: z.object({ currency: currencySchema, amountMinor: amountMinorSchema }),
  discount: z.object({ currency: currencySchema, amountMinor: amountMinorSchema }).optional().nullable(),
  leadTime: leadTimeSchema,
  /** Internal supplier cost: staff-only, stripped from every customer payload and PDF. */
  internalCost: z.object({ currency: currencySchema, amountMinor: amountMinorSchema }).optional().nullable(),
});

export const quoteDraftSchema = z.object({
  items: z.array(quoteItemInputSchema).min(1).max(100),
  costs: z
    .array(z.object({ code: z.enum(['SHIPPING', 'OTHER']), label: z.string().trim().min(2).max(120), amount: z.object({ currency: currencySchema, amountMinor: amountMinorSchema }) }))
    .max(10)
    .default([]),
  shippingLeadTime: leadTimeSchema.optional().nullable(),
  validityHours: z.number().int().min(1).max(24 * 30).default(24),
  leadTimeWording: z.enum(['ESTIMATE', 'COMMITMENT']).default('ESTIMATE'),
  leadTimeOrigin: z.enum(['PAYMENT_VERIFIED']).default('PAYMENT_VERIFIED'),
  businessCalendarId: idSchema.optional().nullable(),
  termsPolicyVersionId: idSchema,
  customerNote: optionalText(2000),
  /** Optimistic lock when editing an existing draft. */
  version: z.number().int().min(0).optional(),
});
export type QuoteDraft = z.infer<typeof quoteDraftSchema>;

export const quoteDecisionSchema = z.object({
  decision: z.enum(['ACCEPT', 'REJECT']),
  /** Exact version the customer saw; acceptance of any other version is refused. */
  quoteVersionId: idSchema,
  versionNumber: z.number().int().min(1),
  rejectReason: optionalText(1000),
  includedItemIds: z.array(idSchema).max(100).optional(),
});

/** Staff list of quote versions (newest first), within the viewer's sourcing scope. */
export interface StaffQuoteRow {
  versionId: string;
  reference: string;
  versionNumber: number;
  status: QuoteVersionStatus;
  /** The version customers currently see for this quote. */
  isCurrent: boolean;
  request: { id: string; reference: string };
  customer: string | null;
  totalPayableIrr: MoneyDto;
  sentAt: string | null;
  validUntil: string | null;
  createdAt: string;
}

export interface QuoteSummaryView {
  quoteId: string;
  reference: string;
  versionId: string;
  versionNumber: number;
  status: string;
  totalPayable: MoneyDto;
  validUntil: string;
}

export interface QuoteVersionView {
  quoteId: string;
  reference: string;
  versionId: string;
  versionNumber: number;
  status: string;
  issuedAt: string | null;
  validUntil: string;
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    manufacturer: string | null;
    partType: string;
    condition: string;
    compatibility: string;
    alternativeNote: string | null;
    availability: 'AVAILABLE' | 'UNAVAILABLE';
    included: boolean;
    unitPrice: MoneyDto;
    discount: MoneyDto | null;
    lineTotalIrr: MoneyDto | null;
    leadTime: { min: number; max: number; unit: string; dayKind: string };
  }>;
  costs: Array<{ code: string; label: string; amount: MoneyDto; amountIrr: MoneyDto }>;
  totals: {
    itemsIrr: MoneyDto;
    costsIrr: MoneyDto;
    taxIrr: MoneyDto;
    totalPayableIrr: MoneyDto;
    referenceTotalAed: MoneyDto | null;
  };
  fx: { irrPerAed: string; rateId: string } | null;
  schedule: {
    origin: 'PAYMENT_VERIFIED';
    wording: 'ESTIMATE' | 'COMMITMENT';
    readyToShip: { minDays: number; maxDays: number; unitsLabel: string };
    shipping: { min: number; max: number; unit: string; dayKind: string } | null;
    governingItemIds: string[];
  };
  terms: { policyVersionId: string; title: string; body: string };
  payable: { allowed: boolean; blockers: string[] };
  /** PDF in the viewer's language (falls back to the other language while it is being rendered). */
  pdfUrl: string | null;
  pdfUrls: { fa: string | null; en: string | null };
}
