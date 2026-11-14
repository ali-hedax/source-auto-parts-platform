import type { FinderGroupView, FinderVehicleView, VehiclePublicView } from '@hedax/contracts';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ChapterBand } from '@/components/store/chapter-band';
import { CarsDirectory, type CarsGroup } from '@/components/catalog/cars-directory';
import { serverApi } from '@/lib/api/server';
import { persianText } from '@/lib/persian-text';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return { title: t('parts.carsTitle'), description: t('parts.carsDescription'), alternates: { canonical: `/${locale}/cars`, languages: { fa: '/fa/cars', en: '/en/cars' } } };
}

/**
 * Parts by vehicle: every active vehicle, grouped under its brand (the vehicle finder's brands; a
 * vehicle listed under none goes to «سایر خودروها»). Within a brand, vehicles with parts come first.
 */
export default async function CarsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const fa = locale === 'fa';
  const [vehicles, finderVehicles, finderGroups] = await Promise.all([
    serverApi<VehiclePublicView[]>('/catalog/vehicles', { publicCache: 300 }).catch(() => []),
    serverApi<FinderVehicleView[]>('/catalog/vehicle-finder/vehicles', { publicCache: 300 }).catch(() => []),
    serverApi<FinderGroupView[]>('/catalog/vehicle-finder/groups', { publicCache: 300 }).catch(() => []),
  ]);
  const name = (n: { fa: string; en: string | null }) => persianText(fa ? n.fa : (n.en || n.fa));
  const groupOf = new Map(finderVehicles.map((v) => [v.slug, v]));
  const groups: CarsGroup[] = finderGroups.map((g) => ({ slug: g.slug, name: name(g.name), logoUrl: g.logoUrl, vehicles: [] }));
  const other: CarsGroup = { slug: 'other', name: t('parts.carsOther'), logoUrl: null, vehicles: [] };
  for (const v of vehicles) {
    const finder = groupOf.get(v.slug);
    const target = groups.find((g) => g.slug === finder?.groups[0]) ?? other;
    target.vehicles.push({ slug: v.slug, name: name(v.name), count: v.productCount, search: [v.name.fa, v.name.en ?? '', ...(finder?.aliases ?? []), ...(finder?.make ? [finder.make.fa, finder.make.en ?? ''] : [])] });
  }
  const all = [...groups, other].filter((g) => g.vehicles.length);
  for (const g of all) g.vehicles.sort((a, b) => Number(b.count > 0) - Number(a.count > 0) || b.count - a.count || a.name.localeCompare(b.name, fa ? 'fa' : 'en'));
  // Brands with parts come first too.
  all.sort((a, b) => Number(b.vehicles.some((v) => v.count)) - Number(a.vehicles.some((v) => v.count)));
  return (
    <div className="store-page">
      <ChapterBand title={t('parts.carsTitle')} description={t('parts.carsDescription')} locale={locale} />
      <div className="container-page"><CarsDirectory groups={all} locale={fa ? 'fa' : 'en'} /></div>
    </div>
  );
}
