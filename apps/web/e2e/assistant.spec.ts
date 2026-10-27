import { expect, test } from '@playwright/test';
import { DEFAULT_ASSISTANT_SETTINGS } from '@hedax/contracts/constants';

test.use({ video: process.env.ASSISTANT_CAPTURE === '1' ? 'on' : 'off' });

test('disabled by default; enabled guide is local, keyboard accessible and bilingual', async ({ page }) => {
  await page.goto('/fa');
  await expect(page.getByRole('button', { name: 'باز کردن هکسی، راهنمای سورس' })).toHaveCount(0);
  await page.route('**/api/v1/site/assistant?**', (route) => route.fulfill({ json: { ...DEFAULT_ASSISTANT_SETTINGS, enabled: true } }));
  await page.route('**/api/v1/assistant/messages', (route) => route.fulfill({ json: { text: 'نتیجهٔ grounded آزمایشی', products: [{ slug: 'demo', sku: '000123', name: { fa: 'لنت نمونه', en: 'Sample pad' }, partNumber: '000123', availability: 'IN_STOCK', unit: { name: 'عدد', nameEn: 'piece' }, price: { kind: 'price', payable: { amountMinor: '1000', currency: 'IRR' }, display: { amountMinor: '1000', currency: 'IRR' }, displayIsReference: false }, fitments: [], primaryImage: null }], provider: 'mock', model: 'test' } }));
  await page.reload();
  // The dev server's corner indicator (absent in production builds) sits over the compact launcher.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  const launcher = page.getByRole('button', { name: 'باز کردن هکسی، راهنمای سورس' });
  await launcher.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('dir', 'rtl');
  await dialog.getByLabel('نام قطعه، شماره فنی یا پرسش').fill('000123 & لنت');
  await dialog.getByRole('button', { name: 'ارسال', exact: true }).click();
  await expect(dialog.getByRole('log').locator('bdi[dir="ltr"]').filter({ hasText: /^000123$/ })).toHaveCount(1);
  await expect(dialog.getByText('نتیجهٔ grounded آزمایشی')).toBeVisible();
  await expect(dialog.getByRole('link', { name: /لنت نمونه/ })).toHaveAttribute('href', '/fa/parts/demo');
  // Stock and price use the storefront's labels and money format, never raw codes.
  await expect(dialog.getByRole('link', { name: /لنت نمونه/ })).toContainText('موجود');
  await expect(dialog.getByRole('link', { name: /لنت نمونه/ })).not.toContainText('IN_STOCK');
  await expect(dialog.getByRole('button', { name: /microphone|voice|صوت|میکروفن/i })).toHaveCount(0);
  await expect(page.locator('aside[data-moving]')).toHaveAttribute('data-moving', 'true');
  await dialog.getByRole('button', { name: 'توقف حرکت' }).click();
  await expect(page.locator('aside[data-moving]')).toHaveAttribute('data-moving', 'false');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(launcher).toBeFocused();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['hedax-guide-paused']);
  await page.getByRole('button', { name: /English/ }).click();
  await page.getByRole('button', { name: 'Open Hexi, the Source guide' }).click();
  await expect(page.getByRole('dialog')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('dialog').getByRole('log')).toHaveText('');
  await page.getByRole('button', { name: 'Order or request a part', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('link')).toHaveAttribute('href', '/en/request-part');
  await page.getByRole('button', { name: 'Contact support', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('link', { name: /Contact support/ })).toHaveAttribute('href', '/en/contact');
});

for (const width of [390, 768, 1440]) {
  test(`visual ${width}: reduced motion, compact controls and bounded viewport`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/v1/site/assistant?**', (route) => route.fulfill({ json: { ...DEFAULT_ASSISTANT_SETTINGS, enabled: true } }));
    await page.goto('/fa');
    // The dev server's corner indicator (absent in production builds) sits over the compact launcher.
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await expect(page.getByRole('button', { name: 'باز کردن هکسی، راهنمای سورس' })).toBeVisible();
    await expect(page.locator('.assistant-character img')).toHaveAttribute('src', /hedax-mechanic-idle-v1-\d+\.webp/);
    await expect(page.locator('.assistant-character')).not.toHaveCSS('background-color', 'rgb(255, 255, 255)');
    expect(await page.locator('.assistant-avatar').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    await page.screenshot({ path: testInfo.outputPath(`assistant-launcher-${width}.png`), fullPage: false });
    const dock = (await page.locator('.assistant-dock').boundingBox())!;
    expect(dock.y + dock.height).toBeLessThan(width < 640 ? 825 : 900);
    await page.locator('.assistant-character').dragTo(page.locator('main'), { targetPosition: { x: Math.min(180, width / 2), y: 220 } });
    await expect.poll(() => page.evaluate(() => localStorage.getItem('hedax-guide-position'))).not.toBeNull();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'بازگرداندن موقعیت کاراکتر' }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('hedax-guide-position'))).toBeNull();
    await page.getByRole('button', { name: 'کوچک‌کردن کاراکتر' }).click();
    expect((await page.locator('.assistant-dock').boundingBox())!.width).toBeLessThan(dock.width);
    await page.getByRole('button', { name: 'باز کردن هکسی، راهنمای سورس' }).focus();
    await page.keyboard.press('Enter');
    const box = (await page.getByRole('dialog').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(900);
    await page.screenshot({ path: testInfo.outputPath(`assistant-open-${width}.png`), fullPage: false });
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const dock = document.querySelector('.assistant-dock')!.getBoundingClientRect();
      const action = document.createElement('button');
      action.id = 'assistant-collision-test'; action.textContent = 'Important test action';
      Object.assign(action.style, { position: 'fixed', left: `${dock.left}px`, top: `${dock.bottom - 80}px`, width: '80px', height: '48px' });
      document.querySelector('main')!.append(action); window.dispatchEvent(new Event('scroll'));
    });
    await expect.poll(async () => {
      const launcher = await page.locator('.assistant-dock').boundingBox();
      const action = await page.locator('#assistant-collision-test').boundingBox();
      if (!launcher || !action) return true;
      return launcher.x + launcher.width <= action.x || launcher.x >= action.x + action.width || launcher.y + launcher.height <= action.y || launcher.y >= action.y + action.height;
    }).toBe(true);
    await page.evaluate(() => { document.getElementById('assistant-collision-test')!.remove(); window.dispatchEvent(new Event('scroll')); });
    await page.getByRole('button', { name: 'باز کردن هکسی، راهنمای سورس' }).focus();
    await page.keyboard.press('Enter');
    // Short visual viewport approximates the usable space when a mobile keyboard is open.
    await page.setViewportSize({ width, height: 460 });
    await expect(page.getByRole('dialog').getByRole('button', { name: 'ارسال', exact: true })).toBeInViewport();
    await page.keyboard.press('Escape');
    await page.goto('/en/cart');
    await expect(page.getByRole('button', { name: 'Open Hexi, the Source guide' })).toHaveCount(0);
  });
}

test('excluded transactional and staff paths never mount the launcher', async ({ page }) => {
  await page.route('**/api/v1/site/assistant?**', (route) => route.fulfill({ json: { ...DEFAULT_ASSISTANT_SETTINGS, enabled: true } }));
  for (const path of ['/fa/checkout', '/fa/payment/result', '/fa/staff/login', '/fa/admin', '/fa/account', '/fa/parts/demo-air-filter-corolla']) {
    await page.goto(path);
    await expect(page.getByRole('button', { name: /باز کردن هکسی|Open Hexi/ })).toHaveCount(0);
  }
});

test('admin settings only save explicitly and reset remains a draft', async ({ page, context }) => {
  await context.addCookies([{ name: 'hedax_fixture_role', value: 'staff', url: 'http://localhost:3100' }]);
  let writes = 0;
  await page.route('**/api/v1/admin/settings/assistant', async (route) => {
    if (route.request().method() === 'PUT') { writes++; await route.fulfill({ json: { saved: true, version: 1 } }); }
    else await route.fulfill({ json: { ...DEFAULT_ASSISTANT_SETTINGS, version: writes } });
  });
  await page.route('**/api/v1/admin/assistant/status', (route) => route.fulfill({ json: { provider: 'arvan', model: 'gpt-5.6-luna', configured: true, liveCallsEnabled: true, timeoutMs: 15000, maxOutputTokens: 400, dailyRequestLimit: 100 } }));
  await page.goto('/fa/admin/assistant');
  await expect(page.getByRole('heading', { name: 'وضعیت دستیار', exact: true })).toBeVisible();
  expect(writes).toBe(0);
  await page.getByRole('button', { name: 'تنظیمات عمومی', exact: true }).click();
  await page.getByLabel('فعال‌کردن دستیار متنی').check();
  expect(writes).toBe(0);
  await page.getByRole('button', { name: 'پیش‌فرض‌ها در فرم', exact: true }).click();
  await expect(page.getByLabel('فعال‌کردن دستیار متنی')).not.toBeChecked();
  expect(writes).toBe(0);
  await page.getByRole('button', { name: 'ذخیره', exact: true }).click();
  await expect.poll(() => writes).toBe(1);
});

test('page visibility pauses the mascot without persisting a conversation', async ({ page }) => {
  await page.route('**/api/v1/site/assistant?**', (route) => route.fulfill({ json: { ...DEFAULT_ASSISTANT_SETTINGS, enabled: true } }));
  await page.goto('/en');
  await expect(page.locator('.assistant-dock')).toHaveAttribute('data-moving', 'true');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('.assistant-dock')).toHaveAttribute('data-moving', 'false');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('.assistant-dock')).toHaveAttribute('data-moving', 'true');
});

test('admin messages tab lists conversations and opens a question with the guide\'s answer', async ({ page, context }) => {
  await context.addCookies([{ name: 'hedax_fixture_role', value: 'staff', url: 'http://localhost:3100' }]);
  await page.route('**/api/v1/admin/settings/assistant', (route) => route.fulfill({ json: { ...DEFAULT_ASSISTANT_SETTINGS, version: 1 } }));
  await page.route('**/api/v1/admin/assistant/status', (route) => route.fulfill({ json: { provider: 'arvan', model: 'gpt-5.6-luna', configurationReady: true, checks: {}, maxOutputTokens: 600, dailyRequestLimit: 100 } }));
  const summary = { id: '0195f1e2-3c4d-7e8f-9a0b-1c2d3e4f5a6b', locale: 'fa', signedIn: false, messageCount: 2, failedCount: 1, startedAt: '2026-10-27T10:00:00.000Z', lastMessageAt: '2026-10-27T10:05:00.000Z', firstQuestion: 'لنت ترمز پژو ۲۰۶ دارید؟', lastAnswer: 'بله! لنت جلو موجوده.' };
  let listQuery = '';
  await page.route('**/api/v1/admin/assistant/conversations?**', (route) => { listQuery = new URL(route.request().url()).search; return route.fulfill({ json: { items: [summary], total: 1, page: 1, pageSize: 20, retentionDays: 90, stats: { conversations7d: 1, messages7d: 2, failed7d: 1 } } }); });
  await page.route(`**/api/v1/admin/assistant/conversations/${summary.id}`, (route) => route.fulfill({ json: { ...summary, messages: [
    { id: 'm1', question: 'لنت ترمز پژو ۲۰۶ دارید؟', answer: 'بله! لنت جلو موجوده.', status: 'ANSWERED', errorReason: null, productSkus: ['SYN-1'], provider: 'arvan', model: 'gpt-5.6-luna', promptTokens: 900, completionTokens: 40, latencyMs: 1800, createdAt: '2026-10-27T10:00:00.000Z' },
    { id: 'm2', question: 'قیمتش چنده؟', answer: null, status: 'FAILED', errorReason: 'Assistant cost budget is exhausted', productSkus: [], provider: 'arvan', model: 'gpt-5.6-luna', promptTokens: null, completionTokens: null, latencyMs: 20, createdAt: '2026-10-27T10:05:00.000Z' },
  ] } }));
  await page.goto('/fa/admin/assistant');
  await page.getByRole('button', { name: 'پیام‌ها', exact: true }).click();
  await expect(page.getByText('گفتگوها 90 روز پس از آخرین پیام', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /لنت ترمز پژو ۲۰۶ دارید؟/ }).click();
  await expect(page.getByText('قیمتش چنده؟')).toBeVisible();
  await expect(page.getByText('بدون پاسخ')).toBeVisible();
  await expect(page.getByText('بودجهٔ روزانهٔ مصرف تمام شده یا تنظیم نشده است.')).toBeVisible();
  // No save button on the read-only log.
  await expect(page.getByRole('button', { name: 'ذخیره', exact: true })).toHaveCount(0);
  await page.getByLabel('نمایش').selectOption('failed');
  await expect.poll(() => listQuery).toContain('status=failed');
});
