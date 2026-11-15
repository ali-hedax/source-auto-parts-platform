import { DEFAULT_ASSISTANT_SETTINGS } from '@hedax/contracts/constants';
import { expect, test, type Page } from '@playwright/test';

/**
 * 2026-11-15: Hexi clear of the copyright line on desktop, lighter catalog pages (the vehicle filter
 * carries only what it shows; storefront pages carry no admin texts), and each public page's own
 * search-engine title, description and canonical address, with no language alternates while /en is
 * not indexed. Font preloads and the CDN cache header need the production build and Caddy, so they
 * are checked on the live site after release.
 */
const withHexi = (page: Page, placement: 'start' | 'end') =>
  page.route('**/api/v1/site/assistant?**', (route) => route.fulfill({ json: { ...DEFAULT_ASSISTANT_SETTINGS, enabled: true, placement, mobileSize: 80, desktopSize: 128 } }));

test.describe('Hexi and the copyright line', () => {
  for (const width of [1024, 1280, 1440, 1699]) {
    for (const placement of ['start', 'end'] as const) {
      test(`${width}px, Hexi at the ${placement}: the copyright line is never under him`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await withHexi(page, placement);
        await page.goto('/fa');
        await expect(page.locator('.assistant-dock')).toBeVisible();
        await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
        const copyright = page.locator('.titanium-copyright p');
        await expect(copyright).toBeVisible();
        const r = await page.evaluate(() => {
          const d = document.querySelector('.assistant-dock')!.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(document.querySelector('.titanium-copyright p')!);
          const t = range.getBoundingClientRect();
          return { overlapX: Math.min(d.right, t.right) - Math.max(d.left, t.left), overlapY: Math.min(d.bottom, t.bottom) - Math.max(d.top, t.top), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        });
        expect(r.overlapX > 0 && r.overlapY > 0, JSON.stringify(r)).toBe(false);
        expect(r.overflow).toBeLessThanOrEqual(0);
      });
    }
  }
});

test.describe('lighter pages', () => {
  test('the vehicle filter still lists every vehicle, and the chosen one\'s models', async ({ page }) => {
    const vehicles = await (await page.request.get('/api/v1/catalog/vehicles')).json() as Array<{ slug: string; models: Array<{ slug: string }> }>;
    await page.goto('/fa/parts');
    const select = page.locator('#filter-vehicle');
    await expect(select.locator('option')).toHaveCount(vehicles.length + 1);
    const withModels = vehicles.find((v) => v.models.length > 0);
    test.skip(!withModels, 'no vehicle with models in the sample data');
    await page.goto(`/fa/parts?vehicle=${withModels!.slug}`);
    await expect(page.locator('#filter-model option')).toHaveCount(withModels!.models.length + 1);
  });

  test('a storefront page carries no admin texts; the panel still has them', async ({ page }) => {
    const html = await (await page.request.get('/fa/parts')).text();
    // One of the panel's own labels, never used on the storefront.
    expect(html).not.toContain('auditAction_catalog_document_updated');
    expect(html).toContain('noPermission');
  });
});

test.describe('search engines', () => {
  const head = async (page: Page, path: string) => {
    await page.goto(path);
    return page.evaluate(() => ({
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '',
      alternates: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => l.getAttribute('hreflang')),
      ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? '',
      jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent ?? ''),
    }));
  };

  test('home: canonical, a share image, and Organization + WebSite data', async ({ page }) => {
    const h = await head(page, '/fa');
    expect(h.canonical).toMatch(/\/fa$/);
    expect(h.alternates).toEqual([]);
    expect(h.ogImage).not.toBe('');
    const graph = h.jsonLd.map((j) => JSON.parse(j) as { '@graph'?: Array<{ '@type': string; potentialAction?: { target: { urlTemplate: string } } }> }).flatMap((j) => j['@graph'] ?? []);
    expect(graph.map((g) => g['@type']).sort()).toEqual(['Organization', 'WebSite']);
    expect(graph.find((g) => g['@type'] === 'WebSite')!.potentialAction!.target.urlTemplate).toMatch(/\/fa\/parts\?q=\{search_term_string\}$/);
  });

  test('a product page names its own photo as the share image', async ({ page }) => {
    const products = await (await page.request.get('/api/v1/catalog/products?pageSize=24')).json() as { items: Array<{ slug: string; primaryImage: { url: string } | null }> };
    const withPhoto = products.items.find((p) => p.primaryImage);
    test.skip(!withPhoto, 'no sample product with a photo');
    const h = await head(page, `/fa/parts/${withPhoto!.slug}`);
    expect(h.canonical).toMatch(new RegExp(`/fa/parts/${withPhoto!.slug}$`));
    expect(h.ogImage).toContain(withPhoto!.primaryImage!.url.split('?')[0]!);
    expect(h.alternates).toEqual([]);
  });

  for (const [path, canonicalEnd] of [
    ['/fa/brands', '/fa/brands'],
    ['/fa/help/shipping', '/fa/help/shipping'],
    ['/fa/help/returns', '/fa/help/returns'],
    ['/fa/terms', '/fa/terms'],
    ['/fa/privacy', '/fa/privacy'],
    ['/fa/about', '/fa/about'],
    ['/fa/contact', '/fa/contact'],
  ] as const) {
    test(`${path}: its own title and canonical, no language alternates`, async ({ page }) => {
      const home = await head(page, '/fa');
      const h = await head(page, path);
      expect(h.canonical.endsWith(canonicalEnd), h.canonical).toBe(true);
      expect(h.title).not.toBe(home.title);
      expect(h.alternates).toEqual([]);
    });
  }

  test('a brand page: its own title, description and canonical', async ({ page }) => {
    const brands = await (await page.request.get('/api/v1/catalog/vehicle-brands')).json() as Array<{ slug: string; name: { fa: string } }>;
    const b = brands[0]!;
    const h = await head(page, `/fa/brands/${b.slug}`);
    expect(h.title).toContain(`قطعات یدکی ${b.name.fa}`);
    expect(h.description).toContain(b.name.fa);
    expect(h.canonical).toMatch(new RegExp(`/fa/brands/${b.slug}$`));
  });

  test('the sitemaps list no English addresses', async ({ page }) => {
    const main = await (await page.request.get('/sitemap.xml')).text();
    expect(main).toContain('/fa');
    expect(main).not.toContain('/en');
    const parts = await (await page.request.get('/parts-sitemap/sitemap/0.xml')).text();
    expect(parts).not.toContain('/en/');
  });
});

test.describe('font preloads', () => {
  test('the first-screen fonts are preloaded from the head, and each one is a font the page then uses', async ({ page }) => {
    await page.goto('/fa');
    const r = await page.evaluate(async () => {
      await document.fonts.ready;
      const head = [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="font"]')].map((l) => new URL(l.href).pathname);
      const used = performance.getEntriesByType('resource').map((e) => new URL(e.name).pathname).filter((p) => p.endsWith('.woff2'));
      return { head, used };
    });
    expect(r.head).toContain('/fonts/atelier/vazir-code.woff2');
    expect(r.head.some((p) => /vazirmatn-arabic-400-normal\.[^/]+\.woff2$/.test(p))).toBe(true);
    // A preload the page never uses costs a download and a console warning.
    for (const href of r.head) expect(r.used, href).toContain(href);
    expect(new Set(r.used.filter((p) => r.head.includes(p))).size).toBe(r.head.length);
  });
});
