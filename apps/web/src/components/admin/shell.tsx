'use client';

import Image from 'next/image';
import styles from '@/components/layout/brand.module.css';
import type { MeView } from '@hedax/contracts';
import {
  BarChart3, Boxes, CalendarDays, ClipboardList, CreditCard, FileSpreadsheet, FileText, Gauge, History, Landmark, LogOut, MessageSquare,
  Package, Receipt, RotateCcw, ScrollText, Settings, ShieldCheck, Tags, Truck, Users, UserCog, Wallet,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { useApi } from '@/lib/use-api';
import { Async } from '@/components/ui/async';
import { LocaleSwitcher } from '@/components/layout/switchers';
import { Suspense } from 'react';

/** Inline bilingual microcopy for admin-only labels (both languages always provided). */
export function useL(): (fa: string, en: string) => string {
  const locale = useLocale();
  return (fa, en) => (locale === 'fa' ? fa : en);
}

/** Label for a system code (`admin.<group>_<CODE>` in the messages); an unknown code is shown as is. */
export function useCodeLabel(): (group: string, code: string) => string {
  const t = useTranslations('admin');
  return (group, code) => (t.has(`${group}_${code}`) ? t(`${group}_${code}` as never) : code);
}

/** "PUBLIC:BASE_IRR" / "inquiry:NO_VALID_FX_RATE" (from the API's price explanation) in words. */
export function usePriceSourceLabel(): (source: string) => string {
  const label = useCodeLabel();
  const t = useTranslations('price');
  return (source) => {
    const [first = '', second = ''] = source.split(':');
    if (first === 'inquiry') return `${t('inquiry')} — ${label('priceInquiry', second)}`;
    return `${label('priceTier', first)} · ${label('pricePayable', second)}`;
  };
}

interface NavItem { href: string; label: string; icon: typeof Gauge; perm?: string }

export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations('admin');
  const tn = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const me = useApi<MeView>('/me');
  const groups: Array<{ title: string; items: NavItem[] }> = [
    { title: '', items: [{ href: '/admin', label: t('dashboard'), icon: Gauge, perm: 'dashboard.view' }] },
    {
      title: t('products'),
      items: [
        { href: '/admin/products', label: t('products'), icon: Package, perm: 'products.read' },
        { href: '/admin/taxonomy', label: t('taxonomy'), icon: Tags, perm: 'products.read' },
        { href: '/admin/inventory', label: t('inventory'), icon: Boxes, perm: 'inventory.read' },
        { href: '/admin/imports', label: t('imports'), icon: FileSpreadsheet, perm: 'imports.run' },
      ],
    },
    {
      title: t('sourcing'),
      items: [
        { href: '/admin/sourcing', label: t('sourcing'), icon: ClipboardList },
        { href: '/admin/quotes', label: t('quotes'), icon: ScrollText, perm: 'quotes.write' },
        { href: '/admin/procurements', label: t('procurements'), icon: Truck, perm: 'procurement.read' },
        { href: '/admin/conversations', label: t('conversations'), icon: MessageSquare },
      ],
    },
    {
      title: t('orders'),
      items: [
        { href: '/admin/orders', label: t('orders'), icon: Receipt, perm: 'orders.read' },
        { href: '/admin/payments', label: t('payments'), icon: CreditCard, perm: 'payments.read' },
        { href: '/admin/refunds', label: t('refunds'), icon: Wallet, perm: 'payments.read' },
        { href: '/admin/returns', label: t('returns'), icon: RotateCcw, perm: 'returns.manage' },
      ],
    },
    {
      title: t('customers'),
      items: [
        { href: '/admin/customers', label: t('customers'), icon: Users, perm: 'customers.read' },
        { href: '/admin/staff', label: t('staff'), icon: UserCog, perm: 'users.manage' },
        { href: '/admin/roles', label: t('roles'), icon: ShieldCheck, perm: 'users.manage' },
      ],
    },
    {
      title: t('settings'),
      items: [
        { href: '/admin/fx', label: t('fx'), icon: Landmark, perm: 'fx.manage' },
        { href: '/admin/shipping', label: t('shipping'), icon: Truck, perm: 'shipping.manage' },
        { href: '/admin/policies', label: t('policies'), icon: FileText, perm: 'content.manage' },
        { href: '/admin/calendar', label: t('calendar'), icon: CalendarDays, perm: 'settings.manage' },
        { href: '/admin/settings', label: t('settings'), icon: Settings, perm: 'settings.manage' },
        { href: '/admin/reports', label: t('reports'), icon: BarChart3, perm: 'reports.read' },
        { href: '/admin/audit', label: t('audit'), icon: History, perm: 'audit.read' },
      ],
    },
  ];
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so server components and the header pick up the new session
    window.location.assign(`/${locale}/staff/login`);
  };
  return (
    <div className="min-h-screen bg-surface">
      <header className="on-dark sticky top-0 z-40 bg-carbon text-silver">
        <div className="flex min-h-14 items-center gap-3 px-4">
          <Link href="/admin" className="font-extrabold text-white"><span className={styles.adminBrand}><Image src="/brand/source/icon-64.png" width={64} height={64} unoptimized alt={locale === 'fa' ? 'سورس — محصولی از هداکس' : 'Source by HEDAX'} className={styles.adminIcon} /></span> · <span className="font-semibold text-tech-light">{t('title')}</span></Link>
          <div className="ms-auto flex items-center gap-2 text-sm">
            <Suspense fallback={null}><LocaleSwitcher /></Suspense>
            {me.data ? <span className="hidden sm:inline">{me.data.displayName}</span> : null}
            <Link href="/" className="inline-flex min-h-11 items-center rounded px-2 hover:bg-white/10">{tn('home')}</Link>
            <button type="button" onClick={logout} className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded px-2 hover:bg-white/10">
              <LogOut aria-hidden className="size-4" />
              <span className="sr-only sm:not-sr-only">{tn('logout')}</span>
            </button>
          </div>
        </div>
      </header>
      <Async state={me}>
        {(user) =>
          user.kind !== 'STAFF' ? (
            <p className="p-8">{t('noPermission')}</p>
          ) : (
            <div className="grid lg:grid-cols-[16rem_1fr]">
              <nav aria-label={t('title')} className="border-e border-line-soft bg-white lg:min-h-[calc(100vh-3.5rem)]">
                <ul className="flex gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible">
                  {groups.map((g) => {
                    const visible = g.items.filter((i) => !i.perm || user.permissions.includes(i.perm));
                    if (!visible.length) return null;
                    return (
                      <li key={g.title || 'root'} className="shrink-0 lg:shrink">
                        {g.title ? <p className="hidden px-3 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-steel lg:block">{g.title}</p> : null}
                        <ul className="flex gap-1 lg:flex-col">
                          {visible.map(({ href, label, icon: Icon }) => {
                            const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
                            return (
                              <li key={href} className="shrink-0">
                                <Link href={href} aria-current={active ? 'page' : undefined}
                                  className={`flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] px-3 text-sm font-medium ${active ? 'bg-carbon text-white' : 'text-ink hover:bg-surface'}`}>
                                  <Icon aria-hidden className="size-4" />
                                  {label}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              </nav>
              <main id="main" tabIndex={-1} className="min-w-0 p-4 focus:outline-none md:p-6">{children}</main>
            </div>
          )
        }
      </Async>
    </div>
  );
}
