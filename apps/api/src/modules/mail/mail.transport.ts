import { Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../../config/env.js';

export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Stable id of the EmailMessage row; also sent as the Message-ID so a retry can be recognised. */
  id: string;
  replyTo?: string;
}

/** What the SMTP server said when it accepted the message. Acceptance is not inbox delivery. */
export interface MailAccepted {
  messageId: string;
  response: string;
}

/** Retry later (connection problems, 4xx answers) or give up (5xx answers, refused login, bad address). */
export class MailSendError extends Error {
  constructor(
    readonly kind: 'TRANSIENT' | 'PERMANENT',
    /** Short code safe to store and show: never contains credentials or message content. */
    readonly code: string,
  ) {
    super(code);
    this.name = 'MailSendError';
  }
}

export interface MailTransport {
  readonly name: 'smtp' | 'dev-log' | 'memory' | 'none';
  send(mail: OutgoingMail): Promise<MailAccepted>;
}

export const MAIL_TRANSPORT = Symbol('HEDAX_MAIL_TRANSPORT');

/**
 * Classifies a nodemailer error into a short, secret-free code.
 * SMTP 4xx and network errors are transient; 5xx and authentication failures are permanent.
 */
export function classifyMailError(e: unknown): MailSendError {
  const err = (e ?? {}) as { code?: string; responseCode?: number };
  const code = typeof err.code === 'string' ? err.code : 'ERROR';
  const response = typeof err.responseCode === 'number' ? err.responseCode : null;
  const label = response ? `${code} ${response}` : code;
  if (code === 'EAUTH' || code === 'ENOAUTH') return new MailSendError('PERMANENT', `SMTP_AUTH_FAILED${response ? ` ${response}` : ''}`);
  const command = (e as { command?: string } | null)?.command;
  if (code === 'ETLS' || command === 'STARTTLS' || (code === 'ESOCKET' && /certificate|self[- ]signed|hostname|tls/i.test(String((e as Error)?.message)))) return new MailSendError('PERMANENT', 'SMTP_TLS_FAILED');
  if (response !== null && response >= 500) return new MailSendError('PERMANENT', `SMTP_REJECTED ${label}`);
  return new MailSendError('TRANSIENT', `SMTP_TEMPORARY ${label}`);
}

/**
 * Authenticated SMTP. TLS is mandatory in both modes and the server certificate is always
 * verified against SMTP_HOST (there is deliberately no switch to turn verification off).
 */
export class SmtpMailTransport implements MailTransport {
  readonly name = 'smtp' as const;
  private readonly transporter: Transporter;

  constructor(
    private readonly config: { host: string; port: number; tls: 'starttls' | 'implicit'; user: string; password: string; from: string },
  ) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.tls === 'implicit',
      requireTLS: config.tls === 'starttls',
      auth: { user: config.user, pass: config.password },
      tls: { servername: config.host, minVersion: 'TLSv1.2', rejectUnauthorized: true },
      connectionTimeout: 20_000,
      greetingTimeout: 20_000,
      socketTimeout: 60_000,
      // nodemailer must never log message bodies or credentials.
      logger: false,
      debug: false,
    });
  }

  /** Options handed to nodemailer (for tests of the TLS policy; contains no password). */
  get tlsPolicy() {
    return { secure: this.config.tls === 'implicit', requireTLS: this.config.tls === 'starttls', rejectUnauthorized: true, servername: this.config.host };
  }

  async send(mail: OutgoingMail): Promise<MailAccepted> {
    try {
      const info = await this.transporter.sendMail({
        from: this.config.from,
        to: mail.to,
        ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        messageId: `<${mail.id}@${this.config.host}>`,
        headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
      });
      return { messageId: String(info.messageId ?? ''), response: String(info.response ?? '').slice(0, 300) };
    } catch (e) {
      throw classifyMailError(e);
    }
  }
}

/** Development: records only that a message would be sent (recipient and subject, never the body or links). */
export class DevLogMailTransport implements MailTransport {
  readonly name = 'dev-log' as const;
  private readonly logger = new Logger('DevMail');

  async send(mail: OutgoingMail): Promise<MailAccepted> {
    this.logger.log(`[dev-mail] would send "${mail.subject}" to ${mail.to.replace(/^(.).*@/, '$1***@')}`);
    return { messageId: `dev-${mail.id}`, response: '250 dev-log (not sent)' };
  }
}

/** Automated tests only (refused outside APP_ENV=test): keeps sent messages and can be told to fail. */
export class MemoryMailTransport implements MailTransport {
  readonly name = 'memory' as const;
  readonly sent: OutgoingMail[] = [];
  private failures: MailSendError[] = [];

  failNext(...errors: MailSendError[]): void {
    this.failures.push(...errors);
  }

  async send(mail: OutgoingMail): Promise<MailAccepted> {
    const failure = this.failures.shift();
    if (failure) throw failure;
    this.sent.push(mail);
    return { messageId: `<${mail.id}@memory>`, response: '250 2.0.0 Ok: queued (memory)' };
  }
}

/** No mail service configured: never pretends to send. */
export class UnconfiguredMailTransport implements MailTransport {
  readonly name = 'none' as const;

  async send(): Promise<MailAccepted> {
    throw new MailSendError('PERMANENT', 'MAIL_NOT_CONFIGURED');
  }
}

export function createMailTransport(env: Env): MailTransport {
  if (env.MAIL_PROVIDER === 'smtp' && env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.MAIL_FROM) {
    return new SmtpMailTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, tls: env.SMTP_TLS, user: env.SMTP_USER, password: env.SMTP_PASSWORD, from: env.MAIL_FROM });
  }
  if (env.MAIL_PROVIDER === 'dev-log') return new DevLogMailTransport();
  if (env.MAIL_PROVIDER === 'memory') return new MemoryMailTransport();
  return new UnconfiguredMailTransport();
}
