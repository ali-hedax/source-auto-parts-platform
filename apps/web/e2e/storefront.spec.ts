import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'page must not scroll horizontally').toBeLessThanOrEqual(1);
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
}

test.describe('language and direction (A05)', () => {
  test('Persian is RTL, English is LTR, both translated', async ({ page }) => {
    await page.goto('/fa');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fa');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('قطعهٔ مورد نیازت را پیدا کن');
    await page.goto('/en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Find the part you need');
  });

  test('addresses without a language prefix redirect to Persian (default)', async ({ page }) => {
    await page.goto('/parts?q=%D9%81%DB%8C%D9%84%D8%AA%D8%B1');
    await expect(page).toHaveURL(/\/fa\/parts\?q=/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.goto('/request-part');
    await expect(page).toHaveURL(/\/fa\/request-part$/);
  });

  test('switching language keeps the same page and query', async ({ page }) => {
    await page.goto('/fa/parts?q=%D9%84%D9%86%D8%AA');
    await page.getByRole('button', { name: /English/ }).click();
    await expect(page).toHaveURL(/\/en\/parts\?q=/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });

  test('currency and language are independent (FA+AED, EN+IRR)', async ({ page, context }) => {
    await context.addCookies([{ name: 'hedax_currency', value: 'AED', url: 'http://localhost:3100' }]);
    await page.goto('/fa/parts/demo-air-filter-corolla');
    await expect(page.getByRole('main').getByText(/۶۵٫۰۰ درهم/).first()).toBeVisible();
    await expect(page.getByRole('main').getByText(/۱۰٬۴۰۰٬۰۰۰ ریال/).first()).toBeVisible();
    await context.addCookies([{ name: 'hedax_currency', value: 'IRR', url: 'http://localhost:3100' }]);
    await page.goto('/en/parts/demo-air-filter-corolla');
    await expect(page.getByRole('main').getByText('IRR 10,400,000').first()).toBeVisible();
    await expect(page.getByText('تومان')).toHaveCount(0);
  });
});

test.describe('Persian search normalisation (A04)', () => {
  for (const [label, query, expected] of [
    ['Persian ی matches Arabic ي in data', 'فیلتر روغن', 'فيلتر روغن سمند'],
    ['Arabic ك in query matches', 'كمك فنر', 'كمك فنر عقب'],
    ['ZWNJ-joined query matches spaced name', 'لنت‌ترمز', 'لنت ترمز جلو'],
    ['Persian digits match', 'پژو ۲۰۶', 'پژو ۲۰۶'],
  ] as const) {
    test(label, async ({ page }) => {
      await page.goto(`/fa/parts?q=${encodeURIComponent(query)}`);
      await expect(page.getByRole('heading', { level: 3, name: new RegExp(expected) })).toBeVisible();
    });
  }

  test('no result offers a prefilled sourcing request', async ({ page }) => {
    await page.goto(`/fa/parts?q=${encodeURIComponent('گیربکس اتوماتیک ولوو')}`);
    const cta = page.getByRole('link', { name: 'ثبت درخواست تأمین همین قطعه' });
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page.locator('#req-title')).toHaveValue('گیربکس اتوماتیک ولوو');
  });
});

test.describe('stock purchase path (A02)', () => {
  test('out-of-stock part has no buy button and offers sourcing', async ({ page }) => {
    await page.goto('/fa/parts/demo-water-pump-405');
    await expect(page.getByRole('button', { name: 'افزودن به سبد' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'درخواست تأمین مشابه' })).toBeVisible();
  });

  test('in-stock part can be added to the cart', async ({ page }) => {
    await page.goto('/fa/parts/demo-front-brake-pad-206');
    await page.getByRole('button', { name: 'افزودن به سبد' }).click();
    await expect(page.getByText('به سبد اضافه شد')).toBeVisible();
    await page.goto('/fa/cart');
    await expect(page.getByText('افزودن به سبد، کالا را برای شما رزرو نمی‌کند')).toBeVisible();
  });
});

test.describe('sourcing request form (A03, §15)', () => {
  test('any brand can be typed and invalid submit focuses the error summary', async ({ page, context }) => {
    await context.addCookies([{ name: 'hedax_fixture_role', value: 'customer', url: 'http://localhost:3100' }]);
    await page.goto('/fa/request-part');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: 'ثبت درخواست' }).click();
    const summary = page.getByRole('alert').filter({ hasText: 'لطفاً موارد زیر را اصلاح کنید' });
    await expect(summary).toBeFocused();
    await page.locator('#req-title').fill('قطعات بدنه چری تیگو ۷');
    await page.locator('#item-0-name').fill('سپر جلو');
    await page.locator('#item-0-brand').selectOption('__other');
    await page.locator('#item-0-brandtext').fill('Chery');
    await page.getByRole('button', { name: 'ثبت درخواست' }).click();
    await expect(page.getByText(/درخواست HX-R-PREVIEW ثبت شد/)).toBeVisible();
  });
});

test.describe('layout, SEO and accessibility', () => {
  for (const width of [360, 390, 768, 1024, 1440]) {
    test(`no horizontal page scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/fa', '/fa/parts', '/fa/parts/demo-front-brake-pad-206', '/fa/request-part', '/en/parts']) {
        await page.goto(path);
        await noHorizontalScroll(page);
      }
    });
  }

  // §15: "wide tables scroll inside their container" — in the staff panel too (preview data, signed in as owner).
  for (const width of [360, 390]) {
    test(`staff panel: no horizontal page scroll at ${width}px`, async ({ page, baseURL }) => {
      await page.context().addCookies([{ name: 'hedax_fixture_role', value: 'staff', url: baseURL as string }]);
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/fa/admin', '/fa/admin/products', '/fa/admin/orders', '/fa/admin/sourcing', '/fa/admin/payments', '/en/admin/inventory']) {
        await page.goto(path);
        await expect(page.locator('main#main')).toBeVisible();
        await noHorizontalScroll(page);
      }
    });
  }

  // A30 / §15: the browser's text size at 200% (rem-based layout, so the root font size is what changes).
  test('text enlarged to 200%: no horizontal page scroll and the main control of each page stays reachable', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const pages: Array<[string, RegExp]> = [
      ['/fa', /جست‌وجوی قطعات موجود/],
      ['/fa/parts/demo-front-brake-pad-206', /افزودن به سبد/],
      ['/fa/request-part', /ثبت درخواست/],
      ['/en/parts/demo-front-brake-pad-206', /Add to cart/i],
    ];
    for (const [path, control] of pages) {
      await page.goto(path);
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      await noHorizontalScroll(page);
      const button = page.getByRole('button', { name: control }).first();
      await button.scrollIntoViewIfNeeded();
      await expect(button, `${path}: main control`).toBeInViewport();
    }
  });

  for (const path of ['/fa', '/en', '/fa/parts', '/fa/parts/demo-front-brake-pad-206', '/fa/request-part', '/fa/cart', '/en/login']) {
    test(`axe: no serious/critical violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await axe(page);
    });
  }

  test('private pages are noindex and preview is never indexed', async ({ page }) => {
    await page.goto('/fa/account');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('skip link moves focus to main content', async ({ page }) => {
    await page.goto('/fa');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'پرش به محتوای اصلی' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport(); // visible while focused
    await page.keyboard.press('Enter');
    await expect(page.locator('main#main')).toBeFocused();
  });

  test('unknown addresses and missing parts get a localized 404 with a working skip link', async ({ page }) => {
    const fa = await page.goto('/fa/this-address-does-not-exist');
    expect(fa?.status()).toBe(404);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('صفحهٔ مورد نظر پیدا نشد.');
    await expect(page.getByRole('link', { name: 'درخواست تأمین قطعه' }).first()).toBeVisible();
    // `next dev` completes the 404 on the client and puts its dev-tools portal first in the tab
    // order (absent from production builds), so focus the skip link directly and check its target.
    await expect(page.getByRole('banner')).toBeVisible();
    await page.locator('a.skip-link').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#main')).toBeFocused();
    await axe(page);

    const missingPart = await page.goto('/fa/parts/no-such-part-slug');
    expect(missingPart?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('صفحهٔ مورد نظر پیدا نشد.');

    const en = await page.goto('/en/no-such-page');
    expect(en?.status()).toBe(404);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found.');
    await noHorizontalScroll(page);
  });
});

test.describe('admin preview', () => {
  test('dashboard shows an honest launch-readiness list', async ({ page, context }) => {
    await context.addCookies([{ name: 'hedax_fixture_role', value: 'staff', url: 'http://localhost:3100' }]);
    await page.goto('/fa/admin');
    await expect(page.getByRole('heading', { name: 'وضعیت آمادگی راه‌اندازی' })).toBeVisible();
    await expect(page.getByText('آزمایشی').first()).toBeVisible();
    await expect(page.getByText('تنظیم نشده').first()).toBeVisible();
  });
});
