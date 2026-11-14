import { localize } from '@hedax/contracts/constants';
import { ClipboardList } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { BuilderDocument, SiteContentView } from '@hedax/contracts';
import { Suspense } from 'react';
import { Link } from '@/i18n/navigation';
import type { MoneyUnit } from '@/lib/money-unit';
import { PartSearch } from '@/components/store/part-search';
import { AccountLink, CartLink } from './header-client';
import { HeaderNav } from './header-nav';
import { CurrencySwitcher, LocaleSwitcher } from './switchers';
import { MobileNav } from './mobile-nav';

const DEFAULT_LOGO = '/brand/source/atelier/logo.webp';

/**
 * Sticky storefront header on every page: logo, the part search box, «درخواست تأمین قطعه», language
 * and price unit, the account menu (customer and staff sign-in) and the cart; the main sections
 * sit in a second row on wide screens and in the drawer on phones. Menu items and logos come from
 * Appearance → header (built-in defaults otherwise).
 */
export function SiteHeaderView({ content, chrome, currency }: { content: SiteContentView | null; chrome?: BuilderDocument['chrome'] | undefined; currency: MoneyUnit }) {
  const t = useTranslations();
  const locale = useLocale() as 'fa' | 'en';
  const brand = content?.brand;
  const nav = chrome?.menu.length ? chrome.menu.filter(n => n.visible && n.href).map(n => ({ href: n.href, label: localize(n.label, locale) })) : [
    { href: '/parts', label: t('nav.parts') },
    { href: '/imported-parts', label: t('nav.imported') },
    { href: '/cars', label: t('nav.cars') },
    { href: '/brands', label: t('nav.brands') },
    { href: '/request-part', label: t('nav.requestPart') },
  ];
  const sections = nav.filter((n) => n.href !== '/request-part');
  const alt = localize(brand?.logoAlt, locale) || localize(brand?.siteName, locale) || 'Source by HEDAX';
  const logo = chrome?.logo?.headerUrl || (brand?.logoUrl && !brand.logoUrl.startsWith('/brand/source/logo-') ? brand.logoUrl : DEFAULT_LOGO);
  const mobileLogo = chrome?.logo?.mobileUrl || logo;
  return <header className="su-header">
    <div className="container-page su-header-top">
      <MobileNav items={nav} currency={currency} />
      <Link href="/" className="su-logo" aria-label={localize(brand?.siteTitle, locale) || alt}>
        <picture>
          {mobileLogo !== logo ? <source media="(max-width: 639px)" srcSet={mobileLogo} /> : null}
          <img src={logo} alt={alt} width={1100} height={368} decoding="async" fetchPriority="high" />
        </picture>
      </Link>
      <div className="su-header-search"><PartSearch locale={locale} variant="header" idPrefix="header-search" /></div>
      <div className="su-header-actions">
        <Link href="/request-part" className="su-btn su-btn-outline su-header-request"><ClipboardList aria-hidden size={18} />{t('nav.requestPart')}</Link>
        <span className="su-header-prefs"><Suspense fallback={null}><LocaleSwitcher /></Suspense><CurrencySwitcher initial={currency} /></span>
        <AccountLink />
        <CartLink />
      </div>
    </div>
    <div className="su-header-nav"><HeaderNav items={sections} label={t('common.menu')} /></div>
  </header>;
}
