'use client';

import type { CategoryView, ManufacturerView, VehicleBrandView, VehiclePublicView } from '@hedax/contracts';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { Checkbox, Field, Select } from '@/components/ui/field';
import { Num } from '@/components/ui/format';

export type FilterKey = 'q' | 'group' | 'vehicle' | 'model' | 'year' | 'brand' | 'maker' | 'category' | 'partType' | 'condition' | 'origin' | 'inStock' | 'sort';

/**
 * All filters live in the URL, so back/forward restore the exact view; navigation transitions
 * cancel stale renders. The search words come from the one search box in the header (`q` is kept).
 * The current values come from the server page as props, so the panel is part
 * of the first HTML chunk and never pushes the results down later (a late
 * streamed panel measured CLS 0.66 on mobile). On small screens it is collapsed
 * behind a button so results are visible first; from `lg` up it is always open.
 */
export function CatalogFilters({ categories, brands, makers = [], vehicles = [], fixedVehicle, current, showOrigin = true }: {
  categories: CategoryView[]; brands: VehicleBrandView[]; makers?: ManufacturerView[]; vehicles?: VehiclePublicView[]; fixedVehicle?: VehiclePublicView; current: Partial<Record<FilterKey, string>>; showOrigin?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale() as 'fa' | 'en';
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const active = (['vehicle', 'model', 'brand', 'maker', 'category', 'partType', 'condition', 'origin', 'inStock'] as const).filter((k) => current[k]).length;
  // On a vehicle page the vehicle is fixed; only its models can be chosen.
  const chosenVehicle = fixedVehicle ?? vehicles.find((v) => v.slug === current.vehicle);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...current, ...patch })) {
      if (v) next.set(k, v);
    }
    start(() => router.replace(`${pathname}${next.size ? `?${next.toString()}` : ''}`, { scroll: false }));
  };

  const name = (n: { fa: string; en: string | null }) => (locale === 'en' ? (n.en ?? n.fa) : n.fa);
  // Clearing the filters keeps the search words.
  const cleared = current.q ? `${pathname}?q=${encodeURIComponent(current.q)}` : pathname;
  const clear = 'inline-flex min-h-11 cursor-pointer items-center rounded-[var(--radius-control)] px-2 text-sm font-semibold text-action hover:underline';

  return (
    <section aria-labelledby="filters-title" className="store-card overflow-hidden" aria-busy={pending}>
      <div className="hidden items-center justify-between gap-2 border-b border-line-soft bg-paper px-4 py-2.5 lg:flex">
        <h2 id="filters-title" className="flex items-center gap-2 font-bold">
          <SlidersHorizontal aria-hidden className="size-5 text-steel" />
          {t('parts.filters')}
          {active ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-stage px-1.5 text-xs font-bold text-white"><Num value={active} /></span> : null}
        </h2>
        <button type="button" className={clear} onClick={() => start(() => router.replace(cleared, { scroll: false }))}>
          {t('parts.clearFilters')}
        </button>
      </div>
      <button
        type="button"
        className="flex min-h-12 w-full cursor-pointer items-center gap-2 px-4 font-bold lg:hidden"
        aria-expanded={open}
        aria-controls="filters-body"
        onClick={() => setOpen((o) => !o)}
      >
        <SlidersHorizontal aria-hidden className="size-5" />
        {t('parts.filters')}
        {active ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-stage px-1.5 text-xs font-bold text-white"><Num value={active} /></span> : null}
        <ChevronDown aria-hidden className={`ms-auto size-5 text-steel transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div id="filters-body" className={`${open ? 'flex' : 'hidden'} flex-col gap-4 border-t border-line-soft p-4 lg:flex lg:border-t-0`}>
        {/* A vehicle-finder selection (group → vehicle → model → year) is changed from its summary, not here. */}
        {!fixedVehicle && !current.group && vehicles.length ? (
          <Field id="filter-vehicle" label={t('parts.vehicle')} hint={t('parts.vehicleHint')}>
            <Select id="filter-vehicle" value={current.vehicle ?? ''} aria-describedby="filter-vehicle-hint" onChange={(e) => update({ vehicle: e.target.value || null, model: null })}>
              <option value="">{t('common.all')}</option>
              {vehicles.map((v) => <option key={v.slug} value={v.slug}>{name(v.name)}</option>)}
            </Select>
          </Field>
        ) : null}
        {!current.group && chosenVehicle && chosenVehicle.models.length ? (
          <Field id="filter-model" label={t('parts.vehicleModel')}>
            <Select id="filter-model" value={current.model ?? ''} onChange={(e) => update({ model: e.target.value || null })}>
              <option value="">{t('parts.allModels')}</option>
              {chosenVehicle.models.map((m) => <option key={m.slug} value={m.slug}>{name(m.name)}</option>)}
            </Select>
          </Field>
        ) : null}
        <Field id="filter-brand" label={t('parts.brand')}>
          <Select id="filter-brand" value={current.brand ?? ''} onChange={(e) => update({ brand: e.target.value })}>
            <option value="">{t('common.all')}</option>
            {brands.map((b) => (
              <option key={b.slug} value={b.slug}>{name(b.name)}</option>
            ))}
          </Select>
        </Field>
        {makers.length ? (
          <Field id="filter-maker" label={t('parts.maker')}>
            <Select id="filter-maker" value={current.maker ?? ''} onChange={(e) => update({ maker: e.target.value || null })}>
              <option value="">{t('parts.allMakers')}</option>
              {makers.map((m) => <option key={m.slug} value={m.slug}>{name(m.name)}</option>)}
            </Select>
          </Field>
        ) : null}
        <Field id="filter-category" label={t('parts.category')}>
          <Select id="filter-category" value={current.category ?? ''} onChange={(e) => update({ category: e.target.value })}>
            <option value="">{t('common.all')}</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>{name(c.name)}</option>
            ))}
          </Select>
        </Field>
        <Field id="filter-type" label={t('parts.partType')}>
          <Select id="filter-type" value={current.partType ?? ''} onChange={(e) => update({ partType: e.target.value })}>
            <option value="">{t('common.all')}</option>
            {(['GENUINE', 'OEM', 'AFTERMARKET'] as const).map((v) => <option key={v} value={v}>{t(`partType.${v}`)}</option>)}
          </Select>
        </Field>
        <Field id="filter-condition" label={t('parts.condition')}>
          <Select id="filter-condition" value={current.condition ?? ''} onChange={(e) => update({ condition: e.target.value })}>
            <option value="">{t('common.all')}</option>
            {(['NEW', 'USED', 'REFURBISHED'] as const).map((v) => <option key={v} value={v}>{t(`condition.${v}`)}</option>)}
          </Select>
        </Field>
        {showOrigin ? (
          <Field id="filter-origin" label={t('parts.origin')}>
            <Select id="filter-origin" value={current.origin ?? ''} onChange={(e) => update({ origin: e.target.value })}>
              <option value="">{t('common.all')}</option>
              {(['DOMESTIC', 'IMPORTED', 'UNKNOWN'] as const).map((v) => <option key={v} value={v}>{t(`origin.${v}`)}</option>)}
            </Select>
          </Field>
        ) : null}
        <Checkbox id="filter-stock" label={t('parts.inStockOnly')} checked={current.inStock === '1'} onChange={(e) => update({ inStock: e.target.checked ? '1' : null })} />
        <Field id="filter-sort" label={t('parts.sort')}>
          <Select id="filter-sort" value={current.sort ?? 'relevance'} onChange={(e) => update({ sort: e.target.value === 'relevance' ? null : e.target.value })}>
            <option value="relevance">{t('parts.sortRelevance')}</option>
            <option value="newest">{t('parts.sortNewest')}</option>
            <option value="price_asc">{t('parts.sortPriceAsc')}</option>
            <option value="price_desc">{t('parts.sortPriceDesc')}</option>
            <option value="name">{t('parts.sortName')}</option>
          </Select>
        </Field>
        <button
          type="button"
          className="min-h-11 cursor-pointer rounded-[var(--radius-control)] border border-line-strong text-sm font-semibold transition-colors hover:border-ink hover:bg-surface lg:hidden"
          onClick={() => start(() => router.replace(cleared, { scroll: false }))}
        >
          {t('parts.clearFilters')}
        </button>
      </div>
    </section>
  );
}
