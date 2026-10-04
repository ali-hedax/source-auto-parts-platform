import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { createHash } from 'node:crypto';
import { businessCalendarSchema, policyVersionSchema, shippingMethodSchema, siteSettingsSchema } from '@hedax/contracts';
import { z } from 'zod';
import type { PolicyKind } from '../../generated/prisma/enums.js';
import { AuditService } from '../../common/audit.service.js';
import { CurrentActor, Public, RequirePermissions } from '../../common/auth/decorators.js';
import { badRequest, conflict, notFound } from '../../common/errors.js';
import { Prisma, PrismaService } from '../../common/prisma.service.js';
import type { Actor } from '../../common/request-context.js';
import { ApiZodBody, zod } from '../../common/zod.js';
import { SITE_SETTINGS_KEY, SettingsService } from './settings.service.js';

const POLICY_KINDS = ['TERMS', 'PRIVACY', 'RETURNS', 'SHIPPING', 'SOURCING', 'WARRANTY'] as const;
const siteUpdateSchema = siteSettingsSchema.extend({ version: z.number().int().min(0) });

@ApiTags('settings')
@Controller()
export class SettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /** Public contact info: only what the owner configured (empty until launch checklist is done). */
  @Public()
  @Get('site/contact')
  async contact(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    const s = await this.settings.site();
    return {
      phone: s.contactPhone ?? null,
      email: s.contactEmail || null,
      address: { fa: s.contactAddressFa ?? null, en: s.contactAddressEn ?? null },
      workingHours: { fa: s.workingHoursFa ?? null, en: s.workingHoursEn ?? null },
    };
  }

  @Public()
  @Get('site/policies/:kind')
  async policy(@Param('kind') kind: string, @Res({ passthrough: true }) res: Response) {
    const k = z.enum(POLICY_KINDS).safeParse(kind.toUpperCase());
    if (!k.success) throw notFound();
    const p = await this.settings.publishedPolicy(k.data as PolicyKind);
    if (!p) throw notFound('POLICY_NOT_PUBLISHED', 'This policy has not been published yet');
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    return { id: p.id, kind: p.kind, version: p.version, title: { fa: p.titleFa, en: p.titleEn }, body: { fa: p.bodyFa, en: p.bodyEn }, publishedAt: p.publishedAt?.toISOString() ?? null };
  }

  @RequirePermissions('settings.manage')
  @Get('admin/settings')
  async getSite() {
    return this.settings.site();
  }

  @RequirePermissions('settings.manage')
  @Put('admin/settings')
  @ApiZodBody(siteUpdateSchema)
  async updateSite(@Body(zod(siteUpdateSchema)) body: z.infer<typeof siteUpdateSchema>, @CurrentActor() actor: Actor) {
    const { version, ...value } = body;
    return this.prisma.tx(async (tx) => {
      const current = await tx.siteSetting.findUnique({ where: { key: SITE_SETTINGS_KEY } });
      if ((current?.version ?? 0) !== version) throw conflict('VERSION_CONFLICT', 'Settings were changed by someone else');
      await tx.siteSetting.upsert({
        where: { key: SITE_SETTINGS_KEY },
        create: { key: SITE_SETTINGS_KEY, value: value as Prisma.InputJsonValue, version: 1, updatedById: actor.userId },
        update: { value: value as Prisma.InputJsonValue, version: { increment: 1 }, updatedById: actor.userId },
      });
      await this.audit.record(tx, { action: 'settings.updated', entityType: 'site_setting', entityId: SITE_SETTINGS_KEY, before: current?.value, after: value });
      return { saved: true, version: version + 1 };
    });
  }

  // ---- Policies: versioned; publishing a new version never alters accepted old ones ----

  @RequirePermissions('content.manage')
  @Get('admin/policies')
  async policies() {
    const rows = await this.prisma.policyVersion.findMany({ orderBy: [{ kind: 'asc' }, { version: 'desc' }] });
    return rows.map((p) => ({ id: p.id, kind: p.kind, version: p.version, status: p.status, titleFa: p.titleFa, titleEn: p.titleEn, publishedAt: p.publishedAt?.toISOString() ?? null }));
  }

  @RequirePermissions('content.manage')
  @Post('admin/policies')
  @ApiZodBody(policyVersionSchema)
  async createPolicy(@Body(zod(policyVersionSchema)) body: z.infer<typeof policyVersionSchema>, @CurrentActor() actor: Actor) {
    return this.prisma.tx(async (tx) => {
      const last = await tx.policyVersion.findFirst({ where: { kind: body.kind }, orderBy: { version: 'desc' } });
      const contentHash = createHash('sha256').update(JSON.stringify([body.titleFa, body.bodyFa, body.titleEn ?? '', body.bodyEn ?? ''])).digest('hex');
      const row = await tx.policyVersion.create({
        data: { kind: body.kind, version: (last?.version ?? 0) + 1, titleFa: body.titleFa, titleEn: body.titleEn ?? null, bodyFa: body.bodyFa, bodyEn: body.bodyEn ?? null, contentHash, createdById: actor.userId },
      });
      await this.audit.record(tx, { action: 'policy.draft_created', entityType: 'policy_version', entityId: row.id, after: { kind: row.kind, version: row.version } });
      return { id: row.id, version: row.version };
    });
  }

  @RequirePermissions('content.manage', 'settings.manage')
  @Post('admin/policies/:id/publish')
  async publishPolicy(@Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.tx(async (tx) => {
      const p = await tx.policyVersion.findUnique({ where: { id } });
      if (!p) throw notFound();
      if (p.status !== 'DRAFT') throw conflict('NOT_A_DRAFT');
      await tx.policyVersion.updateMany({ where: { kind: p.kind, status: 'PUBLISHED' }, data: { status: 'RETIRED' } });
      await tx.policyVersion.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
      await this.audit.record(tx, { action: 'policy.published', entityType: 'policy_version', entityId: id, after: { kind: p.kind, version: p.version } });
      return { id, status: 'PUBLISHED' };
    });
  }

  // ---- Shipping methods & zones ----

  @RequirePermissions('shipping.manage')
  @Get('admin/shipping-methods')
  async shippingMethods() {
    const rows = await this.prisma.shippingMethod.findMany({ include: { zones: true }, orderBy: { sortOrder: 'asc' } });
    return rows.map((m) => ({
      ...m,
      zones: m.zones.map((z) => ({ ...z, costIrrMinor: z.costIrrMinor?.toString() ?? null })),
    }));
  }

  @RequirePermissions('shipping.manage')
  @Post('admin/shipping-methods')
  @ApiZodBody(shippingMethodSchema)
  async createShipping(@Body(zod(shippingMethodSchema)) body: z.infer<typeof shippingMethodSchema>) {
    return this.saveShipping(null, body);
  }

  @RequirePermissions('shipping.manage')
  @Put('admin/shipping-methods/:id')
  async updateShipping(@Param('id', ParseUUIDPipe) id: string, @Body(zod(shippingMethodSchema)) body: z.infer<typeof shippingMethodSchema>) {
    return this.saveShipping(id, body);
  }

  private async saveShipping(id: string | null, body: z.infer<typeof shippingMethodSchema>) {
    if (body.trackingUrlTemplate && !body.carrierCode) throw badRequest('CARRIER_REQUIRED', 'Tracking links need a configured carrier');
    return this.prisma.tx(async (tx) => {
      const data = {
        code: body.code, nameFa: body.nameFa, nameEn: body.nameEn ?? null, carrierCode: body.carrierCode ?? null,
        trackingUrlTemplate: body.trackingUrlTemplate ?? null, active: body.active,
      };
      const method = id ? await tx.shippingMethod.update({ where: { id }, data: { ...data, version: { increment: 1 } } }) : await tx.shippingMethod.create({ data });
      await tx.shippingZone.deleteMany({ where: { methodId: method.id } });
      await tx.shippingZone.createMany({
        data: body.zones.map((z) => ({ methodId: method.id, provinces: z.provinces, costIrrMinor: z.costIrr === null ? null : BigInt(z.costIrr), minDays: z.minDays, maxDays: z.maxDays })),
      });
      await this.audit.record(tx, { action: id ? 'shipping.updated' : 'shipping.created', entityType: 'shipping_method', entityId: method.id, after: body });
      return { id: method.id };
    });
  }

  // ---- Business calendars (holidays are never guessed) ----

  @RequirePermissions('settings.manage')
  @Get('admin/calendars')
  calendars() {
    return this.prisma.businessCalendar.findMany({ orderBy: { createdAt: 'asc' } });
  }

  @RequirePermissions('settings.manage')
  @Put('admin/calendars/:id')
  async updateCalendar(@Param('id', ParseUUIDPipe) id: string, @Body(zod(businessCalendarSchema)) body: z.infer<typeof businessCalendarSchema>, @CurrentActor() actor: Actor) {
    if (body.weekendDays.length >= 7) throw badRequest('INVALID_CALENDAR');
    return this.prisma.tx(async (tx) => {
      const before = await tx.businessCalendar.findUnique({ where: { id } });
      if (!before) throw notFound();
      await tx.businessCalendar.update({
        where: { id },
        data: { name: body.name, weekendDays: [...new Set(body.weekendDays)], holidays: [...new Set(body.holidays)].sort(), version: { increment: 1 }, updatedById: actor.userId },
      });
      await this.audit.record(tx, { action: 'calendar.updated', entityType: 'business_calendar', entityId: id, before, after: body });
      return { id };
    });
  }
}
