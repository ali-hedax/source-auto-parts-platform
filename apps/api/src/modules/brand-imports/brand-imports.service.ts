import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  BrandImportListItem, BrandImportOptions, BrandImportPreviewRow, BrandImportSourceOutline, BrandImportStats, BrandImportStatus, BrandImportView,
} from '@hedax/contracts';
import {
  type BrandMapping, type BrandRowValues, type KnownVehicle, applyBrandMapping, brandMappingProblems, buildSearchDocument, matchFitment,
  normalizeSearchText, reuseBrandMapping, suggestBrandMapping,
} from '@hedax/domain';
import { AuditService } from '../../common/audit.service.js';
import { badRequest, conflict, notFound } from '../../common/errors.js';
import { OutboxService } from '../../common/outbox.service.js';
import { Prisma, PrismaService } from '../../common/prisma.service.js';
import { PublicCacheService } from '../../common/public-cache.service.js';
import type { Actor } from '../../common/request-context.js';
import { SCANNER, type MalwareScanner } from '../../common/storage/scanner.js';
import { STORAGE, type StorageDriver } from '../../common/storage/storage.js';
import { slugify } from '../catalog/admin-catalog.service.js';
import { otherNumbers } from '../catalog/product-numbers.js';
import { rebuildProductSearch } from '../catalog/product-search.js';
import { brandFileKind, readBrandFile, type SourceInfo } from './brand-file.js';

/** Largest brand database file accepted in one upload (bigger databases: zip them or send them in parts). */
export const MAX_BRAND_FILE_BYTES = 150 * 1024 * 1024;
const BATCH = 500;
const MAX_ERRORS = 50_000;
const PREVIEW_ROWS = 40;
const PREVIEW_ERRORS = 15;
const DEFAULT_OPTIONS: BrandImportOptions = { publish: false, partType: 'GENUINE', encoding: 'auto' };

type ImportRow = Prisma.BrandImportGetPayload<{ include: { manufacturerBrand: true } }>;
interface Lookups {
  makerId: string;
  makerName: string;
  categoryOf: (s: string) => string | null;
  otherCategoryId: string;
  vehicleBrandOf: (s: string) => string | null;
  vehicles: KnownVehicle[];
  unit: { id: string; name: string };
}
/** The technical fields an import may change, as they were before it (restored by «برگرداندن این ورود»). */
interface Snapshot {
  partNumber: string | null;
  partNumberKey: string | null;
  nameFa: string | null;
  nameEn: string | null;
  descriptionFa: string | null;
  specs: Prisma.JsonValue;
  categoryId: string;
  numbers: Array<{ number: string; numberKey: string; kind: 'EQUIVALENT' | 'REPLACEMENT'; sortOrder: number }>;
  vehicles: Array<{ vehicleId: string; modelId: string | null; yearFrom: number | null; yearTo: number | null; note: string | null }>;
  vehicleBrandIds: string[];
}

const specsJson = (specs: BrandRowValues['specs']) => specs.map((s, i) => ({ key: `spec-${i + 1}`, labelFa: s.label, value: s.value }));
const specLabels = (v: Prisma.JsonValue): string[] => (Array.isArray(v) ? v.flatMap((s) => (s && typeof s === 'object' && !Array.isArray(s) && typeof s.labelFa === 'string' ? [normalizeSearchText(s.labelFa)] : [])) : []);

/**
 * Brand database import («ورود دیتابیس برند»): a manufacturer's whole parts database, read as a
 * stream in the worker (outbox), in batches, so tens or hundreds of thousands of rows never sit in
 * memory. Parts are keyed by the normalized technical number + the manufacturer brand: importing the
 * same brand again updates instead of duplicating. New parts get no price (the site offers
 * «درخواست تأمین»). Parts that already exist only get their technical information completed: price,
 * stock and photos added by hand are never touched. Each import keeps what it changed, so the latest
 * import of a brand can be undone.
 */
@Injectable()
export class BrandImportsService {
  private readonly logger = new Logger(BrandImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly publicCache: PublicCacheService,
    @Inject(STORAGE) private readonly storage: StorageDriver,
    @Inject(SCANNER) private readonly scanner: MalwareScanner,
  ) {}

  // ---------------------------------------------------------------------------
  // Upload and mapping (API)
  // ---------------------------------------------------------------------------

  /** The uploaded file (on local disk, written by the upload interceptor) is checked, scanned and stored privately. */
  async upload(actor: Actor, file: { path: string; originalname: string; size: number }, body: { manufacturerBrandId: string; source: string }) {
    try {
      const maker = await this.prisma.manufacturerBrand.findFirst({ where: { id: body.manufacturerBrandId, active: true } });
      if (!maker) throw badRequest('UNKNOWN_MANUFACTURER_BRAND', 'Choose a manufacturer brand from the list');
      if (file.size > MAX_BRAND_FILE_BYTES) throw badRequest('BRAND_FILE_TOO_LARGE');
      const kind = await brandFileKind(file.path, file.originalname);
      if (!kind) throw badRequest('BRAND_FILE_FORMAT', 'Only xlsx, csv or a zip of csv files');
      const scan = await this.scanner.scanFile(file.path);
      if (!scan.clean) throw badRequest('FILE_REJECTED', 'The file did not pass the security scan');
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(file.path)) hash.update(chunk as Buffer);
      const storageKey = `brand-imports/${randomUUID()}.${kind}`;
      await this.storage.putPrivateFile(storageKey, file.path, kind === 'csv' ? 'text/csv' : 'application/zip');
      const profile = await this.prisma.brandImportProfile.findUnique({ where: { manufacturerBrandId_source: { manufacturerBrandId: maker.id, source: body.source } } });
      const imp = await this.prisma.tx(async (tx) => {
        const attachment = await tx.attachment.create({
          data: {
            ownerId: actor.userId, purpose: 'BRAND_IMPORT', status: 'READY', storageKey, originalFilename: file.originalname.slice(0, 160), extension: kind,
            sizeBytes: file.size, sha256: hash.digest('hex'), scanEngine: scan.engine, scannedAt: new Date(), subjectType: 'BRAND_IMPORT',
          },
        });
        const created = await tx.brandImport.create({
          data: {
            manufacturerBrandId: maker.id, source: body.source, attachmentId: attachment.id, filename: file.originalname.slice(0, 255), status: 'INSPECTING',
            options: { ...DEFAULT_OPTIONS, ...((profile?.options as object | null) ?? {}) }, createdById: actor.userId,
          },
        });
        await tx.attachment.update({ where: { id: attachment.id }, data: { subjectId: created.id } });
        await this.outbox.enqueue(tx, { type: 'brand-import.inspect', aggregateType: 'brand_import', aggregateId: created.id, payload: { importId: created.id }, dedupeKey: `brand-import-inspect:${created.id}` });
        await this.audit.record(tx, { action: 'brand_import.uploaded', entityType: 'brand_import', entityId: created.id, after: { maker: maker.nameFa, source: body.source, filename: file.originalname, size: file.size } });
        return created;
      });
      return { id: imp.id };
    } finally {
      await rm(file.path, { force: true }).catch(() => undefined);
    }
  }

  private headersOf(outline: BrandImportSourceOutline[] | null): string[] {
    return [...new Set((outline ?? []).flatMap((s) => s.headers).filter(Boolean))];
  }

  async setMapping(actor: Actor, id: string, mapping: Record<string, string[]>, options: BrandImportOptions) {
    const imp = await this.prisma.brandImport.findUnique({ where: { id } });
    if (!imp) throw notFound();
    if (!['AWAITING_MAPPING', 'PREVIEW_READY'].includes(imp.status)) throw conflict('BRAND_IMPORT_NOT_EDITABLE', 'This import is already running or finished');
    const problems = brandMappingProblems(mapping as BrandMapping, this.headersOf(imp.outline as BrandImportSourceOutline[] | null));
    if (problems.length) throw badRequest('MAPPING_INVALID', 'The column mapping is not complete', { problems });
    await this.prisma.tx(async (tx) => {
      await tx.brandImport.update({ where: { id }, data: { mapping, options, status: 'PREVIEWING', preview: Prisma.DbNull, stats: {} } });
      // Saved for this brand and source: applied automatically next time.
      await tx.brandImportProfile.upsert({
        where: { manufacturerBrandId_source: { manufacturerBrandId: imp.manufacturerBrandId, source: imp.source } },
        create: { manufacturerBrandId: imp.manufacturerBrandId, source: imp.source, mapping, options },
        update: { mapping, options },
      });
      await this.outbox.enqueue(tx, { type: 'brand-import.preview', aggregateType: 'brand_import', aggregateId: id, payload: { importId: id }, dedupeKey: `brand-import-preview:${id}:${Date.now()}` });
      await this.audit.record(tx, { action: 'brand_import.mapped', entityType: 'brand_import', entityId: id, after: { mapping, options } });
    });
    return this.view(id);
  }

  async start(actor: Actor, id: string) {
    await this.prisma.tx(async (tx) => {
      const moved = await tx.brandImport.updateMany({ where: { id, status: 'PREVIEW_READY' }, data: { status: 'QUEUED' } });
      if (moved.count !== 1) throw conflict('BRAND_IMPORT_NOT_READY', 'The preview is not ready, or the import already ran');
      await this.outbox.enqueue(tx, { type: 'brand-import.run', aggregateType: 'brand_import', aggregateId: id, payload: { importId: id }, dedupeKey: `brand-import-run:${id}` });
      await this.audit.record(tx, { action: 'brand_import.started', entityType: 'brand_import', entityId: id, actorId: actor.userId });
    });
    return this.view(id);
  }

  /** Only the latest import of a brand that is not undone (later imports may have built on it). */
  private async latestOf(manufacturerBrandId: string): Promise<string | null> {
    const last = await this.prisma.brandImport.findFirst({
      where: { manufacturerBrandId, status: { in: ['COMPLETED', 'RUNNING', 'QUEUED', 'ROLLING_BACK'] } },
      orderBy: { createdAt: 'desc' }, select: { id: true, status: true },
    });
    return last?.status === 'COMPLETED' ? last.id : null;
  }

  async rollback(actor: Actor, id: string) {
    const imp = await this.prisma.brandImport.findUnique({ where: { id } });
    if (!imp) throw notFound();
    if (imp.status !== 'COMPLETED' || (await this.latestOf(imp.manufacturerBrandId)) !== id) {
      throw conflict('BRAND_IMPORT_ROLLBACK_NOT_ALLOWED', 'Only the latest finished import of a brand can be undone');
    }
    await this.prisma.tx(async (tx) => {
      const moved = await tx.brandImport.updateMany({ where: { id, status: 'COMPLETED' }, data: { status: 'ROLLING_BACK', rolledBackById: actor.userId } });
      if (moved.count !== 1) throw conflict('BRAND_IMPORT_ROLLBACK_NOT_ALLOWED');
      await this.outbox.enqueue(tx, { type: 'brand-import.rollback', aggregateType: 'brand_import', aggregateId: id, payload: { importId: id }, dedupeKey: `brand-import-rollback:${id}` });
      await this.audit.record(tx, { action: 'brand_import.rollback_requested', entityType: 'brand_import', entityId: id });
    });
    return this.view(id);
  }

  // ---------------------------------------------------------------------------
  // Reads (API)
  // ---------------------------------------------------------------------------

  private async toView(imp: ImportRow, withPreview: boolean): Promise<BrandImportView> {
    const [user, errorCount, latest] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: imp.createdById }, select: { fullName: true, email: true } }),
      this.prisma.brandImportError.count({ where: { importId: imp.id } }),
      imp.status === 'COMPLETED' ? this.latestOf(imp.manufacturerBrandId) : Promise.resolve(null),
    ]);
    const outline = (imp.outline as BrandImportSourceOutline[] | null) ?? null;
    const stats = (imp.stats ?? {}) as BrandImportStats & { missingColumns?: string[] };
    return {
      id: imp.id, manufacturer: { id: imp.manufacturerBrandId, nameFa: imp.manufacturerBrand.nameFa }, source: imp.source, filename: imp.filename,
      status: imp.status as BrandImportStatus, outline: withPreview ? outline : null, mapping: (imp.mapping ?? {}) as Record<string, string[]>,
      options: { ...DEFAULT_OPTIONS, ...((imp.options as object | null) ?? {}) } as BrandImportOptions,
      missingColumns: stats.missingColumns ?? [], preview: withPreview ? ((imp.preview as BrandImportPreviewRow[] | null) ?? []) : [], stats,
      totalRows: imp.totalRows, processedRows: imp.processedRows, failureReason: imp.failureReason,
      createdBy: user ? (user.fullName ?? user.email) : null, createdAt: imp.createdAt.toISOString(), startedAt: imp.startedAt?.toISOString() ?? null,
      finishedAt: imp.finishedAt?.toISOString() ?? null, rolledBackAt: imp.rolledBackAt?.toISOString() ?? null,
      canRollback: latest === imp.id, errorCount,
    };
  }

  async view(id: string): Promise<BrandImportView> {
    const imp = await this.prisma.brandImport.findUnique({ where: { id }, include: { manufacturerBrand: true } });
    if (!imp) throw notFound();
    return this.toView(imp, true);
  }

  async list(): Promise<BrandImportListItem[]> {
    const rows = await this.prisma.brandImport.findMany({ include: { manufacturerBrand: true }, orderBy: { createdAt: 'desc' }, take: 100 });
    return Promise.all(rows.map(async (r) => {
      const v = await this.toView(r, false);
      return {
        id: v.id, manufacturer: v.manufacturer, source: v.source, filename: v.filename, status: v.status, stats: v.stats, totalRows: v.totalRows,
        processedRows: v.processedRows, createdBy: v.createdBy, createdAt: v.createdAt, finishedAt: v.finishedAt, rolledBackAt: v.rolledBackAt,
        canRollback: v.canRollback, errorCount: v.errorCount,
      };
    }));
  }

  /** The rows the import could not use, as CSV (UTF-8 with BOM, so Excel shows Persian correctly). */
  async errorReport(id: string): Promise<string> {
    if (!(await this.prisma.brandImport.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
    const rows = await this.prisma.brandImportError.findMany({ where: { importId: id }, orderBy: { createdAt: 'asc' }, take: MAX_ERRORS });
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = [['ردیف', 'شماره فنی', 'خطا', 'جزئیات'].map(q).join(','), ...rows.map((r) => [r.rowRef, r.partNumber ?? '', r.codes.join(' '), r.detail ?? ''].map(q).join(','))];
    return `${String.fromCharCode(0xfeff)}${lines.join('\r\n')}\r\n`;
  }

  // ---------------------------------------------------------------------------
  // Worker
  // ---------------------------------------------------------------------------

  /** The import's file copied from the private store to a temporary local file (streamed). */
  private async localFile(imp: { attachmentId: string }): Promise<{ file: string; extension: string; cleanup: () => Promise<void> }> {
    const a = await this.prisma.attachment.findUniqueOrThrow({ where: { id: imp.attachmentId } });
    const dir = await mkdtemp(path.join(tmpdir(), 'hedax-brand-'));
    const file = path.join(dir, `data.${a.extension}`);
    await pipeline(await this.storage.getPrivate(a.storageKey), createWriteStream(file));
    return { file, extension: a.extension, cleanup: () => rm(dir, { recursive: true, force: true }) };
  }

  /** Records as { header: cell } per row; the first record of each sheet / csv file is its header row. */
  private async *rows(imp: { attachmentId: string; options: Prisma.JsonValue }, info?: (source: string, i: SourceInfo) => void): AsyncGenerator<{ rowRef: string; cells: Record<string, string> }> {
    const { file, extension, cleanup } = await this.localFile(imp);
    const encoding = ((imp.options as BrandImportOptions | null)?.encoding ?? 'auto') as 'auto' | 'utf-8' | 'windows-1256';
    try {
      const headers = new Map<string, string[]>();
      for await (const rec of readBrandFile(file, extension, encoding, info)) {
        const h = headers.get(rec.source);
        if (!h) {
          headers.set(rec.source, rec.cells.map((c) => c.replace(/\s+/g, ' ').trim()));
          continue;
        }
        const cells: Record<string, string> = {};
        h.forEach((name, i) => { if (name && cells[name] === undefined) cells[name] = rec.cells[i] ?? ''; });
        yield { rowRef: `${rec.source}:${rec.line}`, cells };
      }
    } finally {
      await cleanup();
    }
  }

  private async fail(id: string, reason: string): Promise<void> {
    await this.prisma.brandImport.update({ where: { id }, data: { status: 'FAILED', failureReason: reason.slice(0, 500), finishedAt: new Date() } });
  }

  /** Reads sheets / csv files, headers, sample rows and the row count; pre-fills the mapping (saved one first). */
  async inspect(id: string): Promise<void> {
    const imp = await this.prisma.brandImport.findUnique({ where: { id } });
    if (!imp || imp.status !== 'INSPECTING') return;
    try {
      const { file, extension, cleanup } = await this.localFile(imp);
      const sources = new Map<string, BrandImportSourceOutline>();
      let total = 0;
      try {
        const encoding = ((imp.options as BrandImportOptions | null)?.encoding ?? 'auto') as 'auto' | 'utf-8' | 'windows-1256';
        const info = new Map<string, SourceInfo>();
        for await (const rec of readBrandFile(file, extension, encoding, (s, i) => info.set(s, i))) {
          let s = sources.get(rec.source);
          if (!s) {
            const i = info.get(rec.source);
            s = { name: rec.source, headers: rec.cells.map((c) => c.replace(/\s+/g, ' ').trim()), samples: [], encoding: i?.encoding ?? null, delimiter: i?.delimiter ?? null };
            sources.set(rec.source, s);
            continue;
          }
          total += 1;
          if (s.samples.length < 5) s.samples.push(rec.cells.slice(0, 60).map((c) => c.slice(0, 120)));
        }
      } finally {
        await cleanup();
      }
      const outline = [...sources.values()];
      const headers = this.headersOf(outline);
      if (!headers.length || total === 0) return void (await this.fail(id, 'NO_DATA_ROWS'));
      const profile = await this.prisma.brandImportProfile.findUnique({ where: { manufacturerBrandId_source: { manufacturerBrandId: imp.manufacturerBrandId, source: imp.source } } });
      const reused = profile ? reuseBrandMapping(profile.mapping as BrandMapping, headers) : { mapping: suggestBrandMapping(headers), missing: [] };
      await this.prisma.brandImport.update({
        where: { id },
        data: { status: 'AWAITING_MAPPING', outline: outline as unknown as Prisma.InputJsonValue, mapping: reused.mapping, totalRows: total, stats: { missingColumns: reused.missing } },
      });
    } catch (e) {
      this.logger.warn(`brand import ${id} inspect failed: ${e instanceof Error ? e.message : String(e)}`);
      await this.fail(id, e instanceof Error && /^[A-Z_]+$/.test(e.message) ? e.message : 'FILE_UNREADABLE');
    }
  }

  private async lookups(makerId: string): Promise<Lookups> {
    const [maker, categories, brands, vehicles, unit, other] = await Promise.all([
      this.prisma.manufacturerBrand.findUniqueOrThrow({ where: { id: makerId } }),
      this.prisma.category.findMany({ select: { id: true, code: true, slug: true, nameFa: true, nameEn: true } }),
      this.prisma.vehicleBrand.findMany({ select: { id: true, code: true, slug: true, nameFa: true, nameEn: true } }),
      this.prisma.vehicle.findMany({ where: { active: true }, include: { models: { where: { active: true } } } }),
      this.prisma.unit.findFirst({ where: { name: 'عدد' }, orderBy: { createdAt: 'asc' } }),
      this.prisma.category.findFirst({ where: { OR: [{ code: 'OTHER' }, { slug: 'other-parts' }] } }),
    ]);
    const index = <T extends { id: string }>(rows: T[], names: (r: T) => Array<string | null>) => {
      const map = new Map<string, string>();
      for (const r of rows) for (const n of names(r)) if (n) map.set(normalizeSearchText(n), r.id);
      return (s: string) => map.get(normalizeSearchText(s)) ?? null;
    };
    const fallbackCategory = other ?? (await this.prisma.category.findFirstOrThrow({ orderBy: { sortOrder: 'desc' } }));
    const fallbackUnit = unit ?? (await this.prisma.unit.findFirstOrThrow({ orderBy: { createdAt: 'asc' } }));
    return {
      makerId, makerName: maker.nameEn || maker.nameFa,
      categoryOf: index(categories, (c) => [c.code, c.slug, c.nameFa, c.nameEn]),
      otherCategoryId: fallbackCategory.id,
      vehicleBrandOf: index(brands, (b) => [b.code, b.slug, b.nameFa, b.nameEn]),
      vehicles: vehicles.map((v) => ({ id: v.id, name: v.name, models: v.models.map((m) => ({ id: m.id, name: m.name })) })),
      unit: { id: fallbackUnit.id, name: fallbackUnit.name },
    };
  }

  /** Reads the whole file with the mapping and counts new / update / duplicate / error; keeps sample rows. */
  async preview(id: string): Promise<void> {
    const imp = await this.prisma.brandImport.findUnique({ where: { id } });
    if (!imp || imp.status !== 'PREVIEWING') return;
    try {
      const mapping = imp.mapping as BrandMapping;
      const vehicles = (await this.lookups(imp.manufacturerBrandId)).vehicles;
      const stats = { rows: 0, new: 0, update: 0, duplicate: 0, error: 0, unknownVehicles: 0 };
      const seen = new Set<string>();
      const sample: BrandImportPreviewRow[] = [];
      const errors: BrandImportPreviewRow[] = [];
      let batch: Array<{ row: BrandImportPreviewRow; key: string }> = [];
      const flush = async () => {
        if (!batch.length) return;
        const keys = batch.map((b) => b.key);
        const existing = new Set<string | null>((await this.prisma.product.findMany({
          where: { manufacturerBrandId: imp.manufacturerBrandId, partNumberKey: { in: keys } }, select: { partNumberKey: true },
        })).map((p) => p.partNumberKey));
        // Same rule as the run: a part entered by hand with this number among its technical codes is an update.
        const rest = keys.filter((k) => !existing.has(k));
        if (rest.length) {
          const legacy = await this.prisma.$queryRaw<Array<{ k: string }>>`
            SELECT DISTINCT k FROM "product" p CROSS JOIN unnest(${rest}::text[]) AS k
            WHERE p."manufacturer_brand_id" = ${imp.manufacturerBrandId}::uuid AND p."archived_at" IS NULL AND p."part_number_key" IS NULL
              AND cardinality(p."oem_codes") > 0
              AND EXISTS (SELECT 1 FROM unnest(p."oem_codes") c WHERE upper(regexp_replace(c, '[^[:alnum:]]', '', 'g')) = k)`;
          for (const l of legacy) existing.add(l.k);
        }
        for (const b of batch) {
          b.row.state = existing.has(b.key) ? 'UPDATE' : 'NEW';
          stats[b.row.state === 'UPDATE' ? 'update' : 'new'] += 1;
        }
        batch = [];
      };
      for await (const { rowRef, cells } of this.rows(imp)) {
        stats.rows += 1;
        const { values, issues } = applyBrandMapping(cells, mapping);
        const row: BrandImportPreviewRow = {
          rowRef, state: 'ERROR', partNumber: values?.partNumber ?? (cells[mapping.partNumber?.[0] ?? ''] ?? '').slice(0, 80), nameFa: values?.nameFa ?? null,
          equivalents: values?.equivalents.slice(0, 5) ?? [], fitments: values?.fitments.map((f) => (f.yearFrom ? `${f.text} (${f.yearFrom}-${f.yearTo})` : f.text)).slice(0, 5) ?? [],
          specs: values?.specs.map((s) => `${s.label}: ${s.value}`).slice(0, 5) ?? [], issues,
        };
        if (!values) {
          stats.error += 1;
          if (errors.length < PREVIEW_ERRORS) errors.push(row);
          continue;
        }
        stats.unknownVehicles += values.fitments.filter((f) => matchFitment(f.text, vehicles).kind !== 'KNOWN').length;
        if (seen.has(values.partNumberKey)) {
          stats.duplicate += 1;
          row.state = 'DUPLICATE';
          if (errors.length < PREVIEW_ERRORS) errors.push(row);
          continue;
        }
        seen.add(values.partNumberKey);
        batch.push({ row, key: values.partNumberKey });
        if (sample.length < PREVIEW_ROWS) sample.push(row);
        if (batch.length >= 1000) await flush();
      }
      await flush();
      await this.prisma.brandImport.update({
        where: { id },
        data: { status: 'PREVIEW_READY', preview: [...sample, ...errors] as unknown as Prisma.InputJsonValue, stats: { ...((imp.stats as object | null) ?? {}), ...stats }, totalRows: stats.rows },
      });
    } catch (e) {
      this.logger.warn(`brand import ${id} preview failed: ${e instanceof Error ? e.message : String(e)}`);
      await this.fail(id, e instanceof Error && /^[A-Z_]+$/.test(e.message) ? e.message : 'FILE_UNREADABLE');
    }
  }

  /** Imports every row, in batches of 500 (each batch one transaction), with progress. Safe to run again after a crash. */
  async run(id: string): Promise<void> {
    const claimed = await this.prisma.brandImport.updateMany({ where: { id, status: { in: ['QUEUED', 'RUNNING'] } }, data: { status: 'RUNNING', startedAt: new Date() } });
    if (claimed.count !== 1) return;
    const imp = await this.prisma.brandImport.findUniqueOrThrow({ where: { id } });
    const mapping = imp.mapping as BrandMapping;
    const options = { ...DEFAULT_OPTIONS, ...((imp.options as object | null) ?? {}) } as BrandImportOptions;
    const stats = { created: 0, updated: 0, unchanged: 0, duplicate: 0, error: 0, unknownVehicles: 0 };
    try {
      const lk = await this.lookups(imp.manufacturerBrandId);
      await this.prisma.brandImportError.deleteMany({ where: { importId: id } });
      const seen = new Set<string>();
      let processed = 0;
      let errorRows: Prisma.BrandImportErrorCreateManyInput[] = [];
      let errorsSaved = 0;
      const saveErrors = async () => {
        if (!errorRows.length) return;
        const room = Math.max(0, MAX_ERRORS - errorsSaved);
        if (room) await this.prisma.brandImportError.createMany({ data: errorRows.slice(0, room) });
        errorsSaved += Math.min(room, errorRows.length);
        errorRows = [];
      };
      let batch: Array<{ rowRef: string; values: BrandRowValues }> = [];
      const flush = async () => {
        if (batch.length) {
          const res = await this.applyBatch(imp.id, batch, lk, options);
          stats.created += res.created;
          stats.updated += res.updated;
          stats.unchanged += res.unchanged;
          stats.unknownVehicles += res.unknownVehicles.length;
          for (const u of res.unknownVehicles) errorRows.push({ importId: id, rowRef: u.rowRef, partNumber: u.partNumber, codes: ['UNKNOWN_VEHICLE'], detail: u.text.slice(0, 300) });
        }
        batch = [];
        await saveErrors();
        await this.prisma.brandImport.update({ where: { id }, data: { processedRows: processed, stats: { ...((imp.stats as object | null) ?? {}), ...stats } } });
      };
      for await (const { rowRef, cells } of this.rows(imp)) {
        processed += 1;
        const { values, issues } = applyBrandMapping(cells, mapping);
        if (!values) {
          stats.error += 1;
          errorRows.push({ importId: id, rowRef, partNumber: (cells[mapping.partNumber?.[0] ?? ''] ?? '').slice(0, 120) || null, codes: issues });
          continue;
        }
        if (seen.has(values.partNumberKey)) {
          stats.duplicate += 1;
          errorRows.push({ importId: id, rowRef, partNumber: values.partNumber.slice(0, 120), codes: ['DUPLICATE_IN_FILE'] });
          continue;
        }
        seen.add(values.partNumberKey);
        batch.push({ rowRef, values });
        if (batch.length >= BATCH) await flush();
      }
      await flush();
      await this.prisma.tx(async (tx) => {
        await tx.brandImport.update({ where: { id }, data: { status: 'COMPLETED', finishedAt: new Date(), processedRows: processed, totalRows: processed, stats: { ...((imp.stats as object | null) ?? {}), ...stats } } });
        await this.audit.record(tx, { action: 'brand_import.completed', entityType: 'brand_import', entityId: id, actorKind: 'SYSTEM', after: stats });
      });
      this.publicCache.invalidate();
    } catch (e) {
      this.logger.warn(`brand import ${id} run failed: ${e instanceof Error ? e.message : String(e)}`);
      // Batches already written stay (each is complete), and the import can be undone as usual.
      await this.prisma.brandImport.update({ where: { id }, data: { status: 'COMPLETED', finishedAt: new Date(), failureReason: 'STOPPED_WITH_ERROR', stats: { ...((imp.stats as object | null) ?? {}), ...stats } } });
      this.publicCache.invalidate();
    }
  }

  /** One batch: new parts are created in bulk; existing parts only get technical information completed. */
  private async applyBatch(importId: string, rows: Array<{ rowRef: string; values: BrandRowValues }>, lk: Lookups, options: BrandImportOptions) {
    return this.prisma.tx(async (tx) => {
      const keys = rows.map((r) => r.values.partNumberKey);
      const existing = await tx.product.findMany({
        where: { manufacturerBrandId: lk.makerId, partNumberKey: { in: keys } },
        include: {
          translations: true, numbers: true, vehicles: true, vehicleBrands: true, basePrice: { select: { id: true } },
          brandImportChanges: { where: { importId }, select: { id: true } },
        },
      });
      const byKey = new Map(existing.map((p) => [p.partNumberKey as string, p]));
      // Parts of this maker entered by hand whose number is only among their technical codes: the
      // same part (completed, never duplicated); they get this number as their main number.
      const missing = keys.filter((k) => !byKey.has(k));
      if (missing.length) {
        const legacy = await tx.$queryRaw<Array<{ id: string; k: string }>>`
          SELECT p."id", k FROM "product" p CROSS JOIN unnest(${missing}::text[]) AS k
          WHERE p."manufacturer_brand_id" = ${lk.makerId}::uuid AND p."archived_at" IS NULL AND p."part_number_key" IS NULL
            AND cardinality(p."oem_codes") > 0
            AND EXISTS (SELECT 1 FROM unnest(p."oem_codes") c WHERE upper(regexp_replace(c, '[^[:alnum:]]', '', 'g')) = k)`;
        if (legacy.length) {
          const more = await tx.product.findMany({
            where: { id: { in: legacy.map((l) => l.id) } },
            include: { translations: true, numbers: true, vehicles: true, vehicleBrands: true, basePrice: { select: { id: true } }, brandImportChanges: { where: { importId }, select: { id: true } } },
          });
          for (const l of legacy) {
            const p = more.find((m) => m.id === l.id);
            if (p && !byKey.has(l.k) && ![...byKey.values()].includes(p)) byKey.set(l.k, p);
          }
        }
      }
      const unknownVehicles: Array<{ rowRef: string; partNumber: string; text: string }> = [];
      const fitmentOf = (r: { rowRef: string; values: BrandRowValues }) => {
        const out: Snapshot['vehicles'] = [];
        for (const f of r.values.fitments) {
          const m = matchFitment(f.text, lk.vehicles);
          if (m.kind === 'KNOWN') out.push({ vehicleId: m.vehicleId, modelId: m.modelId, yearFrom: f.yearFrom, yearTo: f.yearTo, note: null });
          else unknownVehicles.push({ rowRef: r.rowRef, partNumber: r.values.partNumber, text: f.text });
        }
        return [...new Map(out.map((v) => [`${v.vehicleId}:${v.modelId ?? ''}`, v])).values()];
      };
      const vehicleNames = (list: Snapshot['vehicles']) => list.flatMap((v) => {
        const veh = lk.vehicles.find((x) => x.id === v.vehicleId);
        const model = v.modelId ? veh?.models.find((m) => m.id === v.modelId) : null;
        return veh ? [veh.name, ...(model ? [`${veh.name} ${model.name}`] : [])] : [];
      });

      // ---- New parts (bulk) ----
      const fresh = rows.filter((r) => !byKey.has(r.values.partNumberKey));
      const freshKeys = new Set(fresh.map((r) => r.values.partNumberKey));
      const skus = new Set((await tx.product.findMany({ where: { sku: { in: fresh.map((r) => this.skuFor(lk, r.values.partNumber)) } }, select: { sku: true } })).map((p) => p.sku));
      const slugs = new Set<string>();
      const now = new Date();
      const products: Prisma.ProductCreateManyInput[] = [];
      const translations: Prisma.ProductTranslationCreateManyInput[] = [];
      const numbers: Prisma.ProductNumberCreateManyInput[] = [];
      const links: Prisma.ProductVehicleCreateManyInput[] = [];
      const brandLinks: Prisma.ProductVehicleBrandCreateManyInput[] = [];
      const changes: Prisma.BrandImportChangeCreateManyInput[] = [];
      for (const r of fresh) {
        const v = r.values;
        const productId = randomUUID();
        let sku = this.skuFor(lk, v.partNumber);
        for (let i = 2; skus.has(sku); i += 1) sku = `${this.skuFor(lk, v.partNumber).slice(0, 58)}-${i}`;
        skus.add(sku);
        let slug = slugify(`${lk.makerName} ${v.nameEn ?? ''} ${v.partNumber}`).slice(0, 110) || slugify(sku) || `part-${productId.slice(0, 8)}`;
        if (slugs.has(slug) || (await tx.product.findUnique({ where: { slug }, select: { id: true } }))) slug = `${slug.slice(0, 100)}-${productId.slice(0, 6)}`;
        slugs.add(slug);
        const vehicles = fitmentOf(r);
        const other = otherNumbers(v.partNumberKey, v.equivalents, v.replacements);
        const doc = buildSearchDocument([v.nameFa, v.nameEn, sku, v.partNumber, ...other.map((n) => n.number), ...vehicleNames(vehicles)]);
        const vehicleBrandId = v.vehicleBrand ? lk.vehicleBrandOf(v.vehicleBrand) : null;
        products.push({
          id: productId, sku, slug, categoryId: (v.category && lk.categoryOf(v.category)) || lk.otherCategoryId, manufacturerBrandId: lk.makerId,
          partType: options.partType, condition: 'NEW', origin: 'UNKNOWN', unitId: lk.unit.id, unit: lk.unit.name, oemCodes: [],
          specs: specsJson(v.specs), published: options.publish, publishedAt: options.publish ? now : null, isSellable: true,
          partNumber: v.partNumber, partNumberKey: v.partNumberKey, sourceBrandImportId: importId, searchText: doc.text, searchCompact: doc.compact,
          createdAt: now, updatedAt: now,
        });
        translations.push({ productId, locale: 'fa', name: v.nameFa, description: v.description, aliases: [] });
        if (v.nameEn) translations.push({ productId, locale: 'en', name: v.nameEn, aliases: [] });
        for (const n of other) numbers.push({ ...n, productId });
        for (const veh of vehicles) links.push({ ...veh, productId });
        if (vehicleBrandId) brandLinks.push({ productId, vehicleBrandId });
        changes.push({ importId, productId, action: 'CREATED' });
      }
      if (products.length) {
        await tx.product.createMany({ data: products });
        await tx.productTranslation.createMany({ data: translations });
        if (numbers.length) await tx.productNumber.createMany({ data: numbers, skipDuplicates: true });
        if (links.length) await tx.productVehicle.createMany({ data: links, skipDuplicates: true });
        if (brandLinks.length) await tx.productVehicleBrand.createMany({ data: brandLinks, skipDuplicates: true });
        await tx.brandImportChange.createMany({ data: changes, skipDuplicates: true });
      }

      // ---- Existing parts: complete the technical information only ----
      let updated = 0;
      let unchanged = 0;
      for (const r of rows.filter((x) => !freshKeys.has(x.values.partNumberKey) && byKey.has(x.values.partNumberKey))) {
        const p = byKey.get(r.values.partNumberKey)!;
        const v = r.values;
        const fa = p.translations.find((t) => t.locale === 'fa');
        const en = p.translations.find((t) => t.locale === 'en');
        // Parts this brand's imports made and nobody priced are fully refreshed; others are only completed.
        const own = p.sourceBrandImportId !== null && !p.basePrice;
        const before: Snapshot = {
          partNumber: p.partNumber, partNumberKey: p.partNumberKey,
          nameFa: fa?.name ?? null, nameEn: en?.name ?? null, descriptionFa: fa?.description ?? null, specs: p.specs, categoryId: p.categoryId,
          numbers: p.numbers.map((n) => ({ number: n.number, numberKey: n.numberKey, kind: n.kind, sortOrder: n.sortOrder })),
          vehicles: p.vehicles.map((x) => ({ vehicleId: x.vehicleId, modelId: x.modelId, yearFrom: x.yearFrom, yearTo: x.yearTo, note: x.note })),
          vehicleBrandIds: p.vehicleBrands.map((b) => b.vehicleBrandId),
        };
        let changed = false;
        const data: Prisma.ProductUpdateInput = {};
        if (!p.partNumberKey) { data.partNumber = v.partNumber; data.partNumberKey = v.partNumberKey; changed = true; }
        const labels = new Set(specLabels(p.specs));
        if (own && JSON.stringify(specsJson(v.specs)) !== JSON.stringify(p.specs)) { data.specs = specsJson(v.specs); changed = true; }
        else if (!own) {
          const add = v.specs.filter((s) => !labels.has(normalizeSearchText(s.label)));
          if (add.length) { data.specs = [...(Array.isArray(p.specs) ? p.specs : []), ...specsJson(add).map((s, i) => ({ ...s, key: `spec-${labels.size + i + 1}` }))] as Prisma.InputJsonValue; changed = true; }
        }
        const category = v.category ? lk.categoryOf(v.category) : null;
        if (category && category !== p.categoryId && (own || p.categoryId === lk.otherCategoryId)) { data.category = { connect: { id: category } }; changed = true; }
        if (own && fa && (fa.name !== v.nameFa || (v.description ?? null) !== fa.description)) {
          await tx.productTranslation.update({ where: { productId_locale: { productId: p.id, locale: 'fa' } }, data: { name: v.nameFa, description: v.description } });
          changed = true;
        } else if (!own && fa && !fa.description && v.description) {
          await tx.productTranslation.update({ where: { productId_locale: { productId: p.id, locale: 'fa' } }, data: { description: v.description } });
          changed = true;
        }
        if (v.nameEn && (!en || (own && en.name !== v.nameEn))) {
          await tx.productTranslation.upsert({ where: { productId_locale: { productId: p.id, locale: 'en' } }, create: { productId: p.id, locale: 'en', name: v.nameEn, aliases: [] }, update: { name: v.nameEn } });
          changed = true;
        }
        const haveNumbers = new Set([p.partNumberKey, ...p.numbers.map((n) => n.numberKey)]);
        const addNumbers = otherNumbers(p.partNumberKey, v.equivalents, v.replacements).filter((n) => !haveNumbers.has(n.numberKey));
        if (addNumbers.length) {
          await tx.productNumber.createMany({ data: addNumbers.map((n) => ({ ...n, sortOrder: p.numbers.length + n.sortOrder, productId: p.id })), skipDuplicates: true });
          changed = true;
        }
        const haveVehicles = new Set(p.vehicles.map((x) => `${x.vehicleId}:${x.modelId ?? ''}`));
        const addVehicles = fitmentOf(r).filter((x) => !haveVehicles.has(`${x.vehicleId}:${x.modelId ?? ''}`));
        if (addVehicles.length) {
          await tx.productVehicle.createMany({ data: addVehicles.map((x) => ({ ...x, productId: p.id })), skipDuplicates: true });
          changed = true;
        }
        const vehicleBrandId = v.vehicleBrand ? lk.vehicleBrandOf(v.vehicleBrand) : null;
        if (vehicleBrandId && !before.vehicleBrandIds.includes(vehicleBrandId)) {
          await tx.productVehicleBrand.create({ data: { productId: p.id, vehicleBrandId } });
          changed = true;
        }
        if (!changed) { unchanged += 1; continue; }
        if (Object.keys(data).length) await tx.product.update({ where: { id: p.id }, data: { ...data, version: { increment: 1 } } });
        // The state before this import's first change to the part (a rerun after a crash keeps the original).
        if (!p.brandImportChanges.length) await tx.brandImportChange.create({ data: { importId, productId: p.id, action: 'UPDATED', before: before as unknown as Prisma.InputJsonValue } });
        await rebuildProductSearch(tx, p.id);
        updated += 1;
      }
      return { created: products.length, updated, unchanged, unknownVehicles };
    }, { timeoutMs: 300_000 });
  }

  /** «TOYOTA-04465-33471»: the maker's name and the number (Latin letters, digits and dashes). */
  private skuFor(lk: Lookups, partNumber: string): string {
    const clean = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const maker = clean(lk.makerName).slice(0, 12) || 'BRAND';
    return `${maker}-${clean(partNumber) || randomUUID().slice(0, 8).toUpperCase()}`.slice(0, 60);
  }

  /**
   * «برگرداندن این ورود»: parts it created are deleted (or archived when they were sold, priced,
   * stocked or photographed meanwhile); parts it updated get their technical fields back.
   */
  async undo(id: string): Promise<void> {
    const imp = await this.prisma.brandImport.findUnique({ where: { id } });
    if (!imp || imp.status !== 'ROLLING_BACK') return;
    const result = { deleted: 0, archived: 0, restored: 0 };
    for (;;) {
      const changes = await this.prisma.brandImportChange.findMany({ where: { importId: id }, take: BATCH, orderBy: { createdAt: 'asc' } });
      if (!changes.length) break;
      await this.prisma.tx(async (tx) => {
        await tx.$executeRaw`SET LOCAL hedax.allow_product_delete = 'on'`;
        for (const c of changes) {
          if (c.action === 'CREATED') {
            const p = await tx.product.findUnique({
              where: { id: c.productId },
              select: {
                id: true, basePrice: { select: { id: true } },
                _count: { select: { orderItems: true, cartItems: true, media: true, priceRules: true, movements: true, reservations: true } },
                inventory: { select: { onHand: true } },
              },
            });
            if (!p) continue;
            const used = p.basePrice || Object.values(p._count).some((n) => n > 0) || p.inventory.some((i) => i.onHand !== 0);
            if (used) {
              await tx.product.update({ where: { id: p.id }, data: { archivedAt: new Date(), published: false, partNumberKey: null, sourceBrandImportId: null, version: { increment: 1 } } });
              result.archived += 1;
            } else {
              await tx.brandImportChange.deleteMany({ where: { productId: p.id } });
              await tx.inventoryBalance.deleteMany({ where: { productId: p.id } });
              await tx.product.delete({ where: { id: p.id } });
              result.deleted += 1;
            }
          } else {
            const b = c.before as unknown as Snapshot | null;
            if (b) {
              await tx.product.update({ where: { id: c.productId }, data: { specs: (b.specs ?? []) as Prisma.InputJsonValue, categoryId: b.categoryId, ...(b.partNumberKey === null ? { partNumber: null, partNumberKey: null } : {}), version: { increment: 1 } } });
              if (b.nameFa !== null) await tx.productTranslation.updateMany({ where: { productId: c.productId, locale: 'fa' }, data: { name: b.nameFa, description: b.descriptionFa } });
              if (b.nameEn === null) await tx.productTranslation.deleteMany({ where: { productId: c.productId, locale: 'en' } });
              else await tx.productTranslation.updateMany({ where: { productId: c.productId, locale: 'en' }, data: { name: b.nameEn } });
              await tx.productNumber.deleteMany({ where: { productId: c.productId } });
              if (b.numbers.length) await tx.productNumber.createMany({ data: b.numbers.map((n) => ({ ...n, productId: c.productId })) });
              await tx.productVehicle.deleteMany({ where: { productId: c.productId } });
              if (b.vehicles.length) await tx.productVehicle.createMany({ data: b.vehicles.map((v) => ({ ...v, productId: c.productId })) });
              await tx.productVehicleBrand.deleteMany({ where: { productId: c.productId } });
              if (b.vehicleBrandIds.length) await tx.productVehicleBrand.createMany({ data: b.vehicleBrandIds.map((vehicleBrandId) => ({ productId: c.productId, vehicleBrandId })) });
              await rebuildProductSearch(tx, c.productId);
              result.restored += 1;
            }
            await tx.brandImportChange.delete({ where: { id: c.id } });
          }
        }
        await tx.brandImport.update({ where: { id }, data: { stats: { ...((imp.stats as object | null) ?? {}), ...result } } });
      }, { timeoutMs: 300_000 });
    }
    await this.prisma.tx(async (tx) => {
      await tx.brandImport.update({ where: { id }, data: { status: 'ROLLED_BACK', rolledBackAt: new Date(), stats: { ...((imp.stats as object | null) ?? {}), ...result } } });
      await this.audit.record(tx, { action: 'brand_import.rolled_back', entityType: 'brand_import', entityId: id, actorKind: 'SYSTEM', after: result });
    });
    this.publicCache.invalidate();
  }
}
