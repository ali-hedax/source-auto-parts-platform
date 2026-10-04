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
  try {
    if (dataSource() === 'fixtures') {
      products = (await handleFixture('GET', '/catalog/sitemap', null, {})).body as typeof products;
    } else {
      const res = await fetch(`${apiInternalUrl()}/catalog/sitemap`, { next: { revalidate: 3600 } });
      if (res.ok) products = (await res.json()) as typeof products;
    }
  } catch {
    products = [];
  }
  return [...PUBLIC_PATHS.map((p) => entry(p)), ...products.map((p) => entry(`/parts/${p.slug}`, p.updatedAt))];
}
