import { randomUUID } from 'node:crypto';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  ProviderPaymentStatus,
  ProviderVerification,
  ProviderRefundResult,
  RefundRequest,
} from '@hedax/domain';

export type SimulatorOutcome = 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'PENDING';

interface SimSession {
  attemptId: string;
  amountIrr: bigint;
  outcome: SimulatorOutcome;
  /** For tamper tests: the "bank" reports this amount instead of the requested one. */
  paidAmountIrr: bigint;
  transactionId: string | null;
  expiresAt: Date;
}

/**
 * Development/test-only gateway emulator (spec §9.2). It supports success,
 * failure, cancellation, "still pending", duplicate callbacks and delayed
 * decisions. Construction is refused in production, and every page it serves
 * is labelled as a test. State is in-memory: a restart turns open sessions
 * into UNKNOWN, which exercises the PENDING_VERIFICATION path.
 */
export class SimulatorPaymentProvider implements PaymentProvider {
  readonly code = 'simulator';
  readonly isSimulator = true;
  readonly supportsRefund = true;
  private readonly sessions = new Map<string, SimSession>();

  constructor(
    private readonly publicBaseUrl: string,
    private readonly merchantId: string,
    private readonly sessionMinutes: number,
    appEnv: string,
  ) {
    if (appEnv === 'production') throw new Error('The payment simulator cannot run in production');
  }

  async create(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const providerReference = `SIM-${randomUUID()}`;
    const expiresAt = new Date(Date.now() + this.sessionMinutes * 60_000);
    this.sessions.set(providerReference, {
      attemptId: input.attemptId,
      amountIrr: input.amountIrr,
      outcome: 'PENDING',
      paidAmountIrr: input.amountIrr,
      transactionId: null,
      expiresAt,
    });
    return {
      providerReference,
      redirectUrl: `${this.publicBaseUrl.replace(/\/$/, '')}/api/v1/payments/simulator/${encodeURIComponent(providerReference)}`,
      expiresAt,
    };
  }

  referenceFromCallback(params: Record<string, string>): string | null {
    const ref = params.ref ?? params.Authority ?? null;
    return typeof ref === 'string' && /^SIM-[0-9a-f-]{36}$/.test(ref) ? ref : null;
  }

  session(reference: string): (SimSession & { reference: string }) | null {
    const s = this.sessions.get(reference);
    return s ? { ...s, reference } : null;
  }

  /** Called by the simulator page ("bank side"). */
  decide(reference: string, outcome: SimulatorOutcome, tamperAmountIrr?: bigint): boolean {
    const s = this.sessions.get(reference);
    if (!s) return false;
    s.outcome = outcome;
    if (outcome === 'SUCCEEDED') s.transactionId = `SIMTX-${Date.now()}`;
    if (tamperAmountIrr !== undefined) s.paidAmountIrr = tamperAmountIrr;
    return true;
  }

  private result(reference: string): ProviderVerification {
    const s = this.sessions.get(reference);
    if (!s) return { status: 'UNKNOWN', providerReference: reference, amountIrr: null, merchantId: null, providerTransactionId: null, cardMask: null, raw: { simulator: true, known: false } };
    let status: ProviderPaymentStatus = s.outcome;
    if (s.outcome === 'PENDING' && s.expiresAt <= new Date()) status = 'CANCELLED';
    return {
      status,
      providerReference: reference,
      amountIrr: status === 'SUCCEEDED' ? s.paidAmountIrr : null,
      merchantId: this.merchantId,
      providerTransactionId: s.transactionId,
      cardMask: status === 'SUCCEEDED' ? '6037-99**-****-0000' : null,
      raw: { simulator: true, outcome: s.outcome },
    };
  }

  async verify(providerReference: string): Promise<ProviderVerification> {
    return this.result(providerReference);
  }

  async inquire(providerReference: string): Promise<ProviderVerification> {
    return this.result(providerReference);
  }

  async refund(input: RefundRequest): Promise<ProviderRefundResult> {
    const s = this.sessions.get(input.providerReference);
    if (!s || s.outcome !== 'SUCCEEDED') return { status: 'FAILED', providerRefundReference: null, raw: { simulator: true, reason: 'NOT_CAPTURED' } };
    return { status: 'SUCCEEDED', providerRefundReference: `SIMRF-${Date.now()}`, raw: { simulator: true } };
  }
}
