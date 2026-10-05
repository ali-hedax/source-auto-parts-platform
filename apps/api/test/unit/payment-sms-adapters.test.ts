import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';
import { KavenegarSmsProvider, localMobile } from '../../src/integrations/sms/kavenegar.provider.js';
import { ZarinpalPaymentProvider } from '../../src/modules/payments/zarinpal.provider.js';

// Obviously fake: the unit tests never reach Zarinpal.
const MERCHANT = '00000000-0000-4000-8000-00000000abcd';
const AUTHORITY = 'A00000000000000000000000000217885159';

interface Call { url: string; body: Record<string, unknown> | string }

/** A fetch stand-in that records each call and answers from a list (in order). */
function fakeFetch(responses: Array<{ status?: number; json?: unknown; text?: string }>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    const raw = typeof init?.body === 'string' ? init.body : '';
    calls.push({ url, body: raw.startsWith('{') ? (JSON.parse(raw) as Record<string, unknown>) : raw });
    const next = responses.shift() ?? { status: 500, text: 'no more responses' };
    return new Response(next.json !== undefined ? JSON.stringify(next.json) : (next.text ?? ''), { status: next.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const zarinpal = (responses: Parameters<typeof fakeFetch>[0], sandbox = false) => {
  const f = fakeFetch(responses);
  return { provider: new ZarinpalPaymentProvider({ merchantId: MERCHANT, sandbox, sessionMinutes: 15, fetchImpl: f.impl }), calls: f.calls };
};

describe('Zarinpal adapter (REST v4)', () => {
  it('creates a payment in IRR rials as-is (no ×10, no Toman) and redirects to StartPay', async () => {
    const { provider, calls } = zarinpal([{ json: { data: { code: 100, message: 'Success', authority: AUTHORITY, fee_type: 'Merchant', fee: 3750 }, errors: [] } }]);
    const created = await provider.create({ attemptId: 'att-1', amountIrr: 125_000n, callbackUrl: 'https://shop.example/api/v1/payments/callback/zarinpal', description: 'HX-O-TEST', customerMobile: '+989121234567' });
    expect(calls[0]?.url).toBe('https://payment.zarinpal.com/pg/v4/payment/request.json');
    expect(calls[0]?.body).toMatchObject({ merchant_id: MERCHANT, amount: 125000, currency: 'IRR', callback_url: 'https://shop.example/api/v1/payments/callback/zarinpal', metadata: { order_id: 'att-1' } });
    // The customer's mobile number is not shared with the gateway.
    expect(JSON.stringify(calls[0]?.body)).not.toContain('912');
    expect(created.providerReference).toBe(AUTHORITY);
    expect(created.redirectUrl).toBe(`https://payment.zarinpal.com/pg/StartPay/${AUTHORITY}`);
  });

  it('uses the sandbox host when configured', async () => {
    const { provider, calls } = zarinpal([{ json: { data: { code: 100, authority: `S${AUTHORITY.slice(1)}` }, errors: [] } }], true);
    const created = await provider.create({ attemptId: 'a', amountIrr: 10_000n, callbackUrl: 'https://x/cb', description: 'd', customerMobile: null });
    expect(calls[0]?.url).toBe('https://sandbox.zarinpal.com/pg/v4/payment/request.json');
    expect(created.redirectUrl).toMatch(/^https:\/\/sandbox\.zarinpal\.com\/pg\/StartPay\/S/);
  });

  it('refuses a failed request without a usable authority', async () => {
    const { provider } = zarinpal([{ status: 422, json: { data: {}, errors: { code: -9, message: 'The input params invalid, validation error.' } } }]);
    await expect(provider.create({ attemptId: 'a', amountIrr: 10_000n, callbackUrl: 'https://x/cb', description: 'd', customerMobile: null })).rejects.toThrow('ZARINPAL_REQUEST_FAILED_-9');
  });

  it('accepts only well-formed authorities from the (untrusted) callback', () => {
    const { provider } = zarinpal([]);
    expect(provider.referenceFromCallback({ Authority: AUTHORITY, Status: 'OK' })).toBe(AUTHORITY);
    expect(provider.referenceFromCallback({ Authority: 'A123', Status: 'OK' })).toBeNull();
    expect(provider.referenceFromCallback({ Authority: `${AUTHORITY}'--`, Status: 'OK' })).toBeNull();
  });

  it('verify 100 → succeeded for exactly the expected amount; the card hash is not kept', async () => {
    const { provider, calls } = zarinpal([{ json: { data: { code: 100, message: 'Paid', card_hash: 'abc123', card_pan: '502229******5995', ref_id: 201, fee_type: 'Merchant', fee: 0 }, errors: [] } }]);
    const v = await provider.verify(AUTHORITY, { Authority: AUTHORITY, Status: 'OK' }, { amountIrr: 4_800_000n });
    expect(calls[0]?.body).toMatchObject({ merchant_id: MERCHANT, amount: 4800000, authority: AUTHORITY });
    expect(v).toMatchObject({ status: 'SUCCEEDED', amountIrr: 4_800_000n, merchantId: MERCHANT, providerTransactionId: '201', cardMask: '502229******5995' });
    expect(JSON.stringify(v.raw)).not.toContain('abc123');
  });

  it('verify 101 (already verified) is also a success — re-verification is idempotent', async () => {
    const { provider } = zarinpal([{ json: { data: { code: 101, message: 'Verified', ref_id: 201, card_pan: '502229******5995' }, errors: [] } }]);
    const v = await provider.verify(AUTHORITY, {}, { amountIrr: 10_000n });
    expect(v.status).toBe('SUCCEEDED');
  });

  it('a callback with Status=OK is not trusted: not paid (-51) + inquiry IN_BANK → still pending', async () => {
    const { provider, calls } = zarinpal([
      { status: 422, json: { data: {}, errors: { code: -51, message: 'Session is not valid, session is not active paid try.' } } },
      { json: { data: { status: 'IN_BANK', code: 100, message: 'Success' }, errors: [] } },
    ]);
    const v = await provider.verify(AUTHORITY, { Authority: AUTHORITY, Status: 'OK' }, { amountIrr: 10_000n });
    expect(calls.map((c) => c.url.split('/').pop())).toEqual(['verify.json', 'inquiry.json']);
    expect(v.status).toBe('PENDING');
  });

  it('«انصراف» at the gateway (Status=NOK, verify -51, inquiry still IN_BANK — as observed live in the sandbox) → cancelled', async () => {
    const { provider } = zarinpal([
      { status: 422, json: { data: {}, errors: { code: -51, message: 'Session is not valid, session is not active paid try.' } } },
      { json: { data: { status: 'IN_BANK', code: 100, message: 'Success' }, errors: [] } },
    ]);
    expect((await provider.verify(AUTHORITY, { Authority: AUTHORITY, Status: 'NOK' }, { amountIrr: 10_000n })).status).toBe('CANCELLED');
  });

  it('Status=NOK and a failed session → cancelled by the customer; failed otherwise; reversed → failed', async () => {
    const failedPair = () => [
      { status: 422, json: { data: {}, errors: { code: -51, message: 'not paid' } } },
      { json: { data: { status: 'FAILED', code: 100 }, errors: [] } },
    ];
    expect((await zarinpal(failedPair()).provider.verify(AUTHORITY, { Status: 'NOK' }, { amountIrr: 10_000n })).status).toBe('CANCELLED');
    expect((await zarinpal(failedPair()).provider.verify(AUTHORITY, {}, { amountIrr: 10_000n })).status).toBe('FAILED');
    const reversed = zarinpal([{ json: { data: { status: 'REVERSED', code: 100 }, errors: [] } }]);
    expect((await reversed.provider.inquire(AUTHORITY, { amountIrr: 10_000n })).status).toBe('FAILED');
  });

  it('reconciliation captures a PAID session with verify', async () => {
    const { provider, calls } = zarinpal([
      { json: { data: { status: 'PAID', code: 100 }, errors: [] } },
      { json: { data: { code: 100, ref_id: 77, card_pan: '603799******1234' }, errors: [] } },
    ]);
    const v = await provider.inquire(AUTHORITY, { amountIrr: 250_000n });
    expect(calls.map((c) => c.url.split('/').pop())).toEqual(['inquiry.json', 'verify.json']);
    expect(v).toMatchObject({ status: 'SUCCEEDED', amountIrr: 250_000n, providerTransactionId: '77' });
  });

  it('a verify refused while the session is PAID (e.g. amount mismatch -50) is never a success: it needs a person', async () => {
    const { provider } = zarinpal([
      { status: 422, json: { data: {}, errors: { code: -50, message: 'Session is not valid, amounts values is not the same.' } } },
      { json: { data: { status: 'PAID', code: 100 }, errors: [] } },
    ]);
    const v = await provider.verify(AUTHORITY, { Status: 'OK' }, { amountIrr: 10_000n });
    expect(v.status).toBe('UNKNOWN');
    expect(v.raw).toMatchObject({ verifyErrorCode: -50, inquiryStatus: null });
  });

  it('no JSON from the gateway (down/proxy page) → error, so the attempt waits for verification', async () => {
    const { provider } = zarinpal([{ status: 502, text: '<html>bad gateway</html>' }]);
    await expect(provider.verify(AUTHORITY, {}, { amountIrr: 10_000n })).rejects.toThrow('ZARINPAL_HTTP_502');
  });

  it('refuses to verify without the expected amount and rejects out-of-range amounts', async () => {
    const { provider } = zarinpal([]);
    await expect(provider.verify(AUTHORITY, {})).rejects.toThrow('ZARINPAL_EXPECTED_AMOUNT_REQUIRED');
    await expect(provider.create({ attemptId: 'a', amountIrr: 0n, callbackUrl: 'https://x', description: 'd', customerMobile: null })).rejects.toThrow('ZARINPAL_AMOUNT_OUT_OF_RANGE');
  });
});

describe('Kavenegar SMS adapter', () => {
  const kavenegar = (responses: Parameters<typeof fakeFetch>[0], sender?: string) => {
    const f = fakeFetch(responses);
    return { provider: new KavenegarSmsProvider({ apiKey: 'TEST-KEY-1234567890', otpTemplate: 'hedax-otp', sender, fetchImpl: f.impl }), calls: f.calls };
  };
  const ok = { json: { return: { status: 200, message: 'تایید شد' }, entries: [{ messageid: 8792343, status: 1 }] } };

  it('sends the sign-in code through the approved verify/lookup template', async () => {
    const { provider, calls } = kavenegar([ok]);
    const res = await provider.send({ toE164: '+989121234567', template: 'otp', params: { code: '482913' } });
    expect(calls[0]?.url).toBe('https://api.kavenegar.com/v1/TEST-KEY-1234567890/verify/lookup.json');
    expect(new URLSearchParams(calls[0]?.body as string).toString()).toBe('receptor=09121234567&token=482913&template=hedax-otp');
    expect(res.providerMessageId).toBe('8792343');
  });

  it('sends notification texts with sms/send (with the sender line when configured)', async () => {
    const { provider, calls } = kavenegar([ok], '10004346');
    await provider.send({ toE164: '+989121234567', template: 'notification', params: { text: 'هداکس: سفارش HX-O-1 ارسال شد.' } });
    expect(calls[0]?.url).toMatch(/\/sms\/send\.json$/);
    const body = new URLSearchParams(calls[0]?.body as string);
    expect(body.get('receptor')).toBe('09121234567');
    expect(body.get('message')).toBe('هداکس: سفارش HX-O-1 ارسال شد.');
    expect(body.get('sender')).toBe('10004346');
  });

  it('reports Kavenegar status codes without the API key, URL or raw network error', async () => {
    for (const [status, code] of [[418, 'KAVENEGAR_418'], [424, 'KAVENEGAR_424'], [403, 'KAVENEGAR_403']] as const) {
      const { provider } = kavenegar([{ status: status === 403 ? 403 : 200, json: { return: { status, message: '…' }, entries: null } }]);
      const err = await provider.send({ toE164: '+989121234567', template: 'otp', params: { code: '123456' } }).catch((e: Error) => e);
      expect((err as Error).message).toBe(code);
      expect((err as Error).message).not.toContain('TEST-KEY');
    }
    const failing = new KavenegarSmsProvider({ apiKey: 'TEST-KEY-1234567890', otpTemplate: 't', fetchImpl: (async () => { throw new Error('connect ECONNREFUSED https://api.kavenegar.com/v1/TEST-KEY-1234567890'); }) as unknown as typeof fetch });
    const err = await failing.send({ toE164: '+989121234567', template: 'otp', params: { code: '123456' } }).catch((e: Error) => e);
    expect((err as Error).message).toBe('KAVENEGAR_UNREACHABLE');
  });

  it('validates the receptor and the code before calling the provider', async () => {
    expect(localMobile('+989121234567')).toBe('09121234567');
    expect(() => localMobile('+14155550100')).toThrow('KAVENEGAR_INVALID_RECEPTOR');
    const { provider, calls } = kavenegar([ok]);
    await expect(provider.send({ toE164: '+989121234567', template: 'otp', params: { code: '12 34' } })).rejects.toThrow('KAVENEGAR_INVALID_TOKEN');
    expect(calls).toHaveLength(0);
  });
});

describe('payment and SMS settings guards', () => {
  const secret = () => randomBytes(32).toString('base64');
  const base = (overrides: Record<string, string>) => ({
    APP_ENV: 'production', DATABASE_URL: 'postgresql://x:y@127.0.0.1:1/x', PUBLIC_BASE_URL: 'https://shop.example.test',
    SESSION_SECRET: secret(), OTP_PEPPER: secret(), APP_ENCRYPTION_KEY: secret(), COOKIE_SECURE: 'true', PAYMENT_PROVIDER: 'none',
    SMS_PROVIDER: 'none', MALWARE_SCANNER: 'clamav', OPENAPI_ENABLED: 'false', ...overrides,
  });

  it('accepts live Zarinpal and Kavenegar settings in production', () => {
    const env = loadEnv(base({ PAYMENT_PROVIDER: 'zarinpal', PAYMENT_MERCHANT_ID: MERCHANT, SMS_PROVIDER: 'kavenegar', KAVENEGAR_API_KEY: 'k'.repeat(40), KAVENEGAR_OTP_TEMPLATE: 'hedax-otp' }));
    expect(env).toMatchObject({ PAYMENT_PROVIDER: 'zarinpal', ZARINPAL_SANDBOX: false, SMS_PROVIDER: 'kavenegar' });
  });

  it('refuses the Zarinpal sandbox in production and a merchant ID that is not Zarinpal\'s 36-character ID', () => {
    expect(() => loadEnv(base({ PAYMENT_PROVIDER: 'zarinpal', PAYMENT_MERCHANT_ID: MERCHANT, ZARINPAL_SANDBOX: 'true' }))).toThrow(/ZARINPAL_SANDBOX/);
    expect(() => loadEnv(base({ PAYMENT_PROVIDER: 'zarinpal', PAYMENT_MERCHANT_ID: 'SIMULATOR' }))).toThrow(/PAYMENT_MERCHANT_ID/);
  });

  it('refuses Kavenegar without an API key or an approved OTP template', () => {
    expect(() => loadEnv(base({ SMS_PROVIDER: 'kavenegar', KAVENEGAR_OTP_TEMPLATE: 'hedax-otp' }))).toThrow(/KAVENEGAR_API_KEY/);
    expect(() => loadEnv(base({ SMS_PROVIDER: 'kavenegar', KAVENEGAR_API_KEY: 'k'.repeat(40) }))).toThrow(/KAVENEGAR_OTP_TEMPLATE/);
  });
});
