import { expect, test } from '@playwright/test';
import { addTestAddress, checkoutAndPay, checkoutToGateway, payOnGateway, signInCustomer as signIn, testMobile } from './helpers';

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

test('buy an in-stock part and pay through the test gateway', async ({ page }) => {
  await page.goto(`/fa/parts?q=${encodeURIComponent('فيلتر روغن')}`); // Arabic yeh on purpose
  await page.getByRole('link', { name: /فیلتر روغن سمند/ }).first().click();
  await page.getByRole('button', { name: 'افزودن به سبد' }).click();
  await expect(page.getByText('به سبد اضافه شد')).toBeVisible();

  await signIn(page, buyer, '/fa/checkout');
  await expect(page).toHaveURL(/\/fa\/checkout/);
  await checkoutAndPay(page);
  await page.getByRole('link', { name: 'مشاهدهٔ سفارش' }).click();
  await expect(page).toHaveURL(/\/fa\/account\/orders\//);
  await expect(page.getByText(/HX-O-/).first()).toBeVisible();
});

test('cancel at the gateway, see it cancelled, then retry and pay (A14)', async ({ page }) => {
  await page.goto(`/fa/parts?q=${encodeURIComponent('لنت ترمز')}`);
  await page.getByRole('link', { name: /لنت ترمز جلو/ }).first().click();
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
