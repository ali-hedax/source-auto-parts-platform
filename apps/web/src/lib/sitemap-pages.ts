import { apiInternalUrl, dataSource } from '@/lib/config';
import { handleFixture } from '@/lib/fixtures/handler';

/** How many part sitemap files there are (40,000 parts each; at least one). */
export async function sitemapPageCount(): Promise<number> {
  try {
    if (dataSource() === 'fixtures') return ((await handleFixture('GET', '/catalog/sitemap/pages', null, {})).body as { pages: number }).pages;
    const res = await fetch(`${apiInternalUrl()}/catalog/sitemap/pages`, { next: { revalidate: 3600 } });
    return res.ok ? Math.max(1, ((await res.json()) as { pages: number }).pages) : 1;
  } catch {
    return 1;
  }
}
