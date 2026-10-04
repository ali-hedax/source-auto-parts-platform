import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/misc';

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <div className="container-page max-w-3xl py-8">
      <PageHeader title={t('pages.aboutTitle')} description={t('meta.tagline')} />
      <p className="leading-8">{t('pages.aboutBody')}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink href="/parts">{t('nav.parts')}</ButtonLink>
        <ButtonLink href="/request-part" variant="secondary">{t('nav.requestPart')}</ButtonLink>
      </div>
    </div>
  );
}
