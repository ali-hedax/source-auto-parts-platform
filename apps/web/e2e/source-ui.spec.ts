import { expect, test, type Page } from '@playwright/test';

/**
 * The storefront layout of 2026-11 (owner's brief): sticky header with search, the new home sections,
 * part card, catalogue filters, product page, request form, vehicles page, footer and small pages.
 * Runs on the labelled sample data of the development preview.
 */

/** Visible text drawn smaller than 14px (the brief allows none). */
const smallText = (page: Page) => page.evaluate(() => [...document.querySelectorAll('header *, main *, footer *')]
  .filter((el) => el instanceof HTMLElement && el.offsetParent && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()) && parseFloat(getComputedStyle(el).fontSize) < 14)
  .map((el) => `${el.tagName}.${(el as HTMLElement).className}:${getComputedStyle(el).fontSize}`));

test.describe('home page', () => {
  test('one hero title, large search, three vehicle steps and every section of the brief', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/fa');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText('دنیای قطعات خودرو، هوشمندتر از همیشه');
    expect(await page.locator('h1').evaluate((el) => getComputedStyle(el).fontWeight)).toBe('700');
    // The hero artwork is requested at 1920px or wider on desktop.
    const hero = page.locator('.su-hero-media img');
    await expect.poll(() => hero.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const width = await hero.evaluate((img: HTMLImageElement) => Number(new URL(img.currentSrc).searchParams.get('w')));
    expect(width).toBeGreaterThanOrEqual(1920);
    await expect(page.locator('.su-hero #quick-search-input')).toHaveAttribute('placeholder', 'نام قطعه، شماره فنی یا کد کالا');
    await expect(page.locator('#vehicle-finder .vf-field')).toHaveCount(3);
    await expect(page.locator('#vehicle-finder .vf-label')).toHaveText(['برند', 'خودرو', 'مدل و سال']);
    await expect(page.locator('#vehicle-finder button[type=submit]')).toHaveText('نمایش قطعات');

    // Every category with its count, linked to the category filter (not a text search).
    const categories = await (await page.request.get('/api/v1/catalog/categories')).json() as Array<{ slug: string; parentSlug: string | null }>;
    const links = page.locator('.su-category');
    await expect(links).toHaveCount(categories.filter((c) => !c.parentSlug).length);
    for (const href of await links.evaluateAll((els) => els.map((el) => el.getAttribute('href')))) expect(href).toMatch(/\/fa\/parts\?category=/);
    await expect(links.first().locator('.su-category-count')).toHaveText(/قطعه|بدون قطعه/);

    // Every brand, under «برندها».
    const brands = await (await page.request.get('/api/v1/catalog/vehicle-brands')).json() as unknown[];
    await expect(page.locator('#brands-title')).toHaveText('برندها');
    await expect(page.locator('.su-brand')).toHaveCount(brands.length);

    await expect(page.locator('#new-title')).toHaveText('تازه‌های سورس');
    await expect(page.locator('.su-sourcing')).toContainText('بدون ثبت‌نام، بدون هزینه');
    expect(await page.locator('.su-sourcing .su-btn').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(29, 79, 191)');
    await expect(page.locator('.su-hub-card')).toHaveCount(3);
    await expect(page.locator('.su-hub-card').filter({ hasText: 'به‌زودی' })).toHaveCount(2);
    await expect(page.locator('.su-faq-list summary').filter({ hasText: 'ارسال چقدر طول می‌کشد؟' })).toHaveCount(1);
    await expect(page.locator('.su-faq-list summary').filter({ hasText: 'شرایط مرجوعی چیست؟' })).toHaveCount(1);
    // No decorative English subtitles.
    for (const text of ['Explore the essentials', 'New to the collection', 'The automotive journal', 'SOURCE · PARTS']) await expect(page.getByText(text, { exact: true })).toHaveCount(0);
    expect(await smallText(page)).toEqual([]);
  });

  test('contained at phone, tablet and desktop widths in both languages', async ({ page }) => {
    for (const locale of ['fa', 'en']) for (const width of [360, 768, 1366, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${locale}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${locale} ${width}`).toBeLessThanOrEqual(width);
    }
  });

  test('the search works without JavaScript', async ({ browser, baseURL }) => {
    const noJs = await browser.newContext({ javaScriptEnabled: false, baseURL });
    try {
      const page = await noJs.newPage();
      await page.goto('/fa');
      await page.locator('#quick-search-input').fill('فیلتر');
      await page.locator('.su-hero button[type=submit]').click();
      await expect(page).toHaveURL(/\/fa\/parts\?q=/);
    } finally { await noJs.close(); }
  });
});

test.describe('header and footer', () => {
  test('sticky header with search, sourcing button and staff sign-in kept', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/fa/parts');
    const header = page.locator('header.su-header');
    expect(await header.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
    await expect(header.locator('#header-search-input')).toHaveAttribute('placeholder', 'نام قطعه، شماره فنی یا کد کالا');
    await expect(header.getByRole('link', { name: 'درخواست تأمین قطعه' })).toHaveAttribute('href', '/fa/request-part');
    await page.mouse.wheel(0, 1500);
    await expect.poll(() => header.evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(0);
    await header.locator('.atelier-account summary').click();
    await expect(header.getByRole('link', { name: 'ورود کارکنان' })).toHaveAttribute('href', '/fa/staff/login');
  });

  test('footer columns and working phone and WhatsApp links', async ({ page }) => {
    await page.goto('/fa');
    const footer = page.locator('footer.su-footer');
    for (const label of ['قطعات موجود', 'قطعات وارداتی', 'خودروها', 'برندها', 'درخواست تأمین قطعه']) await expect(footer.locator('nav[aria-labelledby=footer-quick]').getByRole('link', { name: label, exact: true })).toHaveCount(1);
    for (const label of ['درباره ما', 'تماس با ما', 'راهنمای خرید', 'ارسال', 'مرجوعی و لغو', 'شرایط فروش', 'حریم خصوصی']) await expect(footer.locator('nav[aria-labelledby=footer-guide]').getByRole('link', { name: label, exact: true })).toHaveCount(1);
    for (const href of await footer.locator('a[href^="tel:"]').evaluateAll((els) => els.map((el) => el.getAttribute('href')))) expect(href).toMatch(/^tel:\+\d{10,15}(,\d+)?$/);
    for (const href of await footer.locator('a[href*="wa.me"]').evaluateAll((els) => els.map((el) => el.getAttribute('href')))) expect(href).toMatch(/^https:\/\/wa\.me\/\d{10,15}$/);
    await expect(footer).toContainText('هکسی: ۲۴ ساعته');
    await expect(footer).not.toContainText('پشتیبانی ۲۴ ساعته، ۷ روز هفته');
  });
});

test.describe('prices', () => {
  test('Toman by default, rial and dirham still selectable', async ({ page, context }) => {
    await page.goto('/fa/parts');
    await expect(page.locator('.su-card-price').first()).toContainText('تومان');
    await expect(page.locator('.su-unit select option')).toHaveText(['تومان', 'ریال', 'درهم']);
    await context.addCookies([{ name: 'hedax_currency', value: 'IRR', url: page.url() }]);
    await page.reload();
    await expect(page.locator('.su-card-price').first()).toContainText('ریال');
  });
});

test.describe('part card and catalogue', () => {
  test('card order and its two actions', async ({ page }) => {
    await page.goto('/fa/parts');
    const buyable = page.locator('.su-card').filter({ has: page.locator('.su-stock[data-status=IN_STOCK]') }).first();
    await expect(buyable.locator('.su-card-meta .su-card-sku')).toBeVisible();
    const buy = buyable.getByRole('button', { name: /افزودن به سبد/ });
    expect(await buy.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(29, 79, 191)');
    const inquiry = page.locator('.su-card').filter({ has: page.locator('[data-testid=card-sourceable]') }).first();
    await expect(inquiry.locator('[data-testid=card-sourceable]')).toHaveText('قیمت پس از استعلام');
    await expect(inquiry.getByRole('link', { name: 'درخواست تأمین' })).toHaveClass(/su-btn-outline/);
  });

  test('filters: three vehicle steps, category checkboxes with counts, chips and removable active filters', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/fa/parts');
    await expect(page.locator('.su-filters .vf-field')).toHaveCount(3);
    await expect(page.locator('.su-filters select#filter-vehicle')).toHaveCount(0);
    const columns = await page.locator('.su-card-grid-4').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(4);
    const first = page.locator('.su-checklist label').first();
    await expect(first.locator('.su-checklist-count')).toHaveText(/[۰-۹]+/);
    await first.locator('input').click();
    await expect(page).toHaveURL(/category=/);
    await page.locator('.su-checklist label').nth(1).locator('input').click();
    await expect(page).toHaveURL(/category=[^&]+%2C|category=[^&]+,/);
    await page.getByRole('button', { name: 'OEM' }).click();
    await expect(page.getByRole('button', { name: 'OEM' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-testid=active-filters] .su-chip-remove')).toHaveCount(3);
    await expect(page.getByText('نامشخص', { exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'حذف همه' }).click();
    await expect(page).toHaveURL(/\/fa\/parts$/);
    await expect(page.locator('[data-testid=active-filters]')).toHaveCount(0);
  });

  test('in-stock only is a separate switch', async ({ page }) => {
    await page.goto('/fa/parts');
    await page.locator('.su-filter-stock input').click();
    await expect(page).toHaveURL(/inStock=1/);
    await expect(page.locator('.su-filter-stock input')).toBeChecked();
  });
});

test.describe('product page', () => {
  test('breadcrumb, two columns, info order, three assurances and no empty fitment columns', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/fa/parts/demo-front-brake-pad-206');
    await expect(page.getByRole('navigation', { name: 'مسیر صفحه' })).toContainText('قطعات موجود');
    const order = await page.locator('.su-product-info > *').evaluateAll((els) => els.map((el) => el.className.split(' ')[0]));
    expect(order.slice(0, 6)).toEqual(['su-card-meta', 'su-product-title', 'su-chips', 'su-fits', 'su-product-price', 'su-product-buy']);
    await expect(page.locator('.su-assurances li')).toHaveText([/ارسال با تیپاکس/, /۷ روز مهلت انصراف/, /بدون ضمانت/]);
    await expect(page.getByText('اطلاعات ضمانت ثبت نشده است')).toHaveCount(0);
    await expect(page.locator('table')).not.toContainText('—');
    expect(await smallText(page)).toEqual([]);
  });
});

test.describe('request a part', () => {
  test('no sign-in needed: required fields, reply note and success', async ({ page }) => {
    await page.goto('/fa/request-part');
    await expect(page.getByText('برای ثبت نهایی وارد حساب شوید')).toHaveCount(0);
    await expect(page.getByText('پاسخ از طریق بله و پیامک به همین شماره فرستاده می‌شود.')).toBeVisible();
    await expect(page.locator('.su-steps-list li')).toHaveCount(4);
    await page.getByRole('button', { name: 'ثبت درخواست' }).click();
    await expect(page.locator('#req-part')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#req-vehicle')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#req-mobile')).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#req-part').fill('چراغ جلو');
    await page.locator('#req-vehicle').fill('پژو ۲۰۰۸');
    await page.locator('#req-mobile').fill('۰۹۱۲۱۲۳۴۵۶۷');
    await page.getByRole('button', { name: 'ثبت درخواست' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'HX-R-PREVIEW' })).toBeVisible();
  });

  test('a vehicle without parts opens the form with that vehicle', async ({ page }) => {
    await page.goto('/fa/cars');
    const noParts = page.locator('.su-car:not([data-has-parts])').first();
    const name = (await noParts.locator('.su-car-name').textContent())!;
    await noParts.click();
    await expect(page).toHaveURL(/\/fa\/request-part\?vehicle=/);
    await expect(page.locator('#req-vehicle')).toHaveValue(name);
  });
});

test.describe('vehicles page', () => {
  test('search, brand groups, vehicles with parts first', async ({ page }) => {
    await page.goto('/fa/cars');
    const groups = page.locator('.su-cars-group');
    expect(await groups.count()).toBeGreaterThan(0);
    for (const group of await groups.all()) {
      const flags = await group.locator('.su-car').evaluateAll((els) => els.map((el) => el.hasAttribute('data-has-parts')));
      expect(flags).toEqual([...flags].sort((a, b) => Number(b) - Number(a)));
    }
    await page.locator('#cars-search').fill('سمند');
    await expect(page.locator('.su-car')).toHaveCount(1);
    await expect(page.locator('.su-car .su-car-count')).toHaveText(/قطعه/);
  });
});

test.describe('small pages', () => {
  test('404 keeps its status, offers search and three ways on', async ({ page }) => {
    const res = await page.goto('/fa/no-such-page');
    expect(res?.status()).toBe(404);
    await expect(page.locator('#notfound-search-input')).toBeVisible();
    await expect(page.locator('.su-notfound .su-actions a')).toHaveText([/خانه/, /قطعات موجود/, /درخواست تأمین قطعه/]);
  });

  test('sign-in explains the code channels and links the terms', async ({ page }) => {
    await page.goto('/fa/login');
    await expect(page.getByText('کد تأیید از طریق بله و پیامک فرستاده می‌شود.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'شرایط فروش' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'حریم خصوصی' }).first()).toBeVisible();
    await expect(page).toHaveTitle(/ورود یا ثبت‌نام/);
  });

  test('buying guide has its own title and text', async ({ page }) => {
    await page.goto('/fa/help/buying');
    await expect(page.locator('h1')).toHaveText('راهنمای خرید');
    await expect(page.locator('h1')).not.toHaveText(/قوانین و شرایط فروش/);
    // Text saved in the panel replaces the built-in six steps; either way the page is the guide, not the terms.
    await expect(page.locator('main')).toContainText('خرید قطعه از سورس در شش قدم');
    await expect(page.locator('main')).not.toContainText('قوانین و شرایط فروش');
  });

  test('English pages are noindex and not in the sitemap', async ({ page, request }) => {
    await page.goto('/en/parts');
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).not.toContain('/en/');
    await expect(page.getByText('English name not provided')).toHaveCount(0);
  });

  test('home carries Organization and WebSite data and a share image', async ({ page }) => {
    await page.goto('/fa');
    const data = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(data.join(' ')).toContain('"Organization"');
    expect(data.join(' ')).toContain('"WebSite"');
    await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute('content', /\S/);
  });
});
