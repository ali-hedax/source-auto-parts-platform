'use client';

import * as RDialog from '@radix-ui/react-dialog';
import Image from 'next/image';
import type { MeView } from '@hedax/contracts';
import {
  BarChart3, Boxes, CalendarDays, CircleUser, ClipboardList, CreditCard, FileSpreadsheet, FileText, Gauge, History, Landmark, LogOut, MessageSquare,
  Menu, Package, Receipt, RotateCcw, ScrollText, Settings, ShieldCheck, Store, Tags, Truck, Users, UserCog, Wallet, X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
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
interface NavGroup { title: string; items: NavItem[] }

export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations('admin');
  const tn = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const me = useApi<MeView>('/me');
  const groups: NavGroup[] = [
    {
      title: '',
      items: [
        { href: '/admin', label: t('dashboard'), icon: Gauge, perm: 'dashboard.view' },
        { href: '/admin/account', label: t('myAccount'), icon: CircleUser },
      ],
    },
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
  const alt = locale === 'fa' ? 'سورس — محصولی از هداکس' : 'Source by HEDAX';
  return (
    <div className="min-h-screen bg-canvas">
      <header className="on-dark sticky top-0 z-40 bg-carbon text-silver">
        <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 md:px-5">
          {me.data?.kind === 'STAFF' ? <AdminDrawer groups={groups} permissions={me.data.permissions} pathname={pathname} title={t('title')} /> : null}
          <Link href="/admin" className="flex shrink-0 items-center gap-3 rounded-[var(--radius-control)] p-1">
            <Image src="/brand/source/logo-dark.png" width={600} height={191} unoptimized alt={alt} className="hidden h-8 w-auto sm:block" />
            <Image src="/brand/source/icon-64.png" width={64} height={64} unoptimized alt={alt} className="size-8 sm:hidden" />
            <span aria-hidden className="hidden h-5 w-px bg-white/20 sm:block" />
            <span className="text-sm font-semibold text-tech-light">{t('title')}</span>
          </Link>
          <div className="ms-auto flex items-center gap-1 text-sm">
            <Suspense fallback={null}><LocaleSwitcher /></Suspense>
            {me.data ? (
              <span className="hidden max-w-48 items-center gap-2 truncate px-2 md:inline-flex">
                <CircleUser aria-hidden className="size-4 shrink-0 text-silver/70" />
                <span className="truncate">{me.data.displayName}</span>
              </span>
            ) : null}
            <Link href="/" className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 transition-colors hover:bg-white/10">
              <Store aria-hidden className="size-4" />
              <span className="hidden sm:inline">{tn('home')}</span>
              <span className="sr-only sm:hidden">{tn('home')}</span>
            </Link>
            <button type="button" onClick={logout} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 transition-colors hover:bg-white/10">
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
            <div className="grid grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)]">
              <nav aria-label={t('title')} className="hidden border-e border-line-soft bg-white lg:sticky lg:top-14 lg:block lg:h-[calc(100vh-3.5rem)] lg:overflow-y-auto">
                <AdminNavList groups={groups} permissions={user.permissions} pathname={pathname} />
              </nav>
              <main id="main" tabIndex={-1} className="min-w-0 px-4 py-5 focus:outline-none md:px-6 md:py-6 lg:px-8 lg:py-8">{children}</main>
            </div>
          )
        }
      </Async>
    </div>
  );
}

function isActive(href: string, pathname: string): boolean {
  return href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);
}

/** Grouped section links; only the sections the signed-in role may open are listed. */
function AdminNavList({ groups, permissions, pathname, onNavigate }: { groups: NavGroup[]; permissions: string[]; pathname: string; onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-0.5 p-3">
      {groups.map((g) => {
        const visible = g.items.filter((i) => !i.perm || permissions.includes(i.perm));
        if (!visible.length) return null;
        return (
          <li key={g.title || 'root'}>
            {g.title ? <p className="px-3 pb-1.5 pt-5 text-xs font-semibold text-steel">{g.title}</p> : null}
            <ul className="flex flex-col gap-0.5">
              {visible.map(({ href, label, icon: Icon }) => {
                const active = isActive(href, pathname);
                return (
                  <li key={href}>
                    <Link href={href} aria-current={active ? 'page' : undefined} onClick={onNavigate}
                      className={`flex min-h-10 items-center gap-2.5 rounded-e-[var(--radius-control)] border-s-2 px-3 text-sm transition-colors ${active ? 'border-tech bg-surface font-bold text-ink' : 'border-transparent font-medium text-ink/90 hover:bg-surface hover:text-ink'}`}>
                      <Icon aria-hidden className={`size-4 shrink-0 ${active ? 'text-tech' : 'text-steel'}`} />
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
  );
}

/** Phones and tablets: the same list in a drawer (focus trapped, Escape closes, focus returns). */
function AdminDrawer({ groups, permissions, pathname, title }: { groups: NavGroup[]; permissions: string[]; pathname: string; title: string }) {
  const tc = useTranslations('common');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <RDialog.Root open={open} onOpenChange={setOpen}>
      <RDialog.Trigger className="grid size-11 cursor-pointer place-items-center rounded-[var(--radius-control)] transition-colors hover:bg-white/10 lg:hidden" aria-label={tc('openMenu')}>
        <Menu aria-hidden className="size-6" />
      </RDialog.Trigger>
      <RDialog.Portal>
        <RDialog.Overlay className="overlay-fade fixed inset-0 z-50 bg-carbon/60" />
        <RDialog.Content className="drawer-start fixed inset-y-0 start-0 z-50 flex w-[min(18rem,85vw)] flex-col bg-white shadow-[var(--shadow-overlay)]" dir={locale === 'fa' ? 'rtl' : 'ltr'}>
          <div className="on-dark flex h-14 shrink-0 items-center justify-between gap-3 bg-carbon px-4 text-silver">
            <RDialog.Title className="text-sm font-semibold text-tech-light">{title}</RDialog.Title>
            <RDialog.Close className="-me-2 grid size-11 cursor-pointer place-items-center rounded-[var(--radius-control)] transition-colors hover:bg-white/10" aria-label={tc('closeMenu')}>
              <X aria-hidden className="size-5" />
            </RDialog.Close>
          </div>
          <RDialog.Description className="sr-only">{title}</RDialog.Description>
          <nav aria-label={title} className="flex-1 overflow-y-auto">
            <AdminNavList groups={groups} permissions={permissions} pathname={pathname} onNavigate={() => setOpen(false)} />
          </nav>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
