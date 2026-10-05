import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../../config/env.js';
import { Public } from '../../common/auth/decorators.js';
import { PrismaService } from '../../common/prisma.service.js';
import { SCANNER, type MalwareScanner } from '../../common/storage/scanner.js';
import { STORAGE, type StorageDriver } from '../../common/storage/storage.js';

/** Liveness (process up) and readiness (dependencies reachable). No secrets are exposed. */
@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(STORAGE) private readonly storage: StorageDriver,
    @Inject(SCANNER) private readonly scanner: MalwareScanner,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const check = async (fn: () => Promise<unknown>) => {
      try {
        await Promise.race([fn(), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))]);
        return 'up';
      } catch {
        return 'down';
      }
    };
    const redis = new Redis(this.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 0, enableOfflineQueue: false, retryStrategy: () => null });
    redis.on('error', () => undefined);
    const [database, cache, storage, scanner] = await Promise.all([
      check(() => this.prisma.$queryRaw`SELECT 1`),
      check(async () => {
        await redis.connect();
        await redis.ping();
      }),
      check(() => this.storage.ping()),
      check(() => this.scanner.ping()),
    ]);
    redis.disconnect();
    // With a non-Unicode LC_CTYPE (e.g. "C") pg_trgm sees no Persian letters: search still works
    // for exact tokens but fuzzy matching/ranking silently degrades. Reported, not fatal.
    let searchLocale: 'ok' | 'degraded' | 'unknown' = 'unknown';
    if (database === 'up') {
      const rows = await this.prisma.$queryRaw<Array<{ n: number | null }>>`SELECT array_length(show_trgm('فیلتر'), 1) AS n`.catch(() => null);
      searchLocale = rows ? ((rows[0]?.n ?? 0) > 0 ? 'ok' : 'degraded') : 'unknown';
    }
    // Old signatures still scan, so this is reported for monitoring rather than failing readiness.
    const signatures = scanner === 'up' ? await this.signatureAge() : null;
    const checks = {
      database,
      redis: cache,
      storage,
      scanner,
      searchLocale,
      scannerEngine: this.scanner.name,
      scannerSignatures: this.scanner.name !== 'clamav' ? 'not-applicable' : !signatures ? 'unknown' : signatures.ageHours > this.env.CLAMAV_SIGNATURE_MAX_AGE_HOURS ? 'stale' : 'fresh',
      scannerSignatureVersion: signatures?.version ?? null,
      scannerSignatureAgeHours: signatures?.ageHours ?? null,
      paymentProvider: this.env.PAYMENT_PROVIDER === 'zarinpal' && this.env.ZARINPAL_SANDBOX ? 'zarinpal-sandbox' : this.env.PAYMENT_PROVIDER,
      smsProvider: this.env.SMS_PROVIDER,
    };
    const ok = database === 'up' && cache === 'up' && storage === 'up';
    res.status(ok ? 200 : 503);
    return { status: ok ? 'ready' : 'not-ready', checks };
  }

  private async signatureAge(): Promise<{ version: string; ageHours: number } | null> {
    try {
      const info = await Promise.race([this.scanner.signatures(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000))]);
      return info ? { version: info.version, ageHours: Math.max(0, Math.floor((Date.now() - info.builtAt.getTime()) / 3_600_000)) } : null;
    } catch {
      return null;
    }
  }
}
