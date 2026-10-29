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
    const fieldWidths = await page.locator('#vehicle-finder .vf-text').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().width));
    expect(fieldWidths.every(width => width >= 80)).toBe(true);
    await expect(page.locator('.titanium-path')).toHaveCount(6);
  }
});

test('review corrections keep one search, four finder steps, five brand artworks and the closing film', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/fa');
  await expect(page.locator('.titanium-quick-search input[name=q]')).toHaveCount(1);
  await expect(page.locator('#vehicle-finder .vf-query')).toHaveCount(0);
  await expect(page.locator('#vehicle-finder .vf-field')).toHaveCount(4);
  await expect(page.locator('#vehicle-finder h2')).toHaveText('از خودروی شما شروع کنیم.');
  await expect(page.locator('.titanium-category-links')).toHaveCount(0);
  await expect(page.locator('.hedax-home-brands .atelier-brand-card')).toHaveCount(5);
  await expect(page.locator('.atelier-other-brand')).toContainText('سایر برندها');
  await expect(page.locator('.part-card-maker')).toHaveCount(0);
  const film = page.locator('.titanium-closing-film');
  await film.scrollIntoViewIfNeeded();
  await expect(film).toBeVisible();
  expect(await film.evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(await page.evaluate(() => innerWidth));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  await film.scrollIntoViewIfNeeded();
  await expect.poll(() => film.locator('video').evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(1400);
  expect(await film.locator('video').evaluate((el: HTMLVideoElement) => el.videoHeight)).toBe(224);
  expect(await page.locator('#vehicle-finder .titanium-finder-panel').evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('0px');
});

test('hero types Persian then English, pauses and supports reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/fa');
  const typewriter = page.locator('.atelier-typewriter');
  await expect(typewriter).toHaveAttribute('data-typing', 'true');
  const lines = typewriter.locator('.atelier-type-render');
  await expect(lines.first()).not.toBeEmpty();
  await typewriter.getByRole('button', { name: 'توقف جلوه‌ها', exact: true }).click();
  const paused = await lines.allTextContents();
  await page.waitForTimeout(250);
  expect(await lines.allTextContents()).toEqual(paused);
  await typewriter.getByRole('button', { name: 'ادامهٔ جلوه‌ها', exact: true }).click();
  await expect(lines.nth(2)).toHaveText('Smarter Parts. Better Driving.', { timeout: 15000 });
  await expect(lines.first()).toHaveText('دنیای قطعات خودرو');
  await expect(lines.nth(1)).toHaveText('هوشمندتر از همیشه');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(typewriter).toHaveAttribute('data-typing', 'false');
  await expect(typewriter.locator('.atelier-type-source').first()).toBeVisible();
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
    await expect(fallback.getByRole('heading', { level: 1 })).toContainText('The world of auto parts');
    await fallback.locator('#quick-search-input').fill('filter');
    await fallback.locator('.titanium-quick-search-submit').click();
    await expect(fallback).toHaveURL(/\/en\/parts\?q=filter/);
  } finally { await noJs.close(); }
});
