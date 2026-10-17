import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Units and vehicle fitment («کاربرد در خودرو») on the site and in the panel (fixtures preview). */

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'page must not scroll horizontally').toBeLessThanOrEqual(1);
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
}

const PAD_ID = '00000000-0000-7000-8000-000000000001';

test.describe('vehicle fitment on the site', () => {
  test('home cards show compact fitment next to vehicle information at phone and desktop widths', async ({ page }) => {
    await page.goto('/fa');
    const card = page.locator('article').filter({ has: page.locator('a[href="/fa/parts/demo-front-brake-pad-206"]') }).first();
    const fitment = card.locator('p[title]').filter({ hasText: 'کاربرد:' });
    await expect(fitment).toContainText('پژو ۲۰۶');
    await expect(fitment).toContainText('دنا');
    await expect(fitment).toHaveClass(/line-clamp-1/);
    expect(await fitment.getAttribute('title')).toBe(await fitment.textContent());
    for (const width of [360, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(fitment).toBeVisible();
      await noHorizontalScroll(page);
    }
  });

  test('«مناسب برای:» sits under the photo with clickable vehicles and models; the price is per unit', async ({ page }) => {
    await page.goto('/fa/parts/demo-front-brake-pad-206');
    const fitment = page.getByTestId('fitment');
    await expect(fitment.getByRole('heading', { name: 'مناسب برای:' })).toBeVisible();
    await expect(fitment.getByRole('link', { name: 'پژو ۲۰۶' })).toHaveAttribute('href', '/fa/cars/peugeot?model=206');
    await expect(fitment.getByRole('link', { name: 'دنا', exact: true })).toHaveAttribute('href', '/fa/cars/dena');
    // Under the photo: the chips start below the top of the gallery column, in the same column.
    const photo = await page.locator('main#main .lg\\:col-start-1').first().boundingBox();
    const chips = await fitment.boundingBox();
    expect(chips && photo && chips.y > photo.y).toBe(true);
    await expect(page.getByTestId('price-unit').first()).toHaveText('/ عدد');
    // Structured data names the vehicles the part fits.
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? '{}');
    expect(ld.isAccessoryOrSparePartFor.map((v: { name: string }) => v.name)).toEqual(expect.arrayContaining(['پژو ۲۰۶', 'دنا']));
    await page.setViewportSize({ width: 360, height: 800 });
    await noHorizontalScroll(page);
    await axe(page);

    await fitment.getByRole('link', { name: 'پژو ۲۰۶' }).click();
    await expect(page).toHaveURL(/\/fa\/cars\/peugeot\?model=206/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('قطعات یدکی پژو');
    await expect(page.getByTestId('vehicle-models').getByRole('link', { name: '۲۰۶' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('link', { name: /لنت ترمز جلو پژو ۲۰۶/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /واتر پمپ پژو ۴۰۵/ })).toHaveCount(0);
    await expect(page).toHaveTitle(/قطعات یدکی پژو/);
  });

  test('vehicle pages list every part of the vehicle, the shop filters by vehicle and the search finds vehicle names', async ({ page }) => {
    await page.goto('/fa/cars');
    await expect(page.getByRole('link', { name: /پژو/ }).first()).toBeVisible();
    await page.goto('/fa/cars/peugeot');
    for (const part of [/لنت ترمز جلو پژو ۲۰۶/, /واتر پمپ پژو ۴۰۵/]) await expect(page.getByRole('link', { name: part }).first()).toBeVisible();

    await page.goto('/fa/parts');
    await page.locator('#filter-vehicle').selectOption('dena');
    await expect(page).toHaveURL(/vehicle=dena/);
    await expect(page.getByRole('link', { name: /لنت ترمز جلو پژو ۲۰۶/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /فيلتر روغن سمند|فیلتر روغن سمند/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /واتر پمپ/ })).toHaveCount(0);
    // The vehicle filter offers its models.
    await expect(page.locator('#filter-model')).toBeVisible();

    await page.goto(`/fa/parts?q=${encodeURIComponent('لنت دنا')}`);
    await expect(page.getByRole('link', { name: /لنت ترمز جلو پژو ۲۰۶/ }).first()).toBeVisible();
  });
});

test.describe('units and vehicles in the panel', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: 'hedax_fixture_role', value: 'staff', url: baseURL as string }]);
  });

  test('vehicles page on a phone: list, order buttons, models, merge or deactivate instead of deleting a vehicle in use', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/fa/admin/vehicles');
    const list = page.getByRole('list', { name: 'خودروها' });
    for (const name of ['سوزوکی', 'دنا پلاس', 'پیکان وانت', 'خودروهای برقی', 'سفیر']) await expect(list.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'پایین بردن سوزوکی' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'بالا بردن سوزوکی' })).toBeDisabled();
    await noHorizontalScroll(page);
    const peugeot = list.getByRole('listitem').filter({ hasText: 'پژو' }).first();
    await peugeot.getByRole('button', { name: 'مدل‌ها' }).click();
    const models = page.getByRole('dialog', { name: /مدل‌ها/ });
    for (const m of ['۲۰۶', '۴۰۵', 'پارس']) await expect(models.getByText(m, { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await peugeot.getByRole('button', { name: /عملیات برای پژو/ }).click();
    await page.getByRole('menuitem', { name: 'حذف' }).click();
    const del = page.getByRole('dialog', { name: /حذف پژو/ });
    await expect(del.getByText(/مستقیم حذف نمی‌شود/)).toBeVisible();
    await expect(del.getByRole('button', { name: 'ادغام با خودروی دیگر' })).toBeVisible();
    await expect(del.getByRole('button', { name: 'غیرفعال کردن' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: /دسته‌ها/ }).click();
    await expect(page.getByText('سواری', { exact: true })).toBeVisible();
    await axe(page);
  });

  test('units page and the product form: required unit, fitment picker with search and quick add', async ({ page }) => {
    await page.goto('/fa/admin/units');
    const table = page.getByRole('table', { name: 'واحدها' });
    for (const unit of ['عدد', 'دست']) await expect(table.getByRole('row').filter({ has: page.getByText(unit, { exact: true }) }).getByText('فقط عدد صحیح')).toBeVisible();
    const litre = table.getByRole('row').filter({ has: page.getByText('لیتر', { exact: true }) });
    await expect(litre.getByText('مجاز', { exact: true })).toBeVisible();
    await expect(litre.getByText('۰٫۵', { exact: true })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/fa/admin/products/${PAD_ID}`);
    await expect(page.locator('#pf-unit')).toHaveValue('unit-piece');
    const picked = page.getByRole('list', { name: 'خودروهای انتخاب‌شده' });
    await expect(picked.getByText('پژو ۲۰۶')).toBeVisible();
    await expect(picked.getByText('دنا (همهٔ مدل‌ها)')).toBeVisible();
    // The picker lives inside the product form: no nested form, and Enter in its fields never saves the product.
    await expect(page.locator('form form')).toHaveCount(0);
    await page.locator('#pf-vehicles-q').fill('نیسان');
    await page.locator('#pf-vehicles-q').press('Enter');
    await expect(page.getByText('ذخیره شد.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'افزودن «نیسان» به فهرست خودروها' })).toBeVisible();
    await page.locator('#pf-vehicles-q').fill('۴۰۵');
    await expect(page.getByLabel('۴۰۵')).toBeVisible();
    await noHorizontalScroll(page);
  });
});

test.describe('Excel import with «واحد» and «کاربرد در خودرو»', () => {
  test('the preview shows new vehicles to confirm, suspected duplicates and row-numbered unit errors before «تأیید»', async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: 'hedax_fixture_role', value: 'staff', url: baseURL as string }]);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/fa/admin/imports/00000000-0000-7000-8000-0000000e0001');
    const box = page.getByTestId('imp-vehicles');
    await expect(box.getByText('کوییک')).toBeVisible();
    await expect(box.getByText(/پژو ← پارس/)).toBeVisible();
    await expect(page.getByLabel('این خودروها و مدل‌ها به فهرست خودروها اضافه شوند')).toBeChecked();
    await expect(page.getByLabel(/«سوزکی» ← اتصال به «سوزوکی»/)).toBeChecked();
    // Row-numbered errors for the unit rules.
    await expect(page.getByText(/واحد این کالا اعشار نمی‌پذیرد/).first()).toBeVisible();
    await expect(page.getByText(/این واحد در پنل تعریف نشده است/).first()).toBeVisible();
    await noHorizontalScroll(page);
  });
});
