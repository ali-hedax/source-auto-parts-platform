import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PolicyPage } from '@/components/content/policy-page';

const TOPICS = {
  buying: { kind: 'TERMS', title: 'pages.buyingTitle', intro: 'pages.buyingBody' },
  sourcing: { kind: 'SOURCING', title: 'pages.sourcingTitle', intro: 'pages.sourcingBody' },
  shipping: { kind: 'SHIPPING', title: 'footer.shipping', intro: null },
  returns: { kind: 'RETURNS', title: 'footer.returns', intro: null },
} as const;

export function generateStaticParams() {
  return Object.keys(TOPICS).map((topic) => ({ topic }));
}

export default async function HelpPage({ params }: { params: Promise<{ locale: string; topic: string }> }) {
  const { locale, topic } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const def = TOPICS[topic as keyof typeof TOPICS];
  if (!def) notFound();
  // Buying guide explains the flow; the binding rules still come from the published policy.
  return <PolicyPage kind={def.kind} fallbackTitle={t(def.title)} {...(def.intro ? { intro: t(def.intro) } : {})} />;
}
