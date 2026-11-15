import { localize } from '@hedax/contracts/constants';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getSiteContent, seoMetadata } from '@/lib/site-content';
import { getBuilderData, getPublishedBuilder } from '@/lib/builder-server';
import type { FinderGroupView } from '@hedax/contracts';
import { serverApi } from '@/lib/api/server';
import { TitaniumHome } from '@/components/store/titanium-home';
import { preloadHeadlineFont } from '@/lib/font-preload';
import { publicSiteUrl } from '@/lib/config';
import { canonical, DEFAULT_SHARE_IMAGE, homeJsonLd } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const meta = seoMetadata(await getSiteContent(), 'home', locale);
  const visual = await getPublishedBuilder('home');
  if (visual) {
    const title = localize(visual.title, locale);
    const description = localize(visual.description, locale);
    if (title) meta.title = title;
    if (description) meta.description = description;
    meta.openGraph = { ...meta.openGraph, ...(title ? { title } : {}), ...(description ? { description } : {}) };
  }
  // The hero photo is the share image until one is chosen under site content → SEO.
  if (!meta.openGraph || !('images' in meta.openGraph) || !meta.openGraph.images) meta.openGraph = { ...meta.openGraph, images: [DEFAULT_SHARE_IMAGE] };
  meta.alternates = canonical(locale);
  return meta.title ? { ...meta, title: { absolute: String(meta.title) } } : meta;
}
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  preloadHeadlineFont(locale);
  const document = await getPublishedBuilder('home');
  const data = await getBuilderData(document);
  if (!data.content) return null;
  if (!document?.sections.some(b => b.kind === 'vehicle-finder')) data.finderGroups = await serverApi<FinderGroupView[]>('/catalog/vehicle-finder/groups', { publicCache: 60 }).catch(() => []);
  const c = data.content;
  // Search engines want the number as dialled from abroad: 025-… → +98 25-…, 00… → +….
  const phone = (c.contact.phones[0]?.number || c.contact.channels.phone).trim().replace(/^00/, '+').replace(/^0/, '+98 ');
  const jsonLd = homeJsonLd({
    base: publicSiteUrl(),
    locale,
    name: localize(c.brand.siteName, locale) || 'Source',
    description: localize(c.seo.defaultDescription, locale) || undefined,
    logo: '/brand/source/icon-256.png',
    telephone: phone || undefined,
    email: c.contact.email || undefined,
    address: localize(c.contact.address, locale) || undefined,
    sameAs: c.social.links.filter((l) => l.visible && l.url).map((l) => l.url),
  });
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <TitaniumHome document={document} data={data} locale={locale} />
    </>
  );
}
