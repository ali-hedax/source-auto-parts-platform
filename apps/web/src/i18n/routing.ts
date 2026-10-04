import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['fa', 'en'],
  defaultLocale: 'fa',
  localePrefix: 'always',
  // Persian is the default (spec §1): an address without a prefix opens in Persian, whatever
  // the browser language. Every in-app link carries its prefix, so a chosen language is kept.
  localeDetection: false,
});

export type AppLocale = (typeof routing.locales)[number];
