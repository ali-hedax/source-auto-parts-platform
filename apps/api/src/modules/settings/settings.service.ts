import { Injectable } from '@nestjs/common';
import { siteSettingsSchema, type ShippingOptionView } from '@hedax/contracts';
import type { BusinessCalendar, TaxRule } from '@hedax/domain';
import type { z } from 'zod';
import type { PolicyKind } from '../../generated/prisma/enums.js';
import { PrismaService, type Tx } from '../../common/prisma.service.js';
import { irr } from '../../common/serialize.js';

export type SiteSettings = z.infer<typeof siteSettingsSchema>;
export const SITE_SETTINGS_KEY = 'site';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async site(tx?: Tx): Promise<SiteSettings & { version: number }> {
    const db = tx ?? this.prisma;
    const row = await db.siteSetting.findUnique({ where: { key: SITE_SETTINGS_KEY } });
    const parsed = siteSettingsSchema.parse(row?.value ?? {});
    return { ...parsed, version: row?.version ?? 0 };
  }

  /** Tax is applied only when the owner configured it; otherwise nothing is added and the snapshot says so. */
  async taxRule(tx?: Tx): Promise<TaxRule | null> {
    const s = await this.site(tx);
    if (s.taxRateBasisPoints === null) return null;
    return { id: 'site-tax', version: s.version, rateBasisPoints: s.taxRateBasisPoints, base: s.taxBase };
  }

  async publishedPolicy(kind: PolicyKind, tx?: Tx) {
    const db = tx ?? this.prisma;
    return db.policyVersion.findFirst({ where: { kind, status: 'PUBLISHED' } });
  }

  async defaultCalendar(tx?: Tx): Promise<BusinessCalendar | null> {
    const db = tx ?? this.prisma;
    const c = await db.businessCalendar.findFirst({ where: { isDefault: true } });
    return c ? { id: c.id, timeZone: c.timeZone, weekendDays: c.weekendDays, holidays: c.holidays } : null;
  }

  async calendarById(id: string, tx?: Tx): Promise<BusinessCalendar | null> {
    const db = tx ?? this.prisma;
    const c = await db.businessCalendar.findUnique({ where: { id } });
    return c ? { id: c.id, timeZone: c.timeZone, weekendDays: c.weekendDays, holidays: c.holidays } : null;
  }

  /**
   * Shipping options for a destination province. A zone with an empty province
   * list covers all provinces. A NULL cost means "unknown": payment stays
   * disabled and an inquiry path is offered — the cost is never assumed to be 0.
   */
  async shippingOptions(province: string | null, tx?: Tx): Promise<Array<ShippingOptionView & { zoneId: string | null; costIrr: bigint | null }>> {
    const db = tx ?? this.prisma;
    const methods = await db.shippingMethod.findMany({ where: { active: true }, include: { zones: true }, orderBy: { sortOrder: 'asc' } });
    return methods.map((m) => {
      const zone =
        (province ? m.zones.find((z) => z.provinces.includes(province)) : undefined) ?? m.zones.find((z) => z.provinces.length === 0);
      const costIrr = zone?.costIrrMinor ?? null;
      return {
        id: m.id,
        name: { fa: m.nameFa, en: m.nameEn },
        cost: costIrr === null ? { status: 'UNKNOWN' as const } : { status: 'KNOWN' as const, amount: irr(costIrr) },
        estimate: zone && zone.minDays !== null && zone.maxDays !== null ? { minDays: zone.minDays, maxDays: zone.maxDays } : null,
        zoneId: zone?.id ?? null,
        costIrr,
      };
    });
  }
}
