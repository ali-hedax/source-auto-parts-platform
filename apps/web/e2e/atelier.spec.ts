import { expect, test } from '@playwright/test';

/**
 * Home page hero and account menu (owner layout 2026-11). The typing hero, the centred wordmark and the
 * four-step finder of the earlier home were replaced by the brief: one hero title in the HTML, a large
 * part search, three vehicle steps. The full section list is checked in source-ui.spec.ts.
 */

test('hero stays readable and contained in both directions and four viewports', async ({ page }) => {
  for (const locale of ['fa', 'en']) for (const width of [390, 768, 1366, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/${locale}`);
    const hero = page.locator('.su-hero');
    await expect(hero.getByRole('heading', { level: 1 })).toBeVisible();
    // The title is in the HTML once: no second, animated copy.
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('.atelier-typewriter')).toHaveCount(0);
    const geometry = await hero.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const title = el.querySelector('h1')!.getBoundingClientRect();
      return { width: box.width, inside: title.left >= box.left && title.right <= box.right && title.top >= box.top && title.bottom <= box.bottom, color: getComputedStyle(el.querySelector('h1')!).color };
    });
    expect(Math.round(geometry.width), `${locale} ${width}`).toBe(width);
    expect(geometry.inside).toBe(true);
    expect(geometry.color).toBe('rgb(42, 28, 22)');
    await expect(hero.locator('#quick-search-input')).toHaveAttribute('name', 'q');
    const fieldWidths = await page.locator('#vehicle-finder .vf-field').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
    expect(fieldWidths).toHaveLength(3);
    expect(fieldWidths.every((w) => w >= 80)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test('hero artwork loads with high priority and covers the hero', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/fa');
  const image = page.locator('.su-hero-media img');
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  expect(await image.getAttribute('fetchpriority')).toBe('high');
  expect(await image.evaluate((el) => getComputedStyle(el).objectFit)).toBe('cover');
});

test('account exposes customer and staff routes and the hero search keeps its no-JS GET fallback', async ({ page, browser, baseURL }) => {
  await page.goto('/en');
  await page.locator('.atelier-account summary').click();
  await expect(page.getByRole('link', { name: 'Customer sign in', exact: true })).toHaveAttribute('href', '/en/login');
  await expect(page.getByRole('link', { name: 'Staff sign in', exact: true })).toHaveAttribute('href', '/en/staff/login');
  const noJs = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const fallback = await noJs.newPage();
    await fallback.goto('/en');
    await expect(fallback.getByRole('heading', { level: 1 })).toContainText('The world of auto parts');
    await fallback.locator('#quick-search-input').fill('filter');
    await fallback.locator('.su-hero button[type=submit]').click();
    await expect(fallback).toHaveURL(/\/en\/parts\?q=filter/);
  } finally { await noJs.close(); }
});
