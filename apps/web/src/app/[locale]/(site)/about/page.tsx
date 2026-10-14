import { localize } from '@hedax/contracts/constants';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RichText } from '@/components/content/rich-text';
import { ButtonLink } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/misc';
import { getContentPage, getSiteContent } from '@/lib/site-content';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const page = await getContentPage('about');
  if (!page) return {};
  const description = localize(page.seoDescription, locale);
  return { title: localize(page.seoTitle, locale) || localize(page.title, locale), ...(description ? { description } : {}) };
}

/** «دربارهٔ ما»: text from site content → text pages → about; the tagline from general settings. */
export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const [page, content] = await Promise.all([getContentPage('about'), getSiteContent()]);
  if (!page) notFound();
  const tagline = localize(content?.brand.tagline, locale);
  return (
    <div className="container-page max-w-3xl py-8">
      <PageHeader title={localize(page.title, locale)} {...(tagline ? { description: tagline } : {})} />
      <RichText text={localize(page.body, locale)} />
      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink href="/parts">{t('nav.parts')}</ButtonLink>
        <ButtonLink href="/request-part" variant="secondary">{t('nav.requestPart')}</ButtonLink>
      </div>
    </div>
  );
}
