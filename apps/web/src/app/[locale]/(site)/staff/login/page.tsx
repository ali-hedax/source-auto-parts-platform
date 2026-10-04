import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { StaffLogin } from '@/components/auth/staff-login';
import { PageHeader } from '@/components/ui/misc';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function StaffLoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <div className="container-page max-w-md py-10">
      <PageHeader title={t('auth.staffLogin')} />
      <StaffLogin />
    </div>
  );
}
