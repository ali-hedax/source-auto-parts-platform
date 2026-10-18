import { tmpdir } from 'node:os';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import { brandImportMappingSchema, brandImportUploadSchema } from '@hedax/contracts';
import type { z } from 'zod';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators.js';
import { badRequest } from '../../common/errors.js';
import type { Actor } from '../../common/request-context.js';
import { ApiZodBody, zod } from '../../common/zod.js';
import { BrandImportsService, MAX_BRAND_FILE_BYTES } from './brand-imports.service.js';
import { brandSampleWorkbook } from './brand-sample.js';

/**
 * Panel → «ورود دیتابیس برند». Seeing imports needs imports.run; uploading, mapping, running and
 * undoing also need products.write (they create and change parts).
 */
@ApiTags('admin/brand-imports')
@Controller('admin/brand-imports')
export class BrandImportsController {
  constructor(private readonly imports: BrandImportsService) {}

  @RequirePermissions('imports.run')
  @Get()
  list() {
    return this.imports.list();
  }

  /** «دریافت فایل نمونه»: an Excel file with the column titles that are recognized automatically. */
  @RequirePermissions('imports.run')
  @Get('sample.xlsx')
  async sample(@Res() res: Response) {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="brand-database-sample.xlsx"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(await brandSampleWorkbook());
  }

  /** One large file (≤150 MB) written to a temporary file, never held in memory; fields: manufacturerBrandId, source. */
  @RequirePermissions('imports.run', 'products.write')
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { storage: diskStorage({ destination: tmpdir() }), limits: { fileSize: MAX_BRAND_FILE_BYTES, files: 1, fields: 5 } }))
  upload(@CurrentActor() actor: Actor, @UploadedFile() file: Express.Multer.File | undefined, @Body() raw: Record<string, unknown>) {
    if (!file) throw badRequest('FILE_REQUIRED');
    const body = brandImportUploadSchema.safeParse(raw);
    if (!body.success) throw badRequest('VALIDATION_FAILED', 'Choose the manufacturer brand and the data source');
    return this.imports.upload(actor, { path: file.path, originalname: file.originalname, size: file.size }, body.data);
  }

  @RequirePermissions('imports.run')
  @Get(':id')
  view(@Param('id', ParseUUIDPipe) id: string) {
    return this.imports.view(id);
  }

  @RequirePermissions('imports.run', 'products.write')
  @Put(':id/mapping')
  @ApiZodBody(brandImportMappingSchema)
  mapping(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(brandImportMappingSchema)) body: z.infer<typeof brandImportMappingSchema>) {
    return this.imports.setMapping(actor, id, body.mapping, body.options);
  }

  @RequirePermissions('imports.run', 'products.write')
  @Post(':id/start')
  start(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.imports.start(actor, id);
  }

  /** «برگرداندن این ورود». */
  @RequirePermissions('imports.run', 'products.write')
  @Post(':id/rollback')
  rollback(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.imports.rollback(actor, id);
  }

  @RequirePermissions('imports.run')
  @Get(':id/errors.csv')
  async errors(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const body = await this.imports.errorReport(id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="brand-import-${id.slice(0, 8)}-errors.csv"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(body);
  }
}
