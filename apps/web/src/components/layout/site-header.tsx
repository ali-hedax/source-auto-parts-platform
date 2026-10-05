import Image from 'next/image';
import styles from './brand.module.css';
import { Search } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { displayCurrency } from '@/lib/preferences';
import { AccountLink, CartLink } from './header-client';
import { Suspense } from 'react';
import { CurrencySwitcher, LocaleSwitcher } from './switchers';
import { MobileNav } from './mobile-nav';

/** Carbon header: wordmark, part-name search, language, currency, account and cart (spec §4, §5.1). */
export async function SiteHeader() {
  const t = await getTranslations();
  const locale = await getLocale();
  const currency = await displayCurrency();
  const nav = [
    { href: '/parts', label: t('nav.parts') },
    { href: '/imported-parts', label: t('nav.imported') },
    { href: '/brands', label: t('nav.brands') },
    { href: '/request-part', label: t('nav.requestPart') },
  ] as const;
  return (
    <header className="on-dark sticky top-0 z-40 bg-carbon text-silver shadow-sm">
      <div className="container-page flex min-h-16 items-center gap-3 py-2">
        <MobileNav items={nav.map((n) => ({ href: n.href, label: n.label }))} />
        <Link href="/" className={`flex shrink-0 items-baseline gap-2 rounded px-1 text-white ${styles.headerBrand}`} aria-label={t('meta.siteTitle')}>
          <Image src="/brand/source/logo-dark.png" width={600} height={191} unoptimized alt={locale === 'fa' ? 'سورس — محصولی از هداکس' : 'Source by HEDAX'} className={styles.headerWordmark} />
          <Image src="/brand/source/icon-64.png" width={64} height={64} unoptimized alt="" className={styles.headerIcon} />
        </Link>
        <form action={`/${locale}/parts`} method="get" role="search" className="mx-2 hidden flex-1 md:flex">
          <label htmlFor="header-search" className="sr-only">
            {t('search.label')}
          </label>
          <div className="relative w-full max-w-xl">
            <input
              id="header-search"
              name="q"
              type="search"
              autoComplete="off"
              placeholder={t('search.placeholder')}
              className="min-h-11 w-full rounded-[var(--radius-control)] border border-carbon-2 bg-white px-3 pe-11 text-ink placeholder:text-steel"
            />
            <button type="submit" className="absolute inset-y-0 end-0 grid w-11 cursor-pointer place-items-center text-action" aria-label={t('search.submit')}>
              <Search aria-hidden className="size-5" />
            </button>
          </div>
        </form>
        <div className="ms-auto flex items-center gap-1">
          <Suspense fallback={null}>
            <LocaleSwitcher />
          </Suspense>
          <CurrencySwitcher initial={currency} />
          <AccountLink />
          <CartLink />
        </div>
      </div>
      <nav aria-label={t('common.menu')} className="hidden border-t border-carbon-2 md:block">
        <ul className="container-page flex gap-1 py-1 text-sm">
          {nav.map((n) => (
            <li key={n.href}>
              <Link href={n.href} className="inline-flex min-h-10 items-center rounded px-3 hover:bg-white/10">
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <form action={`/${locale}/parts`} method="get" role="search" className="container-page pb-3 md:hidden">
        <label htmlFor="header-search-mobile" className="sr-only">
          {t('search.label')}
        </label>
        <input
          id="header-search-mobile"
          name="q"
          type="search"
          placeholder={t('search.placeholder')}
          className="min-h-11 w-full rounded-[var(--radius-control)] border border-carbon-2 bg-white px-3 text-ink placeholder:text-steel"
        />
      </form>
    </header>
  );
}
