import { Injectable } from '@nestjs/common';
import type { FinderGroupView, FinderModelView, FinderVehicleView, VehicleSelectionView, VehicleSupply, YearCalendar } from '@hedax/contracts';
import { badRequest } from '../../common/errors.js';
import { Prisma, PrismaService } from '../../common/prisma.service.js';

/** A rejected finder selection names the step that is wrong; the page shows it instead of unrelated parts. */
const invalid = (field: 'group' | 'vehicle' | 'model' | 'year', reason: string) =>
  badRequest('VEHICLE_SELECTION_INVALID', 'The vehicle selection is not valid', { field, reason });

export interface ResolvedSelection {
  view: VehicleSelectionView;
  vehicleId: string;
  modelId: string | null;
  year: number | null;
  calendar: YearCalendar | null;
}

/** Persian (jalali) and Gregorian four-digit years never overlap; a link's calendar follows from its value. */
const linkCalendar = Prisma.sql`(CASE WHEN COALESCE(pv."year_from", pv."year_to") BETWEEN 1300 AND 1499 THEN 'jalali'
  WHEN COALESCE(pv."year_from", pv."year_to") BETWEEN 1900 AND 2100 THEN 'gregorian' END)`;

/**
 * Home-page vehicle finder: group (ایران‌خودرو، سایپا …) → vehicle → model/trim → year, served one
 * step at a time. Only classified vehicles (finderVisible) appear; a selection is checked on the
 * server at every step, so an invalid or stale URL never falls back to the whole catalog.
 *
 * Parts come from product links only: links to the vehicle or model, and links to an older row
 * that the reviewed dataset declares equivalent (vehicle_equivalence). Similar names never count.
 * With a year, a link without a year range in that calendar is shown but marked "year not confirmed".
 */
@Injectable()
export class VehicleFinderService {
  constructor(private readonly prisma: PrismaService) {}

  async groups(): Promise<FinderGroupView[]> {
    const rows = await this.prisma.vehicleBrand.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { nameFa: 'asc' }],
      include: { _count: { select: { finderVehicles: { where: { vehicle: { active: true, finderVisible: true } } } } } },
    });
    return rows.map((b) => ({ slug: b.slug, name: { fa: b.nameFa, en: b.nameEn }, logoUrl: b.logoUrl, vehicleCount: b._count.finderVehicles }));
  }

  async vehicles(groupSlug: string): Promise<FinderVehicleView[]> {
    const group = await this.group(groupSlug);
    const rows = await this.prisma.vehicle.findMany({
      where: { finderGroups: { some: { vehicleBrandId: group.id } }, active: true, finderVisible: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { models: { where: { active: true } } } } },
    });
    return rows.map((v) => ({
      slug: v.slug, name: { fa: v.name, en: v.nameEn }, make: v.makeFa ? { fa: v.makeFa, en: v.makeEn } : null,
      aliases: v.aliases, modelCount: v._count.models,
    }));
  }

  async models(groupSlug: string, vehicleSlug: string): Promise<FinderModelView[]> {
    const vehicle = await this.vehicleIn(await this.group(groupSlug), vehicleSlug);
    const rows = await this.prisma.vehicleModel.findMany({ where: { vehicleId: vehicle.id, active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return rows.map((m) => ({
      slug: m.slug, name: { fa: m.name, en: m.nameEn }, aliases: m.aliases,
      supply: (m.supply as VehicleSupply | null) ?? null,
      supplier: m.supplierFa ? { fa: m.supplierFa, en: m.supplierEn } : null,
      years: m.yearFrom !== null && m.yearTo !== null && m.yearCalendar ? { from: m.yearFrom, to: m.yearTo, calendar: m.yearCalendar as YearCalendar } : null,
    }));
  }

  /**
   * Checks a finder selection from the URL. Without `group` this is not a finder search (the /cars
   * pages keep their own vehicle/model filter) and null is returned; a year then is rejected.
   */
  async resolve(q: { group?: string | undefined; vehicle?: string | undefined; model?: string | undefined; year?: number | undefined }): Promise<ResolvedSelection | null> {
    if (!q.group) {
      if (q.year !== undefined) throw invalid('year', 'GROUP_REQUIRED');
      return null;
    }
    const group = await this.group(q.group);
    if (!q.vehicle) throw invalid('vehicle', 'REQUIRED');
    const vehicle = await this.vehicleIn(group, q.vehicle);
    const model = q.model ? await this.prisma.vehicleModel.findFirst({ where: { vehicleId: vehicle.id, slug: q.model, active: true } }) : null;
    if (q.model && !model) throw invalid('model', 'NOT_IN_VEHICLE');
    let calendar: YearCalendar | null = null;
    if (q.year !== undefined) {
      if (!model) throw invalid('year', 'MODEL_REQUIRED');
      if (model.yearFrom === null || model.yearTo === null || !model.yearCalendar) throw invalid('year', 'NO_YEARS');
      if (q.year < model.yearFrom || q.year > model.yearTo) throw invalid('year', 'OUT_OF_RANGE');
      calendar = model.yearCalendar as YearCalendar;
    }
    return {
      vehicleId: vehicle.id, modelId: model?.id ?? null, year: q.year ?? null, calendar,
      view: {
        group: { slug: group.slug, name: { fa: group.nameFa, en: group.nameEn } },
        vehicle: { slug: vehicle.slug, name: { fa: vehicle.name, en: vehicle.nameEn } },
        model: model ? { slug: model.slug, name: { fa: model.name, en: model.nameEn } } : null,
        year: q.year ?? null, calendar,
      },
    };
  }

  /** WHERE condition (on product alias `p`) for parts linked to the selection; with a year, years must not contradict it. */
  productCondition(sel: ResolvedSelection): Prisma.Sql {
    return Prisma.sql`EXISTS (SELECT 1 FROM "product_vehicle" pv WHERE pv."product_id" = p."id" AND ${this.linkMatch(sel)} AND ${this.yearAllows(sel)})`;
  }

  /** Of `productIds`, those whose year is confirmed: a link that matches the selection and covers the year in its calendar. */
  async yearConfirmed(sel: ResolvedSelection, productIds: string[]): Promise<Set<string>> {
    if (sel.year === null || !sel.calendar || !productIds.length) return new Set(productIds);
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`SELECT DISTINCT pv."product_id" AS id FROM "product_vehicle" pv
      WHERE pv."product_id" = ANY(${productIds}::uuid[]) AND ${this.linkMatch(sel)} AND ${this.yearCovers(sel)}`;
    return new Set(rows.map((r) => r.id));
  }

  // A link matches: to the vehicle (whole vehicle, or the chosen model / any active model), or to an
  // older vehicle/model declared equivalent for this vehicle (and model) in the reviewed dataset.
  private linkMatch(sel: ResolvedSelection): Prisma.Sql {
    const direct = sel.modelId
      ? Prisma.sql`(pv."vehicle_id" = ${sel.vehicleId}::uuid AND (pv."model_id" IS NULL OR pv."model_id" = ${sel.modelId}::uuid))`
      : Prisma.sql`(pv."vehicle_id" = ${sel.vehicleId}::uuid AND (pv."model_id" IS NULL OR EXISTS (SELECT 1 FROM "vehicle_model" vm WHERE vm."id" = pv."model_id" AND vm."active")))`;
    const eqModel = sel.modelId ? Prisma.sql`AND (e."model_id" IS NULL OR e."model_id" = ${sel.modelId}::uuid)` : Prisma.empty;
    const equivalent = Prisma.sql`EXISTS (SELECT 1 FROM "vehicle_equivalence" e WHERE e."vehicle_id" = ${sel.vehicleId}::uuid ${eqModel}
      AND pv."vehicle_id" = e."legacy_vehicle_id" AND pv."model_id" IS NOT DISTINCT FROM e."legacy_model_id")`;
    return Prisma.sql`(${direct} OR ${equivalent})`;
  }

  // With a year: a link without years, or with years in another/unknown calendar, does not contradict
  // it (listed, marked unconfirmed); a link with years in the same calendar must cover the year.
  private yearAllows(sel: ResolvedSelection): Prisma.Sql {
    if (sel.year === null || !sel.calendar) return Prisma.sql`TRUE`;
    return Prisma.sql`((pv."year_from" IS NULL AND pv."year_to" IS NULL) OR ${linkCalendar} IS DISTINCT FROM ${sel.calendar} OR ${this.yearCovers(sel)})`;
  }

  private yearCovers(sel: ResolvedSelection): Prisma.Sql {
    return Prisma.sql`(${linkCalendar} = ${sel.calendar} AND COALESCE(pv."year_from", -1) <= ${sel.year} AND COALESCE(pv."year_to", 99999) >= ${sel.year})`;
  }

  private async group(slug: string) {
    const group = await this.prisma.vehicleBrand.findFirst({ where: { slug: slug.slice(0, 64), active: true } });
    if (!group) throw invalid('group', 'UNKNOWN');
    return group;
  }

  private async vehicleIn(group: { id: string }, slug: string) {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { slug: slug.slice(0, 80), finderGroups: { some: { vehicleBrandId: group.id } }, active: true, finderVisible: true } });
    if (!vehicle) throw invalid('vehicle', 'NOT_IN_GROUP');
    return vehicle;
  }
}
