import { expect, test } from '@playwright/test';
import { DEFAULT_ASSISTANT_SETTINGS } from '@hedax/contracts/constants';

test.beforeEach(async ({ page, baseURL }) => { await page.context().addCookies([{ name: 'hedax_fixture_role', value: 'staff', url: baseURL! }]); });

for (const locale of ['fa', 'en']) {
  test(`${locale}: one workspace, task choices and mobile setup`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${locale}/admin/catalog`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(locale === 'fa' ? 'مدیریت قطعات و منابع' : 'Manage parts & sources');
    await expect(page.getByRole('heading', { name: locale === 'fa' ? 'ثبت یک قطعه' : 'Add one part', exact: true })).toBeVisible();
    await page.locator('main summary').click();
    await expect(page.locator('main').getByRole('link', { name: locale === 'fa' ? 'خودرو و تیپ' : 'Vehicles & trims', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/admin-workspace-${locale}-mobile.png`, fullPage: true });
  });
}

test('reference edit handles stale version, then delete uses the updated version', async ({ page }) => {
  let version = '2026-10-26T10:00:00.000Z'; let title = 'کاتالوگ تست'; let removed = false; let stale = true;
  const id = '00000000-0000-7000-8000-00000000c001';
  await page.route('**/api/v1/admin/knowledge-catalog**', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: removed ? [] : [{ id, title, version: '1', status: 'UPLOADED', filename: 'test.csv', extension: 'csv', sizeBytes: 10, uploadedBy: { id: 'test', name: 'Test', email: null }, uploadedAt: version, updatedAt: version, downloadUrl: '/api/v1/attachments/test/download', processingError: null }] });
    const body = request.postDataJSON();
    expect(body.expectedUpdatedAt).toBe(version);
    if (request.method() === 'PATCH') {
      if (stale) { stale = false; return route.fulfill({ status: 409, json: { error: { code: 'VERSION_CONFLICT', message: 'conflict' } } }); }
      title = body.title; version = '2026-10-26T10:01:00.000Z';
      return route.fulfill({ json: { id, title, updatedAt: version } });
    }
    removed = true; return route.fulfill({ json: { id, deleted: true } });
  });
  await page.goto('/fa/admin/knowledge-catalog');
  await page.getByRole('button', { name: 'ویرایش', exact: true }).click();
  await page.locator(`#catalog-edit-title-${id}`).fill('عنوان جدید');
  await page.getByRole('dialog').getByRole('button', { name: 'ذخیره', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await expect(page.locator(`#catalog-edit-title-${id}`)).toHaveValue('عنوان جدید');
  await page.getByRole('dialog').getByRole('button', { name: 'ذخیره', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('cell').getByText('عنوان جدید', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'حذف منبع', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'حذف منبع', exact: true }).click();
  await expect(page.getByText('هنوز کاتالوگی بارگذاری نشده است.')).toBeVisible();
});

test('part form rejects zero pack and incomplete specification instead of silently dropping it', async ({ page }) => {
  await page.goto('/fa/admin/products/new');
  await page.locator('#pf-pack').fill('٠');
  await page.getByRole('button', { name: 'افزودن مشخصه', exact: true }).click();
  await page.locator('#pf-sl-0').fill('کد موتور');
  await page.getByRole('button', { name: 'ذخیره', exact: true }).click();
  await expect(page.getByText('تعداد در بسته باید عدد صحیح از ۱ تا ۱۰۰۰۰ باشد.').last()).toBeVisible();
  await expect(page.getByText('عنوان و مقدار مشخصه را هر دو تکمیل کنید یا ردیف را حذف کنید.').last()).toBeVisible();
});

test('setup editor supports manufacturer creation and reports an in-use deletion', async ({ page }) => {
  await page.route('**/api/v1/admin/manufacturer-brands', route => route.fulfill({ json: { id: 'maker-test' } }));
  await page.route('**/api/v1/admin/taxonomy/categories/*', route => route.fulfill({ status: 409, json: { error: { code: 'TAXONOMY_IN_USE', message: 'in use' } } }));
  await page.goto('/fa/admin/taxonomy');
  await page.getByRole('button', { name: 'حذف', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'حذف', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('در حال استفاده');
  await page.getByRole('dialog').getByRole('button', { name: 'انصراف' }).click();
  await page.locator('#tax-kind').selectOption('manufacturer-brands');
  await page.getByRole('button', { name: 'افزودن سازندهٔ قطعه' }).click();
  await page.locator('#tax-name-fa').fill('سازندهٔ آزمایشی');
  await page.getByRole('dialog').getByRole('button', { name: 'ذخیره', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('تغییرات ثبت شد.', { exact: true })).toBeVisible();
});

test('vehicle form requires its finder group and sends the actual selected fields', async ({ page }) => {
  let saved: Record<string, unknown> | null = null;
  await page.route('**/api/v1/admin/vehicles', async route => {
    if (route.request().method() === 'POST') { saved = route.request().postDataJSON(); return route.fulfill({ json: { id: 'vehicle-created' } }); }
    return route.continue();
  });
  await page.goto('/fa/admin/vehicles');
  await page.getByRole('button', { name: 'افزودن خودرو', exact: true }).click();
  await page.locator('#vd-name').fill('خودروی تست');
  await page.locator('#vd-make-fa').fill('برند اصلی تست');
  await page.locator('#vd-finder').check();
  await page.getByRole('dialog').getByRole('button', { name: 'ذخیره', exact: true }).click();
  await expect(page.getByText('برای نمایش در انتخاب‌گر، حداقل یک گروه خودرو انتخاب کنید.')).toBeVisible();
  await page.locator('input[id^="vd-group-"]').first().check();
  await page.getByRole('dialog').getByRole('button', { name: 'ذخیره', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(saved).toMatchObject({ finderVisible: true, makeFa: 'برند اصلی تست' });
  expect(saved!['finderGroupIds']).toHaveLength(1);
});

test('a failed photo upload after creating a part offers continuation and blocks duplicate creation', async ({ page }) => {
  let creates = 0;
  const id = '00000000-0000-7000-8000-00000000c002';
  await page.route('**/api/v1/admin/products', route => { creates += 1; return route.fulfill({ json: { id, version: 1 } }); });
  await page.route(`**/api/v1/admin/products/${id}/media`, route => route.fulfill({ status: 503, json: { error: { code: 'STORAGE_UNAVAILABLE', message: 'storage unavailable' } } }));
  await page.goto('/fa/admin/products/new');
  await page.locator('#pf-partnumber').fill('TEST-123');
  await page.locator('#pf-namefa').fill('قطعهٔ آزمایشی');
  await page.locator('#pf-category').selectOption({ index: 1 });
  await page.locator('#pf-photo-input').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII=', 'base64') });
  await page.getByRole('button', { name: 'ذخیره', exact: true }).click();
  await expect(page.getByRole('link', { name: 'باز کردن قطعهٔ ثبت‌شده و تکمیل عکس‌ها' })).toHaveAttribute('href', `/fa/admin/products/${id}`);
  await expect(page.getByRole('button', { name: 'ذخیره', exact: true })).toBeDisabled();
  expect(creates).toBe(1);
});

test('assistant diagnostics distinguish configuration and reference files from a real connection', async ({ page }) => {
  await page.route('**/api/v1/admin/assistant/status**', route => route.fulfill({ json: { provider: 'mock', model: 'synthetic-test-provider', configurationReady: false, checks: { liveProvider: false, endpointPresent: false, credentialPresent: false, liveCallsEnabled: false, assistantEnabled: false, budgetEnabled: false } } }));
  await page.route('**/api/v1/admin/settings/assistant**', route => route.fulfill({ json: { ...DEFAULT_ASSISTANT_SETTINGS, version: 1 } }));
  await page.goto('/fa/admin/assistant');
  await expect(page.getByText('حالت آزمایشی؛ اتصال واقعی نیست')).toBeVisible();
  await expect(page.getByText('منبع مستقیم سایت: اطلاعات ثبت‌شدهٔ محصولات')).toBeVisible();
  await expect(page.getByText(/پایگاه دانش خارجی می‌تواند در خودِ درگاه آروان متصل باشد/)).toBeVisible();
});

test('read-only staff see no import/create actions and cannot submit the part form', async ({ page }) => {
  await page.route('**/api/v1/me**', async route => {
    const response = await route.fetch(); const user = await response.json();
    await route.fulfill({ response, json: { ...user, isOwner: false, permissions: ['products.read'] } });
  });
  await page.goto('/fa/admin/products');
  await expect(page.getByRole('link', { name: 'ورود اکسل', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'قطعهٔ جدید', exact: true })).toHaveCount(0);
  await page.goto('/fa/admin/products/new');
  await expect(page.getByText('دسترسی شما فقط برای مشاهده است.')).toBeVisible();
  await expect(page.locator('#pf-namefa')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'ذخیره', exact: true })).toBeDisabled();
});
