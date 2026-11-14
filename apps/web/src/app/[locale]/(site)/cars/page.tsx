import type { VehiclePublicView } from '@hedax/contracts';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { ChapterBand } from '@/components/store/chapter-band';
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
  const Arrow = locale === 'fa' ? ArrowLeft : ArrowRight;
  return (
    <div className="store-page">
      <ChapterBand title={t('parts.carsTitle')} eyebrow="SOURCE · VEHICLES" description={t('parts.carsDescription')} locale={locale} />
      <div className="container-page flex flex-col gap-10 pb-10">
        {groups.map((g) => (
          <section key={g.key || 'none'} aria-labelledby={`cars-${g.key || 'none'}`}>
            {groups.length > 1 ? <h2 id={`cars-${g.key || 'none'}`} className="mb-4 text-lg font-extrabold">{g.title}</h2> : <h2 id={`cars-${g.key || 'none'}`} className="sr-only">{g.title}</h2>}
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {g.items.map((v) => (
                <li key={v.slug}>
                  <Link href={`/cars/${v.slug}`} className="group store-card store-rise flex h-full min-h-28 items-end justify-between gap-2 px-4 py-4 sm:px-5 sm:py-5">
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="text-lg font-extrabold leading-7 sm:text-xl">{name(v.name)}</span>
                      <span className="text-sm text-steel">{t('common.partCount', { count: v.productCount })}</span>
                    </span>
                    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full border border-line-soft text-steel transition-colors group-hover:border-stage group-hover:bg-stage group-hover:text-white"><Arrow className="size-4" /></span>
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
