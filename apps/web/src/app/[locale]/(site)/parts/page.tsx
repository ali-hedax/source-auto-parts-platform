import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CatalogPage } from '@/components/catalog/catalog-page';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return { title: t('parts.title'), alternates: { canonical: `/${locale}/parts`, languages: { fa: '/fa/parts', en: '/en/parts' } } };
}

export default async function PartsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return <CatalogPage searchParams={await searchParams} endpoint="/catalog/products" pathname="/parts" title={t('parts.title')} />;
}
