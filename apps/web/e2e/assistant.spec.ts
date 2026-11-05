import { expect, test } from '@playwright/test';
import { DEFAULT_ASSISTANT_SETTINGS } from '@hedax/contracts/constants';

test.use({ video: process.env.ASSISTANT_CAPTURE === '1' ? 'on' : 'off' });


test('disabled by default; enabled guide is local, keyboard accessible and bilingual', async ({ page }) => {
  await page.goto('/fa');
  await expect(page.getByRole('button', { name: 'باز کردن هیکسی، راهنمای سورس' })).toHaveCount(0);
  await page.route('**/api/v1/site/assistant?**', (route) => route.fulfill({ json: { ...DEFAULT_ASSISTANT_SETTINGS, enabled: true } }));
  await page.route('**/api/v1/assistant/messages', (route) => route.fulfill({ json: { text: 'نتیجهٔ grounded آزمایشی', products: [{ slug: 'demo', sku: '000123', name: { fa: 'لنت نمونه', en: 'Sample pad' }, partNumber: '000123', availability: 'IN_STOCK', unit: { name: 'عدد', nameEn: 'piece' }, price: { kind: 'price', payable: { amountMinor: '1000', currency: 'IRR' }, display: { amountMinor: '1000', currency: 'IRR' }, displayIsReference: false }, fitments: [], primaryImage: null }], provider: 'mock', model: 'test' } }));
  await page.reload();
  // The dev server's corner indicator (absent in production builds) sits over the compact launcher.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  const launcher = page.getByRole('button', { name: 'باز کردن هیکسی، راهنمای سورس' });
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
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(launcher).toBeFocused();
  expect(await page.evaluate(() => Object.keys(localStorage)), 'nothing about the conversation is kept').toEqual([]);
  await page.getByRole('button', { name: /English/ }).click();
  await expect(page.getByRole('button', { name: 'Open Hexi, the Source guide' })).toBeAttached();
  await page.getByRole('button', { name: 'Open Hexi, the Source guide' }).click();
  await expect(page.getByRole('dialog')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('dialog').getByRole('log')).toHaveText('');
  await page.getByRole('button', { name: 'Order or request a part', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('link')).toHaveAttribute('href', '/en/request-part');
  await page.getByRole('button', { name: 'Talk to an operator', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Your name', { exact: true })).toBeVisible();
});

for (const width of [390, 768, 1440]) {
  test(`visual ${width}: the whole character, and a panel inside the viewport, with a keyboard's height too`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/v1/site/assistant?**', (route) => route.fulfill({ json: { ...DEFAULT_ASSISTANT_SETTINGS, enabled: true } }));
    await page.goto('/fa');
    // The dev server's corner indicator (absent in production builds) sits over the launcher.
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const launcher = page.getByRole('button', { name: 'باز کردن هیکسی، راهنمای سورس' });
    await expect(launcher).toBeVisible();
    await expect(page.locator('.assistant-launcher img')).toHaveAttribute('src', /brand\/source\/atelier\/hexi\.webp/);
    await page.screenshot({ path: testInfo.outputPath(`assistant-launcher-${width}.png`), fullPage: false });
    const dock = (await page.locator('.assistant-dock').boundingBox())!;
    expect(dock.width).toBeGreaterThanOrEqual(width < 1024 ? 72 : 100);
    expect(dock.width).toBeLessThanOrEqual(width < 1024 ? 88 : 128);
    expect(dock.y + dock.height).toBeLessThanOrEqual(900 - 10);
    await launcher.focus();
    await page.keyboard.press('Enter');
    const box = (await page.getByRole('dialog').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(900);
    await page.screenshot({ path: testInfo.outputPath(`assistant-open-${width}.png`), fullPage: false });
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
    await expect(page.getByRole('button', { name: /باز کردن هیکسی|Open Hexi/ })).toHaveCount(0);
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

test('a failed smart answer is a friendly reply with the operator form, part search and sourcing request', async ({ page }) => {
  await page.route('**/api/v1/site/assistant?**', (route) => route.fulfill({ json: { ...DEFAULT_ASSISTANT_SETTINGS, enabled: true } }));
  let call = 0;
  await page.route('**/api/v1/assistant/messages', (route) => (++call === 1
    ? route.fulfill({ status: 201, json: { text: 'پاسخ هوشمند من همین حالا کمی کُند شده؛ ببخشید! 🙏', products: [], provider: 'fallback', model: 'test' } })
    : route.abort('connectionreset')));
  await page.goto('/fa');
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await page.getByRole('button', { name: 'باز کردن هیکسی، راهنمای سورس' }).click();
  const dialog = page.getByRole('dialog');
  const ask = async (text: string) => { await dialog.getByLabel('نام قطعه، شماره فنی یا پرسش').fill(text); await dialog.getByRole('button', { name: 'ارسال', exact: true }).click(); };
  await ask('سلام');
  await expect(dialog.getByText('پاسخ هوشمند من همین حالا کمی کُند شده')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'جست‌وجوی قطعات' })).toHaveAttribute('href', '/fa/parts');
  await expect(dialog.getByRole('link', { name: 'درخواست تأمین قطعه' }).first()).toHaveAttribute('href', '/fa/request-part');
  // The server unreachable: the same friendly reply, never "connection lost".
  await ask('لنت دارید؟');
  await expect(dialog.getByText('پاسخ هوشمند من همین حالا کمی کُند شده')).toHaveCount(2);
  await expect(dialog.getByText(/در دسترس نیست/)).toHaveCount(0);
  await dialog.getByRole('log').getByRole('button', { name: 'ارتباط با اپراتور' }).first().click();
  await expect(dialog.locator('#operator-name')).toBeVisible();
});
