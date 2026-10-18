import { localize } from '@hedax/contracts/constants';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getSiteContent, seoMetadata } from '@/lib/site-content';
import { getBuilderData, getPublishedBuilder } from '@/lib/builder-server';
import { BuilderView } from '@/components/builder/view';
import { LegacyHomeView } from '@/components/builder/legacy-home';
import { CatalogHomeSection } from '@/components/catalog/catalog-home';

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
  if (document) return <BuilderView document={document} data={data} locale={locale} />;
  const visible = data.content.home.sections.filter(s => s.visible);
  const blocks = visible.map(section => <LegacyHomeView key={section.id} {...data} content={{ ...data.content!, home: { sections: [section] } }} locale={locale} />);
  blocks.splice(visible.findIndex(s => s.type === 'hero') + 1, 0, <CatalogHomeSection key="technical-catalog" recent={data.catalogRecent} />);
  return <div className="autodoc-inspired-home">{blocks}</div>;
}
