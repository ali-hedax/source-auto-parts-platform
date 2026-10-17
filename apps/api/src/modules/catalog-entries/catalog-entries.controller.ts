import { Body, Controller, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import {
  CATALOG_ENTRY_STATUSES, catalogEntryAdminQuerySchema, catalogEntryInputSchema, catalogEntryPublicQuerySchema, catalogImageOrderSchema,
  catalogImportCommitSchema, catalogImportStartSchema, productCodeLookupSchema,
} from '@hedax/contracts';
import { MB } from '@hedax/domain';
import { z } from 'zod';
import { CurrentActor, OptionalActor, Public, RequirePermissions, StaffOnly } from '../../common/auth/decorators.js';
import { badRequest } from '../../common/errors.js';
import { LIMITS, RateLimitService } from '../../common/rate-limit.service.js';
import { currentContext, type Actor } from '../../common/request-context.js';
import { ApiZodBody, zod } from '../../common/zod.js';
import { CatalogEntriesService, assertCanViewCatalog } from './catalog-entries.service.js';
import { CatalogImportService } from './catalog-import.service.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const statusBody = z.object({ status: z.enum(CATALOG_ENTRY_STATUSES) });
const lookupQuery = z.object({ q: z.string().trim().max(120).default('') });
const importFilter = z.object({ filter: z.enum(['all', 'errors', 'duplicates', 'new']).default('all') });

/**
 * Panel → knowledge center → «قطعات کاتالوگ». Seeing the catalog needs imports.run or
 * products.write; every change needs products.write (bulk import also imports.run, which the
 * file upload itself requires).
 */
@ApiTags('admin/catalog-entries')
@StaffOnly()
@Controller('admin/catalog-entries')
export class CatalogEntriesAdminController {
  constructor(
    private readonly entries: CatalogEntriesService,
    private readonly imports: CatalogImportService,
  ) {}

  @Get()
  list(@CurrentActor() actor: Actor, @Query(zod(catalogEntryAdminQuerySchema)) q: z.infer<typeof catalogEntryAdminQuerySchema>) {
    assertCanViewCatalog(actor);
    return this.entries.adminList(q);
  }

  // ---- Static paths first (before :id) ----

  @RequirePermissions('imports.run')
  @Get('import/template')
  async template(@Res() res: Response) {
    res.setHeader('Content-Type', XLSX);
    res.setHeader('Content-Disposition', 'attachment; filename="hedax-catalog-template.xlsx"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(await this.imports.template());
  }

  @RequirePermissions('imports.run', 'products.write')
  @Post('import')
  @ApiZodBody(catalogImportStartSchema)
  startImport(@CurrentActor() actor: Actor, @Body(zod(catalogImportStartSchema)) body: z.infer<typeof catalogImportStartSchema>) {
    return this.imports.start(actor, body.attachmentId);
  }

  @RequirePermissions('imports.run', 'products.write')
  @Get('import/:jobId')
  importView(@CurrentActor() actor: Actor, @Param('jobId', ParseUUIDPipe) jobId: string, @Query(zod(importFilter)) q: z.infer<typeof importFilter>) {
    return this.imports.view(actor, jobId, q.filter);
  }

  @RequirePermissions('imports.run', 'products.write')
  @Post('import/:jobId/commit')
  @ApiZodBody(catalogImportCommitSchema)
  commitImport(@CurrentActor() actor: Actor, @Param('jobId', ParseUUIDPipe) jobId: string, @Body(zod(catalogImportCommitSchema)) body: z.infer<typeof catalogImportCommitSchema>) {
    return this.imports.requestCommit(actor, jobId, body.duplicates);
  }

  /** «لینک به محصول فروشگاه»: products by SKU, technical number or name. */
  @RequirePermissions('products.write')
  @Get('product-lookup')
  productLookup(@Query(zod(lookupQuery)) q: z.infer<typeof lookupQuery>) {
    return this.entries.productLookup(q.q);
  }

  /** Bulk photos: which catalog entries the codes read from photo file names belong to. */
  @RequirePermissions('products.write')
  @Post('code-lookup')
  @ApiZodBody(productCodeLookupSchema)
  codeLookup(@Body(zod(productCodeLookupSchema)) body: z.infer<typeof productCodeLookupSchema>) {
    return this.entries.lookupCodes(body.codes);
  }

  /** «تبدیل به آیتم کاتالوگ»: the form pre-filled from an extracted row (nothing is saved). */
  @Get('draft/:documentId/:ordinal')
  draft(@CurrentActor() actor: Actor, @Param('documentId', ParseUUIDPipe) documentId: string, @Param('ordinal', ParseIntPipe) ordinal: number) {
    assertCanViewCatalog(actor);
    return this.entries.draftFromCandidate(documentId, ordinal);
  }

  @RequirePermissions('products.write')
  @Post()
  @ApiZodBody(catalogEntryInputSchema)
  create(@CurrentActor() actor: Actor, @Body(zod(catalogEntryInputSchema)) body: z.infer<typeof catalogEntryInputSchema>) {
    return this.entries.create(actor, body);
  }

  // ---- One entry ----

  @Get(':id')
  detail(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    assertCanViewCatalog(actor);
    return this.entries.adminDetail(id);
  }

  @RequirePermissions('products.write')
  @Put(':id')
  @ApiZodBody(catalogEntryInputSchema)
  update(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(catalogEntryInputSchema)) body: z.infer<typeof catalogEntryInputSchema>) {
    return this.entries.update(actor, id, body);
  }

  @RequirePermissions('products.write')
  @Post(':id/status')
  @ApiZodBody(statusBody)
  setStatus(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(statusBody)) body: z.infer<typeof statusBody>) {
    return this.entries.setStatus(actor, id, body.status);
  }

  @RequirePermissions('products.write')
  @Delete(':id')
  remove(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.entries.remove(actor, id);
  }

  /** One JPG, PNG or WebP image (up to 20 MB) per request; checked, scanned and re-encoded on the server. */
  @RequirePermissions('products.write')
  @Post(':id/images')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 20 * MB, files: 1 } }))
  addImage(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw badRequest('FILE_REQUIRED');
    return this.entries.addImage(actor, id, file);
  }

  @RequirePermissions('products.write')
  @Put(':id/images/order')
  @ApiZodBody(catalogImageOrderSchema)
  reorder(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(catalogImageOrderSchema)) body: z.infer<typeof catalogImageOrderSchema>) {
    return this.entries.reorderImages(actor, id, body.ids);
  }

  @RequirePermissions('products.write')
  @Delete(':id/images/:imageId')
  removeImage(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Param('imageId', ParseUUIDPipe) imageId: string) {
    return this.entries.removeImage(actor, id, imageId);
  }
}

/** Site → /catalog: published entries only. Anonymous answers may be cached by shared caches. */
@ApiTags('catalog')
@Public()
@Controller('catalog/entries')
export class CatalogEntriesPublicController {
  constructor(
    private readonly entries: CatalogEntriesService,
    private readonly limits: RateLimitService,
  ) {}

  private cache(res: Response, actor: Actor | null): void {
    res.setHeader('Vary', 'Cookie');
    res.setHeader('Cache-Control', actor ? 'private, no-store' : 'public, s-maxage=60, stale-while-revalidate=300');
  }

  @Get()
  async list(@Query(zod(catalogEntryPublicQuerySchema)) q: z.infer<typeof catalogEntryPublicQuerySchema>, @OptionalActor() actor: Actor | null, @Res({ passthrough: true }) res: Response) {
    if (q.q) await this.limits.hit(LIMITS.searchPerIp, currentContext()?.ipHash);
    this.cache(res, actor);
    return this.entries.publicList(q);
  }

  /** Addresses of published entries for the sitemap (registered before :slug). */
  @Get('sitemap')
  sitemap(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, s-maxage=3600');
    return this.entries.sitemap();
  }

  @Get(':slug')
  async detail(@Param('slug') slug: string, @OptionalActor() actor: Actor | null, @Res({ passthrough: true }) res: Response) {
    this.cache(res, actor);
    return this.entries.publicDetail(slug.slice(0, 120));
  }
}
