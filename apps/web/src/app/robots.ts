import type { MetadataRoute } from 'next';
import { dataSource, publicSiteUrl } from '@/lib/config';

export default function robots(): MetadataRoute.Robots {
  if (dataSource() === 'fixtures') return { rules: [{ userAgent: '*', disallow: '/' }] };
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Private areas also send noindex; access control is enforced by the API, not by robots.txt.
        disallow: ['/api/', '/fa/account', '/en/account', '/fa/admin', '/en/admin', '/fa/cart', '/en/cart', '/fa/checkout', '/en/checkout', '/fa/payment', '/en/payment', '/fa/staff', '/en/staff', '/fa/login', '/en/login'],
      },
    ],
    sitemap: `${publicSiteUrl()}/sitemap.xml`,
  };
}
