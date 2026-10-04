import { expect, test } from '@playwright/test';
import { checkoutAndPay, signInCustomer as signIn, testMobile } from './helpers';

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
