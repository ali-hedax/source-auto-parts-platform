import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { type Observable, tap } from 'rxjs';
import { PublicCacheService } from './public-cache.service.js';

/** Writes that change what anonymous visitors see: catalog, prices, stock, rates, policies, contact. */
const AFFECTS_PUBLIC = /^\/api\/v1\/(admin\/(products|inventory|exchange-rates|policies|settings|categories|vehicle-brands|manufacturer-brands|orders|returns)|checkout|payments)(\/|$|\?)/;
/** Reads that can settle a payment (and so consume stock): the payment result page re-checks the gateway. */
const SETTLING_READ = /^\/api\/v1\/payments\/attempts\//;

/** After a successful write that affects public pages, the web app's public cache is purged (after commit). */
@Injectable()
export class PublicCacheInterceptor implements NestInterceptor {
  constructor(private readonly cache: PublicCacheService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    const url = req.originalUrl ?? req.url;
    const relevant = req.method === 'GET' ? SETTLING_READ.test(url) : AFFECTS_PUBLIC.test(url);
    if (!relevant) return next.handle();
    return next.handle().pipe(tap({ next: () => this.cache.invalidate() }));
  }
}
