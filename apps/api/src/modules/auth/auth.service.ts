import { Inject, Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { generate as totpGenerate, generateSecret, generateURI, verify as totpVerify } from 'otplib';
import type { MeView } from '@hedax/contracts';
import { DomainError, maskPhone, normalizeIranMobile, toAsciiDigits } from '@hedax/domain';
import { OTP_POLICY, generateOtp, hashOtp, passwordProblems, randomToken, sha256Hex, verifyOtpHash } from '@hedax/domain/server';
import { ENV, type Env } from '../../config/env.js';
import { AuditService } from '../../common/audit.service.js';
import { SessionService } from '../../common/auth/session.service.js';
import { CryptoService } from '../../common/crypto.service.js';
import { badRequest, conflict, forbidden, tooMany, unauthorized } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import { LIMITS, RateLimitService } from '../../common/rate-limit.service.js';
import type { Actor } from '../../common/request-context.js';
import { SMS_PROVIDER, type SmsProvider } from '../../integrations/sms/sms.provider.js';

// Used when the email does not exist so timing does not reveal account existence.
const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$0Q2m1nVvOq1c0x4m7PYEZ3fYg6T2S7cTzVh0t4lQy0E';
const ARGON_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly crypto: CryptoService,
    private readonly limits: RateLimitService,
    private readonly audit: AuditService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ---------------------------------------------------------------------------
  // Customer: mobile + one-time code
  // ---------------------------------------------------------------------------

  async requestOtp(mobileInput: string, ipHash: string | null): Promise<{ sent: true; expiresInSeconds: number; resendAfterSeconds: number; devCode?: string }> {
    const parsed = normalizeIranMobile(mobileInput);
    if (!parsed.ok) throw badRequest('INVALID_MOBILE', 'Enter a valid Iranian mobile number');
    await this.limits.hit(LIMITS.otpPerIp, ipHash);
    await this.limits.hit(LIMITS.otpPerPhone, parsed.e164);

    const last = await this.prisma.otpChallenge.findFirst({ where: { mobileE164: parsed.e164 }, orderBy: { createdAt: 'desc' } });
    if (last && Date.now() - last.createdAt.getTime() < OTP_POLICY.resendCooldownSeconds * 1000) {
      throw tooMany('OTP_COOLDOWN', 'Please wait before requesting a new code');
    }
    const code = generateOtp();
    await this.prisma.$transaction([
      // Any older open challenge for this number becomes unusable.
      this.prisma.otpChallenge.updateMany({ where: { mobileE164: parsed.e164, consumedAt: null }, data: { consumedAt: new Date() } }),
      this.prisma.otpChallenge.create({
        data: {
          mobileE164: parsed.e164,
          codeHash: hashOtp(code, parsed.e164, this.env.OTP_PEPPER),
          expiresAt: new Date(Date.now() + OTP_POLICY.ttlSeconds * 1000),
          ipHash,
        },
      }),
    ]);
    await this.sms.send({ toE164: parsed.e164, template: 'otp', params: { code } });
    const devVisible = this.sms.isDevelopmentOnly && this.env.APP_ENV === 'development';
    return {
      sent: true,
      expiresInSeconds: OTP_POLICY.ttlSeconds,
      resendAfterSeconds: OTP_POLICY.resendCooldownSeconds,
      ...(devVisible ? { devCode: code } : {}),
    };
  }

  /** Verifies the code (single use, limited attempts, expiry) and returns a new customer session. */
  async verifyOtp(mobileInput: string, codeInput: string, meta: { ipHash: string | null; userAgent?: string }) {
    const parsed = normalizeIranMobile(mobileInput);
    if (!parsed.ok) throw badRequest('INVALID_MOBILE');
    await this.limits.hit(LIMITS.otpVerifyPerIp, meta.ipHash);
    const code = codeInput.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { mobileE164: parsed.e164, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) throw badRequest('OTP_INVALID_OR_EXPIRED', 'The code is invalid or has expired');
    // Count the attempt before comparing, atomically bounded by the max.
    const counted = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, attempts: { lt: OTP_POLICY.maxVerifyAttempts } },
      data: { attempts: { increment: 1 } },
    });
    if (counted.count !== 1) throw tooMany('OTP_ATTEMPTS_EXCEEDED', 'Too many attempts; request a new code');
    if (!verifyOtpHash(code, parsed.e164, this.env.OTP_PEPPER, challenge.codeHash)) {
      throw badRequest('OTP_INVALID_OR_EXPIRED', 'The code is invalid or has expired');
    }
    const consumed = await this.prisma.otpChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (consumed.count !== 1) throw badRequest('OTP_INVALID_OR_EXPIRED');

    const user = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { mobileE164: parsed.e164 } });
      if (existing) {
        if (existing.kind !== 'CUSTOMER') throw forbidden('USE_STAFF_LOGIN', 'This number belongs to a staff account');
        if (existing.status !== 'ACTIVE') throw forbidden('ACCOUNT_SUSPENDED', 'This account is not active');
        return tx.user.update({ where: { id: existing.id }, data: { lastLoginAt: new Date(), mobileVerifiedAt: existing.mobileVerifiedAt ?? new Date() } });
      }
      const created = await tx.user.create({
        data: { kind: 'CUSTOMER', mobileE164: parsed.e164, mobileVerifiedAt: new Date(), lastLoginAt: new Date() },
      });
      await tx.customerProfile.create({ data: { userId: created.id } });
      return created;
    });
    const { token } = await this.sessions.create({
      userId: user.id, kind: 'CUSTOMER', authVersion: user.authVersion, mfaVerified: false, ipHash: meta.ipHash,
      ...(meta.userAgent ? { userAgent: meta.userAgent } : {}),
    });
    return { token, userId: user.id, isNew: !user.fullName };
  }

  // ---------------------------------------------------------------------------
  // Staff: invitation → password → TOTP MFA
  // ---------------------------------------------------------------------------

  async staffLogin(emailInput: string, password: string, meta: { ipHash: string | null; userAgent?: string }) {
    const email = emailInput.trim().toLowerCase();
    await this.limits.hit(LIMITS.staffLoginPerIp, meta.ipHash);
    await this.limits.hit(LIMITS.staffLoginPerEmail, sha256Hex(email));
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } } },
    });
    const valid = await argon2.verify(user?.passwordHash ?? DUMMY_HASH, password).catch(() => false);
    if (!user || user.kind !== 'STAFF' || !valid) throw unauthorized('INVALID_CREDENTIALS', 'Email or password is incorrect');
    if (user.status !== 'ACTIVE') throw forbidden('ACCOUNT_SUSPENDED', 'This account is suspended');

    const mfaRequired = user.roles.some((r) => r.role.requiresMfa);
    if (user.mfaEnabledAt && user.mfaSecretEnc) {
      const challengeToken = randomToken(24);
      await this.prisma.mfaChallenge.create({
        data: { tokenHash: sha256Hex(challengeToken), userId: user.id, purpose: 'LOGIN', expiresAt: new Date(Date.now() + 5 * 60_000) },
      });
      return { kind: 'MFA_REQUIRED' as const, challengeId: challengeToken };
    }
    // Not enrolled yet: a restricted session that can only complete MFA enrollment when required.
    const { token } = await this.sessions.create({
      userId: user.id, kind: 'STAFF', authVersion: user.authVersion, mfaVerified: false, ipHash: meta.ipHash,
      ...(meta.userAgent ? { userAgent: meta.userAgent } : {}),
    });
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { kind: mfaRequired ? ('MFA_ENROLLMENT_REQUIRED' as const) : ('SIGNED_IN' as const), token };
  }

  /**
   * Fresh second-factor confirmation for a sensitive action (spec §13: granting
   * the owner role). Needs a current authenticator code of the acting staff
   * member; an already used code is refused (replay protection).
   */
  async confirmStepUp(actor: Actor, code: string | undefined): Promise<void> {
    if (!code) throw forbidden('MFA_CONFIRMATION_REQUIRED', 'Confirm with a current authenticator code');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { mfaSecretEnc: true } });
    if (!user.mfaSecretEnc) throw forbidden('MFA_CONFIRMATION_REQUIRED', 'Two-step verification is not set up for this account');
    await this.limits.hit(LIMITS.staffLoginPerEmail, `step-up:${actor.userId}`);
    if (!(await this.checkTotp(actor.userId, user.mfaSecretEnc, toAsciiDigits(code.trim())))) throw badRequest('MFA_CODE_INVALID', 'The code is not valid');
  }

  // ---------------------------------------------------------------------------
  // Staff: own account (name, e-mail, password)
  // ---------------------------------------------------------------------------

  async updateOwnName(actor: Actor, fullName: string): Promise<{ fullName: string }> {
    if (actor.kind !== 'STAFF') throw forbidden();
    await this.prisma.tx(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { fullName: true } });
      await tx.user.update({ where: { id: actor.userId }, data: { fullName } });
      await this.audit.record(tx, { action: 'account.name.changed', entityType: 'user', entityId: actor.userId, before: { fullName: before.fullName }, after: { fullName } });
    });
    return { fullName };
  }

  /** Needs the current password and, when enrolled, a fresh authenticator code. Ends every session.
   *  No mail service is connected yet, so the new address cannot be confirmed by a link. */
  async changeOwnEmail(actor: Actor, input: { email: string; currentPassword: string; code?: string | undefined }): Promise<{ signedOut: boolean }> {
    const user = await this.checkOwnPassword(actor, input.currentPassword);
    const email = input.email.trim().toLowerCase();
    if (email === user.email) return { signedOut: false };
    // Checked before the code is used, so a taken address does not burn the code.
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) throw conflict('EMAIL_IN_USE');
    if (user.mfaEnabledAt) await this.confirmStepUp(actor, input.code);
    await this.prisma.tx(async (tx) => {
      if (await tx.user.findUnique({ where: { email }, select: { id: true } })) throw conflict('EMAIL_IN_USE');
      await tx.user.update({ where: { id: user.id }, data: { email } });
      await this.audit.record(tx, { action: 'account.email.changed', entityType: 'user', entityId: user.id, before: { email: user.email }, after: { email } });
    });
    await this.sessions.revokeAllForUser(user.id, 'EMAIL_CHANGED');
    return { signedOut: true };
  }

  /** Needs the current password and, when enrolled, a fresh authenticator code. Ends every session. */
  async changeOwnPassword(actor: Actor, input: { currentPassword: string; newPassword: string; code?: string | undefined }): Promise<{ signedOut: true }> {
    const user = await this.checkOwnPassword(actor, input.currentPassword);
    const problems = passwordProblems(input.newPassword, [user.email ?? '', user.fullName ?? ''].filter(Boolean));
    if (problems.length) throw badRequest('WEAK_PASSWORD', 'Choose a stronger password', { problems });
    if (user.mfaEnabledAt) await this.confirmStepUp(actor, input.code);
    const passwordHash = await argon2.hash(input.newPassword, ARGON_OPTIONS);
    await this.prisma.tx(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      // Records that the password changed, never the password or its hash.
      await this.audit.record(tx, { action: 'account.password.changed', entityType: 'user', entityId: user.id });
    });
    await this.sessions.revokeAllForUser(user.id, 'PASSWORD_CHANGED');
    return { signedOut: true };
  }

  /** Rate-limited check of the signed-in staff member's current password. */
  private async checkOwnPassword(actor: Actor, currentPassword: string) {
    if (actor.kind !== 'STAFF') throw forbidden();
    await this.limits.hit(LIMITS.staffLoginPerEmail, `account:${actor.userId}`);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
    const valid = await argon2.verify(user.passwordHash ?? DUMMY_HASH, currentPassword).catch(() => false);
    if (!valid) throw badRequest('CURRENT_PASSWORD_INVALID', 'The current password is incorrect');
    return user;
  }

  private async checkTotp(userId: string, secretEnc: string, code: string): Promise<boolean> {
    const secret = this.crypto.decrypt(secretEnc);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { mfaLastTimeStep: true } });
    const result = await totpVerify({
      secret,
      token: code,
      epochTolerance: [30, 0],
      ...(user.mfaLastTimeStep !== null ? { afterTimeStep: user.mfaLastTimeStep } : {}),
    });
    if (!result.valid) return false;
    const step = 'timeStep' in result && typeof result.timeStep === 'number' ? result.timeStep : null;
    if (step !== null) await this.prisma.user.update({ where: { id: userId }, data: { mfaLastTimeStep: step } });
    return true;
  }

  async completeMfaLogin(challengeToken: string, codeInput: string, meta: { ipHash: string | null; userAgent?: string }) {
    const code = toAsciiDigits(codeInput);
    await this.limits.hit(LIMITS.staffLoginPerIp, meta.ipHash);
    const challenge = await this.prisma.mfaChallenge.findUnique({ where: { tokenHash: sha256Hex(challengeToken) }, include: { user: true } });
    if (!challenge || challenge.purpose !== 'LOGIN' || challenge.consumedAt || challenge.expiresAt <= new Date() || challenge.attempts >= 5) {
      throw unauthorized('MFA_CHALLENGE_INVALID', 'Sign in again');
    }
    await this.prisma.mfaChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    const user = challenge.user;
    let ok = false;
    let usedRecovery = false;
    if (/^\d{6}$/.test(code) && user.mfaSecretEnc) {
      ok = await this.checkTotp(user.id, user.mfaSecretEnc, code);
    } else {
      const recovery = await this.prisma.mfaRecoveryCode.findFirst({ where: { userId: user.id, usedAt: null, codeHash: sha256Hex(code.toUpperCase()) } });
      if (recovery) {
        const used = await this.prisma.mfaRecoveryCode.updateMany({ where: { id: recovery.id, usedAt: null }, data: { usedAt: new Date() } });
        ok = used.count === 1;
        usedRecovery = ok;
      }
    }
    if (!ok) throw unauthorized('MFA_CODE_INVALID', 'The code is not valid');
    await this.prisma.mfaChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
    if (usedRecovery) {
      await this.prisma.$transaction(async (tx) => this.audit.record(tx, { action: 'auth.recovery_code.used', entityType: 'user', entityId: user.id, actorKind: 'STAFF', actorId: user.id }));
    }
    const { token } = await this.sessions.create({
      userId: user.id, kind: 'STAFF', authVersion: user.authVersion, mfaVerified: true, ipHash: meta.ipHash,
      ...(meta.userAgent ? { userAgent: meta.userAgent } : {}),
    });
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { token };
  }

  async startMfaEnrollment(actor: Actor) {
    if (actor.kind !== 'STAFF') throw forbidden();
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
    if (user.mfaEnabledAt) throw conflict('MFA_ALREADY_ENABLED');
    const secret = generateSecret();
    const challengeToken = randomToken(24);
    await this.prisma.mfaChallenge.create({
      data: {
        tokenHash: sha256Hex(challengeToken),
        userId: user.id,
        purpose: 'ENROLL',
        pendingSecretEnc: this.crypto.encrypt(secret),
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });
    const uri = generateURI({ issuer: 'HEDAX', label: user.email ?? user.id, secret });
    return { challengeId: challengeToken, otpauthUri: uri, secret };
  }

  async confirmMfaEnrollment(actor: Actor, challengeToken: string, code: string) {
    const challenge = await this.prisma.mfaChallenge.findUnique({ where: { tokenHash: sha256Hex(challengeToken) } });
    if (!challenge || challenge.userId !== actor.userId || challenge.purpose !== 'ENROLL' || challenge.consumedAt || challenge.expiresAt <= new Date() || !challenge.pendingSecretEnc) {
      throw badRequest('MFA_CHALLENGE_INVALID');
    }
    if (challenge.attempts >= 5) throw tooMany('MFA_ATTEMPTS_EXCEEDED');
    await this.prisma.mfaChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    const secret = this.crypto.decrypt(challenge.pendingSecretEnc);
    const result = await totpVerify({ secret, token: toAsciiDigits(code), epochTolerance: [30, 0] });
    if (!result.valid) throw badRequest('MFA_CODE_INVALID', 'The code is not valid');

    const recoveryCodes = Array.from({ length: 10 }, () => {
      const raw = randomToken(6).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
      return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: actor.userId }, data: { mfaSecretEnc: challenge.pendingSecretEnc, mfaEnabledAt: new Date() } });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: actor.userId } });
      await tx.mfaRecoveryCode.createMany({ data: recoveryCodes.map((c) => ({ userId: actor.userId, codeHash: sha256Hex(c) })) });
      await tx.mfaChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
      await tx.session.update({ where: { id: actor.sessionId }, data: { mfaVerified: true } });
      await this.audit.record(tx, { action: 'auth.mfa.enabled', entityType: 'user', entityId: actor.userId });
    });
    // Shown once; only hashes are stored.
    return { recoveryCodes };
  }

  async acceptInvitation(input: { token: string; fullName: string; password: string }) {
    const problems = passwordProblems(input.password, [input.fullName]);
    if (problems.length) throw badRequest('WEAK_PASSWORD', 'Choose a stronger password', { problems });
    const invitation = await this.prisma.staffInvitation.findUnique({ where: { tokenHash: sha256Hex(input.token) } });
    if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) {
      throw badRequest('INVITATION_INVALID', 'This invitation is no longer valid');
    }
    const passwordHash = await argon2.hash(input.password, ARGON_OPTIONS);
    return this.prisma.tx(async (tx) => {
      const claimed = await tx.staffInvitation.updateMany({ where: { id: invitation.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
      if (claimed.count !== 1) throw badRequest('INVITATION_INVALID');
      const exists = await tx.user.findUnique({ where: { email: invitation.email } });
      if (exists) throw conflict('EMAIL_IN_USE');
      const roles = await tx.role.findMany({ where: { id: { in: invitation.roleIds } } });
      if (roles.length === 0) throw badRequest('INVITATION_INVALID', 'The invitation has no valid roles');
      const user = await tx.user.create({
        data: { kind: 'STAFF', email: invitation.email, fullName: input.fullName, passwordHash },
      });
      await tx.userRole.createMany({ data: roles.map((r) => ({ userId: user.id, roleId: r.id, grantedById: invitation.invitedById })) });
      await this.audit.record(tx, {
        action: 'staff.invitation.accepted', entityType: 'user', entityId: user.id, actorKind: 'STAFF', actorId: user.id,
        after: { email: invitation.email, roles: roles.map((r) => r.key) },
      });
      return { userId: user.id, requiresMfa: roles.some((r) => r.requiresMfa) };
    });
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, ARGON_OPTIONS);
  }

  async me(actor: Actor): Promise<MeView> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
      include: { customerProfile: { include: { customerGroup: true } } },
    });
    const [unreadNotifications, unreadMessages] = await Promise.all([
      this.prisma.notification.count({ where: { userId: actor.userId, readAt: null } }),
      this.unreadMessageCount(actor),
    ]);
    const profile = user.customerProfile;
    return {
      id: user.id,
      kind: user.kind,
      displayName: user.fullName,
      mobileMasked: user.mobileE164 ? maskPhone(user.mobileE164) : null,
      email: user.email,
      customerType: profile?.customerType ?? null,
      customerGroup:
        profile?.customerGroup && profile.groupStatus !== 'NONE'
          ? { id: profile.customerGroup.id, name: user.preferredLocale === 'en' ? profile.customerGroup.nameEn : profile.customerGroup.nameFa, status: profile.groupStatus as 'PENDING' | 'APPROVED' | 'REJECTED' }
          : null,
      permissions: [...actor.permissions].sort(),
      mfaEnabled: !!user.mfaEnabledAt,
      preferredLocale: user.preferredLocale,
      unreadNotifications,
      unreadMessages,
    };
  }

  private async unreadMessageCount(actor: Actor): Promise<number> {
    if (actor.kind !== 'CUSTOMER') return 0;
    const rows = await this.prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*)::bigint AS n
        FROM "message" m
        JOIN "conversation" c ON c."id" = m."conversation_id"
        LEFT JOIN "message_read_cursor" rc ON rc."conversation_id" = c."id" AND rc."user_id" = ${actor.userId}::uuid
        LEFT JOIN "message" lr ON lr."id" = rc."last_read_message_id"
       WHERE c."customer_id" = ${actor.userId}::uuid
         AND m."deleted_at" IS NULL
         AND m."sender_kind" <> 'CUSTOMER'
         AND (lr."created_at" IS NULL OR m."created_at" > lr."created_at")`;
    return Number(rows[0]?.n ?? 0n);
  }

  /** Test helper for integration tests only. */
  async _totpForTests(secret: string): Promise<string> {
    if (this.env.APP_ENV !== 'test') throw new DomainError('FORBIDDEN');
    return totpGenerate({ secret });
  }
}
