import type { CategoryView, SearchResult, VehicleBrandView } from '@hedax/contracts';
import { SearchX } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/button';
import { Alert, EmptyState, PageHeader } from '@/components/ui/misc';
import { serverApi } from '@/lib/api/server';
import { displayCurrency } from '@/lib/preferences';
import { CatalogFilters } from './filters';
import { Pagination } from './pagination';
import { PartCard } from './part-card';

const KEYS = ['q', 'brand', 'category', 'partType', 'condition', 'origin', 'inStock', 'sort', 'page'] as const;

export async function CatalogPage({
  searchParams,
  endpoint,
  pathname,
  title,
  intro,
  fixedBrand,
}: {
  searchParams: Record<string, string | string[] | undefined>;
  endpoint: '/catalog/products' | '/catalog/imported-products';
  pathname: string;
  title: string;
  intro?: string;
  fixedBrand?: string;
}) {
  const t = await getTranslations();
  const locale = await getLocale();
  const currency = await displayCurrency();
  const params: Record<string, string | undefined> = {};
  for (const k of KEYS) {
    const v = searchParams[k];
    params[k] = typeof v === 'string' && v.length <= 120 ? v : undefined;
  }
  // What the URL says; a brand page's fixed brand is not a filter value.
  const current = { ...params };
  if (fixedBrand) params.brand = fixedBrand;
  const qs = new URLSearchParams(Object.entries({ ...params, currency, pageSize: '24' }).filter((e): e is [string, string] => !!e[1]));
  const [result, categories, brands] = await Promise.all([
    serverApi<SearchResult>(`${endpoint}?${qs.toString()}`, { publicCache: 60 }).catch(() => null),
    serverApi<CategoryView[]>('/catalog/categories', { publicCache: 300 }).catch(() => []),
    serverApi<VehicleBrandView[]>('/catalog/vehicle-brands', { publicCache: 300 }).catch(() => []),
  ]);
  const page = Number(params.page ?? 1) || 1;
  const query = params.q?.trim();
  return (
    <div className="page-canvas container-page py-8">
      <PageHeader title={title} description={intro} />
      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-6">
        <aside className="lg:sticky lg:top-32 lg:max-h-[calc(100vh-9rem)] lg:self-start lg:overflow-y-auto">
          <CatalogFilters categories={categories} brands={brands} current={current} showOrigin={endpoint === '/catalog/products'} />
        </aside>
        <div className="min-w-0">
          {!result ? (
            <Alert tone="warning" title={t('common.unavailable')} />
          ) : result.items.length === 0 ? (
            query ? (
              <EmptyState title={t('search.noResults', { query })} icon={<SearchX aria-hidden className="size-10" />}>
                <p>{t('search.noResultsHint')}</p>
                <ButtonLink href={`/request-part?part=${encodeURIComponent(query)}`} className="mt-4">
                  {t('search.requestThis')}
                </ButtonLink>
              </EmptyState>
            ) : (
              <EmptyState title={t('parts.empty')}>
                <ButtonLink href="/request-part" variant="secondary" className="mt-2">{t('nav.requestPart')}</ButtonLink>
              </EmptyState>
            )
          ) : (
            <>
              <p className="mb-3 text-sm font-medium text-steel" aria-live="polite">
                {t('common.results', { count: result.total })}
              </p>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                {result.items.map((p, i) => (
                  <li key={p.id}><PartCard product={p} priority={i < 3} /></li>
                ))}
              </ul>
              <Pagination pathname={pathname} params={{ ...params, brand: fixedBrand ? undefined : params.brand }} page={page} pageSize={result.pageSize} total={result.total} />
            </>
          )}
          {query && result && result.items.length > 0 ? (
            <p className="mt-8 rounded-[var(--radius-card)] border border-line-soft bg-white px-4 py-3 text-center text-sm leading-7 text-steel">
              {t('search.noResultsHint')}{' '}
              <a className="font-semibold text-action underline underline-offset-4 hover:text-action-hover" href={`/${locale}/request-part?part=${encodeURIComponent(query)}`}>{t('search.requestThis')}</a>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
