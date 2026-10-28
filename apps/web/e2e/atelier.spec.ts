import { expect, test } from '@playwright/test';

test('atelier remains readable and contained in both directions and four viewports', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const locale of ['fa', 'en']) for (const width of [390, 768, 1366, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/${locale}`);
    const banner = page.locator('.atelier-banner');
    await expect(banner).toBeVisible();
    await expect(banner.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const geometry = await banner.evaluate(el => {
      const media = el.getBoundingClientRect();
      const copy = el.querySelector('h1')!.getBoundingClientRect();
      return { inside: copy.left >= media.left && copy.right <= media.right && copy.top >= media.top && copy.bottom <= media.bottom, color: getComputedStyle(el.querySelector('h1')!).color };
    });
    expect(geometry.inside).toBe(true);
    expect(geometry.color).toBe('rgb(42, 28, 22)');
    await expect(page.locator('.titanium-quick-search input')).toHaveAttribute('name', 'q');
    await expect(page.locator('#vehicle-finder')).toBeAttached();
    await expect(page.locator('.titanium-path')).toHaveCount(6);
  }
});

test('account exposes customer and staff routes and quick search keeps its no-JS GET fallback', async ({ page, browser, baseURL }) => {
  await page.goto('/en');
  await page.locator('.atelier-account summary').click();
  await expect(page.getByRole('link', { name: 'Customer sign in', exact: true })).toHaveAttribute('href', '/en/login');
  await expect(page.getByRole('link', { name: 'Staff sign in', exact: true })).toHaveAttribute('href', '/en/staff/login');
  const noJs = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const fallback = await noJs.newPage();
    await fallback.goto('/en');
    await fallback.locator('#quick-search-input').fill('filter');
    await fallback.locator('.titanium-quick-search-submit').click();
    await expect(fallback).toHaveURL(/\/en\/parts\?q=filter/);
  } finally { await noJs.close(); }
});
