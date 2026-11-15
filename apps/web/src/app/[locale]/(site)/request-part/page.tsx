import type { VehicleBrandView } from '@hedax/contracts';
import { localize } from '@hedax/contracts/constants';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { ChapterBand } from '@/components/store/chapter-band';
import { RequestForm } from '@/components/sourcing/request-form';
import { serverApi } from '@/lib/api/server';
import { getSiteContent, seoMetadata } from '@/lib/site-content';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return { ...seoMetadata(await getSiteContent(), 'requestPart', locale, t('request.title')), alternates: { canonical: `/${locale}/request-part`, languages: { fa: '/fa/request-part', en: '/en/request-part' } } };
}

export default async function RequestPartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const [brands, content] = await Promise.all([serverApi<VehicleBrandView[]>('/catalog/vehicle-brands', { publicCache: 300 }).catch(() => []), getSiteContent()]);
  // The same process steps as on the home page (site content → home page → first section).
  const hero = content?.home.sections.find((s) => s.type === 'hero');
  const processTitle = hero?.type === 'hero' ? localize(hero.processTitle, locale) : '';
  const steps = hero?.type === 'hero' ? hero.steps.map((s) => localize(s.title, locale)) : [];
  return (
    <div className="store-page">
      <ChapterBand title={t('request.title')} eyebrow="SOURCE · SOURCING" description={t('request.intro')} locale={locale} />
      <div className="container-page grid gap-8 pb-10 lg:grid-cols-[minmax(0,50rem)_17rem] lg:justify-between">
        <div className="store-card min-w-0 p-5 sm:p-7">
          <Suspense>
            <RequestForm brands={brands} />
          </Suspense>
        </div>
        {/* What happens after submitting, kept beside the form on wide screens (the intro says it in short on phones). */}
        {steps.length ? <aside aria-labelledby="request-steps-title" className="hidden lg:block">
          <div className="store-card sticky top-32 p-5">
            <h2 id="request-steps-title" className="mb-4 font-bold">{processTitle}</h2>
            <ol className="flex flex-col gap-3">
              {steps.map((s, i) => (
                <li key={`${i}-${s}`} className="flex items-start gap-3 text-sm leading-6">
                  <span aria-hidden className="num grid size-6 shrink-0 place-items-center rounded-full bg-stage text-xs font-bold text-white">{(i + 1).toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US')}</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        </aside> : null}
      </div>
    </div>
  );
}
