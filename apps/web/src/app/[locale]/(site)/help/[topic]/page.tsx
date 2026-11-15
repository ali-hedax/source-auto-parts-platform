import { localize } from '@hedax/contracts/constants';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RichText } from '@/components/content/rich-text';
import type { Metadata } from 'next';
import { PolicyPage, policyMetadata } from '@/components/content/policy-page';
import { getContentPage } from '@/lib/site-content';

const TOPICS = {
  buying: { kind: 'TERMS', label: 'footer.buying' },
  sourcing: { kind: 'SOURCING', label: 'footer.sourcing' },
  shipping: { kind: 'SHIPPING', label: 'footer.shipping' },
  returns: { kind: 'RETURNS', label: 'footer.returns' },
} as const;

export function generateStaticParams() {
  return Object.keys(TOPICS).map((topic) => ({ topic }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; topic: string }> }): Promise<Metadata> {
  const { locale, topic } = await params;
  const def = TOPICS[topic as keyof typeof TOPICS];
  if (!def) return {};
  const t = await getTranslations({ locale });
  const page = await getContentPage(`help-${topic}`);
  // The help page's own SEO fields from the panel win; then its title and introduction.
  const meta = await policyMetadata(def.kind, locale, `/help/${topic}`, page ? localize(page.title, locale) : t(def.label), page ? localize(page.body, locale) : undefined);
  const seoTitle = page ? localize(page.seoTitle, locale) : '';
  const seoDescription = page ? localize(page.seoDescription, locale) : '';
  return { ...meta, ...(seoTitle ? { title: seoTitle } : {}), ...(seoDescription ? { description: seoDescription } : {}) };
}

/**
 * Help topic: its title and introduction are edited under site content → text pages (help-…);
 * the binding rules below still come from the published policy.
 */
export default async function HelpPage({ params }: { params: Promise<{ locale: string; topic: string }> }) {
  const { locale, topic } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const def = TOPICS[topic as keyof typeof TOPICS];
  if (!def) notFound();
  const page = await getContentPage(`help-${topic}`);
  const intro = page ? localize(page.body, locale) : '';
  return <PolicyPage kind={def.kind} fallbackTitle={page ? localize(page.title, locale) : t(def.label)} {...(intro ? { intro: <RichText text={intro} /> } : {})} />;
}
