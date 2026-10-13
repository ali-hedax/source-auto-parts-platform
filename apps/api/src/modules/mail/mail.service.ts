import { Inject, Injectable, Logger } from '@nestjs/common';
import { sha256Hex } from '@hedax/domain/server';
import { ENV, type Env } from '../../config/env.js';
import { CryptoService } from '../../common/crypto.service.js';
import { OutboxService } from '../../common/outbox.service.js';
import { PrismaService, type Tx } from '../../common/prisma.service.js';
import { MAIL_TRANSPORT, MailSendError, classifyMailError, type MailTransport } from './mail.transport.js';
import { featuresFor, invitationMail, testMail } from './templates.js';

/** Attempts before a message is marked FAILED (transient errors are retried with the outbox backoff). */
export const MAX_EMAIL_ATTEMPTS = 5;
/** A message stuck in SENDING longer than this (worker crashed mid-send) may be claimed again. */
const STALE_SENDING_MS = 15 * 60_000;

export type DeliveryResult = 'SENT' | 'FAILED' | 'CANCELLED' | 'SKIPPED';

/**
 * Central outgoing e-mail. Callers only queue messages (in their own transaction); the worker
 * delivers them through the outbox. SENT means the SMTP server accepted the message — not that it
 * reached the recipient's inbox. The invitation token is stored only encrypted until the message
 * reaches a final state, and it is never logged.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly crypto: CryptoService,
    @Inject(ENV) private readonly env: Env,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
  ) {}

  /** False when MAIL_PROVIDER=none: nothing is queued and the panel says the link must be shared by hand. */
  get configured(): boolean {
    return this.transport.name !== 'none';
  }

  get provider(): MailTransport['name'] {
    return this.transport.name;
  }

  /** The company address of MAIL_FROM (the only recipient allowed for the test message). */
  get companyAddress(): string | null {
    const from = this.env.MAIL_FROM;
    if (!from) return null;
    return (/<([^>]+)>/.exec(from)?.[1] ?? from).trim().toLowerCase();
  }

  private base(): string {
    return this.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  }

  acceptUrl(token: string): string {
    return `${this.base()}/fa/staff/invite?token=${token}`;
  }

  async queueInvitation(tx: Tx, input: { invitationId: string; to: string; token: string; createdById: string }): Promise<string> {
    const email = await tx.emailMessage.create({
      data: {
        kind: 'STAFF_INVITATION', toAddress: input.to, subject: 'دعوت به پنل مدیریت Source by HEDAX', payload: { invitationId: input.invitationId },
        secretEnc: this.crypto.encrypt(input.token), invitationId: input.invitationId, createdById: input.createdById,
      },
    });
    await this.enqueue(tx, email.id);
    return email.id;
  }

  async queueTest(tx: Tx, input: { to: string; createdById: string }): Promise<string> {
    const email = await tx.emailMessage.create({
      data: { kind: 'TEST', toAddress: input.to, subject: 'ایمیل آزمایشی Source by HEDAX', payload: {}, createdById: input.createdById },
    });
    await this.enqueue(tx, email.id);
    return email.id;
  }

  /** Queued messages of an invitation whose link was replaced or revoked are never sent. */
  async cancelQueuedForInvitation(tx: Tx, invitationId: string): Promise<void> {
    await tx.emailMessage.updateMany({ where: { invitationId, status: 'QUEUED' }, data: { status: 'CANCELLED', secretEnc: null } });
  }

  private async enqueue(tx: Tx, emailId: string): Promise<void> {
    await this.outbox.enqueue(tx, { type: 'email.send', aggregateType: 'email_message', aggregateId: emailId, payload: { emailId }, dedupeKey: `email:${emailId}` });
  }

  /**
   * Worker handler for "email.send". Idempotent: a message is claimed once (QUEUED → SENDING), so a
   * repeated job cannot send it twice. A transient failure throws so the outbox retries it later.
   */
  async deliver(emailId: string): Promise<DeliveryResult> {
    const claimed = await this.prisma.emailMessage.updateMany({
      where: { id: emailId, OR: [{ status: 'QUEUED' }, { status: 'SENDING', updatedAt: { lt: new Date(Date.now() - STALE_SENDING_MS) } }] },
      data: { status: 'SENDING', attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) return 'SKIPPED';
    const msg = await this.prisma.emailMessage.findUniqueOrThrow({ where: { id: emailId } });

    let content: { subject: string; html: string; text: string } | null;
    try {
      content = await this.render(msg);
    } catch {
      await this.finish(emailId, { status: 'FAILED', lastError: 'RENDER_FAILED' });
      return 'FAILED';
    }
    if (!content) {
      await this.finish(emailId, { status: 'CANCELLED', lastError: 'INVITATION_NO_LONGER_ACTIVE' });
      return 'CANCELLED';
    }

    try {
      const accepted = await this.transport.send({ id: emailId, to: msg.toAddress, ...content });
      await this.finish(emailId, { status: 'SENT', sentAt: new Date(), smtpMessageId: accepted.messageId.slice(0, 300), smtpResponse: accepted.response.slice(0, 300), lastError: null });
      this.logger.log(`email ${emailId} (${msg.kind}) accepted by ${this.transport.name}`);
      return 'SENT';
    } catch (e) {
      const err = e instanceof MailSendError ? e : classifyMailError(e);
      const giveUp = err.kind === 'PERMANENT' || msg.attempts >= MAX_EMAIL_ATTEMPTS;
      if (giveUp) {
        await this.finish(emailId, { status: 'FAILED', lastError: err.code });
        this.logger.warn(`email ${emailId} (${msg.kind}) failed after ${msg.attempts} attempt(s): ${err.code}`);
        return 'FAILED';
      }
      await this.prisma.emailMessage.update({ where: { id: emailId }, data: { status: 'QUEUED', lastError: err.code } });
      this.logger.warn(`email ${emailId} (${msg.kind}) attempt ${msg.attempts} failed, will retry: ${err.code}`);
      throw new Error(`EMAIL_RETRY ${err.code}`, { cause: e });
    }
  }

  private async finish(emailId: string, data: Record<string, unknown>): Promise<void> {
    // The token is needed only to build the link; it is wiped once the message is final.
    await this.prisma.emailMessage.update({ where: { id: emailId }, data: { ...data, secretEnc: null } });
  }

  /** Builds the message; null when it must not be sent any more (invitation revoked, accepted, expired or replaced). */
  private async render(msg: { kind: string; invitationId: string | null; secretEnc: string | null; createdAt: Date }) {
    if (msg.kind === 'TEST') return testMail(this.base(), msg.createdAt);
    if (msg.kind !== 'STAFF_INVITATION' || !msg.invitationId || !msg.secretEnc) throw new Error('UNKNOWN_MESSAGE');
    const inv = await this.prisma.staffInvitation.findUnique({ where: { id: msg.invitationId } });
    if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt <= new Date()) return null;
    const token = this.crypto.decrypt(msg.secretEnc);
    if (sha256Hex(token) !== inv.tokenHash) return null; // the link was replaced by a newer one
    const roles = await this.prisma.role.findMany({ where: { id: { in: inv.roleIds } }, include: { permissions: true } });
    return invitationMail({
      baseUrl: this.base(),
      fullName: inv.fullName,
      roleNames: roles.map((r) => r.nameFa),
      requiresMfa: roles.some((r) => r.requiresMfa),
      features: featuresFor(roles.flatMap((r) => r.permissions.map((p) => p.permissionKey))),
      acceptUrl: this.acceptUrl(token),
      expiresAt: inv.expiresAt,
    });
  }
}
