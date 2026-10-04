import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { AcceptInvitation } from '@/components/auth/accept-invitation';
import { PageHeader } from '@/components/ui/misc';

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function InvitePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <div className="container-page max-w-md py-10">
      <PageHeader title={t('auth.inviteTitle')} />
      <Suspense>
        <AcceptInvitation />
      </Suspense>
    </div>
  );
}
