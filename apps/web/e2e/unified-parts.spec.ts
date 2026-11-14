import { expect, test } from '@playwright/test';

/**
 * One «قطعه»: the customer finds a part with the one search in the header (name, SKU, technical or
 * equivalent number, written any way), then buys it — or, when it has no price yet, sends a
 * sourcing request with the name and number already filled in. Preview data (fixtures).
 */
test.describe('one part, one search', () => {
  test('home page has no second search box and no catalog block; the menu has no «کاتالوگ فنی»', async ({ page }) => {
    await page.goto('/fa');
    await expect(page.getByRole('search')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'کاتالوگ فنی' })).toHaveCount(0);
    await expect(page.getByTestId('home-makers')).toBeVisible();
  });

  test('search → in-stock part → cart', async ({ page }) => {
    await page.goto('/fa');
    await page.locator('#header-search').fill('demo 0001');
    await page.locator('#header-search').press('Enter');
    await expect(page).toHaveURL(/\/fa\/parts\?q=/);
    await expect(page.getByTestId('search-term')).toContainText('demo 0001');
    await page.getByRole('link', { name: /لنت ترمز جلو پژو ۲۰۶/ }).first().click();
    await page.getByRole('button', { name: 'افزودن به سبد' }).click();
    await expect(page.getByText('به سبد اضافه شد')).toBeVisible();
  });

  test('search by an equivalent number with spaces → «قابل تأمین» → sourcing request with name and number', async ({ page }) => {
    await page.goto('/fa');
    await page.locator('#header-search').fill('04465 33480');
    await page.locator('#header-search').press('Enter');
    const card = page.getByRole('article').filter({ hasText: 'لنت ترمز جلو کمری' });
    await expect(card).toBeVisible();
    await expect(card.getByText('قابل تأمین')).toBeVisible();
    await card.getByRole('link').click();

    await expect(page).toHaveURL(/\/fa\/parts\/toyota-front-brake-pad-camry-04465-33471/);
    await expect(page.getByRole('button', { name: 'افزودن به سبد' })).toHaveCount(0);
    await expect(page.getByText('GDB3425')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'کاربرد در خودروها' })).toHaveCount(0);
    await page.getByTestId('sourceable-box').getByRole('link', { name: 'درخواست تأمین' }).click();

    await expect(page).toHaveURL(/\/fa\/request-part\?/);
    await expect(page.locator('#item-0-code')).toHaveValue('04465-33471');
  });

  test('in-stock parts come before «قابل تأمین» ones; the maker filter narrows the list', async ({ page }) => {
    await page.goto('/fa/parts?q=%D9%84%D9%86%D8%AA');
    const cards = page.getByRole('article');
    await expect(cards.first()).toContainText('پژو ۲۰۶');
    await expect(cards.last()).toContainText('قابل تأمین');

    await page.goto('/fa/parts');
    await page.locator('#filter-maker').selectOption('sample-toyota-genuine');
    await expect(page).toHaveURL(/maker=sample-toyota-genuine/);
    await expect(page.getByRole('article')).toHaveCount(2);
    await expect(page.locator('#filter-q')).toHaveCount(0);
  });

  test('old technical-catalog addresses move permanently to the part', async ({ request }) => {
    const one = await request.get('/fa/catalog/04465-33471', { maxRedirects: 0 });
    expect(one.status()).toBe(301);
    expect(one.headers().location).toContain('/fa/parts/toyota-front-brake-pad-camry-04465-33471');
    const list = await request.get('/fa/catalog?q=filter', { maxRedirects: 0 });
    expect(list.status()).toBe(301);
    expect(list.headers().location).toContain('/fa/parts?q=filter');
  });
});

test.describe('panel: one place for parts', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: 'hedax_fixture_role', value: 'staff', url: baseURL as string }]);
  });

  test('one sidebar workspace with task links inside it', async ({ page }) => {
    await page.goto('/fa/admin/products');
    const nav = page.locator('nav[aria-label="پنل مدیریت"]').first();
    await expect(nav.getByRole('link', { name: 'قطعات و منابع', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'ورود Excel', exact: true })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'بخش‌های قطعات و منابع' }).getByRole('link', { name: 'قطعات', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'بدون قیمت (قابل تأمین)' }).first()).toBeVisible();
  });

  test('new part form: technical numbers, specs, photos before saving, «ذخیره و انتشار»', async ({ page }) => {
    await page.goto('/fa/admin/products/new');
    await expect(page.locator('#pf-partnumber')).toBeVisible();
    await expect(page.locator('#pf-equivalents')).toBeVisible();
    await expect(page.getByRole('button', { name: 'افزودن مشخصه' })).toBeVisible();
    await expect(page.locator('#pf-photo-input')).toBeAttached();
    await expect(page.getByRole('button', { name: 'ذخیره و انتشار' })).toBeVisible();
  });

  test('brand database import: history, counts and undo', async ({ page }) => {
    await page.goto('/fa/admin/brand-imports');
    await expect(page.getByRole('heading', { name: 'ورود دیتابیس برند', level: 1 })).toBeVisible();
    // A step-by-step guide and the sample file come first.
    await expect(page.getByRole('heading', { name: /راهنما: ورود گروهی قطعه‌ها/ })).toBeVisible();
    await expect(page.getByTestId('brand-sample')).toHaveAttribute('href', '/api/v1/admin/brand-imports/sample.xlsx');
    await expect(page.locator('section[aria-labelledby="bi-guide"] ol > li')).toHaveCount(5);
    await page.getByRole('link', { name: 'toyota-parts.csv' }).click();
    await expect(page.getByText('انجام شد')).toBeVisible();
    await expect(page.getByRole('button', { name: 'برگرداندن این ورود' })).toBeVisible();
    await expect(page.getByRole('link', { name: /دانلود گزارش خطاها/ })).toBeVisible();

    await page.goto('/fa/admin/brand-imports');
    await page.getByRole('link', { name: 'toyota-parts-update.zip' }).click();
    await expect(page.locator('#bi-partNumber')).toHaveValue('Part No');
    await expect(page.getByRole('button', { name: 'ذخیرهٔ ستون‌ها و پیش‌نمایش' })).toBeEnabled();
  });

  test('knowledge center keeps reference files only', async ({ page }) => {
    await page.goto('/fa/admin/knowledge-catalog');
    await expect(page.getByRole('heading', { name: 'مرکز دانش (فایل‌های مرجع)', level: 1 })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'قطعات کاتالوگ' })).toHaveCount(0);
    await expect(page.getByText(/OCR|embedding/)).toHaveCount(0);
    // Where catalogs used to be uploaded, the bulk paths and their sample files are one click away.
    const bulk = page.getByTestId('kc-bulk');
    await expect(bulk.getByRole('link', { name: 'ورود دیتابیس برند' })).toHaveAttribute('href', '/fa/admin/brand-imports');
    await expect(bulk.getByRole('link', { name: 'فایل نمونه' })).toHaveAttribute('href', '/api/v1/admin/brand-imports/sample.xlsx');
    await expect(bulk.getByRole('link', { name: 'قالب Excel' })).toHaveAttribute('href', '/api/v1/admin/imports/template');
    await page.goto('/fa/admin/products');
    await expect(page.getByRole('link', { name: 'ورود اکسل', exact: true })).toHaveAttribute('href', '/fa/admin/imports');
  });

  test('workbook mapping keeps source choices separate and requires every included sheet to have a part number', async ({ page }) => {
    const id = '00000000-0000-7000-8000-00000000b102';
    const modern = 'modern.xlsx / Parts';
    const legacy = 'legacy.xls / Parts';
    const modernRows = [{ line: 1, cells: ['Supplier title'] }, { line: 2, cells: ['Part No', 'Name'] }, { line: 3, cells: ['000001', 'Sample part'] }];
    const legacyRows = [{ line: 1, cells: ['000002', 'Other sample'] }, { line: 2, cells: ['000003', 'Third sample'] }];
    await page.route(`**/api/v1/admin/brand-imports/${id}`, async route => {
      const response = await route.fetch();
      const view = await response.json();
      view.outline = [
        { name: modern, headers: ['Part No', 'Name'], headerRow: 2, samples: [['000001', 'Sample part']], sampleRows: modernRows, encoding: null, delimiter: null },
        { name: legacy, headers: ['000002', 'Other sample'], headerRow: 1, needsHeaderReview: true, samples: [['000003', 'Third sample']], sampleRows: legacyRows, encoding: null, delimiter: null },
      ];
      view.options.sources = {
        [modern]: { enabled: true, headerRow: 2, mapping: { partNumber: ['Part No'], nameEn: ['Name'] } },
        [legacy]: { enabled: true, headerRow: 1, mapping: {} },
      };
      await route.fulfill({ response, json: view });
    });
    await page.goto(`/fa/admin/brand-imports?id=${id}`);
    const save = page.getByRole('button', { name: 'ذخیرهٔ ستون‌ها و پیش‌نمایش' });
    await expect(save).toBeDisabled();
    await page.locator('#bi-source').selectOption(legacy);
    await page.locator('#bi-header-row').selectOption('0');
    await page.locator('#bi-partNumber').selectOption('Column 1');
    await page.locator('#bi-nameEn').selectOption('Column 2');
    await expect(save).toBeEnabled();
    await page.locator('#bi-source').selectOption(modern);
    await expect(page.locator('#bi-partNumber')).toHaveValue('Part No');
    await expect(page.locator('#bi-header-row')).toHaveValue('2');
    await page.locator('#bi-source').selectOption(legacy);
    await expect(page.locator('#bi-partNumber')).toHaveValue('Column 1');
    await page.locator('#bi-source-enabled').uncheck();
    await expect(save).toBeEnabled();
    await page.locator('#bi-source').selectOption(modern);
    await page.locator('#bi-source-enabled').uncheck();
    await expect(save).toBeDisabled();
    await page.locator('#bi-source-enabled').check();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(save).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/workbook-mapping-fa-mobile.png', fullPage: true });
  });

  test('legacy multi-source mapping saves independent columns and exclusions without header samples', async ({ page }) => {
    const id = '00000000-0000-7000-8000-00000000b102';
    await page.route(`**/api/v1/admin/brand-imports/${id}`, async route => {
      const response = await route.fetch();
      const view = await response.json();
      view.outline = [
        { name: 'one.csv', headers: ['Part No', 'Name'], samples: [['000001', 'first']] },
        { name: 'two.csv', headers: ['Code', 'Description'], samples: [['000002', 'second']] },
        { name: 'excluded.csv', headers: ['Other'], samples: [['skip']] },
      ];
      view.mapping = { partNumber: ['Part No'], nameEn: ['Name'] };
      delete view.options.sources;
      await route.fulfill({ response, json: view });
    });
    await page.route(`**/api/v1/admin/brand-imports/${id}/mapping`, route => route.fulfill({ json: { status: 'PREVIEWING' } }));
    await page.goto(`/fa/admin/brand-imports?id=${id}`);
    const save = page.getByRole('button', { name: 'ذخیرهٔ ستون‌ها و پیش‌نمایش' });
    await expect(save).toBeDisabled();
    await expect(page.locator('#bi-header-row')).toHaveCount(0);
    await expect(page.getByText('عنوان ستون‌ها قبلاً خوانده شده است.', { exact: false })).toBeVisible();
    await page.locator('#bi-source').selectOption('two.csv');
    await page.locator('#bi-partNumber').selectOption('Code');
    await page.locator('#bi-nameEn').selectOption('Description');
    await page.locator('#bi-source').selectOption('excluded.csv');
    await page.locator('#bi-source-enabled').uncheck();
    await page.locator('#bi-source').selectOption('one.csv');
    await expect(page.locator('#bi-partNumber')).toHaveValue('Part No');
    await expect(save).toBeEnabled();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const request = page.waitForRequest(r => r.url().endsWith(`/${id}/mapping`) && r.method() === 'PUT');
    await save.click();
    expect((await request).postDataJSON().options.sources).toEqual({
      'one.csv': { enabled: true, headerRow: 1, mapping: { partNumber: ['Part No'], nameEn: ['Name'] } },
      'two.csv': { enabled: true, headerRow: 1, mapping: { partNumber: ['Code'], nameEn: ['Description'], description: ['Description'] } },
      'excluded.csv': { enabled: false, headerRow: 1, mapping: {} },
    });
  });
});
