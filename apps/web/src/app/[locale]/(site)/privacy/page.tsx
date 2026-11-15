import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { PolicyPage, policyMetadata } from '@/components/content/policy-page';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'footer' });
  return policyMetadata('PRIVACY', locale, '/privacy', t('privacy'));
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('footer');
  return <PolicyPage kind="PRIVACY" fallbackTitle={t('privacy')} />;
}
