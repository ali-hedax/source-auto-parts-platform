import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE } from '@hedax/contracts';
import { ENV, type Env } from '../../config/env.js';
import { CryptoService } from '../crypto.service.js';
import { forbidden, unauthorized } from '../errors.js';
import { currentContext, type Actor } from '../request-context.js';
import { ACTOR_KIND, IS_PUBLIC, PERMISSIONS_KEY, SKIP_CSRF } from './decorators.js';
import { SessionService } from './session.service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global guard: resolves the session cookie, enforces authentication, actor
 * kind, staff MFA, permissions and CSRF (origin allowlist + double-submit
 * token) for every state-changing request.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;

  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly crypto: CryptoService,
    @Inject(ENV) env: Env,
  ) {
    this.allowedOrigins = new Set(
      [env.PUBLIC_BASE_URL, ...env.ALLOWED_ORIGINS.split(',')].map((o) => o.trim().replace(/\/$/, '')).filter(Boolean),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request & { actor?: Actor | null }>();
    const handler = context.getHandler();
    const cls = context.getClass();
    const meta = <T>(key: string) => this.reflector.getAllAndOverride<T | undefined>(key, [handler, cls]);

    const actor = await this.sessions.resolve(req.cookies?.[SESSION_COOKIE]);
    req.actor = actor;
    const ctx = currentContext();
    if (ctx) ctx.actor = actor;

    if (!SAFE_METHODS.has(req.method) && !meta<boolean>(SKIP_CSRF)) this.checkCsrf(req, actor);

    const isPublic = meta<boolean>(IS_PUBLIC) ?? false;
    if (!actor) {
      if (isPublic) return true;
      throw unauthorized();
    }
    const kind = meta<'CUSTOMER' | 'STAFF'>(ACTOR_KIND);
    if (kind && actor.kind !== kind) throw forbidden('WRONG_ACCOUNT_TYPE');

    if (actor.kind === 'STAFF' && actor.requiresMfa && !actor.mfaVerified && !isPublic) {
      throw forbidden('MFA_REQUIRED', 'Multi-factor authentication is required for this account');
    }
    const required = meta<string[]>(PERMISSIONS_KEY) ?? [];
    if (required.length) {
      if (actor.kind !== 'STAFF') throw forbidden();
      const missing = required.filter((p) => !actor.permissions.has(p));
      if (missing.length) throw forbidden('MISSING_PERMISSION', `Missing permission: ${missing.join(', ')}`);
    }
    return true;
  }

  private checkCsrf(req: Request, actor: Actor | null): void {
    const origin = (req.headers.origin ?? '').replace(/\/$/, '');
    const fetchSite = req.headers['sec-fetch-site'];
    if (origin && !this.allowedOrigins.has(origin)) throw forbidden('CSRF_ORIGIN', 'Cross-origin request refused');
    if (fetchSite === 'cross-site') throw forbidden('CSRF_ORIGIN', 'Cross-site request refused');
    const header = req.headers[CSRF_HEADER.toLowerCase()];
    const cookie = req.cookies?.[CSRF_COOKIE] as string | undefined;
    const token = Array.isArray(header) ? header[0] : header;
    if (!token || !cookie || token !== cookie) throw forbidden('CSRF_TOKEN', 'Missing or invalid CSRF token');
    const binding = actor ? actor.sessionTokenHash : 'anonymous';
    if (!this.crypto.verifyCsrfToken(token, binding)) throw forbidden('CSRF_TOKEN', 'Missing or invalid CSRF token');
  }
}
