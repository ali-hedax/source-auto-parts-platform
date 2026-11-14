import { localize, resolveContactChannels } from '@hedax/contracts/constants';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getSiteContent, seoMetadata } from '@/lib/site-content';
import { getBuilderData, getPublishedBuilder } from '@/lib/builder-server';
import type { FinderGroupView, SiteContentView } from '@hedax/contracts';
import { serverApi } from '@/lib/api/server';
import { publicSiteUrl } from '@/lib/config';
import { internationalDigits } from '@/lib/contact-format';
import { SourceHome } from '@/components/store/source-home';

const HERO_SHARE_IMAGE = '/brand/source/atelier/hero-parts.webp';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const content = await getSiteContent();
  const meta = seoMetadata(content, 'home', locale);
  const visual = await getPublishedBuilder('home');
  if (visual) {
    const title = localize(visual.title, locale);
    const description = localize(visual.description, locale);
    if (title) meta.title = title;
    if (description) meta.description = description;
  }
  // Share card: the panel's home image, the site default, or the hero artwork.
  const image = content?.seo.pages.home?.imageUrl || content?.seo.defaultImageUrl || HERO_SHARE_IMAGE;
  meta.openGraph = { ...meta.openGraph, type: 'website', url: `/${locale}`, images: [{ url: image }], ...(meta.title ? { title: String(meta.title) } : {}), ...(meta.description ? { description: meta.description } : {}) };
  meta.alternates = { canonical: `/${locale}`, languages: { fa: '/fa', 'x-default': '/fa' } };
  return meta.title ? { ...meta, title: { absolute: String(meta.title) } } : meta;
}

/** Organization and WebSite (with the part search) for search engines; contact details come from the panel. */
function structuredData(content: SiteContentView, locale: string) {
  const base = publicSiteUrl();
  const ch = resolveContactChannels(content.contact, content.social.links);
  const sameAs = [ch.instagram, ch.telegram, ch.bale].filter(Boolean).map((v) => (/^https:/i.test(v) ? v : ''));
  return [
    {
      '@context': 'https://schema.org', '@type': 'Organization', '@id': `${base}/#organization`,
      name: localize(content.brand.siteName, locale) || 'Source', alternateName: 'Source by HEDAX', url: `${base}/${locale}`,
      logo: `${base}/brand/source/atelier/logo.webp`,
      ...(content.contact.email ? { email: content.contact.email } : {}),
      ...(ch.phone ? { telephone: `+${internationalDigits(ch.phone)}` } : {}),
      ...(sameAs.filter(Boolean).length ? { sameAs: sameAs.filter(Boolean) } : {}),
      ...(ch.phone || ch.mobile ? { contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer service', telephone: `+${internationalDigits(ch.phone || ch.mobile)}`, areaServed: 'IR', availableLanguage: ['fa'] }] } : {}),
    },
    {
      '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${base}/#website`, url: `${base}/${locale}`,
      name: localize(content.brand.siteName, locale) || 'Source', inLanguage: locale === 'fa' ? 'fa-IR' : 'en', publisher: { '@id': `${base}/#organization` },
      potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${base}/${locale}/parts?q={search_term_string}` }, 'query-input': 'required name=search_term_string' },
    },
  ];
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const document = await getPublishedBuilder('home');
  const data = await getBuilderData(document);
  if (!data.content) return null;
  if (!document?.sections.some(b => b.kind === 'vehicle-finder')) data.finderGroups = await serverApi<FinderGroupView[]>('/catalog/vehicle-finder/groups', { publicCache: 60 }).catch(() => []);
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(data.content, locale)).replace(/</g, '\\u003c') }} />
    <SourceHome document={document} data={data} locale={locale} />
  </>;
}
