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
  return (
    <div className="container-page max-w-4xl py-8">
      <PageHeader title={t('request.title')} description={t('request.intro')} />
      <Suspense>
        <RequestForm brands={brands} />
      </Suspense>
    </div>
  );
}
