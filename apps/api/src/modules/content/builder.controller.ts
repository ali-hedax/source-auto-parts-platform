import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { z } from 'zod';
import { builderSaveSchema, builderVersionSchema, builderRestoreSchema, builderSlugSchema, builderMediaUpdateSchema, CONTENT_IMAGE_MAX_BYTES } from '@hedax/contracts';
import { CurrentActor, Public, RequirePermissions } from '../../common/auth/decorators.js';
import type { Actor } from '../../common/request-context.js';
import { badRequest } from '../../common/errors.js';
import { zod } from '../../common/zod.js';
import { BuilderService } from './builder.service.js';

@Controller()
export class BuilderController {
  constructor(private readonly builder: BuilderService) {}
  @Public()
  @Get('site/builder/:slug')
  async published(@Param('slug') slug: string, @Res({ passthrough: true }) res: Response) {
    // Scheduling is evaluated on the current request, never in a stale shared HTML response.
    res.setHeader('Cache-Control', 'public, s-maxage=30');
    return this.builder.published(builderSlugSchema.parse(slug));
  }
  @RequirePermissions('content.manage')
  @Get('admin/content/builder')
  list() { return this.builder.list(); }
  @RequirePermissions('content.manage')
  @Get('admin/content/builder/:slug')
  state(@Param('slug') slug: string, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    return this.builder.state(builderSlugSchema.parse(slug));
  }
  @RequirePermissions('content.manage')
  @Put('admin/content/builder/:slug')
  save(@Param('slug') slug: string, @Body(zod(builderSaveSchema)) body: z.infer<typeof builderSaveSchema>, @CurrentActor() actor: Actor) {
    return this.builder.save(builderSlugSchema.parse(slug), body.version, body.document, actor);
  }
  @RequirePermissions('content.manage')
  @Post('admin/content/builder/:slug/publish')
  publish(@Param('slug') slug: string, @Body(zod(builderVersionSchema)) body: z.infer<typeof builderVersionSchema>, @CurrentActor() actor: Actor) {
    return this.builder.publish(builderSlugSchema.parse(slug), body.version, actor);
  }
  @RequirePermissions('content.manage')
  @Post('admin/content/builder/:slug/restore')
  restore(@Param('slug') slug: string, @Body(zod(builderRestoreSchema)) body: z.infer<typeof builderRestoreSchema>, @CurrentActor() actor: Actor) {
    return this.builder.publish(builderSlugSchema.parse(slug), body.version, actor, body.revisionId);
  }
  @RequirePermissions('content.manage')
  @Get('admin/content/builder/:slug/history')
  history(@Param('slug') slug: string) { return this.builder.history(builderSlugSchema.parse(slug)); }
  @RequirePermissions('content.manage')
  @Get('admin/content/media')
  media(@Query('q') query?: string) { return this.builder.media((query ?? '').slice(0, 100)); }
  @RequirePermissions('content.manage')
  @Post('admin/content/media')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: CONTENT_IMAGE_MAX_BYTES, files: 1 } }))
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw badRequest('FILE_REQUIRED');
    return this.builder.registerImage(file);
  }
  @RequirePermissions('content.manage')
  @Put('admin/content/media/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(zod(builderMediaUpdateSchema)) body: z.infer<typeof builderMediaUpdateSchema>) { return this.builder.updateMedia(id, body); }
  @RequirePermissions('content.manage')
  @Delete('admin/content/media/:id')
  archive(@Param('id', ParseUUIDPipe) id: string) { return this.builder.archiveMedia(id); }
}
