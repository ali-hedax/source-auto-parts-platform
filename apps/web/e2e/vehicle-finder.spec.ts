import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Vehicle choice (owner layout 2026-11): three optional steps on the home page (brand, vehicle,
 * model & year) and the same steps as a catalogue filter. Results are ranked and labelled.
 * The home layout itself is covered in source-ui.spec.ts.
 */
test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: 'hedax_fixture_home', value: 'finder', url: baseURL! }]);
});

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'page must not scroll horizontally').toBeLessThanOrEqual(1);
}

async function axe(page: Page, include: string) {
  const results = await new AxeBuilder({ page }).include(include).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
}

const finder = (page: Page) => page.locator('#vehicle-finder');
const submit = (page: Page) => finder(page).locator('button[type=submit]');
const step = (page: Page, n: number) => finder(page).locator('.vf-step').nth(n - 1);
async function choose(page: Page, n: number, option: string) {
  await expect(step(page, n).locator('.vf-field')).toBeEnabled();
  await step(page, n).locator('.vf-field').click();
  await step(page, n).getByRole('option', { name: option }).first().click();
  await expect(step(page, n).locator('.vf-value')).toHaveText(option);
}

test.describe('optional steps', () => {
  test('lists load as needed, changing a step clears the later ones, the URL carries the selection', async ({ page }) => {
    await page.goto('/fa');
    // Every step is optional: the vehicle step works without a group; model and year need a vehicle.
    await expect(step(page, 2).locator('.vf-field')).toBeEnabled();
    await expect(step(page, 3).locator('.vf-field')).toBeDisabled();
    await expect(finder(page).locator('.vf-step')).toHaveCount(3);
    await expect(submit(page)).toBeDisabled();
    await expect(step(page, 1)).toHaveAttribute('data-active', 'true');
    await axe(page, '#vehicle-finder');

    await choose(page, 1, 'ایران خودرو');
    await expect(submit(page)).toBeEnabled();
    await step(page, 2).locator('.vf-field').click();
    await step(page, 2).getByRole('combobox').fill('پژو');
    await expect(step(page, 2).getByRole('option')).toHaveCount(1);
    await step(page, 2).getByRole('option', { name: 'پژو ۲۰۶' }).click();
    await choose(page, 3, 'تیپ ۲');

    // Changing the vehicle clears the model; the vehicle can be cleared again.
    await choose(page, 2, 'دنا');
    await expect(step(page, 3).locator('.vf-value')).toHaveText('همهٔ مدل‌ها');
    await step(page, 2).locator('.vf-field').click();
    await step(page, 2).getByRole('option', { name: '— همه —' }).click();
    await expect(step(page, 2).locator('.vf-value')).toHaveText('انتخاب خودرو');
    await expect(step(page, 3).locator('.vf-field')).toBeDisabled();
    // Changing the group clears everything after it.
    await choose(page, 1, 'سایپا');
    await expect(step(page, 2).locator('.vf-value')).toHaveText('انتخاب خودرو');
    await expect(step(page, 3).locator('.vf-field')).toBeDisabled();

    await choose(page, 1, 'ایران خودرو');
    await choose(page, 2, 'پژو ۲۰۶');
    await choose(page, 3, 'تیپ ۲');
    await submit(page).click();
    await expect(page).toHaveURL(/\/fa\/parts\?group=iran-khodro&vehicle=peugeot-206&model=type-2$/);
    // The choice shows as removable chips above the results and fills the filter steps.
    await expect(page.getByTestId('active-filters')).toContainText('پژو ۲۰۶');
    await expect(page.getByTestId('active-filters')).toContainText('تیپ ۲');
    await expect(page.locator('#filter-vehicle .vf-value').nth(1)).toHaveText('پژو ۲۰۶');
  });

  test('a vehicle chosen first fills in its brand', async ({ page }) => {
    await page.goto('/fa');
    await step(page, 2).locator('.vf-field').click();
    await step(page, 2).getByRole('combobox').fill('دنا');
    await step(page, 2).getByRole('option', { name: /^دنا/ }).first().click();
    await expect(step(page, 1).locator('.vf-value')).toHaveText('ایران خودرو');
    await submit(page).click();
    await expect(page).toHaveURL(/group=iran-khodro&vehicle=dena$/);
  });

  test('a typed part name or number searches the catalogue', async ({ page }) => {
    await page.goto('/fa');
    await page.locator('#quick-search-input').fill('لنت');
    await page.locator('.su-hero button[type=submit]').click();
    await expect(page).toHaveURL(/\/fa\/parts\?q=/);
    await expect(page.getByTestId('search-term')).toContainText('لنت');
  });

  test('empty brands and vehicles without models say so instead of showing made-up options', async ({ page }) => {
    await page.goto('/fa');
    await choose(page, 1, 'تویوتا');
    await expect(step(page, 2).getByRole('status')).toHaveText('برای این برند خودرویی ثبت نشده.');
    await expect(step(page, 2).locator('.vf-field')).toBeDisabled();
    await choose(page, 1, 'ایران خودرو');
    await choose(page, 2, 'پژو ۲۰۶');
    // Model years are shown beside each model instead of a separate year step.
    await step(page, 3).locator('.vf-field').click();
    await expect(step(page, 3).getByRole('option', { name: /تیپ ۲/ })).toContainText('۱۳۸۱–۱۴۰۲ شمسی');
    await page.keyboard.press('Escape');
    await choose(page, 2, 'سمند');
    await expect(step(page, 3).getByRole('status')).toContainText('مدلی ثبت نشده');
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
    await expect(step(page, 2).getByRole('option').first()).toBeVisible();
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

test.describe('ranked results', () => {
  test('a group alone gives verified results under their heading, labelled on each card', async ({ page }) => {
    await page.goto('/fa/parts?group=iran-khodro');
    await expect(page.getByTestId('active-filters')).toContainText('ایران خودرو');
    await expect(page.getByTestId('tier-verified')).toContainText('سازگاری تأییدشده');
    await expect(page.getByTestId('card-finder-match').first()).toHaveText('ثبت‌شده برای خودرویی از این گروه');
  });

  test('with a year the links carry no years: listed as “year not confirmed”, never as a confirmed fit', async ({ page }) => {
    await page.goto('/fa/parts?group=iran-khodro&vehicle=peugeot-206&model=type-2&year=1390');
    await expect(page.getByTestId('tier-verified')).toHaveCount(0);
    await expect(page.getByTestId('tier-relevant')).toBeVisible();
    await expect(page.getByTestId('card-finder-match').first()).toHaveText('برای این خودرو ثبت شده؛ سال ساخت شما تأیید نشده');
    await expect(page.getByText('برای این انتخاب، قطعه‌ای با سازگاری تأییدشده ثبت نشده است')).toBeVisible();
  });

  test('only a name match: shown as a suggestion with a sourcing request, not as a fit', async ({ page }) => {
    await page.goto('/fa/parts?group=saipa&vehicle=pride&model=saba&year=1380');
    await expect(page.getByTestId('tier-related')).toBeVisible();
    await expect(page.getByTestId('card-finder-match').first()).toContainText('پیشنهاد');
    const request = page.getByRole('link', { name: 'درخواست تأمین برای این خودرو' });
    await expect(request).toHaveAttribute('href', /request-part\?.*vehicleBrand=saipa/);
    await expect(request).toHaveAttribute('href', /vehicleYear=1380/);
  });

  test('nothing related: an empty state with a sourcing request, not the whole catalogue', async ({ page }) => {
    await page.goto('/fa/parts?group=toyota');
    await expect(page.locator('main article')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'درخواست تأمین برای این خودرو' })).toHaveAttribute('href', /vehicleBrand=toyota/);
  });

  test('an invalid selection in the URL is rejected with a way back to the finder', async ({ page }) => {
    for (const qs of ['group=saipa&vehicle=samand', 'group=iran-khodro&vehicle=peugeot-206&model=turbo', 'group=iran-khodro&vehicle=peugeot-206&model=type-2&year=1410', 'group=nope&vehicle=samand']) {
      await page.goto(`/fa/parts?${qs}`);
      await expect(page.getByText('این انتخاب خودرو معتبر نیست'), qs).toBeVisible();
      // The way back clears the selection; the filter steps are beside the results.
      await expect(page.getByRole('link', { name: 'انتخاب دوبارهٔ خودرو' })).toHaveAttribute('href', '/fa/parts');
      await expect(page.locator('#filter-vehicle .vf-field')).toHaveCount(3);
    }
  });
});

test.describe('English and phones', () => {
  test('English is left-to-right with English labels', async ({ page }) => {
    await page.goto('/en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(finder(page).locator('.vf-label')).toHaveText(['Brand', 'Vehicle', 'Model & year']);
    await choose(page, 1, 'Iran Khodro');
    await choose(page, 2, 'Peugeot 206');
    await choose(page, 3, 'Type 2');
    await expect(submit(page)).toHaveText('Show parts');
  });

  for (const width of [390, 360]) {
    test(`no horizontal scroll at ${width}px, steps stacked`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const locale of ['fa', 'en']) {
        await page.goto(`/${locale}`);
        await noHorizontalScroll(page);
        await finder(page).scrollIntoViewIfNeeded();
        const boxes = await finder(page).locator('.vf-step').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().y)));
        expect(new Set(boxes).size, 'one step per row').toBe(3);
        await choose(page, 1, locale === 'fa' ? 'ایران خودرو' : 'Iran Khodro');
        await step(page, 2).locator('.vf-field').click();
        await noHorizontalScroll(page);
        await page.keyboard.press('Escape');
      }
    });
  }
});
