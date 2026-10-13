import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { MailSendError, SmtpMailTransport, classifyMailError } from '../../src/modules/mail/mail.transport.js';
import { featuresFor, invitationMail } from '../../src/modules/mail/templates.js';

/** A minimal SMTP server that does NOT offer STARTTLS, and records every command it receives. */
function plainSmtpServer(): Promise<{ port: number; commands: string[]; close: () => Promise<void> }> {
  const commands: string[] = [];
  const server = net.createServer((socket) => {
    socket.write('220 fake.test ESMTP\r\n');
    socket.on('data', (buf) => {
      for (const line of buf.toString('utf8').split('\r\n').filter(Boolean)) {
        commands.push(line.split(' ')[0]!.toUpperCase());
        if (/^EHLO/i.test(line)) socket.write('250-fake.test\r\n250 AUTH PLAIN LOGIN\r\n');
        // Like a real server without TLS support: the upgrade is refused (the client must not go on in clear).
        else if (/^STARTTLS/i.test(line)) socket.write('454 4.7.0 TLS not available\r\n');
        else if (/^QUIT/i.test(line)) socket.end('221 bye\r\n');
        else socket.write('250 ok\r\n');
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    port: (server.address() as net.AddressInfo).port,
    commands,
    close: () => new Promise<void>((r) => server.close(() => r())),
  })));
}

describe('SMTP transport security', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it('refuses a server without TLS before sending the login (password never sent in clear)', async () => {
    const srv = await plainSmtpServer();
    close = srv.close;
    const transport = new SmtpMailTransport({ host: '127.0.0.1', port: srv.port, tls: 'starttls', user: 'info@example.test', password: 'not-a-real-secret', from: 'Test <info@example.test>' });
    expect(transport.tlsPolicy).toMatchObject({ requireTLS: true, rejectUnauthorized: true, secure: false });
    const error = await transport.send({ id: '0192f3a0-0000-7000-8000-000000000001', to: 'someone@example.test', subject: 's', html: '<p>x</p>', text: 'x' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailSendError);
    expect(error).toMatchObject({ kind: 'PERMANENT', code: 'SMTP_TLS_FAILED' });
    expect(srv.commands).toContain('STARTTLS');
    expect(srv.commands).not.toContain('AUTH');
    expect(srv.commands).not.toContain('MAIL');
  });

  it('classifies SMTP errors without exposing secrets', () => {
    expect(classifyMailError({ code: 'EAUTH', responseCode: 535, message: 'auth failed for user secret' })).toMatchObject({ kind: 'PERMANENT', code: 'SMTP_AUTH_FAILED 535' });
    expect(classifyMailError({ code: 'EENVELOPE', responseCode: 550 })).toMatchObject({ kind: 'PERMANENT', code: 'SMTP_REJECTED EENVELOPE 550' });
    expect(classifyMailError({ code: 'EMESSAGE', responseCode: 451 })).toMatchObject({ kind: 'TRANSIENT', code: 'SMTP_TEMPORARY EMESSAGE 451' });
    expect(classifyMailError({ code: 'ECONNECTION' })).toMatchObject({ kind: 'TRANSIENT', code: 'SMTP_TEMPORARY ECONNECTION' });
    expect(classifyMailError({ code: 'ETLS' })).toMatchObject({ kind: 'PERMANENT', code: 'SMTP_TLS_FAILED' });
  });
});

describe('invitation e-mail template', () => {
  const base = { baseUrl: 'https://sourcebyhedax.ir', roleNames: ['پشتیبانی'], requiresMfa: true, features: featuresFor(['products.write', 'imports.run']), acceptUrl: 'https://sourcebyhedax.ir/fa/staff/invite?token=abc_DEF-123', expiresAt: new Date('2026-10-16T10:00:00Z') };

  it('escapes the invitee name and keeps production links, RTL and a plain-text version', () => {
    const m = invitationMail({ ...base, fullName: '<script>alert(1)</script> علی' });
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
    expect(m.html).toContain('dir="rtl"');
    expect(m.html).toContain('href="https://sourcebyhedax.ir/fa/staff/invite?token=abc_DEF-123"');
    expect(m.html).toContain('https://sourcebyhedax.ir/fa/staff/login');
    expect(m.text).toContain('https://sourcebyhedax.ir/fa/staff/invite?token=abc_DEF-123');
    expect(m.text).toContain('Google Authenticator');
    expect(m.text).toContain('ورود فهرست کالا، قیمت و موجودی با فایل Excel');
    // Never a password, an authenticator key/QR or recovery codes in the e-mail.
    expect(m.text).not.toMatch(/otpauth:|secret=/i);
  });

  it('leaves out the authenticator steps for a role without two-step verification', () => {
    const m = invitationMail({ ...base, fullName: 'علی', requiresMfa: false, features: [] });
    expect(m.text).not.toContain('Authenticator');
    expect(m.text).not.toContain('کارهایی که');
  });
});
