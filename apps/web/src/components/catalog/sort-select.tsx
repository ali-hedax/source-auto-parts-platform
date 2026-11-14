'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';

/** Result order above the catalogue grid; kept in the URL like every filter. */
export function SortSelect({ current }: { current: Record<string, string | undefined> }) {
  const t = useTranslations('parts');
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="su-sort" aria-busy={pending}>
      <span>{t('sort')}</span>
      <select className="su-select" value={current.sort ?? 'relevance'} onChange={(e) => {
        const next = new URLSearchParams();
        for (const [k, v] of Object.entries({ ...current, sort: e.target.value === 'relevance' ? undefined : e.target.value, page: undefined })) if (v) next.set(k, v);
        start(() => router.replace(`${pathname}${next.size ? `?${next.toString()}` : ''}`, { scroll: false }));
      }}>
        <option value="relevance">{t('sortRelevance')}</option>
        <option value="newest">{t('sortNewest')}</option>
        <option value="price_asc">{t('sortPriceAsc')}</option>
        <option value="price_desc">{t('sortPriceDesc')}</option>
        <option value="name">{t('sortName')}</option>
      </select>
    </label>
  );
}
