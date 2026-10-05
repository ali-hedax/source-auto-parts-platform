// Per-weight files: one @font-face per subset with its unicode-range, so a page fetches only the
// subsets its text needs, all at once. (The per-subset files declare no range: the Latin face then
// claimed every character and the Arabic file was requested only after it had arrived.)
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/700.css';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import '../globals.css';
import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { routing } from '@/i18n/routing';
import { dataSource, publicSiteUrl } from '@/lib/config';
import { FixtureBanner } from '@/components/layout/fixture-banner';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    metadataBase: new URL(publicSiteUrl()),
    title: { default: t('siteTitle'), template: `%s | ${locale === 'fa' ? 'سورس' : 'Source'}` },
    description: t('siteDescription'),
    alternates: { languages: { fa: '/fa', en: '/en', 'x-default': '/fa' } },
    // The development preview must never be indexed.
    ...(dataSource() === 'fixtures' ? { robots: { index: false, follow: false } } : {}),
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1A202C',
};

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  const t = await getTranslations({ locale, namespace: 'common' });
  return (
    <html lang={locale} dir={locale === 'fa' ? 'rtl' : 'ltr'}>
      <body className="min-h-screen bg-white antialiased">
        <a href="#main" className="skip-link">
          {t('skipToContent')}
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {dataSource() === 'fixtures' ? <FixtureBanner /> : null}
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
