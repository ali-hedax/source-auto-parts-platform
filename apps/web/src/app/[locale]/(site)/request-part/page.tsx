import type { VehicleBrandView } from '@hedax/contracts';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { PageHeader } from '@/components/ui/misc';
import { RequestForm } from '@/components/sourcing/request-form';
import { serverApi } from '@/lib/api/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return { title: t('request.title'), alternates: { canonical: `/${locale}/request-part`, languages: { fa: '/fa/request-part', en: '/en/request-part' } } };
}

export default async function RequestPartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const brands = await serverApi<VehicleBrandView[]>('/catalog/vehicle-brands', { publicCache: 300 }).catch(() => []);
  const steps = [t('home.step1'), t('home.step2'), t('home.step3'), t('home.step4')];
  return (
    <div className="page-canvas container-page py-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,50rem)_17rem] lg:justify-between">
        <div className="min-w-0">
          <PageHeader title={t('request.title')} description={t('request.intro')} />
          <Suspense>
            <RequestForm brands={brands} />
          </Suspense>
        </div>
        {/* What happens after submitting, kept beside the form on wide screens (the intro says it in short on phones). */}
        <aside aria-labelledby="request-steps-title" className="hidden lg:block">
          <div className="sticky top-32 rounded-[var(--radius-card)] border border-line-soft bg-white p-5">
            <h2 id="request-steps-title" className="mb-4 font-bold">{t('home.processTitle')}</h2>
            <ol className="flex flex-col gap-3">
              {steps.map((s, i) => (
                <li key={s} className="flex items-start gap-3 text-sm leading-6">
                  <span aria-hidden className="num grid size-6 shrink-0 place-items-center rounded-full bg-carbon text-xs font-bold text-white">{(i + 1).toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US')}</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
