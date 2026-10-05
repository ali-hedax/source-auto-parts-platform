import type { SmsMessage, SmsProvider } from './sms.provider.js';

/**
 * Kavenegar REST API (https://kavenegar.com/rest.html).
 *
 * - sign-in code: POST /v1/{API-KEY}/verify/lookup.json  receptor, token, template
 *   (the template is created and approved in the Kavenegar panel; its %token is the code)
 * - notification text: POST /v1/{API-KEY}/sms/send.json  receptor, message[, sender]
 * - success: return.status === 200; entries[0].messageid is the provider message id.
 *
 * The API key is part of the URL path, so no URL or raw network error is ever
 * put into an error message or log; only Kavenegar's numeric status is reported
 * (e.g. 418 = insufficient credit, 424 = template not found or not approved).
 */
export interface KavenegarOptions {
  apiKey: string;
  otpTemplate: string;
  sender?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface KavenegarResponse {
  return?: { status?: number };
  entries?: Array<{ messageid?: number | string }>;
}

export class KavenegarSmsProvider implements SmsProvider {
  readonly name = 'kavenegar';
  readonly isDevelopmentOnly = false;

  constructor(private readonly opts: KavenegarOptions) {}

  async send(message: SmsMessage): Promise<{ providerMessageId: string | null }> {
    const receptor = localMobile(message.toE164);
    if (message.template === 'otp') {
      const token = String(message.params.code ?? '');
      // Kavenegar tokens may not contain spaces; HEDAX codes are digits only.
      if (!/^[0-9]{4,10}$/.test(token)) throw new Error('KAVENEGAR_INVALID_TOKEN');
      return this.call('verify/lookup', { receptor, token, template: this.opts.otpTemplate });
    }
    const text = String(message.params.text ?? '').trim();
    if (!text) throw new Error('KAVENEGAR_EMPTY_MESSAGE');
    return this.call('sms/send', { receptor, message: text, ...(this.opts.sender ? { sender: this.opts.sender } : {}) });
  }

  private async call(method: string, params: Record<string, string>): Promise<{ providerMessageId: string | null }> {
    let res: Response;
    try {
      res = await (this.opts.fetchImpl ?? fetch)(`https://api.kavenegar.com/v1/${encodeURIComponent(this.opts.apiKey)}/${method}.json`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams(params).toString(),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 10_000),
      });
    } catch {
      throw new Error('KAVENEGAR_UNREACHABLE');
    }
    let json: KavenegarResponse | null;
    try {
      json = (await res.json()) as KavenegarResponse | null;
    } catch {
      throw new Error(`KAVENEGAR_HTTP_${res.status}`);
    }
    const status = json?.return?.status;
    if (status !== 200) throw new Error(`KAVENEGAR_${status ?? `HTTP_${res.status}`}`);
    const id = json?.entries?.[0]?.messageid;
    return { providerMessageId: id !== undefined && id !== null ? String(id) : null };
  }
}

/** +989121234567 → 09121234567 (the national format Kavenegar documents). */
export function localMobile(e164: string): string {
  const m = /^\+98(9[0-9]{9})$/.exec(e164);
  if (!m) throw new Error('KAVENEGAR_INVALID_RECEPTOR');
  return `0${m[1]}`;
}
