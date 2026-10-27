import { Body, Controller, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { catalogDocumentCreateSchema, catalogDocumentStatusSchema, catalogDocumentEditSchema, catalogDocumentDeleteSchema } from '@hedax/contracts';
import { z } from 'zod';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators.js';
import type { Actor } from '../../common/request-context.js';
import { ApiZodBody, zod } from '../../common/zod.js';
import { KnowledgeCatalogService } from './knowledge-catalog.service.js';

const listQuery = z.object({ q: z.string().trim().max(120).optional(), page: z.coerce.number().int().min(1).max(10000).default(1) });
const previewQuery = z.object({ after: z.coerce.number().int().min(-1).default(-1) });

@ApiTags('admin/knowledge-catalog')
@Controller('admin/knowledge-catalog')
@RequirePermissions('imports.run')
export class KnowledgeCatalogController {
  constructor(private readonly catalog: KnowledgeCatalogService) {}

  @Get()
  list(@Query(zod(listQuery)) query: z.infer<typeof listQuery>) { return this.catalog.list(query); }

  @Post()
  @ApiZodBody(catalogDocumentCreateSchema)
  create(@CurrentActor() actor: Actor, @Body(zod(catalogDocumentCreateSchema)) body: z.infer<typeof catalogDocumentCreateSchema>) {
    return this.catalog.create(actor, body);
  }

  @Post(':id/extract')
  extract(@Param('id', ParseUUIDPipe) id: string) { return this.catalog.requestExtraction(id); }

  @Patch(':id')
  @ApiZodBody(catalogDocumentEditSchema)
  edit(@Param('id', ParseUUIDPipe) id: string, @Body(zod(catalogDocumentEditSchema)) body: z.infer<typeof catalogDocumentEditSchema>) {
    return this.catalog.edit(id, body);
  }

  @Delete(':id')
  @ApiZodBody(catalogDocumentDeleteSchema)
  remove(@Param('id', ParseUUIDPipe) id: string, @Body(zod(catalogDocumentDeleteSchema)) body: z.infer<typeof catalogDocumentDeleteSchema>) {
    return this.catalog.remove(id, body.expectedUpdatedAt);
  }

  /** «تبدیل به قطعه»: the part form filled from one extracted row (nothing is saved). */
  @Get(':id/candidates/:ordinal/draft')
  partDraft(@Param('id', ParseUUIDPipe) id: string, @Param('ordinal', ParseIntPipe) ordinal: number) { return this.catalog.partDraft(id, ordinal); }

  @Get(':id/preview')
  preview(@Param('id', ParseUUIDPipe) id: string, @Query(zod(previewQuery)) query: z.infer<typeof previewQuery>) { return this.catalog.preview(id, query.after); }

  @Patch(':id/status')
  @ApiZodBody(catalogDocumentStatusSchema)
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body(zod(catalogDocumentStatusSchema)) body: z.infer<typeof catalogDocumentStatusSchema>) {
    return this.catalog.updateStatus(id, body.status, body.note);
  }
}
