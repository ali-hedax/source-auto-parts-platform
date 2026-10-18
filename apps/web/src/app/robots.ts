import type { MetadataRoute } from 'next';
import { dataSource, publicSiteUrl } from '@/lib/config';
import { sitemapPageCount } from '@/lib/sitemap-pages';

export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  if (dataSource() === 'fixtures') return { rules: [{ userAgent: '*', disallow: '/' }] };
  const base = publicSiteUrl();
  const partPages = Math.min(25, await sitemapPageCount());
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Private areas also send noindex; access control is enforced by the API, not by robots.txt.
        disallow: ['/api/', '/fa/account', '/en/account', '/fa/admin', '/en/admin', '/fa/cart', '/en/cart', '/fa/checkout', '/en/checkout', '/fa/payment', '/en/payment', '/fa/staff', '/en/staff', '/fa/login', '/en/login'],
      },
    ],
    sitemap: [`${base}/sitemap.xml`, ...Array.from({ length: partPages }, (_, i) => `${base}/parts-sitemap/sitemap/${i}.xml`)],
  };
}
