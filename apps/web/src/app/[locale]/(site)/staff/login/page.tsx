import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { StaffLogin } from '@/components/auth/staff-login';
import { ShieldCheck } from 'lucide-react';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function StaffLoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <div className="page-canvas container-page py-10 sm:py-16">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-[var(--radius-control)] bg-carbon text-tech-light"><ShieldCheck aria-hidden className="size-5" /></span>
          <h1 className="text-2xl font-bold">{t('auth.staffLogin')}</h1>
        </div>
        <StaffLogin />
      </div>
    </div>
  );
}
