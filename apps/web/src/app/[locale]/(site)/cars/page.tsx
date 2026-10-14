import type { VehiclePublicView } from '@hedax/contracts';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PageHeader } from '@/components/ui/misc';
import { serverApi } from '@/lib/api/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return { title: t('parts.carsTitle'), description: t('parts.carsDescription'), alternates: { canonical: `/${locale}/cars`, languages: { fa: '/fa/cars', en: '/en/cars' } } };
}

/** Parts by vehicle: every active vehicle, grouped by its category (vehicles without one come last). */
export default async function CarsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const vehicles = await serverApi<VehiclePublicView[]>('/catalog/vehicles', { publicCache: 300 }).catch(() => []);
  const name = (n: { fa: string; en: string | null }) => (locale === 'en' ? (n.en ?? n.fa) : n.fa);
  const groups: Array<{ key: string; title: string; items: VehiclePublicView[] }> = [];
  for (const v of vehicles) {
    const key = v.category?.slug ?? '';
    let group = groups.find((g) => g.key === key);
    if (!group) groups.push((group = { key, title: v.category ? name(v.category.name) : t('parts.carsOther'), items: [] }));
    group.items.push(v);
  }
  groups.sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : 0));
  return (
    <div className="page-canvas container-page py-8">
      <PageHeader title={t('parts.carsTitle')} description={t('parts.carsDescription')} />
      <div className="flex flex-col gap-8">
        {groups.map((g) => (
          <section key={g.key || 'none'} aria-labelledby={`cars-${g.key || 'none'}`}>
            {groups.length > 1 ? <h2 id={`cars-${g.key || 'none'}`} className="mb-3 text-lg font-bold">{g.title}</h2> : <h2 id={`cars-${g.key || 'none'}`} className="sr-only">{g.title}</h2>}
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
              {g.items.map((v) => (
                <li key={v.slug}>
                  <Link href={`/cars/${v.slug}`} className="flex h-full min-h-24 flex-col justify-center gap-1 rounded-[var(--radius-card)] border border-line-soft bg-white px-4 py-4 transition-colors hover:border-line-strong sm:px-5">
                    <span className="text-lg font-bold leading-7">{name(v.name)}</span>
                    <span className="text-sm text-steel">{t('common.partCount', { count: v.productCount })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
