import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { productListQuerySchema } from '@hedax/contracts';
import { z } from 'zod';
import { OptionalActor, Public } from '../../common/auth/decorators.js';
import { notFound } from '../../common/errors.js';
import { LIMITS, RateLimitService } from '../../common/rate-limit.service.js';
import { currentContext, type Actor } from '../../common/request-context.js';
import { zod } from '../../common/zod.js';
import { CatalogService, type Viewer } from './catalog.service.js';

const displayQuery = z.object({ currency: z.enum(['IRR', 'AED']).default('IRR') });
const listQuery = productListQuerySchema.extend(displayQuery.shape);

/**
 * Public catalog. Anonymous responses are cacheable by shared caches; any
 * request with a session gets `private, no-store` because business customers
 * may see group prices (spec §15: no private price in shared cache).
 */
@ApiTags('catalog')
@Public()
@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly limits: RateLimitService,
  ) {}

  private viewer(actor: Actor | null, currency: 'IRR' | 'AED'): Viewer {
    return { approvedGroupId: actor?.kind === 'CUSTOMER' ? actor.approvedCustomerGroupId : null, display: currency };
  }

  private cache(res: Response, actor: Actor | null): void {
    res.setHeader('Vary', 'Cookie');
    res.setHeader('Cache-Control', actor ? 'private, no-store' : 'public, s-maxage=60, stale-while-revalidate=300');
  }

  @Get('collections/:kind')
  collection(@Param('kind') kind: string, @Query() query: Record<string, string>, @OptionalActor() actor: Actor | null, @Res({ passthrough: true }) res: Response) {
    const k = z.enum(['bestsellers', 'discounts', 'selected-products', 'offers']).parse(kind);
    const q = z.object({ currency: z.enum(['IRR', 'AED']).default('IRR'), limit: z.coerce.number().int().min(1).max(24).default(8), slugs: z.string().max(3000).default('') }).parse(query);
    const slugs = z.array(z.string().regex(/^[a-z0-9-]{1,120}$/)).max(24).parse(q.slugs ? q.slugs.split(',') : []);
    this.cache(res, actor);
    return this.catalog.collection(k, slugs, this.viewer(actor, q.currency), q.limit);
  }

  @Get('products')
  async list(@Query(zod(listQuery)) q: z.infer<typeof listQuery>, @OptionalActor() actor: Actor | null, @Res({ passthrough: true }) res: Response) {
    if (q.q) await this.limits.hit(LIMITS.searchPerIp, currentContext()?.ipHash);
    this.cache(res, actor);
    return this.catalog.list(q, this.viewer(actor, q.currency));
  }

  /** Imported = origin attribute; these are regular in-stock products sold through the same purchase path. */
  @Get('imported-products')
  async imported(@Query(zod(listQuery)) q: z.infer<typeof listQuery>, @OptionalActor() actor: Actor | null, @Res({ passthrough: true }) res: Response) {
    this.cache(res, actor);
    return this.catalog.list(q, this.viewer(actor, q.currency), 'IMPORTED');
  }

  @Get('products/:slug')
  async detail(
    @Param('slug') slug: string,
    @Query(zod(displayQuery)) q: z.infer<typeof displayQuery>,
    @OptionalActor() actor: Actor | null,
    @Res({ passthrough: true }) res: Response,
  ) {
    const product = await this.catalog.detail(slug.slice(0, 120), this.viewer(actor, q.currency));
    if (!product) throw notFound();
    this.cache(res, actor);
    return product;
  }

  @Get('categories')
  categories(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return this.catalog.categories();
  }

  @Get('vehicle-brands')
  brands(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return this.catalog.vehicleBrands();
  }

  /** Part brands (makers) with published parts: «مرور بر اساس سازنده» and the maker filter. */
  @Get('manufacturers')
  manufacturers(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return this.catalog.manufacturers();
  }

  /** /catalog/[slug] of the former technical catalog → the part's slug (the web answers with 301). */
  @Get('legacy-catalog/:slug')
  async legacyCatalog(@Param('slug') slug: string, @Res({ passthrough: true }) res: Response) {
    const found = await this.catalog.legacyCatalogSlug(slug.slice(0, 120));
    if (!found) throw notFound();
    res.setHeader('Cache-Control', 'public, s-maxage=3600');
    return found;
  }

  @Get('sitemap/pages')
  sitemapPages(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, s-maxage=600');
    return this.catalog.sitemapPages();
  }

  @Get('sitemap')
  sitemap(@Query('page') page: string | undefined, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, s-maxage=600');
    return this.catalog.sitemapEntries(Math.min(Math.max(Number(page ?? 0) || 0, 0), 1000));
  }
}
