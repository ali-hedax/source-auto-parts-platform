import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ENV, type Env } from '../config/env.js';

/** Key material helpers: AES-256-GCM for stored secrets, HMAC for CSRF tokens and IP hashing. */
@Injectable()
export class CryptoService {
  private readonly encKey: Buffer;
  private readonly hmacKey: Buffer;

  constructor(@Inject(ENV) env: Env) {
    this.encKey = Buffer.from(env.APP_ENCRYPTION_KEY, 'base64');
    if (this.encKey.length !== 32) throw new Error('APP_ENCRYPTION_KEY must decode to exactly 32 bytes');
    this.hmacKey = Buffer.from(env.SESSION_SECRET, 'utf8');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join('.');
  }

  decrypt(payload: string): string {
    const [version, iv, tag, data] = payload.split('.');
    if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unsupported ciphertext');
    const decipher = createDecipheriv('aes-256-gcm', this.encKey, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  }

  hmac(value: string): string {
    return createHmac('sha256', this.hmacKey).update(value).digest('hex');
  }

  /** Pseudonymous IP hash for rate limiting and audit (raw IPs are not stored). */
  hashIp(ip: string | undefined | null): string | null {
    return ip ? this.hmac(`ip:${ip}`) : null;
  }

  /** Double-submit CSRF token: random nonce signed together with the session binding. */
  issueCsrfToken(binding: string): string {
    const nonce = randomBytes(18).toString('base64url');
    return `${nonce}.${this.hmac(`csrf:${binding}:${nonce}`)}`;
  }

  verifyCsrfToken(token: string, binding: string): boolean {
    const [nonce, sig] = token.split('.');
    if (!nonce || !sig) return false;
    const expected = Buffer.from(this.hmac(`csrf:${binding}:${nonce}`), 'hex');
    const given = Buffer.from(sig, 'hex');
    return expected.length === given.length && timingSafeEqual(expected, given);
  }
}
