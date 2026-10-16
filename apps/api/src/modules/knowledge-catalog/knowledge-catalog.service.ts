import { Injectable } from '@nestjs/common';
import type { CatalogDocumentStatus, CatalogDocumentView } from '@hedax/contracts';
import { AuditService } from '../../common/audit.service.js';
import { badRequest, conflict, notFound } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Actor } from '../../common/request-context.js';
import type { Prisma } from '../../generated/prisma/client.js';

const ALLOWED = ['pdf', 'xlsx', 'csv'] as const;
type CatalogRow = Prisma.CatalogDocumentGetPayload<{ include: { attachment: true; uploader: { select: { id: true; fullName: true; email: true } } } }>;

@Injectable()
export class KnowledgeCatalogService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

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
