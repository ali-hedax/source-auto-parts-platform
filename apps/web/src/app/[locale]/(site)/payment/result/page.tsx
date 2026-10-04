import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { PaymentResultClient } from '@/components/commerce/payment-result';
import { PageHeader } from '@/components/ui/misc';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PaymentResultPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <div className="container-page max-w-2xl py-8">
      <PageHeader title={t('payment.title')} />
      <Suspense>
        <PaymentResultClient />
      </Suspense>
    </div>
  );
}
