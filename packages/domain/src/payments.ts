import { DomainError } from './errors.js';

/**
 * Provider-neutral payment contract (spec §9.2). A concrete adapter is written
 * only after a gateway is chosen, from that gateway's official documentation.
 * Amounts inside HEDAX are always IRR rials; any unit conversion the provider
 * needs happens *inside* its adapter and is tested there.
 */
export interface CreatePaymentInput {
  attemptId: string;
  amountIrr: bigint;
  callbackUrl: string;
  description: string;
  customerMobile: string | null;
}

export interface CreatePaymentResult {
  providerReference: string;
  redirectUrl: string;
  /** Deadline after which the provider will no longer accept this session. */
  expiresAt: Date;
}

export type ProviderPaymentStatus = 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'PENDING' | 'UNKNOWN';

export interface ProviderVerification {
  status: ProviderPaymentStatus;
  providerReference: string;
  /** Amount confirmed by the provider, converted back to IRR rials by the adapter. */
  amountIrr: bigint | null;
  merchantId: string | null;
  providerTransactionId: string | null;
  cardMask: string | null;
  raw: Record<string, unknown>;
}

export interface RefundRequest {
  refundId: string;
  providerReference: string;
  providerTransactionId: string | null;
  amountIrr: bigint;
}

export interface ProviderRefundResult {
  status: 'SUCCEEDED' | 'FAILED' | 'PROCESSING';
  providerRefundReference: string | null;
  raw: Record<string, unknown>;
}

/** What HEDAX expects for this attempt; gateways that verify by amount (e.g. Zarinpal) need it. */
export interface ExpectedAmount {
  amountIrr: bigint;
}

export interface PaymentProvider {
  readonly code: string;
  readonly isSimulator: boolean;
  readonly supportsRefund: boolean;
  create(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /** Reads the provider reference from browser/callback parameters. The values are untrusted input. */
  referenceFromCallback(params: Record<string, string>): string | null;
  /** Server-to-server verification; the only way a payment can become SUCCEEDED. */
  verify(providerReference: string, callbackParams: Record<string, string>, expected?: ExpectedAmount): Promise<ProviderVerification>;
  /** Status inquiry used by reconciliation when the customer never returned. */
  inquire(providerReference: string, expected?: ExpectedAmount): Promise<ProviderVerification>;
  refund?(input: RefundRequest): Promise<ProviderRefundResult>;
}

export interface ExpectedPayment {
  providerReference: string;
  amountIrr: bigint;
  merchantId: string | null;
}

export type VerificationDecision =
  | { outcome: 'SUCCEEDED'; overpaymentIrr: bigint }
  | { outcome: 'FAILED' | 'CANCELLED' }
  | { outcome: 'PENDING_VERIFICATION' }
  | { outcome: 'MISMATCH'; problems: string[] };

/**
 * Compares what the provider verified with what HEDAX expected. A mismatch
 * never marks the attempt succeeded; it is recorded and escalated.
 */
export function evaluateVerification(expected: ExpectedPayment, v: ProviderVerification): VerificationDecision {
  if (v.status === 'PENDING' || v.status === 'UNKNOWN') return { outcome: 'PENDING_VERIFICATION' };
  if (v.status === 'FAILED' || v.status === 'CANCELLED') return { outcome: v.status };
  const problems: string[] = [];
  if (v.providerReference !== expected.providerReference) problems.push('REFERENCE_MISMATCH');
  if (expected.merchantId !== null && v.merchantId !== expected.merchantId) problems.push('MERCHANT_MISMATCH');
  if (v.amountIrr === null) problems.push('AMOUNT_MISSING');
  else if (v.amountIrr < expected.amountIrr) problems.push('AMOUNT_TOO_LOW');
  if (problems.length) return { outcome: 'MISMATCH', problems };
  const overpaymentIrr = (v.amountIrr ?? 0n) - expected.amountIrr;
  return { outcome: 'SUCCEEDED', overpaymentIrr };
}

export type ReservationExpiryDecision =
  | { action: 'CONSUME' }
  | { action: 'EXTEND'; until: Date }
  | { action: 'RELEASE' };

/**
 * Called by the reservation sweeper *before* releasing stock (spec §9.2):
 * a reservation whose payment succeeded or is still in flight inside the
 * gateway deadline is never released blindly.
 */
export function decideReservationExpiry(input: {
  now: Date;
  expiresAt: Date;
  attempts: ReadonlyArray<{ status: string; providerDeadline: Date | null }>;
  graceMs: number;
}): ReservationExpiryDecision {
  if (input.attempts.some((a) => a.status === 'SUCCEEDED')) return { action: 'CONSUME' };
  if (input.now < input.expiresAt) return { action: 'EXTEND', until: input.expiresAt };
  const inFlight = input.attempts.filter((a) => a.status === 'PENDING' || a.status === 'PENDING_VERIFICATION' || a.status === 'CREATED');
  const latestDeadline = inFlight
    .map((a) => a.providerDeadline?.getTime() ?? 0)
    .reduce((max, t) => Math.max(max, t), 0);
  if (latestDeadline > 0 && input.now.getTime() < latestDeadline + input.graceMs) {
    return { action: 'EXTEND', until: new Date(latestDeadline + input.graceMs) };
  }
  return { action: 'RELEASE' };
}

export type LateSuccessResolution = { action: 'REALLOCATE_STOCK' } | { action: 'OPEN_REFUND_CASE'; reason: 'STOCK_UNAVAILABLE' };

/** A verified success arriving after the reservation was released (spec A12). */
export function resolveLateSuccess(available: number, needed: number): LateSuccessResolution {
  if (!Number.isSafeInteger(needed) || needed < 1) throw new DomainError('INVALID_QUANTITY');
  return available >= needed ? { action: 'REALLOCATE_STOCK' } : { action: 'OPEN_REFUND_CASE', reason: 'STOCK_UNAVAILABLE' };
}
