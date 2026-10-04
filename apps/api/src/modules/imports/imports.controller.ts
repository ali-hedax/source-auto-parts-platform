import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IDEMPOTENCY_HEADER, importCommitSchema, importStartSchema } from '@hedax/contracts';
import { z } from 'zod';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators.js';
import type { Actor } from '../../common/request-context.js';
import { ApiZodBody, zod } from '../../common/zod.js';
import { ImportsService } from './imports.service.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function sendXlsx(res: Response, filename: string, body: Buffer): void {
  res.setHeader('Content-Type', XLSX);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(body);
}

/** Upload (via /attachments purpose=IMPORT) → start → preview → commit. */
@ApiTags('admin/imports')
@Controller('admin')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @RequirePermissions('imports.run')
  @Get('imports/template')
  async template(@Res() res: Response) {
    sendXlsx(res, 'hedax-products-template.xlsx', await this.imports.template());
  }

  @RequirePermissions('imports.run', 'inventory.adjust', 'prices.write', 'products.write')
  @Post('imports')
  @ApiZodBody(importStartSchema)
  start(@CurrentActor() actor: Actor, @Headers(IDEMPOTENCY_HEADER.toLowerCase()) key: string | undefined, @Body(zod(importStartSchema)) body: z.infer<typeof importStartSchema>) {
    return this.imports.start(actor, {
      attachmentId: body.attachmentId, mode: body.mode, clearWhenEmpty: body.clearWhenEmpty, manufacturerBrandMapping: body.manufacturerBrandMapping,
      ...(body.columnMapping ? { columnMapping: body.columnMapping } : {}),
    }, key);
  }

  @RequirePermissions('imports.run')
  @Get('imports/:id')
  preview(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Query('page') page?: string) {
    return this.imports.preview(actor, id, Math.max(1, Number.parseInt(page ?? '1', 10) || 1));
  }

  @RequirePermissions('imports.run')
  @Get('imports/:id/errors.xlsx')
  async errors(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response, @Query('locale') locale?: string) {
    sendXlsx(res, `import-${id.slice(0, 8)}-errors.xlsx`, await this.imports.errorReport(actor, id, locale === 'en' ? 'en' : 'fa'));
  }

  /** Nothing is applied if any row has an error or any product changed since the preview. */
  @RequirePermissions('imports.run', 'inventory.adjust', 'prices.write', 'products.write')
  @Post('imports/:id/commit')
  commit(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(importCommitSchema.omit({ jobId: true }))) body: { planChecksum: string }) {
    return this.imports.requestCommit(actor, id, body.planChecksum);
  }

  @RequirePermissions('exports.run')
  @Get('exports/products.xlsx')
  async export(@CurrentActor() actor: Actor, @Res() res: Response) {
    sendXlsx(res, `hedax-products-${new Date().toISOString().slice(0, 10)}.xlsx`, await this.imports.export(actor));
  }
}
