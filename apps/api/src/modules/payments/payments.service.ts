import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { type ProviderVerification, evaluateVerification } from '@hedax/domain';
import { REFERENCE_PREFIX, humanReference } from '@hedax/domain/server';
import type { PaymentAttempt, PaymentStatus, PaymentSubjectType } from '../../generated/prisma/client.js';
import { ENV, type Env } from '../../config/env.js';
import { badGatewayLike } from './payment-errors.js';
import { OutboxService } from '../../common/outbox.service.js';
import { Prisma, PrismaService, type Tx } from '../../common/prisma.service.js';
import { toJsonSafe } from '../../common/serialize.js';
import { TransitionsService } from '../../common/transitions.service.js';
import { PaymentProviderRegistry } from './provider-registry.js';

const NON_TERMINAL: PaymentStatus[] = ['CREATED', 'PENDING', 'PENDING_VERIFICATION'];

/**
 * Subject-specific effects of a verified payment. Stock orders and
 * procurement orders register a handler at startup (avoids module cycles).
 */
export interface SettlementHandler {
  /** SELECT … FOR UPDATE on the subject row so settlements for one subject are serialized. */
  lockSubject(tx: Tx, subjectId: string): Promise<void>;
  /** Called exactly once, for the attempt that becomes the primary settlement. */
  onSettled(tx: Tx, attempt: PaymentAttempt, verifiedAt: Date): Promise<void>;
  /** Called when an attempt definitively fails or is cancelled. */
  onFailed(tx: Tx, attempt: PaymentAttempt): Promise<void>;
}

export interface NewAttemptInput {
  subjectType: PaymentSubjectType;
  subjectId: string;
  customerId: string;
  amountIrr: bigint;
  snapshot: Record<string, unknown>;
  idempotencyKey: string;
  locale: 'fa' | 'en';
}

function paramsHash(params: Record<string, string>): string {
  const sorted = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  return createHash('sha256').update(sorted).digest('hex').slice(0, 32);
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly handlers = new Map<PaymentSubjectType, SettlementHandler>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PaymentProviderRegistry,
    private readonly transitions: TransitionsService,
    private readonly outbox: OutboxService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  registerHandler(subject: PaymentSubjectType, handler: SettlementHandler): void {
    this.handlers.set(subject, handler);
  }

  private handler(subject: PaymentSubjectType): SettlementHandler {
    const h = this.handlers.get(subject);
    if (!h) throw new Error(`No settlement handler registered for ${subject}`);
    return h;
  }

  /** Inserts the attempt inside the caller's transaction (order/procurement + attempt are atomic). */
  async createAttempt(tx: Tx, input: NewAttemptInput): Promise<PaymentAttempt> {
    const provider = this.registry.active(); // throws PAYMENT_NOT_CONFIGURED before anything is created
    const attempt = await tx.paymentAttempt.create({
      data: {
        reference: humanReference(REFERENCE_PREFIX.payment),
        subjectType: input.subjectType,
        ...(input.subjectType === 'STOCK_ORDER' ? { orderId: input.subjectId } : { procurementId: input.subjectId }),
        customerId: input.customerId,
        provider: provider.code,
        merchantId: this.registry.merchantId,
        amountIrrMinor: input.amountIrr,
        snapshot: toJsonSafe(input.snapshot) as Prisma.InputJsonValue,
        idempotencyKey: input.idempotencyKey,
        locale: input.locale,
      },
    });
    await tx.paymentEvent.create({ data: { paymentAttemptId: attempt.id, type: 'CREATED', data: { amountIrr: input.amountIrr.toString() } } });
    return attempt;
  }

  /** After commit: asks the provider for a payment session. Amount and destination come only from the server. */
  async initiate(attemptId: string): Promise<{ redirectUrl: string; isSimulator: boolean }> {
    const attempt = await this.prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { customer: true } });
    const provider = this.registry.active();
    if (attempt.status === 'PENDING' && attempt.redirectUrl) return { redirectUrl: attempt.redirectUrl, isSimulator: provider.isSimulator };
    if (attempt.status !== 'CREATED') throw badGatewayLike('PAYMENT_ATTEMPT_CLOSED', 'This payment attempt can no longer be started');
    let created;
    try {
      created = await provider.create({
        attemptId: attempt.id,
        amountIrr: attempt.amountIrrMinor,
        callbackUrl: `${this.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/api/v1/payments/callback/${provider.code}`,
        description: `HEDAX ${attempt.reference}`,
        customerMobile: attempt.customer.mobileE164,
      });
    } catch (e) {
      await this.prisma.$transaction(async (tx) => {
        const res = await tx.paymentAttempt.updateMany({ where: { id: attempt.id, status: 'CREATED' }, data: { status: 'FAILED', failureCode: 'PROVIDER_CREATE_FAILED' } });
        if (res.count === 1) {
          await tx.paymentEvent.create({ data: { paymentAttemptId: attempt.id, type: 'CREATE_FAILED', data: { message: e instanceof Error ? e.message.slice(0, 200) : 'unknown' } } });
        }
      });
      throw badGatewayLike('PAYMENT_START_FAILED', 'The payment gateway could not start the payment; please retry');
    }
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.paymentAttempt.updateMany({
        where: { id: attempt.id, status: 'CREATED' },
        data: { status: 'PENDING', providerReference: created.providerReference, redirectUrl: created.redirectUrl, providerDeadline: created.expiresAt },
      });
      if (res.count === 1) {
        await this.transitions.record(tx, { machine: 'payment', subjectType: 'PAYMENT', subjectId: attempt.id, from: 'CREATED', to: 'PENDING', customerVisible: false, actorKind: 'SYSTEM', actorId: null });
        await tx.paymentEvent.create({ data: { paymentAttemptId: attempt.id, type: 'REDIRECT_CREATED', data: { providerDeadline: created.expiresAt.toISOString() } } });
      }
    });
    return { redirectUrl: created.redirectUrl, isSimulator: provider.isSimulator };
  }

  /**
   * Provider callback (browser return or server notification). Parameters are
   * untrusted: they only identify the attempt; success comes solely from a
   * server-to-server verification. Duplicate callbacks are recorded once.
   */
  async handleCallback(providerCode: string, params: Record<string, string>): Promise<PaymentAttempt | null> {
    const provider = this.registry.byCode(providerCode);
    if (!provider) return null;
    const reference = provider.referenceFromCallback(params);
    if (!reference) return null;
    const attempt = await this.prisma.paymentAttempt.findUnique({
      where: { provider_merchantId_providerReference: { provider: provider.code, merchantId: this.registry.merchantId, providerReference: reference } },
    });
    if (!attempt) return null;
    await this.prisma.paymentEvent.createMany({
      data: [{ paymentAttemptId: attempt.id, type: 'CALLBACK_RECEIVED', dedupeKey: `${attempt.id}:cb:${paramsHash(params)}`, data: { keys: Object.keys(params).slice(0, 20) } }],
      skipDuplicates: true,
    });
    await this.verify(attempt.id, 'CALLBACK', params);
    return this.prisma.paymentAttempt.findUnique({ where: { id: attempt.id } });
  }

  /** Verifies with the provider and applies the result exactly once. Safe to call repeatedly. */
  async verify(attemptId: string, trigger: 'CALLBACK' | 'INQUIRY' | 'RESULT_PAGE', callbackParams: Record<string, string> = {}): Promise<PaymentStatus> {
    const attempt = await this.prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    if (!NON_TERMINAL.includes(attempt.status)) return attempt.status;
    const provider = this.registry.byCode(attempt.provider);
    if (!provider) return attempt.status;
    if (!attempt.providerReference) {
      // Never reached the gateway; after a grace period this attempt is abandoned.
      if (Date.now() - attempt.createdAt.getTime() > 30 * 60_000) {
        await this.applyFailure(attempt, 'FAILED', 'NOT_STARTED', null);
        return 'FAILED';
      }
      return attempt.status;
    }

    let verification: ProviderVerification;
    try {
      verification = trigger === 'CALLBACK'
        ? await provider.verify(attempt.providerReference, callbackParams)
        : await provider.inquire(attempt.providerReference);
    } catch (e) {
      this.logger.warn(`verification unavailable for ${attempt.reference}: ${e instanceof Error ? e.message : 'unknown'}`);
      await this.markPendingVerification(attempt, 'PROVIDER_UNREACHABLE');
      return 'PENDING_VERIFICATION';
    }

    const decision = evaluateVerification(
      { providerReference: attempt.providerReference, amountIrr: attempt.amountIrrMinor, merchantId: attempt.merchantId },
      verification,
    );
    switch (decision.outcome) {
      case 'SUCCEEDED':
        await this.applySuccess(attempt, verification, decision.overpaymentIrr);
        return 'SUCCEEDED';
      case 'FAILED':
      case 'CANCELLED':
        await this.applyFailure(attempt, decision.outcome, decision.outcome === 'FAILED' ? 'PROVIDER_FAILED' : 'CUSTOMER_CANCELLED', verification);
        return decision.outcome;
      case 'MISMATCH':
        await this.applyMismatch(attempt, verification, decision.problems);
        return 'FAILED';
      default:
        await this.markPendingVerification(attempt, 'PROVIDER_PENDING');
        return 'PENDING_VERIFICATION';
    }
  }

  private async markPendingVerification(attempt: PaymentAttempt, reason: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.paymentAttempt.updateMany({
        where: { id: attempt.id, status: 'PENDING' },
        data: { status: 'PENDING_VERIFICATION', lastInquiryAt: new Date(), inquiryCount: { increment: 1 } },
      });
      if (res.count === 1) {
        await this.transitions.record(tx, { machine: 'payment', subjectType: 'PAYMENT', subjectId: attempt.id, from: 'PENDING', to: 'PENDING_VERIFICATION', reason, customerVisible: false, actorKind: 'SYSTEM', actorId: null });
      } else {
        await tx.paymentAttempt.updateMany({ where: { id: attempt.id, status: 'PENDING_VERIFICATION' }, data: { lastInquiryAt: new Date(), inquiryCount: { increment: 1 } } });
      }
      await this.outbox.enqueue(tx, {
        type: 'payment.reconcile', aggregateType: 'payment_attempt', aggregateId: attempt.id, payload: { attemptId: attempt.id },
        dedupeKey: `reconcile:${attempt.id}:${Math.floor(Date.now() / 60_000)}`, availableAt: new Date(Date.now() + 60_000),
      });
    });
  }

  private async applySuccess(attempt: PaymentAttempt, v: ProviderVerification, overpaymentIrr: bigint): Promise<void> {
    const handler = this.handler(attempt.subjectType);
    const subjectId = (attempt.orderId ?? attempt.procurementId) as string;
    await this.prisma.tx(async (tx) => {
      await handler.lockSubject(tx, subjectId);
      const verifiedAt = new Date();
      const updated = await tx.paymentAttempt.updateMany({
        where: { id: attempt.id, status: { in: NON_TERMINAL } },
        data: {
          status: 'SUCCEEDED', verifiedAt, verifiedAmountIrrMinor: v.amountIrr, overpaymentIrrMinor: overpaymentIrr,
          providerTransactionId: v.providerTransactionId, cardMask: v.cardMask, lastInquiryAt: verifiedAt,
        },
      });
      if (updated.count !== 1) return; // already applied by a concurrent callback/inquiry (A09)
      await this.transitions.record(tx, { machine: 'payment', subjectType: 'PAYMENT', subjectId: attempt.id, from: attempt.status, to: 'SUCCEEDED', customerVisible: false, actorKind: 'PROVIDER', actorId: null });
      await tx.paymentEvent.create({
        data: { paymentAttemptId: attempt.id, type: 'VERIFIED', dedupeKey: `${attempt.id}:verified`, data: { amountIrr: v.amountIrr?.toString() ?? null, transactionId: v.providerTransactionId } },
      });

      const existing = await tx.paymentSettlement.findUnique({ where: { subjectType_subjectId: { subjectType: attempt.subjectType, subjectId } } });
      if (existing) {
        // Second successful payment for an already-paid subject: money is recorded and a refund case opened.
        await tx.resolutionCase.create({
          data: { kind: 'OVERPAYMENT', subjectType: attempt.subjectType, subjectId, paymentAttemptId: attempt.id, amountIrrMinor: v.amountIrr ?? attempt.amountIrrMinor, note: 'Duplicate successful payment for an already settled subject' },
        });
        await this.outbox.notify(tx, { userId: attempt.customerId, type: 'payment.duplicate_received', linkPath: null, dedupeKey: `dup:${attempt.id}` });
        return;
      }
      await tx.paymentSettlement.create({ data: { subjectType: attempt.subjectType, subjectId, paymentAttemptId: attempt.id, amountIrrMinor: attempt.amountIrrMinor } });
      if (overpaymentIrr > 0n) {
        await tx.resolutionCase.create({
          data: { kind: 'OVERPAYMENT', subjectType: attempt.subjectType, subjectId, paymentAttemptId: attempt.id, amountIrrMinor: overpaymentIrr, note: 'Provider confirmed more than the requested amount' },
        });
      }
      const fresh = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
      await handler.onSettled(tx, fresh, verifiedAt);
      await this.outbox.enqueue(tx, {
        type: 'payment.settled', aggregateType: 'payment_attempt', aggregateId: attempt.id,
        payload: { attemptId: attempt.id, subjectType: attempt.subjectType, subjectId }, dedupeKey: `settled:${attempt.id}`,
      });
    });
  }

  private async applyFailure(attempt: PaymentAttempt, status: 'FAILED' | 'CANCELLED', code: string, v: ProviderVerification | null): Promise<void> {
    const handler = this.handler(attempt.subjectType);
    await this.prisma.tx(async (tx) => {
      const updated = await tx.paymentAttempt.updateMany({
        where: { id: attempt.id, status: { in: NON_TERMINAL } },
        data: { status, failureCode: code, lastInquiryAt: new Date() },
      });
      if (updated.count !== 1) return;
      await this.transitions.record(tx, { machine: 'payment', subjectType: 'PAYMENT', subjectId: attempt.id, from: attempt.status, to: status, reason: code, customerVisible: false, actorKind: v ? 'PROVIDER' : 'SYSTEM', actorId: null });
      await tx.paymentEvent.create({ data: { paymentAttemptId: attempt.id, type: status, dedupeKey: `${attempt.id}:final`, data: { code } } });
      const fresh = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
      await handler.onFailed(tx, fresh);
      await this.outbox.notify(tx, { userId: attempt.customerId, type: 'payment.failed', params: { reference: attempt.reference }, linkPath: null, dedupeKey: `failed:${attempt.id}` });
    });
  }

  /** Provider says "paid" but amount/merchant/reference do not match: never a success; money is escalated. */
  private async applyMismatch(attempt: PaymentAttempt, v: ProviderVerification, problems: string[]): Promise<void> {
    await this.prisma.tx(async (tx) => {
      const updated = await tx.paymentAttempt.updateMany({
        where: { id: attempt.id, status: { in: NON_TERMINAL } },
        data: { status: 'FAILED', failureCode: 'VERIFICATION_MISMATCH', verifiedAmountIrrMinor: v.amountIrr, lastInquiryAt: new Date() },
      });
      if (updated.count !== 1) return;
      await this.transitions.record(tx, { machine: 'payment', subjectType: 'PAYMENT', subjectId: attempt.id, from: attempt.status, to: 'FAILED', reason: 'VERIFICATION_MISMATCH', customerVisible: false, actorKind: 'PROVIDER', actorId: null });
      await tx.paymentEvent.create({ data: { paymentAttemptId: attempt.id, type: 'MISMATCH', dedupeKey: `${attempt.id}:mismatch`, data: { problems } } });
      await tx.resolutionCase.createMany({
        data: [{
          kind: 'AMOUNT_MISMATCH', subjectType: attempt.subjectType, subjectId: (attempt.orderId ?? attempt.procurementId) as string,
          paymentAttemptId: attempt.id, amountIrrMinor: v.amountIrr, note: `Verification mismatch: ${problems.join(', ')}`,
        }],
        skipDuplicates: true,
      });
      const fresh = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
      await this.handler(attempt.subjectType).onFailed(tx, fresh);
    });
  }

  /** Worker entry point: re-inquire attempts whose outcome is still unknown (A11). */
  async reconcileDue(limit = 50): Promise<number> {
    const staleBefore = new Date(Date.now() - 60_000);
    const due = await this.prisma.paymentAttempt.findMany({
      where: {
        status: { in: ['PENDING', 'PENDING_VERIFICATION', 'CREATED'] },
        createdAt: { gt: new Date(Date.now() - 7 * 86_400_000) },
        OR: [{ lastInquiryAt: null }, { lastInquiryAt: { lt: staleBefore } }],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true, createdAt: true, status: true, providerDeadline: true },
    });
    let processed = 0;
    for (const a of due) {
      // Give the customer time at the gateway before the first inquiry.
      if (a.status === 'PENDING' && a.providerDeadline && a.providerDeadline > new Date() && Date.now() - a.createdAt.getTime() < 3 * 60_000) continue;
      await this.verify(a.id, 'INQUIRY').catch((e: unknown) => this.logger.warn(`reconcile ${a.id}: ${e instanceof Error ? e.message : 'error'}`));
      processed += 1;
    }
    return processed;
  }
}
