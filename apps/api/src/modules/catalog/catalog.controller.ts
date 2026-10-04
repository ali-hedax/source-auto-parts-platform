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

  @Get('sitemap')
  sitemap(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, s-maxage=600');
    return this.catalog.sitemapEntries();
  }
}
