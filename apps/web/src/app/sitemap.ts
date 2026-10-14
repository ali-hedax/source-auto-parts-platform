import type { MetadataRoute } from 'next';
import { apiInternalUrl, dataSource, publicSiteUrl } from '@/lib/config';
import { handleFixture } from '@/lib/fixtures/handler';

export const revalidate = 3600;

const PUBLIC_PATHS = ['', '/parts', '/imported-parts', '/brands', '/request-part', '/about', '/contact', '/help/buying', '/help/sourcing', '/help/shipping', '/help/returns', '/privacy', '/terms'];

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
  try {
    if (dataSource() === 'fixtures') {
      products = (await handleFixture('GET', '/catalog/sitemap', null, {})).body as typeof products;
      pages = ((await handleFixture('GET', '/site/content', null, {})).body as { footerPages: typeof pages }).footerPages;
    } else {
      const res = await fetch(`${apiInternalUrl()}/catalog/sitemap`, { next: { revalidate: 3600 } });
      if (res.ok) products = (await res.json()) as typeof products;
      const site = await fetch(`${apiInternalUrl()}/site/content`, { next: { revalidate: 3600 } });
      if (site.ok) pages = ((await site.json()) as { footerPages: typeof pages }).footerPages;
    }
  } catch {
    products = [];
  }
  const ownPages = pages.filter((p) => p.slug !== 'about' && !p.slug.startsWith('help-')).map((p) => entry(`/pages/${p.slug}`));
  return [...PUBLIC_PATHS.map((p) => entry(p)), ...ownPages, ...products.map((p) => entry(`/parts/${p.slug}`, p.updatedAt))];
}
