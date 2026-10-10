import type { VehicleBrandView } from '@hedax/contracts';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PageHeader } from '@/components/ui/misc';
import { serverApi } from '@/lib/api/server';

export default async function BrandsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const brands = await serverApi<VehicleBrandView[]>('/catalog/vehicle-brands', { publicCache: 300 }).catch(() => []);
  return (
    <div className="page-canvas container-page py-8">
      <PageHeader title={t('nav.brands')} description={t('home.otherBrandsHint')} />
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {brands.map((b) => (
          <li key={b.slug}>
            <Link href={`/brands/${b.slug}`} className="flex h-full min-h-24 flex-col justify-center gap-1 rounded-[var(--radius-card)] border border-line-soft bg-white px-4 py-4 transition-colors hover:border-line-strong sm:px-5">
              <span className="text-lg font-bold leading-7">{locale === 'en' ? (b.name.en ?? b.name.fa) : b.name.fa}</span>
              <span className="text-sm text-steel">{t('common.partCount', { count: b.productCount })}</span>
            </Link>
          </li>
        ))}
        <li>
          <Link href="/request-part" className="flex h-full min-h-24 flex-col justify-center gap-1 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-white/60 px-4 py-4 transition-colors hover:border-action hover:bg-action-soft sm:px-5">
            <span className="text-lg font-bold leading-7 text-action">{t('home.otherBrands')}</span>
            <span className="text-sm leading-6 text-steel">{t('home.otherBrandsHint')}</span>
          </Link>
        </li>
      </ul>
    </div>
  );
}
