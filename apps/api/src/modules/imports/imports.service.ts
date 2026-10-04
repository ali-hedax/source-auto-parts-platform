import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import {
  DomainError,
  type ExistingProductSnapshot,
  IMPORT_COLUMNS,
  type ImportColumn,
  MAX_IMPORT_ROWS,
  type ParsedImportValues,
  type RawRow,
  buildSearchDocument,
  describeImportCode,
  importColumnLabel,
  mapHeaders,
  minorToDecimalString,
  neutralizeSpreadsheetText,
  normalizeSearchText,
  planImport,
} from '@hedax/domain';
import { AuditService } from '../../common/audit.service.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors.js';
import { IdempotencyService } from '../../common/idempotency.service.js';
import { OutboxService } from '../../common/outbox.service.js';
import { Prisma, PrismaService, type Tx } from '../../common/prisma.service.js';
import type { Actor } from '../../common/request-context.js';
import { STORAGE, type StorageDriver } from '../../common/storage/storage.js';
import { toJsonSafe } from '../../common/serialize.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { slugify } from '../catalog/admin-catalog.service.js';
import { readCsv, readXlsx } from './spreadsheet.js';

const HEADER_HELP_FA: Record<ImportColumn, string> = {
  sku: 'کد کالای یکتا؛ متن (صفرهای ابتدایی حفظ می‌شوند). کلید به‌روزرسانی.',
  name_fa: 'نام فارسی قطعه (الزامی در ایجاد)',
  name_en: 'نام انگلیسی (اختیاری)',
  category_code: 'کد دستهٔ ثبت‌شده در پنل (مثل BRAKE)',
  vehicle_brand_codes: 'کد برندهای خودرو، جدا با ویرگول (مثل IKCO,SAIPA)',
  manufacturer_brand: 'نام برند سازندهٔ ثبت‌شده در پنل',
  part_type: 'GENUINE / OEM / AFTERMARKET (یا: اصلی / او ای ام / افترمارکت)',
  condition: 'NEW / USED / REFURBISHED (یا: نو / کارکرده / بازسازی شده)',
  origin: 'DOMESTIC / IMPORTED / UNKNOWN (یا: داخلی / وارداتی / نامشخص)',
  base_currency: 'IRR (ریال) یا AED (درهم). تومان پذیرفته نمی‌شود.',
  base_price: 'قیمت پایه در همان ارز؛ ریال عدد صحیح، درهم حداکثر دو رقم اعشار',
  override_price_irr: 'قیمت دستی ریالی (اختیاری؛ بر تبدیل خودکار مقدم است)',
  override_price_aed: 'قیمت دستی درهمی برای نمایش/مرجع (اختیاری)',
  on_hand: 'موجودی فیزیکی مطلق (شمارش انبار)، نه موجودی قابل فروش. عدد صحیح ≥ رزروشده.',
  low_stock_threshold: 'حد هشدار موجودی (عدد صحیح)',
  unit: 'واحد فروش (مثل عدد، جفت، دست)',
  description_fa: 'توضیحات فارسی',
  description_en: 'توضیحات انگلیسی',
  is_active: '1 یا 0 (فعال بودن فروش)',
};

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    @Inject(STORAGE) private readonly storage: StorageDriver,
  ) {}

  async template(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('products');
    ws.addRow([...IMPORT_COLUMNS]);
    ws.getColumn(1).numFmt = '@';
    ws.addRow(['TEST-SAMPLE-001', 'نمونهٔ آزمایشی — این ردیف را حذف کنید', 'TEST SAMPLE - delete this row', 'BRAKE', 'IKCO', '', 'AFTERMARKET', 'NEW', 'DOMESTIC', 'IRR', '12000000', '', '', '0', '2', 'عدد', '', '', '0']);
    ws.addRow(['TEST-SAMPLE-002', 'نمونهٔ آزمایشی درهمی — حذف کنید', 'TEST SAMPLE AED - delete', 'FILTER', 'TOYOTA', '', 'GENUINE', 'NEW', 'IMPORTED', 'AED', '45.50', '', '', '0', '1', 'عدد', '', '', '0']);
    ws.getRow(1).font = { bold: true };
    const help = wb.addWorksheet('راهنما', { views: [{ rightToLeft: true }] });
    help.addRow(['ستون', 'توضیح']);
    for (const col of IMPORT_COLUMNS) help.addRow([col, HEADER_HELP_FA[col]]);
    help.addRow([]);
    help.addRow(['نکته', 'سلول خالی در به‌روزرسانی یعنی «بدون تغییر». فرمول در ستون‌های قیمت و موجودی پذیرفته نمی‌شود؛ خروجی «فقط مقادیر» بگیرید. حداکثر ۵۰۰۰ ردیف.']);
    help.getColumn(1).width = 24;
    help.getColumn(2).width = 110;
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async start(actor: Actor, body: { attachmentId: string; mode: 'UPDATE_ONLY' | 'CREATE_AND_UPDATE'; columnMapping?: Record<string, number>; clearWhenEmpty: string[]; manufacturerBrandMapping: Record<string, string> }, key: string | undefined) {
    return this.idempotency.run('import.start', actor.userId, key, body, async () => {
      const a = await this.prisma.attachment.findFirst({ where: { id: body.attachmentId, ownerId: actor.userId, purpose: 'IMPORT', deletedAt: null } });
      if (!a) throw notFound();
      if (a.status !== 'READY') throw conflict('FILE_NOT_READY', 'The file is still being checked');
      if (!['xlsx', 'csv'].includes(a.extension)) throw badRequest('IMPORT_FORMAT_NOT_ALLOWED');
      const unknownClear = body.clearWhenEmpty.filter((c) => !(IMPORT_COLUMNS as readonly string[]).includes(c) || c === 'sku' || c === 'name_fa');
      if (unknownClear.length) throw badRequest('INVALID_CLEAR_COLUMNS');
      const job = await this.prisma.$transaction(async (tx) => {
        const j = await tx.importJob.create({
          data: {
            attachmentId: a.id, uploaderId: actor.userId, mode: body.mode, fileChecksum: a.sha256 ?? '', idempotencyKey: `${actor.userId}:${key}`,
            mapping: (body.columnMapping ?? {}) as Prisma.InputJsonValue,
            options: { clearWhenEmpty: body.clearWhenEmpty, manufacturerBrandMapping: body.manufacturerBrandMapping } as Prisma.InputJsonValue,
          },
        });
        await this.outbox.enqueue(tx, { type: 'import.parse', aggregateType: 'import_job', aggregateId: j.id, payload: { jobId: j.id }, dedupeKey: `import-parse:${j.id}` });
        return j;
      });
      return { jobId: job.id, status: job.status };
    });
  }

  /** Worker: parse + validate + stage. No catalog/stock row is modified here (preview has no mutations). */
  async parse(jobId: string): Promise<void> {
    const claimed = await this.prisma.importJob.updateMany({ where: { id: jobId, status: 'QUEUED' }, data: { status: 'PARSING', progress: 5 } });
    if (claimed.count !== 1) return;
    const job = await this.prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
    try {
      const a = await this.prisma.attachment.findUniqueOrThrow({ where: { id: job.attachmentId } });
      const bytes = await this.storage.readPrivate(a.storageKey);
      const sheet = a.extension === 'csv' ? readCsv(bytes, MAX_IMPORT_ROWS) : await readXlsx(bytes, MAX_IMPORT_ROWS);
      if (sheet.truncated) {
        await this.prisma.importJob.update({ where: { id: jobId }, data: { status: 'FAILED', failureReason: 'TOO_MANY_ROWS', totalRows: MAX_IMPORT_ROWS + 1 } });
        return;
      }
      const { mapping: auto, duplicateColumns } = mapHeaders(sheet.headers);
      const manual = (job.mapping ?? {}) as Record<string, number>;
      const mapping: Partial<Record<ImportColumn, number>> = { ...auto, ...manual };
      if (duplicateColumns.length || mapping.sku === undefined) {
        await this.prisma.importJob.update({ where: { id: jobId }, data: { status: 'FAILED', failureReason: duplicateColumns.length ? 'DUPLICATE_COLUMNS' : 'SKU_COLUMN_MISSING' } });
        return;
      }
      const rows: RawRow[] = sheet.rows.map((cells) => {
        const r: RawRow = {};
        for (const col of IMPORT_COLUMNS) {
          const idx = mapping[col];
          if (idx !== undefined && cells[idx]) r[col] = cells[idx];
        }
        return r;
      });
      await this.prisma.importJob.update({ where: { id: jobId }, data: { progress: 30, totalRows: rows.length } });

      const skus = [...new Set(rows.map((r) => (r.sku?.value === null || r.sku?.value === undefined ? '' : String(r.sku.value).trim())).filter(Boolean))];
      const existing = await this.loadExisting(skus);
      const [categories, brands, manufacturers] = await Promise.all([
        this.prisma.category.findMany({ where: { active: true }, select: { code: true } }),
        this.prisma.vehicleBrand.findMany({ where: { active: true }, select: { code: true } }),
        this.prisma.manufacturerBrand.findMany({ where: { active: true }, select: { id: true, normalizedName: true, nameFa: true, nameEn: true } }),
      ]);
      const manufacturerMap = new Map<string, string>();
      for (const m of manufacturers) {
        manufacturerMap.set(m.normalizedName, m.id);
        manufacturerMap.set(normalizeSearchText(m.nameFa), m.id);
        if (m.nameEn) manufacturerMap.set(normalizeSearchText(m.nameEn), m.id);
      }
      const options = job.options as { clearWhenEmpty?: string[]; manufacturerBrandMapping?: Record<string, string> };
      for (const [name, id] of Object.entries(options.manufacturerBrandMapping ?? {})) manufacturerMap.set(normalizeSearchText(name), id);
      const plan = planImport(rows, {
        mode: job.mode,
        existing,
        categoryCodes: new Set(categories.map((c) => c.code)),
        vehicleBrandCodes: new Set(brands.map((b) => b.code)),
        manufacturerBrands: manufacturerMap,
        clearWhenEmpty: new Set((options.clearWhenEmpty ?? []) as ImportColumn[]),
      });
      const planChecksum = createHash('sha256').update(JSON.stringify(toJsonSafe(plan.rows))).digest('hex');
      await this.prisma.$transaction(async (tx) => {
        await tx.importRow.deleteMany({ where: { jobId } });
        for (let i = 0; i < plan.rows.length; i += 500) {
          await tx.importRow.createMany({
            data: plan.rows.slice(i, i + 500).map((r) => ({
              jobId, rowNumber: r.rowNumber, sku: r.sku, action: r.action,
              issues: r.issues as unknown as Prisma.InputJsonValue,
              values: r.values ? (toJsonSafe(r.values) as Prisma.InputJsonValue) : Prisma.DbNull,
              changes: r.changes as unknown as Prisma.InputJsonValue,
              expectedProductVersion: r.expectedProductVersion, expectedInventoryVersion: r.expectedInventoryVersion,
              productId: r.sku ? (existing.get(r.sku)?.productId ?? null) : null,
            })),
          });
        }
        await tx.importJob.update({
          where: { id: jobId },
          data: {
            status: 'PREVIEW_READY', progress: 100, planChecksum,
            summary: {
              ...plan.summary, fileErrors: plan.fileErrors, canCommit: plan.canCommit,
              // The mapping step made visible (spec §12): what was read, and which file columns were ignored.
              columns: IMPORT_COLUMNS.filter((c) => mapping[c] !== undefined),
              ignoredHeaders: sheet.headers.filter((h, i) => (h ?? '').trim() !== '' && !Object.values(mapping).includes(i)).slice(0, 50),
            },
          },
        });
      });
    } catch (e) {
      this.logger.warn(`import ${jobId} failed: ${e instanceof Error ? e.message : 'unknown'}`);
      await this.prisma.importJob.update({ where: { id: jobId }, data: { status: 'FAILED', failureReason: 'UNREADABLE_FILE' } });
    }
  }

  private async loadExisting(skus: string[]): Promise<Map<string, ExistingProductSnapshot>> {
    const warehouseId = await this.inventory.defaultWarehouseId();
    const products = await this.prisma.product.findMany({
      where: { sku: { in: skus } },
      include: { translations: true, category: true, manufacturerBrand: true, vehicleBrands: { include: { vehicleBrand: true } }, basePrice: true, inventory: { where: { warehouseId } } },
    });
    const map = new Map<string, ExistingProductSnapshot>();
    for (const p of products) {
      const fa = p.translations.find((t) => t.locale === 'fa');
      const en = p.translations.find((t) => t.locale === 'en');
      const bal = p.inventory[0];
      map.set(p.sku, {
        productId: p.id, version: p.version, nameFa: fa?.name ?? '', nameEn: en?.name ?? null, categoryCode: p.category.code,
        vehicleBrandCodes: p.vehicleBrands.map((v) => v.vehicleBrand.code), manufacturerBrand: p.manufacturerBrand?.nameEn ?? p.manufacturerBrand?.nameFa ?? null,
        partType: p.partType, condition: p.condition, origin: p.origin, baseCurrency: p.basePrice?.baseCurrency ?? 'IRR', basePriceMinor: p.basePrice?.baseAmountMinor ?? 0n,
        overridePriceIrrMinor: p.basePrice?.manualIrrMinor ?? null, overridePriceAedMinor: p.basePrice?.manualAedMinor ?? null,
        onHand: bal?.onHand ?? 0, reserved: bal?.reserved ?? 0, inventoryVersion: bal?.version ?? 0, lowStockThreshold: bal?.lowStockThreshold ?? 0,
        unit: p.unit, descriptionFa: fa?.description ?? null, descriptionEn: en?.description ?? null, isActive: p.isSellable,
      });
    }
    return map;
  }

  async preview(actor: Actor, jobId: string, page: number) {
    const job = await this.prisma.importJob.findUnique({ where: { id: jobId } });
    if (!job || (job.uploaderId !== actor.userId && !actor.isOwner)) throw notFound();
    const rows = await this.prisma.importRow.findMany({ where: { jobId, action: { not: 'UNCHANGED' } }, orderBy: { rowNumber: 'asc' }, skip: (page - 1) * 100, take: 100 });
    return {
      jobId: job.id, status: job.status, mode: job.mode, progress: job.progress, totalRows: job.totalRows, failureReason: job.failureReason,
      summary: job.summary, planChecksum: job.planChecksum,
      rows: rows.map((r) => ({ rowNumber: r.rowNumber, sku: r.sku, action: r.action, issues: r.issues, changes: r.changes })),
    };
  }

  async requestCommit(actor: Actor, jobId: string, planChecksum: string) {
    const job = await this.prisma.importJob.findUnique({ where: { id: jobId } });
    if (!job || (job.uploaderId !== actor.userId && !actor.isOwner)) throw notFound();
    if (job.status === 'COMMITTED' || job.status === 'COMMITTING') return { jobId, status: job.status };
    if (job.status !== 'PREVIEW_READY') throw conflict('IMPORT_NOT_READY');
    if (job.planChecksum !== planChecksum) throw conflict('PLAN_CHANGED', 'The preview changed; review it again');
    const summary = job.summary as { canCommit?: boolean } | null;
    if (!summary?.canCommit) throw conflict('IMPORT_HAS_ERRORS', 'Fix all errors before applying');
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.importJob.updateMany({ where: { id: jobId, status: 'PREVIEW_READY' }, data: { status: 'COMMITTING', committedById: actor.userId } });
      if (res.count !== 1) return;
      await this.outbox.enqueue(tx, { type: 'import.commit', aggregateType: 'import_job', aggregateId: jobId, payload: { jobId }, dedupeKey: `import-commit:${jobId}` });
    });
    return { jobId, status: 'COMMITTING' };
  }

  /**
   * Worker: applies the whole staged plan in ONE transaction. Any version
   * conflict or on_hand < reserved aborts everything (nothing is applied).
   * Re-running a committed job is a no-op.
   */
  async commit(jobId: string): Promise<void> {
    const job = await this.prisma.importJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== 'COMMITTING') return;
    const rows = await this.prisma.importRow.findMany({ where: { jobId, action: { in: ['CREATE', 'UPDATE'] } }, orderBy: { rowNumber: 'asc' } });
    try {
      await this.prisma.tx(
        async (tx) => {
          // Sequential: a transaction holds one connection, which must not run overlapping queries.
          const categories = await tx.category.findMany({ select: { id: true, code: true } });
          const brands = await tx.vehicleBrand.findMany({ select: { id: true, code: true } });
          const manufacturers = await tx.manufacturerBrand.findMany({ select: { id: true, normalizedName: true, nameFa: true, nameEn: true } });
          const catId = new Map(categories.map((c) => [c.code, c.id]));
          const brandId = new Map(brands.map((b) => [b.code, b.id]));
          const mfr = new Map<string, string>();
          for (const m of manufacturers) {
            mfr.set(m.normalizedName, m.id);
            mfr.set(normalizeSearchText(m.nameFa), m.id);
            if (m.nameEn) mfr.set(normalizeSearchText(m.nameEn), m.id);
          }
          const options = job.options as { manufacturerBrandMapping?: Record<string, string> };
          for (const [name, id] of Object.entries(options.manufacturerBrandMapping ?? {})) mfr.set(normalizeSearchText(name), id);
          for (const row of rows) await this.applyRow(tx, job.id, row, { catId, brandId, mfr });
          await tx.importRow.updateMany({ where: { jobId, action: { in: ['CREATE', 'UPDATE'] } }, data: { appliedAt: new Date() } });
          await tx.importJob.update({ where: { id: jobId }, data: { status: 'COMMITTED', committedAt: new Date() } });
          await this.audit.record(tx, { action: 'import.committed', entityType: 'import_job', entityId: jobId, actorKind: 'STAFF', actorId: job.committedById, after: job.summary });
        },
        { timeoutMs: 180_000 },
      );
    } catch (e) {
      const code = e instanceof DomainError ? e.code : 'COMMIT_FAILED';
      this.logger.warn(`import commit ${jobId} aborted: ${code}`);
      await this.prisma.importJob.update({ where: { id: jobId }, data: { status: code === 'VERSION_CONFLICT' || code === 'ON_HAND_BELOW_RESERVED' ? 'CONFLICT' : 'FAILED', failureReason: code } });
    }
  }

  private async applyRow(
    tx: Tx,
    jobId: string,
    row: { rowNumber: number; action: string; values: unknown; productId: string | null; expectedProductVersion: number | null; expectedInventoryVersion: number | null },
    maps: { catId: Map<string, string>; brandId: Map<string, string>; mfr: Map<string, string> },
  ): Promise<void> {
    const v = row.values as Omit<ParsedImportValues, 'basePriceMinor' | 'overridePriceIrrMinor' | 'overridePriceAedMinor'> & {
      basePriceMinor?: string; overridePriceIrrMinor?: string | null; overridePriceAedMinor?: string | null;
    };
    const big = (x: string | null | undefined) => (x === null || x === undefined ? x : BigInt(x));
    let productId = row.productId;
    if (row.action === 'CREATE') {
      const exists = await tx.product.findUnique({ where: { sku: v.sku } });
      if (exists) throw new DomainError('VERSION_CONFLICT', `SKU ${v.sku} was created meanwhile`);
      const slugBase = slugify(v.nameEn ?? '') || slugify(v.sku) || `part-${randomUUID().slice(0, 8)}`;
      const slugTaken = await tx.product.findUnique({ where: { slug: slugBase } });
      const created = await tx.product.create({
        data: {
          sku: v.sku, slug: slugTaken ? `${slugBase}-${randomUUID().slice(0, 6)}` : slugBase, categoryId: maps.catId.get(v.categoryCode as string) as string,
          manufacturerBrandId: v.manufacturerBrand ? (maps.mfr.get(normalizeSearchText(v.manufacturerBrand)) ?? null) : null,
          partType: v.partType as 'GENUINE', condition: v.condition as 'NEW', origin: v.origin as 'DOMESTIC', unit: v.unit ?? 'عدد',
          isSellable: v.isActive ?? true, published: false, oemCodes: [],
        },
      });
      productId = created.id;
      await tx.productPrice.create({
        data: { productId, baseCurrency: v.baseCurrency as 'IRR', baseAmountMinor: big(v.basePriceMinor) as bigint, manualIrrMinor: big(v.overridePriceIrrMinor) ?? null, manualAedMinor: big(v.overridePriceAedMinor) ?? null },
      });
      await tx.productTranslation.create({ data: { productId, locale: 'fa', name: v.nameFa as string, description: v.descriptionFa ?? null, aliases: [] } });
      if (v.nameEn) await tx.productTranslation.create({ data: { productId, locale: 'en', name: v.nameEn, description: v.descriptionEn ?? null, aliases: [] } });
      if (v.vehicleBrandCodes?.length) await tx.productVehicleBrand.createMany({ data: v.vehicleBrandCodes.map((c) => ({ productId: productId as string, vehicleBrandId: maps.brandId.get(c) as string })) });
      await this.inventory.ensureBalance(tx, productId);
    } else {
      if (!productId) throw new DomainError('VERSION_CONFLICT');
      const res = await tx.product.updateMany({
        where: { id: productId, version: row.expectedProductVersion ?? -1 },
        data: {
          version: { increment: 1 },
          ...(v.categoryCode ? { categoryId: maps.catId.get(v.categoryCode) as string } : {}),
          ...(v.manufacturerBrand !== undefined ? { manufacturerBrandId: v.manufacturerBrand ? (maps.mfr.get(normalizeSearchText(v.manufacturerBrand)) ?? null) : null } : {}),
          ...(v.partType ? { partType: v.partType } : {}),
          ...(v.condition ? { condition: v.condition } : {}),
          ...(v.origin ? { origin: v.origin } : {}),
          ...(v.unit ? { unit: v.unit } : {}),
          ...(v.isActive !== undefined ? { isSellable: v.isActive } : {}),
        },
      });
      if (res.count !== 1) throw new DomainError('VERSION_CONFLICT', `Row ${row.rowNumber}: product changed after preview`);
      if (v.basePriceMinor !== undefined || v.baseCurrency || v.overridePriceIrrMinor !== undefined || v.overridePriceAedMinor !== undefined) {
        await tx.productPrice.update({
          where: { productId },
          data: {
            ...(v.baseCurrency ? { baseCurrency: v.baseCurrency } : {}),
            ...(v.basePriceMinor !== undefined ? { baseAmountMinor: BigInt(v.basePriceMinor) } : {}),
            ...(v.overridePriceIrrMinor !== undefined ? { manualIrrMinor: big(v.overridePriceIrrMinor) } : {}),
            ...(v.overridePriceAedMinor !== undefined ? { manualAedMinor: big(v.overridePriceAedMinor) } : {}),
            version: { increment: 1 },
          },
        });
      }
      if (v.nameFa || v.descriptionFa !== undefined) {
        await tx.productTranslation.update({ where: { productId_locale: { productId, locale: 'fa' } }, data: { ...(v.nameFa ? { name: v.nameFa } : {}), ...(v.descriptionFa !== undefined ? { description: v.descriptionFa } : {}) } });
      }
      if (v.nameEn !== undefined || v.descriptionEn !== undefined) {
        if (v.nameEn === null) await tx.productTranslation.deleteMany({ where: { productId, locale: 'en' } });
        else {
          await tx.productTranslation.upsert({
            where: { productId_locale: { productId, locale: 'en' } },
            create: { productId, locale: 'en', name: v.nameEn ?? '', description: v.descriptionEn ?? null, aliases: [] },
            update: { ...(v.nameEn ? { name: v.nameEn } : {}), ...(v.descriptionEn !== undefined ? { description: v.descriptionEn } : {}) },
          });
        }
      }
      if (v.vehicleBrandCodes) {
        await tx.productVehicleBrand.deleteMany({ where: { productId } });
        if (v.vehicleBrandCodes.length) await tx.productVehicleBrand.createMany({ data: v.vehicleBrandCodes.map((c) => ({ productId: productId as string, vehicleBrandId: maps.brandId.get(c) as string })) });
      }
    }
    if (v.onHand !== undefined) {
      await this.inventory.setOnHand(tx, {
        productId: productId as string, newOnHand: v.onHand, expectedVersion: row.action === 'CREATE' ? null : row.expectedInventoryVersion,
        type: 'IMPORT_ADJUSTMENT', reason: 'IMPORT', referenceType: 'import_job', referenceId: jobId,
      });
    }
    if (v.lowStockThreshold !== undefined) await tx.inventoryBalance.updateMany({ where: { productId: productId as string }, data: { lowStockThreshold: v.lowStockThreshold } });
    const p = await tx.product.findUniqueOrThrow({ where: { id: productId as string }, include: { translations: true } });
    const doc = buildSearchDocument([...p.translations.flatMap((t) => [t.name, ...t.aliases]), p.sku, ...p.oemCodes]);
    await tx.product.update({ where: { id: p.id }, data: { searchText: doc.text, searchCompact: doc.compact } });
  }

  /** Error report for a previewed job (rows with issues). */
  /** Row-error report in the reader's language: row, SKU (text), severity, column, code and a plain explanation. */
  async errorReport(actor: Actor, jobId: string, locale: 'fa' | 'en' = 'fa'): Promise<Buffer> {
    const job = await this.prisma.importJob.findUnique({ where: { id: jobId } });
    if (!job || (job.uploaderId !== actor.userId && !actor.isOwner)) throw notFound();
    const rows = await this.prisma.importRow.findMany({ where: { jobId }, orderBy: { rowNumber: 'asc' } });
    const fa = locale === 'fa';
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(fa ? 'خطاها' : 'errors', { views: [{ rightToLeft: fa }] });
    ws.addRow(fa ? ['ردیف', 'کد کالا', 'نوع', 'ستون', 'کد خطا', 'توضیح'] : ['row', 'sku', 'severity', 'column', 'code', 'message']);
    ws.getRow(1).font = { bold: true };
    ws.getColumn(2).numFmt = '@';
    ws.getColumn(2).width = 20;
    ws.getColumn(4).width = 20;
    ws.getColumn(5).width = 28;
    ws.getColumn(6).width = 70;
    const severity = (s: string) => (fa ? (s === 'error' ? 'خطا' : 'هشدار') : s);
    for (const r of rows) {
      for (const issue of (r.issues as Array<{ column: string | null; code: string; severity: string }>) ?? []) {
        ws.addRow([
          r.rowNumber, neutralizeSpreadsheetText(r.sku ?? ''), severity(issue.severity),
          issue.column ? importColumnLabel(issue.column, locale) : '', issue.code, describeImportCode(issue.code, locale),
        ]);
      }
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** Catalog export: SKU as text, currency explicit, snapshot time, formula-injection neutralized. */
  async export(actor: Actor): Promise<Buffer> {
    if (!actor.permissions.has('exports.run')) throw forbidden();
    const warehouseId = await this.inventory.defaultWarehouseId();
    const products = await this.prisma.product.findMany({
      where: { archivedAt: null },
      include: { translations: true, category: true, manufacturerBrand: true, vehicleBrands: { include: { vehicleBrand: true } }, basePrice: true, inventory: { where: { warehouseId } } },
      orderBy: { sku: 'asc' },
    });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('products');
    ws.addRow([...IMPORT_COLUMNS, 'reserved', 'available', 'exported_at_utc']);
    ws.getColumn(1).numFmt = '@';
    const at = new Date().toISOString();
    const t = (s: string | null | undefined) => neutralizeSpreadsheetText(s ?? '');
    for (const p of products) {
      const fa = p.translations.find((x) => x.locale === 'fa');
      const en = p.translations.find((x) => x.locale === 'en');
      const bal = p.inventory[0];
      const price = p.basePrice;
      ws.addRow([
        t(p.sku), t(fa?.name), t(en?.name), t(p.category.code), t(p.vehicleBrands.map((v) => v.vehicleBrand.code).join(',')),
        t(p.manufacturerBrand?.nameEn ?? p.manufacturerBrand?.nameFa), p.partType, p.condition, p.origin, price?.baseCurrency ?? '',
        price ? minorToDecimalString(price.baseAmountMinor, price.baseCurrency) : '', price?.manualIrrMinor?.toString() ?? '',
        price?.manualAedMinor !== null && price?.manualAedMinor !== undefined ? minorToDecimalString(price.manualAedMinor, 'AED') : '',
        bal?.onHand ?? 0, bal?.lowStockThreshold ?? 0, t(p.unit), t(fa?.description), t(en?.description), p.isSellable ? 1 : 0,
        bal?.reserved ?? 0, (bal?.onHand ?? 0) - (bal?.reserved ?? 0), at,
      ]);
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
