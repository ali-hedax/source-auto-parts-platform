import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IDEMPOTENCY_HEADER, importCommitSchema, importInspectSchema, importRowFilterSchema, importSettingsSchema, importStartSchema } from '@hedax/contracts';
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

const viewQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  filter: importRowFilterSchema.default('all'),
});
const productsQuery = z.object({
  page: z.coerce.number().int().min(1).max(1_000).default(1),
  q: z.string().trim().max(80).optional(),
  noPhoto: z.enum(['1', '0']).optional(),
});
const commitBody = importCommitSchema.omit({ jobId: true });

/**
 * Upload (via /attachments purpose=IMPORT) → inspect (sheets, first rows) → settings (sheet, header row,
 * columns, units, stock mode) → preview → commit. Previewing needs imports.run only; applying also needs
 * the permissions of what the plan changes (products.write, prices.write, inventory.adjust).
 */
@ApiTags('admin/imports')
@Controller('admin')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @RequirePermissions('imports.run')
  @Get('imports/template')
  async template(@Res() res: Response) {
    sendXlsx(res, 'hedax-products-template.xlsx', await this.imports.template());
  }

  @RequirePermissions('imports.run')
  @Get('imports')
  list(@CurrentActor() actor: Actor) {
    return this.imports.list(actor);
  }

  /** One-step import: first sheet, headers in row 1 recognized by name. */
  @RequirePermissions('imports.run')
  @Post('imports')
  @ApiZodBody(importStartSchema)
  start(@CurrentActor() actor: Actor, @Headers(IDEMPOTENCY_HEADER.toLowerCase()) key: string | undefined, @Body(zod(importStartSchema)) body: z.infer<typeof importStartSchema>) {
    return this.imports.start(actor, {
      attachmentId: body.attachmentId, mode: body.mode, clearWhenEmpty: body.clearWhenEmpty, manufacturerBrandMapping: body.manufacturerBrandMapping,
      ...(body.columnMapping ? { columnMapping: body.columnMapping } : {}),
    }, key);
  }

  @RequirePermissions('imports.run')
  @Post('imports/inspect')
  @ApiZodBody(importInspectSchema)
  inspect(@CurrentActor() actor: Actor, @Headers(IDEMPOTENCY_HEADER.toLowerCase()) key: string | undefined, @Body(zod(importInspectSchema)) body: z.infer<typeof importInspectSchema>) {
    return this.imports.inspect(actor, body.attachmentId, key);
  }

  @RequirePermissions('imports.run')
  @Put('imports/:id/settings')
  @ApiZodBody(importSettingsSchema)
  configure(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(importSettingsSchema)) body: z.infer<typeof importSettingsSchema>) {
    return this.imports.configure(actor, id, body);
  }

  @RequirePermissions('imports.run')
  @Get('imports/:id')
  view(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Query(zod(viewQuery)) q: z.infer<typeof viewQuery>) {
    return this.imports.view(actor, id, q.page, q.filter);
  }

  @RequirePermissions('imports.run')
  @Get('imports/:id/errors.xlsx')
  async errors(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response, @Query('locale') locale?: string) {
    sendXlsx(res, `import-${id.slice(0, 8)}-errors.xlsx`, await this.imports.report(actor, id, locale === 'en' ? 'en' : 'fa', 'errors'));
  }

  @RequirePermissions('imports.run')
  @Get('imports/:id/report.xlsx')
  async fullReport(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response, @Query('locale') locale?: string) {
    sendXlsx(res, `import-${id.slice(0, 8)}-report.xlsx`, await this.imports.report(actor, id, locale === 'en' ? 'en' : 'fa', 'all'));
  }

  /** Nothing is applied if the plan changed, rows have errors (unless explicitly left out), or a product changed since the preview. */
  @RequirePermissions('imports.run')
  @Post('imports/:id/commit')
  @ApiZodBody(commitBody)
  commit(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(commitBody)) body: z.infer<typeof commitBody>) {
    return this.imports.requestCommit(actor, id, body);
  }

  @RequirePermissions('imports.run', 'products.read')
  @Get('imports/:id/products')
  products(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Query(zod(productsQuery)) q: z.infer<typeof productsQuery>) {
    return this.imports.importedProducts(actor, id, { page: q.page, ...(q.q ? { q: q.q } : {}), noPhoto: q.noPhoto === '1' });
  }

  @RequirePermissions('exports.run')
  @Get('exports/products.xlsx')
  async export(@CurrentActor() actor: Actor, @Res() res: Response) {
    sendXlsx(res, `hedax-products-${new Date().toISOString().slice(0, 10)}.xlsx`, await this.imports.export(actor));
  }
}
