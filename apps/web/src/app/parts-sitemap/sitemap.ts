import type { MetadataRoute } from 'next';
import { apiInternalUrl, dataSource, publicSiteUrl } from '@/lib/config';
import { handleFixture } from '@/lib/fixtures/handler';

export const revalidate = 3600;

/**
 * Every published part (/parts/[slug]), 40,000 per file so a catalog of hundreds of thousands of
 * parts stays under the 50,000-URL limit: /parts-sitemap/sitemap/0.xml, /1.xml … The set of files is
 * fixed when the site is built (the API is not reachable then), so there are always MAX_PAGES of them
 * (up to 1,000,000 parts); unused ones are empty, and robots.txt lists only the ones in use.
 */
const MAX_PAGES = 25;

export function generateSitemaps(): Array<{ id: number }> {
  return Array.from({ length: MAX_PAGES }, (_, id) => ({ id }));
}

export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const page = Number(await props.id) || 0;
  const base = publicSiteUrl();
  let parts: Array<{ slug: string; updatedAt: string }> = [];
  try {
    if (dataSource() === 'fixtures') {
      parts = page === 0 ? ((await handleFixture('GET', '/catalog/sitemap', null, {})).body as typeof parts) : [];
    } else {
      const res = await fetch(`${apiInternalUrl()}/catalog/sitemap?page=${page}`, { next: { revalidate: 3600 } });
      if (res.ok) parts = (await res.json()) as typeof parts;
    }
  } catch {
    parts = [];
  }
  return parts.map((p) => ({
    url: `${base}/fa/parts/${p.slug}`,
    lastModified: p.updatedAt,
    alternates: { languages: { fa: `${base}/fa/parts/${p.slug}`, en: `${base}/en/parts/${p.slug}` } },
  }));
}
