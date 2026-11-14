'use client';

import type { CategoryView, FinderGroupView, ManufacturerView, VehiclePublicView } from '@hedax/contracts';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { VehicleSteps } from './vehicle-steps';

export type FilterKey = 'q' | 'group' | 'vehicle' | 'model' | 'year' | 'brand' | 'maker' | 'category' | 'partType' | 'condition' | 'origin' | 'inStock' | 'sort';

/**
 * Catalogue filters. Every value lives in the URL (back/forward restore the view; transitions cancel
 * stale renders) and arrives from the server page as props, so the panel is in the first HTML and never
 * shifts the results. Vehicle: three steps loaded on demand (no full vehicle list in the page);
 * categories: checkboxes with counts; part type, condition and origin: chips; «فقط کالای موجود»
 * stands apart. On phones the panel is collapsed behind a button so results come first.
 */
export function CatalogFilters({ categories, groups, makers = [], fixedVehicle, current, showOrigin = true }: {
  categories: CategoryView[]; groups: FinderGroupView[]; makers?: ManufacturerView[]; fixedVehicle?: VehiclePublicView; current: Partial<Record<FilterKey, string>>; showOrigin?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale() as 'fa' | 'en';
  const fa = locale === 'fa';
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const chosenCategories = (current.category ?? '').split(',').filter(Boolean);
  const active = (['group', 'vehicle', 'model', 'brand', 'maker', 'partType', 'condition', 'origin', 'inStock'] as const).filter((k) => current[k]).length + chosenCategories.length;

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...current, ...patch, page: null })) if (v) next.set(k, v);
    start(() => router.replace(`${pathname}${next.size ? `?${next.toString()}` : ''}`, { scroll: false }));
  };
  const toggleCategory = (slug: string) => {
    const set = new Set(chosenCategories);
    if (set.has(slug)) set.delete(slug); else set.add(slug);
    update({ category: [...set].join(',') || null });
  };
  const name = (n: { fa: string; en: string | null }) => (fa ? n.fa : n.en || n.fa);
  const chip = (key: 'partType' | 'condition' | 'origin', value: string, label: string) => {
    const on = current[key] === value;
    return <button key={value} type="button" className="su-chip" aria-pressed={on} onClick={() => update({ [key]: on ? null : value })}>{label}</button>;
  };

  return (
    <section aria-labelledby="filters-title" className="su-filters" aria-busy={pending}>
      <button type="button" className="su-filters-toggle" aria-expanded={open} aria-controls="filters-body" onClick={() => setOpen((o) => !o)}>
        <SlidersHorizontal aria-hidden size={20} />
        <span id="filters-title">{t('parts.filters')}</span>
        {active ? <span className="su-count">{active.toLocaleString(fa ? 'fa-IR' : 'en-US')}</span> : null}
        <ChevronDown aria-hidden size={20} className="su-filters-chevron" />
      </button>
      <div id="filters-body" className="su-filters-body" data-open={open}>
        <div className="su-filter-block su-filter-stock">
          <label className="su-switch">
            <input type="checkbox" checked={current.inStock === '1'} onChange={(e) => update({ inStock: e.target.checked ? '1' : null })} />
            <span>{t('parts.inStockOnly')}</span>
          </label>
        </div>

        {fixedVehicle ? null : <div className="su-filter-block">
          <h3>{t('parts.vehicle')}</h3>
          <VehicleSteps key={`${current.group ?? ""}|${current.vehicle ?? ""}|${current.model ?? ""}`} mode="filter" groups={groups} locale={locale} idPrefix="filter-vehicle"
            initial={{ group: current.group ?? '', vehicle: current.vehicle ?? '', model: current.model ?? '' }}
            onChange={(c) => update({ group: c.group || null, vehicle: c.vehicle || null, model: c.model || null, year: null })} />
        </div>}

        {categories.length ? <fieldset className="su-filter-block">
          <legend>{t('parts.category')}</legend>
          <ul className="su-checklist">
            {categories.map((c) => (
              <li key={c.slug}>
                <label>
                  <input type="checkbox" checked={chosenCategories.includes(c.slug)} onChange={() => toggleCategory(c.slug)} />
                  <span className="su-checklist-name">{name(c.name)}</span>
                  <span className="su-checklist-count">{c.productCount.toLocaleString(fa ? 'fa-IR' : 'en-US')}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset> : null}

        <div className="su-filter-block" role="group" aria-labelledby="filter-type-title">
          <h3 id="filter-type-title">{t('parts.partType')}</h3>
          <div className="su-chips">{(['GENUINE', 'OEM', 'AFTERMARKET'] as const).map((v) => chip('partType', v, t(`partType.${v}`)))}</div>
        </div>

        <div className="su-filter-block" role="group" aria-labelledby="filter-condition-title">
          <h3 id="filter-condition-title">{t('parts.condition')}</h3>
          <div className="su-chips">{(['NEW', 'USED', 'REFURBISHED'] as const).map((v) => chip('condition', v, t(`condition.${v}`)))}</div>
        </div>

        {/* «نامشخص» is an internal state, never offered to customers. */}
        {showOrigin ? <div className="su-filter-block" role="group" aria-labelledby="filter-origin-title">
          <h3 id="filter-origin-title">{t('parts.origin')}</h3>
          <div className="su-chips">{(['DOMESTIC', 'IMPORTED'] as const).map((v) => chip('origin', v, t(`origin.${v}`)))}</div>
        </div> : null}

        {makers.length ? <div className="su-filter-block">
          <label htmlFor="filter-maker"><h3>{t('parts.maker')}</h3></label>
          <select id="filter-maker" className="su-select" value={current.maker ?? ''} onChange={(e) => update({ maker: e.target.value || null })}>
            <option value="">{t('parts.allMakers')}</option>
            {makers.map((m) => <option key={m.slug} value={m.slug}>{name(m.name)}</option>)}
          </select>
        </div> : null}
      </div>
    </section>
  );
}
