import type { VehicleBrandView } from '@hedax/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CatalogPage } from '@/components/catalog/catalog-page';
import { serverApi } from '@/lib/api/server';
import { canonical } from '@/lib/seo';

const loadBrands = () => serverApi<VehicleBrandView[]>('/catalog/vehicle-brands', { publicCache: 300 }).catch(() => [] as VehicleBrandView[]);

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const brand = (await loadBrands()).find((b) => b.slug === slug);
  if (!brand) return {};
  const t = await getTranslations({ locale });
  const name = locale === 'en' ? (brand.name.en ?? brand.name.fa) : brand.name.fa;
  const title = t('parts.brandTitle', { name });
  const description = t('parts.brandDescription', { name });
  return { title, description, alternates: canonical(locale, `/brands/${brand.slug}`), openGraph: { title, description, ...(brand.logoUrl ? { images: [brand.logoUrl] } : {}) } };
}

export default async function BrandPage({ params, searchParams }: { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const brands = await loadBrands();
  const brand = brands.find((b) => b.slug === slug);
  if (!brand) notFound();
  const name = locale === 'en' ? (brand.name.en ?? brand.name.fa) : brand.name.fa;
  return (
    <CatalogPage
      searchParams={await searchParams}
      endpoint="/catalog/products"
      pathname={`/brands/${slug}`}
      title={`${t('nav.parts')} — ${name}`}
      fixedBrand={slug}
    />
  );
}
