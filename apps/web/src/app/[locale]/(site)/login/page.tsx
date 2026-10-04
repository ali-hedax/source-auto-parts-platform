import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { OtpLogin } from '@/components/auth/otp-login';
import { PageHeader } from '@/components/ui/misc';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <div className="container-page max-w-md py-10">
      <PageHeader title={t('auth.loginTitle')} />
      <Suspense>
        <OtpLogin />
      </Suspense>
    </div>
  );
}
