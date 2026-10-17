import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { CatalogImportRowView, CatalogImportView } from '@hedax/contracts';
import {
  CATALOG_COLUMNS, compactSearchText, mapCatalogHeaders, matchFitment, parseCatalogRow, partNumberKey, type CatalogColumnKey, type CatalogRowValues, type RawCell,
} from '@hedax/domain';
import { AuditService } from '../../common/audit.service.js';
import { badRequest, conflict, notFound } from '../../common/errors.js';
import { OutboxService } from '../../common/outbox.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PublicCacheService } from '../../common/public-cache.service.js';
import type { Actor } from '../../common/request-context.js';
import { STORAGE, type StorageDriver } from '../../common/storage/storage.js';
import { readSheet } from '../imports/spreadsheet.js';
import { CatalogEntriesService, type CatalogDataField, type CatalogEntryData } from './catalog-entries.service.js';

/** Most data rows read from one file. */
export const MAX_CATALOG_IMPORT_ROWS = 2000;
const KIND = 'CATALOG';

/** File column → entry fields it replaces on an existing entry. */
const FIELDS_OF: Record<CatalogColumnKey, CatalogDataField[]> = {
  partNumber: ['partNumber'], nameFa: ['nameFa'], nameEn: ['nameEn'], equivalents: ['equivalents'], replacements: ['replacements'],
  manufacturer: ['manufacturerBrandId'], category: ['categoryId'], vehicleBrands: ['vehicleBrandIds'], fitments: ['vehicles'],
  specs: ['specs'], description: ['descriptionFa'], status: ['status'],
};

interface StoredRow {
  state: 'NEW' | 'DUPLICATE' | 'ERROR';
  issues: string[];
  details: string[];
  warnings: string[];
  data: CatalogEntryData | null;
}

const cellText = (c: RawCell | undefined) => (!c || c.error || c.value === null || c.value === undefined ? '' : String(c.value));

/**
 * Bulk import of catalog entries from Excel/CSV (panel → knowledge center → catalog parts). Like the
 * product import it runs on the outbox and the worker in two steps: the worker reads and checks the
 * file (nothing is written to the catalog), the person sees a preview — valid rows, rows with errors
 * and their reasons, rows whose technical number already exists — and chooses to update or skip those;
 * then the worker writes. Names in the file that match nothing in the site are not created: the row is
 * imported without them and the preview warns. Nothing becomes a shop product.
 */
@Injectable()
export class CatalogImportService {
  private readonly logger = new Logger(CatalogImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly entries: CatalogEntriesService,
    private readonly publicCache: PublicCacheService,
    @Inject(STORAGE) private readonly storage: StorageDriver,
  ) {}

  /** The sample file: one sheet to fill in, an example sheet and a help sheet. */
  async template(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const headers = CATALOG_COLUMNS.map((c) => c.fa);
    const ws = wb.addWorksheet('قطعات کاتالوگ', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    const examples = wb.addWorksheet('نمونه', { views: [{ rightToLeft: true }] });
    for (const sheet of [ws, examples]) {
      sheet.addRow(headers);
      sheet.getRow(1).font = { bold: true };
      CATALOG_COLUMNS.forEach((c, i) => {
        const col = sheet.getColumn(i + 1);
        col.width = ['fitments', 'specs', 'description', 'nameFa'].includes(c.key) ? 36 : 18;
        col.numFmt = '@';
      });
    }
    examples.addRow(['0450-102-805', 'فیلتر بنزین (نمونه)', 'Fuel filter', 'WK 512, 0 450 905 133', '0450102806', 'بوش', 'فیلتر', 'ایران خودرو', 'پژو 405 (1390-1400)، سمند', 'قطر: 80mm؛ طول: 150mm', 'فقط نمونه است؛ وارد نکنید.', 'پیش‌نویس']);
    examples.addRow(['TEST-SAMPLE-CAT-2', 'لنت ترمز جلو (نمونه)', '', '', '', '', 'ترمز', 'سایپا', 'پراید (1385-1398)', 'جنس: سرامیکی', '', 'منتشرشده']);
    const help = wb.addWorksheet('راهنما', { views: [{ rightToLeft: true }] });
    help.addRow(['عنوان ستون', 'English header', 'الزامی', 'توضیح']);
    help.getRow(1).font = { bold: true };
    const notes: Record<CatalogColumnKey, string> = {
      partNumber: 'یکتا. فاصله، خط تیره و ارقام فارسی مهم نیست (0450-102-805 همان ۰۴۵۰۱۰۲۸۰۵ است). اگر از قبل باشد، در پیش‌نمایش انتخاب می‌کنید به‌روز شود یا رد شود.',
      nameFa: 'نام قطعه به فارسی.',
      nameEn: 'اختیاری.',
      equivalents: 'شماره‌های هم‌ارز از سازنده‌های دیگر؛ با «،» یا «,» جدا کنید.',
      replacements: 'شماره‌ای که جایگزین این قطعه شده است؛ با «،» جدا کنید.',
      manufacturer: 'نام برند سازنده، همان‌طور که در پنل ثبت شده (برندی که نباشد ساخته نمی‌شود؛ هشدار می‌گیرید).',
      category: 'کد یا نام گروه قطعه از دسته‌بندی‌های پنل.',
      vehicleBrands: 'خودروسازها (ایران خودرو، سایپا …)؛ با «،» جدا کنید.',
      fitments: 'خودرو و مدل، و در صورت امکان سال در پرانتز: «پژو 405 (1390-1400)، سمند، دنا (1398)». خودرویی که در پنل نباشد ساخته نمی‌شود.',
      specs: '«عنوان: مقدار»، جداشده با «؛» یا هر کدام در یک خط: «ولتاژ: 12V؛ قطر: 40mm».',
      description: 'اختیاری؛ حداکثر ۵۰۰۰ نویسه.',
      status: '«پیش‌نویس» (پیش‌فرض؛ به مشتری نشان داده نمی‌شود) یا «منتشرشده».',
    };
    for (const c of CATALOG_COLUMNS) help.addRow([c.fa, c.en, c.required ? 'بله' : '', notes[c.key]]);
    help.addRow([]);
    for (const note of [
      'در شیت «قطعات کاتالوگ» بنویسید؛ ردیف اول عنوان ستون‌هاست و ترتیب ستون‌ها مهم نیست. ستونی که در فایل نباشد، در به‌روزرسانی دست نمی‌خورد.',
      'پیش از ثبت، پیش‌نمایش نشان داده می‌شود: ردیف‌های معتبر، ردیف‌های خطادار با دلیل، و ردیف‌هایی که شماره فنی‌شان از قبل هست. تا تأیید نکنید چیزی ثبت نمی‌شود.',
      'شماره فنی را «متن» نگه دارید تا صفرهای ابتدایی حذف نشوند. حداکثر ۲۰۰۰ ردیف.',
      'آیتم کاتالوگ محصول فروشگاه نیست (قیمت و موجودی ندارد) و خودکار به محصول تبدیل یا لینک نمی‌شود. عکس‌ها را بعداً از پنل یا با «عکس گروهی» اضافه کنید.',
    ]) help.addRow(['نکته', '', '', note]);
    help.getColumn(1).width = 20;
    help.getColumn(2).width = 20;
    help.getColumn(4).width = 110;
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async start(actor: Actor, attachmentId: string): Promise<{ id: string }> {
    const a = await this.prisma.attachment.findFirst({ where: { id: attachmentId, ownerId: actor.userId, purpose: 'IMPORT', deletedAt: null } });
    if (!a) throw notFound();
    if (a.status !== 'READY') throw conflict('FILE_NOT_READY', 'The file is still being checked');
    if (!['xlsx', 'csv'].includes(a.extension)) throw badRequest('IMPORT_FORMAT_NOT_ALLOWED');
    const job = await this.prisma.tx(async (tx) => {
      const j = await tx.importJob.create({
        data: { kind: KIND, attachmentId: a.id, uploaderId: actor.userId, mode: 'CREATE_AND_UPDATE', fileChecksum: a.sha256 ?? ''.padEnd(64, '0'), idempotencyKey: `catalog:${a.id}:${randomUUID()}`, status: 'QUEUED' },
      });
      await this.outbox.enqueue(tx, { type: 'catalog-entries.import.parse', aggregateType: 'import_job', aggregateId: j.id, payload: { jobId: j.id }, dedupeKey: `catalog-import-parse:${j.id}` });
      await this.audit.record(tx, { action: 'catalog_import.started', entityType: 'import_job', entityId: j.id, after: { filename: a.originalFilename } });
      return j;
    });
    return { id: job.id };
  }

  private async ownJob(actor: Actor, jobId: string) {
    const job = await this.prisma.importJob.findUnique({ where: { id: jobId } });
    if (!job || job.kind !== KIND || (job.uploaderId !== actor.userId && !actor.isOwner)) throw notFound();
    return job;
  }

  /** Worker: reads and checks the file; writes only the preview rows. */
  async parse(jobId: string): Promise<void> {
    const claimed = await this.prisma.importJob.updateMany({ where: { id: jobId, kind: KIND, status: 'QUEUED' }, data: { status: 'PARSING' } });
    if (claimed.count !== 1) return;
    const job = await this.prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
    const fail = (reason: string, summary: Record<string, unknown> = {}) =>
      this.prisma.importJob.update({ where: { id: jobId }, data: { status: 'FAILED', failureReason: reason.slice(0, 500), summary: summary as object } });
    try {
      const attachment = await this.prisma.attachment.findUniqueOrThrow({ where: { id: job.attachmentId } });
      const bytes = await this.storage.readPrivate(attachment.storageKey);
      const sheet = await readSheet(bytes, attachment.extension, { sheet: 0, headerRow: 1, maxRows: MAX_CATALOG_IMPORT_ROWS });
      if (!sheet) return void (await fail('SHEET_NOT_FOUND'));
      const { columns, missing } = mapCatalogHeaders(sheet.headers);
      if (missing.length) return void (await fail('MISSING_COLUMNS', { missingColumns: missing }));

      const [makers, categories, brands, vehicles] = await Promise.all([
        this.prisma.manufacturerBrand.findMany({ select: { id: true, nameFa: true, nameEn: true } }),
        this.prisma.category.findMany({ select: { id: true, code: true, slug: true, nameFa: true, nameEn: true } }),
        this.prisma.vehicleBrand.findMany({ select: { id: true, code: true, slug: true, nameFa: true, nameEn: true } }),
        this.prisma.vehicle.findMany({ include: { models: true } }),
      ]);
      const index = <T extends { id: string }>(rows: T[], names: (r: T) => Array<string | null>) => {
        const map = new Map<string, string>();
        for (const r of rows) for (const n of names(r)) if (n && compactSearchText(n)) map.set(compactSearchText(n), r.id);
        return (text: string) => map.get(compactSearchText(text)) ?? null;
      };
      const makerOf = index(makers, (m) => [m.nameFa, m.nameEn]);
      const categoryOf = index(categories, (c) => [c.code, c.slug, c.nameFa, c.nameEn]);
      const brandOf = index(brands, (b) => [b.code, b.slug, b.nameFa, b.nameEn]);

      const parsed = sheet.rows.map((row) => {
        const cells: Partial<Record<CatalogColumnKey, string>> = {};
        for (const [key, i] of Object.entries(columns) as Array<[CatalogColumnKey, number]>) cells[key] = cellText(row.cells[i]);
        return { rowNumber: row.rowNumber, cells, result: parseCatalogRow(cells) };
      });
      const keys = parsed.flatMap((p) => (p.result.values ? [p.result.values.partNumberKey] : []));
      const existing = new Set((await this.prisma.catalogEntry.findMany({ where: { partNumberKey: { in: keys } }, select: { partNumberKey: true } })).map((e) => e.partNumberKey));
      const seen = new Set<string>();
      const summary = { total: parsed.length, valid: 0, duplicates: 0, errors: 0 };
      const rows = parsed.map(({ rowNumber, cells, result }) => {
        const stored: StoredRow = { state: 'ERROR', issues: [...result.issues], details: result.details, warnings: [], data: null };
        const v = result.values;
        if (v && seen.has(v.partNumberKey)) stored.issues.push('DUPLICATE_IN_FILE');
        if (v && !stored.issues.length) {
          seen.add(v.partNumberKey);
          stored.data = this.resolve(v, { makerOf, categoryOf, brandOf, vehicles }, stored.warnings);
          stored.state = existing.has(v.partNumberKey) ? 'DUPLICATE' : 'NEW';
        }
        summary[stored.state === 'ERROR' ? 'errors' : stored.state === 'DUPLICATE' ? 'duplicates' : 'valid'] += 1;
        return {
          jobId, rowNumber, sku: (v?.partNumber ?? cells.partNumber ?? '').slice(0, 64) || null,
          action: stored.state === 'ERROR' ? ('ERROR' as const) : stored.state === 'DUPLICATE' ? ('UPDATE' as const) : ('CREATE' as const),
          issues: { issues: stored.issues, details: stored.details, warnings: stored.warnings },
          values: (stored.data ?? undefined) as object | undefined,
          display: { partNumber: (v?.partNumber ?? cells.partNumber ?? '').slice(0, 80), nameFa: (v?.nameFa ?? cells.nameFa ?? '').slice(0, 200) },
        };
      });
      await this.prisma.tx(async (tx) => {
        await tx.importRow.deleteMany({ where: { jobId } });
        for (let i = 0; i < rows.length; i += 200) await tx.importRow.createMany({ data: rows.slice(i, i + 200) });
        await tx.importJob.update({
          where: { id: jobId },
          data: { status: 'PREVIEW_READY', totalRows: rows.length, summary: { ...summary, truncated: sheet.truncated }, options: { columns: Object.keys(columns) }, failureReason: null },
        });
      });
    } catch (e) {
      this.logger.warn(`catalog import ${jobId} failed: ${e instanceof Error ? e.message : String(e)}`);
      await fail('FILE_UNREADABLE');
    }
  }

  /** Names in the row → ids of what the site already has; anything else becomes a warning (never created). */
  private resolve(
    v: CatalogRowValues,
    ref: { makerOf: (s: string) => string | null; categoryOf: (s: string) => string | null; brandOf: (s: string) => string | null; vehicles: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }> },
    warnings: string[],
  ): CatalogEntryData {
    const manufacturerBrandId = v.manufacturer ? ref.makerOf(v.manufacturer) : null;
    if (v.manufacturer && !manufacturerBrandId) warnings.push(`UNKNOWN_MANUFACTURER:${v.manufacturer}`);
    const categoryId = v.category ? ref.categoryOf(v.category) : null;
    if (v.category && !categoryId) warnings.push(`UNKNOWN_CATEGORY:${v.category}`);
    const vehicleBrandIds: string[] = [];
    for (const b of v.vehicleBrands) {
      const id = ref.brandOf(b);
      if (id) vehicleBrandIds.push(id);
      else warnings.push(`UNKNOWN_VEHICLE_BRAND:${b}`);
    }
    const vehicles: CatalogEntryData['vehicles'] = [];
    for (const f of v.fitments) {
      const m = matchFitment(f.text, ref.vehicles);
      if (m.kind === 'KNOWN') vehicles.push({ vehicleId: m.vehicleId, modelId: m.modelId, yearFrom: f.yearFrom, yearTo: f.yearTo, note: null });
      else warnings.push(`UNKNOWN_VEHICLE:${f.text}`);
    }
    return {
      partNumber: v.partNumber, nameFa: v.nameFa, nameEn: v.nameEn, equivalents: v.equivalents, replacements: v.replacements,
      manufacturerBrandId, categoryId, vehicleBrandIds, vehicles, specs: v.specs, descriptionFa: v.description, descriptionEn: null, status: v.status,
    };
  }

  async view(actor: Actor, jobId: string, filter: 'all' | 'errors' | 'duplicates' | 'new' = 'all'): Promise<CatalogImportView> {
    const job = await this.ownJob(actor, jobId);
    const attachment = await this.prisma.attachment.findUnique({ where: { id: job.attachmentId }, select: { originalFilename: true } });
    const action = filter === 'errors' ? 'ERROR' : filter === 'duplicates' ? 'UPDATE' : filter === 'new' ? 'CREATE' : undefined;
    const rows = await this.prisma.importRow.findMany({ where: { jobId, ...(action ? { action } : {}) }, orderBy: { rowNumber: 'asc' }, take: 500 });
    const summary = job.summary as (CatalogImportView['summary'] & { truncated?: boolean; missingColumns?: string[] }) | null;
    return {
      id: job.id,
      status: job.status as CatalogImportView['status'],
      filename: attachment?.originalFilename ?? '',
      failureReason: job.failureReason,
      missingColumns: summary?.missingColumns ?? [],
      summary: summary && 'total' in summary ? { total: summary.total, valid: summary.valid, duplicates: summary.duplicates, errors: summary.errors, ...(summary.created !== undefined ? { created: summary.created, updated: summary.updated, skipped: summary.skipped } : {}) } : null,
      truncated: !!summary?.truncated,
      committedAt: job.committedAt?.toISOString() ?? null,
      rows: rows.map((r): CatalogImportRowView => {
        const info = (r.issues ?? {}) as { issues?: string[]; details?: string[]; warnings?: string[] };
        const display = (r.display ?? {}) as { partNumber?: string; nameFa?: string };
        return {
          rowNumber: r.rowNumber, partNumber: display.partNumber ?? r.sku ?? '', nameFa: display.nameFa ?? '',
          state: r.action === 'ERROR' ? 'ERROR' : r.action === 'UPDATE' ? 'DUPLICATE' : 'NEW',
          issues: info.issues ?? [], details: info.details ?? [], warnings: info.warnings ?? [],
        };
      }),
    };
  }

  async requestCommit(actor: Actor, jobId: string, duplicates: 'update' | 'skip') {
    const job = await this.ownJob(actor, jobId);
    if (job.status !== 'PREVIEW_READY') throw conflict('IMPORT_NOT_READY', 'The preview is not ready, or the file was already imported');
    await this.prisma.tx(async (tx) => {
      const moved = await tx.importJob.updateMany({ where: { id: jobId, status: 'PREVIEW_READY' }, data: { status: 'COMMITTING', committedById: actor.userId, options: { ...(job.options as object), duplicates } } });
      if (moved.count !== 1) throw conflict('IMPORT_NOT_READY');
      await this.outbox.enqueue(tx, { type: 'catalog-entries.import.commit', aggregateType: 'import_job', aggregateId: jobId, payload: { jobId }, dedupeKey: `catalog-import-commit:${jobId}` });
      await this.audit.record(tx, { action: 'catalog_import.committed', entityType: 'import_job', entityId: jobId, after: { duplicates } });
    });
    return { id: jobId, status: 'COMMITTING' };
  }

  /** Worker: writes the rows (each in its own transaction; rows already written are skipped on a rerun). */
  async commit(jobId: string): Promise<void> {
    const job = await this.prisma.importJob.findUnique({ where: { id: jobId } });
    if (!job || job.kind !== KIND || job.status !== 'COMMITTING') return;
    const options = job.options as { columns?: CatalogColumnKey[]; duplicates?: 'update' | 'skip' };
    const fields = new Set((options.columns ?? []).flatMap((c) => FIELDS_OF[c] ?? []));
    const actorId = job.committedById ?? job.uploaderId;
    const rows = await this.prisma.importRow.findMany({ where: { jobId, action: { in: ['CREATE', 'UPDATE'] } }, orderBy: { rowNumber: 'asc' } });
    const counts = { created: 0, updated: 0, skipped: 0 };
    let published = false;
    for (const row of rows) {
      if (row.appliedAt) continue;
      const data = row.values as unknown as CatalogEntryData | null;
      if (!data) continue;
      try {
        const res = await this.prisma.tx(async (tx) => {
          // Checked again: an entry with this number may have been added since the preview.
          const existing = await tx.catalogEntry.findUnique({ where: { partNumberKey: partNumberKey(data.partNumber) }, select: { id: true } });
          if (existing && options.duplicates !== 'update') {
            await tx.importRow.update({ where: { id: row.id }, data: { appliedAt: new Date(), action: 'UNCHANGED' } });
            return 'skipped' as const;
          }
          const written = await this.entries.write(tx, actorId, data, existing ? { existingId: existing.id, fields } : {});
          await tx.importRow.update({ where: { id: row.id }, data: { appliedAt: new Date() } });
          if (written.status === 'PUBLISHED' || written.wasPublished) published = true;
          return written.created ? ('created' as const) : ('updated' as const);
        });
        counts[res] += 1;
      } catch (e) {
        counts.skipped += 1;
        this.logger.warn(`catalog import ${jobId} row ${row.rowNumber}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    await this.prisma.importJob.update({ where: { id: jobId }, data: { status: 'COMMITTED', committedAt: new Date(), summary: { ...(job.summary as object), ...counts } } });
    if (published) this.publicCache.invalidate();
  }
}
