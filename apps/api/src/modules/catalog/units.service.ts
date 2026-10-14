import { Injectable } from '@nestjs/common';
import type { UnitRef, UnitView, unitUpdateSchema, unitUpsertSchema } from '@hedax/contracts';
import { DEFAULT_UNIT_NAME, type UnitRule, normalizeSearchText, parseAmountMilli, quantityToSteps, stepsToQuantity, unitRuleProblems } from '@hedax/domain';
import type { z } from 'zod';
import { AuditService } from '../../common/audit.service.js';
import { badRequest, conflict, notFound } from '../../common/errors.js';
import { PrismaService, type Tx } from '../../common/prisma.service.js';

interface UnitRow { id: string; name: string; nameEn: string | null; allowDecimal: boolean; stepMilli: number; active: boolean; sortOrder: number }

export const unitRef = (u: Pick<UnitRow, 'name' | 'nameEn' | 'allowDecimal' | 'stepMilli'>): UnitRef => ({ name: u.name, nameEn: u.nameEn, allowDecimal: u.allowDecimal, step: u.stepMilli / 1000 });
export const unitRule = (u: Pick<UnitRow, 'name' | 'allowDecimal' | 'stepMilli'>): UnitRule => ({ name: u.name, allowDecimal: u.allowDecimal, stepMilli: u.stepMilli });

/** Amount in the unit (from the API) → stored steps; refused with UNIT_QUANTITY_INVALID (422) when the unit does not allow it. */
export const toSteps = (amount: number, u: Pick<UnitRow, 'name' | 'allowDecimal' | 'stepMilli'>, allowZero = false): number => quantityToSteps(amount, unitRule(u), { allowZero });
/** Stored steps → amount in the unit (to the API). */
export const fromSteps = (steps: number, u: Pick<UnitRow, 'stepMilli'>): number => stepsToQuantity(steps, u);

/**
 * Sales units (panel → units): add, edit, deactivate, delete when unused. A unit used by a product
 * keeps its step and decimal rule (stored quantities count its steps) and can only be deactivated;
 * renaming it renames it on its products too. Every change is in the audit trail.
 */
@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(onlyActive = false): Promise<UnitView[]> {
    const rows = await this.prisma.unit.findMany({
      where: onlyActive ? { active: true } : {},
      include: { _count: { select: { products: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((u) => ({ id: u.id, ...unitRef(u), active: u.active, sortOrder: u.sortOrder, productCount: u._count.products }));
  }

  /** The unit for a new product when none is given (imports): «عدد», or the first active unit. */
  async defaultUnit(tx?: Tx): Promise<UnitRow> {
    const db = tx ?? this.prisma;
    const row = (await db.unit.findFirst({ where: { name: DEFAULT_UNIT_NAME, active: true } })) ?? (await db.unit.findFirst({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }));
    if (!row) throw conflict('NO_ACTIVE_UNIT', 'Add or activate a unit first');
    return row;
  }

  /** Finds a unit by its name as typed (Arabic ي/ك, digits, spaces and case do not matter). */
  async findByName(name: string, tx?: Tx): Promise<UnitRow | null> {
    const wanted = normalizeSearchText(name);
    if (!wanted) return null;
    const rows = await (tx ?? this.prisma).unit.findMany();
    return rows.find((u) => normalizeSearchText(u.name) === wanted || (u.nameEn ? normalizeSearchText(u.nameEn) === wanted : false)) ?? null;
  }

  /** A unit for a product form: must exist and be active (an inactive unit stays on products that already use it). */
  async usable(id: string, currentUnitId: string | null, tx?: Tx): Promise<UnitRow> {
    const row = await (tx ?? this.prisma).unit.findUnique({ where: { id } });
    if (!row || (!row.active && row.id !== currentUnitId)) throw badRequest('UNIT_UNAVAILABLE', 'Choose an active unit');
    return row;
  }

  /** The unit of each product (by product id). */
  async forProducts(productIds: string[], tx?: Tx): Promise<Map<string, UnitRow>> {
    const rows = await (tx ?? this.prisma).product.findMany({ where: { id: { in: productIds } }, select: { id: true, salesUnit: true } });
    return new Map(rows.map((r) => [r.id, r.salesUnit]));
  }

  async forProduct(productId: string, tx?: Tx): Promise<UnitRow> {
    const unit = (await this.forProducts([productId], tx)).get(productId);
    if (!unit) throw notFound();
    return unit;
  }

  async create(body: z.infer<typeof unitUpsertSchema>) {
    const stepMilli = this.stepMilli(body.step, body.allowDecimal);
    return this.prisma.tx(async (tx) => {
      await this.assertNameFree(tx, body.name, null);
      const row = await tx.unit.create({ data: { name: body.name, nameEn: body.nameEn || null, allowDecimal: body.allowDecimal, stepMilli, active: body.active, sortOrder: body.sortOrder } });
      await this.audit.record(tx, { action: 'unit.created', entityType: 'unit', entityId: row.id, after: unitView(row) });
      return { id: row.id };
    });
  }

  async update(id: string, body: z.infer<typeof unitUpdateSchema>) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.unit.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
      if (!before) throw notFound();
      const allowDecimal = body.allowDecimal ?? before.allowDecimal;
      const stepMilli = body.step === undefined ? before.stepMilli : this.stepMilli(body.step, allowDecimal);
      if (body.step === undefined) this.stepMilli(before.stepMilli / 1000, allowDecimal);
      const ruleChanged = allowDecimal !== before.allowDecimal || stepMilli !== before.stepMilli;
      if (ruleChanged && before._count.products > 0) {
        throw conflict('UNIT_IN_USE_LOCKED', 'The step and decimal rule of a unit in use cannot change; add a new unit instead', { products: before._count.products });
      }
      if (body.name !== undefined && body.name !== before.name) await this.assertNameFree(tx, body.name, id);
      const row = await tx.unit.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.nameEn !== undefined ? { nameEn: body.nameEn || null } : {}),
          allowDecimal, stepMilli,
          ...(body.active !== undefined ? { active: body.active } : {}),
          ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        },
      });
      // Products show the unit's name; keep their copy of it in step.
      if (row.name !== before.name) await tx.product.updateMany({ where: { unitId: id }, data: { unit: row.name } });
      await this.audit.record(tx, { action: 'unit.updated', entityType: 'unit', entityId: id, before: unitView(before), after: unitView(row) });
      return { id };
    });
  }

  /** Only an unused unit can be deleted; a unit in use is deactivated instead. */
  async remove(id: string) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.unit.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
      if (!before) throw notFound();
      if (before._count.products > 0) throw conflict('UNIT_IN_USE', 'This unit is used by products; deactivate it instead', { products: before._count.products });
      await tx.unit.delete({ where: { id } });
      await this.audit.record(tx, { action: 'unit.deleted', entityType: 'unit', entityId: id, before: unitView(before) });
      return { id, deleted: true };
    });
  }

  private stepMilli(step: number, allowDecimal: boolean): number {
    const milli = parseAmountMilli(step);
    const problems = milli === null ? ['STEP_INVALID'] : unitRuleProblems({ allowDecimal, stepMilli: milli });
    if (problems.length) throw badRequest(problems[0]!, allowDecimal ? 'The step must be between 0.001 and 1000' : 'A whole-number unit needs a whole step');
    return milli!;
  }

  private async assertNameFree(tx: Tx, name: string, exceptId: string | null): Promise<void> {
    const same = await this.findByName(name, tx);
    if (same && same.id !== exceptId) throw conflict('UNIT_NAME_TAKEN', 'A unit with this name already exists');
  }
}

const unitView = (u: UnitRow) => ({ name: u.name, nameEn: u.nameEn, allowDecimal: u.allowDecimal, step: u.stepMilli / 1000, active: u.active, sortOrder: u.sortOrder });
