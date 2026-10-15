import type { VehiclePublicView } from '@hedax/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CatalogPage } from '@/components/catalog/catalog-page';
import { serverApi } from '@/lib/api/server';

const load = (slug: string) => serverApi<VehiclePublicView>(`/catalog/vehicles/${encodeURIComponent(slug)}`, { publicCache: 300 }).catch(() => null);

/** SEO: the owner's own title and description for the vehicle (panel → vehicles), or a sensible default. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale });
  const v = await load(slug);
  if (!v) return {};
  const name = locale === 'en' ? (v.name.en ?? v.name.fa) : v.name.fa;
  const title = (locale === 'fa' && v.seoTitle) || t('parts.carTitle', { name });
  const description = (locale === 'fa' && v.seoDescription) || t('parts.carDescription', { name, count: v.productCount });
  return {
    title, description,
    alternates: { canonical: `/${locale}/cars/${v.slug}`, languages: { fa: `/fa/cars/${v.slug}`, en: `/en/cars/${v.slug}` } },
    openGraph: { title, description, type: 'website' },
  };
}

/** Every part that fits the vehicle (whole vehicle or any of its models); `?model=` narrows to one model. */
export default async function CarPage({ params, searchParams }: { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const v = await load(slug);
  if (!v) notFound();
  const name = locale === 'en' ? (v.name.en ?? v.name.fa) : v.name.fa;
  return (
    <CatalogPage
      searchParams={await searchParams}
      endpoint="/catalog/products"
      pathname={`/cars/${v.slug}`}
      title={t('parts.carTitle', { name })}
      fixedVehicle={v}
    />
  );
}
