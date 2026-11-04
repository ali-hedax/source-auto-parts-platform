import type { MetadataRoute } from 'next';

/** Installable app. Scope `/` keeps both languages and every internal link inside the app; it opens in Persian. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/fa',
    name: 'Source by HEDAX',
    short_name: 'Source',
    description: 'سورس؛ جست‌وجو، خرید و تأمین قطعات خودرو',
    lang: 'fa',
    dir: 'rtl',
    start_url: '/fa',
    scope: '/',
    display: 'standalone',
    background_color: '#f5f0e8',
    theme_color: '#f5f0e8',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
