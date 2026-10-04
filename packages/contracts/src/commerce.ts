import { z } from 'zod';
import { type MoneyDto, idSchema, optionalText } from './common.js';
import type { PriceView } from './catalog.js';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const otpRequestSchema = z.object({ mobile: z.string().trim().min(9).max(20) });
export const otpVerifySchema = z.object({
  mobile: z.string().trim().min(9).max(20),
  code: z.string().trim().regex(/^[0-9۰-۹]{6}$/),
});
export const staffLoginSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(256),
});
export const staffMfaSchema = z.object({
  challengeId: z.string().min(10).max(200),
  code: z.string().trim().regex(/^\d{6}$|^[A-Z0-9]{4}-[A-Z0-9]{4}$/),
});
export const acceptInvitationSchema = z.object({
  token: z.string().min(20).max(200),
  fullName: z.string().trim().min(2).max(120),
  password: z.string().min(12).max(256),
});

export type CustomerType = 'CONSUMER' | 'WORKSHOP' | 'WHOLESALER';

export interface MeView {
  id: string;
  kind: 'CUSTOMER' | 'STAFF';
  displayName: string | null;
  mobileMasked: string | null;
  email: string | null;
  customerType: CustomerType | null;
  customerGroup: { id: string; name: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' } | null;
  permissions: string[];
  mfaEnabled: boolean;
  preferredLocale: 'fa' | 'en';
  unreadNotifications: number;
  unreadMessages: number;
}

// ---------------------------------------------------------------------------
// Addresses & profile
// ---------------------------------------------------------------------------

export const addressSchema = z.object({
  label: optionalText(60),
  recipientName: z.string().trim().min(2).max(120),
  recipientMobile: z.string().trim().min(9).max(20),
  province: z.string().trim().min(2).max(60),
  city: z.string().trim().min(2).max(60),
  addressLine: z.string().trim().min(5).max(400),
  postalCode: z.string().trim().regex(/^[0-9۰-۹]{10}$/),
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.infer<typeof addressSchema>;

export const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.email().max(200).optional().or(z.literal('')),
  preferredLocale: z.enum(['fa', 'en']).default('fa'),
  companyName: optionalText(200),
  companyRole: optionalText(100),
});

export const businessAccountRequestSchema = z.object({
  requestedType: z.enum(['WORKSHOP', 'WHOLESALER']),
  businessName: z.string().trim().min(2).max(200),
  city: z.string().trim().min(2).max(60),
  note: optionalText(1000),
  attachmentIds: z.array(idSchema).max(5).default([]),
});

// ---------------------------------------------------------------------------
// Cart & checkout (stock purchases only; quotes are paid separately in v1)
// ---------------------------------------------------------------------------

export const cartItemSchema = z.object({
  productId: idSchema,
  quantity: z.number().int().min(1).max(999),
});
export const cartItemUpdateSchema = z.object({ quantity: z.number().int().min(0).max(999) });

export interface CartLineView {
  id: string;
  productId: string;
  slug: string;
  sku: string;
  name: { fa: string; en: string | null };
  imageUrl: string | null;
  quantity: number;
  maxOrderQuantity: number;
  unitPrice: PriceView;
  lineTotalPayableIrr: MoneyDto | null;
  problems: Array<'OUT_OF_STOCK' | 'QUANTITY_REDUCED' | 'PRICE_CHANGED' | 'UNAVAILABLE' | 'INQUIRY_REQUIRED'>;
}

export interface CartView {
  id: string;
  lines: CartLineView[];
  itemsTotalPayableIrr: MoneyDto | null;
  canCheckout: boolean;
}

export const checkoutStartSchema = z.object({
  addressId: idSchema,
  shippingMethodId: idSchema,
  customerNote: optionalText(1000),
  /** Explicit acceptance of the current terms version shown on the review step. */
  acceptedPolicyVersionId: idSchema,
  /** Totals the customer saw; the server recomputes and rejects on mismatch instead of trusting them. */
  expectedGrandTotalIrr: z.string().regex(/^\d+$/),
});
export type CheckoutStart = z.infer<typeof checkoutStartSchema>;

export interface ShippingOptionView {
  id: string;
  name: { fa: string; en: string | null };
  cost: { status: 'KNOWN'; amount: MoneyDto } | { status: 'UNKNOWN' };
  estimate: { minDays: number; maxDays: number } | null;
}

export interface CheckoutPreview {
  cart: CartView;
  shippingOptions: ShippingOptionView[];
  totals: {
    itemsTotal: MoneyDto;
    discount: MoneyDto;
    shipping: MoneyDto | null;
    tax: MoneyDto;
    taxConfigured: boolean;
    grandTotal: MoneyDto | null;
    referenceAed: MoneyDto | null;
  } | null;
  blockers: string[];
  policy: { id: string; version: number; title: string };
  reservationMinutes: number;
}

export interface PaymentRedirect {
  orderId: string;
  attemptId: string;
  redirectUrl: string;
  reservationExpiresAt: string | null;
  isSimulator: boolean;
}

export type PaymentResultStatus = 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'PENDING_VERIFICATION';

export interface PaymentResultView {
  attemptId: string;
  status: PaymentResultStatus;
  subject: { kind: 'STOCK_ORDER' | 'PROCUREMENT'; id: string; reference: string };
  amount: MoneyDto;
  paidAt: string | null;
  providerReference: string | null;
  canRetry: boolean;
  message: 'VERIFIED' | 'FAILED' | 'CANCELLED' | 'CHECKING' | 'NEEDS_REVIEW';
}

// ---------------------------------------------------------------------------
// Orders, returns, refunds
// ---------------------------------------------------------------------------

export interface TimelineEvent {
  at: string;
  type: string;
  fromState: string | null;
  toState: string | null;
  note: string | null;
  actor: 'CUSTOMER' | 'STAFF' | 'SYSTEM';
}

export interface OrderLineView {
  /** Order item id (used to choose items in a return request). */
  id: string;
  /** Delivered quantity that can still be returned (0 for custom-sourced orders; handled in the conversation). */
  returnableQuantity: number;
  sku: string;
  name: { fa: string; en: string | null };
  partType: string;
  condition: string;
  quantity: number;
  unitPrice: MoneyDto;
  lineTotal: MoneyDto;
}

export interface OrderView {
  id: string;
  reference: string;
  kind: 'STOCK_ORDER' | 'PROCUREMENT';
  status: string;
  paymentStatus: 'UNPAID' | 'PENDING' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
  createdAt: string;
  lines: OrderLineView[];
  totals: { items: MoneyDto; shipping: MoneyDto | null; tax: MoneyDto; discount: MoneyDto; grandTotal: MoneyDto };
  fx: { irrPerAed: string; recordedAt: string } | null;
  address: { recipientName: string; province: string; city: string; addressLine: string; postalCode: string } | null;
  shipment: { method: string; trackingCode: string | null; trackingUrl: string | null; shippedAt: string | null; deliveredAt: string | null } | null;
  schedule: { promisedReadyAt: string | null; currentReadyEstimate: string | null; changeReason: string | null } | null;
  timeline: TimelineEvent[];
  receipts: Array<{ attemptId: string; amount: MoneyDto; paidAt: string; providerReference: string | null }>;
  policyVersion: { id: string; version: number } | null;
  conversationId: string | null;
}

export const orderTransitionSchema = z.object({
  toState: z.string().min(3).max(40),
  reason: optionalText(500),
  version: z.number().int().min(0),
});

export const shipmentSchema = z.object({
  shippingMethodId: idSchema,
  carrierCode: optionalText(40),
  trackingCode: optionalText(80),
  shippedAt: z.iso.datetime().optional(),
});

export const returnRequestSchema = z.object({
  orderId: idSchema,
  kind: z.enum(['CANCEL', 'RETURN']),
  reason: z.string().trim().min(5).max(1000),
  items: z.array(z.object({ orderItemId: idSchema, quantity: z.number().int().min(1) })).max(50).default([]),
  attachmentIds: z.array(idSchema).max(10).default([]),
});

export const returnDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().trim().min(3).max(1000),
});

export const refundCreateSchema = z
  .object({
    paymentAttemptId: idSchema.optional(),
    /** The payment's human reference (e.g. HX-PAY-…), as staff see it; alternative to the internal id. */
    paymentReference: z.string().trim().min(4).max(24).optional(),
    amountIrr: z.string().regex(/^\d+$/),
    reason: z.string().trim().min(3).max(1000),
    returnRequestId: idSchema.optional(),
  })
  .refine((b) => !!b.paymentAttemptId !== !!b.paymentReference, { message: 'Give either the payment id or its reference', path: ['paymentReference'] });
