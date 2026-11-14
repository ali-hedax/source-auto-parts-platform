import type { MetadataRoute } from 'next';
import { apiInternalUrl, dataSource, publicSiteUrl } from '@/lib/config';
import { handleFixture } from '@/lib/fixtures/handler';

export const revalidate = 3600;

const PUBLIC_PATHS = ['', '/parts', '/imported-parts', '/brands', '/cars', '/request-part', '/about', '/contact', '/help/buying', '/help/sourcing', '/help/shipping', '/help/returns', '/privacy', '/terms'];

/**
 * Public pages only; account, admin, cart, checkout and payment pages are never listed (spec §15).
 * The parts themselves are in the paged part sitemaps (app/parts-sitemap), listed in robots.txt.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicSiteUrl();
  const entry = (path: string, lastModified?: string): MetadataRoute.Sitemap[number] => ({
    url: `${base}/fa${path}`,
    ...(lastModified ? { lastModified } : {}),
    alternates: { languages: { fa: `${base}/fa${path}`, en: `${base}/en${path}` } },
  });
  // Pages the owner added in the panel (site content → text pages, shown in the footer).
  let pages: Array<{ slug: string }> = [];
  // Vehicle pages (/cars/[slug]) of the active vehicles.
  let vehicles: Array<{ slug: string }> = [];
  try {
    if (dataSource() === 'fixtures') {
      pages = ((await handleFixture('GET', '/site/content', null, {})).body as { footerPages: typeof pages }).footerPages;
      vehicles = (await handleFixture('GET', '/catalog/vehicles', null, {})).body as typeof vehicles;
    } else {
      const site = await fetch(`${apiInternalUrl()}/site/content`, { next: { revalidate: 3600 } });
      if (site.ok) pages = ((await site.json()) as { footerPages: typeof pages }).footerPages;
      const cars = await fetch(`${apiInternalUrl()}/catalog/vehicles`, { next: { revalidate: 3600 } });
      if (cars.ok) vehicles = (await cars.json()) as typeof vehicles;
    }
  } catch {
    pages = [];
  }
  const ownPages = pages.filter((p) => p.slug !== 'about' && !p.slug.startsWith('help-')).map((p) => entry(`/pages/${p.slug}`));
  return [...PUBLIC_PATHS.map((p) => entry(p)), ...ownPages, ...vehicles.map((v) => entry(`/cars/${v.slug}`))];
}
