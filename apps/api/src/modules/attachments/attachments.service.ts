import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { AttachmentView, UploadPolicyView } from '@hedax/contracts';
import { DEFAULT_UPLOAD_POLICY, IMAGE_KINDS, type FileKind, checkBatch, inspectFile, sanitizeDisplayFilename } from '@hedax/domain';
import type { Attachment, AttachmentPurpose } from '../../generated/prisma/client.js';
import { badRequest, forbidden, notFound } from '../../common/errors.js';
import { OutboxService } from '../../common/outbox.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { LIMITS, RateLimitService } from '../../common/rate-limit.service.js';
import type { Actor } from '../../common/request-context.js';
import { SCANNER, type MalwareScanner } from '../../common/storage/scanner.js';
import { STORAGE, type StorageDriver } from '../../common/storage/storage.js';

export interface UploadedFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

const ACCEPTED = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'docx', 'xlsx', 'csv', 'doc', 'xls'];
const PER_USER_QUOTA_BYTES = 2 * 1024 * 1024 * 1024; // disk quota per account (spec §14)

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly limits: RateLimitService,
    @Inject(STORAGE) private readonly storage: StorageDriver,
    @Inject(SCANNER) private readonly scanner: MalwareScanner,
  ) {}

  policy(): UploadPolicyView {
    return {
      maxFiles: DEFAULT_UPLOAD_POLICY.maxFilesPerBatch,
      maxFileBytes: DEFAULT_UPLOAD_POLICY.maxFileBytes,
      maxBatchBytes: DEFAULT_UPLOAD_POLICY.maxBatchBytes,
      acceptedExtensions: ACCEPTED,
      importExtensions: ['xlsx', 'csv'],
    };
  }

  view(a: Attachment, canDownload: boolean): AttachmentView {
    return {
      id: a.id,
      filename: a.originalFilename,
      sizeBytes: a.sizeBytes,
      mime: a.detectedMime,
      status: a.status,
      rejectReason: a.rejectReason,
      downloadUrl: canDownload && a.status === 'READY' ? `/api/v1/attachments/${a.id}/download` : null,
    };
  }

  /**
   * Validates size, extension, real content and structure on the server, then
   * stores accepted files under random keys in the private store with status
   * SCANNING. Nothing is downloadable until the scanner marks it READY.
   */
  async upload(actor: Actor, purpose: AttachmentPurpose, files: UploadedFile[]): Promise<AttachmentView[]> {
    await this.limits.hit(LIMITS.uploadPerUser, actor.userId);
    if (files.length === 0) throw badRequest('FILE_REQUIRED');
    const batch = checkBatch(files.map((f) => ({ size: f.size })));
    if (!batch.ok) throw badRequest(batch.reason, 'Upload limits exceeded');
    if (purpose === 'IMPORT' && !actor.permissions.has('imports.run')) throw forbidden();
    const used = await this.prisma.attachment.aggregate({ where: { ownerId: actor.userId, deletedAt: null }, _sum: { sizeBytes: true } });
    if ((used._sum.sizeBytes ?? 0) + files.reduce((s, f) => s + f.size, 0) > PER_USER_QUOTA_BYTES) throw badRequest('QUOTA_EXCEEDED');

    const out: AttachmentView[] = [];
    for (const file of files) {
      const filename = sanitizeDisplayFilename(file.originalname);
      const inspection = inspectFile(filename, new Uint8Array(file.buffer));
      const importOnly = purpose === 'IMPORT' && inspection.kind && !['xlsx', 'csv'].includes(inspection.kind);
      const key = `att/${new Date().toISOString().slice(0, 7).replace('-', '/')}/${randomUUID()}.${inspection.extension || 'bin'}`;
      if (inspection.verdict === 'REJECT' || importOnly) {
        const rejected = await this.prisma.attachment.create({
          data: {
            ownerId: actor.userId, purpose, status: 'REJECTED', storageKey: key, originalFilename: filename,
            extension: inspection.extension.slice(0, 10), sizeBytes: Math.max(file.size, 1),
            rejectReason: importOnly ? 'IMPORT_FORMAT_NOT_ALLOWED' : (inspection.reason ?? 'REJECTED'),
          },
        });
        out.push(this.view(rejected, false));
        continue;
      }
      const sha256 = createHash('sha256').update(file.buffer).digest('hex');
      await this.storage.putPrivate(key, file.buffer, 'application/octet-stream');
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.attachment.create({
          data: {
            ownerId: actor.userId, purpose, status: 'SCANNING', storageKey: key, originalFilename: filename, extension: inspection.extension,
            detectedMime: inspection.mime, sizeBytes: file.size, sha256, legacyOffice: inspection.flags.legacyOffice,
          },
        });
        await this.outbox.enqueue(tx, { type: 'attachment.scan', aggregateType: 'attachment', aggregateId: row.id, payload: { attachmentId: row.id }, dedupeKey: `scan:${row.id}` });
        return row;
      });
      out.push(this.view(created, false));
    }
    return out;
  }

  /**
   * Worker step: malware scan, then images are re-encoded (EXIF stripped,
   * orientation applied) before the file becomes READY.
   */
  async scan(attachmentId: string): Promise<void> {
    const a = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!a || a.status !== 'SCANNING') return;
    const bytes = await this.storage.readPrivate(a.storageKey);
    let result;
    try {
      result = await this.scanner.scan(bytes);
    } catch (e) {
      // Scanner unavailable or file unscannable: keep quarantined; the outbox retries.
      this.logger.warn(`scan failed for ${attachmentId}: ${e instanceof Error ? e.message : 'unknown'}`);
      throw e;
    }
    if (!result.clean) {
      await this.storage.deletePrivate(a.storageKey).catch(() => undefined);
      await this.prisma.attachment.update({ where: { id: a.id }, data: { status: 'REJECTED', rejectReason: 'MALWARE_DETECTED', scanEngine: result.engine, scannedAt: new Date() } });
      return;
    }
    let finalBytes = bytes;
    let mime = a.detectedMime;
    const kind = a.extension === 'jpg' ? 'jpeg' : (a.extension as FileKind);
    if (IMAGE_KINDS.includes(kind)) {
      try {
        finalBytes = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
        mime = 'image/webp';
        await this.storage.putPrivate(a.storageKey, finalBytes, mime);
      } catch {
        await this.prisma.attachment.update({ where: { id: a.id }, data: { status: 'REJECTED', rejectReason: 'IMAGE_UNREADABLE', scannedAt: new Date() } });
        return;
      }
    }
    await this.prisma.attachment.update({
      where: { id: a.id },
      data: { status: 'READY', scanEngine: result.engine, scannedAt: new Date(), detectedMime: mime, sizeBytes: finalBytes.length, sha256: createHash('sha256').update(finalBytes).digest('hex') },
    });
  }

  /** Object-level authorization for a file (A17). Knowing an id grants nothing. */
  async canAccess(actor: Actor, a: Attachment): Promise<boolean> {
    if (a.deletedAt || a.status === 'DELETED') return false;
    if (a.ownerId === actor.userId) return true;
    const link = await this.prisma.messageAttachment.findUnique({ where: { attachmentId: a.id }, include: { message: { include: { conversation: true } } } });
    if (link) {
      const conv = link.message.conversation;
      if (actor.kind === 'CUSTOMER') return conv.customerId === actor.userId;
      if (actor.permissions.has('conversations.read.all')) return true;
      return actor.permissions.has('conversations.read.assigned') && conv.assigneeId === actor.userId;
    }
    if (a.subjectType === 'SOURCING_REQUEST' && a.subjectId) {
      const req = await this.prisma.sourcingRequest.findUnique({ where: { id: a.subjectId } });
      if (!req) return false;
      if (actor.kind === 'CUSTOMER') return req.customerId === actor.userId;
      return actor.permissions.has('sourcing.read.all') || (actor.permissions.has('sourcing.read.assigned') && req.assigneeId === actor.userId);
    }
    if (a.subjectType === 'QUOTE_VERSION' && a.subjectId) {
      const qv = await this.prisma.quoteVersion.findUnique({ where: { id: a.subjectId }, include: { quote: true } });
      if (!qv) return false;
      if (actor.kind === 'CUSTOMER') return qv.quote.customerId === actor.userId && qv.status !== 'DRAFT';
      return actor.permissions.has('quotes.write') || actor.permissions.has('sourcing.read.all');
    }
    if (actor.kind !== 'STAFF') return false;
    if (a.subjectType === 'BUSINESS_VERIFICATION') return actor.permissions.has('customers.read');
    if (a.subjectType === 'RETURN_REQUEST') return actor.permissions.has('returns.manage');
    if (a.purpose === 'IMPORT' || a.purpose === 'IMPORT_REPORT' || a.purpose === 'EXPORT') return actor.permissions.has('imports.run') || actor.permissions.has('exports.run');
    return false;
  }

  async getAuthorized(actor: Actor, id: string): Promise<Attachment> {
    const a = await this.prisma.attachment.findUnique({ where: { id } });
    if (!a || !(await this.canAccess(actor, a))) throw notFound();
    return a;
  }

  /** Validates that the sender owns the files and they are usable, before linking them to anything. */
  async assertOwnedUsable(actorId: string, ids: string[]): Promise<Attachment[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.attachment.findMany({ where: { id: { in: ids }, ownerId: actorId, deletedAt: null, status: { in: ['SCANNING', 'READY'] } } });
    if (rows.length !== new Set(ids).size) throw badRequest('ATTACHMENT_INVALID', 'One or more files are missing, rejected or not yours');
    return rows;
  }

  async delete(actor: Actor, id: string): Promise<void> {
    const a = await this.prisma.attachment.findFirst({ where: { id, ownerId: actor.userId, deletedAt: null } });
    if (!a) throw notFound();
    await this.prisma.attachment.update({ where: { id }, data: { status: 'DELETED', deletedAt: new Date() } });
    // Immediately unreachable; message/financial records keep only metadata.
    await this.storage.deletePrivate(a.storageKey).catch(() => undefined);
  }

  async open(a: Attachment) {
    const signed = await this.storage.signedPrivateUrl(a.storageKey, a.originalFilename, 60);
    if (signed) return { kind: 'redirect' as const, url: signed };
    return { kind: 'stream' as const, stream: await this.storage.getPrivate(a.storageKey) };
  }
}
