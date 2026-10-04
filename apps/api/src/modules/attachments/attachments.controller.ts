import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { MB } from '@hedax/domain';
import { z } from 'zod';
import { CurrentActor, Public } from '../../common/auth/decorators.js';
import type { Actor } from '../../common/request-context.js';
import { AttachmentsService } from './attachments.service.js';

const purposeSchema = z.object({
  purpose: z.enum(['MESSAGE', 'SOURCING_REQUEST', 'RETURN_REQUEST', 'BUSINESS_VERIFICATION', 'IMPORT']),
});

@ApiTags('attachments')
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  /** Limits and accepted formats, shown before the user picks files. */
  @Public()
  @Get('policy')
  policy() {
    return this.attachments.policy();
  }

  /** multipart/form-data: purpose + files[] (≤10, ≤20MB each, ≤50MB total). */
  @Post()
  @UseInterceptors(FilesInterceptor('files', 10, { storage: memoryStorage(), limits: { fileSize: 20 * MB, files: 10, fields: 5 } }))
  upload(@CurrentActor() actor: Actor, @UploadedFiles() files: Express.Multer.File[] | undefined, @Body() body: Record<string, unknown>) {
    const { purpose } = purposeSchema.parse(body);
    return this.attachments.upload(actor, purpose, (files ?? []).map((f) => ({ originalname: f.originalname, size: f.size, buffer: f.buffer })));
  }

  @Get(':id')
  async get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    const a = await this.attachments.getAuthorized(actor, id);
    return this.attachments.view(a, true);
  }

  /**
   * Authorized download of a READY file. Documents are always sent as
   * attachments (never rendered); images are re-encoded and may display inline.
   */
  @Get(':id/download')
  async download(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const a = await this.attachments.getAuthorized(actor, id);
    if (a.status !== 'READY') {
      res.status(409).json({ error: { code: 'FILE_NOT_READY', message: 'The file is not available', requestId: res.getHeader('X-Request-Id') ?? '' } });
      return;
    }
    const opened = await this.attachments.open(a);
    if (opened.kind === 'redirect') {
      res.redirect(302, opened.url);
      return;
    }
    const isImage = a.detectedMime?.startsWith('image/') ?? false;
    res.setHeader('Content-Type', isImage ? (a.detectedMime as string) : 'application/octet-stream');
    res.setHeader('Content-Disposition', `${isImage ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.originalFilename)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, no-store');
    opened.stream.pipe(res);
  }

  @Delete(':id')
  async remove(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    await this.attachments.delete(actor, id);
    return { deleted: true };
  }
}
