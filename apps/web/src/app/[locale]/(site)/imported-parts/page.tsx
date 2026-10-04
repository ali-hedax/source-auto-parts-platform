import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CatalogPage } from '@/components/catalog/catalog-page';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return { title: t('parts.importedTitle'), alternates: { canonical: `/${locale}/imported-parts`, languages: { fa: '/fa/imported-parts', en: '/en/imported-parts' } } };
}

/** Origin = IMPORTED; same stock and same purchase path as every other part (no duplicated stock). */
export default async function ImportedPartsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <CatalogPage
      searchParams={await searchParams}
      endpoint="/catalog/imported-products"
      pathname="/imported-parts"
      title={t('parts.importedTitle')}
      intro={t('parts.importedIntro')}
    />
  );
}
