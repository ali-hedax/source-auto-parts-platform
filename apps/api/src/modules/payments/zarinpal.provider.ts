import type {
  CreatePaymentInput,
  CreatePaymentResult,
  ExpectedAmount,
  PaymentProvider,
  ProviderPaymentStatus,
  ProviderVerification,
} from '@hedax/domain';

/**
 * Zarinpal payment gateway, REST v4 (https://www.zarinpal.com/docs/paymentGateway/).
 *
 * - request:  POST /pg/v4/payment/request.json → data.code 100 + authority
 * - redirect: GET  /pg/StartPay/{authority}
 * - callback: GET  {callback_url}?Authority=…&Status=OK|NOK   (untrusted)
 * - verify:   POST /pg/v4/payment/verify.json → data.code 100 (first time) or 101 (already verified)
 * - inquiry:  POST /pg/v4/payment/inquiry.json → data.status IN_BANK | PAID | VERIFIED | FAILED | REVERSED
 *
 * Units: HEDAX amounts are IRR rials and every call states `currency: "IRR"`, so
 * the amount is sent as-is — no ×10 or Toman conversion anywhere.
 * Zarinpal verifies by amount: verify succeeds only for the exact amount of the
 * request, so the confirmed amount is the expected amount we sent.
 * Data minimisation: the customer's mobile number is not sent to the gateway and
 * the card hash is not stored (only the masked card number).
 * Refunds are not available through this API key; they are made in the Zarinpal
 * panel and recorded with their reference (manual refund path).
 * Sandbox (https://sandbox.zarinpal.com) is for tests only and refused in production.
 */
export interface ZarinpalOptions {
  merchantId: string;
  sandbox: boolean;
  sessionMinutes: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const AUTHORITY = /^[AS][0-9A-Za-z]{35}$/;

type Json = Record<string, unknown>;

interface Envelope {
  data: Json | null;
  errorCode: number | null;
  raw: Json;
}

export class ZarinpalPaymentProvider implements PaymentProvider {
  readonly code = 'zarinpal';
  readonly isSimulator = false;
  readonly supportsRefund = false;
  readonly base: string;

  constructor(private readonly opts: ZarinpalOptions) {
    this.base = opts.sandbox ? 'https://sandbox.zarinpal.com' : 'https://payment.zarinpal.com';
  }

  async create(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const { data, errorCode } = await this.post('/pg/v4/payment/request.json', {
      merchant_id: this.opts.merchantId,
      amount: toAmount(input.amountIrr),
      currency: 'IRR',
      callback_url: input.callbackUrl,
      description: input.description.slice(0, 500),
      metadata: { order_id: input.attemptId },
    });
    const authority = typeof data?.authority === 'string' ? data.authority : '';
    if (data?.code !== 100 || !AUTHORITY.test(authority)) {
      throw new Error(`ZARINPAL_REQUEST_FAILED_${errorCode ?? (data?.code as number | undefined) ?? 'NO_DATA'}`);
    }
    return {
      providerReference: authority,
      redirectUrl: `${this.base}/pg/StartPay/${authority}`,
      expiresAt: new Date(Date.now() + this.opts.sessionMinutes * 60_000),
    };
  }

  referenceFromCallback(params: Record<string, string>): string | null {
    const ref = params.Authority ?? params.authority ?? null;
    return typeof ref === 'string' && AUTHORITY.test(ref) ? ref : null;
  }

  /** Callback: verify first; if the payment was not (yet) made, the session state decides — never the callback's Status alone. */
  async verify(providerReference: string, callbackParams: Record<string, string>, expected?: ExpectedAmount): Promise<ProviderVerification> {
    if (!expected) throw new Error('ZARINPAL_EXPECTED_AMOUNT_REQUIRED');
    return this.verifyAmount(providerReference, expected.amountIrr, callbackParams.Status === 'NOK');
  }

  /** Reconciliation without a callback: a PAID or VERIFIED session is captured with verify (101 when already verified). */
  async inquire(providerReference: string, expected?: ExpectedAmount): Promise<ProviderVerification> {
    if (!expected) throw new Error('ZARINPAL_EXPECTED_AMOUNT_REQUIRED');
    const state = await this.inquiry(providerReference);
    if (state.status === 'PAID' || state.status === 'VERIFIED') return this.verifyAmount(providerReference, expected.amountIrr, false);
    return this.fromState(providerReference, state.status, false, state.raw);
  }

  private async verifyAmount(reference: string, amountIrr: bigint, customerCancelled: boolean): Promise<ProviderVerification> {
    const { data, errorCode, raw } = await this.post('/pg/v4/payment/verify.json', {
      merchant_id: this.opts.merchantId,
      amount: toAmount(amountIrr),
      authority: reference,
    });
    if (data?.code === 100 || data?.code === 101) {
      return {
        status: 'SUCCEEDED',
        providerReference: reference,
        amountIrr,
        merchantId: this.opts.merchantId,
        providerTransactionId: data.ref_id !== undefined && data.ref_id !== null ? String(data.ref_id) : null,
        cardMask: typeof data.card_pan === 'string' ? data.card_pan : null,
        raw: { ...raw, verifyCode: data.code },
      };
    }
    // Not verified (e.g. -51: not paid): read the session state. A PAID state here means the
    // verify was refused for another reason (such as an amount mismatch) and needs a person.
    const state = await this.inquiry(reference);
    const status = state.status === 'PAID' || state.status === 'VERIFIED' ? null : state.status;
    return this.fromState(reference, status, customerCancelled, { verifyErrorCode: errorCode, ...state.raw });
  }

  private fromState(reference: string, state: string | null, customerCancelled: boolean, raw: Json): ProviderVerification {
    let status: ProviderPaymentStatus;
    // Observed in the sandbox: after the customer presses «انصراف» the gateway returns Status=NOK
    // and verify says -51 (not paid), but inquiry still reports IN_BANK. NOK + not paid = cancelled,
    // so the customer can try again at once; without NOK an IN_BANK session stays pending.
    if (state === 'IN_BANK') status = customerCancelled ? 'CANCELLED' : 'PENDING';
    else if (state === 'FAILED') status = customerCancelled ? 'CANCELLED' : 'FAILED';
    else if (state === 'REVERSED') status = 'FAILED';
    else status = 'UNKNOWN';
    return { status, providerReference: reference, amountIrr: null, merchantId: null, providerTransactionId: null, cardMask: null, raw: { ...raw, inquiryStatus: state } };
  }

  private async inquiry(reference: string): Promise<{ status: string | null; raw: Json }> {
    const { data, errorCode, raw } = await this.post('/pg/v4/payment/inquiry.json', { merchant_id: this.opts.merchantId, authority: reference });
    return { status: typeof data?.status === 'string' ? data.status : null, raw: { ...raw, inquiryErrorCode: errorCode } };
  }

  private async post(path: string, body: Json): Promise<Envelope> {
    const res = await (this.opts.fetchImpl ?? fetch)(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 15_000),
    });
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      // No JSON (gateway down, proxy page): the caller treats this as "provider unreachable".
      throw new Error(`ZARINPAL_HTTP_${res.status}`);
    }
    const envelope = (json && typeof json === 'object' ? json : {}) as Json;
    const data = envelope.data && typeof envelope.data === 'object' && !Array.isArray(envelope.data) && Object.keys(envelope.data).length ? (envelope.data as Json) : null;
    const errors = envelope.errors && typeof envelope.errors === 'object' && !Array.isArray(envelope.errors) ? (envelope.errors as Json) : null;
    const errorCode = typeof errors?.code === 'number' ? errors.code : null;
    return { data, errorCode, raw: sanitize(data, errorCode) };
  }
}

/** HEDAX keeps IRR rials as bigint; Zarinpal takes an integer. */
function toAmount(amountIrr: bigint): number {
  if (amountIrr <= 0n || amountIrr > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('ZARINPAL_AMOUNT_OUT_OF_RANGE');
  return Number(amountIrr);
}

/** What is kept with the payment events: codes, reference and fee — never the card hash. */
function sanitize(data: Json | null, errorCode: number | null): Json {
  const out: Json = { provider: 'zarinpal' };
  if (data) {
    for (const key of ['code', 'message', 'ref_id', 'card_pan', 'fee', 'fee_type', 'status']) if (data[key] !== undefined) out[key] = data[key];
  }
  if (errorCode !== null) out.errorCode = errorCode;
  return out;
}
