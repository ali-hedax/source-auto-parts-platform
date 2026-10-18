import type { CatalogEntrySearchResult } from '@hedax/contracts';
import { ArrowLeft, ArrowRight, BookOpenText, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { CatalogEntryCard } from './catalog-entry-card';

/**
 * Home page → «کاتالوگ فنی قطعات»: a search box that opens /catalog with the query, and the latest
 * published catalog parts. A plain form (GET), so it works before any script has loaded.
 */
export function CatalogHomeSection({ recent }: { recent: CatalogEntrySearchResult | null }) {
  const t = useTranslations('technicalCatalog');
  const locale = useLocale();
  const Arrow = locale === 'fa' ? ArrowLeft : ArrowRight;
  return (
    <section aria-labelledby="catalog-home-title" className="container-page render-lazy pt-14" data-testid="catalog-home">
      <div className="rounded-3xl border border-[#e1eaf5] bg-white p-5 shadow-sm sm:p-7">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#e9f3ff] text-[#096ce5]"><BookOpenText className="size-6" aria-hidden /></span>
            <div className="min-w-0">
              <h2 id="catalog-home-title" className="text-xl font-bold">{t('homeTitle')}</h2>
              <p className="mt-1 text-sm leading-7 text-steel">{t('homeText')}</p>
            </div>
          </div>
          <form action={`/${locale}/catalog`} method="get" role="search" aria-label={t('searchLabel')} className="flex gap-2">
            <label htmlFor="catalog-home-q" className="sr-only">{t('searchLabel')}</label>
            <input
              id="catalog-home-q" name="q" type="search" maxLength={120} autoComplete="off" enterKeyHint="search" placeholder={t('searchPlaceholder')}
              className="min-h-12 min-w-0 flex-1 rounded-[var(--radius-control)] border border-line-strong bg-white px-4 text-base outline-none transition-colors placeholder:text-steel focus:border-action focus:ring-2 focus:ring-action/30"
            />
            <button type="submit" className="inline-flex min-h-12 shrink-0 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] bg-action px-5 font-semibold text-white transition-colors hover:bg-action-hover">
              <Search aria-hidden className="size-4" /><span className="hidden sm:inline">{t('search')}</span><span className="sr-only sm:hidden">{t('search')}</span>
            </button>
          </form>
        </div>
        {recent && recent.items.length ? (
          <div className="mt-6 border-t border-line-soft pt-5">
            <div className="mb-3 flex items-end justify-between gap-4">
              <h3 className="font-bold">{t('recent')}</h3>
              <Link href="/catalog" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-action hover:underline">
                {t('viewAll')} <Arrow aria-hidden className="size-4" />
              </Link>
            </div>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
              {recent.items.slice(0, 4).map((entry) => <li key={entry.slug}><CatalogEntryCard entry={entry} /></li>)}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
