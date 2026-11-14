import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PolicyPage } from '@/components/content/policy-page';

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('footer');
  return <PolicyPage kind="PRIVACY" fallbackTitle={t('privacy')} />;
}
