import path from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Env } from './config/env.js';

/**
 * HTTP pipeline shared by the server entry point (main.ts) and the
 * integration tests, so both exercise exactly the same middleware.
 */
export function configureApp(app: NestExpressApplication, env: Env): void {
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      hsts: env.APP_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );
  if (env.STORAGE_DRIVER === 'local') {
    // Public product images (re-encoded WebP under random keys) when no reverse proxy or
    // object store serves /media. Only the public folder is exposed; private files are not.
    app.useStaticAssets(path.resolve(env.LOCAL_STORAGE_DIR, 'public'), {
      prefix: '/media/',
      index: false,
      dotfiles: 'deny',
      redirect: false,
      immutable: true,
      maxAge: '30d',
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      },
    });
  }
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '1mb' });
  app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] });
}
