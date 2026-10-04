import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { exchangeRateSchema } from '@hedax/contracts';
import { parseRate } from '@hedax/domain';
import type { z } from 'zod';
import { AuditService } from '../../common/audit.service.js';
import { CurrentActor, Public, RequirePermissions } from '../../common/auth/decorators.js';
import { badRequest } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Actor } from '../../common/request-context.js';
import { ApiZodBody, zod } from '../../common/zod.js';
import { PricingService } from './pricing.service.js';

@ApiTags('exchange-rates')
@Controller()
export class FxController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly audit: AuditService,
  ) {}

  /** Public: the rate currently used for AED reference display (or null). */
  @Public()
  @Get('exchange-rates/current')
  async current() {
    const rate = await this.pricing.currentRate();
    return rate ? { irrPerAed: rate.irrPerAed, effectiveFrom: rate.effectiveFrom.toISOString() } : null;
  }

  @RequirePermissions('fx.manage')
  @Get('admin/exchange-rates')
  async history() {
    const rows = await this.prisma.exchangeRate.findMany({
      orderBy: { effectiveFrom: 'desc' },
      take: 100,
      include: { createdBy: { select: { fullName: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      irrPerAed: r.irrPerAed.toString(),
      effectiveFrom: r.effectiveFrom.toISOString(),
      note: r.note,
      createdBy: r.createdBy.fullName,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Append-only: a new rate never changes existing orders/quotes, which keep
   * their own snapshot (A06). Side effect: audit entry.
   */
  @RequirePermissions('fx.manage')
  @Post('admin/exchange-rates')
  @ApiZodBody(exchangeRateSchema)
  async create(@Body(zod(exchangeRateSchema)) body: z.infer<typeof exchangeRateSchema>, @CurrentActor() actor: Actor) {
    try {
      parseRate(body.irrPerAed);
    } catch {
      throw badRequest('INVALID_FX_RATE', 'Rate must be a positive decimal');
    }
    const effectiveFrom = new Date(body.effectiveFrom);
    if (effectiveFrom.getTime() < Date.now() - 5 * 60_000) throw badRequest('BACKDATED_RATE', 'A rate cannot take effect in the past');
    return this.prisma.tx(async (tx) => {
      const row = await tx.exchangeRate.create({
        data: { irrPerAed: body.irrPerAed, effectiveFrom, note: body.note ?? null, createdById: actor.userId },
      });
      await this.audit.record(tx, { action: 'fx.rate.created', entityType: 'exchange_rate', entityId: row.id, after: { irrPerAed: body.irrPerAed, effectiveFrom } });
      return { id: row.id, irrPerAed: row.irrPerAed.toString(), effectiveFrom: row.effectiveFrom.toISOString() };
    });
  }
}
