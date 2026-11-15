import { localize } from '@hedax/contracts/constants';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getSiteContent, seoMetadata } from '@/lib/site-content';
import { getBuilderData, getPublishedBuilder } from '@/lib/builder-server';
import type { FinderGroupView } from '@hedax/contracts';
import { serverApi } from '@/lib/api/server';
import { TitaniumHome } from '@/components/store/titanium-home';

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
  return meta.title ? { ...meta, title: { absolute: String(meta.title) } } : meta;
}
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const document = await getPublishedBuilder('home');
  const data = await getBuilderData(document);
  if (!data.content) return null;
  if (!document?.sections.some(b => b.kind === 'vehicle-finder')) data.finderGroups = await serverApi<FinderGroupView[]>('/catalog/vehicle-finder/groups', { publicCache: 60 }).catch(() => []);
  return <TitaniumHome document={document} data={data} locale={locale} />;
}
