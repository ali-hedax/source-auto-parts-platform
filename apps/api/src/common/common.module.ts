import { Global, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ENV, type Env, loadEnv } from '../config/env.js';
import { AuditService } from './audit.service.js';
import { AuthGuard } from './auth/auth.guard.js';
import { SessionService } from './auth/session.service.js';
import { CryptoService } from './crypto.service.js';
import { AllExceptionsFilter } from './http-exception.filter.js';
import { IdempotencyService } from './idempotency.service.js';
import { OutboxService } from './outbox.service.js';
import { PrismaService } from './prisma.service.js';
import { PublicCacheInterceptor } from './public-cache.interceptor.js';
import { PublicCacheService } from './public-cache.service.js';
import { RateLimitService } from './rate-limit.service.js';
import { RealtimeBus } from './realtime-bus.js';
import { RequestContextMiddleware } from './request-context.middleware.js';
import { LocalStorageDriver } from './storage/local-storage.js';
import { S3StorageDriver } from './storage/s3-storage.js';
import { ClamAvScanner, DevNoScanner, SCANNER } from './storage/scanner.js';
import { STORAGE } from './storage/storage.js';
import { TransitionsService } from './transitions.service.js';

@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    PrismaService,
    CryptoService,
    RealtimeBus,
    SessionService,
    IdempotencyService,
    AuditService,
    OutboxService,
    TransitionsService,
    RateLimitService,
    {
      provide: STORAGE,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.STORAGE_DRIVER === 's3'
          ? new S3StorageDriver({
              endpoint: env.S3_ENDPOINT ?? '',
              region: env.S3_REGION ?? '',
              privateBucket: env.S3_PRIVATE_BUCKET ?? '',
              publicBucket: env.S3_PUBLIC_BUCKET ?? '',
              publicBaseUrl: env.S3_PUBLIC_BASE_URL ?? env.PUBLIC_MEDIA_BASE_URL,
              accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
              secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
            })
          : new LocalStorageDriver(env.LOCAL_STORAGE_DIR, env.PUBLIC_MEDIA_BASE_URL),
    },
    {
      provide: SCANNER,
      inject: [ENV],
      useFactory: (env: Env) => (env.MALWARE_SCANNER === 'clamav' ? new ClamAvScanner(env.CLAMAV_HOST, env.CLAMAV_PORT) : new DevNoScanner()),
    },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    PublicCacheService,
    { provide: APP_INTERCEPTOR, useClass: PublicCacheInterceptor },
  ],
  exports: [
    ENV,
    PrismaService,
    CryptoService,
    RealtimeBus,
    SessionService,
    IdempotencyService,
    AuditService,
    OutboxService,
    TransitionsService,
    RateLimitService,
    STORAGE,
    SCANNER,
    PublicCacheService,
  ],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
  }
}
