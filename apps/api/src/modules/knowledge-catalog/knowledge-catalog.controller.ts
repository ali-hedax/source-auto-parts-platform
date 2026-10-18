import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { catalogDocumentCreateSchema, catalogDocumentStatusSchema } from '@hedax/contracts';
import type { z } from 'zod';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators.js';
import type { Actor } from '../../common/request-context.js';
import { ApiZodBody, zod } from '../../common/zod.js';
import { KnowledgeCatalogService } from './knowledge-catalog.service.js';

@ApiTags('admin/knowledge-catalog')
@Controller('admin/knowledge-catalog')
@RequirePermissions('imports.run')
export class KnowledgeCatalogController {
  constructor(private readonly catalog: KnowledgeCatalogService) {}

  @Get()
  list() { return this.catalog.list(); }

  @Post()
  @ApiZodBody(catalogDocumentCreateSchema)
  create(@CurrentActor() actor: Actor, @Body(zod(catalogDocumentCreateSchema)) body: z.infer<typeof catalogDocumentCreateSchema>) {
    return this.catalog.create(actor, body);
  }

  @Post(':id/extract')
  extract(@Param('id', ParseUUIDPipe) id: string) { return this.catalog.requestExtraction(id); }

  /** «تبدیل به قطعه»: the part form filled from one extracted row (nothing is saved). */
  @Get(':id/candidates/:ordinal/draft')
  partDraft(@Param('id', ParseUUIDPipe) id: string, @Param('ordinal', ParseIntPipe) ordinal: number) { return this.catalog.partDraft(id, ordinal); }

  @Get(':id/preview')
  preview(@Param('id', ParseUUIDPipe) id: string) { return this.catalog.preview(id); }

  @Patch(':id/status')
  @ApiZodBody(catalogDocumentStatusSchema)
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body(zod(catalogDocumentStatusSchema)) body: z.infer<typeof catalogDocumentStatusSchema>) {
    return this.catalog.updateStatus(id, body.status, body.note);
  }
}
