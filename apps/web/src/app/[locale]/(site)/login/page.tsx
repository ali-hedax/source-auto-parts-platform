import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { OtpLogin } from '@/components/auth/otp-login';
import Image from 'next/image';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <div className="page-canvas container-page py-10 sm:py-16">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <Image src="/brand/source/icon-64.png" width={64} height={64} unoptimized alt="" className="size-10 rounded-[var(--radius-control)]" />
          <h1 className="text-2xl font-bold">{t('auth.loginTitle')}</h1>
        </div>
        <Suspense>
          <OtpLogin />
        </Suspense>
      </div>
    </div>
  );
}
