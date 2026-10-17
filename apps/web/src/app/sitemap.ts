import type { MetadataRoute } from 'next';
import { apiInternalUrl, dataSource, publicSiteUrl } from '@/lib/config';
import { handleFixture } from '@/lib/fixtures/handler';

export const revalidate = 3600;

const PUBLIC_PATHS = ['', '/parts', '/imported-parts', '/brands', '/cars', '/catalog', '/request-part', '/about', '/contact', '/help/buying', '/help/sourcing', '/help/shipping', '/help/returns', '/privacy', '/terms'];

/** Public pages only; account, admin, cart, checkout and payment pages are never listed (spec §15). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicSiteUrl();
  const entry = (path: string, lastModified?: string): MetadataRoute.Sitemap[number] => ({
    url: `${base}/fa${path}`,
    ...(lastModified ? { lastModified } : {}),
    alternates: { languages: { fa: `${base}/fa${path}`, en: `${base}/en${path}` } },
  });
  let products: Array<{ slug: string; updatedAt: string }> = [];
  // Pages the owner added in the panel (site content → text pages, shown in the footer).
  let pages: Array<{ slug: string }> = [];
  // Vehicle pages (/cars/[slug]) of the active vehicles.
  let vehicles: Array<{ slug: string }> = [];
  // Published parts of the technical catalog (/catalog/[slug]).
  let catalog: Array<{ slug: string; updatedAt: string }> = [];
  try {
    if (dataSource() === 'fixtures') {
      products = (await handleFixture('GET', '/catalog/sitemap', null, {})).body as typeof products;
      pages = ((await handleFixture('GET', '/site/content', null, {})).body as { footerPages: typeof pages }).footerPages;
      vehicles = (await handleFixture('GET', '/catalog/vehicles', null, {})).body as typeof vehicles;
      catalog = (await handleFixture('GET', '/catalog/entries/sitemap', null, {})).body as typeof catalog;
    } else {
      const res = await fetch(`${apiInternalUrl()}/catalog/sitemap`, { next: { revalidate: 3600 } });
      if (res.ok) products = (await res.json()) as typeof products;
      const site = await fetch(`${apiInternalUrl()}/site/content`, { next: { revalidate: 3600 } });
      if (site.ok) pages = ((await site.json()) as { footerPages: typeof pages }).footerPages;
      const cars = await fetch(`${apiInternalUrl()}/catalog/vehicles`, { next: { revalidate: 3600 } });
      if (cars.ok) vehicles = (await cars.json()) as typeof vehicles;
      const entries = await fetch(`${apiInternalUrl()}/catalog/entries/sitemap`, { next: { revalidate: 3600 } });
      if (entries.ok) catalog = (await entries.json()) as typeof catalog;
    }
  } catch {
    products = [];
  }
  const ownPages = pages.filter((p) => p.slug !== 'about' && !p.slug.startsWith('help-')).map((p) => entry(`/pages/${p.slug}`));
  return [...PUBLIC_PATHS.map((p) => entry(p)), ...ownPages, ...vehicles.map((v) => entry(`/cars/${v.slug}`)), ...products.map((p) => entry(`/parts/${p.slug}`, p.updatedAt)), ...catalog.map((c) => entry(`/catalog/${c.slug}`, c.updatedAt))];
}
