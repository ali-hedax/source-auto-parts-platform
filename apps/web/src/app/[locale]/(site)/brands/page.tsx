import type { VehicleBrandView } from '@hedax/contracts';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PageHeader } from '@/components/ui/misc';
import { serverApi } from '@/lib/api/server';
import { Num } from '@/components/ui/format';

export default async function BrandsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const brands = await serverApi<VehicleBrandView[]>('/catalog/vehicle-brands', { publicCache: 300 }).catch(() => []);
  return (
    <div className="container-page py-8">
      <PageHeader title={t('nav.brands')} description={t('home.otherBrandsHint')} />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {brands.map((b) => (
          <li key={b.slug}>
            <Link href={`/brands/${b.slug}`} className="card flex min-h-24 flex-col justify-center p-5 hover:border-tech">
              <span className="text-lg font-bold">{locale === 'en' ? (b.name.en ?? b.name.fa) : b.name.fa}</span>
              <span className="text-sm text-steel"><Num value={b.productCount} /> {t('nav.parts')}</span>
            </Link>
          </li>
        ))}
        <li>
          <Link href="/request-part" className="flex min-h-24 flex-col justify-center rounded-[var(--radius-card)] border border-dashed border-action p-5 hover:bg-action-soft">
            <span className="text-lg font-bold text-action">{t('home.otherBrands')}</span>
            <span className="text-sm text-steel">{t('home.otherBrandsHint')}</span>
          </Link>
        </li>
      </ul>
    </div>
  );
}
