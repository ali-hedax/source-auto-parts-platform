import { existsSync, readdirSync } from 'node:fs';
import { expect } from '@playwright/test';
import { addTestAddress, checkoutAndPay, checkoutToGateway, payOnGateway, signInCustomer as signIn, test, testMobile } from './helpers';

/**
 * End-to-end customer journey through the real web → API → PostgreSQL stack:
 * Persian search, cart, OTP sign-in (development code), address, shipping,
 * terms, simulator payment, verified order; then a sourcing request for a
 * brand outside the catalog and a chat message. Uses the labelled DEMO-* data.
 */
test.describe.configure({ mode: 'serial' });

// A fresh number per test: the OTP resend cooldown (60 s) applies per number.
const stamp = String(Date.now()).slice(-6);
const buyer = testMobile('09361', stamp);
const requester = testMobile('09362', stamp);
const retrier = testMobile('09366', stamp);
const quick = testMobile('09367', stamp);
const shopper = testMobile('09368', stamp);
const failer = testMobile('09369', stamp);

test('buy an in-stock part and pay through the test gateway', async ({ page }) => {
  await page.goto(`/fa/parts?q=${encodeURIComponent('فيلتر روغن')}`); // Arabic yeh on purpose
  await page.getByRole('link', { name: /فیلتر روغن سمند/ }).first().click();
  // A part card on the list has an add button of the same name: wait for the part's own page.
  await expect(page).toHaveURL(/\/fa\/parts\/demo-/);
  await page.getByRole('button', { name: 'افزودن به سبد' }).click();
  await expect(page.getByText('به سبد اضافه شد')).toBeVisible();

  await signIn(page, buyer, '/fa/checkout');
  await expect(page).toHaveURL(/\/fa\/checkout/);
  await checkoutAndPay(page);
  await page.getByRole('link', { name: 'مشاهدهٔ سفارش' }).click();
  await expect(page).toHaveURL(/\/fa\/account\/orders\//);
  await expect(page.getByText(/HX-O-/).first()).toBeVisible();
});

test('the cart total stays right from the icon through sign-in to a verified payment, and back never re-enters the gateway', async ({ page }) => {
  const badge = page.locator('[data-cart-badge]');
  const addFrom = async (search: string, name: RegExp, amount: number) => {
    await page.goto(`/fa/parts?q=${encodeURIComponent(search)}`);
    await page.getByRole('link', { name }).first().click();
    await page.locator('#qty').fill(String(amount));
    await page.locator('#qty').blur();
    await page.getByRole('button', { name: 'افزودن به سبد' }).click();
    await expect(page.getByText(/به سبد اضافه شد/)).toBeVisible();
  };
  // Two lines, five units: a guest cart held by the real API.
  await addFrom('فيلتر روغن', /فیلتر روغن سمند/, 2);
  await expect(badge).toHaveText('۲');
  await addFrom('لنت ترمز', /لنت ترمز جلو/, 3);
  await expect(badge).toHaveText('۵');
  await page.getByRole('link', { name: 'مشاهدهٔ سبد' }).click();
  await expect(page).toHaveURL(/\/fa\/cart$/);
  await page.reload();
  await expect(badge).toHaveText('۵');

  // Every change comes back from the server at once.
  await page.getByRole('button', { name: /افزایش تعداد لنت ترمز جلو/ }).click();
  await expect(badge).toHaveText('۶');
  await page.getByRole('button', { name: /کاهش تعداد لنت ترمز جلو/ }).click();
  await expect(badge).toHaveText('۵');

  // A guest is asked to sign in and comes back to checkout with the same cart.
  await page.getByRole('link', { name: 'ادامه و تکمیل خرید' }).click();
  await expect(page).toHaveURL(/\/fa\/checkout$/);
  await page.getByRole('main').getByRole('link', { name: 'ورود / ثبت‌نام' }).click();
  await page.locator('#login-mobile').fill(shopper);
  await page.getByRole('button', { name: 'دریافت کد' }).click();
  await expect(page.getByText(/کد آزمایشی \(فقط محیط توسعه\)/)).toBeVisible();
  const code = /(?:^|\D)(\d{6})(?:\D|$)/.exec(await page.locator('main').innerText())?.[1];
  await page.locator('#login-code').fill(code as string);
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
  await expect(page).toHaveURL(/\/fa\/checkout$/);
  await expect(page.getByRole('heading', { name: 'نشانی تحویل' })).toBeVisible();
  await expect(badge).toHaveText('۵');

  // Back passes over the used sign-in form, and the cart is still whole there.
  await page.getByRole('link', { name: 'بازگشت', exact: true }).click();
  await expect(page).toHaveURL(/\/fa\/cart$/);
  await expect(badge).toHaveText('۵');
  await page.getByRole('link', { name: 'ادامه و تکمیل خرید' }).click();
  await expect(page).toHaveURL(/\/fa\/checkout$/);

  // A failed payment first, then a verified one; the amount is the server's.
  await checkoutToGateway(page);
  await payOnGateway(page, 'cancel');
  await expect(page).toHaveURL(/\/fa\/payment\/result\?attempt=/);
  await expect(page.getByText('پرداخت لغو شد.')).toBeVisible();
  await page.getByRole('button', { name: 'تلاش دوباره برای پرداخت' }).click();
  await payOnGateway(page);
  await expect(page).toHaveURL(/\/fa\/payment\/result\?attempt=/);
  await expect(page.getByText('پرداخت تأیید شد.')).toBeVisible();
  // The order took the cart's lines; the icon says so, and back leads to the orders.
  await expect(badge).toHaveCount(0);
  await expect(page.locator('header a[href$="/cart"]')).toHaveAccessibleName('سبد خرید خالی است');
  await page.getByRole('link', { name: 'بازگشت', exact: true }).click();
  await expect(page).toHaveURL(/\/fa\/account\/orders$/);
});

test('a failed payment says so from the server, pays nothing, keeps the order and can be retried', async ({ page }) => {
  test.skip(process.env.E2E_PAYMENT === 'zarinpal-sandbox', 'Zarinpal\'s sandbox page offers no failure outcome');
  await page.goto(`/fa/parts?q=${encodeURIComponent('فیلتر هوا')}`);
  await page.getByRole('link', { name: /فیلتر هوای کرولا/ }).first().click();
  await expect(page).toHaveURL(/\/fa\/parts\/demo-/);
  await page.getByRole('button', { name: 'افزودن به سبد' }).click();
  await expect(page.getByText(/به سبد اضافه شد/)).toBeVisible();
  await signIn(page, failer, '/fa/checkout');
  await expect(page).toHaveURL(/\/fa\/checkout/);
  await checkoutToGateway(page);
  await payOnGateway(page, 'fail');
  await expect(page).toHaveURL(/\/fa\/payment\/result\?attempt=/);
  await expect(page.getByText('پرداخت ناموفق بود')).toBeVisible();
  await expect(page.getByText('پرداخت تأیید شد.')).toHaveCount(0);
  await page.getByRole('link', { name: 'مشاهدهٔ سفارش' }).click();
  await expect(page).toHaveURL(/\/fa\/account\/orders\//);
  await page.goBack();
  await page.getByRole('button', { name: 'تلاش دوباره برای پرداخت' }).click();
  await payOnGateway(page);
  await expect(page.getByText('پرداخت تأیید شد.')).toBeVisible();
});

test('a forged result in the address changes nothing, and checkout refuses a request without a session', async ({ page }) => {
  await page.goto('/fa/payment/result?attempt=00000000-0000-7000-8000-000000000000&status=OK&Authority=FORGED');
  await expect(page.getByText('پرداخت تأیید شد.')).toHaveCount(0);
  // Refused without a session: the server does the checking, not the page.
  const refused = await page.evaluate(async () => {
    const csrf = (document.cookie.split('; ').find((c) => c.startsWith('hedax_csrf=')) ?? '').split('=')[1] ?? '';
    const res = await fetch('/api/v1/checkout?locale=fa', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf, 'Idempotency-Key': 'forged-total-1' }, body: JSON.stringify({ addressId: '00000000-0000-7000-8000-000000000000', shippingMethodId: '00000000-0000-7000-8000-000000000000', acceptedPolicyVersionId: '00000000-0000-7000-8000-000000000000', expectedGrandTotalIrr: '1' }) });
    return res.status;
  });
  expect(refused).toBeGreaterThanOrEqual(400);
});

test('cancel at the gateway, see it cancelled, then retry and pay (A14)', async ({ page }) => {
  await page.goto(`/fa/parts?q=${encodeURIComponent('لنت ترمز')}`);
  await page.getByRole('link', { name: /لنت ترمز جلو/ }).first().click();
  // A part card on the list has an add button of the same name: wait for the part's own page.
  await expect(page).toHaveURL(/\/fa\/parts\/demo-/);
  await page.getByRole('button', { name: 'افزودن به سبد' }).click();
  await expect(page.getByText('به سبد اضافه شد')).toBeVisible();
  await signIn(page, retrier, '/fa/checkout');
  await expect(page).toHaveURL(/\/fa\/checkout/);
  await checkoutToGateway(page);
  await payOnGateway(page, 'cancel');
  await expect(page).toHaveURL(/\/fa\/payment\/result\?attempt=/);
  await expect(page.getByText('پرداخت لغو شد.')).toBeVisible();
  // A cancelled attempt never pays the order; a new attempt does.
  await page.getByRole('button', { name: 'تلاش دوباره برای پرداخت' }).click();
  await payOnGateway(page);
  await expect(page).toHaveURL(/\/fa\/payment\/result\?attempt=/);
  await expect(page.getByText('پرداخت تأیید شد.')).toBeVisible();
});

test('a late checkout total never replaces the current address and shipping choice', async ({ page }) => {
  await page.goto(`/fa/parts?q=${encodeURIComponent('فیلتر روغن')}`);
  await page.getByRole('link', { name: /فیلتر روغن سمند/ }).first().click();
  await expect(page).toHaveURL(/\/fa\/parts\/demo-/);
  await page.getByRole('button', { name: 'افزودن به سبد' }).click();
  await expect(page.getByText('به سبد اضافه شد')).toBeVisible();
  await signIn(page, quick, '/fa/checkout');
  await expect(page).toHaveURL(/\/fa\/checkout/);

  // A fast customer: the totals for "new address, no shipping yet" arrive after the
  // answer for the shipping choice made right after it. Hold the first one to force that order.
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let markHeld = (): void => undefined;
  const isHeld = new Promise<void>((resolve) => { markHeld = resolve; });
  let holding = true;
  await page.route(/\/checkout\/preview\?/, async (route) => {
    const url = new URL(route.request().url());
    if (holding && url.searchParams.has('addressId') && !url.searchParams.has('shippingMethodId')) {
      holding = false;
      markHeld();
      await held;
    }
    await route.continue();
  });
  await addTestAddress(page);
  await isHeld; // the address is saved and its totals were requested — before any shipping choice
  await page.getByRole('radio', { name: /ارسال آزمایشی/ }).check();
  await page.getByRole('checkbox', { name: /را خوانده‌ام و می‌پذیرم/ }).check();
  const pay = page.getByRole('button', { name: /^پرداخت/ });
  await expect(pay).toBeEnabled();

  const late = page.waitForResponse((r) => r.url().includes('/checkout/preview?') && r.url().includes('addressId=') && !r.url().includes('shippingMethodId='));
  release();
  await late;
  // The older answer arrived last; the page still shows the totals for the current choice.
  await expect(pay).toBeEnabled();
  await expect(page.getByText('روش ارسال را انتخاب کنید.')).toHaveCount(0);
});

test('anonymous visitors share one cached copy of a public page, whatever their IP or cookies', async ({ browser, baseURL }) => {
  const dir = process.env.E2E_FETCH_CACHE_DIR;
  test.skip(!dir, 'needs the isolated runner, which knows where the web server keeps its data cache');
  const entries = () => (existsSync(dir as string) ? readdirSync(dir as string).length : 0);
  // A query no other test uses, so its results are not cached yet.
  const url = `/fa/parts?q=${encodeURIComponent(`لنت ${stamp}`)}`;
  const visit = async (ip: string, cookie: string) => {
    const context = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-forwarded-for': ip } });
    await context.addCookies([{ name: 'hedax_probe', value: cookie, url: baseURL as string }]);
    const page = await context.newPage();
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await context.close();
    await new Promise((resolve) => setTimeout(resolve, 1_500)); // entries are written after the response
  };
  const before = entries();
  await visit('10.9.0.21', 'first');
  const afterFirst = entries();
  expect(afterFirst, 'the first anonymous visit fills the shared cache').toBeGreaterThan(before);
  // Before the fix every visitor got a private copy (the visitor's IP and cookies were part of the key).
  await visit('10.9.0.22', 'second');
  await visit('10.9.0.23', 'third');
  expect(entries(), 'later anonymous visitors reuse the same copy').toBe(afterFirst);
});

test('request a part for a brand outside the catalog and chat about it', async ({ page }) => {
  await signIn(page, requester, '/fa/request-part');
  await expect(page).toHaveURL(/\/fa\/request-part/);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('#req-title').fill('سپر جلو چری تیگو ۷');
  await page.locator('#item-0-name').fill('سپر جلو');
  await page.locator('#item-0-brand').selectOption('__other');
  await page.locator('#item-0-brandtext').fill('Chery');
  await page.getByRole('button', { name: 'ثبت درخواست' }).click();
  await expect(page.getByText(/درخواست HX-R-[A-Z0-9-]+ ثبت شد/)).toBeVisible();

  await page.goto('/fa/account/requests');
  await expect(page.getByRole('columnheader', { name: 'کد پیگیری' })).toBeVisible();
  await page.getByRole('row', { name: /سپر جلو چری تیگو ۷/ }).getByRole('link').click();
  const box = page.getByPlaceholder('پیام خود را بنویسید…');
  await box.fill('سلام، مدل ۲۰۲۲ است.');
  await page.getByRole('button', { name: 'ارسال', exact: true }).click();
  await expect(page.getByText('سلام، مدل ۲۰۲۲ است.')).toBeVisible();
  // Stored on the server: still there after a reload.
  await page.reload();
  await expect(page.getByText('سلام، مدل ۲۰۲۲ است.')).toBeVisible();
});
