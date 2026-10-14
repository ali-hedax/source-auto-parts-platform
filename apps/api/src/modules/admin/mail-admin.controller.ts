import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators.js';
import { badRequest } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import { LIMITS, RateLimitService } from '../../common/rate-limit.service.js';
import type { Actor } from '../../common/request-context.js';
import { MailService } from '../mail/mail.service.js';

/**
 * E-mail connection status and a test message for the panel. The test message can only go to the
 * company address of MAIL_FROM (no recipient is taken from the request). SENT in the answer means
 * the SMTP server accepted it; whether it arrived is confirmed by reading that inbox.
 */
@ApiTags('admin/mail')
@Controller('admin/mail')
export class MailAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly limits: RateLimitService,
  ) {}

  @RequirePermissions('settings.manage')
  @Get('status')
  async status() {
    const lastTest = await this.prisma.emailMessage.findFirst({ where: { kind: 'TEST' }, orderBy: { createdAt: 'desc' } });
    return {
      provider: this.mail.provider,
      configured: this.mail.configured,
      from: this.mail.companyAddress,
      lastTest: lastTest
        ? { id: lastTest.id, status: lastTest.status, createdAt: lastTest.createdAt.toISOString(), sentAt: lastTest.sentAt?.toISOString() ?? null, lastError: lastTest.lastError, smtpResponse: lastTest.smtpResponse }
        : null,
    };
  }

  @RequirePermissions('settings.manage')
  @Post('test')
  @HttpCode(202)
  async test(@CurrentActor() actor: Actor) {
    const to = this.mail.companyAddress;
    if (!this.mail.configured || !to) throw badRequest('MAIL_NOT_CONFIGURED', 'Outgoing e-mail is not configured');
    await this.limits.hit(LIMITS.mailTestPerActor, actor.userId);
    const id = await this.prisma.tx((tx) => this.mail.queueTest(tx, { to, createdById: actor.userId }));
    return { id, to, status: 'QUEUED' };
  }
}
