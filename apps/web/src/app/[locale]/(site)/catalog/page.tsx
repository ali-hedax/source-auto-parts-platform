import type { CatalogEntrySearchResult, CategoryView, VehicleBrandView, VehiclePublicView } from '@hedax/contracts';
import { SearchX } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CatalogEntryCard } from '@/components/catalog/catalog-entry-card';
import { CatalogSearchForm } from '@/components/catalog/catalog-search-form';
import { Pagination } from '@/components/catalog/pagination';
import { ButtonLink } from '@/components/ui/button';
import { Alert, EmptyState, PageHeader } from '@/components/ui/misc';
import { serverApi } from '@/lib/api/server';

const KEYS = ['q', 'brand', 'vehicle', 'model', 'category', 'page'] as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'technicalCatalog' });
  return {
    title: t('title'),
    description: t('seoDescription'),
    alternates: { canonical: `/${locale}/catalog`, languages: { fa: '/fa/catalog', en: '/en/catalog' } },
  };
}

/** Technical parts catalog: search by name or technical number (also equivalents), filters, result cards. */
export default async function CatalogEntriesPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const raw = await searchParams;
  const current: Record<string, string | undefined> = {};
  for (const k of KEYS) {
    const v = raw[k];
    current[k] = typeof v === 'string' && v.length <= 120 ? v : undefined;
  }
  if (!current.vehicle) current.model = undefined;
  const qs = new URLSearchParams(Object.entries({ ...current, pageSize: '24' }).filter((e): e is [string, string] => !!e[1]));
  const [result, categories, brands, vehicles] = await Promise.all([
    serverApi<CatalogEntrySearchResult>(`/catalog/entries?${qs.toString()}`, { publicCache: 60 }).catch(() => null),
    serverApi<CategoryView[]>('/catalog/categories', { publicCache: 300 }).catch(() => []),
    serverApi<VehicleBrandView[]>('/catalog/vehicle-brands', { publicCache: 300 }).catch(() => []),
    serverApi<VehiclePublicView[]>('/catalog/vehicles', { publicCache: 300 }).catch(() => []),
  ]);
  const page = Number(current.page ?? 1) || 1;
  const query = current.q?.trim();
  const requestHref = query ? `/request-part?part=${encodeURIComponent(query)}` : '/request-part';
  return (
    <div className="page-canvas container-page py-8">
      <PageHeader title={t('technicalCatalog.title')} description={t('technicalCatalog.intro')} />
      <CatalogSearchForm current={current} brands={brands} vehicles={vehicles} categories={categories} />
      <div className="mt-6">
        {!result ? (
          <Alert tone="warning" title={t('common.unavailable')} />
        ) : result.items.length === 0 ? (
          query ? (
            <EmptyState title={t('technicalCatalog.noResults', { query })} icon={<SearchX aria-hidden className="size-10" />}>
              <p>{t('technicalCatalog.noResultsHint')}</p>
              <ButtonLink href={requestHref} className="mt-4">{t('technicalCatalog.requestSupply')}</ButtonLink>
            </EmptyState>
          ) : (
            <EmptyState title={t('technicalCatalog.empty')} />
          )
        ) : (
          <>
            <p className="mb-3 text-sm font-medium text-steel" aria-live="polite">{t('technicalCatalog.results', { count: result.total })}</p>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 xl:grid-cols-4" data-testid="catalog-results">
              {result.items.map((entry, i) => (
                <li key={entry.slug}><CatalogEntryCard entry={entry} priority={i < 3} /></li>
              ))}
            </ul>
            <Pagination pathname="/catalog" params={current} page={page} pageSize={result.pageSize} total={result.total} />
          </>
        )}
      </div>
    </div>
  );
}
