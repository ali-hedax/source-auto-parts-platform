import { describe, expect, it, vi } from 'vitest';
import { KnowledgeCatalogService } from '../../src/modules/knowledge-catalog/knowledge-catalog.service.js';

const actor = { userId: '0192f3a0-0000-7000-8000-000000000001', kind: 'STAFF', permissions: new Set(['imports.run']), isOwner: true } as const;

describe('knowledge catalog service', () => {
  it('does not register a quarantined file', async () => {
    const prisma = { attachment: { findFirst: vi.fn().mockResolvedValue({ status: 'SCANNING', extension: 'pdf' }) } };
    const service = new KnowledgeCatalogService(prisma as never, { record: vi.fn() } as never);
    await expect(service.create(actor as never, { attachmentId: '0192f3a0-0000-7000-8000-000000000002', title: 'Catalog', version: '1' })).rejects.toMatchObject({ code: 'FILE_NOT_READY' });
  });

  it('records metadata, links the private attachment and writes an audit entry', async () => {
    const now = new Date('2026-10-16T10:00:00.000Z');
    const attachment = {
      id: '0192f3a0-0000-7000-8000-000000000002', status: 'READY', extension: 'pdf', originalFilename: 'parts.pdf',
      sizeBytes: 123, sha256: 'a'.repeat(64),
    };
    const created = { id: '0192f3a0-0000-7000-8000-000000000003', attachmentId: attachment.id, uploaderId: actor.userId, title: 'Parts', version: '3', status: 'UPLOADED', processingError: null, processedAt: null, approvedAt: null, createdAt: now, updatedAt: now };
    const full = { ...created, attachment, uploader: { id: actor.userId, fullName: 'Owner', email: 'owner@example.test' } };
    const tx = {
      catalogDocument: { create: vi.fn().mockResolvedValue(created), findUniqueOrThrow: vi.fn().mockResolvedValue(full) },
      attachment: { update: vi.fn().mockResolvedValue(attachment) },
    };
    const prisma = {
      attachment: { findFirst: vi.fn().mockResolvedValue(attachment) },
      tx: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new KnowledgeCatalogService(prisma as never, audit as never);

    const result = await service.create(actor as never, { attachmentId: attachment.id, title: 'Parts', version: '3' });
    expect(result).toMatchObject({ title: 'Parts', version: '3', status: 'UPLOADED', extension: 'pdf', sha256: 'a'.repeat(64) });
    expect(tx.attachment.update).toHaveBeenCalledWith({ where: { id: attachment.id }, data: { subjectType: 'CATALOG_DOCUMENT', subjectId: created.id } });
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'catalog_document.created', entityId: created.id }));
  });
});
