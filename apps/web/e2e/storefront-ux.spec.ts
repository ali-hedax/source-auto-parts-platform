import { DEFAULT_ASSISTANT_SETTINGS } from '@hedax/contracts/constants';
import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import { cartBadgeText, cartUnitCount } from '../src/lib/cart-units';
import { ignoresHistory, localeOf, moveTo, newTrail, parentOf, pushEntry, replaceEntry, resolveLoad, stepsBack, translatedTarget } from '../src/lib/nav-trail';

/** Every width the storefront is reviewed at; Persian first. */
const WIDTHS = [360, 390, 768, 1440];

const cartLink = (page: Page) => page.locator('header a[href$="/cart"]');
const badge = (page: Page) => page.locator('[data-cart-badge]');
const hideDevOverlay = (page: Page) => page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });

async function addFromDetail(page: Page, slug: string, quantity: number) {
  await page.goto(`/fa/parts/${slug}`);
  await expect(page.getByRole('button', { name: 'افزودن به سبد' })).toBeVisible();
  // Hydration has finished once the shared count has answered.
  await expect(cartLink(page)).toHaveAccessibleName(/سبد خرید/);
  await page.locator('#qty').fill(String(quantity));
  await page.locator('#qty').blur();
  await page.getByRole('button', { name: 'افزودن به سبد' }).click();
  await expect(page.getByText(/به سبد اضافه شد/)).toBeVisible();
}

test.describe('cart unit total (rules)', () => {
  test('sums units, not lines, without floating-point drift', () => {
    expect(cartUnitCount([])).toBe(0);
    expect(cartUnitCount([{ quantity: 1 }])).toBe(1);
    expect(cartUnitCount([{ quantity: 2 }, { quantity: 3 }])).toBe(5);
    expect(cartUnitCount([{ quantity: 0.1 }, { quantity: 0.2 }])).toBe(0.3);
  });
  test('the badge text uses the page language and stops at 99+', () => {
    expect(cartBadgeText(5, 'fa')).toBe('۵');
    expect(cartBadgeText(5, 'en')).toBe('5');
    expect(cartBadgeText(99, 'fa')).toBe('۹۹');
    expect(cartBadgeText(100, 'fa')).toBe('۹۹+');
    expect(cartBadgeText(2.5, 'fa')).toBe('۲٫۵');
  });
});

test.describe('back trail (rules)', () => {
  const a = '/fa/parts?sort=name'; const b = '/fa/parts/x'; const login = '/fa/login?next=%2Ffa%2Fcheckout'; const checkout = '/fa/checkout'; const cart = '/fa/cart';
  test('one step back to the previous site page; none at the start of a trail', () => {
    const t = pushEntry(newTrail('g', a), b);
    expect(stepsBack(t, b)).toBe(1);
    expect(stepsBack(newTrail('g', a), a)).toBeNull();
    expect(stepsBack(null, a)).toBeNull();
  });
  test('the sign-in page is passed over after signing in', () => {
    const t = pushEntry(pushEntry(pushEntry(newTrail('g', cart), checkout), login), checkout);
    expect(stepsBack(t, checkout)).toBe(3);
  });
  test('a sign-in page alone leaves nothing to go back to', () => {
    expect(stepsBack(pushEntry(newTrail('g', login), checkout), checkout)).toBeNull();
  });
  test('a replaced entry and a page ahead of the position are not treated as history', () => {
    const t = replaceEntry(pushEntry(newTrail('g', a), b), '/en/parts/x');
    expect(t.entries).toEqual([a, '/en/parts/x']);
    const back = moveTo(t, { generation: 'g', index: 0 }, a)!;
    expect(stepsBack(back, a)).toBeNull();
    expect(pushEntry(back, cart).entries).toEqual([a, cart]);
  });
  test('a load keeps its entry when reloaded, follows a same-site link, and otherwise starts afresh', () => {
    const t = pushEntry(newTrail('g', a), b);
    expect(resolveLoad(t, { generation: 'g', index: 1 }, b, null, 'new').index).toBe(1);
    expect(resolveLoad(t, null, cart, b, 'new').entries).toEqual([a, b, cart]);
    // Another tab or a typed address: no referrer, or one that is not where the trail stands.
    expect(resolveLoad(t, null, cart, null, 'new')).toEqual(newTrail('new', cart));
    expect(resolveLoad(t, null, cart, a, 'new')).toEqual(newTrail('new', cart));
    // An old entry of an earlier visit in this tab.
    expect(resolveLoad(t, { generation: 'old', index: 0 }, a, null, 'new')).toEqual(newTrail('new', a));
  });
  test('a language switch moves the tab to the new language; history keeps its place, not its language', () => {
    const list = '/fa/parts?sort=name&page=2'; const detail = '/fa/parts/x';
    const switched = replaceEntry(pushEntry(newTrail('g', list), detail), '/en/parts/x');
    expect(switched.locale).toBe('en');
    expect(stepsBack(switched, '/en/parts/x')).toBe(1);
    const landed = moveTo(switched, { generation: 'g', index: 0 }, list)!;
    expect(landed.locale, 'going back does not change the language of the tab').toBe('en');
    expect(translatedTarget(landed, list)).toBe('/en/parts?sort=name&page=2');
    expect(translatedTarget(replaceEntry(landed, '/en/parts?sort=name&page=2'), '/en/parts?sort=name&page=2')).toBeNull();
    expect(translatedTarget(newTrail('g', '/en'), '/fa')).toBe('/en');
    expect(localeOf('/fa')).toBe('fa');
    expect(localeOf('/fabric')).toBeNull();
    // The page and its own translation are not two steps.
    expect(stepsBack({ generation: 'g', index: 1, entries: ['/fa/parts', '/en/parts'], locale: 'en' }, '/en/parts')).toBeNull();
  });
  test('parents always move towards home, so following them ends there', () => {
    expect(parentOf('/parts/x')).toBe('/parts');
    expect(parentOf('/checkout')).toBe('/cart');
    expect(parentOf('/cart')).toBe('/parts');
    expect(parentOf('/account/orders/1')).toBe('/account/orders');
    expect(parentOf('/account/orders')).toBe('/account');
    expect(parentOf('/account')).toBe('/');
    for (const start of ['/checkout', '/parts/x', '/account/orders/1', '/payment/result', '/brands/y', '/help/z', '/login', '/contact']) {
      let path = start; let hops = 0;
      while (path !== '/' && hops < 10) { path = parentOf(path); hops++; }
      expect(path, start).toBe('/');
    }
    expect(ignoresHistory('/payment/result')).toBe(true);
    expect(ignoresHistory('/checkout')).toBe(false);
  });
});

test.describe('one-row header', () => {
  for (const width of WIDTHS) {
    test(`${width}px: low, edge to edge, nothing overlaps or scrolls sideways`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/fa/parts');
      const g = await page.evaluate(() => {
        const box = (el: Element) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
        const header = document.querySelector('header')!;
        const logo = box(header.querySelector('.titanium-logo')!);
        const controls = box(header.querySelector('.titanium-header-controls')!);
        const nav = header.querySelector('.titanium-desktop-nav')!;
        const links = [...nav.querySelectorAll('a')].map((a) => box(a));
        return { header: box(header), logo, controls, navShown: getComputedStyle(nav).display !== 'none', navBox: box(nav), links, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, border: getComputedStyle(header).borderBottomWidth, menu: [...header.querySelectorAll('button')].some((b) => b.getAttribute('aria-label') === 'باز کردن منو' && getComputedStyle(b).display !== 'none') };
      });
      expect(g.header.height).toBeLessThanOrEqual(width >= 1100 ? 80 : 72);
      expect(g.header.left).toBe(0);
      expect(g.header.width).toBe(width);
      expect(g.border).toBe('1px');
      expect(g.overflow).toBeLessThanOrEqual(0);
      // RTL: logo on the right, controls on the left, no overlap and everything inside the page.
      expect(g.controls.right).toBeLessThanOrEqual(g.logo.left);
      expect(g.controls.left).toBeGreaterThanOrEqual(0);
      expect(g.logo.right).toBeLessThanOrEqual(width);
      if (width >= 1100) {
        expect(g.navShown).toBe(true);
        expect(g.menu).toBe(false);
        // A single row: every link on the same line, between the logo and the controls.
        expect(new Set(g.links.map((l) => Math.round(l.top))).size).toBe(1);
        expect(Math.min(...g.links.map((l) => l.left))).toBeGreaterThanOrEqual(g.controls.right);
        expect(Math.max(...g.links.map((l) => l.right))).toBeLessThanOrEqual(g.logo.left);
      } else {
        expect(g.navShown).toBe(false);
        expect(g.menu).toBe(true);
        await page.getByRole('button', { name: 'باز کردن منو' }).click();
        await expect(page.getByRole('dialog').getByRole('link', { name: 'برندها' })).toBeVisible();
        // The language and currency that have no room in the row stay reachable.
        await expect(page.getByRole('dialog').getByRole('combobox')).toBeVisible();
      }
    });
  }

  test('the first screen does not jump: the banner is the height the low header leaves it, before scripts run too', async ({ browser, baseURL }) => {
    const height = async (javaScriptEnabled: boolean) => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled, baseURL: baseURL as string });
      const page = await context.newPage();
      await page.goto('/fa');
      if (javaScriptEnabled) await expect.poll(() => page.locator('.atelier-banner').evaluate((el: HTMLElement) => el.style.getPropertyValue('--banner-top'))).not.toBe('');
      const box = await page.locator('.atelier-banner').boundingBox();
      await context.close();
      return box!.height;
    };
    // Only the preview's own notice bar, absent from production, may separate the two.
    expect(Math.abs(await height(false) - await height(true))).toBeLessThanOrEqual(60);
  });

  test('reaches both edges in English too, mirrored', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/en/parts');
    const g = await page.evaluate(() => {
      const logo = document.querySelector('.titanium-logo')!.getBoundingClientRect();
      const controls = document.querySelector('.titanium-header-controls')!.getBoundingClientRect();
      return { logoRight: logo.right, controlsLeft: controls.left, height: document.querySelector('header')!.getBoundingClientRect().height };
    });
    expect(g.height).toBeLessThanOrEqual(80);
    expect(g.logoRight).toBeLessThanOrEqual(g.controlsLeft);
  });
});

test.describe('search and home cards say only what is true', () => {
  for (const width of WIDTHS) {
    test(`${width}px: short finder labels, no development notes, nothing cut`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/fa');
      const finder = page.locator('#vehicle-finder');
      await expect(finder.locator('.vf-label')).toHaveText(['برند / گروه', 'خودرو', 'مدل / تیپ', 'سال ساخت']);
      await expect(finder).not.toContainText('اختیاری');
      // The dependency between the fields is still explained.
      await expect(finder.locator('.vf-hint')).toHaveText('برای جست‌وجو، برند یا خودرو را انتخاب کنید.');
      await expect(finder.locator('.vf-field').nth(2)).toContainText('ابتدا خودرو');
      await expect(finder.locator('.vf-field').nth(2)).toBeDisabled();
      for (const clipped of await finder.locator('.vf-label, .vf-value').all()) {
        expect(await clipped.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), await clipped.innerText()).toBe(true);
      }
      const placeholder = page.locator('#quick-search-input');
      await expect(placeholder).toHaveAttribute('placeholder', 'نام یا شماره فنی قطعه');
      const hub = page.locator('.titanium-hub');
      for (const title of ['قیمت روز خودرو', 'مجله و راهنمای فنی', 'ویدیوهای پربازدید خودرو']) await expect(hub.getByRole('heading', { name: title })).toBeVisible();
      for (const note of ['مرحله بعد', 'در انتظار', 'نمایشی', 'آپارات', 'محتوای ثابت']) await expect(hub).not.toContainText(note);
      // No fake price rows, no play button on a picture, and an honest status where there is no source.
      await expect(hub.locator('dl, button[disabled], .titanium-hub-play')).toHaveCount(0);
      await expect(hub.getByText('به‌زودی', { exact: true })).toHaveCount(2);
      await expect(hub.locator('details summary')).toHaveText('خواندن راهنمای کوتاه');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  }

  test('the quick search and the finder still search', async ({ page }) => {
    await page.goto('/fa');
    await page.locator('#quick-search-input').fill('لنت');
    await page.locator('.titanium-quick-search-submit').click();
    await expect(page).toHaveURL(/\/fa\/parts\?q=/);
    await page.goto('/fa');
    const finder = page.locator('#vehicle-finder');
    await expect(finder.locator('.vf-submit')).toBeDisabled();
    await finder.locator('.vf-field').first().click();
    await finder.getByRole('option').first().click();
    await expect(finder.locator('.vf-submit')).toBeEnabled();
    await expect(finder.locator('.vf-hint')).toHaveCount(0);
    await finder.locator('.vf-submit').click();
    await expect(page).toHaveURL(/\/fa\/parts\?.*group=/);
  });
});

test.describe('cart count on the icon', () => {
  for (const width of WIDTHS) {
    test(`${width}px: the total of units, readable, on the icon, in step with every change`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/fa/parts');
      await expect(cartLink(page)).toHaveAccessibleName('سبد خرید خالی است');
      await expect(badge(page)).toHaveCount(0);

      await addFromDetail(page, 'demo-spark-plug-elantra', 1);
      await expect(badge(page)).toHaveText('۱');
      await expect(cartLink(page)).toHaveAccessibleName('۱ کالا در سبد خرید');
      const look = await badge(page).evaluate((el) => {
        const cs = getComputedStyle(el); const b = el.getBoundingClientRect(); const icon = el.parentElement!.querySelector('svg')!.getBoundingClientRect();
        return { color: cs.color, background: cs.backgroundColor, size: parseFloat(cs.fontSize), width: b.width, height: b.height, overIcon: b.left < icon.right && b.right > icon.left && b.top < icon.bottom && b.bottom > icon.top, top: b.top - el.parentElement!.getBoundingClientRect().top };
      });
      expect(look.color).not.toBe(look.background);
      expect(look.color).toBe('rgb(251, 248, 243)');
      expect(look.background).toBe('rgb(42, 28, 22)');
      expect(look.size).toBeGreaterThanOrEqual(12);
      expect(look.height).toBeGreaterThanOrEqual(20);
      expect(look.overIcon).toBe(true);
      expect(look.top).toBeGreaterThanOrEqual(-1);

      // 2 of one part and 3 of another show 5, not 2.
      await addFromDetail(page, 'demo-spark-plug-elantra', 1);
      await expect(badge(page)).toHaveText('۲');
      await addFromDetail(page, 'demo-air-filter-corolla', 3);
      await expect(badge(page)).toHaveText('۵');
      await expect(cartLink(page)).toHaveAccessibleName('۵ کالا در سبد خرید');

      // It stays right across pages and a full reload.
      await page.getByRole('link', { name: 'سبد خرید' }).first().click();
      await expect(page).toHaveURL(/\/fa\/cart/);
      await expect(badge(page)).toHaveText('۵');
      await page.reload();
      await expect(badge(page)).toHaveText('۵');

      // Increase, decrease and remove show at once, and tell a screen reader.
      const status = page.locator('header [role=status]');
      await page.getByRole('button', { name: /افزایش تعداد فیلتر هوای کرولا/ }).click();
      await expect(badge(page)).toHaveText('۶');
      await expect(status).toHaveText('تعداد کالاهای سبد خرید: ۶');
      await page.getByRole('button', { name: /کاهش تعداد فیلتر هوای کرولا/ }).click();
      await expect(badge(page)).toHaveText('۵');
      await page.getByRole('button', { name: /حذف فیلتر هوای کرولا.* از سبد/ }).click();
      await expect(badge(page)).toHaveText('۲');
      await page.getByRole('button', { name: /حذف شمع موتور النترا.* از سبد/ }).click();
      await expect(badge(page)).toHaveCount(0);
      await expect(status).toHaveText('سبد خرید خالی شد');
      await expect(cartLink(page)).toHaveAccessibleName('سبد خرید خالی است');
      await page.reload();
      await expect(badge(page)).toHaveCount(0);
    });
  }

  test('phone emulation: the number is on screen and readable after adding, removing, reloading and moving between pages', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, baseURL: baseURL as string });
    const page = await context.newPage();
    const onScreen = async (text: string) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(badge(page)).toHaveText(text);
      await expect(badge(page)).toBeInViewport({ ratio: 1 });
      const covered = await badge(page).evaluate((el) => { const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !el.contains(top) && top !== el; });
      expect(covered, 'nothing lies on top of the number').toBe(false);
    };
    await addFromDetail(page, 'demo-spark-plug-elantra', 2);
    await addFromDetail(page, 'demo-air-filter-corolla', 3);
    await onScreen('۵');
    await page.getByRole('button', { name: 'باز کردن منو' }).click();
    await page.getByRole('dialog').getByRole('link', { name: 'خانه' }).click();
    await expect(page).toHaveURL(/\/fa$/);
    await onScreen('۵');
    await page.reload();
    await onScreen('۵');
    await cartLink(page).click();
    await expect(page).toHaveURL(/\/fa\/cart$/);
    await onScreen('۵');
    await page.getByRole('button', { name: /حذف فیلتر هوای کرولا.* از سبد/ }).click();
    await onScreen('۲');
    await page.getByRole('button', { name: /کاهش تعداد شمع موتور النترا/ }).click();
    await onScreen('۱');
    await page.reload();
    await onScreen('۱');
    await context.close();
  });

  test('adding from the home page, the list and a part\'s page all count in one total', async ({ page }) => {
    await page.goto('/fa');
    await expect(cartLink(page)).toHaveAccessibleName('سبد خرید خالی است');
    await page.locator('.part-card-cart').first().click();
    await expect(badge(page)).toHaveText('۱');
    await page.goto('/fa/parts');
    await expect(badge(page)).toHaveText('۱');
    await page.locator('.part-card-cart').nth(1).click();
    await expect(badge(page)).toHaveText('۲');
    await addFromDetail(page, 'demo-spark-plug-elantra', 3);
    await expect(badge(page)).toHaveText('۵');
    await page.goBack();
    await expect(badge(page)).toHaveText('۵');
  });

  test('while the cart is loading or unavailable it never claims to be empty', async ({ page }) => {
    let release = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/api/v1/cart', async (route) => { await held; await route.continue(); });
    await page.goto('/fa/contact');
    await expect(cartLink(page)).toHaveAccessibleName('سبد خرید');
    await expect(badge(page)).toHaveCount(0);
    release();
    await expect(cartLink(page)).toHaveAccessibleName('سبد خرید خالی است');

    await page.unroute('**/api/v1/cart');
    await page.route('**/api/v1/cart', (route) => route.abort());
    await page.reload();
    await expect(cartLink(page)).toHaveAccessibleName('سبد خرید');
    await expect(badge(page)).toHaveCount(0);
  });

  test('a large total stays inside its badge', async ({ page }) => {
    await page.route('**/api/v1/cart', (route) => route.fulfill({ json: { id: 'c', lines: [{ id: 'l', quantity: 120 }], itemsTotalPayableIrr: null, canCheckout: false } }));
    await page.setViewportSize({ width: 360, height: 700 });
    await page.goto('/fa/contact');
    await expect(badge(page)).toHaveText('۹۹+');
    await expect(cartLink(page)).toHaveAccessibleName('۱۲۰ کالا در سبد خرید');
    const fit = await badge(page).evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().left >= 0);
    expect(fit).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe('from choosing a part to paying', () => {
  test('the button says where it leads, there is a way back to shopping, and a guest returns to checkout with the cart intact', async ({ page }) => {
    await addFromDetail(page, 'demo-spark-plug-elantra', 2);
    await page.goto('/fa/cart');
    await expect(page.getByText('هزینهٔ ارسال پس از انتخاب نشانی')).toBeVisible();
    await expect(page.getByRole('link', { name: 'افزودن کالای دیگر' })).toHaveAttribute('href', '/fa/parts');
    await page.getByRole('link', { name: 'ادامه و تکمیل خرید' }).click();
    await expect(page).toHaveURL(/\/fa\/checkout$/);
    await expect(page.getByText('برای پرداخت وارد حساب کاربری شوید')).toBeVisible();
    // The finished step's tick is readable: the same token trap as the badge.
    const tick = await page.getByRole('list', { name: 'مراحل خرید' }).locator('li').first().locator('span').first().evaluate((el) => { const cs = getComputedStyle(el); return { color: cs.color, background: cs.backgroundColor }; });
    expect(tick.color).not.toBe(tick.background);
    expect(tick.background).toBe('rgb(42, 28, 22)');
    await expect(page.getByRole('main').getByRole('link', { name: 'بازگشت به سبد خرید' })).toHaveAttribute('href', '/fa/cart');
    await page.getByRole('main').getByRole('link', { name: 'ورود / ثبت‌نام' }).click();
    await expect(page).toHaveURL(/\/fa\/login\?next=%2Ffa%2Fcheckout/);
    await page.locator('#login-mobile').fill('09120000000');
    await page.getByRole('button', { name: 'دریافت کد' }).click();
    await page.locator('#login-code').fill('123456');
    await page.getByRole('button', { name: 'ورود', exact: true }).click();
    await expect(page).toHaveURL(/\/fa\/checkout$/);
    await expect(page.getByRole('heading', { name: 'نشانی تحویل' })).toBeVisible();
    await expect(badge(page)).toHaveText('۲');
    // The back control skips the used sign-in form and returns to the cart.
    await page.getByRole('link', { name: 'بازگشت', exact: true }).click();
    await expect(page).toHaveURL(/\/fa\/cart$/);
    await expect(badge(page)).toHaveText('۲');
  });

  test('pay stays off with its reason until everything is chosen, shows the sum with shipping, and goes once to the result', async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: 'hedax_fixture_role', value: 'customer', url: baseURL as string }]);
    await addFromDetail(page, 'demo-spark-plug-elantra', 1);
    await page.goto('/fa/checkout');
    await expect(page.getByText('روش ارسال را انتخاب کنید.')).toBeVisible();
    const pay = page.locator('aside').getByRole('button').first();
    await expect(pay).toBeDisabled();
    await page.getByRole('radio', { name: /ارسال آزمایشی/ }).check();
    await expect(page.getByText('برای پرداخت، تأیید شرایط فروش لازم است.')).toBeVisible();
    await expect(page.getByRole('term').filter({ hasText: 'هزینهٔ ارسال' })).toBeVisible();
    await page.getByRole('checkbox', { name: /را خوانده‌ام و می‌پذیرم/ }).check();
    await expect(page.getByText('برای پرداخت، تأیید شرایط فروش لازم است.')).toHaveCount(0);
    const calls: Array<string | undefined> = [];
    page.on('request', (r) => { if (r.method() === 'POST' && /\/api\/v1\/checkout/.test(r.url())) calls.push(r.headers()['idempotency-key']); });
    await expect(pay).toBeEnabled();
    await pay.dblclick();
    await expect(page).toHaveURL(/\/fa\/payment\/result\?attempt=/);
    await expect(page.getByText('پرداخت تأیید شد.')).toBeVisible();
    // Both clicks of a double click can only ever be one payment attempt.
    expect(new Set(calls).size).toBe(1);
    // The result never leads back into the gateway or checkout.
    await page.getByRole('link', { name: 'بازگشت', exact: true }).click();
    await expect(page).toHaveURL(/\/fa\/account\/orders$/);
  });

  test('a payment the server marks failed shows failure and only the offered retry', async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: 'hedax_fixture_role', value: 'customer', url: baseURL as string }]);
    await page.route('**/api/v1/payments/attempts/**', (route) => route.fulfill({ json: { attemptId: 'x', status: 'FAILED', subject: { kind: 'STOCK_ORDER', id: 'o', reference: 'HX-O-1' }, amount: { currency: 'IRR', amountMinor: '100' }, paidAt: null, providerReference: null, canRetry: true, message: 'FAILED' } }));
    await page.goto('/fa/payment/result?attempt=00000000-0000-7000-8000-0000000b0009&status=OK');
    // A forged "OK" in the address changes nothing: only the server's answer counts.
    await expect(page.getByText('پرداخت ناموفق بود')).toBeVisible();
    await expect(page.getByText('پرداخت تأیید شد.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'تلاش دوباره برای پرداخت' })).toBeVisible();
  });

  test('network failures explain themselves and can be retried, in the cart and at checkout', async ({ page, context, baseURL }) => {
    await addFromDetail(page, 'demo-spark-plug-elantra', 2);
    await page.goto('/fa/cart');
    await expect(badge(page)).toHaveText('۲');
    await page.route(/\/api\/v1\/cart\/items\//, (route) => route.abort());
    await page.getByRole('button', { name: /افزایش تعداد شمع موتور النترا/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'اتصال به سرور برقرار نشد' })).toBeVisible();
    await expect(badge(page)).toHaveText('۲');
    await expect(page.locator('input[id^="qty-"]')).toHaveValue('۲');
    await page.unroute(/\/api\/v1\/cart\/items\//);
    await page.getByRole('button', { name: /افزایش تعداد شمع موتور النترا/ }).click();
    await expect(badge(page)).toHaveText('۳');
    await expect(page.getByRole('alert').filter({ hasText: 'اتصال به سرور' })).toHaveCount(0);

    await page.route('**/api/v1/cart?**', (route) => route.abort());
    await page.reload();
    await page.getByRole('button', { name: 'تلاش دوباره' }).waitFor();
    await page.unroute('**/api/v1/cart?**');
    await page.getByRole('button', { name: 'تلاش دوباره' }).click();
    await expect(page.getByRole('link', { name: 'ادامه و تکمیل خرید' })).toBeVisible();

    await context.addCookies([{ name: 'hedax_fixture_role', value: 'customer', url: baseURL as string }]);
    await page.route('**/api/v1/checkout/preview?**', (route) => route.abort());
    await page.goto('/fa/checkout');
    await page.getByRole('button', { name: 'تلاش دوباره' }).click();
    await page.getByRole('button', { name: 'تلاش دوباره' }).waitFor();
    await page.unroute('**/api/v1/checkout/preview?**');
    await page.getByRole('button', { name: 'تلاش دوباره' }).click();
    await expect(page.getByRole('heading', { name: 'نشانی تحویل' })).toBeVisible();
  });

  test('stock limits: the reason beside a disabled plus, and a cart line that outgrew stock can be fixed', async ({ page }) => {
    await addFromDetail(page, 'demo-brake-disc-camry-refurb', 3);
    await page.getByRole('link', { name: 'مشاهدهٔ سبد' }).click();
    await expect(page).toHaveURL(/\/fa\/cart$/);
    await expect(page.getByRole('button', { name: /افزایش تعداد/ })).toBeDisabled();
    await expect(page.getByText(/به سقف موجودی رسیده‌اید: حداکثر ۳/)).toBeVisible();
    await page.getByRole('link', { name: 'بازگشت', exact: true }).click();
    await expect(page).toHaveURL(/\/fa\/parts\/demo-brake-disc/);
    await page.locator('#qty').fill('1');
    await page.locator('#qty').blur();
    await page.getByRole('button', { name: 'افزودن به سبد' }).click();
    await expect(page.getByText('به سقف موجودی رسید')).toBeVisible();
    await expect(badge(page)).toHaveText('۳');

    // The server reports less stock than the line holds.
    const short = await page.evaluate(() => fetch('/api/v1/cart?currency=IRR').then((r) => r.json()));
    short.lines[0] = { ...short.lines[0], quantity: 3, maxOrderQuantity: 1, problems: ['QUANTITY_REDUCED'] };
    await page.route('**/api/v1/cart?**', (route) => route.fulfill({ json: { ...short, canCheckout: false } }));
    await page.goto('/fa/cart');
    await expect(page.getByText('تعداد درخواستی بیش از موجودی است.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'ادامه و تکمیل خرید' })).toHaveCount(0);
    await expect(page.getByText('برخی اقلام سبد نیاز به اصلاح دارند.')).toBeVisible();
    await page.getByRole('button', { name: /اصلاح به ۱/ }).click();
    await expect(badge(page)).toHaveText('۱');
  });

  test('an unavailable part offers removal and sourcing instead of amounts', async ({ page }) => {
    await addFromDetail(page, 'demo-spark-plug-elantra', 1);
    const gone = await page.evaluate(() => fetch('/api/v1/cart?currency=IRR').then((r) => r.json()));
    gone.lines[0] = { ...gone.lines[0], maxOrderQuantity: 0, problems: ['OUT_OF_STOCK'] };
    await page.route('**/api/v1/cart?**', (route) => route.fulfill({ json: { ...gone, canCheckout: false } }));
    await page.goto('/fa/cart');
    await expect(page.getByText('این قطعه ناموجود شده است.')).toBeVisible();
    await expect(page.getByRole('button', { name: /افزایش تعداد/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'درخواست تأمین مشابه' })).toHaveAttribute('href', '/fa/request-part');
    await expect(page.getByRole('button', { name: /حذف .* از سبد/ })).toBeEnabled();
  });

  test('checkout and the request form open on a browser without crypto.randomUUID (older phones, plain http)', async ({ page, context, baseURL }) => {
    await page.addInitScript(() => { Object.defineProperty(Crypto.prototype, 'randomUUID', { value: undefined, configurable: true }); });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await context.addCookies([{ name: 'hedax_fixture_role', value: 'customer', url: baseURL as string }]);
    await page.goto('/fa/request-part');
    await expect(page.getByRole('main').locator('input, textarea').first()).toBeVisible();
    await addFromDetail(page, 'demo-spark-plug-elantra', 1);
    await page.goto('/fa/checkout');
    await expect(page.getByRole('heading', { name: 'نشانی تحویل' })).toBeVisible();
    await page.getByRole('radio', { name: /ارسال آزمایشی/ }).check();
    await page.getByRole('checkbox', { name: /را خوانده‌ام و می‌پذیرم/ }).check();
    const sent = page.waitForRequest((r) => r.method() === 'POST' && /\/api\/v1\/checkout/.test(r.url()));
    await page.locator('aside').getByRole('button').first().click();
    // 32 random hex digits, then the time: the shape the server has always received.
    expect((await sent).headers()['idempotency-key']).toMatch(/^[0-9a-f]{32}[0-9a-z]+$/);
    expect(errors).toEqual([]);
  });

  test('checkout with an empty cart says so and offers parts', async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: 'hedax_fixture_role', value: 'customer', url: baseURL as string }]);
    await page.goto('/fa/checkout');
    await expect(page.getByText('سبد خرید شما خالی است')).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: 'مشاهدهٔ قطعات موجود' })).toHaveAttribute('href', '/fa/parts');
  });
});

test.describe('back control', () => {
  const back = (page: Page) => page.getByRole('link', { name: 'بازگشت', exact: true });

  for (const width of [390, 1440]) {
    test(`${width}px: one step back keeps the filters and the scroll position`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/fa');
      await page.locator('.titanium-quick-search-form input').fill('فیلتر');
      await page.locator('.titanium-quick-search-submit').click();
      await page.goto('/fa/parts?sort=name');
      await expect(back(page)).toBeVisible();
      const icon = await back(page).locator('svg').evaluate((el) => getComputedStyle(el).rotate);
      expect(icon, 'the arrow points right in RTL').toBe('180deg');
      const box = await back(page).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await page.evaluate(() => window.scrollTo(0, 700));
      await page.waitForTimeout(200);
      const y = await page.evaluate(() => window.scrollY);
      expect(y).toBeGreaterThan(0);
      await page.evaluate(() => document.querySelectorAll<HTMLAnchorElement>('main a[href*="/parts/"]')[3]!.click());
      await expect(page).toHaveURL(/\/fa\/parts\/[^?]+$/);
      await back(page).click();
      await expect(page).toHaveURL(/\/fa\/parts\?sort=name$/);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(y, -1);
    });
  }

  test('direct entry goes to a sensible parent, then home, without looping or leaving the site', async ({ page }) => {
    await page.goto('about:blank');
    await page.goto('/fa/parts/demo-air-filter-corolla');
    await back(page).click();
    await expect(page).toHaveURL(/\/fa\/parts$/);
    await back(page).click();
    await expect(page).toHaveURL(/\/fa$/);
    await expect(back(page)).toHaveCount(0);
    // The chain replaced its entries, so it cannot bring the visitor back round to the part.
    expect(await page.evaluate(() => sessionStorage.getItem('hedax-nav-trail'))).not.toContain('demo-air-filter');
  });

  test('checkout opened directly returns to the cart', async ({ page }) => {
    await page.goto('/fa/checkout');
    await back(page).click();
    await expect(page).toHaveURL(/\/fa\/cart$/);
  });

  test('a new tab has no site history, even when the opener has', async ({ page, context }) => {
    await page.goto('/fa/contact');
    await page.goto('/fa/about');
    const tab = await context.newPage();
    await tab.goto('/fa/parts/demo-air-filter-corolla');
    await tab.getByRole('link', { name: 'بازگشت', exact: true }).click();
    await expect(tab).toHaveURL(/\/fa\/parts$/);
    await tab.close();
  });

  test('history from another site is never followed', async ({ page }) => {
    await page.goto('data:text/html,<a id=go>go</a>');
    await page.goto('/fa/brands');
    await back(page).click();
    await expect(page).toHaveURL(/\/fa$/);
  });

  test('going back and forth between two pages never traps the visitor', async ({ page }) => {
    await page.goto('/fa');
    await page.getByRole('link', { name: 'برندها' }).first().click();
    await expect(page).toHaveURL(/\/fa\/brands$/);
    await page.goto('/fa/contact');
    await back(page).click();
    await expect(page).toHaveURL(/\/fa$/);
  });

  test('client navigation: back, then the browser forward, then back again keeps its place', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/fa');
    await page.locator('header nav').getByRole('link', { name: 'برندها' }).click();
    await expect(page).toHaveURL(/\/fa\/brands$/);
    await page.locator('header nav').getByRole('link', { name: 'خودروها' }).click();
    await expect(page).toHaveURL(/\/fa\/cars$/);
    await back(page).click();
    await expect(page).toHaveURL(/\/fa\/brands$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/fa\/cars$/);
    await back(page).click();
    await expect(page).toHaveURL(/\/fa\/brands$/);
    await back(page).click();
    await expect(page).toHaveURL(/\/fa$/);
    await expect(back(page)).toHaveCount(0);
  });

  for (const [name, device] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['phone', { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } }]] as const) {
    test(`${name}: back after switching language stays in that language, on the same page and filters, with the cart`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ ...device, baseURL: baseURL as string });
      const page = await context.newPage();
      const toEnglish = async () => {
        if (name === 'phone') await page.getByRole('button', { name: 'باز کردن منو' }).click();
        await page.getByRole('button', { name: /English/ }).click();
        await expect(page).toHaveURL(/\/en\//);
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        if (name === 'phone') await page.keyboard.press('Escape');
      };
      await addFromDetail(page, 'demo-spark-plug-elantra', 2);
      await page.goto('/fa/parts?sort=name');
      await page.evaluate(() => window.scrollTo(0, 500));
      await page.waitForTimeout(200);
      const y = await page.evaluate(() => window.scrollY);
      await page.evaluate(() => document.querySelectorAll<HTMLAnchorElement>('main a[href*="/parts/"]')[3]!.click());
      await expect(page).toHaveURL(/\/fa\/parts\/[^?]+$/);
      const detail = new URL(page.url()).pathname.replace('/fa/', '/en/');
      await toEnglish();
      await expect(page).toHaveURL(new RegExp(`${detail}$`));

      // Our control: the previous page and its filters, in English.
      await page.getByRole('link', { name: 'Back', exact: true }).click();
      await expect(page).toHaveURL(/\/en\/parts\?sort=name$/);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
      await expect(page.locator('html')).not.toHaveAttribute('data-locale-swap', '');
      await expect(page.locator('body')).toHaveCSS('opacity', '1');
      await expect(badge(page)).toHaveText('2');
      await expect.poll(() => page.evaluate(() => window.scrollY), { message: 'the place on the list is kept' }).toBeGreaterThan(y / 2);

      // The browser's or phone's own back button behaves the same.
      await page.evaluate(() => document.querySelectorAll<HTMLAnchorElement>('main a[href*="/parts/"]')[3]!.click());
      await expect(page).toHaveURL(/\/en\/parts\/[^?]+$/);
      await page.goBack();
      await expect(page).toHaveURL(/\/en\/parts\?sort=name$/);
      await page.goBack();
      await expect.poll(() => page.locator('html').getAttribute('lang')).toBe('en');
      await expect(page).toHaveURL(/\/en(\/|$)/);
      await expect(badge(page)).toHaveText('2');
      await context.close();
    });
  }

  test('the control is a real link, in the parent\'s direction, when opened in English', async ({ page }) => {
    await page.goto('/en/parts/demo-air-filter-corolla');
    await expect(page.getByRole('link', { name: 'Back', exact: true })).toHaveAttribute('href', '/en/parts');
    const icon = await page.getByRole('link', { name: 'Back', exact: true }).locator('svg').evaluate((el) => getComputedStyle(el).rotate);
    expect(icon).toBe('none');
  });
});

test.describe('Hexi: the whole character, fixed in its corner', () => {
  const live = { ...DEFAULT_ASSISTANT_SETTINGS, enabled: true, mobileSize: 80, desktopSize: 128 };
  const enable = (page: Page, settings: object = live) => page.route('**/api/v1/site/assistant?**', (route) => route.fulfill({ json: settings }));
  const dock = (page: Page) => page.locator('.assistant-dock');
  const launcher = (page: Page) => page.getByRole('button', { name: 'باز کردن هیکسی، راهنمای سورس' });
  const collapse = (page: Page) => page.getByRole('button', { name: 'جمع‌کردن هیکسی' });
  const chip = (page: Page) => page.getByRole('button', { name: 'نمایش هیکسی' });
  const ready = async (page: Page, path: string, settings?: object) => {
    await enable(page, settings);
    await page.goto(path);
    await hideDevOverlay(page);
    await expect(launcher(page)).toBeVisible();
  };
  const phone = (browser: Browser, baseURL: string | undefined, width = 390, height = 844) => browser.newContext({ ...devices['Pixel 5'], viewport: { width, height }, baseURL: baseURL as string });

  /** Frame by frame through four passes down and up the whole page: where it is, how it looks, what changes on it. */
  const trace = (page: Page) => page.evaluate(async () => {
    const el = document.querySelector<HTMLElement>('.assistant-dock')!;
    const tap = document.querySelector<HTMLElement>('.assistant-launcher')!;
    const positions = new Set<string>();
    const looks = new Set<string>();
    let mutations = 0; let run = true;
    const mo = new MutationObserver((list) => { mutations += list.length; });
    mo.observe(el, { attributes: true, childList: true, subtree: true });
    const tick = () => {
      if (!run) return;
      const r = el.getBoundingClientRect(); const t = tap.getBoundingClientRect(); const cs = getComputedStyle(el);
      positions.add(`${r.left},${r.top},${r.width},${r.height}|${t.left},${t.top},${t.width},${t.height}`);
      looks.add(`${cs.opacity}|${cs.visibility}|${cs.display}|${cs.transform}`);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const h = document.documentElement.scrollHeight - innerHeight;
    for (const down of [true, false, true, false]) {
      for (let i = 0; i <= 60; i++) {
        window.scrollTo(0, (down ? i / 60 : 1 - i / 60) * h);
        await new Promise((r) => requestAnimationFrame(r));
      }
      // Rests between passes too: nothing may react after scrolling stops either.
      await new Promise((r) => setTimeout(r, 300));
    }
    run = false; mo.disconnect();
    return { positions: [...positions], looks: [...looks], mutations, dialogs: document.querySelectorAll('[role=dialog]').length };
  });

  for (const [width, height, min, max] of [[360, 740, 72, 88], [390, 844, 72, 88], [768, 1024, 72, 88], [1440, 900, 100, 128]] as const) {
    test(`${width}px: whole and inside the screen; the same place and look at every frame; it never opens by itself`, async ({ browser, baseURL }, testInfo) => {
      const context = await browser.newContext({ viewport: { width, height }, baseURL: baseURL as string, ...(width < 1024 ? { hasTouch: true, isMobile: width < 768 } : {}) });
      const page = await context.newPage();
      await ready(page, '/fa');
      await page.waitForTimeout(800);
      const shape = await dock(page).evaluate((el) => {
        const r = el.getBoundingClientRect();
        const art = el.querySelector<HTMLImageElement>('.assistant-art')!; const a = art.getBoundingClientRect();
        const plate = el.querySelector('.assistant-plate')!; const p = plate.getBoundingClientRect();
        return { width: r.width, left: r.left, right: innerWidth - r.right, bottom: innerHeight - r.bottom, parentIsBody: el.parentElement === document.body, ratio: a.height / a.width, natural: art.naturalHeight / art.naturalWidth, fit: getComputedStyle(art).objectFit, name: plate.textContent, plateBelow: p.top >= a.bottom - 4, plateColor: getComputedStyle(plate).color };
      });
      expect(shape.width).toBeGreaterThanOrEqual(min);
      expect(shape.width).toBeLessThanOrEqual(max);
      expect(shape.left, 'not cut by the edge').toBeGreaterThan(0);
      expect(shape.right, 'not cut by the edge').toBeGreaterThan(0);
      expect(shape.bottom).toBeGreaterThan(0);
      expect(shape.parentIsBody).toBe(true);
      expect(shape.ratio, 'his proportions').toBeCloseTo(shape.natural, 1);
      expect(shape.fit).toBe('contain');
      expect(shape.name).toBe('هیکسی');
      expect(shape.plateBelow).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`hexi-${width}.png`) });
      const result = await trace(page);
      expect(result.positions, 'neither he nor his tap area may move').toHaveLength(1);
      expect(result.looks, 'he must not hide, fade or be transformed').toEqual(['1|visible|block|none']);
      expect(result.mutations, 'scrolling must change nothing on him').toBe(0);
      expect(result.dialogs).toBe(0);
      await context.close();
    });
  }

  test('no script listens to scrolling for him, and nothing the page transforms can move him', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __scrollListeners: string[] };
      w.__scrollListeners = [];
      const add = window.addEventListener.bind(window);
      window.addEventListener = ((type: string, ...rest: [EventListener]) => { if (type === 'scroll') w.__scrollListeners.push(new Error().stack ?? ''); return add(type, ...rest); }) as typeof window.addEventListener;
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await ready(page, '/fa/parts');
    const stacks = await page.evaluate(() => (window as unknown as { __scrollListeners: string[] }).__scrollListeners);
    expect(stacks.filter((s) => /assistant/i.test(s))).toEqual([]);
    const before = await dock(page).boundingBox();
    await page.addStyleTag({ content: '.titanium-store, main, header { transform: translateY(40px) scale(.9) !important; }' });
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(200);
    expect(await dock(page).boundingBox()).toEqual(before);
  });

  for (const path of ['/fa', '/fa/parts', '/fa/imported-parts']) {
    for (const [width, height] of [[360, 740], [390, 844], [768, 1024], [1280, 800], [1440, 900]] as const) {
      test(`${path} at ${width}px: no buying button, finder field, film control or back control ever under him; no field's middle either`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await ready(page, path);
        await page.waitForTimeout(400);
        const result = await page.evaluate(async () => {
          const el = document.querySelector('.assistant-dock')!.getBoundingClientRect();
          const h = document.documentElement.scrollHeight - innerHeight;
          const under: string[] = [];
          const middles: string[] = [];
          const shown = (c: Element) => { const r = c.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(c).visibility !== 'hidden'; };
          for (let y = 0; y <= h; y += 30) {
            window.scrollTo(0, y);
            await new Promise((r) => requestAnimationFrame(r));
            for (const c of document.querySelectorAll('.part-card-cart, .part-card-source, .cine-control, .back-control, .vf-field, .vf-submit')) {
              if (!shown(c)) continue;
              const r = c.getBoundingClientRect();
              if (Math.min(r.right, el.right) > Math.max(r.left, el.left) && Math.min(r.bottom, el.bottom) > Math.max(r.top, el.top)) under.push(`${c.className} at ${y}`);
            }
            for (const c of document.querySelectorAll('main input, main select, main textarea')) {
              if (!shown(c)) continue;
              const r = c.getBoundingClientRect();
              const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
              if (cx > el.left && cx < el.right && cy > el.top && cy < el.bottom) middles.push(`${c.tagName}.${c.className} at ${y}`);
            }
          }
          return { under: [...new Set(under)].slice(0, 6), middles: [...new Set(middles)].slice(0, 6) };
        });
        expect(result.under).toEqual([]);
        expect(result.middles).toEqual([]);
      });
    }
  }

  for (const width of [360, 390]) {
    test(`${width}px: the vehicle finder keeps its words whole beside him`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await ready(page, '/fa');
      await page.waitForTimeout(400);
      const cut = await page.locator('.vf-value').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent));
      expect(cut).toEqual([]);
    });
  }

  test('it stays clear of the back control', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await ready(page, '/fa/parts');
    const [a, b] = [await dock(page).boundingBox(), await page.getByRole('link', { name: 'بازگشت', exact: true }).boundingBox()];
    expect(a!.y).toBeGreaterThan(b!.y + b!.height);
  });

  test('not on the request form, nor anywhere in buying and paying', async ({ page }) => {
    await enable(page);
    for (const path of ['/fa/request-part', '/fa/cart', '/fa/checkout', '/fa/payment/result', '/fa/parts/demo-air-filter-corolla', '/fa/account']) {
      await page.goto(path);
      await page.waitForTimeout(700);
      await expect(dock(page), path).toHaveCount(0);
    }
  });

  test('typing on a phone gives the room to the field; he returns to the same place, and nothing moved him', async ({ browser, baseURL }) => {
    const context = await phone(browser, baseURL);
    const page = await context.newPage();
    await ready(page, '/fa');
    const place = await dock(page).boundingBox();
    await page.locator('#quick-search-input').focus();
    await expect(dock(page)).toBeHidden();
    await page.evaluate(() => {
      const v = window.visualViewport!;
      Object.defineProperty(v, 'height', { configurable: true, get: () => 400 });
      v.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('resize'));
    });
    await page.locator('#quick-search-input').blur();
    await expect(dock(page)).toBeVisible();
    expect(await dock(page).boundingBox()).toEqual(place);
    await context.close();
  });

  test('the phone browser bar sliding away changes only the distance to the bottom edge, by CSS alone', async ({ browser, baseURL }) => {
    const context = await phone(browser, baseURL, 390, 788);
    const page = await context.newPage();
    await ready(page, '/fa');
    const small = (await dock(page).boundingBox())!;
    await dock(page).evaluate((el) => {
      const w = window as unknown as { __changes: number };
      w.__changes = 0;
      new MutationObserver((l) => { w.__changes += l.length; }).observe(el, { attributes: true, childList: true, subtree: true });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    const large = (await dock(page).boundingBox())!;
    expect(large.width).toBe(small.width);
    expect(large.height).toBe(small.height);
    expect(844 - (large.y + large.height)).toBeCloseTo(788 - (small.y + small.height), 0);
    expect(await page.evaluate(() => (window as unknown as { __changes: number }).__changes)).toBe(0);
    await context.close();
  });

  test('turning the phone keeps him whole in his corner, and an open conversation stays', async ({ browser, baseURL }) => {
    const context = await phone(browser, baseURL);
    const page = await context.newPage();
    await ready(page, '/fa');
    for (const [w, h] of [[844, 390], [390, 844], [360, 640], [640, 360]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(200);
      const r = (await dock(page).boundingBox())!;
      expect(r.x).toBeGreaterThan(0);
      expect(r.x + r.width).toBeLessThan(w);
      expect(r.y).toBeGreaterThan(0);
      expect(r.y + r.height).toBeLessThan(h);
      expect(r.height, 'he takes under half of a short screen').toBeLessThan(h * 0.45);
      const plate = await page.locator('.assistant-plate').evaluate((el) => ({ text: el.scrollWidth <= el.clientWidth, inside: el.getBoundingClientRect().left >= 0 }));
      expect(plate).toEqual({ text: true, inside: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await launcher(page).tap();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('نام قطعه، شماره فنی یا پرسش').fill('لنت');
    await dialog.evaluate((el) => { el.setAttribute('data-same-element', 'yes'); });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(250);
    await expect(dialog).toHaveAttribute('data-same-element', 'yes');
    await expect(dialog.getByLabel('نام قطعه، شماره فنی یا پرسش')).toHaveValue('لنت');
    await context.close();
  });

  test('desktop: he breathes on an inner layer only, and reacts to the pointer, while his box stands still', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await ready(page, '/fa');
    const inner = await dock(page).evaluate((el) => ({
      art: getComputedStyle(el.querySelector('.assistant-art')!).animationName,
      others: [el, el.querySelector('.assistant-launcher')!, el.querySelector('.assistant-pose')!].map((n) => getComputedStyle(n).animationName),
      outer: [el, el.querySelector('.assistant-launcher')!].map((n) => getComputedStyle(n).transform),
    }));
    expect(inner.art).toBe('hexi-breathe');
    expect(inner.others).toEqual(['none', 'none', 'none']);
    expect(inner.outer).toEqual(['none', 'none']);
    const boxes = await dock(page).evaluate(async (el) => {
      const seen = new Set<string>(); const art = new Set<string>();
      const end = performance.now() + 2600;
      while (performance.now() < end) {
        const r = el.getBoundingClientRect(); seen.add(`${r.left},${r.top},${r.width},${r.height}`);
        art.add(getComputedStyle(el.querySelector('.assistant-art')!).transform);
        await new Promise((f) => requestAnimationFrame(f));
      }
      return { seen: seen.size, art: art.size };
    });
    expect(boxes.seen).toBe(1);
    expect(boxes.art, 'the breathing really runs').toBeGreaterThan(5);
    const before = await dock(page).boundingBox();
    await launcher(page).hover();
    await page.waitForTimeout(350);
    expect(await page.locator('.assistant-pose').evaluate((el) => getComputedStyle(el).transform)).not.toBe('none');
    expect(await dock(page).boundingBox()).toEqual(before);
  });

  test('no decorative motion on a phone, with reduced motion, or with the setting off', async ({ browser, baseURL }) => {
    const still = (page: Page) => dock(page).evaluate((el) => el.getAnimations({ subtree: true }).length);
    const onPhone = await phone(browser, baseURL);
    const page = await onPhone.newPage();
    await ready(page, '/fa');
    expect(await still(page)).toBe(0);
    await onPhone.close();
    const reduced = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', baseURL: baseURL as string });
    const quiet = await reduced.newPage();
    await ready(quiet, '/fa');
    expect(await still(quiet)).toBe(0);
    await launcher(quiet).hover();
    await quiet.waitForTimeout(300);
    expect(await quiet.locator('.assistant-pose').evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    await reduced.close();
    const off = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: baseURL as string });
    const plain = await off.newPage();
    await ready(plain, '/fa', { ...live, animationEnabled: false });
    expect(await still(plain)).toBe(0);
    await off.close();
  });

  test('a tap opens it, with the character and its message; Escape closes and returns the focus; it can be hidden for the visit', async ({ browser, baseURL }) => {
    const context = await phone(browser, baseURL);
    const page = await context.newPage();
    await ready(page, '/fa/parts');
    await page.waitForTimeout(1500);
    await expect(page.getByRole('dialog'), 'it never opens by itself').toHaveCount(0);
    await launcher(page).tap();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.assistant-intro-art')).toBeVisible();
    await expect(dialog).toContainText(DEFAULT_ASSISTANT_SETTINGS.greeting.fa);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(launcher(page)).toBeFocused();
    await launcher(page).tap();
    await dialog.getByRole('button', { name: 'پنهان‌کردن هیکسی تا پایان این بازدید' }).click();
    await expect(dock(page)).toHaveCount(0);
    await page.goto('/fa/contact');
    await page.waitForTimeout(1200);
    await expect(dock(page)).toHaveCount(0);
    await context.close();
  });

  test('collapsing: a small clear button, a recognisable pill that stays collapsed, nothing else on the page shifts', async ({ browser, baseURL }, testInfo) => {
    const context = await phone(browser, baseURL);
    const page = await context.newPage();
    await ready(page, '/fa/parts');
    const size = await collapse(page).evaluate((el) => {
      const r = el.getBoundingClientRect(); const hit = getComputedStyle(el, '::after');
      return { seen: r.width, target: r.width - parseFloat(hit.left) - parseFloat(hit.right) };
    });
    expect(size.seen).toBeLessThanOrEqual(28);
    expect(size.target, 'large enough for a finger').toBeGreaterThanOrEqual(40);
    const cart = page.locator('.part-card-cart').first();
    const before = { page: await page.evaluate(() => document.documentElement.scrollHeight), button: await cart.boundingBox() };
    await collapse(page).tap();
    await expect(chip(page)).toBeVisible();
    await expect(chip(page)).toBeFocused();
    await expect(launcher(page)).toHaveCount(0);
    await expect(page.getByRole('dialog'), 'collapsing does not open the conversation').toHaveCount(0);
    await expect(chip(page)).toContainText('هیکسی');
    const pill = await chip(page).evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: innerWidth - r.right, bottom: innerHeight - r.bottom, height: r.height, face: el.querySelector('img')!.complete }; });
    expect(pill.left).toBeGreaterThan(0);
    expect(pill.right).toBeGreaterThan(0);
    expect(pill.bottom).toBeGreaterThan(0);
    expect(pill.height).toBeGreaterThanOrEqual(44);
    expect(pill.face).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('hexi-collapsed-390.png') });
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(before.page);
    expect(await cart.boundingBox()).toEqual(before.button);
    await page.reload();
    await hideDevOverlay(page);
    await expect(chip(page)).toBeVisible();
    await chip(page).tap();
    await expect(launcher(page)).toBeVisible();
    await expect(launcher(page)).toBeFocused();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await context.close();
  });

  test('the keyboard reaches him: a visible focus on both buttons, Enter opens, and a large enough target', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await ready(page, '/fa/contact');
    const box = (await launcher(page).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await launcher(page).focus();
    await page.keyboard.press('Tab');
    await expect(collapse(page)).toBeFocused();
    expect(await collapse(page).evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
    await page.keyboard.press('Shift+Tab');
    await expect(launcher(page)).toBeFocused();
    expect(await launcher(page).evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('English: the same character on the other side of the page, with its English name', async ({ browser, baseURL }) => {
    const context = await phone(browser, baseURL);
    const page = await context.newPage();
    await enable(page);
    await page.goto('/en');
    await hideDevOverlay(page);
    const open = page.getByRole('button', { name: 'Open Hexi, the Source guide' });
    await expect(open).toBeVisible();
    await expect(open).toContainText('Hexi');
    const r = (await dock(page).boundingBox())!;
    expect(r.x + r.width).toBeGreaterThan(390 - 100);
    await context.close();
  });

  test('the open panel is modal at every size: the page behind cannot be tapped by mistake', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await ready(page, '/fa/parts');
    await launcher(page).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('pointer-events', 'none');
    const box = (await page.getByRole('dialog').boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(1440);
    expect(box.y + box.height).toBeLessThanOrEqual(900);
  });

  test('moving between pages keeps the same character and its conversation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route('**/api/v1/assistant/messages', (route) => route.fulfill({ json: { text: 'پاسخ آزمایشی', products: [], provider: 'mock', model: 'test' } }));
    await ready(page, '/fa');
    await launcher(page).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('نام قطعه، شماره فنی یا پرسش').fill('لنت');
    await dialog.getByRole('button', { name: 'ارسال', exact: true }).click();
    await expect(dialog.getByText('پاسخ آزمایشی')).toBeVisible();
    await page.keyboard.press('Escape');
    await dock(page).evaluate((el) => { el.setAttribute('data-same-element', 'yes'); });
    await page.locator('header nav').getByRole('link', { name: 'قطعات موجود' }).click();
    await expect(page).toHaveURL(/\/fa\/parts/);
    await expect(dock(page)).toHaveAttribute('data-same-element', 'yes');
    await launcher(page).click();
    await expect(page.getByRole('dialog').getByText('پاسخ آزمایشی')).toBeVisible();
  });
});

test.describe('installing the app', () => {
  const install = (page: Page) => page.getByRole('button', { name: 'نصب برنامه' });

  test('with no offer from the browser there is no install button', async ({ page }) => {
    await page.goto('/fa/contact');
    await page.waitForTimeout(600);
    await expect(install(page)).toHaveCount(0);
  });

  test('the button appears only after the browser offers, and opens the browser\'s own dialog', async ({ page }) => {
    await page.goto('/fa/contact');
    // The count has answered, so the page is running.
    await expect(cartLink(page)).toHaveAccessibleName('سبد خرید خالی است');
    const offered = await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void> };
      (window as unknown as { asked: number }).asked = 0;
      event.prompt = () => { (window as unknown as { asked: number }).asked++; return Promise.resolve(); };
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(offered, 'the browser\'s own banner gives way to the visitor\'s choice').toBe(true);
    await expect(install(page)).toBeVisible();
    await install(page).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { asked: number }).asked)).toBe(1);
    // Once asked, the offer is used up.
    await expect(install(page)).toHaveCount(0);
  });

  test('on iPhone: the short steps, because Safari has no button a page can press', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ ...devices['iPhone 13'], baseURL: baseURL as string, locale: 'fa-IR' });
    const page = await context.newPage();
    await page.goto('/fa/contact');
    await install(page).click();
    await expect(page.getByText(/Add to Home Screen/)).toBeVisible();
    await context.close();
  });

  test('once installed the offer disappears, and the back control is what is left to go back with', async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'display-mode', value: 'standalone' }] });
    await page.goto('/fa/parts/demo-air-filter-corolla');
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void> };
      event.prompt = () => Promise.resolve();
      window.dispatchEvent(event);
    });
    await page.waitForTimeout(300);
    await expect(install(page)).toHaveCount(0);
    await page.getByRole('link', { name: 'بازگشت', exact: true }).click();
    await expect(page).toHaveURL(/\/fa\/parts$/);
  });
});
