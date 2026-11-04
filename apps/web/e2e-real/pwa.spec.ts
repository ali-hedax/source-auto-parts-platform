import { expect, type Page } from '@playwright/test';
import { test } from './helpers';

/**
 * The installable app on a production build: its service worker only registers there, and only on a secure
 * origin (https or localhost). Point E2E_REAL_BASE_URL at such a server. Touches no order or payment.
 */
const swReady = (page: Page) => page.evaluate(async () => {
  const registration = await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  return { scope: registration.scope, script: registration.active?.scriptURL ?? '' };
});
const storedPaths = (page: Page) => page.evaluate(async () => {
  const out: string[] = [];
  for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) out.push(new URL(request.url).pathname);
  return out;
});

test('the manifest is valid and its real icons load', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.status()).toBe(200);
  const manifest = await res.json() as { id: string; name: string; short_name: string; start_url: string; scope: string; display: string; dir: string; lang: string; theme_color: string; background_color: string; icons: Array<{ src: string; sizes: string; purpose: string; type: string }> };
  expect(manifest).toMatchObject({ id: '/fa', name: 'Source by HEDAX', short_name: 'Source', start_url: '/fa', scope: '/', display: 'standalone', dir: 'rtl', lang: 'fa' });
  for (const size of ['192x192', '512x512']) {
    expect(manifest.icons.some((i) => i.sizes === size && i.purpose === 'any')).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === size && i.purpose === 'maskable')).toBe(true);
  }
  for (const icon of manifest.icons) {
    const file = await request.get(icon.src);
    expect(file.status(), icon.src).toBe(200);
    expect(file.headers()['content-type']).toContain('image/png');
    // The PNG header holds its real dimensions.
    const body = await file.body();
    expect(`${body.readUInt32BE(16)}x${body.readUInt32BE(20)}`, icon.src).toBe(icon.sizes);
  }
  expect((await request.get('/apple-touch-icon.png')).status()).toBe(200);
  const start = await request.get(manifest.start_url);
  expect(start.status()).toBe(200);
});

test('the page links the manifest and the iOS icon, and the browser sees nothing stopping installation', async ({ page, context }) => {
  await page.goto('/fa');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest/);
  await expect(page.locator('link[rel="apple-touch-icon"]').first()).toHaveAttribute('href', '/apple-touch-icon.png');
  await swReady(page);
  const cdp = await context.newCDPSession(page);
  const manifest = await cdp.send('Page.getAppManifest') as { url: string; errors: unknown[] };
  expect(manifest.url).toContain('/manifest.webmanifest');
  expect(manifest.errors).toEqual([]);
  const installability = await cdp.send('Page.getInstallabilityErrors') as { installabilityErrors: Array<{ errorId: string }> };
  // Test browsers run in a private window, where no browser offers installation; nothing else may stand in the way.
  expect(installability.installabilityErrors.map((e) => e.errorId).filter((id) => id !== 'in-incognito')).toEqual([]);
});

test('the worker file is always asked for afresh', async ({ request }) => {
  const res = await request.get('/sw.js');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('javascript');
  expect(res.headers()['cache-control']).toContain('no-cache');
});

test('only public files are ever stored, after browsing, the cart, sign-in and checkout', async ({ page }) => {
  await page.goto('/fa');
  await swReady(page);
  await page.goto(`/fa/parts?q=${encodeURIComponent('فیلتر روغن')}`);
  await page.getByRole('link', { name: /فیلتر روغن سمند/ }).first().click();
  await expect(page).toHaveURL(/\/fa\/parts\/demo-/);
  await page.getByRole('button', { name: 'افزودن به سبد' }).click();
  await expect(page.getByText(/به سبد اضافه شد/)).toBeVisible();
  await page.goto('/fa/cart');
  await page.goto('/fa/checkout');
  await page.goto('/fa/login');
  await page.goto('/fa/account');
  const stored = await storedPaths(page);
  expect(stored.length).toBeGreaterThan(1);
  const allowed = /^\/(?:_next\/static\/|fonts\/|brand\/|icons\/|offline\.html$)/;
  expect(stored.filter((path) => !allowed.test(path)), 'pages, API answers, carts and accounts are never stored').toEqual([]);
  expect(stored.some((path) => path.startsWith('/api/'))).toBe(false);
});

test('offline: a useful page with a retry, no old page and no false success; back online it works again', async ({ page, context }) => {
  await page.goto('/fa/parts');
  await swReady(page);
  await context.setOffline(true);
  for (const path of ['/fa/parts', '/fa/cart', '/fa/checkout', '/fa/payment/result']) {
    await page.goto(path);
    expect(new URL(page.url()).pathname, 'the page asked for stays the page shown').toBe(path);
    await expect(page.locator('img')).toHaveJSProperty('naturalWidth', 192);
    await expect(page.getByRole('heading', { name: 'اتصال اینترنت برقرار نیست' }), path).toBeVisible();
    await expect(page.getByText('پرداخت و ثبت سفارش فقط با اینترنت انجام می‌شوند.')).toBeVisible();
    // No price, no order, no payment result.
    await expect(page.locator('body')).not.toContainText('ریال');
    await expect(page.locator('body')).not.toContainText('پرداخت تأیید شد');
  }
  await page.goto('/en/parts');
  expect(new URL(page.url()).pathname).toBe('/en/parts');
  await expect(page.getByRole('heading', { name: 'No internet connection' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.goto('/fa/parts');
  await context.setOffline(false);
  await page.getByRole('button', { name: 'تلاش دوباره' }).click();
  await expect(page.getByRole('heading', { name: 'قطعات موجود' })).toBeVisible();
});

test('a checkout request made offline fails in the open; nothing pretends it worked', async ({ page, context }) => {
  await page.goto('/fa/parts');
  await swReady(page);
  await context.setOffline(true);
  const failed = await page.evaluate(() => fetch('/api/v1/checkout?locale=fa', { method: 'POST', body: '{}' }).then(() => false, () => true));
  expect(failed).toBe(true);
  await context.setOffline(false);
});

test('a new version takes over without reloading the page or touching the cart, and clears old caches', async ({ page }) => {
  await page.goto(`/fa/parts?q=${encodeURIComponent('فیلتر روغن')}`);
  await swReady(page);
  await page.getByRole('link', { name: /فیلتر روغن سمند/ }).first().click();
  await expect(page).toHaveURL(/\/fa\/parts\/demo-/);
  await page.getByRole('button', { name: 'افزودن به سبد' }).click();
  await expect(page.getByText(/به سبد اضافه شد/)).toBeVisible();
  const count = await page.locator('[data-cart-badge]').innerText();
  await page.locator('#qty').fill('3');

  // A worker at another address installs and activates as a new version does; a cache from an older one is left waiting.
  const result = await page.evaluate(async () => {
    (window as unknown as { sameDocument: boolean }).sameDocument = true;
    await caches.open('source-static-v0');
    const changed = new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    await navigator.serviceWorker.register('/sw.js?next=1', { scope: '/', updateViaCache: 'none' });
    await Promise.race([changed, new Promise((resolve) => setTimeout(resolve, 15000))]);
    return { script: navigator.serviceWorker.controller?.scriptURL ?? '', same: (window as unknown as { sameDocument?: boolean }).sameDocument === true };
  });
  expect(result.script).toContain('next=1');
  expect(result.same, 'the page was not reloaded').toBe(true);
  // The old cache goes while the new worker activates, a moment after it takes control.
  await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain('source-static-v0');
  expect(await page.evaluate(() => caches.keys())).toContain('source-static-v1');
  await expect(page.locator('#qty'), 'what was typed is still there').toHaveValue('3');
  await expect(page.locator('[data-cart-badge]')).toHaveText(count);
  await page.reload();
  await expect(page.locator('[data-cart-badge]')).toHaveText(count);
});
