import type { CategoryView, FinderGroupView, FinderMatchTier, ManufacturerView, ProductCard, SearchResult, VehicleBrandView, VehiclePublicView } from '@hedax/contracts';
import { SearchX, X } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/button';
import { Alert, EmptyState } from '@/components/ui/misc';
import { ChapterBand } from '@/components/store/chapter-band';
import { Link } from '@/i18n/navigation';
import { serverApi } from '@/lib/api/server';
import { ApiRequestError } from '@/lib/api/errors';
import { displayCurrency } from '@/lib/preferences';
import { CatalogFilters } from './filters';
import { Pagination } from './pagination';
import { PartCard } from './part-card';
import { SortSelect } from './sort-select';

const KEYS = ['q', 'group', 'vehicle', 'model', 'year', 'brand', 'maker', 'category', 'partType', 'condition', 'origin', 'inStock', 'sort', 'page'] as const;

export async function CatalogPage({
  searchParams,
  endpoint,
  pathname,
  title,
  intro,
  fixedBrand,
  fixedVehicle,
}: {
  searchParams: Record<string, string | string[] | undefined>;
  endpoint: '/catalog/products' | '/catalog/imported-products';
  pathname: string;
  title: string;
  intro?: string;
  fixedBrand?: string;
  /** Vehicle page (/cars/[slug]): parts for this vehicle and its models; `?model=` narrows to one model. */
  fixedVehicle?: VehiclePublicView;
  /** No longer shown (decorative Latin labels were removed, 2026-11); kept for callers. */
  eyebrow?: string;
}) {
  const t = await getTranslations();
  const locale = await getLocale();
  const fa = locale === 'fa';
  const currency = await displayCurrency();
  const params: Record<string, string | undefined> = {};
  for (const k of KEYS) {
    const v = searchParams[k];
    params[k] = typeof v === 'string' && v.length <= (k === 'category' ? 400 : 120) ? v : undefined;
  }
  // «نامشخص» origin is not a customer filter.
  if (params.origin === 'UNKNOWN') params.origin = undefined;
  // What the URL says; a brand page's fixed brand is not a filter value.
  const current = { ...params };
  if (fixedBrand) params.brand = fixedBrand;
  if (fixedVehicle) params.vehicle = fixedVehicle.slug;
  if (!params.vehicle) params.model = undefined;
  const qs = new URLSearchParams(Object.entries({ ...params, currency, pageSize: '24' }).filter((e): e is [string, string] => !!e[1]));
  // A vehicle selection the server rejects (unknown brand, vehicle outside it, model that does not
  // belong) shows that, never the unfiltered catalogue.
  const [{ result, invalidStep }, categories, brands, groups, makers] = await Promise.all([
    serverApi<SearchResult>(`${endpoint}?${qs.toString()}`, { publicCache: 60 })
      .then((r) => ({ result: r as SearchResult | null, invalidStep: null as string | null }))
      .catch((e: unknown) => ({ result: null, invalidStep: e instanceof ApiRequestError && e.code === 'VEHICLE_SELECTION_INVALID' ? String(e.details?.field ?? 'vehicle') : null })),
    serverApi<CategoryView[]>('/catalog/categories', { publicCache: 300 }).catch(() => []),
    serverApi<VehicleBrandView[]>('/catalog/vehicle-brands', { publicCache: 300 }).catch(() => []),
    fixedVehicle ? Promise.resolve([] as FinderGroupView[]) : serverApi<FinderGroupView[]>('/catalog/vehicle-finder/groups', { publicCache: 300 }).catch(() => []),
    serverApi<ManufacturerView[]>('/catalog/manufacturers', { publicCache: 300 }).catch(() => []),
  ]);
  const name = (n: { fa: string; en: string | null }) => (fa ? n.fa : (n.en ?? n.fa));
  const page = Number(params.page ?? 1) || 1;
  const selection = result?.selection ?? null;
  const vehicleText = (() => {
    if (!selection?.vehicle) return selection?.group ? name(selection.group.name) : '';
    const vehicle = name(selection.vehicle.name);
    const model = selection.model ? name(selection.model.name) : '';
    const base = vehicle.split(' ').at(-1) ?? vehicle;
    return [model && (model.includes(vehicle) || model.includes(base)) ? '' : vehicle, model].filter(Boolean).join(' ');
  })();
  const requestForSelection = selection ? `/request-part?${new URLSearchParams({
    ...(selection.group ? { vehicleBrand: selection.group.slug } : {}),
    ...(selection.vehicle ? { vehicleModel: vehicleText.slice(0, 80) } : {}),
    ...(params.q ? { part: params.q.slice(0, 120) } : {}),
    ...(selection.year ? { vehicleYear: String(selection.year) } : {}),
  }).toString()}` : '/request-part';
  const query = params.q?.trim();

  // Active filters as removable chips above the results.
  const without = (...keys: string[]) => ({ pathname, query: Object.fromEntries(Object.entries(current).filter((e): e is [string, string] => !!e[1] && !keys.includes(e[0]) && e[0] !== 'page')) });
  const chosenCategories = (current.category ?? '').split(',').filter(Boolean);
  const chips: Array<{ key: string; label: string; href: ReturnType<typeof without> }> = [];
  if (query) chips.push({ key: 'q', label: `«${query}»`, href: without('q') });
  if (current.group) chips.push({ key: 'group', label: selection?.group ? name(selection.group.name) : current.group, href: without('group', 'vehicle', 'model', 'year') });
  if (current.vehicle) chips.push({ key: 'vehicle', label: selection?.vehicle ? name(selection.vehicle.name) : current.vehicle, href: without('vehicle', 'model', 'year') });
  if (current.model && !fixedVehicle) chips.push({ key: 'model', label: selection?.model ? name(selection.model.name) : current.model, href: without('model', 'year') });
  for (const slug of chosenCategories) {
    const c = categories.find((x) => x.slug === slug);
    const rest = chosenCategories.filter((x) => x !== slug).join(',');
    const href = without('category');
    if (rest) href.query.category = rest;
    chips.push({ key: `category-${slug}`, label: c ? name(c.name) : slug, href });
  }
  if (current.partType) chips.push({ key: 'partType', label: t(`partType.${current.partType}`), href: without('partType') });
  if (current.condition) chips.push({ key: 'condition', label: t(`condition.${current.condition}`), href: without('condition') });
  if (current.origin) chips.push({ key: 'origin', label: t(`origin.${current.origin}`), href: without('origin') });
  if (current.inStock === '1') chips.push({ key: 'inStock', label: t('parts.inStockOnly'), href: without('inStock') });
  if (current.maker) chips.push({ key: 'maker', label: makers.find((m) => m.slug === current.maker)?.name.fa ?? current.maker, href: without('maker') });
  if (current.brand && !fixedBrand) chips.push({ key: 'brand', label: brands.find((b) => b.slug === current.brand) ? name(brands.find((b) => b.slug === current.brand)!.name) : current.brand, href: without('brand') });
  const clearAll = { pathname, query: current.sort ? { sort: current.sort } : {} };

  return (
    <div className="store-page su-catalog">
      <ChapterBand title={title} description={intro} locale={locale}>
        {fixedVehicle && fixedVehicle.models.length ? (
          <nav aria-label={t('parts.vehicleModel')} className="su-chips su-band-chips" data-testid="vehicle-models">
            {[{ slug: '', label: t('parts.allModels') }, ...fixedVehicle.models.map((m) => ({ slug: m.slug, label: name(m.name) }))].map((m) => {
              const on = (params.model ?? '') === m.slug;
              return <Link key={m.slug || 'all'} href={m.slug ? `${pathname}?model=${encodeURIComponent(m.slug)}` : pathname} aria-current={on ? 'page' : undefined} className="su-chip">{m.label}</Link>;
            })}
          </nav>
        ) : null}
      </ChapterBand>
      <div className="container-page su-catalog-layout">
        <aside className="su-catalog-aside">
          <CatalogFilters categories={categories} groups={groups} makers={makers} {...(fixedVehicle ? { fixedVehicle } : {})} current={current} showOrigin={endpoint === '/catalog/products'} />
        </aside>
        <div className="su-catalog-results">
          <div className="su-results-bar">
            {result ? <p className="su-results-count" aria-live="polite">{t('common.results', { count: result.total })}</p> : <span />}
            <SortSelect current={current} />
          </div>
          {chips.length ? (
            <ul className="su-active-filters" aria-label={fa ? 'فیلترهای فعال' : 'Active filters'} data-testid="active-filters">
              {chips.map((c) => (
                <li key={c.key}><Link href={c.href} className="su-chip su-chip-remove" aria-label={`${fa ? 'حذف فیلتر' : 'Remove filter'}: ${c.label}`} {...(c.key === 'q' ? { 'data-testid': 'search-term' } : {})}>{c.label}<X aria-hidden size={16} /></Link></li>
              ))}
              <li><Link href={clearAll} className="su-link su-clear-all">{fa ? 'حذف همه' : 'Clear all'}</Link></li>
            </ul>
          ) : null}
          {invalidStep ? (
            <Alert tone="warning" title={t('finder.invalidTitle')}>
              <p>{t(`finder.invalid.${invalidStep === 'group' || invalidStep === 'model' || invalidStep === 'year' ? invalidStep : 'vehicle'}`)}</p>
              <Link className="su-link" href={clearAll}>{t('finder.chooseAgain')}</Link>
            </Alert>
          ) : !result ? (
            <Alert tone="warning" title={t('common.unavailable')} />
          ) : result.items.length === 0 ? (
            query ? (
              <EmptyState title={t('search.noResults', { query })} icon={<SearchX aria-hidden className="size-10" />}>
                <p>{t('search.noResultsHint')}</p>
                <ButtonLink href={`/request-part?part=${encodeURIComponent(query)}`} className="mt-4">{t('search.requestThis')}</ButtonLink>
              </EmptyState>
            ) : selection ? (
              <EmptyState title={t('finder.noParts', { vehicle: vehicleText })}>
                <p>{t('finder.noPartsHint')}</p>
                <ButtonLink href={requestForSelection} className="mt-4">{t('finder.requestForVehicle')}</ButtonLink>
              </EmptyState>
            ) : (
              <EmptyState title={t('parts.empty')}>
                <ButtonLink href="/request-part" variant="secondary" className="mt-2">{t('nav.requestPart')}</ButtonLink>
              </EmptyState>
            )
          ) : (
            <>
              {/* Vehicle results come ranked: verified fitment first, then labelled suggestions. */}
              {result.tiers && !result.tiers.verified ? (
                <Alert tone="info" title={t('finder.noVerifiedTitle')}>
                  <p>{t('finder.noVerifiedHint')}</p>
                  <Link className="su-link" href={requestForSelection}>{t('finder.requestForVehicle')}</Link>
                </Alert>
              ) : null}
              {groupByTier(result.items).map((part) => (
                <section key={`${part.tier ?? 'all'}-${part.items[0]!.id}`} className="su-tier" aria-labelledby={part.tier ? `tier-${part.tier}` : undefined}>
                  {part.tier && result.tiers ? (
                    <h2 id={`tier-${part.tier}`} className="su-tier-title" data-testid={`tier-${part.tier}`}>
                      {t(`finder.tier.${part.tier}`)} <span>{t('common.results', { count: result.tiers[part.tier] })}</span>
                    </h2>
                  ) : null}
                  <ul className="su-card-grid su-card-grid-4">
                    {part.items.map((p) => <li key={p.id}><PartCard product={p} priority={result.items.indexOf(p) < 4} /></li>)}
                  </ul>
                </section>
              ))}
              <Pagination pathname={pathname} params={{ ...params, brand: fixedBrand ? undefined : params.brand, vehicle: fixedVehicle ? undefined : params.vehicle }} page={page} pageSize={result.pageSize} total={result.total} />
            </>
          )}
          {query && result && result.items.length > 0 ? (
            <p className="su-request-hint">
              {t('search.noResultsHint')} <Link className="su-link" href={`/request-part?part=${encodeURIComponent(query)}`}>{t('search.requestThis')}</Link>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Consecutive results of the same finder tier (the server orders by tier); one group without a vehicle search. */
function groupByTier(items: ProductCard[]): Array<{ tier: FinderMatchTier | null; items: ProductCard[] }> {
  const parts: Array<{ tier: FinderMatchTier | null; items: ProductCard[] }> = [];
  for (const p of items) {
    const tier = p.finderMatch?.tier ?? null;
    const last = parts.at(-1);
    if (last && last.tier === tier) last.items.push(p); else parts.push({ tier, items: [p] });
  }
  return parts;
}
