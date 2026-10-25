import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Home-page vehicle finder (fixtures preview): the published home of the fixture sets the film, the
 * finder and the shopping paths under it, then new products (cookie hedax_fixture_home=finder).
 */
test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: 'hedax_fixture_home', value: 'finder', url: baseURL! }]);
});

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'page must not scroll horizontally').toBeLessThanOrEqual(1);
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).include('#vehicle-finder').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
}

const finder = (page: Page) => page.locator('#vehicle-finder');
const step = (page: Page, n: number) => finder(page).locator('.vf-step').nth(n - 1);
async function choose(page: Page, n: number, option: string) {
  await step(page, n).locator('.vf-field').click();
  await step(page, n).getByRole('option', { name: option }).click();
  await expect(step(page, n).locator('.vf-value')).toHaveText(option);
}

test.describe('home layout', () => {
  test('the finder and then the shopping paths sit right under the film, full width', async ({ page }) => {
    await page.goto('/fa');
    const kinds = await page.locator('[data-builder-kind]').evaluateAll((els) => els.map((e) => e.getAttribute('data-builder-kind')));
    expect(kinds).toEqual(['cinematic-hero', 'vehicle-finder', 'shopping-paths', 'new-products']);
    // The three shopping paths render once, in their own section, not inside the film.
    await expect(page.locator('.cine-discover')).toHaveCount(1);
    await expect(page.locator('[data-builder-kind="shopping-paths"] .cine-discover')).toHaveCount(1);
    await expect(page.locator('[data-builder-kind="cinematic-hero"] .cine-discover')).toHaveCount(0);
    const band = await finder(page).boundingBox();
    const width = await page.evaluate(() => document.documentElement.clientWidth);
    expect(band && Math.abs(band.width - width)).toBeLessThanOrEqual(1);
    // No plate or VIN search in the finder.
    await expect(finder(page).getByText(/پلاک|VIN|شاسی/)).toHaveCount(0);
    await expect(finder(page).locator('.vf-submit')).toBeDisabled();
    await axe(page);
  });
});

test.describe('dependent steps', () => {
  test('each step loads after the previous one, changing a step clears the later ones, the URL carries the selection', async ({ page }) => {
    await page.goto('/fa');
    await expect(step(page, 2).locator('.vf-field')).toBeDisabled();
    await expect(step(page, 3).locator('.vf-field')).toBeDisabled();
    await expect(step(page, 4).locator('.vf-field')).toBeDisabled();
    await expect(step(page, 1)).toHaveAttribute('data-active', 'true');

    await choose(page, 1, 'ایران خودرو');
    await expect(step(page, 2)).toHaveAttribute('data-active', 'true');
    // Searchable: alias/make search narrows the list.
    await step(page, 2).locator('.vf-field').click();
    await step(page, 2).getByRole('combobox').fill('پژو');
    await expect(step(page, 2).getByRole('option')).toHaveCount(1);
    await step(page, 2).getByRole('option', { name: 'پژو ۲۰۶' }).click();
    await choose(page, 3, 'تیپ ۲');
    await choose(page, 4, '۱۳۹۰');
    await expect(finder(page).locator('.vf-submit')).toBeEnabled();

    // Changing the vehicle clears model and year.
    await choose(page, 2, 'دنا');
    await expect(step(page, 3).locator('.vf-value')).toHaveText('انتخاب مدل (اختیاری)');
    await expect(step(page, 4).locator('.vf-field')).toBeDisabled();
    // Changing the group clears everything after it.
    await choose(page, 1, 'سایپا');
    await expect(step(page, 2).locator('.vf-value')).toHaveText('انتخاب خودرو');
    await expect(step(page, 3).locator('.vf-field')).toBeDisabled();
    await expect(finder(page).locator('.vf-submit')).toBeDisabled();

    await choose(page, 1, 'ایران خودرو');
    await choose(page, 2, 'پژو ۲۰۶');
    await choose(page, 3, 'تیپ ۲');
    await choose(page, 4, '۱۳۹۰');
    await finder(page).locator('.vf-submit').click();
    await expect(page).toHaveURL(/\/fa\/parts\?group=iran-khodro&vehicle=peugeot-206&model=type-2&year=1390/);
    await expect(page.getByTestId('vehicle-selection')).toContainText('پژو ۲۰۶');
    await expect(page.getByTestId('vehicle-selection')).toContainText('شمسی');
  });

  test('a group without vehicles and a model without years say so instead of showing made-up options', async ({ page }) => {
    await page.goto('/fa');
    await choose(page, 1, 'تویوتا');
    await expect(step(page, 2).getByRole('status')).toHaveText('برای این گروه هنوز خودرویی ثبت نشده است.');
    await expect(step(page, 2).locator('.vf-field')).toBeDisabled();
    await choose(page, 1, 'ایران خودرو');
    await choose(page, 2, 'پژو ۲۰۶');
    await choose(page, 3, 'تیپ ۵');
    await expect(step(page, 4).getByRole('status')).toHaveText('سال تولید این مدل ثبت نشده؛ بدون سال جست‌وجو کنید.');
    await expect(step(page, 4).locator('.vf-field')).toBeDisabled();
    await choose(page, 2, 'سمند');
    await expect(step(page, 3).getByRole('status')).toContainText('مدل یا تیپی برای این خودرو ثبت نشده');
  });

  test('works with the keyboard alone', async ({ page }) => {
    await page.goto('/fa');
    await step(page, 1).locator('.vf-field').focus();
    await page.keyboard.press('ArrowDown');
    await expect(step(page, 1).getByRole('combobox')).toBeFocused();
    await page.keyboard.type('سایپا');
    await page.keyboard.press('Enter');
    await expect(step(page, 1).locator('.vf-value')).toHaveText('سایپا');
    await expect(step(page, 2).locator('.vf-field')).toBeEnabled();
    await step(page, 2).locator('.vf-field').focus();
    await page.keyboard.press('Enter');
    await expect(step(page, 2).getByRole('combobox')).toBeFocused();
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    await expect(step(page, 2).locator('.vf-value')).toHaveText('پراید');
    await expect(step(page, 3).locator('.vf-field')).toBeEnabled();
    await step(page, 3).locator('.vf-field').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(step(page, 3).locator('.vf-field')).toBeFocused();
    await expect(step(page, 3).getByRole('listbox')).toHaveCount(0);
  });
});

test.describe('results', () => {
  test('a vehicle without parts shows an empty state with a sourcing request, not the whole catalogue', async ({ page }) => {
    await page.goto('/fa/parts?group=saipa&vehicle=pride&model=saba&year=1380');
    await expect(page.getByTestId('vehicle-selection')).toContainText('پراید');
    await expect(page.getByText(/برای پراید صبا .* هنوز قطعه‌ای ثبت نشده است/)).toBeVisible();
    await expect(page.locator('main article')).toHaveCount(0);
    const request = page.getByRole('link', { name: 'درخواست تأمین برای این خودرو' });
    await expect(request).toHaveAttribute('href', /request-part\?.*vehicleBrand=saipa/);
    await expect(request).toHaveAttribute('href', /vehicleYear=1380/);
  });

  test('an invalid selection in the URL is rejected with a way back to the finder', async ({ page }) => {
    for (const qs of ['group=saipa&vehicle=samand', 'group=iran-khodro&vehicle=peugeot-206&model=turbo', 'group=iran-khodro&vehicle=peugeot-206&model=type-2&year=1410', 'group=nope&vehicle=samand']) {
      await page.goto(`/fa/parts?${qs}`);
      await expect(page.getByText('این انتخاب خودرو معتبر نیست'), qs).toBeVisible();
      await expect(page.getByRole('link', { name: 'انتخاب دوبارهٔ خودرو' })).toHaveAttribute('href', '/fa#vehicle-finder');
    }
  });

  test('a part whose link has no year is marked “year not confirmed”', async ({ page }) => {
    await page.goto('/fa/parts?group=iran-khodro&vehicle=peugeot-206&model=type-2&year=1390');
    await expect(page.getByTestId('card-year-unconfirmed').first()).toBeVisible();
  });
});

test.describe('English and phones', () => {
  test('English is left-to-right with English labels', async ({ page }) => {
    await page.goto('/en');
    await expect(page.locator('.builder-root')).toHaveAttribute('dir', 'ltr');
    await choose(page, 1, 'Iran Khodro');
    await choose(page, 2, 'Peugeot 206');
    await choose(page, 3, 'Type 2');
    await expect(step(page, 4).locator('.vf-field')).toBeEnabled();
    await expect(finder(page).locator('.vf-submit')).toHaveText(/./);
  });

  for (const width of [390, 360]) {
    test(`no horizontal scroll at ${width}px, steps stacked`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const locale of ['fa', 'en']) {
        await page.goto(`/${locale}`);
        await finder(page).scrollIntoViewIfNeeded();
        await noHorizontalScroll(page);
        const boxes = await finder(page).locator('.vf-step').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) })));
        expect(new Set(boxes.map((b) => b.y)).size, 'one step per row').toBe(4);
        await choose(page, 1, locale === 'fa' ? 'ایران خودرو' : 'Iran Khodro');
        await step(page, 2).locator('.vf-field').click();
        await noHorizontalScroll(page);
        await page.keyboard.press('Escape');
      }
    });
  }
});
