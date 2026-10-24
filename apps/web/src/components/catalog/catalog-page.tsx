import type { CategoryView, ManufacturerView, SearchResult, VehicleBrandView, VehiclePublicView } from '@hedax/contracts';
import { SearchX, X } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/button';
import { Alert, EmptyState } from '@/components/ui/misc';
import { ChapterBand } from '@/components/store/chapter-band';
import { Link } from '@/i18n/navigation';
import { serverApi } from '@/lib/api/server';
import { displayCurrency } from '@/lib/preferences';
import { CatalogFilters } from './filters';
import { Pagination } from './pagination';
import { PartCard } from './part-card';

const KEYS = ['q', 'vehicle', 'model', 'brand', 'maker', 'category', 'partType', 'condition', 'origin', 'inStock', 'sort', 'page'] as const;

export async function CatalogPage({
  searchParams,
  endpoint,
  pathname,
  title,
  intro,
  fixedBrand,
  fixedVehicle,
  eyebrow = 'SOURCE · PARTS',
}: {
  searchParams: Record<string, string | string[] | undefined>;
  endpoint: '/catalog/products' | '/catalog/imported-products';
  pathname: string;
  title: string;
  intro?: string;
  fixedBrand?: string;
  /** Vehicle page (/cars/[slug]): parts for this vehicle and its models; `?model=` narrows to one model. */
  fixedVehicle?: VehiclePublicView;
  /** Small Latin label above the title in the chapter band. */
  eyebrow?: string;
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
  if (fixedVehicle) params.vehicle = fixedVehicle.slug;
  if (!params.vehicle) params.model = undefined;
  const qs = new URLSearchParams(Object.entries({ ...params, currency, pageSize: '24' }).filter((e): e is [string, string] => !!e[1]));
  const [result, categories, brands, vehicles, makers] = await Promise.all([
    serverApi<SearchResult>(`${endpoint}?${qs.toString()}`, { publicCache: 60 }).catch(() => null),
    serverApi<CategoryView[]>('/catalog/categories', { publicCache: 300 }).catch(() => []),
    serverApi<VehicleBrandView[]>('/catalog/vehicle-brands', { publicCache: 300 }).catch(() => []),
    serverApi<VehiclePublicView[]>('/catalog/vehicles', { publicCache: 300 }).catch(() => []),
    serverApi<ManufacturerView[]>('/catalog/manufacturers', { publicCache: 300 }).catch(() => []),
  ]);
  const name = (n: { fa: string; en: string | null }) => (locale === 'en' ? (n.en ?? n.fa) : n.fa);
  const page = Number(params.page ?? 1) || 1;
  const query = params.q?.trim();
  const clearQuery = { pathname, query: Object.fromEntries(Object.entries(current).filter((e): e is [string, string] => !!e[1] && e[0] !== 'q' && e[0] !== 'page')) };
  return (
    <div className="store-page">
      <ChapterBand title={title} eyebrow={eyebrow} description={intro} locale={locale}>
        {fixedVehicle && fixedVehicle.models.length ? (
          <nav aria-label={t('parts.vehicleModel')} className="mt-5 flex flex-wrap items-center gap-2" data-testid="vehicle-models">
            <span className="text-sm font-semibold text-mist">{t('parts.vehicleModel')}:</span>
            {[{ slug: '', label: t('parts.allModels') }, ...fixedVehicle.models.map((m) => ({ slug: m.slug, label: name(m.name) }))].map((m) => {
              const on = (params.model ?? '') === m.slug;
              return (
                <Link key={m.slug || 'all'} href={m.slug ? `${pathname}?model=${encodeURIComponent(m.slug)}` : pathname} aria-current={on ? 'page' : undefined} className="store-chip">
                  {m.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
        {result ? (
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
            {query ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/5 ps-3 text-sm text-paper" data-testid="search-term">
                {t('search.label')}: <strong className="font-semibold text-white">«{query}»</strong>
                <Link href={clearQuery} className="grid size-9 place-items-center rounded-full text-mist hover:text-white" aria-label={t('parts.clearSearch')}>
                  <X aria-hidden className="size-4" />
                </Link>
              </span>
            ) : null}
            <p className="text-sm font-medium text-mist" aria-live="polite">{t('common.results', { count: result.total })}</p>
          </div>
        ) : null}
      </ChapterBand>
      <div className="container-page pb-8">
      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-6">
        <aside className="lg:sticky lg:top-32 lg:max-h-[calc(100vh-9rem)] lg:self-start lg:overflow-y-auto">
          <CatalogFilters categories={categories} brands={brands} makers={makers} vehicles={vehicles} {...(fixedVehicle ? { fixedVehicle } : {})} current={current} showOrigin={endpoint === '/catalog/products'} />
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
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                {result.items.map((p, i) => (
                  <li key={p.id}><PartCard product={p} priority={i < 3} /></li>
                ))}
              </ul>
              <Pagination pathname={pathname} params={{ ...params, brand: fixedBrand ? undefined : params.brand, vehicle: fixedVehicle ? undefined : params.vehicle }} page={page} pageSize={result.pageSize} total={result.total} />
            </>
          )}
          {query && result && result.items.length > 0 ? (
            <p className="store-card mt-8 px-4 py-3 text-center text-sm leading-7 text-steel">
              {t('search.noResultsHint')}{' '}
              <a className="font-semibold text-action underline underline-offset-4 hover:text-action-hover" href={`/${locale}/request-part?part=${encodeURIComponent(query)}`}>{t('search.requestThis')}</a>
            </p>
          ) : null}
        </div>
      </div>
      </div>
    </div>
  );
}
