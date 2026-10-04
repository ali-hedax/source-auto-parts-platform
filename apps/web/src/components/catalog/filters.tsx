'use client';

import type { CategoryView, VehicleBrandView } from '@hedax/contracts';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { Checkbox, Field, Input, Select } from '@/components/ui/field';
import { Num } from '@/components/ui/format';

export type FilterKey = 'q' | 'brand' | 'category' | 'partType' | 'condition' | 'origin' | 'inStock' | 'sort';

/**
 * All filters live in the URL, so back/forward restore the exact view.
 * Typing is debounced (~300ms); navigation transitions cancel stale renders.
 * The current values come from the server page as props, so the panel is part
 * of the first HTML chunk and never pushes the results down later (a late
 * streamed panel measured CLS 0.66 on mobile). On small screens it is collapsed
 * behind a button so results are visible first; from `lg` up it is always open.
 */
export function CatalogFilters({ categories, brands, current, showOrigin = true }: { categories: CategoryView[]; brands: VehicleBrandView[]; current: Partial<Record<FilterKey, string>>; showOrigin?: boolean }) {
  const t = useTranslations();
  const locale = useLocale() as 'fa' | 'en';
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(current.q ?? '');
  const [open, setOpen] = useState(false);
  const active = (['q', 'brand', 'category', 'partType', 'condition', 'origin', 'inStock'] as const).filter((k) => current[k]).length;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...current, ...patch })) {
      if (v) next.set(k, v);
    }
    start(() => router.replace(`${pathname}${next.size ? `?${next.toString()}` : ''}`, { scroll: false }));
  };

  useEffect(() => {
    setQ(current.q ?? '');
  }, [current.q]);

  const name = (n: { fa: string; en: string | null }) => (locale === 'en' ? (n.en ?? n.fa) : n.fa);

  return (
    <section aria-labelledby="filters-title" className="card p-4" aria-busy={pending}>
      <h2 id="filters-title" className="mb-4 hidden items-center gap-2 font-bold lg:flex">
        <SlidersHorizontal aria-hidden className="size-5" />
        {t('parts.filters')}
      </h2>
      <button
        type="button"
        className="flex min-h-11 w-full cursor-pointer items-center gap-2 font-bold lg:hidden"
        aria-expanded={open}
        aria-controls="filters-body"
        onClick={() => setOpen((o) => !o)}
      >
        <SlidersHorizontal aria-hidden className="size-5" />
        {t('parts.filters')}
        {active ? <span className="rounded-full bg-action px-2 text-xs text-white"><Num value={active} /></span> : null}
        <ChevronDown aria-hidden className={`ms-auto size-5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div id="filters-body" className={`${open ? 'mt-4 flex' : 'hidden'} flex-col gap-4 lg:mt-0 lg:flex`}>
        <Field id="filter-q" label={t('search.label')} hint={t('search.hint')}>
          <Input
            id="filter-q"
            type="search"
            value={q}
            aria-describedby="filter-q-hint"
            placeholder={t('search.placeholder')}
            onChange={(e) => {
              const value = e.target.value;
              setQ(value);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => update({ q: value.trim() || null }), 300);
            }}
          />
        </Field>
        <Field id="filter-brand" label={t('parts.brand')}>
          <Select id="filter-brand" value={current.brand ?? ''} onChange={(e) => update({ brand: e.target.value })}>
            <option value="">{t('common.all')}</option>
            {brands.map((b) => (
              <option key={b.slug} value={b.slug}>{name(b.name)}</option>
            ))}
          </Select>
        </Field>
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
          className="min-h-11 cursor-pointer rounded border border-line text-sm font-semibold hover:bg-surface"
          onClick={() => start(() => router.replace(pathname, { scroll: false }))}
        >
          {t('parts.clearFilters')}
        </button>
      </div>
    </section>
  );
}
