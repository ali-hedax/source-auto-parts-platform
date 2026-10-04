import { Inject, Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { CSRF_COOKIE, SESSION_COOKIE } from '@hedax/contracts';
import { randomToken, sha256Hex } from '@hedax/domain/server';
import { ENV, type Env } from '../../config/env.js';
import { CryptoService } from '../crypto.service.js';
import { PrismaService } from '../prisma.service.js';
import { RealtimeBus } from '../realtime-bus.js';
import type { Actor } from '../request-context.js';

const TOUCH_INTERVAL_MS = 5 * 60_000;

/**
 * Server-side sessions: the cookie holds a random token, the DB holds only its
 * SHA-256. Revocation (logout, suspension, role change) takes effect on the
 * next request and is pushed to live sockets through the RealtimeBus.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly bus: RealtimeBus,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async create(input: { userId: string; kind: 'CUSTOMER' | 'STAFF'; authVersion: number; mfaVerified: boolean; userAgent?: string; ipHash: string | null }) {
    const token = randomToken(32);
    const ttlHours = input.kind === 'STAFF' ? this.env.SESSION_TTL_HOURS_STAFF : this.env.SESSION_TTL_HOURS_CUSTOMER;
    const session = await this.prisma.session.create({
      data: {
        tokenHash: sha256Hex(token),
        userId: input.userId,
        kind: input.kind,
        authVersion: input.authVersion,
        mfaVerified: input.mfaVerified,
        userAgent: input.userAgent?.slice(0, 200) ?? null,
        ipHash: input.ipHash,
        expiresAt: new Date(Date.now() + ttlHours * 3_600_000),
      },
    });
    return { token, session };
  }

  /** Resolves a cookie token to an Actor, or null if missing/expired/revoked/stale. */
  async resolve(token: string | undefined): Promise<Actor | null> {
    if (!token || token.length < 20 || token.length > 100) return null;
    const tokenHash = sha256Hex(token);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            customerProfile: true,
            roles: { include: { role: { include: { permissions: true } } } },
          },
        },
      },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
    const user = session.user;
    if (user.status !== 'ACTIVE' || user.authVersion !== session.authVersion) return null;

    const permissions = new Set<string>();
    let isOwner = false;
    let requiresMfa = false;
    if (user.kind === 'STAFF') {
      for (const ur of user.roles) {
        if (ur.role.isOwner) isOwner = true;
        if (ur.role.requiresMfa) requiresMfa = true;
        for (const rp of ur.role.permissions) permissions.add(rp.permissionKey);
      }
    }
    if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
    }
    const profile = user.customerProfile;
    return {
      userId: user.id,
      kind: user.kind,
      sessionId: session.id,
      sessionTokenHash: tokenHash,
      authVersion: user.authVersion,
      mfaVerified: session.mfaVerified,
      permissions,
      isOwner,
      requiresMfa,
      approvedCustomerGroupId: profile?.groupStatus === 'APPROVED' ? (profile.customerGroupId ?? null) : null,
      displayName: user.fullName,
      locale: user.preferredLocale,
    };
  }

  async revoke(sessionId: string, userId: string, reason: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });
    this.bus.publish({ type: 'session.revoked', sessionIds: [sessionId], userId });
  }

  /** Revokes every session of a user and bumps authVersion so stale cookies die immediately. */
  async revokeAllForUser(userId: string, reason: string): Promise<void> {
    const sessions = await this.prisma.session.findMany({ where: { userId, revokedAt: null }, select: { id: true } });
    await this.prisma.$transaction([
      this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } }),
      this.prisma.user.update({ where: { id: userId }, data: { authVersion: { increment: 1 } } }),
    ]);
    this.bus.publish({ type: 'session.revoked', sessionIds: sessions.map((s) => s.id), userId });
    this.bus.publish({ type: 'user.auth-changed', userId });
  }

  setCookies(res: Response, token: string, kind: 'CUSTOMER' | 'STAFF'): void {
    const maxAge = (kind === 'STAFF' ? this.env.SESSION_TTL_HOURS_STAFF : this.env.SESSION_TTL_HOURS_CUSTOMER) * 3_600_000;
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, secure: this.env.COOKIE_SECURE, sameSite: 'lax', path: '/', maxAge });
    this.setCsrfCookie(res, sha256Hex(token));
  }

  setCsrfCookie(res: Response, binding: string): string {
    const csrf = this.crypto.issueCsrfToken(binding);
    // Readable by the page so it can echo it in X-CSRF-Token (double-submit).
    res.cookie(CSRF_COOKIE, csrf, { httpOnly: false, secure: this.env.COOKIE_SECURE, sameSite: 'lax', path: '/' });
    return csrf;
  }

  clearCookies(res: Response): void {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.clearCookie(CSRF_COOKIE, { path: '/' });
  }
}
