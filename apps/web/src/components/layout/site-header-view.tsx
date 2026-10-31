import { localize } from '@hedax/contracts/constants';
import { HeaderWordmark } from './header-wordmark';
import { Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { BuilderDocument, SiteContentView, Currency } from '@hedax/contracts';
import { Link } from '@/i18n/navigation';
const DEFAULT_LOGO = '/brand/source/atelier/logo.webp';
import { AccountLink, CartLink } from './header-client';
import { HeaderNav } from './header-nav';
import { Suspense, type CSSProperties } from 'react';
import { CurrencySwitcher, LocaleSwitcher } from './switchers';
import { MobileNav } from './mobile-nav';

/** Quiet one-row storefront header; catalogue search remains one click away. */
export function SiteHeaderView({ content, chrome, currency }: { content: SiteContentView | null; chrome?: BuilderDocument['chrome'] | undefined; currency: Currency }) {
  const t = useTranslations();
  const locale = useLocale();
  const brand = content?.brand;
  const nav = chrome?.menu.length ? chrome.menu.filter(n => n.visible && n.href).map(n => ({ href: n.href, label: localize(n.label, locale) })) : [
    { href: '/parts', label: t('nav.parts') },
    { href: '/imported-parts', label: t('nav.imported') },
    { href: '/brands', label: t('nav.brands') },
    { href: '/cars', label: t('nav.cars') },
    { href: '/request-part', label: t('nav.requestPart') },
  ] as const;
  // Logo, its alt text and the site title come from site content → general.
  const alt = localize(brand?.logoAlt, locale) || localize(brand?.siteName, locale);
  const logo = chrome?.logo?.headerUrl || (brand?.logoUrl && brand.logoUrl !== '/brand/source/logo-dark.png' ? brand.logoUrl : DEFAULT_LOGO);
  return <header className="titanium-header">
    <div className="container-page titanium-header-inner">
      <MobileNav items={nav.map(n => ({ href: n.href, label: n.label }))} currency={currency} />
      <Link href="/" className="titanium-logo" style={{ '--ti-logo-width': `${({ md: 240, lg: 300, xl: 340 })[chrome?.logo?.size ?? 'lg']}px` } as CSSProperties} aria-label={localize(brand?.siteTitle, locale) || alt}>
        <HeaderWordmark src={logo} {...(chrome?.logo?.mobileUrl ? { mobileSrc: chrome.logo.mobileUrl } : {})} alt={alt || 'Source by HEDAX'} />
      </Link>
      <div className="titanium-desktop-nav"><HeaderNav items={nav.map(n => ({ href: n.href, label: n.label }))} label={t('common.menu')} /></div>
      <div className="titanium-header-controls">
        <Link href="/parts" className="titanium-search-link" aria-label={t('search.label')}><Search size={20} aria-hidden /></Link>
        <div className="titanium-preferences"><Suspense fallback={null}><LocaleSwitcher /></Suspense><CurrencySwitcher initial={currency} /></div>
        <AccountLink /><CartLink />
      </div>
    </div>
  </header>;
}
