import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Home page (fixtures preview): the published home of the fixture sets the film, the part search /
 * vehicle finder under it, new products and the shopping paths last, before the footer
 * (cookie hedax_fixture_home=finder). Every finder step is optional; results are ranked and labelled.
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
const step = (page: Page, n: number) => finder(page).locator('.vf-step').nth(n - 1);
async function choose(page: Page, n: number, option: string) {
  await expect(step(page, n).locator('.vf-field')).toBeEnabled();
  await step(page, n).locator('.vf-field').click();
  await step(page, n).getByRole('option', { name: option }).first().click();
  await expect(step(page, n).locator('.vf-value')).toHaveText(option);
}

test.describe('home layout and header', () => {
  test('part search under the film, shopping paths and categories last before the footer', async ({ page }) => {
    await page.goto('/fa');
    const kinds = await page.locator('[data-builder-kind]').evaluateAll((els) => els.map((e) => e.getAttribute('data-builder-kind')));
    expect(kinds).toEqual(['cinematic-hero', 'vehicle-finder', 'new-products', 'shopping-paths']);
    // The three shopping paths render once, in their own last section (links kept), not inside the film.
    await expect(page.locator('.cine-discover')).toHaveCount(1);
    await expect(page.locator('[data-builder-kind="cinematic-hero"] .cine-discover')).toHaveCount(0);
    const paths = page.locator('[data-builder-kind="shopping-paths"]');
    await expect(paths.getByRole('link', { name: /خودروی من/ })).toHaveAttribute('href', '/fa/cars');
    await expect(paths.getByRole('link', { name: /کاتالوگ قطعات/ })).toHaveAttribute('href', '/fa/parts');
    await expect(paths.getByRole('link', { name: /درخواست تأمین/ })).toHaveAttribute('href', '/fa/request-part');
    const pathsBox = await paths.boundingBox();
    const footerBox = await page.locator('footer').boundingBox();
    expect(pathsBox && footerBox && pathsBox.y < footerBox.y).toBe(true);
    const band = await finder(page).boundingBox();
    const width = await page.evaluate(() => document.documentElement.clientWidth);
    expect(band && Math.abs(band.width - width)).toBeLessThanOrEqual(1);
    await expect(finder(page).getByText(/پلاک|VIN|شاسی/)).toHaveCount(0);
    await expect(finder(page).locator('.vf-submit')).toBeDisabled();
    await axe(page, '#vehicle-finder');
  });

  test('minimal header: centred logo, no search box, compact controls, compact state on scroll', async ({ page }) => {
    await page.goto('/fa');
    const header = page.locator('header.home-header');
    await expect(header).toBeVisible();
    await expect(header.locator('input')).toHaveCount(0);
    const logo = await header.locator('.hh-logo img').boundingBox();
    const width = await page.evaluate(() => document.documentElement.clientWidth);
    expect(logo && Math.abs(logo.x + logo.width / 2 - width / 2)).toBeLessThan(24);
    expect(logo!.height).toBeGreaterThanOrEqual(48);
    await expect(header.getByRole('link', { name: 'جست‌وجوی قطعه' })).toHaveAttribute('href', '/fa#part-search');
    await expect(header).toHaveAttribute('data-scrolled', 'false');
    await page.mouse.wheel(0, 900);
    await expect(header).toHaveAttribute('data-scrolled', 'true');
    // The search control takes the visitor to the part search under the film.
    await page.evaluate(() => scrollTo(0, 0));
    await header.getByRole('link', { name: 'جست‌وجوی قطعه' }).click();
    await expect(page.locator('#part-search')).toBeInViewport();
    // Menu: every page, plus language, currency and account.
    await header.getByRole('button', { name: 'باز کردن منو' }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('link', { name: 'درخواست تأمین قطعه' })).toBeVisible();
    await expect(drawer.getByRole('combobox')).toBeVisible();
    await axe(page, 'header');
  });

  test('other pages keep the classic header with its search box', async ({ page }) => {
    await page.goto('/fa/parts');
    await expect(page.locator('header.home-header')).toHaveCount(0);
    await expect(page.locator('#header-search')).toBeVisible();
  });
});

test.describe('optional steps', () => {
  test('lists load as needed, changing a step clears the later ones, the URL carries the selection', async ({ page }) => {
    await page.goto('/fa');
    // Every step is optional: the vehicle step works without a group; model and year need a vehicle.
    await expect(step(page, 2).locator('.vf-field')).toBeEnabled();
    await expect(step(page, 3).locator('.vf-field')).toBeDisabled();
    await expect(step(page, 4).locator('.vf-field')).toBeDisabled();
    await expect(step(page, 1)).toHaveAttribute('data-active', 'true');

    await choose(page, 1, 'ایران خودرو');
    await expect(finder(page).locator('.vf-submit')).toBeEnabled();
    await step(page, 2).locator('.vf-field').click();
    await step(page, 2).getByRole('combobox').fill('پژو');
    await expect(step(page, 2).getByRole('option')).toHaveCount(1);
    await step(page, 2).getByRole('option', { name: 'پژو ۲۰۶' }).click();
    await choose(page, 3, 'تیپ ۲');
    await choose(page, 4, '۱۳۹۰');

    // Changing the vehicle clears model and year; the vehicle can be cleared again.
    await choose(page, 2, 'دنا');
    await expect(step(page, 3).locator('.vf-value')).toHaveText('همهٔ مدل‌ها');
    await step(page, 2).locator('.vf-field').click();
    await step(page, 2).getByRole('option', { name: '— بدون انتخاب —' }).click();
    await expect(step(page, 2).locator('.vf-value')).toHaveText('انتخاب خودرو');
    await expect(step(page, 3).locator('.vf-field')).toBeDisabled();
    // Changing the group clears everything after it.
    await choose(page, 1, 'سایپا');
    await expect(step(page, 2).locator('.vf-value')).toHaveText('انتخاب خودرو');
    await expect(step(page, 3).locator('.vf-field')).toBeDisabled();

    await choose(page, 1, 'ایران خودرو');
    await choose(page, 2, 'پژو ۲۰۶');
    await choose(page, 3, 'تیپ ۲');
    await choose(page, 4, '۱۳۹۰');
    await finder(page).locator('.vf-submit').click();
    await expect(page).toHaveURL(/\/fa\/parts\?group=iran-khodro&vehicle=peugeot-206&model=type-2&year=1390/);
    await expect(page.getByTestId('vehicle-selection')).toContainText('پژو ۲۰۶');
    await expect(page.getByTestId('vehicle-selection')).toContainText('شمسی');
  });

  test('a vehicle chosen first fills in its group; a year without a model uses the vehicle’s model years', async ({ page }) => {
    await page.goto('/fa');
    await step(page, 2).locator('.vf-field').click();
    await step(page, 2).getByRole('combobox').fill('دنا');
    await step(page, 2).getByRole('option', { name: /^دنا/ }).first().click();
    await expect(step(page, 1).locator('.vf-value')).toHaveText('ایران خودرو');
    await choose(page, 4, '۱۴۰۰');
    await finder(page).locator('.vf-submit').click();
    await expect(page).toHaveURL(/group=iran-khodro&vehicle=dena&year=1400/);
  });

  test('only a typed part name or number searches the catalogue', async ({ page }) => {
    await page.goto('/fa');
    await page.locator('#part-search').fill('لنت');
    await finder(page).locator('.vf-submit').click();
    await expect(page).toHaveURL(/\/fa\/parts\?q=/);
    await expect(page.getByTestId('search-term')).toContainText('لنت');
  });

  test('empty groups and models without verified years say so instead of showing made-up options', async ({ page }) => {
    await page.goto('/fa');
    await choose(page, 1, 'تویوتا');
    await expect(step(page, 2).getByRole('status')).toHaveText('برای این گروه هنوز خودرویی ثبت نشده است.');
    await expect(step(page, 2).locator('.vf-field')).toBeDisabled();
    await choose(page, 1, 'ایران خودرو');
    await choose(page, 2, 'پژو ۲۰۶');
    await choose(page, 3, 'تیپ ۵');
    await expect(step(page, 4).getByRole('status')).toHaveText('سال ساخت معتبری برای این انتخاب ثبت نشده؛ بدون سال جست‌وجو کنید.');
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
    await expect(page.getByTestId('vehicle-selection')).toContainText('ایران خودرو');
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
      await expect(page.getByRole('link', { name: 'انتخاب دوبارهٔ خودرو' })).toHaveAttribute('href', '/fa#vehicle-finder');
    }
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
    await expect(finder(page).locator('.vf-submit')).toHaveText('Search parts');
  });

  for (const width of [390, 360]) {
    test(`no horizontal scroll at ${width}px, steps stacked, header fits`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const locale of ['fa', 'en']) {
        await page.goto(`/${locale}`);
        await noHorizontalScroll(page);
        // Header controls never overlap the centred logo.
        const logo = (await page.locator('.hh-logo').boundingBox())!;
        for (const control of await page.locator('.hh-start > *, .hh-end > *:visible').all()) {
          const box = await control.boundingBox();
          if (!box || !box.width) continue;
          expect(box.x + box.width <= logo.x + 1 || box.x >= logo.x + logo.width - 1, 'control beside the logo').toBe(true);
        }
        await finder(page).scrollIntoViewIfNeeded();
        const boxes = await finder(page).locator('.vf-step').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().y)));
        expect(new Set(boxes).size, 'one step per row').toBe(4);
        await choose(page, 1, locale === 'fa' ? 'ایران خودرو' : 'Iran Khodro');
        await step(page, 2).locator('.vf-field').click();
        await noHorizontalScroll(page);
        await page.keyboard.press('Escape');
      }
    });
  }
});
