import { DEFAULT_BUILDER_LOGO, localize } from '@hedax/contracts/constants';
import type { BuilderDocument, Currency, SiteContentView } from '@hedax/contracts';
import { Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { Link } from '@/i18n/navigation';
import { AccountLink, CartLink } from './header-client';
import { HomeHeaderShell } from './home-header-shell';
import { MobileNav } from './mobile-nav';
import { CurrencySwitcher, LocaleSwitcher } from './switchers';
import './home-header.css';

const DEFAULT_LOGO = '/brand/source/logo-dark.png';

/**
 * Home page header: a large centred SOURCE by HEDAX logo on the film's dark ground, minimal links, and
 * compact menu / search / language / account / cart controls. The part search lives in the discovery
 * area under the film (the search control jumps there). Logos, size and alignment come from
 * Appearance → header and footer, so a new logo needs no code change.
 */
export function HomeHeaderView({ content, chrome, currency, searchHref }: {
  content: SiteContentView | null; chrome?: BuilderDocument['chrome'] | undefined; currency: Currency; searchHref: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const brand = content?.brand;
  const logo = chrome?.logo ?? DEFAULT_BUILDER_LOGO;
  const nav = chrome?.menu.length ? chrome.menu.filter((n) => n.visible && n.href).map((n) => ({ href: n.href, label: localize(n.label, locale) })) : [
    { href: '/parts', label: t('nav.parts') },
    { href: '/imported-parts', label: t('nav.imported') },
    { href: '/brands', label: t('nav.brands') },
    { href: '/cars', label: t('nav.cars') },
    { href: '/request-part', label: t('nav.requestPart') },
  ];
  const alt = localize(brand?.logoAlt, locale) || localize(brand?.siteName, locale) || 'SOURCE by HEDAX';
  const desktopLogo = logo.headerUrl || brand?.logoUrl || DEFAULT_LOGO;
  const mobileLogo = logo.mobileUrl || desktopLogo;
  return (
    <HomeHeaderShell className="home-header on-dark" data-size={logo.size} data-align={logo.align}>
      <div className="hh-inner">
        <div className="hh-start">
          <MobileNav items={nav} alwaysVisible extra={<><Suspense fallback={null}><LocaleSwitcher /></Suspense><CurrencySwitcher initial={currency} /><AccountLink /></>} />
          <nav className="hh-links" aria-label={t('common.menu')}>
            <ul>{nav.slice(0, 3).map((n) => <li key={n.href}><Link href={n.href}>{n.label}</Link></li>)}</ul>
          </nav>
        </div>
        <Link href="/" className="hh-logo" aria-label={localize(brand?.siteTitle, locale) || alt}>
          <picture>
            {mobileLogo !== desktopLogo ? <source media="(max-width: 639px)" srcSet={mobileLogo} /> : null}
            <img src={desktopLogo} alt={alt} width={600} height={191} fetchPriority="high" decoding="async" />
          </picture>
        </Link>
        <div className="hh-end">
          <a href={searchHref} className="hh-icon" aria-label={t('search.label')}><Search aria-hidden className="size-5" /></a>
          {/* On phones language and account sit in the menu, leaving room for the large logo. */}
          <span className="hh-wide"><Suspense fallback={null}><LocaleSwitcher /></Suspense></span>
          <span className="hh-wide"><AccountLink /></span>
          <CartLink />
        </div>
      </div>
    </HomeHeaderShell>
  );
}
