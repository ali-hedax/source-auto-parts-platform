import { Injectable } from '@nestjs/common';
import type { FinderGroupView, FinderMatch, FinderMatchReason, FinderMatchTier, FinderModelView, FinderVehicleView, VehicleSelectionView, VehicleSupply, YearCalendar } from '@hedax/contracts';
import { compactSearchText, yearCalendarOf } from '@hedax/domain';
import { badRequest } from '../../common/errors.js';
import { Prisma, PrismaService } from '../../common/prisma.service.js';

/** A rejected finder selection names the step that is wrong; the page shows it instead of unrelated parts. */
const invalid = (field: 'group' | 'vehicle' | 'model' | 'year', reason: string) =>
  badRequest('VEHICLE_SELECTION_INVALID', 'The vehicle selection is not valid', { field, reason });

export interface ResolvedSelection {
  view: VehicleSelectionView;
  groupId: string | null;
  vehicleId: string | null;
  modelId: string | null;
  year: number | null;
  calendar: YearCalendar | null;
  /** Normalized (compact) names of the vehicle, for the "named in the part" suggestion. */
  nameKeys: string[];
  /** Groups whose tag on a part makes it a suggestion: the chosen group, or the vehicle's groups. */
  tagGroupIds: string[];
}

const TIER_BY_RANK: Record<string, FinderMatchTier> = { 1: 'verified', 2: 'relevant', 3: 'related', 4: 'text' };

/** Persian (jalali) and Gregorian four-digit years never overlap; a link's calendar follows from its value. */
const linkCalendar = Prisma.sql`(CASE WHEN COALESCE(l."yf", l."yt") BETWEEN 1300 AND 1499 THEN 'jalali'
  WHEN COALESCE(l."yf", l."yt") BETWEEN 1900 AND 2100 THEN 'gregorian' END)`;

/**
 * Home-page vehicle finder: group (ایران‌خودرو، سایپا …) → vehicle → model/trim → year, served one
 * step at a time. Every step is optional; only classified vehicles (finderVisible) appear, and a
 * selection is checked on the server, so an inconsistent URL is refused instead of listing parts.
 *
 * Results are ranked, never filtered by guesswork:
 *   1 verified  — a recorded fitment link for the selection (and the year, when chosen);
 *   2 relevant  — linked to the vehicle, but the year, or the model when none was chosen, is not confirmed;
 *   3 related   — a suggestion only: another model/years of the vehicle, a part tagged with the group,
 *                 or the vehicle named in the part;
 *   4 text      — only with a typed search: matches the text, no fitment information.
 * Links to an older row count only through a reviewed equivalence (vehicle_equivalence), never by name.
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

  /** Vehicles of a group, or of every group when none is given (the vehicle step works on its own). */
  async vehicles(groupSlug?: string): Promise<FinderVehicleView[]> {
    const group = groupSlug ? await this.group(groupSlug) : null;
    const rows = await this.prisma.vehicle.findMany({
      where: { ...(group ? { finderGroups: { some: { vehicleBrandId: group.id } } } : {}), active: true, finderVisible: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { models: { where: { active: true } } } }, finderGroups: { select: { vehicleBrand: { select: { slug: true, sortOrder: true } } } } },
    });
    return rows.map((v) => ({
      slug: v.slug, name: { fa: v.name, en: v.nameEn }, make: v.makeFa ? { fa: v.makeFa, en: v.makeEn } : null,
      aliases: v.aliases, modelCount: v._count.models,
      groups: v.finderGroups.map((g) => g.vehicleBrand).sort((a, b) => a.sortOrder - b.sortOrder).map((g) => g.slug),
    }));
  }

  async models(groupSlug: string | undefined, vehicleSlug: string): Promise<FinderModelView[]> {
    const vehicle = await this.vehicleIn(groupSlug ? await this.group(groupSlug) : null, vehicleSlug);
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
   * pages keep their own vehicle/model filter) and null is returned; a lone year is refused.
   * Steps may be left out, but what is given must belong together.
   */
  async resolve(q: { group?: string | undefined; vehicle?: string | undefined; model?: string | undefined; year?: number | undefined }): Promise<ResolvedSelection | null> {
    if (!q.group) {
      if (q.year !== undefined) throw invalid('year', 'GROUP_REQUIRED');
      return null;
    }
    const group = await this.group(q.group);
    const vehicle = q.vehicle ? await this.vehicleIn(group, q.vehicle) : null;
    if (q.model && !vehicle) throw invalid('model', 'VEHICLE_REQUIRED');
    const model = q.model && vehicle ? await this.prisma.vehicleModel.findFirst({ where: { vehicleId: vehicle.id, slug: q.model, active: true } }) : null;
    if (q.model && !model) throw invalid('model', 'NOT_IN_VEHICLE');
    let calendar: YearCalendar | null = null;
    if (q.year !== undefined) {
      if (!vehicle) throw invalid('year', 'VEHICLE_REQUIRED');
      const modelYears = model && model.yearFrom !== null && model.yearTo !== null && model.yearCalendar ? model : null;
      if (modelYears && (q.year < modelYears.yearFrom! || q.year > modelYears.yearTo!)) throw invalid('year', 'OUT_OF_RANGE');
      calendar = (modelYears?.yearCalendar as YearCalendar | undefined) ?? yearCalendarOf(q.year);
      if (!calendar) throw invalid('year', 'UNKNOWN_CALENDAR');
    }
    const groups = vehicle ? await this.prisma.vehicleFinderGroup.findMany({ where: { vehicleId: vehicle.id }, select: { vehicleBrandId: true } }) : [];
    const nameKeys = vehicle ? [...new Set([vehicle.name, vehicle.nameEn ?? '', ...vehicle.aliases].map((n) => compactSearchText(n)).filter((k) => k.length >= 3 && /\p{L}/u.test(k)))] : [];
    return {
      groupId: group.id, vehicleId: vehicle?.id ?? null, modelId: model?.id ?? null, year: q.year ?? null, calendar, nameKeys,
      tagGroupIds: vehicle ? groups.map((g) => g.vehicleBrandId) : [group.id],
      view: {
        group: { slug: group.slug, name: { fa: group.nameFa, en: group.nameEn } },
        vehicle: vehicle ? { slug: vehicle.slug, name: { fa: vehicle.name, en: vehicle.nameEn } } : null,
        model: model ? { slug: model.slug, name: { fa: model.name, en: model.nameEn } } : null,
        year: q.year ?? null, calendar,
      },
    };
  }

  /**
   * SQL (on product alias `p`) giving each part its rank and reason as text, e.g. '1:MODEL'; NULL when
   * the part has nothing to do with the selection. With `typed` (a text search), other matches get '4:TEXT'.
   */
  matchCode(sel: ResolvedSelection, typed: boolean): Prisma.Sql {
    const text = typed ? Prisma.sql`'4:TEXT'` : Prisma.sql`NULL`;
    const tagged = sel.tagGroupIds.length
      ? Prisma.sql`EXISTS (SELECT 1 FROM "product_vehicle_brand" pvb WHERE pvb."product_id" = p."id" AND pvb."vehicle_brand_id" = ANY(${sel.tagGroupIds}::uuid[]))`
      : Prisma.sql`FALSE`;
    if (!sel.vehicleId) {
      // Only a group: parts recorded for any vehicle of the group, then parts tagged with the group.
      const groupLinks = Prisma.sql`EXISTS (SELECT 1 FROM "product_vehicle" pv JOIN "vehicle_finder_group" fg ON fg."vehicle_brand_id" = ${sel.groupId}::uuid
          JOIN "vehicle" v ON v."id" = fg."vehicle_id" AND v."active" AND v."finder_visible"
        WHERE pv."product_id" = p."id" AND (pv."vehicle_id" = v."id" OR EXISTS (SELECT 1 FROM "vehicle_equivalence" e WHERE e."vehicle_id" = v."id"
          AND pv."vehicle_id" = e."legacy_vehicle_id" AND pv."model_id" IS NOT DISTINCT FROM e."legacy_model_id")))`;
      return Prisma.sql`(CASE WHEN ${groupLinks} THEN '1:GROUP' WHEN ${tagged} THEN '3:GROUP_TAG' ELSE ${text} END)`;
    }
    // The part's links to the vehicle: direct, or to an older row declared equivalent (mapped to its model).
    const links = Prisma.sql`(SELECT pv."model_id" AS "m", pv."year_from" AS "yf", pv."year_to" AS "yt" FROM "product_vehicle" pv
        WHERE pv."product_id" = p."id" AND pv."vehicle_id" = ${sel.vehicleId}::uuid
      UNION ALL SELECT e."model_id", pv."year_from", pv."year_to" FROM "product_vehicle" pv
        JOIN "vehicle_equivalence" e ON e."vehicle_id" = ${sel.vehicleId}::uuid AND pv."vehicle_id" = e."legacy_vehicle_id" AND pv."model_id" IS NOT DISTINCT FROM e."legacy_model_id"
        WHERE pv."product_id" = p."id")`;
    const any = (cond: Prisma.Sql) => Prisma.sql`EXISTS (SELECT 1 FROM ${links} l WHERE ${cond})`;
    // The chosen model (or the whole vehicle); without a model, only whole-vehicle links fit for sure.
    const modelFits = sel.modelId ? Prisma.sql`(l."m" IS NULL OR l."m" = ${sel.modelId}::uuid)` : Prisma.sql`(l."m" IS NULL)`;
    const yearCovered = sel.year !== null && sel.calendar
      ? Prisma.sql`(${linkCalendar} = ${sel.calendar} AND COALESCE(l."yf", -1) <= ${sel.year} AND COALESCE(l."yt", 99999) >= ${sel.year})`
      : Prisma.sql`TRUE`;
    const yearOpen = sel.year !== null && sel.calendar
      ? Prisma.sql`((l."yf" IS NULL AND l."yt" IS NULL) OR ${linkCalendar} IS DISTINCT FROM ${sel.calendar})`
      : Prisma.sql`TRUE`;
    const named = sel.nameKeys.length
      ? Prisma.sql`(${Prisma.join(sel.nameKeys.map((k) => Prisma.sql`p."search_compact" LIKE ${`%${k}%`}`), ' OR ')})`
      : Prisma.sql`FALSE`;
    const verified = sel.modelId ? Prisma.sql`'1:MODEL'` : Prisma.sql`'1:VEHICLE'`;
    return Prisma.sql`(CASE
      WHEN ${any(Prisma.sql`${modelFits} AND ${yearCovered}`)} THEN ${verified}
      WHEN ${sel.year !== null ? any(Prisma.sql`${modelFits} AND ${yearOpen}`) : Prisma.sql`FALSE`} THEN '2:YEAR_UNCONFIRMED'
      WHEN ${sel.modelId ? Prisma.sql`FALSE` : any(Prisma.sql`l."m" IS NOT NULL AND (${yearCovered} OR ${yearOpen})`)} THEN '2:SOME_MODEL'
      WHEN ${sel.modelId ? any(Prisma.sql`l."m" IS NOT NULL AND l."m" <> ${sel.modelId}::uuid`) : Prisma.sql`FALSE`} THEN '3:OTHER_MODEL'
      WHEN ${any(Prisma.sql`TRUE`)} THEN '3:OTHER_YEARS'
      WHEN ${tagged} THEN '3:GROUP_TAG'
      WHEN ${named} THEN '3:NAME_MATCH'
      ELSE ${text} END)`;
  }

  /** Splits a match code ('1:MODEL') into its card form. */
  parseMatch(code: string | null): FinderMatch | null {
    if (!code) return null;
    const [rank, reason] = code.split(':');
    const tier = TIER_BY_RANK[rank ?? ''];
    return tier ? { tier, reason: reason as FinderMatchReason } : null;
  }

  private async group(slug: string) {
    const group = await this.prisma.vehicleBrand.findFirst({ where: { slug: slug.slice(0, 64), active: true } });
    if (!group) throw invalid('group', 'UNKNOWN');
    return group;
  }

  private async vehicleIn(group: { id: string } | null, slug: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { slug: slug.slice(0, 80), ...(group ? { finderGroups: { some: { vehicleBrandId: group.id } } } : {}), active: true, finderVisible: true },
    });
    if (!vehicle) throw invalid('vehicle', group ? 'NOT_IN_GROUP' : 'UNKNOWN');
    return vehicle;
  }
}

