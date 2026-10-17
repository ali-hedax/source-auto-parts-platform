'use client';

import type { CategoryView, VehicleBrandView, VehiclePublicView } from '@hedax/contracts';
import { Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { usePathname, useRouter } from '@/i18n/navigation';

type Current = Partial<Record<'q' | 'brand' | 'vehicle' | 'model' | 'category', string>>;

/**
 * /catalog search: a name or technical number, and filters for vehicle brand, vehicle, model and
 * part group. A filter applies at once; the text applies with «جست‌وجو» (or Enter). The address
 * holds everything, so a search can be shared or bookmarked.
 */
export function CatalogSearchForm({ current, brands, vehicles, categories }: { current: Current; brands: VehicleBrandView[]; vehicles: VehiclePublicView[]; categories: CategoryView[] }) {
  const t = useTranslations('technicalCatalog');
  const locale = useLocale() as 'fa' | 'en';
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(current.q ?? '');
  useEffect(() => setQ(current.q ?? ''), [current.q]);
  const name = (n: { fa: string; en: string | null }) => (locale === 'en' ? (n.en ?? n.fa) : n.fa);
  const vehicle = vehicles.find((v) => v.slug === current.vehicle);

  const go = (patch: Current) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...current, ...patch })) if (v) next.set(k, v);
    start(() => router.replace(`${pathname}${next.size ? `?${next.toString()}` : ''}`, { scroll: false }));
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    go({ q: q.trim() || undefined });
  };
  const hasFilters = !!(current.q || current.brand || current.vehicle || current.category);

  return (
    <form role="search" aria-label={t('searchLabel')} onSubmit={submit} aria-busy={pending} className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line-soft bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field id="catalog-q" label={t('searchLabel')} className="min-w-0 flex-1">
          <Input id="catalog-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlaceholder')} maxLength={120} autoComplete="off" enterKeyHint="search" />
        </Field>
        <Button type="submit" loading={pending} className="sm:w-auto"><Search aria-hidden className="size-4" />{t('search')}</Button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="catalog-brand" label={t('brand')}>
          <Select id="catalog-brand" value={current.brand ?? ''} onChange={(e) => go({ brand: e.target.value || undefined })}>
            <option value="">{t('all')}</option>
            {brands.map((b) => <option key={b.slug} value={b.slug}>{name(b.name)}</option>)}
          </Select>
        </Field>
        <Field id="catalog-vehicle" label={t('vehicle')}>
          <Select id="catalog-vehicle" value={current.vehicle ?? ''} onChange={(e) => go({ vehicle: e.target.value || undefined, model: undefined })}>
            <option value="">{t('all')}</option>
            {vehicles.map((v) => <option key={v.slug} value={v.slug}>{name(v.name)}</option>)}
          </Select>
        </Field>
        <Field id="catalog-model" label={t('model')}>
          <Select id="catalog-model" value={current.model ?? ''} disabled={!vehicle?.models.length} onChange={(e) => go({ model: e.target.value || undefined })}>
            <option value="">{t('all')}</option>
            {(vehicle?.models ?? []).map((m) => <option key={m.slug} value={m.slug}>{name(m.name)}</option>)}
          </Select>
        </Field>
        <Field id="catalog-category" label={t('category')}>
          <Select id="catalog-category" value={current.category ?? ''} onChange={(e) => go({ category: e.target.value || undefined })}>
            <option value="">{t('all')}</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.parentSlug ? '— ' : ''}{name(c.name)}</option>)}
          </Select>
        </Field>
      </div>
      {hasFilters ? (
        <button type="button" onClick={() => { setQ(''); start(() => router.replace(pathname, { scroll: false })); }} className="inline-flex min-h-11 cursor-pointer items-center self-start rounded-[var(--radius-control)] px-2 text-sm font-semibold text-action hover:underline">
          {t('clear')}
        </button>
      ) : null}
    </form>
  );
}
