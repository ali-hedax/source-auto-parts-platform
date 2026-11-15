import { DEFAULT_ASSISTANT_SETTINGS, readableMobile } from '@hedax/contracts/constants';
import { expect, test, type Page } from '@playwright/test';
import { showsPriceUnit } from '../src/lib/price-unit';

/**
 * The owner's approved storefront details (2026-11-15): blue buy buttons with words on every card and beside Hexi,
 * no «/ عدد», the request page without signing in, the four-column footer with Persian digits, and the purchase path.
 */
const BLUE = 'rgb(29, 79, 191)';
const hideDevOverlay = (page: Page) => page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
const withHexi = (page: Page) => page.route('**/api/v1/site/assistant?**', (route) => route.fulfill({ json: { ...DEFAULT_ASSISTANT_SETTINGS, enabled: true, mobileSize: 80, desktopSize: 128 } }));
const badge = (page: Page) => page.locator('[data-cart-badge]');

async function addFromDetail(page: Page, slug: string) {
  await page.goto(`/fa/parts/${slug}`);
  await expect(page.getByRole('link', { name: /سبد خرید/ }).first()).toBeVisible();
  const before = (await badge(page).count()) ? await badge(page).textContent() : '';
  await page.getByRole('main').getByRole('button', { name: 'افزودن به سبد' }).click();
  await expect(page.getByText(/به سبد اضافه شد/)).toBeVisible();
  await expect(badge(page)).not.toHaveText(before ?? '');
}

test.describe('rules', () => {
  test('a price per «عدد» shows no unit; other units stay', () => {
    expect(showsPriceUnit({ name: 'عدد' })).toBe(false);
    expect(showsPriceUnit({ name: ' عدد ' })).toBe(false);
    expect(showsPriceUnit({ name: 'دست' })).toBe(true);
    expect(showsPriceUnit({ name: 'جفت' })).toBe(true);
    expect(showsPriceUnit({ name: 'متر' })).toBe(true);
    expect(showsPriceUnit(null)).toBe(false);
  });

  test('mobile and WhatsApp numbers read as people say them, never 0098… or 00971…', () => {
    expect(readableMobile('00989121531797')).toBe('0912 153 1797');
    expect(readableMobile('+98 912 153 1797')).toBe('0912 153 1797');
    expect(readableMobile('09121531797')).toBe('0912 153 1797');
    expect(readableMobile('0912 153 1797')).toBe('0912 153 1797');
    expect(readableMobile('00971501441797')).toBe('+971 50 144 1797');
    expect(readableMobile('+971501441797')).toBe('+971 50 144 1797');
    expect(readableMobile('+971 50 144 1797')).toBe('+971 50 144 1797');
    expect(readableMobile('0044 20 7946 0000')).toBe('+44 20 7946 0000');
  });
});

test.describe('part card buy button', () => {
  for (const path of ['/fa', '/fa/parts', '/en/parts']) {
    for (const width of [360, 390, 640, 768, 1024, 1440]) {
      test(`${path} at ${width}px: blue, with icon and words, whole, and never in Hexi's column`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await withHexi(page);
        await page.goto(path);
        await hideDevOverlay(page);
        await expect(page.locator('.assistant-dock')).toBeVisible();
        const r = await page.evaluate(() => {
          const d = document.querySelector('.assistant-dock')!.getBoundingClientRect();
          return [...document.querySelectorAll<HTMLElement>('.part-card-cart')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => {
            const box = b.getBoundingClientRect();
            const label = b.querySelector<HTMLElement>('.part-card-cart-label');
            const lb = label?.getBoundingClientRect();
            return {
              icon: !!b.querySelector('svg'),
              words: label?.textContent ?? '',
              whole: !!label && !!lb && lb.width > 0 && label.scrollWidth <= label.clientWidth + 1 && lb.left >= box.left - 1 && lb.right <= box.right + 1,
              hexi: Math.min(box.right, d.right) - Math.max(box.left, d.left) > 0,
              color: getComputedStyle(b).backgroundColor,
            };
          });
        });
        expect(r.length).toBeGreaterThan(0);
        for (const b of r) {
          expect(b.icon).toBe(true);
          expect(b.words).toMatch(/افزودن به سبد|Add to cart/);
          expect(b.whole).toBe(true);
          expect(b.hexi).toBe(false);
          expect(b.color).toBe(BLUE);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      });
    }
  }

  test('cards have a thin frame and keep the round button', async ({ page }) => {
    await page.goto('/fa/parts');
    const s = await page.locator('.part-card').first().evaluate((el) => { const cs = getComputedStyle(el); const b = getComputedStyle(el.querySelector('.part-card-cart')!); return { border: cs.borderTopWidth, style: cs.borderTopStyle, radius: b.borderTopLeftRadius }; });
    expect(s).toMatchObject({ border: '1px', style: 'solid', radius: '999px' });
  });
});

test.describe('prices per piece', () => {
  test('no «/ عدد» on the card, the product page or in the cart', async ({ page }) => {
    await page.goto('/fa/parts');
    await expect(page.locator('.part-card').first()).toBeVisible();
    await expect(page.locator('[data-testid=price-unit]')).toHaveCount(0);
    await addFromDetail(page, 'demo-front-brake-pad-206');
    await expect(page.locator('main [data-testid=price-unit]')).toHaveCount(0);
    await page.goto('/fa/cart');
    await expect(page.getByRole('link', { name: 'ادامه و تکمیل خرید' })).toBeVisible();
    await expect(page.locator('[data-testid=price-unit]')).toHaveCount(0);
  });
});

test.describe('purchase path', () => {
  test('main buttons are blue and bold; «افزودن کالای دیگر» stays outlined', async ({ page }) => {
    await page.goto('/fa/parts/demo-front-brake-pad-206');
    const add = page.getByRole('main').getByRole('button', { name: 'افزودن به سبد' });
    expect(await add.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).fontWeight])).toEqual([BLUE, '700']);
    await addFromDetail(page, 'demo-front-brake-pad-206');
    await page.goto('/fa/cart');
    const next = page.getByRole('link', { name: 'ادامه و تکمیل خرید' });
    expect(await next.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).fontWeight])).toEqual([BLUE, '700']);
    const more = await page.getByRole('link', { name: 'افزودن کالای دیگر' }).evaluate((el) => { const cs = getComputedStyle(el); return { border: cs.borderTopWidth, bg: cs.backgroundColor }; });
    expect(more.border).toBe('1px');
    expect(more.bg).not.toBe(BLUE);
  });

  for (const width of [360, 375, 390]) {
    test(`the three steps fit one line at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/fa/cart');
      const steps = page.getByRole('list', { name: 'مراحل خرید' });
      await expect(steps).toBeVisible();
      const tops = await steps.locator('li').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(tops).toHaveLength(3);
      expect(new Set(tops).size).toBe(1);
      const fits = await steps.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= innerWidth);
      expect(fits).toBe(true);
    });
  }

  test('two parts are two lines; amount, removal and a reload; back control and browser back on each page', async ({ page }) => {
    await addFromDetail(page, 'demo-front-brake-pad-206');
    await addFromDetail(page, 'demo-oil-filter-samand');
    await page.goto('/fa/cart');
    const lines = page.locator('main ul > li').filter({ has: page.getByRole('group') });
    await expect(lines).toHaveCount(2);
    // The amount goes up on its own line only.
    await page.getByRole('button', { name: /افزایش تعداد لنت ترمز جلو/ }).click();
    await expect(lines.filter({ hasText: 'لنت ترمز جلو' }).locator('input')).toHaveValue(/^(2|۲)$/);
    await expect(lines.filter({ hasText: 'سمند' }).locator('input')).toHaveValue(/^(1|۱)$/);
    await expect(badge(page)).toHaveText('۳');
    // Remove the other line.
    await page.getByRole('button', { name: /^حذف .*سمند.* از سبد$/ }).click();
    await expect(lines).toHaveCount(1);
    await expect(badge(page)).toHaveText('۲');
    // Still there after a reload.
    await page.reload();
    await expect(lines).toHaveCount(1);
    await expect(badge(page)).toHaveText('۲');

    // Browser back from the cart goes to the previous page; forward returns to the cart.
    await page.goto('/fa/parts');
    await page.goto('/fa/cart');
    await page.goBack();
    await expect(page).toHaveURL(/\/fa\/parts$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/fa\/cart$/);
    await expect(lines).toHaveCount(1);

    // The product page's back control returns to the list.
    await page.goto('/fa/parts');
    await page.locator('.part-card a.part-card-main').first().click();
    await expect(page).toHaveURL(/\/fa\/parts\/[^/?]+$/);
    await page.getByRole('link', { name: 'بازگشت', exact: true }).click();
    await expect(page).toHaveURL(/\/fa\/parts$/);

    // Checkout without signing in: the cart's back control and the browser's back both return to the cart.
    await page.goto('/fa/cart');
    await page.getByRole('link', { name: 'ادامه و تکمیل خرید' }).click();
    await expect(page).toHaveURL(/\/fa\/checkout$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/fa\/cart$/);
    await page.getByRole('link', { name: 'ادامه و تکمیل خرید' }).click();
    await expect(page.getByRole('main').getByRole('link', { name: 'بازگشت به سبد خرید' })).toHaveAttribute('href', '/fa/cart');
    await page.getByRole('link', { name: 'بازگشت', exact: true }).click();
    await expect(page).toHaveURL(/\/fa\/cart$/);
    await expect(badge(page)).toHaveText('۲');
  });
});

test.describe('part request without signing in', () => {
  test('part name, vehicle and mobile are enough; the rest is optional', async ({ page }) => {
    await page.goto('/fa/request-part');
    await expect(page.getByText(/بدون ثبت‌نام و بدون هزینه/)).toBeVisible();
    await expect(page.getByText('برای ثبت نهایی وارد حساب شوید')).toHaveCount(0);
    const submit = page.getByRole('button', { name: 'ثبت درخواست' });
    await expect(submit).toBeEnabled();
    await submit.click();
    // Missing: part name, vehicle and mobile.
    await expect(page.locator('#item-0-name-error, [id="item-0-name-error"]')).toBeVisible();
    await expect(page.locator('#req-mobile-error')).toBeVisible();
    await page.locator('#item-0-name').fill('چراغ جلو راست');
    await page.locator('#item-0-brand').selectOption({ index: 1 });
    await page.locator('#item-0-year').fill('۱۳۹۸');
    await page.locator('#req-mobile').fill('۰۹۱۲۱۲۳۴۵۶۷');
    // The trap field is out of sight and out of the tab order.
    expect(await page.locator('#req-website').evaluate((el) => el.getBoundingClientRect().right < 0 || el.getBoundingClientRect().left > innerWidth || getComputedStyle(el.parentElement!).opacity === '0')).toBe(true);
    const sent = page.waitForRequest((r) => r.url().includes('/sourcing-requests/guest') && r.method() === 'POST');
    await submit.click();
    const req = await sent;
    const payload = JSON.parse(String(/name="payload"\r\n\r\n([\s\S]*?)\r\n--/.exec(req.postData() ?? '')?.[1] ?? '{}'));
    expect(payload.mobile).toBe('09121234567');
    expect(payload.items[0]).toMatchObject({ partName: 'چراغ جلو راست', vehicleYear: null, vehicleModel: 'سال ۱۳۹۸' });
    expect(payload.website).toBeUndefined();
    await expect(page.getByRole('status').filter({ hasText: 'HX-R-PREVIEW' })).toBeVisible();
  });

  test('the home band promises no sign-up and no fee with the blue button', async ({ page }) => {
    await page.goto('/fa');
    const band = page.locator('.titanium-sourcing');
    await expect(band.getByText('بدون ثبت‌نام، بدون هزینه')).toBeVisible();
    const cta = band.getByRole('link', { name: 'درخواست تأمین قطعه' });
    await expect(cta).toHaveAttribute('href', '/fa/request-part');
    expect(await cta.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(BLUE);
    await expect(band.locator('img.titanium-sourcing-art')).toBeVisible();
  });
});

test.describe('footer', () => {
  test('four aligned columns on wide screens, one type scale, about and contact links', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/fa');
    const footer = page.locator('footer.titanium-footer');
    const cols = await footer.locator('.titanium-footer-grid > *').evaluateAll((els) => els.map((e) => ({ cls: e.className, left: Math.round(e.getBoundingClientRect().left) })));
    expect(cols).toHaveLength(4);
    // Right to left: brand, quick links, help, contact.
    const order = [...cols].sort((a, b) => b.left - a.left).map((c) => c.cls.match(/titanium-footer-(brand|quick|help|contact)/)![1]);
    expect(order).toEqual(['brand', 'quick', 'help', 'contact']);
    const headings = await footer.locator('.footer-heading').evaluateAll((els) => els.map((e) => ({ size: getComputedStyle(e).fontSize, weight: getComputedStyle(e).fontWeight, top: Math.round(e.getBoundingClientRect().top), line: getComputedStyle(e).borderBottomWidth })));
    expect(headings).toHaveLength(3);
    expect(new Set(headings.map((h) => h.top)).size).toBe(1);
    for (const h of headings) expect(h).toMatchObject({ size: '16px', weight: '700', line: '1px' });
    const linkSizes = await footer.locator('nav a').evaluateAll((els) => [...new Set(els.map((e) => getComputedStyle(e).fontSize))]);
    expect(linkSizes).toEqual(['15px']);
    await expect(footer.getByRole('link', { name: 'درباره ما' })).toHaveAttribute('href', '/fa/about');
    await expect(footer.getByRole('link', { name: 'تماس با ما' })).toHaveAttribute('href', '/fa/contact');
  });

  test('numbers in Persian digits on Persian pages; call and WhatsApp links keep Latin digits', async ({ page }) => {
    await page.goto('/fa');
    const contact = page.getByTestId('footer-contact');
    const rows = contact.locator('a.footer-contact-row');
    const phone = rows.filter({ has: page.locator('.footer-contact-label', { hasText: 'تلفن' }) });
    expect(await phone.locator('.footer-contact-value').textContent()).not.toMatch(/[0-9]/);
    expect(await phone.getAttribute('href')).toMatch(/^tel:\+?[0-9]+(,[0-9]+)?$/);
    const wa = rows.filter({ has: page.locator('.footer-contact-label', { hasText: 'واتس‌اپ' }) });
    expect(await wa.locator('.footer-contact-value').textContent()).toBe('+۹۷۱ ۵۰ ۱۴۴ ۱۷۹۷');
    expect(await wa.getAttribute('href')).toBe('https://wa.me/971501441797');
    await page.goto('/en');
    expect(await page.getByTestId('footer-contact').locator('a.footer-contact-row').first().locator('.footer-contact-value').textContent()).toMatch(/[0-9]/);
  });

  for (const width of [360, 390, 768, 1024]) {
    test(`tidy without sideways scrolling at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/fa');
      const footer = page.locator('footer.titanium-footer');
      await footer.scrollIntoViewIfNeeded();
      const r = await footer.evaluate((el) => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, outside: [...el.querySelectorAll('a, p, span')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.left < -1 || b.right > innerWidth + 1); }).length }));
      expect(r).toEqual({ overflow: 0, outside: 0 });
    });
  }

  test('no trust seal until its link is saved', async ({ page }) => {
    await page.goto('/fa');
    await expect(page.locator('.footer-trust-seal')).toHaveCount(0);
  });
});
