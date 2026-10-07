import { createHmac } from 'node:crypto';
import path from 'node:path';
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';

const cspViolations: string[] = [];

/**
 * Records Content-Security-Policy violations in a browser context. Production builds send a
 * CSP (next.config.ts); `next dev` does not, so in the default isolated run this stays empty.
 */
export async function watchCsp(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      // eslint-disable-next-line no-console -- runs in the page; the console is how the test hears about it
      console.error(`[csp] ${e.effectiveDirective} blocked ${e.blockedURI || 'inline'} on ${location.pathname}`);
    });
  });
  context.on('console', (msg) => {
    if (msg.text().startsWith('[csp] ')) cspViolations.push(msg.text());
  });
}

/** Every test watches its browser contexts and fails on any CSP violation (contexts from `open()` too). */
export const test = base.extend<{ cspGuard: void }>({
  cspGuard: [
    async ({ context }, use) => {
      cspViolations.length = 0;
      await watchCsp(context);
      await use();
      expect(cspViolations, 'Content-Security-Policy violations').toEqual([]);
    },
    { auto: true },
  ],
});

/** Review screenshot of a real-stack screen, saved only when E2E_SCREENSHOTS_DIR is set (e.g. docs/test-artifacts/ui). */
export async function reviewShot(page: Page, name: string): Promise<void> {
  const dir = process.env.E2E_SCREENSHOTS_DIR;
  if (dir) await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
}

/** A fresh test mobile number per run and purpose: the OTP resend cooldown (60 s) applies per number. */
export function testMobile(prefix: '09361' | '09362' | '09363' | '09364' | '09365' | '09366' | '09367', stamp: string): string {
  return `${prefix}${stamp}`;
}

/** Customer sign-in with the development OTP code shown on the page (APP_ENV=development only). */
export async function signInCustomer(page: Page, mobile: string, next: string): Promise<void> {
  await page.goto(`/fa/login?next=${encodeURIComponent(next)}`);
  await page.locator('#login-mobile').fill(mobile);
  await page.getByRole('button', { name: 'دریافت کد' }).click();
  await expect(page.getByText(/کد آزمایشی \(فقط محیط توسعه\)/)).toBeVisible();
  const text = await page.locator('main').innerText();
  const code = /(?:^|\D)(\d{6})(?:\D|$)/.exec(text)?.[1];
  expect(code, 'development OTP code is shown').toBeTruthy();
  await page.locator('#login-code').fill(code as string);
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
}

/** On /fa/checkout (signed in, cart filled): adds a delivery address in Tehran; the shipping options follow. */
export async function addTestAddress(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'نشانی تحویل' })).toBeVisible();
  await page.getByRole('button', { name: 'افزودن نشانی' }).click();
  await page.locator('#addr-name').fill('گیرنده آزمایشی');
  await page.locator('#addr-mobile').fill('09121234567');
  await page.locator('#addr-province').fill('تهران');
  await page.locator('#addr-city').fill('تهران');
  await page.locator('#addr-line').fill('خیابان آزمایشی، پلاک ۱');
  await page.locator('#addr-postal').fill('1234567890');
  await page.getByRole('button', { name: 'ذخیره' }).click();
}

/**
 * Pays on the gateway page the browser was sent to. Default: the clearly labelled
 * simulator (no real money). With E2E_PAYMENT=zarinpal-sandbox the API uses
 * Zarinpal's official public sandbox and the browser pays on its page.
 */
export async function payOnGateway(page: Page, outcome: 'pay' | 'cancel' = 'pay'): Promise<void> {
  if (process.env.E2E_PAYMENT === 'zarinpal-sandbox') {
    await expect(page).toHaveURL(/^https:\/\/sandbox\.zarinpal\.com\/pg\/StartPay\/S[0-9A-Za-z]{35}$/, { timeout: 30_000 });
    await page.getByRole('button', { name: outcome === 'pay' ? 'پرداخت' : 'انصراف', exact: true }).click();
    return;
  }
  await expect(page.getByText(/TEST PAYMENT SIMULATOR/)).toBeVisible();
  await page.getByRole('button', { name: outcome === 'pay' ? /پرداخت موفق/ : /^انصراف/ }).click();
}

/** From /fa/checkout (signed in, cart filled): a new address, the test shipping method, the terms, then «پرداخت» — ends on the gateway. */
export async function checkoutToGateway(page: Page): Promise<void> {
  await addTestAddress(page);
  await page.getByRole('radio', { name: /ارسال آزمایشی/ }).check();
  await page.getByRole('checkbox', { name: /را خوانده‌ام و می‌پذیرم/ }).check();
  const pay = page.getByRole('button', { name: /^پرداخت/ });
  await expect(pay).toBeEnabled();
  await pay.click();
}

/** Checkout and the gateway's "success" — ends on the verified payment result page. */
export async function checkoutAndPay(page: Page): Promise<void> {
  await checkoutToGateway(page);
  await payOnGateway(page);
  await expect(page).toHaveURL(/\/fa\/payment\/result\?attempt=/);
  await expect(page.getByText('پرداخت تأیید شد.')).toBeVisible();
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Buffer {
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of input.toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    value = ((value << 5) | BASE32.indexOf(ch)) & 0xffffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits): what an authenticator app shows for this secret. */
export function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = (hmac[hmac.length - 1] as number) & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** A real PNG (a screenshot of the current page), e.g. for product photos and request files. */
export async function pngOf(page: Page): Promise<Buffer> {
  return page.screenshot({ clip: { x: 0, y: 0, width: 480, height: 360 } });
}
