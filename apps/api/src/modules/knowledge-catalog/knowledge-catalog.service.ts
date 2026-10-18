import { Inject, Injectable } from '@nestjs/common';
import type { CatalogDocumentStatus, CatalogDocumentView, PartDraftView } from '@hedax/contracts';
import { matchFitment, partNumberKey, splitVehicleList } from '@hedax/domain';
import { AuditService } from '../../common/audit.service.js';
import { badRequest, conflict, notFound } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import { OutboxService } from '../../common/outbox.service.js';
import { STORAGE, type StorageDriver } from '../../common/storage/storage.js';
import { extractCatalogRows } from './catalog-extraction.js';
import type { Actor } from '../../common/request-context.js';
import type { Prisma } from '../../generated/prisma/client.js';

// Reference files: factory catalogs (PDF, Excel, CSV) and photos of catalog pages.
const ALLOWED = ['pdf', 'xlsx', 'csv', 'jpg', 'jpeg', 'png', 'webp'] as const;
type CatalogRow = Prisma.CatalogDocumentGetPayload<{ include: { attachment: true; uploader: { select: { id: true; fullName: true; email: true } } } }>;

@Injectable()
export class KnowledgeCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    @Inject(STORAGE) private readonly storage: StorageDriver,
  ) {}

  private view(row: CatalogRow): CatalogDocumentView {
    return {
      id: row.id, title: row.title, version: row.version, status: row.status,
      filename: row.attachment.originalFilename, extension: row.attachment.extension as CatalogDocumentView['extension'],
      sizeBytes: row.attachment.sizeBytes, sha256: row.attachment.sha256 as string,
      uploadedBy: { id: row.uploader.id, name: row.uploader.fullName, email: row.uploader.email },
      uploadedAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
      processingError: row.processingError, processedAt: row.processedAt?.toISOString() ?? null,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      downloadUrl: `/api/v1/attachments/${row.attachmentId}/download`,
    };
  }

  async list(): Promise<CatalogDocumentView[]> {
    const rows = await this.prisma.catalogDocument.findMany({
      include: { attachment: true, uploader: { select: { id: true, fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' }, take: 200,
    });
    return rows.map((row) => this.view(row));
  }

  async create(actor: Actor, input: { attachmentId: string; title: string; version: string }): Promise<CatalogDocumentView> {
    const attachment = await this.prisma.attachment.findFirst({ where: { id: input.attachmentId, ownerId: actor.userId, purpose: 'KNOWLEDGE_CATALOG', deletedAt: null } });
    if (!attachment) throw notFound();
    if (attachment.status !== 'READY') throw conflict('FILE_NOT_READY', 'The file is still being checked');
    if (!(ALLOWED as readonly string[]).includes(attachment.extension)) throw badRequest('CATALOG_FORMAT_NOT_ALLOWED');
    const row = await this.prisma.tx(async (tx) => {
      const created = await tx.catalogDocument.create({ data: { attachmentId: attachment.id, uploaderId: actor.userId, title: input.title, version: input.version } });
      await tx.attachment.update({ where: { id: attachment.id }, data: { subjectType: 'CATALOG_DOCUMENT', subjectId: created.id } });
      await this.audit.record(tx, { action: 'catalog_document.created', entityType: 'catalog_document', entityId: created.id, after: { title: created.title, version: created.version, status: created.status, filename: attachment.originalFilename } });
      return tx.catalogDocument.findUniqueOrThrow({ where: { id: created.id }, include: { attachment: true, uploader: { select: { id: true, fullName: true, email: true } } } });
    });
    return this.view(row);
  }

  /** Queue extraction only for safe, registered files. Repeated clicks cannot enqueue while pending. */
  async requestExtraction(id: string): Promise<{ status: string }> {
    return this.prisma.tx(async (tx) => {
      const row = await tx.catalogDocument.findUnique({ where: { id }, include: { attachment: true } });
      if (!row) throw notFound();
      if (row.attachment.status !== 'READY' || row.attachment.deletedAt) throw conflict('FILE_NOT_READY');
      if (row.status === 'APPROVED' || row.status === 'REJECTED') throw conflict('CATALOG_LOCKED');
      if (row.status === 'PENDING_PROCESSING') return { status: row.status };
      await tx.catalogDocument.update({ where: { id }, data: { status: 'PENDING_PROCESSING', processingError: null } });
      await this.outbox.enqueue(tx, {
        type: 'catalog.extract', aggregateType: 'catalog_document', aggregateId: id,
        payload: { documentId: id }, dedupeKey: `catalog-extract:${id}:${Date.now()}`,
      });
      await this.audit.record(tx, { action: 'catalog_document.status_changed', entityType: 'catalog_document', entityId: id, before: { status: row.status }, after: { status: 'PENDING_PROCESSING' } });
      return { status: 'PENDING_PROCESSING' };
    });
  }

  /** Worker-only. Extracts untrusted candidates; NEVER publishes product or fitment claims. */
  async extract(id: string): Promise<void> {
    const row = await this.prisma.catalogDocument.findUnique({ where: { id }, include: { attachment: true } });
    if (!row || row.status !== 'PENDING_PROCESSING') return;
    try {
      if (row.attachment.status !== 'READY' || row.attachment.deletedAt) throw new Error('CATALOG_FILE_NOT_READY');
      const bytes = await this.storage.readPrivate(row.attachment.storageKey);
      if (bytes.length > 20 * 1024 * 1024) throw new Error('CATALOG_TOO_LARGE');
      const result = await extractCatalogRows(bytes, row.attachment.extension);
      await this.prisma.tx(async (tx) => {
        const current = await tx.catalogDocument.findUnique({ where: { id } });
        if (current?.status !== 'PENDING_PROCESSING') return;
        await tx.catalogDocumentChunk.deleteMany({ where: { documentId: id } });
        for (let i = 0; i < result.chunks.length; i += 100) {
          await tx.catalogDocumentChunk.createMany({
            data: result.chunks.slice(i, i + 100).map((chunk) => ({
              documentId: id, ordinal: chunk.ordinal, contentText: chunk.contentText,
              rowStart: chunk.rowStart, rowEnd: chunk.rowEnd, metadata: chunk.metadata,
            })),
          });
        }
        await tx.catalogDocument.update({
          where: { id }, data: {
            status: 'NEEDS_REVIEW', processedAt: new Date(),
            processingError: result.truncated ? 'CATALOG_PREVIEW_TRUNCATED_2000_ROWS' : null,
          },
        });
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 500) : 'CATALOG_EXTRACTION_FAILED';
      await this.prisma.catalogDocument.updateMany({
        where: { id, status: 'PENDING_PROCESSING' },
        data: { status: 'NEEDS_REVIEW', processingError: reason, processedAt: new Date() },
      });
    }
  }

  /** Restricted by controller RBAC; these are unapproved candidate records, not customer-facing RAG. */
  /**
   * «تبدیل به قطعه»: the part form filled from one extracted row. Vehicles are matched to the panel's
   * list only; anything else is listed so it can be added by hand. Nothing is saved here.
   */
  async partDraft(id: string, ordinal: number): Promise<PartDraftView> {
    const chunk = await this.prisma.catalogDocumentChunk.findUnique({ where: { documentId_ordinal: { documentId: id, ordinal } } });
    if (!chunk) throw notFound();
    const meta = (chunk.metadata ?? {}) as { candidatePartNumber?: string | null; candidatePartName?: string | null; candidateVehicle?: string | null };
    const partNumber = (meta.candidatePartNumber ?? '').trim().slice(0, 80);
    const known = await this.prisma.vehicle.findMany({ where: { active: true }, include: { models: { where: { active: true } } } });
    const vehicles: PartDraftView['vehicles'] = [];
    const unmatchedVehicles: string[] = [];
    for (const text of splitVehicleList(meta.candidateVehicle ?? '')) {
      const m = matchFitment(text, known);
      if (m.kind === 'KNOWN') vehicles.push({ vehicleId: m.vehicleId, modelId: m.modelId, vehicleName: m.vehicleName, modelName: m.modelName });
      else unmatchedVehicles.push(text);
    }
    const key = partNumberKey(partNumber);
    const existing = key
      ? await this.prisma.product.findFirst({ where: { archivedAt: null, OR: [{ partNumberKey: key }, { numbers: { some: { numberKey: key } } }] }, select: { id: true } })
      : null;
    return { partNumber, nameFa: (meta.candidatePartName ?? '').trim().slice(0, 200), vehicles, unmatchedVehicles, existingProductId: existing?.id ?? null };
  }

  async preview(id: string): Promise<Array<{ ordinal: number; contentText: string; rowStart: number | null; metadata: Prisma.JsonValue }>> {
    const row = await this.prisma.catalogDocument.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw notFound();
    return this.prisma.catalogDocumentChunk.findMany({
      where: { documentId: id }, orderBy: { ordinal: 'asc' }, take: 100,
      select: { ordinal: true, contentText: true, rowStart: true, metadata: true },
    });
  }

  async updateStatus(id: string, status: CatalogDocumentStatus, note?: string): Promise<CatalogDocumentView> {
    const row = await this.prisma.tx(async (tx) => {
      const before = await tx.catalogDocument.findUnique({ where: { id } });
      if (!before) throw notFound();
      const updated = await tx.catalogDocument.update({
        where: { id },
        data: {
          status,
          processingError: status === 'REJECTED' || status === 'NEEDS_REVIEW' ? (note ?? null) : null,
          processedAt: ['NEEDS_REVIEW', 'APPROVED', 'REJECTED'].includes(status) ? new Date() : null,
          approvedAt: status === 'APPROVED' ? new Date() : null,
        },
        include: { attachment: true, uploader: { select: { id: true, fullName: true, email: true } } },
      });
      await this.audit.record(tx, { action: 'catalog_document.status_changed', entityType: 'catalog_document', entityId: id, before: { status: before.status }, after: { status, note } });
      return updated;
    });
    return this.view(row);
  }
}
