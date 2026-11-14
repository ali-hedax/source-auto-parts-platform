// Vazirmatn only, in the three weights the site uses (400, 500, 700). Per-weight files: one @font-face
// per subset with its unicode-range, so a page fetches only the subsets its text needs. Latin text,
// codes and numbers use Vazirmatn's own Latin subset (no second family to download).
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/700.css';
import '../globals.css';
import { localize } from '@hedax/contracts/constants';
import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { routing } from '@/i18n/routing';
import { dataSource, publicSiteUrl } from '@/lib/config';
import { getSiteContent } from '@/lib/site-content';
import { FixtureBanner } from '@/components/layout/fixture-banner';
import { AssistantEntry } from '@/components/chat/assistant-entry';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  // Site title, name, description, browser icon and share image: site content → general / SEO.
  const content = await getSiteContent();
  const siteTitle = localize(content?.brand.siteTitle, locale) || 'Source';
  const siteName = localize(content?.brand.siteName, locale) || 'Source';
  const description = localize(content?.seo.defaultDescription, locale);
  // Share image: the panel's default, otherwise the home hero artwork.
  const shareImage = content?.seo.defaultImageUrl || '/brand/source/atelier/hero-parts.webp';
  const favicon = content?.brand.faviconUrl;
  return {
    metadataBase: new URL(publicSiteUrl()),
    title: { default: siteTitle, template: `%s | ${siteName}` },
    ...(description ? { description } : {}),
    // An uploaded icon replaces the built-in app/favicon.ico and app/icon.png.
    icons: { ...(favicon ? { icon: favicon } : {}), apple: '/apple-touch-icon.png' },
    manifest: '/manifest.webmanifest',
    appleWebApp: { capable: true, title: 'Source', statusBarStyle: 'default' },
    openGraph: { siteName, locale: locale === 'fa' ? 'fa_IR' : 'en_US', type: 'website', images: [shareImage] },
    alternates: { languages: { fa: '/fa', 'x-default': '/fa' } },
    // The development preview is never indexed; the English pages wait until the part names are translated.
    ...(dataSource() === 'fixtures' ? { robots: { index: false, follow: false } } : locale === 'en' ? { robots: { index: false, follow: true } } : {}),
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#fbf8f3',
  // Lets the installed app and notched phones report their safe areas; the page keeps clear of them in CSS.
  viewportFit: 'cover',
};

/**
 * The storefront's browser code needs every namespace except the staff panel's (about a quarter of the
 * messages); the admin layout hands the panel its full set. `admin.noPermission` is shared.
 */
function storefrontMessages(all: AbstractIntlMessages): AbstractIntlMessages {
  const { admin, ...rest } = all as Record<string, AbstractIntlMessages>;
  const noPermission = (admin as Record<string, unknown> | undefined)?.noPermission;
  return { ...rest, admin: typeof noPermission === 'string' ? { noPermission } : {} };
}

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
        <NextIntlClientProvider locale={locale} messages={storefrontMessages(messages)}>
          {dataSource() === 'fixtures' ? <FixtureBanner /> : null}
          {children}
          {/* Above the page layouts, so moving between pages never remounts the guide or restarts its conversation. */}
          <AssistantEntry />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
