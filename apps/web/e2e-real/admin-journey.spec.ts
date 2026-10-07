import { readFileSync } from 'node:fs';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { addTestAddress, checkoutAndPay, payOnGateway, pngOf, reviewShot, signInCustomer, test, testMobile, totp, watchCsp } from './helpers';

/**
 * Spec §22 "definition of done" through the real UI, API and database: the owner
 * signs in (password + authenticator enrollment); creates, prices, photographs,
 * stocks and publishes a product that shoppers then find and can buy; quotes a
 * customer's request for a brand outside the catalog (with a photo the worker
 * scans), the customer accepts and pays through the labelled test gateway and
 * the owner moves the procurement forward; the owner invites a staff member and
 * updates price/stock with a spreadsheet (preview first, then apply).
 *
 * Runs on the isolated stack (`pnpm --filter @hedax/web e2e:real`), which creates
 * a fresh owner and passes it as E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD.
 */
test.describe.configure({ mode: 'serial' });

const ownerEmail = process.env.E2E_OWNER_EMAIL ?? '';
const ownerPassword = process.env.E2E_OWNER_PASSWORD ?? '';
test.skip(!ownerEmail || !ownerPassword, 'needs the isolated stack: pnpm --filter @hedax/web e2e:real');

const stamp = String(Date.now()).slice(-6);
const sku = `E2E-${stamp}`;
const productName = `لنت ترمز جلو آزمایشی ${stamp}`;
const photoAlt = 'نمای روبه‌روی لنت ترمز';
const customerMobile = testMobile('09363', stamp);

type State = Awaited<ReturnType<BrowserContext['storageState']>>;
let ownerState: State | undefined;
/** The product created in the second test (its editor page). */
let productPath = '';

async function open(browser: Browser, baseURL: string | undefined, state?: State): Promise<Page> {
  // E2E_IGNORE_HTTPS_ERRORS: the Docker stack behind Caddy uses a local test certificate (contexts made here do not inherit the config).
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: process.env.E2E_IGNORE_HTTPS_ERRORS === '1', ...(state ? { storageState: state } : {}) });
  await watchCsp(context);
  return context.newPage();
}

async function onHand(page: Page): Promise<number | undefined> {
  const res = await page.request.get('/api/v1/admin/inventory?pageSize=100');
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { items: Array<{ sku: string; onHand: number }> };
  return body.items.find((i) => i.sku === sku)?.onHand;
}

test('owner signs in with password and enrolls an authenticator (TOTP)', async ({ page }) => {
  await page.goto('/fa/staff/login');
  await page.locator('#staff-email').fill(ownerEmail);
  await page.locator('#staff-password').fill(ownerPassword);
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'فعال‌سازی تأیید دومرحله‌ای' })).toBeVisible();
  const secret = (await page.locator('form .font-mono').innerText()).replace(/\s/g, '');
  await page.locator('#staff-code').fill(totp(secret));
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
  await expect(page.getByText(/کدهای بازیابی/)).toBeVisible();
  await page.getByRole('button', { name: 'بعدی' }).click();
  await expect(page).toHaveURL(/\/fa\/admin$/);
  await expect(page.getByRole('link', { name: 'محصولات' }).first()).toBeVisible();
  if (process.env.E2E_SCANNER === 'clamav') {
    // Launch readiness: with real ClamAV the dashboard reports the signatures' freshness in words.
    const signatures = page.getByRole('listitem').filter({ hasText: 'به‌روز بودن امضای ضدویروس' });
    await expect(signatures.getByText(/^(آماده|نیاز به بررسی)$/)).toBeVisible();
  }
  ownerState = await page.context().storageState();
});

test('owner creates, photographs, stocks and publishes a product that shoppers find and can buy (A01)', async ({ browser, baseURL }) => {
  const page = await open(browser, baseURL, ownerState);
  await page.goto('/fa/admin/products/new');
  if ((await page.locator('#pf-category option').count()) < 2) {
    // A fresh production database has no categories (the sample-data seed is refused there): the owner adds one first.
    await page.goto('/fa/admin/taxonomy');
    await page.locator('#tx-kind').selectOption('categories');
    await page.locator('#tx-code').fill(`BRAKES_${stamp}`);
    await page.locator('#tx-fa').fill('لنت و ترمز');
    await page.locator('#tx-en').fill('Brakes');
    await page.getByRole('button', { name: 'افزودن', exact: true }).click();
    await expect(page.getByRole('region', { name: 'دسته' })).toContainText('لنت و ترمز');
    await page.goto('/fa/admin/products/new');
  }
  await page.locator('#pf-sku').fill(sku);
  await page.locator('#pf-namefa').fill(productName);
  await page.locator('#pf-nameen').fill(`Front brake pad test ${stamp}`);
  await page.locator('#pf-category').selectOption({ index: 1 });
  await page.getByRole('checkbox', { name: 'ایران خودرو' }).check();
  await page.locator('#pf-price').fill('4500000');
  await page.getByRole('button', { name: 'ذخیره', exact: true }).click();
  await expect(page).toHaveURL(/\/fa\/admin\/products\/[0-9a-f-]{36}$/);
  productPath = new URL(page.url()).pathname;

  await page.locator('#media-alt').fill(photoAlt);
  await page.locator('#media-file').setInputFiles({ name: 'brake-pad.png', mimeType: 'image/png', buffer: await pngOf(page) });
  const photo = page.getByRole('img', { name: photoAlt });
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'انتشار', exact: true }).click();
  await expect(page.getByRole('button', { name: 'لغو انتشار' })).toBeVisible();
  await reviewShot(page, 'admin-product-editor-fa-desktop');

  await page.goto('/fa/admin/inventory');
  await page.getByRole('row', { name: new RegExp(sku) }).getByRole('button', { name: 'ثبت شمارش موجودی' }).click();
  await page.locator('#adj-count').fill('5');
  await page.locator('#adj-reason').selectOption('RECEIVED');
  await page.getByRole('dialog').getByRole('button', { name: 'ذخیره' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await onHand(page)).toBe(5);

  // A shopper without a session finds it by name, sees the photo and can add it to the cart.
  const shopper = await open(browser, baseURL);
  await shopper.goto(`/fa/parts?q=${encodeURIComponent(productName)}`);
  await shopper.getByRole('link', { name: productName }).first().click();
  await expect(shopper.getByRole('heading', { level: 1 })).toHaveText(productName);
  const shown = shopper.getByRole('img', { name: photoAlt }).first();
  await expect(shown).toBeVisible();
  await expect.poll(() => shown.evaluate((img: HTMLImageElement) => (img.complete ? img.naturalWidth : 0))).toBeGreaterThan(0);
  await expect(shopper.getByText('حداکثر ۵ عدد قابل سفارش است.')).toBeVisible();
  await reviewShot(shopper, 'product-with-photo-fa-desktop');
  await shopper.getByRole('button', { name: 'افزودن به سبد' }).click();
  await expect(shopper.getByText('به سبد اضافه شد')).toBeVisible();
});

test('any-brand request with a photo → quote (with PDFs) → acceptance and test payment → procurement stage the customer can see', async ({ browser, baseURL }) => {
  // Customer: a brand outside the catalog, with a photo.
  const customer = await open(browser, baseURL);
  await signInCustomer(customer, customerMobile, '/fa/request-part');
  await expect(customer).toHaveURL(/\/fa\/request-part/);
  await customer.evaluate(() => localStorage.clear());
  await customer.reload();
  await customer.locator('#req-title').fill(`چراغ جلو بی‌وای‌دی ${stamp}`);
  await customer.locator('#item-0-name').fill('چراغ جلو سمت راست');
  await customer.locator('#item-0-brand').selectOption('__other');
  await customer.locator('#item-0-brandtext').fill('BYD');
  await customer.locator('#req-files').setInputFiles({ name: 'headlight.png', mimeType: 'image/png', buffer: await pngOf(customer) });
  await expect(customer.getByText('headlight.png')).toBeVisible();
  const submit = customer.getByRole('button', { name: 'ثبت درخواست' });
  await expect(submit).toBeEnabled();
  await submit.click();
  const success = customer.getByText(/درخواست HX-R-[A-Z0-9-]+ ثبت شد/);
  await expect(success).toBeVisible();
  const reference = /HX-R-[A-Z0-9-]+/.exec(await success.innerText())?.[0] ?? '';
  expect(reference).not.toBe('');

  // Owner: the worker scanned the photo (download link appears); quote and send.
  const owner = await open(browser, baseURL, ownerState);
  await owner.goto('/fa/admin/sourcing');
  await owner.getByRole('link', { name: reference }).click();
  await expect(owner.getByRole('heading', { level: 1 })).toContainText('بی‌وای‌دی');
  await expect(async () => {
    await owner.reload();
    await expect(owner.getByRole('link', { name: 'headlight.png' })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  await owner.locator('#qe-0-price').fill('12500000');
  await owner.locator('#qe-terms').selectOption({ index: 1 });
  await owner.getByRole('button', { name: 'ارسال برای مشتری' }).click();
  await expect(owner.getByRole('link', { name: 'نسخهٔ ۱' })).toBeVisible();
  await reviewShot(owner, 'admin-sourcing-workbench-fa-desktop');
  // The panel's quotes list shows it as the current, sent version.
  await owner.goto('/fa/admin/quotes');
  await expect(owner.getByRole('row').filter({ hasText: reference })).toContainText('ارسال‌شده');

  // Customer: the quote (with Persian and English PDFs rendered by the worker), acceptance, test payment.
  await customer.goto('/fa/account/requests');
  await customer.getByRole('link', { name: reference }).click();
  // The quotes list entry (the chat also shows a card linking to the same quote).
  await customer.getByRole('link', { name: /HX-Q-[A-Z0-9-]+ — نسخهٔ ۱/ }).click();
  await expect(customer).toHaveURL(/\/fa\/account\/quotes\//);
  await expect(async () => {
    await customer.reload();
    await expect(customer.getByRole('link', { name: /دریافت PDF/ })).toHaveCount(2, { timeout: 2_000 });
  }).toPass({ timeout: 90_000 });
  await reviewShot(customer, 'customer-quote-fa-desktop');
  const pdfHref = await customer.getByRole('link', { name: /دریافت PDF/ }).first().getAttribute('href');
  const pdf = await customer.request.get(pdfHref as string);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-');

  await customer.getByRole('button', { name: 'پذیرش همین نسخه' }).click();
  await customer.getByRole('button', { name: 'پرداخت پیش‌فاکتور' }).click();
  await payOnGateway(customer);
  await expect(customer.getByText('پرداخت تأیید شد.')).toBeVisible();
  await customer.getByRole('link', { name: 'مشاهدهٔ سفارش' }).click();
  await expect(customer).toHaveURL(/\/fa\/account\/procurements\/[0-9a-f-]{36}/);
  await expect(customer.getByText('در صف تأمین').first()).toBeVisible();
  const procurementId = /procurements\/([0-9a-f-]{36})/.exec(customer.url())?.[1];

  // Owner: start sourcing; the customer sees the new stage.
  await owner.goto(`/fa/admin/procurements/${procurementId}`);
  await owner.locator('#tr-to').selectOption('SOURCING');
  await owner.getByRole('button', { name: 'تغییر وضعیت' }).click();
  await expect(owner.locator('#tr-to option[value="PURCHASED"]')).toHaveCount(1);
  await customer.reload();
  await expect(customer.getByText('در حال تأمین').first()).toBeVisible();
  await reviewShot(customer, 'customer-procurement-fa-desktop');
  // The customer's inbox has the new quote and the stage change, in words (never a raw code).
  // Notifications are written by the worker a moment later: reload until the stage change arrives.
  await customer.goto('/fa/account/notifications');
  await expect(async () => {
    await customer.reload();
    await expect(customer.getByText(/وضعیت سفارش تأمین: در حال تأمین/).first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(customer.getByText(/پیش‌فاکتور جدید صادر شد/).first()).toBeVisible();
  await expect(customer.getByText(/procurement\.|order\./)).toHaveCount(0);
  await expect(customer.getByText('اعلان تازه')).toHaveCount(0);
});

test('owner invites a support agent who signs in and only gets the permitted sections (A18)', async ({ browser, baseURL }) => {
  const owner = await open(browser, baseURL, ownerState);
  await owner.goto('/fa/admin/staff');
  const email = `support.${stamp}@hedax.test`;
  await owner.locator('#inv-email').fill(email);
  await owner.locator('#inv-name').fill('کارشناس پشتیبانی آزمایشی');
  await owner.getByRole('checkbox', { name: 'کارشناس پشتیبانی' }).check();
  await owner.getByRole('button', { name: 'دعوت کارمند' }).click();
  const invite = new URL((await owner.getByText(/\/staff\/invite\?token=/).innerText()).trim());

  const staff = await open(browser, baseURL);
  await staff.goto(`${invite.pathname}${invite.search}`);
  await staff.locator('#inv-name').fill('کارشناس پشتیبانی آزمایشی');
  const password = `Hx-${stamp}-support-Pw!`;
  await staff.locator('#inv-password').fill(password);
  await staff.getByRole('button', { name: 'ایجاد حساب' }).click();
  await expect(staff).toHaveURL(/\/fa\/staff\/login/);
  await staff.locator('#staff-email').fill(email);
  await staff.locator('#staff-password').fill(password);
  await staff.getByRole('button', { name: 'ورود', exact: true }).click();
  await expect(staff).toHaveURL(/\/fa\/admin$/);
  await expect(staff.getByRole('link', { name: 'درخواست‌های تأمین' }).first()).toBeVisible();
  await expect(staff.getByRole('link', { name: 'کارکنان' })).toHaveCount(0);
  // The dashboard itself loads for the role (dashboard.view).
  await expect(staff.getByRole('link', { name: /درخواست‌های تازه/ })).toBeVisible();
  await reviewShot(staff, 'admin-support-agent-fa-desktop');
  // The server refuses what the menu hides.
  expect((await staff.request.get('/api/v1/admin/staff')).status()).toBe(403);
});

test('owner updates price and stock with a spreadsheet: preview changes nothing, apply changes it (§12)', async ({ browser, baseURL }) => {
  const owner = await open(browser, baseURL, ownerState);
  await owner.goto('/fa/admin/imports');
  const [template] = await Promise.all([owner.waitForEvent('download'), owner.getByRole('link', { name: 'دریافت قالب Excel' }).click()]);
  expect(template.suggestedFilename()).toMatch(/\.xlsx$/);

  const csv = `sku,base_currency,base_price,on_hand\r\n${sku},IRR,4800000,9\r\n`;
  await owner.locator('#imp-file').setInputFiles({ name: 'price-update.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  await expect(owner.getByText('پیش‌نمایش آماده است')).toBeVisible({ timeout: 60_000 });
  await expect(owner.getByText(/به‌روزرسانی: [1۱]/)).toBeVisible();
  await expect(owner.getByText(/خطا: [0۰]/)).toBeVisible();
  expect(await onHand(owner)).toBe(5);
  await reviewShot(owner, 'admin-import-preview-fa-desktop');

  await owner.getByRole('button', { name: 'اعمال تغییرات' }).click();
  await expect(owner.getByText('تغییرات اعمال شد')).toBeVisible({ timeout: 60_000 });
  expect(await onHand(owner)).toBe(9);

  // With a real malware scanner (Docker stack: E2E_SCANNER=clamav), the standard EICAR test file is refused.
  if (process.env.E2E_SCANNER === 'clamav') {
    // Kept as base64 so no file in the repository is itself flagged by desktop antivirus (Windows Defender blocks the plain string).
    const eicar = Buffer.from('WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=', 'base64');
    await owner.locator('#imp-file').setInputFiles({ name: 'eicar-test.csv', mimeType: 'text/csv', buffer: eicar });
    await expect(owner.getByText('فایل در بررسی امنیتی رد شد.')).toBeVisible({ timeout: 120_000 });
    expect(await onHand(owner)).toBe(9);
  }
});

test('owner records a new exchange rate; the cached product page shows the new IRR amount at once (§9, §15)', async ({ browser, baseURL }) => {
  // DEMO-0005 costs 65 AED: 10,400,000 IRR at the seeded 160,000 rate. This visit also caches the page.
  const shopper = await open(browser, baseURL);
  await shopper.goto('/fa/parts/demo-demo-0005');
  await expect(shopper.getByText(/۱۰[٬,]۴۰۰[٬,]۰۰۰/).first()).toBeVisible();

  const owner = await open(browser, baseURL, ownerState);
  await owner.goto('/fa/admin/fx');
  await owner.locator('#fx-rate').fill('170000');
  await owner.locator('#fx-note').fill('نرخ آزمایشی پشتهٔ واقعی');
  await owner.getByRole('button', { name: 'ثبت نرخ جدید' }).click();
  await expect(owner.getByText(/۱۷۰[٬,]۰۰۰ ریال به‌ازای هر درهم/).first()).toBeVisible();

  // The API purged the public cache: 65 × 170,000 = 11,050,000 IRR without waiting for the page to expire.
  await expect(async () => {
    await shopper.reload();
    await expect(shopper.getByText(/۱۱[٬,]۰۵۰[٬,]۰۰۰/).first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
});

test('a delivered order is returned and refunded from the panel: request → approval → receipt → refund (A28)', async ({ browser, baseURL }) => {
  // The customer buys one unit of the product created above.
  const customer = await open(browser, baseURL);
  await customer.goto(`/fa/parts?q=${encodeURIComponent(productName)}`);
  await customer.getByRole('link', { name: productName }).first().click();
  await customer.getByRole('button', { name: 'افزودن به سبد' }).click();
  await expect(customer.getByText('به سبد اضافه شد')).toBeVisible();
  await signInCustomer(customer, testMobile('09364', stamp), '/fa/checkout');
  await expect(customer).toHaveURL(/\/fa\/checkout/);
  await checkoutAndPay(customer);
  await customer.getByRole('link', { name: 'مشاهدهٔ سفارش' }).click();
  await expect(customer).toHaveURL(/\/fa\/account\/orders\/[0-9a-f-]{36}/);
  const orderId = /orders\/([0-9a-f-]{36})/.exec(customer.url())?.[1];

  // The owner prepares, ships (with a tracking code) and delivers it.
  const owner = await open(browser, baseURL, ownerState);
  expect(await onHand(owner)).toBe(8); // 9 after the spreadsheet, one sold
  await owner.goto(`/fa/admin/orders/${orderId}`);
  for (const step of ['PREPARING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED']) {
    await owner.locator('#tr-to').selectOption(step);
    if (step === 'SHIPPED') {
      await owner.locator('#tr-method').selectOption({ index: 1 });
      await owner.locator('#tr-tracking').fill('TRK-E2E-0001');
    }
    await owner.getByRole('button', { name: 'تغییر وضعیت' }).click();
    await expect(owner.locator(`#tr-to option[value="${step}"]`)).toHaveCount(0);
  }

  // The customer asks to return the delivered unit; a request alone changes neither stock nor money.
  await customer.reload();
  await expect(customer.getByText('تحویل‌شده').first()).toBeVisible();
  await customer.getByRole('button', { name: 'درخواست مرجوعی' }).click();
  const dialog = customer.getByRole('dialog');
  await dialog.locator('input[type="number"]').first().fill('1');
  await dialog.locator('#ret-reason-RETURN').fill('یک عدد اضافه سفارش داده شد');
  await dialog.getByRole('button', { name: 'ثبت', exact: true }).click();
  await expect(dialog.getByText('درخواست‌شده')).toBeVisible();
  expect(await onHand(owner)).toBe(8);

  // The owner approves, records the inspected unit back in stock and requests the refund on the same screen.
  await owner.goto('/fa/admin/returns');
  const card = owner.locator('li.card').filter({ hasText: productName });
  await expect(card).toContainText('درخواست‌شده');
  const returnRef = /HX-[A-Z]+-[A-Z0-9]+/.exec(await card.innerText())?.[0] ?? '';
  expect(returnRef).not.toBe('');
  await card.locator('input[id^="rr-"]').fill('مطابق سیاست مرجوعی');
  await card.getByRole('button', { name: 'تأیید', exact: true }).click();
  await card.getByRole('button', { name: 'ثبت دریافت و بررسی (بازگشت به موجودی)' }).click();
  await expect(card).toContainText('کالا دریافت شد');
  expect(await onHand(owner)).toBe(9);
  await card.getByRole('button', { name: 'ثبت درخواست استرداد' }).click();
  await expect(card).toContainText(/استرداد HX-/);
  await reviewShot(owner, 'admin-returns-fa-desktop');

  // Finance approves and executes the refund through the test gateway; the customer is told.
  await owner.goto('/fa/admin/refunds');
  const refundRow = owner.getByRole('row').filter({ hasText: returnRef });
  await refundRow.getByRole('button', { name: 'تأیید', exact: true }).click();
  await refundRow.getByRole('button', { name: 'انجام استرداد' }).click();
  await expect(refundRow).toContainText('موفق');
  // Notifications are written by the worker a moment later: reload until they arrive.
  await customer.goto('/fa/account/notifications');
  await expect(async () => {
    await customer.reload();
    await expect(customer.getByText(/بازپرداخت انجام شد/).first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(customer.getByText('درخواست لغو یا مرجوعی شما تأیید شد').first()).toBeVisible();
  await expect(customer.getByText('اعلان تازه')).toHaveCount(0);
});

// ---- Business customers (A26), roles, store settings and reports, all through the panel ----

const workshopMobile = testMobile('09365', stamp);
const workshopName = `تعمیرگاه آزمایشی ${stamp}`;
let workshopState: State | undefined;
/** When the workshop last asked for a sign-in code: one code per number per minute. */
let workshopCodeAt = 0;
const courierName = `پیک آزمایشی ${stamp}`;

test('a workshop asks for business prices and the owner sets a group price; a pending request changes nothing (A26)', async ({ browser, baseURL }) => {
  const customer = await open(browser, baseURL);
  await signInCustomer(customer, workshopMobile, '/fa/account/profile');
  // After the sign-in, so never earlier than the code request itself: the login page can take
  // seconds to load in `next dev`, and the server counts the minute from the actual request.
  workshopCodeAt = Date.now();
  await expect(customer).toHaveURL(/\/fa\/account\/profile/);
  await customer.locator('#bz-type').selectOption('WORKSHOP');
  await customer.locator('#bz-name').fill(workshopName);
  await customer.locator('#bz-city').fill('تهران');
  await customer.getByRole('button', { name: 'ثبت', exact: true }).click();
  await expect(customer.getByText('درخواست حساب تجاری در حال بررسی است').first()).toBeVisible();
  workshopState = await customer.context().storageState();

  // The owner gives the workshop group its own price for the product.
  const owner = await open(browser, baseURL, ownerState);
  await owner.goto(productPath);
  const rules = owner.getByRole('region', { name: 'قواعد قیمت گروه و تعداد' });
  await rules.locator('#pr-group').selectOption({ label: 'تعمیرگاه / مشتری تجاری' });
  await rules.locator('#pr-price').fill('4000000');
  await rules.getByRole('button', { name: 'افزودن', exact: true }).click();
  // «، » separates the values: a middle dot beside Persian digits would read as the zero «۰».
  await expect(rules.locator('li').filter({ hasText: '۴٬۰۰۰٬۰۰۰ ریال' })).toContainText('تعمیرگاه / مشتری تجاری، تعداد ۱–∞، ۴٬۰۰۰٬۰۰۰ ریال');

  // Asking is not approval: the workshop still pays the public price.
  await customer.goto(`/fa/parts?q=${encodeURIComponent(productName)}`);
  await customer.getByRole('link', { name: productName }).first().click();
  await expect(customer.getByRole('main').getByText(/۴٬۸۰۰٬۰۰۰ ریال/).first()).toBeVisible();
  await expect(customer.getByRole('main').getByText(/۴٬۰۰۰٬۰۰۰/)).toHaveCount(0);
});

test('owner builds a stock-clerk role from permissions in words; a clerk with it sees only stock (§13)', async ({ browser, baseURL }) => {
  const owner = await open(browser, baseURL, ownerState);
  await owner.goto('/fa/admin/roles');
  const roleName = `انباردار آزمایشی ${stamp}`;
  await owner.locator('#rl-key').fill(`stock_${stamp}`);
  await owner.locator('#rl-fa').fill(roleName);
  await owner.locator('#rl-en').fill(`Stock clerk ${stamp}`);
  for (const permission of ['dashboard.view', 'inventory.read', 'inventory.adjust']) await owner.locator(`[id="rl-p-${permission}"]`).check();
  // Offered in words; the technical key stays beside it, small, for support.
  await expect(owner.getByRole('checkbox', { name: /^اصلاح موجودی/ })).toBeChecked();
  await owner.getByRole('button', { name: 'افزودن', exact: true }).click();
  const card = owner.getByRole('region', { name: new RegExp(roleName) });
  await expect(card).toContainText('مشاهدهٔ موجودی و دفتر موجودی');
  await expect(card).toContainText('اصلاح موجودی');
  await expect(card).toContainText('۰ عضو');
  await reviewShot(owner, 'admin-roles-fa-desktop');

  await owner.goto('/fa/admin/staff');
  const email = `stock.${stamp}@hedax.test`;
  await owner.locator('#inv-email').fill(email);
  await owner.locator('#inv-name').fill('انباردار آزمایشی');
  await owner.getByRole('checkbox', { name: roleName }).check();
  await owner.getByRole('button', { name: 'دعوت کارمند' }).click();
  const invite = new URL((await owner.getByText(/\/staff\/invite\?token=/).innerText()).trim());

  const clerk = await open(browser, baseURL);
  await clerk.goto(`${invite.pathname}${invite.search}`);
  await clerk.locator('#inv-name').fill('انباردار آزمایشی');
  const password = `Hx-${stamp}-stock-Pw!`;
  await clerk.locator('#inv-password').fill(password);
  await clerk.getByRole('button', { name: 'ایجاد حساب' }).click();
  await expect(clerk).toHaveURL(/\/fa\/staff\/login/);
  await clerk.locator('#staff-email').fill(email);
  await clerk.locator('#staff-password').fill(password);
  await clerk.getByRole('button', { name: 'ورود', exact: true }).click();
  await expect(clerk).toHaveURL(/\/fa\/admin$/);
  await expect(clerk.getByRole('link', { name: 'موجودی' }).first()).toBeVisible();
  await expect(clerk.getByRole('link', { name: 'محصولات' })).toHaveCount(0);
  await clerk.goto('/fa/admin/inventory');
  await expect(clerk.getByRole('row', { name: new RegExp(sku) }).getByRole('button', { name: 'ثبت شمارش موجودی' })).toBeVisible();
  expect((await clerk.request.get('/api/v1/admin/products')).status()).toBe(403);

  await owner.goto('/fa/admin/roles');
  await expect(owner.getByRole('region', { name: new RegExp(roleName) })).toContainText('۱ عضو');
});

test('owner adds a courier, publishes a shipping policy and enters holidays in Shamsi (§5.3, §8)', async ({ browser, baseURL }) => {
  const owner = await open(browser, baseURL, ownerState);
  // Shipping: cost and delivery days in Persian digits, never a raw minor amount.
  await owner.goto('/fa/admin/shipping');
  await owner.locator('#sh-code').fill(`courier_${stamp}`);
  await owner.locator('#sh-fa').fill(courierName);
  await owner.locator('#sh-cost').fill('250000');
  await owner.locator('#sh-min').fill('1');
  await owner.locator('#sh-max').fill('2');
  await owner.getByRole('button', { name: 'ذخیره', exact: true }).click();
  const method = owner.getByRole('row').filter({ hasText: courierName });
  await expect(method).toContainText('۲۵۰٬۰۰۰ ریال، ۱–۲ روز');

  // A policy version is a draft until published; the public page then shows it at once.
  await owner.goto('/fa/admin/policies');
  await owner.locator('#pol-kind').selectOption('SHIPPING');
  await expect(owner.locator('#pol-kind option:checked')).toHaveText('ارسال');
  const title = `شرایط ارسال آزمایشی ${stamp}`;
  await owner.locator('#pol-tfa').fill(title);
  await owner.locator('#pol-bfa').fill('ارسال سفارش‌های تهران یک تا دو روز کاری طول می‌کشد. (متن آزمایشی)');
  await owner.getByRole('button', { name: 'ذخیرهٔ پیش‌نویس' }).click();
  const policy = owner.getByRole('row').filter({ hasText: title });
  await expect(policy).toContainText('پیش‌نویس');
  await expect(policy).toContainText('ارسال');
  await policy.getByRole('button', { name: 'انتشار' }).click();
  await expect(policy).toContainText('منتشرشده');
  const shopper = await open(browser, baseURL);
  await expect(async () => {
    await shopper.goto('/fa/help/shipping');
    await expect(shopper.getByRole('heading', { level: 1 })).toHaveText(title, { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await expect(shopper.getByText(/یک تا دو روز کاری/)).toBeVisible();

  // Holidays are typed and shown in Shamsi; a date that does not exist is named and nothing is sent.
  await owner.goto('/fa/admin/calendar');
  const holidays = owner.locator('textarea[id$="-hol"]').first();
  const before = (await holidays.inputValue()).trim();
  await holidays.fill(`${before}\n۱۴۰۵/۰۱/۱۳\n۱۴۰۵/۱۳/۰۱`.trim());
  await owner.getByRole('button', { name: 'ذخیره', exact: true }).first().click();
  await expect(owner.getByText('این سطرها تاریخ شمسی معتبر نیستند: ۱۴۰۵/۱۳/۰۱')).toBeVisible();
  await holidays.fill(`${before}\n۱۴۰۵/۰۱/۱۳`.trim());
  await owner.getByRole('button', { name: 'ذخیره', exact: true }).first().click();
  // 13 Farvardin 1405 is stored as the Gregorian calendar day the API computes with.
  await expect.poll(async () => ((await (await owner.request.get('/api/v1/admin/calendars')).json()) as Array<{ holidays: string[] }>)[0]?.holidays ?? []).toContain('2026-04-02');
  await owner.reload();
  await expect(owner.locator('textarea[id$="-hol"]').first()).toHaveValue(/۱۴۰۵\/۰۱\/۱۳/);
  await reviewShot(owner, 'admin-calendar-fa-desktop');
});

test('owner approves the workshop: after signing in again it gets the group price and the new courier at checkout; guests do not (A26)', async ({ browser, baseURL }) => {
  const owner = await open(browser, baseURL, ownerState);
  await owner.goto('/fa/admin/customers');
  await owner.locator('#cu-pending').check();
  const pending = owner.getByRole('row').filter({ hasText: workshopName });
  await expect(pending).toContainText('درخواست حساب تجاری در حال بررسی است');
  await pending.getByRole('button', { name: 'تأیید', exact: true }).click();
  await expect(pending).toHaveCount(0);
  await owner.locator('#cu-pending').uncheck();
  await expect(owner.getByRole('row').filter({ hasText: workshopName })).toContainText('حساب تجاری تأیید شده است');

  // Approval ends the workshop's sessions, so the new prices apply from a fresh sign-in.
  const customer = await open(browser, baseURL, workshopState);
  expect((await customer.request.get('/api/v1/account/profile')).status()).toBe(401);
  await customer.waitForTimeout(Math.max(0, workshopCodeAt + 61_000 - Date.now()));
  await signInCustomer(customer, workshopMobile, '/fa/account/profile');
  await expect(customer.getByText('حساب تجاری تأیید شده است')).toBeVisible();

  await customer.goto(`/fa/parts?q=${encodeURIComponent(productName)}`);
  await customer.getByRole('link', { name: productName }).first().click();
  await expect(customer.getByRole('main').getByText(/۴٬۰۰۰٬۰۰۰ ریال/).first()).toBeVisible();
  const guest = await open(browser, baseURL);
  await guest.goto(customer.url());
  await expect(guest.getByRole('main').getByText(/۴٬۸۰۰٬۰۰۰ ریال/).first()).toBeVisible();
  await expect(guest.getByRole('main').getByText(/۴٬۰۰۰٬۰۰۰/)).toHaveCount(0);

  // Checkout: the group price, and the courier added in the panel with its cost.
  await customer.getByRole('button', { name: 'افزودن به سبد' }).click();
  await expect(customer.getByText('به سبد اضافه شد')).toBeVisible();
  await customer.goto('/fa/checkout');
  await addTestAddress(customer);
  await expect(customer.locator('label').filter({ hasText: courierName })).toContainText('۲۵۰٬۰۰۰ ریال');
  // Totals are computed once a shipping method is chosen.
  await customer.getByRole('radio', { name: new RegExp(courierName) }).check();
  const review = customer.getByRole('complementary', { name: 'مرور و پرداخت' });
  await expect(review).toContainText('۴٬۰۰۰٬۰۰۰ ریال');
  await expect(review).toContainText('۲۵۰٬۰۰۰ ریال');
  await expect(review).not.toContainText('۴٬۸۰۰٬۰۰۰');
});

test('reports show what the database holds — collections, refunds, orders, top parts — in words and Persian digits', async ({ browser, baseURL }) => {
  const owner = await open(browser, baseURL, ownerState);
  const res = await owner.request.get('/api/v1/admin/reports/summary');
  expect(res.ok()).toBe(true);
  const summary = (await res.json()) as {
    ordersByStatus: Array<{ status: string; count: number }>;
    topItems: Array<{ sku: string; name: string; quantity: number }>;
    financial?: { collectionsCount: number; refundsCount: number };
  };
  // This run collected at least the quote and the returned order, and refunded the return.
  expect(summary.financial?.collectionsCount ?? 0).toBeGreaterThanOrEqual(2);
  expect(summary.financial?.refundsCount ?? 0).toBeGreaterThanOrEqual(1);

  await owner.goto('/fa/admin/reports');
  const fa = (n: number) => n.toLocaleString('fa-IR');
  const finance = owner.getByRole('region', { name: 'وصول واقعی (ریال)' });
  await expect(finance).toContainText('استرداد انجام‌شده');
  await expect(finance).toContainText(`(${fa(summary.financial?.refundsCount ?? 0)})`);
  await expect(finance).toContainText(`(${fa(summary.financial?.collectionsCount ?? 0)})`);
  const orders = owner.getByRole('region', { name: 'سفارش‌های فروش' });
  await expect(orders.getByRole('listitem')).toHaveCount(summary.ordersByStatus.length);
  expect(await orders.innerText(), 'statuses in words, counts in Persian digits').not.toMatch(/[A-Z_]{4,}|[0-9]/);
  const top = summary.topItems[0];
  if (top) {
    const row = owner.getByRole('region', { name: 'اقلام پرفروش' }).getByRole('listitem').filter({ hasText: top.name });
    await expect(row).toContainText(`${fa(top.quantity)} عدد، `);
  }
  await reviewShot(owner, 'admin-reports-fa-desktop');
});

test('site settings, catalog lists, audit log, payments and export: Persian digits accepted and every code in words (§5.3, §15)', async ({ browser, baseURL }) => {
  const owner = await open(browser, baseURL, ownerState);
  const reservation = async () => ((await (await owner.request.get('/api/v1/admin/settings')).json()) as { reservationMinutes: number }).reservationMinutes;
  const before = await reservation();

  // Settings: a number typed in Persian digits is saved as that number (then put back).
  await owner.goto('/fa/admin/settings');
  await owner.locator('#st-res').fill('۲۰');
  await owner.getByRole('button', { name: 'ذخیره', exact: true }).click();
  await expect.poll(reservation).toBe(20);
  await owner.reload();
  await owner.locator('#st-res').fill(String(before).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] as string));
  await owner.getByRole('button', { name: 'ذخیره', exact: true }).click();
  await expect.poll(reservation).toBe(before);

  // Categories and brands: a new vehicle brand is listed; featured brands are marked in words.
  await owner.goto('/fa/admin/taxonomy');
  await owner.locator('#tx-kind').selectOption('vehicle-brands');
  await owner.locator('#tx-code').fill(`TB${stamp}`);
  await owner.locator('#tx-fa').fill(`برند آزمایشی ${stamp}`);
  await owner.locator('#tx-en').fill(`Test brand ${stamp}`);
  await owner.getByRole('button', { name: 'افزودن', exact: true }).click();
  const brands = owner.getByRole('region', { name: 'برند خودرو' });
  await expect(brands).toContainText(`برند آزمایشی ${stamp}`);
  await expect(brands.getByText('ویژه').first()).toBeVisible();
  await expect(brands).not.toContainText('★');

  // Audit log: this run's sensitive actions in words — no English headers, no dotted codes.
  await owner.goto('/fa/admin/audit');
  const log = owner.getByRole('table');
  for (const action of ['ساخت برند خودرو', 'تغییر تنظیمات سایت', 'انتشار کالا', 'ثبت نرخ ارز', 'تأیید حساب تجاری']) await expect(log).toContainText(action);
  await expect(log.getByRole('columnheader')).toContainText(['تاریخ', 'انجام‌دهنده', 'عملیات', 'مورد', 'کد پیگیری درخواست']);
  expect(await log.innerText(), 'no raw action codes').not.toMatch(/\b[a-z_]+\.[a-z_]+/);
  await reviewShot(owner, 'admin-audit-fa-desktop');

  // Payments: this run's verified payments with the status in words and the test gateway labelled.
  await owner.goto('/fa/admin/payments');
  const payments = owner.getByRole('table').first();
  await expect(payments).toContainText('موفق');
  await expect(payments).toContainText('آزمایشی');

  // Catalog export: a real spreadsheet file (xlsx is a zip: "PK").
  await owner.goto('/fa/admin/imports');
  const [file] = await Promise.all([owner.waitForEvent('download'), owner.getByRole('link', { name: 'خروجی Excel محصولات' }).click()]);
  expect(file.suggestedFilename()).toMatch(/\.xlsx$/);
  expect(readFileSync(await file.path()).subarray(0, 2).toString('latin1')).toBe('PK');
});
