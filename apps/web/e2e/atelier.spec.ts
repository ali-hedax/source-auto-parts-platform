import { expect, test } from '@playwright/test';

test('atelier remains readable and contained in both directions and four viewports', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const locale of ['fa', 'en']) for (const width of [390, 768, 1366, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/${locale}`);
    const banner = page.locator('.atelier-banner');
    await expect(banner).toBeVisible();
    await expect(page.locator('.titanium-opening-film')).toHaveCount(0);
    const positions = await page.evaluate(() => ({logo:document.querySelector('.titanium-logo')!.getBoundingClientRect().left, controls:document.querySelector('.titanium-header-controls')!.getBoundingClientRect().right, source:document.querySelector('.titanium-sourcing')!.getBoundingClientRect().width}));
    expect(positions.logo).toBeGreaterThanOrEqual(positions.controls);
    expect(Math.round(positions.source)).toBe(width);
    expect(await page.locator('.titanium-sourcing').evaluate(el => Boolean(el.nextElementSibling?.querySelector('details')))).toBe(true);
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

test('centred wordmark and complete full-width hero on laptop and mobile', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const locale of ['fa', 'en']) for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1024, 600], [1280, 720], [1366, 768], [1920, 1080]]) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto(`/${locale}`);
    await page.evaluate(() => document.fonts.ready);
    const logo = page.locator('.titanium-logo');
    await expect(logo.locator('.header-wordmark-signature')).toHaveText('by HEDAX');
    const geometry = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const logo = box('.titanium-logo');
      const signature = box('.header-wordmark-signature');
      const controls = box('.titanium-header-controls');
      const banner = box('.atelier-banner');
      const image = document.querySelector<HTMLImageElement>('.atelier-banner-media img')!;
      return {
        centre: (logo.left + logo.right) / 2,
        signatureCentre: (signature.left + signature.right) / 2,
        controlsRight: controls.right, logoLeft: logo.left,
        signatureSize: parseFloat(getComputedStyle(document.querySelector('.header-wordmark-signature')!).fontSize),
        bannerWidth: banner.width, bannerLeft: banner.left, bannerBottom: banner.bottom,
        imageRatio: box('.atelier-banner-media').width / box('.atelier-banner-media').height,
        copyInside: box('.titanium-hero').bottom <= banner.bottom,
        imageReady: image.complete && image.naturalWidth > 0, imageAlt: image.alt,
        navSize: parseFloat(getComputedStyle(document.querySelector('.titanium-desktop-nav nav a') ?? document.body).fontSize),
        fit: getComputedStyle(image).objectFit, overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    expect(Math.abs(geometry.centre - width! / 2)).toBeLessThan(1);
    expect(Math.abs(geometry.signatureCentre - geometry.centre)).toBeLessThan(1);
    expect(geometry.signatureSize).toBeGreaterThanOrEqual(14);
    expect(geometry.controlsRight).toBeLessThanOrEqual(geometry.logoLeft);
    expect(geometry.bannerWidth).toBeCloseTo(width!, 0);
    expect(geometry.bannerLeft).toBeCloseTo(0, 0);
    await expect(page.locator('.atelier-banner-media img')).toHaveAttribute('src', /hero-parts/);
    await expect.poll(() => page.locator('.atelier-banner-media img').evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    expect(geometry.imageAlt).not.toMatch(/A car and|خودرو و قطعات/);
    expect(geometry.imageRatio).toBeCloseTo(16 / 9, 2);
    expect(geometry.fit).toBe('contain');
    expect(geometry.overflow).toBe(0);
    if (width! >= 900) {
      expect(geometry.bannerBottom).toBeLessThanOrEqual(height! - 8);
      expect(geometry.copyInside).toBe(true);
      expect(geometry.navSize).toBeGreaterThanOrEqual(width! >= 1200 ? 17 : 16);
    }
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
  // Whole copy is always accessible; visual text continuously erases after completion.
  // Capture all three lines in the same sample so a normal erase tick cannot race assertions.
  await expect.poll(() => lines.allTextContents(), { timeout: 15000, intervals: [25] }).toEqual(['دنیای قطعات خودرو', 'هوشمندتر از همیشه', 'Smarter Parts. Better Driving.']);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(typewriter).toHaveAttribute('data-typing', 'false');
  await expect(typewriter.locator('.atelier-type-source').first()).toBeVisible();
});

test('hero keeps typing and erasing across multiple cycles without holds or a blank reset', async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.install();
  await page.goto('/fa');
  const root = page.locator('.atelier-typewriter');
  await expect(root).toHaveAttribute('data-typing', 'true');
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const lines = root.locator('.atelier-type-render');
  const total = await root.locator('.atelier-type-source').evaluateAll(els => {
    const s = new Intl.Segmenter('fa', { granularity: 'grapheme' });
    return els.reduce((n, el) => n + [...s.segment(el.textContent ?? '')].length, 0);
  });
  const readCount = () => lines.evaluateAll(els => {
    const s = new Intl.Segmenter('fa', { granularity: 'grapheme' });
    return els.reduce((n, el) => n + [...s.segment(el.textContent ?? '')].length, 0);
  });
  let previous = await readCount();
  let completions = 0;
  for (let tick = 0; tick < total * 4; tick++) {
    await page.clock.runFor(72);
    const current = await readCount();
    expect(Math.abs(current - previous)).toBe(1);
    expect(current).toBeGreaterThan(0);
    if (current === total) completions++;
    previous = current;
  }
  expect(completions).toBeGreaterThanOrEqual(2);
  await root.getByRole('button', { name: 'توقف جلوه‌ها', exact: true }).click();
  const paused = await lines.allTextContents();
  await page.clock.runFor(1000);
  expect(await lines.allTextContents()).toEqual(paused);
  await root.getByRole('button', { name: 'ادامهٔ جلوه‌ها', exact: true }).click();
  await page.clock.runFor(72);
  expect(await lines.allTextContents()).not.toEqual(paused);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(root).toHaveAttribute('data-typing', 'false');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('دنیای قطعات خودرو');
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
