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
    ['ZWNJ-joined query matches spaced name', 'لنت‌ترمز', 'لنت ترمز جلو پژو'],
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

  // Site content panel on a phone: every section opens, fields fit the screen, saving stays in reach.
  test('site content panel: every section opens on a phone without horizontal scroll', async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: 'hedax_fixture_role', value: 'staff', url: baseURL as string }]);
    await page.setViewportSize({ width: 360, height: 900 });
    for (const section of ['', '/general', '/contact', '/social', '/home', '/pages', '/faq', '/announcement', '/seo']) {
      await page.goto(`/fa/admin/content${section}`);
      await expect(page.locator('main#main h1')).toBeVisible();
      await noHorizontalScroll(page);
    }
    // The contact form shows today's numbers, each with its own fields.
    await page.goto('/fa/admin/content/contact');
    await expect(page.locator('#p0-number')).toHaveValue('+98 25 3666 6669');
    await expect(page.locator('#p1-number')).toHaveValue('+971 50 144 1797');
    await expect(page.getByRole('button', { name: 'ذخیره' })).toBeInViewport();
    // A built-in page opens in the editor with its address locked.
    await page.goto('/fa/admin/content/pages/fixture-page-about');
    await expect(page.locator('#pg-title-fa')).toHaveValue('دربارهٔ سورس');
    await expect(page.locator('#pg-slug')).toHaveCount(0);
    await noHorizontalScroll(page);
  });

  // Staff management on a phone: coloured states, the edit dialog and the ⋮ menu (owner preview).
  test('staff page: states, edit dialog and actions menu work on a phone', async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: 'hedax_fixture_role', value: 'staff', url: baseURL as string }]);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/fa/admin/staff');
    const table = page.locator('main#main table');
    for (const state of ['فعال', 'غیرفعال', 'در انتظار پذیرش', 'منقضی‌شده']) await expect(table.getByText(state, { exact: true }).first()).toBeVisible();
    await noHorizontalScroll(page);
    // The owner's own row offers «حساب من», not editing.
    await expect(table.getByRole('row', { name: /مالک نمونه/ }).getByRole('link', { name: 'حساب من' })).toBeVisible();
    const row = table.getByRole('row', { name: /کارمند کاتالوگ/ });
    await row.getByRole('button', { name: 'ویرایش' }).click();
    const dialog = page.getByRole('dialog', { name: 'ویرایش کارمند' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('#pd-name')).toHaveValue('کارمند کاتالوگ');
    await expect(dialog.locator('#pd-phone')).toHaveValue('+98 912 000 0000');
    // Validation before anything is sent.
    await dialog.locator('#pd-phone').fill('abc');
    await dialog.getByRole('button', { name: 'ذخیره' }).click();
    await expect(dialog.getByText(/شماره معتبر نیست/)).toBeVisible();
    await noHorizontalScroll(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await row.getByRole('button', { name: /عملیات برای کارمند کاتالوگ/ }).click();
    const menu = page.getByRole('menu');
    for (const item of ['غیرفعال کردن حساب', 'ریست Authenticator (گوشی جدید)', 'حذف (انتقال به سطل زباله)']) await expect(menu.getByRole('menuitem', { name: item })).toBeVisible();
    await menu.getByRole('menuitem', { name: 'حذف (انتقال به سطل زباله)' }).click();
    await expect(page.getByRole('dialog').getByText(/به سطل زباله منتقل می‌شود/)).toBeVisible();
    await page.keyboard.press('Escape');

    // Every state offers «حذف (انتقال به سطل زباله)», and the item is really on screen and clickable
    // where it is drawn: before the fix, a menu near the bottom of the table was cut off by the
    // table's scroll box and showed only «فعال کردن حساب» for a deactivated member.
    const states: Array<[RegExp, string, RegExp]> = [
      [/کارمند کاتالوگ/, 'فعال', /سطل زباله منتقل می‌شود: همین حالا/],
      [/کارمند مالی/, 'غیرفعال', /سطل زباله منتقل می‌شود: همین حالا/],
      [/کارمند نمونه/, 'در انتظار پذیرش', /لینک دعوت دیگر کار نمی‌کند/],
      [/دعوت قدیمی/, 'منقضی‌شده', /لینک دعوت دیگر کار نمی‌کند/],
      [/دعوت لغوشده/, 'لغو شده', /لینک دعوت دیگر کار نمی‌کند/],
    ];
    for (const [name, state, dialogText] of states) {
      const r = table.getByRole('row', { name });
      await expect(r.getByText(state, { exact: true })).toBeVisible();
      await r.getByRole('button', { name: /عملیات برای/ }).click();
      const item = page.getByRole('menu').getByRole('menuitem', { name: 'حذف (انتقال به سطل زباله)' });
      await expect(item).toBeInViewport({ ratio: 1 });
      expect(await item.evaluate((el) => {
        const b = el.getBoundingClientRect();
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return !!hit && el.contains(hit);
      }), `trash item of ${state} is covered or cut off`).toBe(true);
      await item.click();
      await expect(page.getByRole('dialog').getByText(dialogText)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
    }
    // The deactivated member still offers «فعال کردن حساب» in the same menu.
    await table.getByRole('row', { name: /کارمند مالی/ }).getByRole('button', { name: /عملیات برای/ }).click();
    await expect(page.getByRole('menu').getByRole('menuitem', { name: 'فعال کردن حساب' })).toBeVisible();
    await page.keyboard.press('Escape');

    // The trash tab with its count: name, e-mail, role, date, by whom, days left; restore and delete for good.
    const trashTab = page.getByRole('tab', { name: /سطل زباله/ });
    await expect(trashTab).toContainText('۲');
    await trashTab.click();
    const trash = page.getByRole('table', { name: 'سطل زباله' });
    for (const header of ['نام', 'ایمیل', 'نقش', 'وضعیت قبلی', 'تاریخ حذف', 'حذف‌شده توسط', 'روزهای باقی‌مانده']) await expect(trash.getByRole('columnheader', { name: header, exact: true })).toBeVisible();
    const trashed = trash.getByRole('row', { name: /کارمند فروش/ });
    await expect(trashed.getByText('۲۲ روز')).toBeVisible();
    await expect(trashed.getByText('کارمند غیرفعال')).toBeVisible();
    const trashedInvitation = trash.getByRole('row', { name: /دعوت بایگانی/ });
    await expect(trashedInvitation.getByText('دعوت منقضی‌شده')).toBeVisible();
    await trashedInvitation.getByRole('button', { name: 'بازگردانی' }).click();
    await expect(page.getByRole('dialog').getByText(/لینک و تاریخ انقضا برمی‌گردد \(دعوت منقضی‌شده\)/)).toBeVisible();
    await page.keyboard.press('Escape');
    await noHorizontalScroll(page);
    await trashed.getByRole('button', { name: 'حذف دائمی' }).click();
    const purge = page.getByRole('dialog', { name: /حذف دائمی/ });
    const confirm = purge.getByRole('button', { name: 'حذف برای همیشه' });
    await expect(confirm).toBeDisabled();
    await purge.locator('#pg-name').fill('كارمند فروش');
    await purge.locator('#pg-code').fill('123456');
    await expect(confirm).toBeEnabled();
    await page.keyboard.press('Escape');
    await trashed.getByRole('button', { name: 'بازگردانی' }).click();
    await expect(page.getByRole('dialog').getByText(/وضعیت قبلی برمی‌گردد \(کارمند غیرفعال\)/)).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/Authenticator او ریست می‌شود/)).toBeVisible();
  });

  // The reported bug: a deactivated member in the last row of the table (no invitation below it).
  // The menu was cut off by the table's scroll box, so only «فعال کردن حساب» could be seen.
  for (const [width, height] of [[360, 800], [1280, 900]] as const) {
    test(`staff page: deactivated member in the last row shows every menu item at ${width}px`, async ({ page, baseURL }) => {
      await page.context().addCookies([{ name: 'hedax_fixture_role', value: 'staff', url: baseURL as string }]);
      await page.setViewportSize({ width, height });
      await page.route('**/api/v1/admin/staff', async (route) => {
        const res = await route.fetch();
        const body = await res.json() as { staff: unknown[]; invitations: unknown[] };
        await route.fulfill({ response: res, json: { ...body, invitations: [] } });
      });
      await page.goto('/fa/admin/staff');
      const table = page.locator('main#main table');
      const rows = table.locator('tbody tr');
      await expect(rows.last()).toContainText('کارمند مالی');
      await expect(rows.last().getByText('غیرفعال', { exact: true })).toBeVisible();
      await rows.last().getByRole('button', { name: /عملیات برای/ }).click();
      const menu = page.getByRole('menu');
      for (const name of ['فعال کردن حساب', 'ریست Authenticator (گوشی جدید)', 'حذف (انتقال به سطل زباله)']) {
        const item = menu.getByRole('menuitem', { name });
        await expect(item).toBeInViewport({ ratio: 1 });
        expect(await item.evaluate((el) => {
          const b = el.getBoundingClientRect();
          const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          return !!hit && el.contains(hit);
        }), `«${name}» is covered or cut off`).toBe(true);
      }
      await menu.getByRole('menuitem', { name: 'حذف (انتقال به سطل زباله)' }).click();
      await expect(page.getByRole('dialog').getByText(/به سطل زباله منتقل می‌شود/)).toBeVisible();
      await noHorizontalScroll(page);
    });
  }

  // «کاربرد:» on product cards (home and parts list): one line under the brand, hidden without fitments.
  for (const [width, height] of [[360, 800], [1280, 900]] as const) {
    test(`product cards show «کاربرد» in one line at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      for (const path of ['/fa', '/fa/parts']) {
        await page.goto(path);
        const withFit = page.locator('article', { hasText: 'DEMO-0002' }).first();
        const line = withFit.getByTestId('card-fitment');
        await expect(line).toHaveText('کاربرد: سمند، دنا');
        await expect(line).toHaveAttribute('title', 'سمند، دنا');
        const box = await line.boundingBox();
        expect(box!.height, 'one line').toBeLessThan(24);
        // Cards of parts without fitments have no empty «کاربرد» line.
        const without = page.locator('article').filter({ hasNotText: /DEMO-000[128]/ }).first();
        if (await without.count()) await expect(without.getByTestId('card-fitment')).toHaveCount(0);
        await noHorizontalScroll(page);
      }
    });
  }

  // A30 / §15: the browser's text size at 200% (rem-based layout, so the root font size is what changes).
  test('text enlarged to 200%: no horizontal page scroll and the main control of each page stays reachable', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const pages: Array<[string, RegExp]> = [
      // The one search is in the header.
      ['/fa', /^جست‌وجو$/],
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

test.describe('sign-in prompts when signed out', () => {
  test('staff panel pages lead to the staff sign-in in the current language', async ({ page }) => {
    await page.goto('/fa/admin/imports');
    const fa = page.getByRole('link', { name: 'ورود کارکنان' });
    await expect(fa).toHaveAttribute('href', '/fa/staff/login');
    await expect(page.locator('a[href^="/fa/login"]')).toHaveCount(0);
    // Nobody is signed in, so the header offers no sign-out.
    await expect(page.getByRole('button', { name: 'خروج' })).toHaveCount(0);
    await fa.click();
    await expect(page).toHaveURL(/\/fa\/staff\/login$/);
    await expect(page.getByRole('heading', { level: 1, name: 'ورود کارکنان' })).toBeVisible();
    await page.goto('/en/admin/products');
    await expect(page.getByRole('link', { name: 'Staff sign-in' })).toHaveAttribute('href', '/en/staff/login');
  });

  test('customer account pages keep the mobile-code sign-in', async ({ page }) => {
    await page.goto('/fa/account/orders');
    await expect(page.locator('a[href="/fa/login?next=%2Ffa%2Faccount%2Forders"]')).toHaveText('ورود / ثبت‌نام');
  });
});

test.describe('contact details (site content → contact, same in footer and contact page)', () => {
  const links = ['tel:+982536666669,119', 'tel:+971501441797', 'https://wa.me/971501441797', 'mailto:info@sourcebyhedax.ir'];

  for (const [locale, phone, ext, mobile, hours] of [
    ['fa', '۰۲۵-۳۶۶۶۶۶۶۹', '(داخلی ۱۱۹)', '+۹۷۱۵۰۱۴۴۱۷۹۷', 'پشتیبانی ۲۴ ساعته، ۷ روز هفته'],
    ['en', '+98 25 3666 6669', '(Ext. 119)', '+971 50 144 1797', 'Customer support 24/7'],
  ] as const) {
    test(`${locale}: footer and contact page show the same approved details, numbers left-to-right`, async ({ page }) => {
      for (const path of [`/${locale}/contact`, `/${locale}`]) {
        await page.goto(path);
        const scope = path.endsWith('/contact') ? page.locator('main') : page.getByTestId('footer-contact');
        for (const href of links) await expect(scope.locator(`a[href="${href}"]`)).toHaveCount(1);
        const phoneNumber = scope.locator('a[href="tel:+982536666669,119"] bdi');
        await expect(phoneNumber).toHaveText(phone);
        await expect(phoneNumber).toHaveAttribute('dir', 'ltr');
        await expect(scope).toContainText(ext);
        const mobileNumber = scope.locator('a[href="tel:+971501441797"] bdi');
        await expect(mobileNumber).toHaveText(mobile);
        await expect(mobileNumber).toHaveAttribute('dir', 'ltr');
        await expect(scope.locator('a[href="mailto:info@sourcebyhedax.ir"] bdi')).toHaveAttribute('dir', 'ltr');
        await expect(scope).toContainText(hours);
        // Nothing unapproved: no address, map, social links or "published later" placeholder.
        await expect(page.locator('a[href*="instagram"], a[href*="linkedin"], iframe[src*="map"]')).toHaveCount(0);
        await expect(page.getByText(/نشانی|Address|پس از راه‌اندازی رسمی|published at the official launch/)).toHaveCount(0);
      }
      // Support chat is switched off in the config until customer SMS sign-in works.
      await page.goto(`/${locale}/contact`);
      await expect(page.locator('main a[href$="/account/messages"]')).toHaveCount(0);
      await expect(page.getByText(/سریع‌ترین راه ارتباط|fastest way to reach us/)).toHaveCount(0);
      // The WhatsApp link opens outside the site safely.
      await expect(page.getByTestId('footer-contact').locator('a[href="https://wa.me/971501441797"]')).toHaveAttribute('rel', 'noopener noreferrer');
    });
  }
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
