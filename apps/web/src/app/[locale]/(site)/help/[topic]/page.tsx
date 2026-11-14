import { localize } from '@hedax/contracts/constants';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RichText } from '@/components/content/rich-text';
import { PolicyPage } from '@/components/content/policy-page';
import { PageHeader } from '@/components/ui/misc';
import { Link } from '@/i18n/navigation';
import { getContentPage } from '@/lib/site-content';

const TOPICS = {
  buying: { kind: null, label: 'footer.buying' },
  sourcing: { kind: 'SOURCING', label: 'footer.sourcing' },
  shipping: { kind: 'SHIPPING', label: 'footer.shipping' },
  returns: { kind: 'RETURNS', label: 'footer.returns' },
} as const;
type Topic = keyof typeof TOPICS;

export function generateStaticParams() {
  return Object.keys(TOPICS).map((topic) => ({ topic }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; topic: string }> }): Promise<Metadata> {
  const { locale, topic } = await params;
  if (!(topic in TOPICS)) return {};
  const t = await getTranslations({ locale });
  const page = await getContentPage(`help-${topic}`).catch(() => null);
  const title = (page ? localize(page.seoTitle, locale) || localize(page.title, locale) : '') || t(`seo.help.${topic as Topic}.title`);
  const description = (page ? localize(page.seoDescription, locale) : '') || t(`seo.help.${topic as Topic}.description`);
  return { title, description, alternates: { canonical: `/${locale}/help/${topic}`, languages: { fa: `/fa/help/${topic}`, en: `/en/help/${topic}` } } };
}

/**
 * Help topics. Shipping, returns and sourcing show their published policy (title and introduction
 * can be edited under site content → text pages, help-…). «راهنمای خرید» has its own page: the
 * text page help-buying when the owner writes one, otherwise the built-in step-by-step guide —
 * never a copy of the terms of sale.
 */
export default async function HelpPage({ params }: { params: Promise<{ locale: string; topic: string }> }) {
  const { locale, topic } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const def = TOPICS[topic as Topic];
  if (!def) notFound();
  const page = await getContentPage(`help-${topic}`);
  const intro = page ? localize(page.body, locale) : '';
  if (def.kind === null) {
    const steps = ['find', 'fit', 'cart', 'pay', 'ship', 'after'] as const;
    return (
      <div className="container-page max-w-3xl py-8 su-guide">
        <PageHeader title={page ? localize(page.title, locale) : t('buyingGuide.title')} description={t('buyingGuide.lede')} />
        {intro ? <RichText text={intro} /> : (
          <ol className="su-guide-steps">
            {steps.map((s, i) => (
              <li key={s} className="su-panel">
                <span aria-hidden>{(i + 1).toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US')}</span>
                <div><h2>{t(`buyingGuide.${s}.title`)}</h2><p>{t(`buyingGuide.${s}.body`)}</p></div>
              </li>
            ))}
          </ol>
        )}
        <p className="su-guide-links">
          <Link href="/help/shipping" className="su-link">{t('footer.shipping')}</Link>
          <Link href="/help/returns" className="su-link">{t('footer.returns')}</Link>
          <Link href="/terms" className="su-link">{t('footer.terms')}</Link>
        </p>
      </div>
    );
  }
  return <PolicyPage kind={def.kind} fallbackTitle={page ? localize(page.title, locale) : t(def.label)} {...(intro ? { intro: <RichText text={intro} /> } : {})} />;
}
