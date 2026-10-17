import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Technical parts catalog («کاتالوگ فنی قطعات») on the site and in the panel (fixtures preview). */

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'page must not scroll horizontally').toBeLessThanOrEqual(1);
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
}

test.describe('technical catalog on the site', () => {
  test('search finds a number written with spaces, Persian digits or an equivalent; drafts never show', async ({ page }) => {
    await page.goto('/fa/catalog');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('کاتالوگ فنی قطعات');
    const results = page.getByTestId('catalog-results');
    await expect(results.getByRole('article')).toHaveCount(3);
    for (const q of ['۰۴۵۰ ۱۰۲ ۸۰۵', '0450102805', 'wk512', 'فیلتر بنزین']) {
      await page.goto(`/fa/catalog?q=${encodeURIComponent(q)}`);
      await expect(results.getByRole('article'), q).toHaveCount(1);
      await expect(results.getByText('0450-102-805')).toBeVisible();
    }
    await page.goto('/fa/catalog?q=DRAFT-001');
    await expect(page.getByText(/قطعه‌ای در کاتالوگ پیدا نشد/)).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: 'درخواست تأمین', exact: true })).toHaveAttribute('href', '/fa/request-part?part=DRAFT-001');
  });

  test('filters by vehicle brand, vehicle and model, and part group', async ({ page }) => {
    await page.goto('/fa/catalog');
    await page.getByLabel('برند خودرو').selectOption('saipa');
    await expect(page).toHaveURL(/brand=saipa/);
    await expect(page.getByTestId('catalog-results').getByRole('article')).toHaveCount(1);
    await expect(page.getByText('SP-1182-A')).toBeVisible();
    await page.goto('/fa/catalog?vehicle=peugeot');
    await expect(page.getByTestId('catalog-results').getByRole('article')).toHaveCount(2);
    await page.getByLabel('مدل').selectOption('405');
    await expect(page).toHaveURL(/model=405/);
    await expect(page.getByTestId('catalog-results').getByRole('article')).toHaveCount(1);
    await page.goto('/fa/catalog?category=brake');
    await expect(page.getByTestId('catalog-results').getByRole('article')).toHaveCount(1);
    // «کاربرد» in one line on the card.
    const line = page.getByTestId('catalog-fitment').first();
    await expect(line).toContainText('کاربرد: پژو ۲۰۶');
    expect((await line.boundingBox())!.height).toBeLessThan(24);
  });

  test('detail page: numbers, specs, fitment table; request or buy button; readable address and metadata', async ({ page }) => {
    await page.goto('/fa/catalog/0450-102-805');
    await expect(page).toHaveTitle(/فیلتر بنزین انژکتوری.*0450-102-805/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/fa\/catalog\/0450-102-805$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('فیلتر بنزین انژکتوری (نمونه)');
    for (const n of ['WK 512', '0 450 905 133', '0450102806']) await expect(page.getByText(n, { exact: true })).toBeVisible();
    const specs = page.getByRole('table', { name: 'مشخصات فنی' });
    await expect(specs.getByRole('row', { name: /قطر/ })).toContainText('80mm');
    const fit = page.getByRole('table', { name: 'کاربرد در خودروها' });
    await expect(fit.getByRole('row', { name: /پژو/ })).toContainText('1390–1400');
    await expect(fit.getByRole('row', { name: /سمند/ })).toContainText('همهٔ مدل‌ها');
    const request = page.getByTestId('catalog-request');
    await expect(request).toHaveAttribute('href', `/fa/request-part?part=${encodeURIComponent('فیلتر بنزین انژکتوری (نمونه)')}&code=0450-102-805`);
    await expect(page.getByTestId('catalog-buy')).toHaveCount(0);
    await page.setViewportSize({ width: 360, height: 800 });
    await noHorizontalScroll(page);
    await axe(page);

    // The request form is filled with the name and the number.
    await request.click();
    await expect(page).toHaveURL(/\/fa\/request-part\?part=/);
    await expect(page.locator('#item-0-code')).toHaveValue('0450-102-805');

    await page.goto('/fa/catalog/demo-0001');
    await expect(page.getByTestId('catalog-buy')).toHaveAttribute('href', '/fa/parts/demo-front-brake-pad-206');
    await expect(page.getByTestId('catalog-request')).toHaveCount(0);
    await page.goto('/fa/catalog/draft-001');
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(/پیش‌نویس/);
  });

  test('English is LTR and translated; the list fits a phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/en/catalog');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Technical parts catalogue');
    await expect(page.getByTestId('catalog-results').getByText('Injection fuel filter (SAMPLE)')).toBeVisible();
    await noHorizontalScroll(page);
    await page.goto('/fa/catalog');
    await noHorizontalScroll(page);
    await axe(page);
  });

  test('home page: catalog search box and newest parts', async ({ page }) => {
    await page.goto('/fa');
    const block = page.getByTestId('catalog-home');
    await expect(block.getByRole('heading', { name: 'کاتالوگ فنی قطعات' })).toBeVisible();
    await expect(block.getByRole('article')).toHaveCount(3);
    await block.getByRole('searchbox').fill('WK 512');
    await block.getByRole('button', { name: 'جست‌وجو' }).click();
    await expect(page).toHaveURL(/\/fa\/catalog\?q=WK\+512/);
    await expect(page.getByTestId('catalog-results').getByRole('article')).toHaveCount(1);
    // The hero's «کاتالوگ قطعات» card opens the catalog.
    await page.goto('/fa');
    await expect(page.locator('a.hedax-discovery-card', { hasText: 'کاتالوگ قطعات' })).toHaveAttribute('href', '/fa/catalog');
  });
});

test.describe('technical catalog in the panel', () => {
  test('the «قطعات کاتالوگ» tab lists entries with status, and opens the form', async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: 'hedax_fixture_role', value: 'staff', url: baseURL as string }]);
    await page.goto('/fa/admin/knowledge-catalog?tab=entries');
    await expect(page.getByRole('tab', { name: 'قطعات کاتالوگ' })).toHaveAttribute('aria-selected', 'true');
    const table = page.getByRole('table', { name: 'قطعات کاتالوگ' });
    await expect(table.getByRole('row')).toHaveCount(5);
    await expect(table.getByRole('row', { name: /DRAFT-001/ }).getByText('پیش‌نویس', { exact: true })).toBeVisible();
    await expect(table.getByRole('row', { name: /0450-102-805/ }).getByText('منتشرشده', { exact: true })).toBeVisible();
    await table.getByRole('row', { name: /0450-102-805/ }).getByRole('button', { name: /ویرایش|مشاهده/ }).click();
    await expect(page.locator('#ce-pn')).toHaveValue('0450-102-805');
    await expect(page.locator('#ce-eq')).toHaveValue('WK 512, 0 450 905 133');
    await page.setViewportSize({ width: 360, height: 800 });
    await noHorizontalScroll(page);
  });
});
