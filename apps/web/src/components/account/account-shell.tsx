'use client';

import { Bell, ClipboardList, Home, LogOut, MapPin, MessageSquare, Package, RotateCcw, Truck, UserRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { api } from '@/lib/api/client';

export function AccountShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const items = [
    { href: '/account', label: t('account.overview'), icon: Home },
    { href: '/account/orders', label: t('account.orders'), icon: Package },
    { href: '/account/requests', label: t('account.requests'), icon: ClipboardList },
    { href: '/account/procurements', label: t('account.procurements'), icon: Truck },
    { href: '/account/messages', label: t('account.messages'), icon: MessageSquare },
    { href: '/account/notifications', label: t('account.notifications'), icon: Bell },
    { href: '/account/returns', label: t('account.returns'), icon: RotateCcw },
    { href: '/account/addresses', label: t('account.addresses'), icon: MapPin },
    { href: '/account/profile', label: t('account.profile'), icon: UserRound },
  ];
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so server components and the header pick up the new session
    window.location.assign(`/${locale}`);
  };
  return (
    <div className="page-canvas container-page grid grid-cols-1 gap-6 py-6 md:py-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
      {/* grid-cols-1 + min-w-0: on phones the section strip scrolls inside itself instead of widening the page. */}
      <nav aria-label={t('account.title')} className="min-w-0 lg:sticky lg:top-32 lg:h-fit">
        <ul className="scroll-strip -mx-4 flex gap-1 px-4 pb-1 md:-mx-6 md:px-6 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:rounded-[var(--radius-card)] lg:border lg:border-line-soft lg:bg-white lg:p-2">
          {items.map(({ href, label, icon: Icon }) => {
            const active = href === '/account' ? pathname === '/account' : pathname.startsWith(href);
            return (
              <li key={href} className="shrink-0">
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-[var(--radius-control)] border px-3 text-sm font-medium transition-colors lg:border-0 lg:border-s-2 lg:rounded-s-none ${active ? 'border-carbon bg-carbon text-white lg:border-tech lg:bg-surface lg:font-bold lg:text-ink' : 'border-line-soft bg-white text-ink hover:border-line-strong lg:border-transparent lg:bg-transparent lg:hover:bg-surface'}`}
                >
                  <Icon aria-hidden className={`size-4 shrink-0 ${active ? 'lg:text-tech' : 'text-steel'}`} />
                  {label}
                </Link>
              </li>
            );
          })}
          <li className="shrink-0 lg:mt-1 lg:border-t lg:border-line-soft lg:pt-1">
            <button type="button" onClick={logout} className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-[var(--radius-control)] border border-line-soft bg-white px-3 text-sm font-medium text-danger transition-colors hover:bg-danger-soft lg:border-0 lg:bg-transparent">
              <LogOut aria-hidden className="size-4 shrink-0" />
              {t('nav.logout')}
            </button>
          </li>
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
