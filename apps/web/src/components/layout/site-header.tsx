import { localize } from '@hedax/contracts/constants';
import Image from 'next/image';
import { Search } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { displayCurrency } from '@/lib/preferences';
import { DEFAULT_LOGO, getSiteContent } from '@/lib/site-content';
import { AccountLink, CartLink } from './header-client';
import { HeaderNav } from './header-nav';
import { Suspense } from 'react';
import { CurrencySwitcher, LocaleSwitcher } from './switchers';
import { MobileNav } from './mobile-nav';

/** Carbon header: mark, part-name search, language, currency, account and cart (spec §4, §5.1). */
export async function SiteHeader() {
  const t = await getTranslations();
  const locale = await getLocale();
  const currency = await displayCurrency();
  const brand = (await getSiteContent())?.brand;
  const nav = [
    { href: '/parts', label: t('nav.parts') },
    { href: '/imported-parts', label: t('nav.imported') },
    { href: '/brands', label: t('nav.brands') },
    { href: '/cars', label: t('nav.cars') },
    { href: '/request-part', label: t('nav.requestPart') },
  ] as const;
  // Logo, its alt text and the site title come from site content → general.
  const alt = localize(brand?.logoAlt, locale) || localize(brand?.siteName, locale);
  return (
    <header className="on-dark sticky top-0 z-40 border-b border-sky-300/10 bg-gradient-to-l from-[#09182e] via-[#102745] to-[#09182e] text-silver shadow-[0_8px_24px_-16px_rgba(4,20,42,0.8)]">
      <div className="container-page flex h-16 items-center gap-1 sm:gap-3 lg:gap-6">
        <MobileNav items={nav.map((n) => ({ href: n.href, label: n.label }))} />
        <Link href="/" className="flex shrink-0 items-center rounded-[var(--radius-control)] p-1" aria-label={localize(brand?.siteTitle, locale) || alt}>
          <Image src={brand?.logoUrl || DEFAULT_LOGO} width={600} height={191} unoptimized alt={alt} className="hidden h-10 w-auto sm:block" />
          <Image src="/brand/source/icon-64.png" width={64} height={64} unoptimized alt={alt} className="size-9 sm:hidden" />
        </Link>
        <form action={`/${locale}/parts`} method="get" role="search" className="hidden min-w-0 flex-1 md:flex">
          <label htmlFor="header-search" className="sr-only">
            {t('search.label')}
          </label>
          <div className="flex h-11 w-full max-w-2xl items-stretch overflow-hidden rounded-xl border border-sky-100/50 bg-white text-ink shadow-sm outline-offset-2 focus-within:outline-3 focus-within:outline-tech-light">
            <Search aria-hidden className="ms-3 size-5 shrink-0 self-center text-steel" />
            <input
              id="header-search"
              name="q"
              type="search"
              autoComplete="off"
              placeholder={t('search.placeholder')}
              className="min-w-0 flex-1 bg-transparent px-3 text-[0.9375rem] placeholder:text-steel/80 focus-visible:outline-none"
            />
            <button type="submit" className="shrink-0 cursor-pointer bg-[#096ce5] px-5 text-sm font-bold text-white transition-colors hover:bg-[#0967d3] focus-visible:bg-[#0967d3] focus-visible:underline focus-visible:outline-none" aria-label={t('search.submit')}>
              {t('common.search')}
            </button>
          </div>
        </form>
        <div className="ms-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
          <Suspense fallback={null}>
            <LocaleSwitcher />
          </Suspense>
          <CurrencySwitcher initial={currency} />
          <span aria-hidden className="mx-1 hidden h-6 w-px bg-white/15 sm:block" />
          <AccountLink />
          <CartLink />
        </div>
      </div>
      <div className="hidden border-t border-white/10 md:block">
        <HeaderNav items={nav.map((n) => ({ href: n.href, label: n.label }))} label={t('common.menu')} />
      </div>
      <form action={`/${locale}/parts`} method="get" role="search" className="header-search-mobile container-page pb-3 md:hidden">
        <label htmlFor="header-search-mobile" className="sr-only">
          {t('search.label')}
        </label>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute inset-y-0 start-3 my-auto size-5 text-steel" />
          <input
            id="header-search-mobile"
            name="q"
            type="search"
            placeholder={t('search.placeholder')}
            className="h-11 w-full rounded-xl border border-sky-100/60 bg-white ps-10 pe-3 text-ink shadow-sm placeholder:text-steel/80"
          />
        </div>
      </form>
    </header>
  );
}
