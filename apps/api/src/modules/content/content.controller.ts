import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CONTENT_IMAGE_PURPOSES, CONTENT_SECTION_KEYS, contentPageSchema, contentSectionUpdateSchema, faqItemSchema, faqOrderSchema, type ContentSectionKey } from '@hedax/contracts';
import { z } from 'zod';
import { CurrentActor, Public, RequirePermissions } from '../../common/auth/decorators.js';
import { badRequest, notFound } from '../../common/errors.js';
import type { Actor } from '../../common/request-context.js';
import { ApiZodBody, zod } from '../../common/zod.js';
import { ContentService } from './content.service.js';

const MB = 1024 * 1024;
/** Upload limit for site pictures (before re-encoding, which makes them much smaller). */
export const CONTENT_IMAGE_MAX_BYTES = 5 * MB;

const sectionParam = (value: string): ContentSectionKey => {
  if (!(CONTENT_SECTION_KEYS as string[]).includes(value)) throw notFound();
  return value as ContentSectionKey;
};

/**
 * Site content: one public bundle for every page, published text pages, and the panel's editing
 * endpoints (content.manage). Saving purges the public page cache (PublicCacheInterceptor).
 */
@ApiTags('content')
@Controller()
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Public()
  @Get('site/content')
  async site(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    return this.content.publicBundle();
  }

  @Public()
  @Get('site/pages/:slug')
  async page(@Param('slug') slug: string, @Res({ passthrough: true }) res: Response) {
    if (!/^[a-z0-9-]{1,60}$/.test(slug)) throw notFound();
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    return this.content.publicPage(slug);
  }

  // ---- Panel ----

  @RequirePermissions('content.manage')
  @Get('admin/content')
  sections() {
    return this.content.sections();
  }

  @RequirePermissions('content.manage')
  @Put('admin/content/sections/:section')
  @ApiZodBody(contentSectionUpdateSchema)
  updateSection(@Param('section') section: string, @Body(zod(contentSectionUpdateSchema)) body: z.infer<typeof contentSectionUpdateSchema>, @CurrentActor() actor: Actor) {
    return this.content.updateSection(sectionParam(section), body.version, body.value, actor.userId);
  }

  @RequirePermissions('content.manage')
  @Get('admin/content/faq')
  faq() {
    return this.content.faqList();
  }

  @RequirePermissions('content.manage')
  @Post('admin/content/faq')
  @ApiZodBody(faqItemSchema)
  faqCreate(@Body(zod(faqItemSchema)) body: z.infer<typeof faqItemSchema>, @CurrentActor() actor: Actor) {
    return this.content.faqCreate(body, actor.userId);
  }

  @RequirePermissions('content.manage')
  @Put('admin/content/faq/:id')
  @ApiZodBody(faqItemSchema)
  faqUpdate(@Param('id', ParseUUIDPipe) id: string, @Body(zod(faqItemSchema)) body: z.infer<typeof faqItemSchema>, @CurrentActor() actor: Actor) {
    return this.content.faqUpdate(id, body, actor.userId);
  }

  @RequirePermissions('content.manage')
  @Delete('admin/content/faq/:id')
  faqDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.faqDelete(id);
  }

  @RequirePermissions('content.manage')
  @Post('admin/content/faq/order')
  @HttpCode(200)
  @ApiZodBody(faqOrderSchema)
  faqOrder(@Body(zod(faqOrderSchema)) body: z.infer<typeof faqOrderSchema>) {
    return this.content.faqReorder(body.ids);
  }

  @RequirePermissions('content.manage')
  @Get('admin/content/pages')
  pages() {
    return this.content.pageList();
  }

  @RequirePermissions('content.manage')
  @Get('admin/content/pages/:id')
  pageGet(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.pageGet(id);
  }

  @RequirePermissions('content.manage')
  @Post('admin/content/pages')
  @ApiZodBody(contentPageSchema)
  pageCreate(@Body(zod(contentPageSchema)) body: z.infer<typeof contentPageSchema>, @CurrentActor() actor: Actor) {
    return this.content.pageCreate(body, actor.userId);
  }

  @RequirePermissions('content.manage')
  @Put('admin/content/pages/:id')
  @ApiZodBody(contentPageSchema)
  pageUpdate(@Param('id', ParseUUIDPipe) id: string, @Body(zod(contentPageSchema)) body: z.infer<typeof contentPageSchema>, @CurrentActor() actor: Actor) {
    return this.content.pageUpdate(id, body, actor.userId);
  }

  @RequirePermissions('content.manage')
  @Delete('admin/content/pages/:id')
  pageDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.pageDelete(id);
  }

  @RequirePermissions('content.manage')
  @Post('admin/content/images')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: CONTENT_IMAGE_MAX_BYTES, files: 1 } }))
  async uploadImage(@UploadedFile() file: Express.Multer.File | undefined, @Query('purpose') purpose: string | undefined) {
    if (!file) throw badRequest('FILE_REQUIRED');
    const kind = z.enum(CONTENT_IMAGE_PURPOSES).safeParse(purpose ?? 'image');
    if (!kind.success) throw badRequest('VALIDATION_FAILED', 'Unknown image purpose');
    return this.content.uploadImage(kind.data, file);
  }
}
