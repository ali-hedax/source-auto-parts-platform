import { All, Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { PaymentResultView } from '@hedax/contracts';
import { z } from 'zod';
import { ENV, type Env } from '../../config/env.js';
import { CurrentActor, CustomerOnly, Public, RequirePermissions, SkipCsrf } from '../../common/auth/decorators.js';
import { notFound } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Actor } from '../../common/request-context.js';
import { irr } from '../../common/serialize.js';
import { zod } from '../../common/zod.js';
import { PaymentProviderRegistry } from './provider-registry.js';
import { PaymentsService } from './payments.service.js';
import type { SimulatorOutcome } from './simulator.provider.js';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const decideSchema = z.object({
  outcome: z.enum(['SUCCEEDED', 'FAILED', 'CANCELLED', 'PENDING', 'TAMPERED', 'DUPLICATE']),
});

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly registry: PaymentProviderRegistry,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private resultUrl(locale: string, attemptId: string): string {
    return `${this.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/${locale === 'en' ? 'en' : 'fa'}/payment/result?attempt=${attemptId}`;
  }

  /**
   * Gateway return/notification. Separate from browser session auth; the
   * request only identifies an attempt, verification is server-to-server.
   */
  @Public()
  @SkipCsrf()
  @All('callback/:provider')
  @ApiExcludeEndpoint()
  async callback(@Param('provider') provider: string, @Req() req: Request, @Res() res: Response) {
    const raw = { ...(req.query as Record<string, unknown>), ...((req.body ?? {}) as Record<string, unknown>) };
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw).slice(0, 30)) if (typeof v === 'string' && k.length < 64) params[k] = v.slice(0, 500);
    const attempt = await this.payments.handleCallback(provider.slice(0, 40), params);
    if (!attempt) {
      res.status(404).type('text/plain').send('Unknown payment reference');
      return;
    }
    res.redirect(303, this.resultUrl(attempt.locale, attempt.id));
  }

  /** Customer-facing result. Unknown outcomes trigger a fresh server inquiry (A11). */
  @CustomerOnly()
  @Get('attempts/:id')
  async result(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response): Promise<PaymentResultView> {
    res.setHeader('Cache-Control', 'private, no-store');
    let attempt = await this.prisma.paymentAttempt.findFirst({ where: { id, customerId: actor.userId }, include: { order: true, procurement: true } });
    if (!attempt) throw notFound();
    if (['PENDING', 'PENDING_VERIFICATION'].includes(attempt.status) && (!attempt.lastInquiryAt || Date.now() - attempt.lastInquiryAt.getTime() > 10_000)) {
      await this.payments.verify(attempt.id, 'RESULT_PAGE').catch(() => undefined);
      attempt = (await this.prisma.paymentAttempt.findFirst({ where: { id, customerId: actor.userId }, include: { order: true, procurement: true } }))!;
    }
    const subject =
      attempt.subjectType === 'STOCK_ORDER'
        ? { kind: 'STOCK_ORDER' as const, id: attempt.orderId as string, reference: attempt.order?.reference ?? '' }
        : { kind: 'PROCUREMENT' as const, id: attempt.procurementId as string, reference: attempt.procurement?.reference ?? '' };
    const status = attempt.status === 'CREATED' || attempt.status === 'PENDING' ? 'PENDING_VERIFICATION' : attempt.status;
    const subjectStillPayable = attempt.subjectType === 'STOCK_ORDER' ? attempt.order?.status === 'AWAITING_PAYMENT' : attempt.procurement?.status === 'AWAITING_PAYMENT';
    return {
      attemptId: attempt.id,
      status,
      subject,
      amount: irr(attempt.amountIrrMinor),
      paidAt: attempt.verifiedAt?.toISOString() ?? null,
      providerReference: attempt.status === 'SUCCEEDED' ? attempt.providerTransactionId : null,
      canRetry: (status === 'FAILED' || status === 'CANCELLED') && !!subjectStillPayable,
      message:
        status === 'SUCCEEDED' ? 'VERIFIED' : status === 'FAILED' ? (attempt.failureCode === 'VERIFICATION_MISMATCH' ? 'NEEDS_REVIEW' : 'FAILED') : status === 'CANCELLED' ? 'CANCELLED' : 'CHECKING',
    };
  }

  // ---------------------------------------------------------------------------
  // Simulator "bank" pages — development/test only, clearly labelled.
  // ---------------------------------------------------------------------------

  @Public()
  @Get('simulator/:ref')
  @ApiExcludeEndpoint()
  simulatorPage(@Param('ref') ref: string, @Res() res: Response) {
    const sim = this.registry.simulator();
    const session = sim?.session(ref);
    if (!sim || !session) {
      res.status(404).type('text/plain').send('Simulator session not found');
      return;
    }
    const r = escapeHtml(ref);
    const amount = session.amountIrr.toLocaleString('en-US');
    const button = (outcome: string, label: string) =>
      `<form method="post" action="/api/v1/payments/simulator/${r}/decide"><input type="hidden" name="outcome" value="${outcome}"><button>${label}</button></form>`;
    res
      .status(200)
      .setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'")
      .setHeader('Cache-Control', 'no-store')
      .type('html')
      .send(`<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>درگاه آزمایشی — TEST ONLY</title>
<style>body{font-family:system-ui,sans-serif;background:#fff7e6;color:#1A202C;max-width:560px;margin:24px auto;padding:16px}
.b{background:#b45309;color:#fff;padding:12px;border-radius:8px;font-weight:700}form{display:inline}button{margin:6px;padding:12px 16px;min-height:44px;border-radius:8px;border:1px solid #4A5568;background:#fff;cursor:pointer}</style>
<p class="b">⚠ این درگاه آزمایشی است و هیچ پولی جابه‌جا نمی‌شود. TEST PAYMENT SIMULATOR — NO REAL MONEY.</p>
<p>مبلغ درخواست‌شده: <b dir="ltr">IRR ${amount}</b></p>
<p>مرجع: <code dir="ltr">${r}</code></p>
${button('SUCCEEDED', 'پرداخت موفق / Success')}
${button('FAILED', 'ناموفق / Fail')}
${button('CANCELLED', 'انصراف / Cancel')}
${button('PENDING', 'نامشخص؛ بستن مرورگر / Leave pending')}
${button('TAMPERED', 'موفق با مبلغ کمتر (آزمون جعل) / Paid less')}
${button('DUPLICATE', 'موفق + callback تکراری / Duplicate callback')}
</html>`);
  }

  @Public()
  @SkipCsrf()
  @Post('simulator/:ref/decide')
  @HttpCode(303)
  @ApiExcludeEndpoint()
  async simulatorDecide(@Param('ref') ref: string, @Body(zod(decideSchema)) body: z.infer<typeof decideSchema>, @Res() res: Response) {
    const sim = this.registry.simulator();
    const session = sim?.session(ref);
    if (!sim || !session) {
      res.status(404).type('text/plain').send('Simulator session not found');
      return;
    }
    const outcome: SimulatorOutcome = body.outcome === 'TAMPERED' || body.outcome === 'DUPLICATE' ? 'SUCCEEDED' : body.outcome;
    sim.decide(ref, outcome, body.outcome === 'TAMPERED' ? session.amountIrr / 2n : undefined);
    if (body.outcome === 'PENDING') {
      // Emulates a closed browser: no callback at all; reconciliation must discover the outcome later.
      res.status(200).type('text/plain; charset=utf-8').send('Session left pending (browser closed). You can close this tab.');
      return;
    }
    const callback = `/api/v1/payments/callback/simulator?ref=${encodeURIComponent(ref)}&status=${outcome === 'SUCCEEDED' ? 'OK' : 'NOK'}`;
    if (body.outcome === 'DUPLICATE') {
      // Fire the same callback twice server-side before redirecting the browser (A09).
      await this.payments.handleCallback('simulator', { ref, status: 'OK' });
      await this.payments.handleCallback('simulator', { ref, status: 'OK' });
    }
    res.redirect(303, callback);
  }

  // ---------------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------------

  @RequirePermissions('payments.read')
  @Get('admin/attempts')
  async adminList(@Query('status') status?: string) {
    const rows = await this.prisma.paymentAttempt.findMany({
      where: status ? { status: status as never } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { order: { select: { reference: true } }, procurement: { select: { reference: true } }, customer: { select: { fullName: true } } },
    });
    return rows.map((a) => ({
      id: a.id,
      reference: a.reference,
      subjectType: a.subjectType,
      subjectReference: a.order?.reference ?? a.procurement?.reference ?? null,
      customer: a.customer.fullName,
      amount: irr(a.amountIrrMinor),
      status: a.status,
      provider: a.provider,
      failureCode: a.failureCode,
      overpayment: irr(a.overpaymentIrrMinor),
      createdAt: a.createdAt.toISOString(),
      verifiedAt: a.verifiedAt?.toISOString() ?? null,
    }));
  }

  @RequirePermissions('payments.reconcile')
  @Post('admin/attempts/:id/reconcile')
  @HttpCode(200)
  async adminReconcile(@Param('id', ParseUUIDPipe) id: string) {
    return { status: await this.payments.verify(id, 'INQUIRY') };
  }

  @RequirePermissions('payments.read')
  @Get('admin/cases')
  async cases() {
    const rows = await this.prisma.resolutionCase.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 200 });
    return rows.map((c) => ({
      id: c.id, kind: c.kind, status: c.status, subjectType: c.subjectType, subjectId: c.subjectId, paymentAttemptId: c.paymentAttemptId,
      amount: c.amountIrrMinor === null ? null : irr(c.amountIrrMinor), note: c.note, resolution: c.resolution, createdAt: c.createdAt.toISOString(),
    }));
  }
}
