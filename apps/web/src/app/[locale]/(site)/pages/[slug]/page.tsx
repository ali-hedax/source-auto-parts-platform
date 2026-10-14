import { localize } from '@hedax/contracts/constants';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { RichText } from '@/components/content/rich-text';
import { PageHeader } from '@/components/ui/misc';
import { getContentPage } from '@/lib/site-content';

/** Built-in pages have their own addresses (/about, /help/…); they are not served here twice. */
const ownAddress = (slug: string) => slug === 'about' || slug.startsWith('help-');

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const page = ownAddress(slug) ? null : await getContentPage(slug);
  if (!page) return {};
  const description = localize(page.seoDescription, locale);
  return {
    title: localize(page.seoTitle, locale) || localize(page.title, locale),
    ...(description ? { description } : {}),
    alternates: { canonical: `/${locale}/pages/${slug}`, languages: { fa: `/fa/pages/${slug}`, en: `/en/pages/${slug}` } },
  };
}

/** A text page created in the panel (site content → text pages); only published pages are shown. */
export default async function ContentPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const page = ownAddress(slug) ? null : await getContentPage(slug);
  if (!page) notFound();
  return (
    <div className="container-page max-w-3xl py-8">
      <PageHeader title={localize(page.title, locale)} />
      <article className="card p-6 sm:p-8">
        <RichText text={localize(page.body, locale)} />
      </article>
    </div>
  );
}
