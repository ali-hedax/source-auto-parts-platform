import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';

/**
 * Asks the web app to drop its cached public data (catalog, prices, stock,
 * policies, contact) after a change (spec §15: public cache with invalidation).
 * Private data is never cached, so one purge covers everything. Bursts are
 * coalesced into one call; failures are logged once and pages still expire on
 * their own timer, so a missed purge only delays freshness.
 */
@Injectable()
export class PublicCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(PublicCacheService.name);
  private timer: NodeJS.Timeout | null = null;
  private lastError = '';

  constructor(@Inject(ENV) private readonly env: Env) {}

  invalidate(): void {
    if (!this.env.WEB_INTERNAL_URL || !this.env.REVALIDATE_SECRET || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.purge();
    }, 200);
  }

  private async purge(): Promise<void> {
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

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }
}
