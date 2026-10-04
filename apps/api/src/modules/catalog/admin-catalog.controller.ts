import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import {
  mediaUpdateSchema,
  paginationQuerySchema,
  priceRuleSchema,
  productPublishSchema,
  productUpsertSchema,
} from '@hedax/contracts';
import { MB, normalizeSearchText } from '@hedax/domain';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service.js';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators.js';
import { badRequest, notFound } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Actor } from '../../common/request-context.js';
import { ApiZodBody, zod } from '../../common/zod.js';
import { AdminCatalogService, slugify } from './admin-catalog.service.js';

const listQuery = paginationQuerySchema.extend({
  q: z.string().max(80).optional(),
  published: z.enum(['1', '0']).optional(),
  archived: z.enum(['1', '0']).optional(),
});
const versionBody = z.object({ version: z.number().int().min(0) });
const altBody = z.object({ altFa: z.string().trim().min(2).max(200), altEn: z.string().trim().max(200).optional() });

const taxonomySchema = z.object({
  code: z.string().regex(/^[A-Z0-9_]{2,40}$/),
  slug: z.string().regex(/^[a-z0-9-]{2,80}$/).optional(),
  nameFa: z.string().trim().min(2).max(120),
  nameEn: z.string().trim().max(120).optional().nullable(),
  parentId: z.uuid().optional().nullable(),
  isFeatured: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  active: z.boolean().default(true),
});
const manufacturerSchema = z.object({
  nameFa: z.string().trim().min(2).max(120),
  nameEn: z.string().trim().max(120).optional().nullable(),
  countryCode: z.string().length(2).toUpperCase().optional().nullable(),
  active: z.boolean().default(true),
});

@ApiTags('admin/catalog')
@Controller('admin')
export class AdminCatalogController {
  constructor(
    private readonly svc: AdminCatalogService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @RequirePermissions('products.read')
  @Get('products')
  async list(@Query(zod(listQuery)) q: z.infer<typeof listQuery>) {
    const res = await this.svc.list({
      page: q.page,
      pageSize: q.pageSize,
      ...(q.q ? { q: q.q } : {}),
      ...(q.published ? { published: q.published === '1' } : {}),
      archived: q.archived === '1',
    });
    return { ...res, page: q.page, pageSize: q.pageSize };
  }

  @RequirePermissions('products.read')
  @Get('products/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(id);
  }

  /** Creates product + FA/EN text + base price + empty stock balance. Prices also need prices.write. */
  @RequirePermissions('products.write', 'prices.write')
  @Post('products')
  @ApiZodBody(productUpsertSchema)
  create(@Body(zod(productUpsertSchema)) body: z.infer<typeof productUpsertSchema>, @CurrentActor() actor: Actor) {
    return this.svc.upsert(null, body, actor.userId);
  }

  /** Optimistic lock via `version`; a stale version returns 409 VERSION_CONFLICT. */
  @RequirePermissions('products.write', 'prices.write')
  @Put('products/:id')
  @ApiZodBody(productUpsertSchema)
  update(@Param('id', ParseUUIDPipe) id: string, @Body(zod(productUpsertSchema)) body: z.infer<typeof productUpsertSchema>, @CurrentActor() actor: Actor) {
    return this.svc.upsert(id, body, actor.userId);
  }

  @RequirePermissions('products.publish')
  @Post('products/:id/publish')
  publish(@Param('id', ParseUUIDPipe) id: string, @Body(zod(productPublishSchema)) body: z.infer<typeof productPublishSchema>) {
    return this.svc.setPublished(id, body.published, body.version);
  }

  @RequirePermissions('products.write')
  @Post('products/:id/archive')
  archive(@Param('id', ParseUUIDPipe) id: string, @Body(zod(versionBody)) body: z.infer<typeof versionBody>) {
    return this.svc.archive(id, body.version);
  }

  @RequirePermissions('products.write')
  @Post('products/:id/media')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 20 * MB, files: 1 } }))
  async upload(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() rawBody: Record<string, unknown>,
  ) {
    if (!file) throw badRequest('FILE_REQUIRED');
    const alt = altBody.parse(rawBody);
    return this.svc.addMedia(id, file, alt);
  }

  @RequirePermissions('products.write')
  @Patch('products/:id/media/:mediaId')
  updateMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Body(zod(mediaUpdateSchema)) body: z.infer<typeof mediaUpdateSchema>,
  ) {
    return this.svc.updateMedia(id, mediaId, body);
  }

  @RequirePermissions('products.write')
  @Delete('products/:id/media/:mediaId')
  removeMedia(@Param('id', ParseUUIDPipe) id: string, @Param('mediaId', ParseUUIDPipe) mediaId: string) {
    return this.svc.removeMedia(id, mediaId);
  }

  @RequirePermissions('prices.write')
  @Post('products/:id/price-rules')
  @ApiZodBody(priceRuleSchema)
  addRule(@Param('id', ParseUUIDPipe) id: string, @Body(zod(priceRuleSchema)) body: z.infer<typeof priceRuleSchema>, @CurrentActor() actor: Actor) {
    return this.svc.addPriceRule(id, body, actor.userId);
  }

  @RequirePermissions('prices.write')
  @Delete('products/:id/price-rules/:ruleId')
  removeRule(@Param('id', ParseUUIDPipe) id: string, @Param('ruleId', ParseUUIDPipe) ruleId: string) {
    return this.svc.deactivatePriceRule(id, ruleId);
  }

  // ---------------------------------------------------------------------------
  // Taxonomy: categories, vehicle brands, manufacturer brands (managed, extensible)
  // ---------------------------------------------------------------------------

  @RequirePermissions('products.read')
  @Get('taxonomy')
  async taxonomy() {
    const [categories, vehicleBrands, manufacturers, groups] = await Promise.all([
      this.prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { nameFa: 'asc' }] }),
      this.prisma.vehicleBrand.findMany({ orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }] }),
      this.prisma.manufacturerBrand.findMany({ orderBy: { nameFa: 'asc' } }),
      this.prisma.customerGroup.findMany({ orderBy: { key: 'asc' } }),
    ]);
    return { categories, vehicleBrands, manufacturers, customerGroups: groups };
  }

  @RequirePermissions('products.write')
  @Post('categories')
  async createCategory(@Body(zod(taxonomySchema)) body: z.infer<typeof taxonomySchema>) {
    return this.prisma.tx(async (tx) => {
      const row = await tx.category.create({
        data: { code: body.code, slug: body.slug ?? slugify(body.nameEn ?? body.code.toLowerCase()), nameFa: body.nameFa, nameEn: body.nameEn ?? null, parentId: body.parentId ?? null, sortOrder: body.sortOrder, active: body.active },
      });
      await this.audit.record(tx, { action: 'category.created', entityType: 'category', entityId: row.id, after: row });
      return row;
    });
  }

  @RequirePermissions('products.write')
  @Put('categories/:id')
  async updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body(zod(taxonomySchema)) body: z.infer<typeof taxonomySchema>) {
    if (body.parentId === id) throw badRequest('INVALID_PARENT');
    return this.prisma.tx(async (tx) => {
      const before = await tx.category.findUnique({ where: { id } });
      if (!before) throw notFound();
      const row = await tx.category.update({
        where: { id },
        data: { code: body.code, ...(body.slug ? { slug: body.slug } : {}), nameFa: body.nameFa, nameEn: body.nameEn ?? null, parentId: body.parentId ?? null, sortOrder: body.sortOrder, active: body.active },
      });
      await this.audit.record(tx, { action: 'category.updated', entityType: 'category', entityId: id, before, after: row });
      return row;
    });
  }

  @RequirePermissions('products.write')
  @Post('vehicle-brands')
  async createBrand(@Body(zod(taxonomySchema)) body: z.infer<typeof taxonomySchema>) {
    return this.prisma.tx(async (tx) => {
      const row = await tx.vehicleBrand.create({
        data: { code: body.code, slug: body.slug ?? slugify(body.nameEn ?? body.code.toLowerCase()), nameFa: body.nameFa, nameEn: body.nameEn ?? null, isFeatured: body.isFeatured ?? false, sortOrder: body.sortOrder, active: body.active },
      });
      await this.audit.record(tx, { action: 'vehicle_brand.created', entityType: 'vehicle_brand', entityId: row.id, after: row });
      return row;
    });
  }

  @RequirePermissions('products.write')
  @Put('vehicle-brands/:id')
  async updateBrand(@Param('id', ParseUUIDPipe) id: string, @Body(zod(taxonomySchema)) body: z.infer<typeof taxonomySchema>) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.vehicleBrand.findUnique({ where: { id } });
      if (!before) throw notFound();
      const row = await tx.vehicleBrand.update({
        where: { id },
        data: { code: body.code, ...(body.slug ? { slug: body.slug } : {}), nameFa: body.nameFa, nameEn: body.nameEn ?? null, isFeatured: body.isFeatured ?? before.isFeatured, sortOrder: body.sortOrder, active: body.active },
      });
      await this.audit.record(tx, { action: 'vehicle_brand.updated', entityType: 'vehicle_brand', entityId: id, before, after: row });
      return row;
    });
  }

  /** normalized_name is unique, so "Isaco" and "ISACO " cannot become two brands. */
  @RequirePermissions('products.write')
  @Post('manufacturer-brands')
  async createManufacturer(@Body(zod(manufacturerSchema)) body: z.infer<typeof manufacturerSchema>) {
    const normalizedName = normalizeSearchText(body.nameEn || body.nameFa);
    return this.prisma.tx(async (tx) => {
      const row = await tx.manufacturerBrand.create({
        data: {
          slug: slugify(body.nameEn ?? '') || `brand-${Date.now().toString(36)}`,
          nameFa: body.nameFa,
          nameEn: body.nameEn ?? null,
          normalizedName,
          countryCode: body.countryCode ?? null,
          active: body.active,
        },
      });
      await this.audit.record(tx, { action: 'manufacturer_brand.created', entityType: 'manufacturer_brand', entityId: row.id, after: row });
      return row;
    });
  }
}
