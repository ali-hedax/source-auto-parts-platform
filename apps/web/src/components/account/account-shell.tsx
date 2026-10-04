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
    <div className="container-page grid gap-6 py-8 lg:grid-cols-[15rem_1fr]">
      <nav aria-label={t('account.title')} className="lg:sticky lg:top-28 lg:h-fit">
        <ul className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
          {items.map(({ href, label, icon: Icon }) => {
            const active = href === '/account' ? pathname === '/account' : pathname.startsWith(href);
            return (
              <li key={href} className="shrink-0">
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-3 text-sm font-medium ${active ? 'bg-carbon text-white' : 'hover:bg-surface'}`}
                >
                  <Icon aria-hidden className="size-4" />
                  {label}
                </Link>
              </li>
            );
          })}
          <li className="shrink-0">
            <button type="button" onClick={logout} className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-3 text-sm font-medium text-danger hover:bg-danger-soft">
              <LogOut aria-hidden className="size-4" />
              {t('nav.logout')}
            </button>
          </li>
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
