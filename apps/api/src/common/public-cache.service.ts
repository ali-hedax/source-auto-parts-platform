import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';

/** Arvan CDN API (v4.0): drop every cached copy of the zone's pages. */
export const arvanPurgeUrl = (domain: string) => `https://napi.arvancloud.ir/cdn/4.0/domains/${encodeURIComponent(domain)}/caching?purge=all`;

/**
 * Asks the web app to drop its cached public data (catalog, prices, stock,
 * policies, contact) after a change (spec §15: public cache with invalidation).
 * Private data is never cached, so one purge covers everything. Bursts are
 * coalesced into one call; failures are logged once and pages still expire on
 * their own timer, so a missed purge only delays freshness.
 *
 * With ARVAN_CDN_API_KEY and ARVAN_CDN_DOMAIN set, the CDN's copies of the guest pages are purged
 * right after the web app's cache (in that order, so the CDN refills from fresh pages).
 */
@Injectable()
export class PublicCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(PublicCacheService.name);
  private timer: NodeJS.Timeout | null = null;
  private lastError = '';
  private lastCdnError = '';

  constructor(@Inject(ENV) private readonly env: Env) {}

  invalidate(): void {
    const web = Boolean(this.env.WEB_INTERNAL_URL && this.env.REVALIDATE_SECRET);
    if ((!web && !this.cdnConfigured()) || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.purge();
    }, 200);
  }

  private cdnConfigured(): boolean {
    return Boolean(this.env.ARVAN_CDN_API_KEY && this.env.ARVAN_CDN_DOMAIN);
  }

  /** Runs both purges (web app first); exposed for tests. */
  async purge(): Promise<void> {
    if (this.env.WEB_INTERNAL_URL && this.env.REVALIDATE_SECRET) await this.purgeWeb();
    if (this.cdnConfigured()) await this.purgeCdn();
  }

  private async purgeWeb(): Promise<void> {
    try {
      const res = await fetch(new URL('/api/internal/revalidate', this.env.WEB_INTERNAL_URL), {
        method: 'POST',
        headers: { 'x-hedax-revalidate': this.env.REVALIDATE_SECRET as string },
        signal: AbortSignal.timeout(3_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.lastError = '';
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message !== this.lastError) this.logger.warn(`public cache purge failed: ${message}`);
      this.lastError = message;
    }
  }

  private async purgeCdn(): Promise<void> {
    const key = (this.env.ARVAN_CDN_API_KEY as string).trim();
    try {
      const res = await fetch(arvanPurgeUrl(this.env.ARVAN_CDN_DOMAIN as string), {
        method: 'DELETE',
        // The panel shows the key as «Apikey …»; a bare key gets the prefix.
        headers: { Authorization: /^apikey /i.test(key) ? key : `Apikey ${key}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.lastCdnError = '';
    } catch (e) {
      // Never log the key; the status or network error is enough.
      const message = e instanceof Error ? e.message : String(e);
      if (message !== this.lastCdnError) this.logger.warn(`CDN purge failed: ${message}`);
      this.lastCdnError = message;
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }
}
