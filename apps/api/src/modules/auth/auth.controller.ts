import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  acceptInvitationSchema, accountEmailSchema, accountNameSchema, accountPasswordSchema, otpRequestSchema, otpVerifySchema, staffLoginSchema, staffMfaSchema,
} from '@hedax/contracts';
import { z } from 'zod';
import { CurrentActor, OptionalActor, Public } from '../../common/auth/decorators.js';
import { SessionService } from '../../common/auth/session.service.js';
import { forbidden, notFound } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import { currentContext, type Actor } from '../../common/request-context.js';
import { ApiZodBody, zod } from '../../common/zod.js';
import { CartService } from '../cart/cart.service.js';
import { AuthService } from './auth.service.js';

const enrollConfirmSchema = z.object({ challengeId: z.string().min(10).max(200), code: z.string().trim().regex(/^[0-9۰-۹]{6}$/) });

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly carts: CartService,
    private readonly prisma: PrismaService,
  ) {}

  private meta(req: Request) {
    const ua = req.headers['user-agent'];
    return { ipHash: currentContext()?.ipHash ?? null, ...(ua ? { userAgent: ua } : {}) };
  }

  /** Issues (or refreshes) the double-submit CSRF cookie for the current session or anonymous visitor. */
  @Public()
  @Get('auth/csrf')
  csrf(@OptionalActor() actor: Actor | null, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return { token: this.sessions.setCsrfCookie(res, actor ? actor.sessionTokenHash : 'anonymous') };
  }

  /** Rate-limited per phone and per IP; never reveals whether an account exists. */
  @Public()
  @Post('auth/otp/request')
  @HttpCode(200)
  @ApiZodBody(otpRequestSchema)
  requestOtp(@Body(zod(otpRequestSchema)) body: z.infer<typeof otpRequestSchema>) {
    return this.auth.requestOtp(body.mobile, currentContext()?.ipHash ?? null);
  }

  @Public()
  @Post('auth/otp/verify')
  @HttpCode(200)
  @ApiZodBody(otpVerifySchema)
  async verifyOtp(@Body(zod(otpVerifySchema)) body: z.infer<typeof otpVerifySchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.verifyOtp(body.mobile, body.code, this.meta(req));
    this.sessions.setCookies(res, result.token, 'CUSTOMER');
    await this.carts.mergeGuestCart(req, res, result.userId);
    return { signedIn: true, isNew: result.isNew };
  }

  @Public()
  @Post('auth/staff/login')
  @HttpCode(200)
  @ApiZodBody(staffLoginSchema)
  async staffLogin(@Body(zod(staffLoginSchema)) body: z.infer<typeof staffLoginSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.staffLogin(body.email, body.password, this.meta(req));
    if (result.kind === 'MFA_REQUIRED') return { status: result.kind, challengeId: result.challengeId };
    this.sessions.setCookies(res, result.token, 'STAFF');
    return { status: result.kind };
  }

  @Public()
  @Post('auth/staff/mfa')
  @HttpCode(200)
  @ApiZodBody(staffMfaSchema)
  async staffMfa(@Body(zod(staffMfaSchema)) body: z.infer<typeof staffMfaSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { token } = await this.auth.completeMfaLogin(body.challengeId, body.code, this.meta(req));
    this.sessions.setCookies(res, token, 'STAFF');
    return { status: 'SIGNED_IN' };
  }

  /** Reachable by a staff session that has not completed MFA yet (enrollment flow). */
  @Public()
  @Post('auth/staff/mfa/enroll')
  @HttpCode(200)
  startEnroll(@OptionalActor() actor: Actor | null) {
    if (!actor || actor.kind !== 'STAFF') throw forbidden();
    return this.auth.startMfaEnrollment(actor);
  }

  @Public()
  @Post('auth/staff/mfa/enroll/confirm')
  @HttpCode(200)
  confirmEnroll(@OptionalActor() actor: Actor | null, @Body(zod(enrollConfirmSchema)) body: z.infer<typeof enrollConfirmSchema>) {
    if (!actor || actor.kind !== 'STAFF') throw forbidden();
    return this.auth.confirmMfaEnrollment(actor, body.challengeId, body.code);
  }

  @Public()
  @Post('auth/invitations/accept')
  @HttpCode(200)
  @ApiZodBody(acceptInvitationSchema)
  acceptInvitation(@Body(zod(acceptInvitationSchema)) body: z.infer<typeof acceptInvitationSchema>) {
    return this.auth.acceptInvitation(body);
  }

  @Public()
  @Post('auth/logout')
  @HttpCode(200)
  async logout(@OptionalActor() actor: Actor | null, @Res({ passthrough: true }) res: Response) {
    if (actor) await this.sessions.revoke(actor.sessionId, actor.userId, 'LOGOUT');
    this.sessions.clearCookies(res);
    this.sessions.setCsrfCookie(res, 'anonymous');
    return { signedOut: true };
  }

  @Get('me')
  me(@CurrentActor() actor: Actor, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    return this.auth.me(actor);
  }

  /** Staff "my account": the signed-in staff member's own name. */
  @Patch('me/name')
  @ApiZodBody(accountNameSchema)
  updateOwnName(@CurrentActor() actor: Actor, @Body(zod(accountNameSchema)) body: z.infer<typeof accountNameSchema>) {
    return this.auth.updateOwnName(actor, body.fullName);
  }

  /** Current password + authenticator code; every session ends, so sign in again with the new e-mail. */
  @Post('me/email')
  @HttpCode(200)
  @ApiZodBody(accountEmailSchema)
  async changeOwnEmail(@CurrentActor() actor: Actor, @Body(zod(accountEmailSchema)) body: z.infer<typeof accountEmailSchema>, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.changeOwnEmail(actor, body);
    if (result.signedOut) this.signedOut(res);
    return result;
  }

  /** Current password + authenticator code + a strong new password; every session ends. */
  @Post('me/password')
  @HttpCode(200)
  @ApiZodBody(accountPasswordSchema)
  async changeOwnPassword(@CurrentActor() actor: Actor, @Body(zod(accountPasswordSchema)) body: z.infer<typeof accountPasswordSchema>, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.changeOwnPassword(actor, body);
    this.signedOut(res);
    return result;
  }

  private signedOut(res: Response): void {
    this.sessions.clearCookies(res);
    this.sessions.setCsrfCookie(res, 'anonymous');
  }

  @Get('auth/sessions')
  async listSessions(@CurrentActor() actor: Actor) {
    const rows = await this.prisma.session.findMany({
      where: { userId: actor.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
    });
    return rows.map((s) => ({
      id: s.id,
      current: s.tokenHash === actor.sessionTokenHash,
      userAgent: s.userAgent,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
    }));
  }

  @Delete('auth/sessions/:id')
  async revokeSession(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    const session = await this.prisma.session.findFirst({ where: { id, userId: actor.userId } });
    if (!session) throw notFound();
    await this.sessions.revoke(session.id, actor.userId, 'USER_REVOKED');
    return { revoked: true, current: session.tokenHash === actor.sessionTokenHash };
  }
}

