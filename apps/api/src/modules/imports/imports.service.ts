import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import type {
  ImportJobListItem, ImportJobView, ImportOutline, ImportRowView, ImportSettings, ImportSummaryView, ImportedProductView,
} from '@hedax/contracts';
import {
  CLEARABLE_IMPORT_COLUMNS,
  DomainError,
  type ExistingProductSnapshot,
  IMPORT_COLUMNS,
  type ImportColumn,
  type ImportDefaults,
  MAX_IMPORT_ROWS,
  type ParsedImportValues,
  type PriceUnit,
  type RawRow,
  type StockMode,
  TEMPLATE_COLUMNS,
  buildSearchDocument,
  describeImportCode,
  importColumnLabel,
  mapHeaders,
  minorToDecimalString,
  neutralizeSpreadsheetText,
  normalizeSearchText,
  planImport,
  suggestHeaderRow,
  technicalKey,
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
import { MAX_COLUMNS, readOutline, readSheet } from './spreadsheet.js';

/** Columns of the catalog export (unchanged so an export can be edited and imported again). */
const EXPORT_COLUMNS: readonly ImportColumn[] = [
  'sku', 'name_fa', 'name_en', 'category_code', 'vehicle_brand_codes', 'manufacturer_brand', 'part_type', 'condition',
  'origin', 'base_currency', 'base_price', 'override_price_irr', 'override_price_aed', 'on_hand', 'low_stock_threshold',
  'unit', 'description_fa', 'description_en', 'is_active',
];

const HEADER_HELP_FA: Record<ImportColumn, { help: string; example: string }> = {
  sku: { help: 'کد یکتای کالا در فروشگاه؛ متن (صفرهای ابتدایی حفظ می‌شوند). کلید تشخیص کالای تکراری. اگر فایل کد کالای جدا ندارد، در پنل می‌توانید ستون شماره فنی را به‌عنوان کد کالا انتخاب کنید.', example: '0450102805' },
  technical_number: { help: 'شماره فنی (کد قطعه نزد سازنده)؛ متن. به فهرست کدهای فنی کالا اضافه می‌شود و قابل جست‌وجوست. همان شماره با برند دیگر کالای دیگری است.', example: '0450102805' },
  name_fa: { help: 'نام فارسی قطعه (الزامی برای کالای تازه)', example: 'بلبرینگ چرخ جلو' },
  name_en: { help: 'نام انگلیسی (اختیاری)', example: 'Front wheel bearing' },
  manufacturer_brand: { help: 'نام برند سازنده، همان‌طور که در پنل ثبت شده است (اختیاری)', example: 'ایساکو' },
  category_code: { help: 'کد یا نام دسته، همان‌طور که در پنل ثبت شده است (الزامی برای کالای تازه، یا یک مقدار برای کل فایل در پنل)', example: 'BRAKE' },
  vehicle_brand_codes: { help: 'کد یا نام برندهای خودرو، جدا با ویرگول', example: 'IKCO, SAIPA' },
  vehicle_models: { help: 'خودروهای سازگار، جدا با ویرگول؛ فقط اضافه می‌شوند و چیزی حذف نمی‌شود', example: 'پژو ۲۰۶، سمند' },
  part_type: { help: 'GENUINE / OEM / AFTERMARKET (یا: اصلی / او ای ام / افترمارکت)', example: 'GENUINE' },
  condition: { help: 'NEW / USED / REFURBISHED (یا: نو / کارکرده / بازسازی شده). کالای کارکرده یا بازسازی‌شده بدون عکس واقعی منتشر نمی‌شود.', example: 'NEW' },
  origin: { help: 'DOMESTIC / IMPORTED / UNKNOWN (یا: داخلی / وارداتی / نامشخص)', example: 'DOMESTIC' },
  base_currency: { help: 'IRR (ریال) یا AED (درهم). اگر ستون ارز ندارید، واحد ستون قیمت را در پنل انتخاب کنید؛ تومان فقط با انتخاب صریح «تومان، تبدیل به ریال» پذیرفته می‌شود.', example: 'IRR' },
  base_price: { help: 'قیمت پایه در همان ارز؛ ریال عدد صحیح، درهم حداکثر دو رقم اعشار. ارقام فارسی و جداکنندهٔ هزارگان مجازند.', example: '200,000,000' },
  on_hand: { help: 'تعداد موجودی. در پنل انتخاب می‌کنید که این عدد جایگزین موجودی فعلی شود (شمارش انبار) یا به آن اضافه شود (کالای رسیده). عدد صحیح.', example: '4' },
  unit: { help: 'واحد فروش (مثل عدد، جفت، دست)', example: 'عدد' },
  low_stock_threshold: { help: 'حد هشدار موجودی (عدد صحیح)', example: '1' },
  override_price_irr: { help: 'قیمت دستی ریالی (اختیاری؛ بر تبدیل خودکار مقدم است)', example: '' },
  override_price_aed: { help: 'قیمت دستی درهمی برای نمایش/مرجع (اختیاری)', example: '' },
  description_fa: { help: 'توضیحات و مشخصات فارسی', example: 'قطر ۱۵ میلی‌متر، به همراه توپی' },
  description_en: { help: 'توضیحات انگلیسی', example: '' },
  is_active: { help: '1 یا 0 (فعال بودن فروش)', example: '1' },
};

const EMPTY_DEFAULTS: ImportSettings['defaults'] = {
  categoryCode: null, partType: null, condition: null, origin: null, manufacturerBrandId: null, vehicleBrandCodes: [], unit: null, initialOnHand: null,
};

/** What a job stores in `options`: the person's choices (or the one-step defaults) and the commit choices. */
interface StoredSettings {
  sheet: number;
  headerRow: number;
  /** Column → index chosen in the panel; null: the one-step import maps the header row by itself. */
  columns: Record<string, number> | null;
  legacyMapping: Record<string, number>;
  mode: 'UPDATE_ONLY' | 'CREATE_AND_UPDATE';
  priceUnit: PriceUnit | null;
  stockMode: StockMode;
  defaults: ImportSettings['defaults'];
  clearWhenEmpty: string[];
  manufacturerBrandMapping: Record<string, string>;
  revision: number;
  commit?: { skipErrorRows: boolean; confirmRepeatAdd: boolean };
}

type StoredSummary = ImportSummaryView & { stockMode?: StockMode; priceUnit?: PriceUnit | null };

function readSettings(job: { options: Prisma.JsonValue; mapping: Prisma.JsonValue; mode: 'UPDATE_ONLY' | 'CREATE_AND_UPDATE' }): StoredSettings {
  const o = (job.options ?? {}) as Partial<StoredSettings>;
  return {
    sheet: o.sheet ?? 0,
    headerRow: o.headerRow ?? 1,
    columns: o.columns ?? null,
    legacyMapping: o.legacyMapping ?? ((o.columns ? {} : job.mapping) as Record<string, number>) ?? {},
    mode: o.mode ?? job.mode,
    priceUnit: o.priceUnit ?? null,
    stockMode: o.stockMode ?? 'SET',
    defaults: { ...EMPTY_DEFAULTS, ...(o.defaults ?? {}) },
    clearWhenEmpty: o.clearWhenEmpty ?? [],
    manufacturerBrandMapping: o.manufacturerBrandMapping ?? {},
    revision: o.revision ?? 0,
    ...(o.commit ? { commit: o.commit } : {}),
  };
}

const json = (value: unknown) => toJsonSafe(value) as Prisma.InputJsonValue;
const ROWS_PAGE = 50;

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

  /**
   * Template with Persian headers the importer recognizes, codes formatted as
   * text, a help sheet and a separate sheet of examples (so the import sheet
   * itself never carries sample rows).
   */
  async template(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('کالاها', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    const examples = wb.addWorksheet('نمونه', { views: [{ rightToLeft: true }] });
    for (const sheet of [ws, examples]) {
      sheet.addRow(TEMPLATE_COLUMNS.map((c) => importColumnLabel(c, 'fa')));
      sheet.getRow(1).font = { bold: true };
      TEMPLATE_COLUMNS.forEach((c, i) => {
        const col = sheet.getColumn(i + 1);
        col.width = c === 'name_fa' || c === 'description_fa' ? 40 : 18;
        if (c === 'sku' || c === 'technical_number') col.numFmt = '@';
      });
    }
    examples.addRow(TEMPLATE_COLUMNS.map((c) => HEADER_HELP_FA[c].example));
    examples.addRow(TEMPLATE_COLUMNS.map((c) => ({ sku: 'TEST-SAMPLE-002', technical_number: '', name_fa: 'نمونهٔ درهمی (فقط نمونه)', name_en: 'AED sample', manufacturer_brand: '', category_code: 'FILTER', vehicle_brand_codes: 'TOYOTA', vehicle_models: '', part_type: 'OEM', condition: 'NEW', origin: 'IMPORTED', base_currency: 'AED', base_price: '45.50', on_hand: '2', unit: 'عدد', low_stock_threshold: '0', override_price_irr: '', override_price_aed: '', description_fa: '', description_en: '', is_active: '1' } as Record<ImportColumn, string>)[c]));
    const help = wb.addWorksheet('راهنما', { views: [{ rightToLeft: true }] });
    help.addRow(['عنوان ستون', 'کلید انگلیسی', 'توضیح', 'نمونه']);
    help.getRow(1).font = { bold: true };
    for (const col of TEMPLATE_COLUMNS) help.addRow([importColumnLabel(col, 'fa'), col, HEADER_HELP_FA[col].help, HEADER_HELP_FA[col].example]);
    help.addRow([]);
    for (const note of [
      'کالاها را در شیت «کالاها» بنویسید؛ ستون‌هایی را که ندارید خالی بگذارید یا حذف کنید. ترتیب ستون‌ها مهم نیست و در پنل هم می‌توانید ستون‌ها را تطبیق دهید.',
      'پیش از هر تغییری پیش‌نمایش نشان داده می‌شود؛ تا تأیید نکنید چیزی ثبت نمی‌شود. ردیف خطادار هرگز بی‌صدا حذف نمی‌شود.',
      'سلول خالی در کالای موجود یعنی «بدون تغییر». با فایل هیچ کالایی حذف نمی‌شود.',
      'کد کالا و شماره فنی را «متن» نگه دارید تا صفرهای ابتدایی حذف نشوند. اگر Excel عددی را گرد کرده باشد، پنل خطا می‌دهد و مقدار را حدس نمی‌زند.',
      'فرمول‌ها اجرا نمی‌شوند؛ در ستون‌های کد، قیمت و موجودی فرمول پذیرفته نیست. فایل را با «فقط مقادیر» ذخیره کنید. حداکثر ۵۰۰۰ ردیف.',
      'کالای تازه پیش‌نویس (منتشرنشده) ثبت می‌شود. پس از ثبت، از دکمهٔ «مشاهدهٔ قطعات واردشده و افزودن عکس» برای هر قطعه عکس بگذارید.',
    ]) help.addRow(['نکته', '', note]);
    help.getColumn(1).width = 22;
    help.getColumn(2).width = 22;
    help.getColumn(3).width = 110;
    help.getColumn(4).width = 24;
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private async readyAttachment(actor: Actor, attachmentId: string) {
    const a = await this.prisma.attachment.findFirst({ where: { id: attachmentId, ownerId: actor.userId, purpose: 'IMPORT', deletedAt: null } });
    if (!a) throw notFound();
    if (a.status !== 'READY') throw conflict('FILE_NOT_READY', 'The file is still being checked');
    if (!['xlsx', 'csv'].includes(a.extension)) throw badRequest('IMPORT_FORMAT_NOT_ALLOWED');
    return a;
  }

  private async ownJob(actor: Actor, jobId: string) {
    const job = await this.prisma.importJob.findUnique({ where: { id: jobId } });
    if (!job || (job.uploaderId !== actor.userId && !actor.isOwner)) throw notFound();
    return job;
  }

  /** One step (API clients and the earlier panel): first sheet, header in row 1, columns recognized by their headers. */
  async start(actor: Actor, body: { attachmentId: string; mode: 'UPDATE_ONLY' | 'CREATE_AND_UPDATE'; columnMapping?: Record<string, number>; clearWhenEmpty: string[]; manufacturerBrandMapping: Record<string, string> }, key: string | undefined) {
    return this.idempotency.run('import.start', actor.userId, key, body, async () => {
      const a = await this.readyAttachment(actor, body.attachmentId);
      this.assertClearable(body.clearWhenEmpty);
      const settings: StoredSettings = {
        sheet: 0, headerRow: 1, columns: null, legacyMapping: body.columnMapping ?? {}, mode: body.mode, priceUnit: null, stockMode: 'SET',
        defaults: EMPTY_DEFAULTS, clearWhenEmpty: body.clearWhenEmpty, manufacturerBrandMapping: body.manufacturerBrandMapping, revision: 1,
      };
      const job = await this.prisma.$transaction(async (tx) => {
        const j = await tx.importJob.create({
          data: {
            attachmentId: a.id, uploaderId: actor.userId, mode: body.mode, fileChecksum: a.sha256 ?? '', idempotencyKey: `${actor.userId}:${key}`,
            mapping: json(body.columnMapping ?? {}), options: json(settings),
          },
        });
        await this.outbox.enqueue(tx, { type: 'import.parse', aggregateType: 'import_job', aggregateId: j.id, payload: { jobId: j.id }, dedupeKey: `import-parse:${j.id}:1` });
        return j;
      });
      return { jobId: job.id, status: job.status };
    });
  }

  /** Step 1 in the panel: the worker reads the sheets and first rows; nothing is planned or written yet. */
  async inspect(actor: Actor, attachmentId: string, key: string | undefined) {
    return this.idempotency.run('import.inspect', actor.userId, key, { attachmentId }, async () => {
      const a = await this.readyAttachment(actor, attachmentId);
      const job = await this.prisma.$transaction(async (tx) => {
        const j = await tx.importJob.create({
          data: {
            attachmentId: a.id, uploaderId: actor.userId, mode: 'CREATE_AND_UPDATE', status: 'INSPECTING', fileChecksum: a.sha256 ?? '',
            idempotencyKey: `${actor.userId}:${key}`, progress: 5,
          },
        });
        await this.outbox.enqueue(tx, { type: 'import.inspect', aggregateType: 'import_job', aggregateId: j.id, payload: { jobId: j.id }, dedupeKey: `import-inspect:${j.id}` });
        return j;
      });
      return { jobId: job.id, status: job.status };
    });
  }

  /** Worker: sheet names, first rows and a suggested sheet, header row, columns and price unit. */
  async inspectJob(jobId: string): Promise<void> {
    const job = await this.prisma.importJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== 'INSPECTING') return;
    try {
      const a = await this.prisma.attachment.findUniqueOrThrow({ where: { id: job.attachmentId } });
      const sheets = await readOutline(await this.storage.readPrivate(a.storageKey), a.extension);
      if (!sheets.length) throw new Error('no sheets');
      let best = { sheet: 0, headerIndex: 0, score: -1 };
      for (const s of sheets) {
        if (s.hidden || s.rows.length < 2) continue;
        const headerIndex = suggestHeaderRow(s.rows.map((r) => r.cells));
        const score = Object.keys(mapHeaders(s.rows[headerIndex]?.cells ?? []).mapping).length;
        if (score > best.score) best = { sheet: s.index, headerIndex, score };
      }
      const sheet = sheets[best.sheet] ?? sheets[0];
      const headerCells = sheet?.rows[best.headerIndex]?.cells ?? [];
      const { mapping, priceUnitHint } = mapHeaders(headerCells);
      // No SKU column: the technical number is the product's code (the person sees and can change this choice).
      if (mapping.sku === undefined && mapping.technical_number !== undefined) mapping.sku = mapping.technical_number;
      const outline: ImportOutline = {
        sheets,
        suggestion: { sheet: sheet?.index ?? 0, headerRow: sheet?.rows[best.headerIndex]?.rowNumber ?? 1, columns: mapping as Record<string, number>, priceUnit: priceUnitHint },
      };
      await this.prisma.importJob.updateMany({ where: { id: jobId, status: 'INSPECTING' }, data: { status: 'AWAITING_MAPPING', progress: 100, outline: json(outline) } });
    } catch (e) {
      this.logger.warn(`import ${jobId} inspection failed: ${e instanceof Error ? e.message : 'unknown'}`);
      await this.prisma.importJob.updateMany({ where: { id: jobId, status: 'INSPECTING' }, data: { status: 'FAILED', failureReason: 'UNREADABLE_FILE' } });
    }
  }

  private assertClearable(columns: readonly string[]) {
    if (columns.some((c) => !(CLEARABLE_IMPORT_COLUMNS as readonly string[]).includes(c))) throw badRequest('INVALID_CLEAR_COLUMNS');
  }

  /** Step 2: the person's choices; (re)builds the preview. Allowed until the import is applied. */
  async configure(actor: Actor, jobId: string, input: ImportSettings) {
    const job = await this.ownJob(actor, jobId);
    if (!job.outline) throw conflict('IMPORT_NOT_READY');
    if (!['AWAITING_MAPPING', 'PREVIEW_READY', 'FAILED'].includes(job.status)) throw conflict('IMPORT_BUSY', 'The import is being processed or was already applied');
    const outline = job.outline as unknown as ImportOutline;
    if (!outline.sheets.some((s) => s.index === input.sheet)) throw badRequest('SHEET_NOT_FOUND');
    for (const [column, index] of Object.entries(input.columns)) {
      if (!(IMPORT_COLUMNS as readonly string[]).includes(column) || index >= MAX_COLUMNS) throw badRequest('INVALID_COLUMN_MAPPING', `Unknown column ${column}`);
    }
    if (input.columns.sku === undefined) throw badRequest('SKU_COLUMN_REQUIRED', 'Choose the column that holds each product’s code');
    this.assertClearable(input.clearWhenEmpty);
    const d = input.defaults;
    if (d.categoryCode && !(await this.prisma.category.findFirst({ where: { code: d.categoryCode, active: true } }))) throw badRequest('UNKNOWN_CATEGORY');
    if (d.manufacturerBrandId && !(await this.prisma.manufacturerBrand.findFirst({ where: { id: d.manufacturerBrandId, active: true } }))) throw badRequest('UNKNOWN_MANUFACTURER_BRAND');
    if (d.vehicleBrandCodes.length && (await this.prisma.vehicleBrand.count({ where: { code: { in: d.vehicleBrandCodes }, active: true } })) !== new Set(d.vehicleBrandCodes).size) throw badRequest('UNKNOWN_VEHICLE_BRAND');
    const previous = readSettings(job);
    const settings: StoredSettings = {
      sheet: input.sheet, headerRow: input.headerRow, columns: input.columns, legacyMapping: {}, mode: input.mode, priceUnit: input.priceUnit,
      stockMode: input.stockMode, defaults: { ...EMPTY_DEFAULTS, ...d }, clearWhenEmpty: input.clearWhenEmpty, manufacturerBrandMapping: {}, revision: previous.revision + 1,
    };
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.importJob.updateMany({
        where: { id: jobId, status: { in: ['AWAITING_MAPPING', 'PREVIEW_READY', 'FAILED'] } },
        data: { status: 'QUEUED', progress: 0, failureReason: null, summary: Prisma.DbNull, planChecksum: null, mode: input.mode, mapping: json(input.columns), options: json(settings) },
      });
      if (res.count !== 1) throw conflict('IMPORT_BUSY');
      await tx.importRow.deleteMany({ where: { jobId } });
      await this.outbox.enqueue(tx, { type: 'import.parse', aggregateType: 'import_job', aggregateId: jobId, payload: { jobId }, dedupeKey: `import-parse:${jobId}:${settings.revision}` });
    });
    return { jobId, status: 'QUEUED' as const };
  }

  /** Worker: parse + validate + stage. No catalog/stock row is modified here (preview has no mutations). */
  async parse(jobId: string): Promise<void> {
    const claimed = await this.prisma.importJob.updateMany({ where: { id: jobId, status: 'QUEUED' }, data: { status: 'PARSING', progress: 5 } });
    if (claimed.count !== 1) return;
    const job = await this.prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
    const settings = readSettings(job);
    const fail = (failureReason: string, extra: Prisma.ImportJobUpdateManyMutationInput = {}) =>
      this.prisma.importJob.updateMany({ where: { id: jobId, status: 'PARSING' }, data: { status: 'FAILED', failureReason, ...extra } });
    try {
      const a = await this.prisma.attachment.findUniqueOrThrow({ where: { id: job.attachmentId } });
      const sheet = await readSheet(await this.storage.readPrivate(a.storageKey), a.extension, { sheet: settings.sheet, headerRow: settings.headerRow, maxRows: MAX_IMPORT_ROWS });
      if (!sheet) return void (await fail('SHEET_NOT_FOUND'));
      if (sheet.truncated) return void (await fail('TOO_MANY_ROWS', { totalRows: MAX_IMPORT_ROWS + 1 }));
      let mapping: Partial<Record<ImportColumn, number>>;
      if (settings.columns) mapping = settings.columns as Partial<Record<ImportColumn, number>>;
      else {
        const { mapping: auto, duplicateColumns } = mapHeaders(sheet.headers);
        if (duplicateColumns.length) return void (await fail('DUPLICATE_COLUMNS'));
        mapping = { ...auto, ...(settings.legacyMapping as Partial<Record<ImportColumn, number>>) };
      }
      if (mapping.sku === undefined) return void (await fail('SKU_COLUMN_MISSING'));
      if (!sheet.rows.length) return void (await fail('NO_DATA_ROWS', { totalRows: 0 }));
      const rows: RawRow[] = sheet.rows.map(({ cells }) => {
        const r: RawRow = {};
        for (const col of IMPORT_COLUMNS) {
          const idx = mapping[col];
          const cell = idx === undefined ? undefined : cells[idx];
          if (cell) r[col] = cell;
        }
        return r;
      });
      await this.prisma.importJob.update({ where: { id: jobId }, data: { progress: 30, totalRows: rows.length } });

      const codes = (col: 'sku' | 'technical_number') => rows.map((r) => (r[col]?.value === null || r[col]?.value === undefined ? '' : String(r[col]?.value).trim())).filter(Boolean);
      const skus = [...new Set(codes('sku'))];
      const [existing, technicalNumbers, categories, brands, manufacturers] = await Promise.all([
        this.loadExisting(skus),
        this.technicalIndex(codes('technical_number').length > 0),
        this.prisma.category.findMany({ where: { active: true }, select: { code: true, nameFa: true, nameEn: true } }),
        this.prisma.vehicleBrand.findMany({ where: { active: true }, select: { code: true, nameFa: true, nameEn: true } }),
        this.prisma.manufacturerBrand.findMany({ where: { active: true }, select: { id: true, normalizedName: true, nameFa: true, nameEn: true } }),
      ]);
      const names = <T extends { code: string; nameFa: string; nameEn: string | null }>(list: T[]) => {
        const map = new Map<string, string>();
        for (const x of list) {
          map.set(normalizeSearchText(x.nameFa), x.code);
          if (x.nameEn) map.set(normalizeSearchText(x.nameEn), x.code);
          map.set(normalizeSearchText(x.code), x.code);
        }
        return map;
      };
      const manufacturerMap = new Map<string, string>();
      for (const m of manufacturers) {
        manufacturerMap.set(m.normalizedName, m.id);
        manufacturerMap.set(normalizeSearchText(m.nameFa), m.id);
        if (m.nameEn) manufacturerMap.set(normalizeSearchText(m.nameEn), m.id);
      }
      for (const [name, id] of Object.entries(settings.manufacturerBrandMapping)) manufacturerMap.set(normalizeSearchText(name), id);
      const defaults: ImportDefaults = {
        categoryCode: settings.defaults.categoryCode, partType: settings.defaults.partType, condition: settings.defaults.condition, origin: settings.defaults.origin,
        manufacturerBrand: manufacturers.find((m) => m.id === settings.defaults.manufacturerBrandId)?.nameFa ?? null,
        vehicleBrandCodes: settings.defaults.vehicleBrandCodes, unit: settings.defaults.unit, initialOnHand: settings.defaults.initialOnHand,
      };
      const plan = planImport(rows, {
        mode: settings.mode,
        existing,
        categoryCodes: new Set(categories.map((c) => c.code)),
        categoryNames: names(categories),
        vehicleBrandCodes: new Set(brands.map((b) => b.code)),
        vehicleBrandNames: names(brands),
        manufacturerBrands: manufacturerMap,
        clearWhenEmpty: new Set(settings.clearWhenEmpty as ImportColumn[]),
        defaults,
        priceUnit: settings.priceUnit,
        stockMode: settings.stockMode,
        technicalNumbers,
      }, sheet.rows.map((r) => r.rowNumber));
      const planChecksum = createHash('sha256').update(JSON.stringify(toJsonSafe({ rows: plan.rows.map(({ display: _d, ...r }) => r), mode: settings.mode, stockMode: settings.stockMode }))).digest('hex');
      const mappedIndexes = new Set(Object.values(mapping));
      // The most common problems of the file, so the person fixes a cause once instead of reading it on every row.
      const grouped = new Map<string, { code: string; severity: 'error' | 'warning'; rows: Set<number>; columns: Set<string> }>();
      for (const r of plan.rows) {
        for (const issue of r.issues) {
          const key = `${issue.severity}:${issue.code}`;
          const g = grouped.get(key) ?? { code: issue.code, severity: issue.severity, rows: new Set<number>(), columns: new Set<string>() };
          g.rows.add(r.rowNumber);
          if (issue.column) g.columns.add(issue.column);
          grouped.set(key, g);
        }
      }
      const topIssues = [...grouped.values()]
        .sort((a, b) => (a.severity === b.severity ? b.rows.size - a.rows.size : a.severity === 'error' ? -1 : 1))
        .slice(0, 12)
        .map((g) => ({ code: g.code, severity: g.severity, rows: g.rows.size, columns: [...g.columns] }));
      await this.prisma.$transaction(async (tx) => {
        await tx.importRow.deleteMany({ where: { jobId } });
        for (let i = 0; i < plan.rows.length; i += 500) {
          await tx.importRow.createMany({
            data: plan.rows.slice(i, i + 500).map((r) => ({
              jobId, rowNumber: r.rowNumber, sku: r.sku, action: r.action,
              issues: json(r.issues), values: r.values ? json(r.values) : Prisma.DbNull, changes: json(r.changes), display: json(r.display),
              expectedProductVersion: r.expectedProductVersion, expectedInventoryVersion: r.expectedInventoryVersion,
              productId: r.sku ? (existing.get(r.sku)?.productId ?? null) : null,
            })),
          });
        }
        const summary: StoredSummary = {
          ...plan.summary, fileErrors: plan.fileErrors, canCommit: plan.canCommit, canCommitValid: plan.canCommitValid, requiredPermissions: plan.requiredPermissions,
          // The mapping made visible (spec §12): what was read, and which file columns were ignored.
          columns: IMPORT_COLUMNS.filter((c) => mapping[c] !== undefined),
          ignoredHeaders: sheet.headers.filter((h, i) => (h ?? '').trim() !== '' && !mappedIndexes.has(i)).slice(0, 50),
          topIssues,
          stockMode: settings.stockMode, priceUnit: settings.priceUnit,
        };
        await tx.importJob.updateMany({ where: { id: jobId, status: 'PARSING' }, data: { status: 'PREVIEW_READY', progress: 100, planChecksum, summary: json(summary) } });
      }, { timeout: 120_000 });
    } catch (e) {
      this.logger.warn(`import ${jobId} failed: ${e instanceof Error ? e.message : 'unknown'}`);
      await fail('UNREADABLE_FILE');
    }
  }

  private async loadExisting(skus: string[]): Promise<Map<string, ExistingProductSnapshot>> {
    const warehouseId = await this.inventory.defaultWarehouseId();
    const map = new Map<string, ExistingProductSnapshot>();
    for (let i = 0; i < skus.length; i += 1000) {
      const products = await this.prisma.product.findMany({
        where: { sku: { in: skus.slice(i, i + 1000) } },
        include: { translations: true, category: true, manufacturerBrand: true, vehicleBrands: { include: { vehicleBrand: true } }, basePrice: true, inventory: { where: { warehouseId } }, fitments: true },
      });
      for (const p of products) {
        const fa = p.translations.find((t) => t.locale === 'fa');
        const en = p.translations.find((t) => t.locale === 'en');
        const bal = p.inventory[0];
        map.set(p.sku, {
          productId: p.id, version: p.version, nameFa: fa?.name ?? '', nameEn: en?.name ?? null, categoryCode: p.category.code,
          vehicleBrandCodes: p.vehicleBrands.map((v) => v.vehicleBrand.code), manufacturerBrand: p.manufacturerBrand?.nameEn ?? p.manufacturerBrand?.nameFa ?? null,
          manufacturerBrandId: p.manufacturerBrandId, partType: p.partType, condition: p.condition, origin: p.origin,
          baseCurrency: p.basePrice?.baseCurrency ?? 'IRR', basePriceMinor: p.basePrice?.baseAmountMinor ?? 0n,
          overridePriceIrrMinor: p.basePrice?.manualIrrMinor ?? null, overridePriceAedMinor: p.basePrice?.manualAedMinor ?? null,
          onHand: bal?.onHand ?? 0, reserved: bal?.reserved ?? 0, inventoryVersion: bal?.version ?? 0, lowStockThreshold: bal?.lowStockThreshold ?? 0,
          unit: p.unit, descriptionFa: fa?.description ?? null, descriptionEn: en?.description ?? null, isActive: p.isSellable,
          oemCodes: p.oemCodes, vehicleModels: p.fitments.map((f) => f.modelText),
        });
      }
    }
    return map;
  }

  /** Every technical number (and SKU) of the catalog under its comparison key, with the product's manufacturer brand. */
  private async technicalIndex(needed: boolean): Promise<Map<string, Array<{ sku: string; manufacturerBrandId: string | null }>>> {
    const index = new Map<string, Array<{ sku: string; manufacturerBrandId: string | null }>>();
    if (!needed) return index;
    const products = await this.prisma.product.findMany({ where: { archivedAt: null }, select: { sku: true, oemCodes: true, manufacturerBrandId: true } });
    for (const p of products) {
      for (const code of new Set([p.sku, ...p.oemCodes].map(technicalKey))) {
        const list = index.get(code) ?? [];
        list.push({ sku: p.sku, manufacturerBrandId: p.manufacturerBrandId });
        index.set(code, list);
      }
    }
    return index;
  }

  /** The job for the panel: status, the file's sheets (for the mapping step), the person's choices and one page of preview rows. */
  async view(actor: Actor, jobId: string, page: number, filter: 'all' | 'errors' | 'create' | 'update' | 'unchanged' | 'warnings' = 'all'): Promise<ImportJobView> {
    const job = await this.ownJob(actor, jobId);
    const where: Prisma.ImportRowWhereInput = {
      jobId,
      ...(filter === 'errors' ? { action: 'ERROR' } : filter === 'create' ? { action: 'CREATE' } : filter === 'update' ? { action: 'UPDATE' } : filter === 'unchanged' ? { action: 'UNCHANGED' } : {}),
      ...(filter === 'warnings' ? { issues: { array_contains: [{ severity: 'warning' }] } } : {}),
    };
    const [rows, rowsTotal, attachment] = await Promise.all([
      this.prisma.importRow.findMany({ where, orderBy: { rowNumber: 'asc' }, skip: (page - 1) * ROWS_PAGE, take: ROWS_PAGE }),
      this.prisma.importRow.count({ where }),
      this.prisma.attachment.findUnique({ where: { id: job.attachmentId }, select: { originalFilename: true } }),
    ]);
    const settings = job.outline || job.options ? readSettings(job) : null;
    return {
      jobId: job.id, status: job.status, mode: job.mode, progress: job.progress, totalRows: job.totalRows, failureReason: job.failureReason,
      filename: attachment?.originalFilename ?? null, createdAt: job.createdAt.toISOString(), committedAt: job.committedAt?.toISOString() ?? null,
      outline: (job.outline as unknown as ImportOutline | null) ?? null,
      settings: settings && settings.columns
        ? { sheet: settings.sheet, headerRow: settings.headerRow, columns: settings.columns, mode: settings.mode, priceUnit: settings.priceUnit, stockMode: settings.stockMode, defaults: settings.defaults, clearWhenEmpty: settings.clearWhenEmpty }
        : null,
      summary: (job.summary as unknown as ImportSummaryView | null) ?? null,
      planChecksum: job.planChecksum,
      repeatAdd: settings?.stockMode === 'ADD' ? await this.previousAdd(job.id, job.fileChecksum) : null,
      rows: rows.map((r) => this.rowView(r)),
      rowsTotal, page, pageSize: ROWS_PAGE,
    };
  }

  private rowView(r: { rowNumber: number; sku: string | null; action: ImportRowView['action']; issues: Prisma.JsonValue; changes: Prisma.JsonValue; display: Prisma.JsonValue; productId: string | null; appliedAt: Date | null }): ImportRowView {
    return {
      rowNumber: r.rowNumber, sku: r.sku, action: r.action, issues: (r.issues ?? []) as ImportRowView['issues'], changes: (r.changes ?? []) as ImportRowView['changes'],
      display: (r.display as ImportRowView['display']) ?? null, productId: r.productId, applied: !!r.appliedAt,
    };
  }

  /** An earlier import that added this exact file (same bytes) to stock. */
  private async previousAdd(jobId: string, fileChecksum: string): Promise<ImportJobView['repeatAdd']> {
    if (!fileChecksum) return null;
    const earlier = await this.prisma.importJob.findFirst({
      where: { id: { not: jobId }, fileChecksum, status: 'COMMITTED', options: { path: ['stockMode'], equals: 'ADD' } },
      orderBy: { committedAt: 'desc' },
      select: { id: true, committedAt: true },
    });
    return earlier?.committedAt ? { jobId: earlier.id, committedAt: earlier.committedAt.toISOString() } : null;
  }

  async list(actor: Actor): Promise<ImportJobListItem[]> {
    const jobs = await this.prisma.importJob.findMany({ where: actor.isOwner ? {} : { uploaderId: actor.userId }, orderBy: { createdAt: 'desc' }, take: 15 });
    const files = await this.prisma.attachment.findMany({ where: { id: { in: jobs.map((j) => j.attachmentId) } }, select: { id: true, originalFilename: true } });
    const name = new Map(files.map((f) => [f.id, f.originalFilename]));
    return jobs.map((j) => {
      const s = j.summary as ImportSummaryView | null;
      return {
        jobId: j.id, status: j.status, filename: name.get(j.attachmentId) ?? null, createdAt: j.createdAt.toISOString(), committedAt: j.committedAt?.toISOString() ?? null,
        summary: s ? { create: s.create, update: s.update, unchanged: s.unchanged, error: s.error } : null,
      };
    });
  }

  /**
   * Queues the approved plan. Refused when the plan changed, when rows have
   * errors (unless the person explicitly leaves them out), when the person lacks
   * a permission the changes need, or when this exact file was already added to
   * stock (unless confirmed). Repeating the request is a no-op.
   */
  async requestCommit(actor: Actor, jobId: string, input: { planChecksum: string; skipErrorRows: boolean; confirmRepeatAdd: boolean }) {
    const job = await this.ownJob(actor, jobId);
    if (job.status === 'COMMITTED' || job.status === 'COMMITTING') return { jobId, status: job.status };
    if (job.status !== 'PREVIEW_READY') throw conflict('IMPORT_NOT_READY');
    if (job.planChecksum !== input.planChecksum) throw conflict('PLAN_CHANGED', 'The preview changed; review it again');
    const summary = job.summary as StoredSummary | null;
    if (!summary || summary.fileErrors.length) throw conflict('IMPORT_HAS_ERRORS', 'Fix all errors before applying');
    if (!summary.canCommit) {
      if (!summary.canCommitValid) throw conflict(summary.error ? 'IMPORT_HAS_ERRORS' : 'NOTHING_TO_APPLY', 'Nothing in this file can be applied');
      if (!input.skipErrorRows) throw conflict('IMPORT_HAS_ERRORS', 'Fix all errors, or choose to apply only the rows without errors');
    }
    const needed = summary.requiredPermissions ?? ['products.write', 'prices.write', 'inventory.adjust'];
    const missing = needed.filter((p) => !actor.permissions.has(p));
    if (missing.length) throw forbidden('MISSING_PERMISSION', `Missing permission: ${missing.join(', ')}`);
    const settings = readSettings(job);
    if (settings.stockMode === 'ADD' && !input.confirmRepeatAdd) {
      const earlier = await this.previousAdd(jobId, job.fileChecksum);
      if (earlier) throw conflict('REPEAT_ADD_NOT_CONFIRMED', 'This file was already added to stock', earlier);
    }
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.importJob.updateMany({
        where: { id: jobId, status: 'PREVIEW_READY', planChecksum: input.planChecksum },
        data: { status: 'COMMITTING', committedById: actor.userId, progress: 0, options: json({ ...settings, commit: { skipErrorRows: input.skipErrorRows, confirmRepeatAdd: input.confirmRepeatAdd } }) },
      });
      if (res.count !== 1) return;
      await this.outbox.enqueue(tx, { type: 'import.commit', aggregateType: 'import_job', aggregateId: jobId, payload: { jobId }, dedupeKey: `import-commit:${jobId}` });
    });
    return { jobId, status: 'COMMITTING' as const };
  }

  /**
   * Worker: applies the rows without errors in ONE transaction. Any version
   * conflict or on_hand < reserved aborts everything (nothing is applied).
   * Rows with errors are never applied (the person chose to leave them out).
   * Re-running a committed job is a no-op.
   */
  async commit(jobId: string): Promise<void> {
    const job = await this.prisma.importJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== 'COMMITTING') return;
    const settings = readSettings(job);
    const rows = await this.prisma.importRow.findMany({ where: { jobId, action: { in: ['CREATE', 'UPDATE'] } }, orderBy: { rowNumber: 'asc' } });
    const [skipped, unchanged] = await Promise.all([
      this.prisma.importRow.count({ where: { jobId, action: 'ERROR' } }),
      this.prisma.importRow.count({ where: { jobId, action: 'UNCHANGED' } }),
    ]);
    const result = { created: rows.filter((r) => r.action === 'CREATE').length, updated: rows.filter((r) => r.action === 'UPDATE').length, unchanged, skipped };
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
          for (const [name, id] of Object.entries(settings.manufacturerBrandMapping)) mfr.set(normalizeSearchText(name), id);
          let done = 0;
          for (const row of rows) {
            await this.applyRow(tx, job, row, { catId, brandId, mfr }, settings.stockMode);
            done += 1;
            // Progress for large files, written outside this transaction so the panel sees it.
            if (done % 100 === 0) await this.prisma.importJob.update({ where: { id: jobId }, data: { progress: Math.min(95, Math.round((done / rows.length) * 100)) } }).catch(() => undefined);
          }
          await tx.importRow.updateMany({ where: { jobId, action: { in: ['CREATE', 'UPDATE'] } }, data: { appliedAt: new Date() } });
          await tx.importJob.update({
            where: { id: jobId },
            data: { status: 'COMMITTED', committedAt: new Date(), progress: 100, summary: json({ ...((job.summary ?? {}) as object), result }) },
          });
          await this.audit.record(tx, {
            action: 'import.committed', entityType: 'import_job', entityId: jobId, actorKind: 'STAFF', actorId: job.committedById,
            after: { ...result, stockMode: settings.stockMode, priceUnit: settings.priceUnit, skipErrorRows: settings.commit?.skipErrorRows ?? false, fileChecksum: job.fileChecksum },
          });
        },
        { timeoutMs: 600_000 },
      );
    } catch (e) {
      const code = e instanceof DomainError ? e.code : 'COMMIT_FAILED';
      this.logger.warn(`import commit ${jobId} aborted: ${code}`);
      await this.prisma.importJob.update({ where: { id: jobId }, data: { status: code === 'VERSION_CONFLICT' || code === 'ON_HAND_BELOW_RESERVED' ? 'CONFLICT' : 'FAILED', failureReason: code } });
    }
  }

  private async applyRow(
    tx: Tx,
    job: { id: string; committedById: string | null },
    row: { rowNumber: number; action: string; values: unknown; productId: string | null; expectedProductVersion: number | null; expectedInventoryVersion: number | null },
    maps: { catId: Map<string, string>; brandId: Map<string, string>; mfr: Map<string, string> },
    stockMode: StockMode,
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
          // New products start as drafts: publishing keeps its own rules (price, real photo for used parts).
          isSellable: v.isActive ?? true, published: false, oemCodes: v.technicalNumber ? [v.technicalNumber] : [],
          createdById: job.committedById, updatedById: job.committedById,
        },
      });
      productId = created.id;
      await tx.importRow.update({ where: { jobId_rowNumber: { jobId: job.id, rowNumber: row.rowNumber } }, data: { productId } });
      await tx.productPrice.create({
        data: { productId, baseCurrency: v.baseCurrency as 'IRR', baseAmountMinor: big(v.basePriceMinor) as bigint, manualIrrMinor: big(v.overridePriceIrrMinor) ?? null, manualAedMinor: big(v.overridePriceAedMinor) ?? null, updatedById: job.committedById },
      });
      await tx.productTranslation.create({ data: { productId, locale: 'fa', name: v.nameFa as string, description: v.descriptionFa ?? null, aliases: [] } });
      if (v.nameEn) await tx.productTranslation.create({ data: { productId, locale: 'en', name: v.nameEn, description: v.descriptionEn ?? null, aliases: [] } });
      if (v.vehicleBrandCodes?.length) await tx.productVehicleBrand.createMany({ data: v.vehicleBrandCodes.map((c) => ({ productId: productId as string, vehicleBrandId: maps.brandId.get(c) as string })) });
      if (v.vehicleModels?.length) await tx.productFitment.createMany({ data: v.vehicleModels.map((modelText) => ({ productId: productId as string, modelText })) });
      await this.inventory.ensureBalance(tx, productId);
    } else {
      if (!productId) throw new DomainError('VERSION_CONFLICT');
      const current = await tx.product.findUnique({ where: { id: productId }, select: { oemCodes: true } });
      if (!current) throw new DomainError('VERSION_CONFLICT');
      const addCode = v.technicalNumber && !current.oemCodes.some((c) => technicalKey(c) === technicalKey(v.technicalNumber as string));
      const res = await tx.product.updateMany({
        where: { id: productId, version: row.expectedProductVersion ?? -1 },
        data: {
          version: { increment: 1 },
          updatedById: job.committedById,
          ...(v.categoryCode ? { categoryId: maps.catId.get(v.categoryCode) as string } : {}),
          ...(v.manufacturerBrand !== undefined ? { manufacturerBrandId: v.manufacturerBrand ? (maps.mfr.get(normalizeSearchText(v.manufacturerBrand)) ?? null) : null } : {}),
          ...(v.partType ? { partType: v.partType } : {}),
          ...(v.condition ? { condition: v.condition } : {}),
          ...(v.origin ? { origin: v.origin } : {}),
          ...(v.unit ? { unit: v.unit } : {}),
          ...(v.isActive !== undefined ? { isSellable: v.isActive } : {}),
          ...(addCode ? { oemCodes: [...current.oemCodes, v.technicalNumber as string] } : {}),
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
            updatedById: job.committedById,
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
      if (v.vehicleModels?.length) {
        // Compatible vehicles are only added: notes, years and models entered by hand stay.
        const have = await tx.productFitment.findMany({ where: { productId }, select: { modelText: true } });
        const missing = v.vehicleModels.filter((m) => !have.some((h) => normalizeSearchText(h.modelText) === normalizeSearchText(m)));
        if (missing.length) await tx.productFitment.createMany({ data: missing.map((modelText) => ({ productId: productId as string, modelText })) });
      }
    }
    if (v.onHandAdd !== undefined && v.onHandAdd > 0) {
      await this.inventory.addOnHand(tx, { productId: productId as string, quantity: v.onHandAdd, type: 'IMPORT_ADJUSTMENT', reason: 'IMPORT_ADD', referenceType: 'import_job', referenceId: job.id });
    } else if (v.onHand !== undefined) {
      await this.inventory.setOnHand(tx, {
        productId: productId as string, newOnHand: v.onHand, expectedVersion: row.action === 'CREATE' || stockMode === 'ADD' ? null : row.expectedInventoryVersion,
        type: 'IMPORT_ADJUSTMENT', reason: 'IMPORT', referenceType: 'import_job', referenceId: job.id,
      });
    }
    if (v.lowStockThreshold !== undefined) await tx.inventoryBalance.updateMany({ where: { productId: productId as string }, data: { lowStockThreshold: v.lowStockThreshold } });
    const p = await tx.product.findUniqueOrThrow({ where: { id: productId as string }, include: { translations: true } });
    const doc = buildSearchDocument([...p.translations.flatMap((t) => [t.name, ...t.aliases]), p.sku, ...p.oemCodes]);
    await tx.product.update({ where: { id: p.id }, data: { searchText: doc.text, searchCompact: doc.compact } });
  }

  /**
   * Row report in the reader's language. `errors`: every issue (errors and warnings);
   * `all`: every row with what happened to it. SKU and technical number stay text.
   */
  async report(actor: Actor, jobId: string, locale: 'fa' | 'en' = 'fa', scope: 'errors' | 'all' = 'errors'): Promise<Buffer> {
    const job = await this.ownJob(actor, jobId);
    const rows = await this.prisma.importRow.findMany({ where: { jobId }, orderBy: { rowNumber: 'asc' } });
    const fa = locale === 'fa';
    const committed = job.status === 'COMMITTED';
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(scope === 'all' ? (fa ? 'نتیجه' : 'result') : (fa ? 'خطاها' : 'errors'), { views: [{ rightToLeft: fa }] });
    const t = (s: string | null | undefined) => neutralizeSpreadsheetText(s ?? '');
    const display = (r: { display: Prisma.JsonValue }) => (r.display ?? {}) as { name?: string | null; technicalNumber?: string | null };
    if (scope === 'all') {
      ws.addRow(fa ? ['ردیف', 'کد کالا', 'شماره فنی', 'نام قطعه', 'وضعیت', 'نتیجه', 'توضیح'] : ['row', 'sku', 'technical_number', 'name', 'status', 'result', 'details']);
      const status: Record<string, [string, string]> = { CREATE: ['جدید', 'new'], UPDATE: ['به‌روزرسانی', 'update'], UNCHANGED: ['بدون تغییر', 'unchanged'], ERROR: ['دارای خطا', 'error'] };
      for (const r of rows) {
        const d = display(r);
        const outcome = r.appliedAt ? (fa ? 'ثبت شد' : 'applied') : r.action === 'ERROR' ? (fa ? 'ثبت نشد' : 'not applied') : committed ? (fa ? 'تغییری لازم نبود' : 'no change needed') : (fa ? 'هنوز ثبت نشده' : 'not applied yet');
        const issues = (r.issues as Array<{ code: string; detail?: string }>).map((i) => `${describeImportCode(i.code, locale)}${i.detail ? ` (${i.detail})` : ''}`).join(' — ');
        ws.addRow([r.rowNumber, t(r.sku), t(d.technicalNumber), t(d.name), status[r.action]?.[fa ? 0 : 1] ?? r.action, outcome, t(issues)]);
      }
    } else {
      ws.addRow(fa ? ['ردیف', 'کد کالا', 'شماره فنی', 'نام قطعه', 'نوع', 'ستون', 'کد خطا', 'توضیح', 'جزئیات'] : ['row', 'sku', 'technical_number', 'name', 'severity', 'column', 'code', 'message', 'detail']);
      const severity = (s: string) => (fa ? (s === 'error' ? 'خطا' : 'هشدار') : s);
      for (const r of rows) {
        const d = display(r);
        for (const issue of (r.issues as Array<{ column: string | null; code: string; severity: string; detail?: string }>) ?? []) {
          ws.addRow([r.rowNumber, t(r.sku), t(d.technicalNumber), t(d.name), severity(issue.severity), issue.column ? importColumnLabel(issue.column, locale) : '', issue.code, describeImportCode(issue.code, locale), t(issue.detail)]);
        }
      }
    }
    ws.getRow(1).font = { bold: true };
    for (const c of [2, 3]) {
      ws.getColumn(c).numFmt = '@';
      ws.getColumn(c).width = 20;
    }
    ws.getColumn(4).width = 40;
    ws.getColumn(scope === 'all' ? 7 : 8).width = 80;
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** Products created or updated by this import, for adding photos (stable product ids, never row numbers). */
  async importedProducts(actor: Actor, jobId: string, q: { q?: string; noPhoto?: boolean; page: number }): Promise<{ items: ImportedProductView[]; total: number; page: number; pageSize: number }> {
    const job = await this.ownJob(actor, jobId);
    if (job.status !== 'COMMITTED') return { items: [], total: 0, page: q.page, pageSize: ROWS_PAGE };
    const rows = await this.prisma.importRow.findMany({ where: { jobId, appliedAt: { not: null }, productId: { not: null } }, select: { productId: true, rowNumber: true, action: true }, orderBy: { rowNumber: 'asc' } });
    const term = q.q?.trim();
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: rows.map((r) => r.productId as string) },
        ...(term ? { OR: [{ sku: { contains: term, mode: 'insensitive' } }, { searchText: { contains: normalizeSearchText(term) } }, { searchCompact: { contains: normalizeSearchText(term).replace(/ /g, '') } }] } : {}),
      },
      include: { translations: true, manufacturerBrand: true, media: { where: { deletedAt: null }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const items: ImportedProductView[] = [];
    for (const r of rows) {
      const p = byId.get(r.productId as string);
      if (!p || (q.noPhoto && p.media.length > 0)) continue;
      const fa = p.translations.find((x) => x.locale === 'fa');
      const primary = p.media[0];
      items.push({
        productId: p.id, rowNumber: r.rowNumber, action: r.action === 'CREATE' ? 'CREATE' : 'UPDATE', sku: p.sku, nameFa: fa?.name ?? '',
        nameEn: p.translations.find((x) => x.locale === 'en')?.name ?? null, technicalNumbers: p.oemCodes,
        brand: p.manufacturerBrand?.nameFa ?? null, condition: p.condition, published: p.published, photoCount: p.media.length,
        primaryPhoto: primary ? { storageKey: primary.storageKey, width: primary.width, height: primary.height, alt: primary.altFa } : null,
        photoRequiredToPublish: p.condition !== 'NEW',
      });
    }
    return { items: items.slice((q.page - 1) * ROWS_PAGE, q.page * ROWS_PAGE), total: items.length, page: q.page, pageSize: ROWS_PAGE };
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
    ws.addRow([...EXPORT_COLUMNS, 'reserved', 'available', 'exported_at_utc']);
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
