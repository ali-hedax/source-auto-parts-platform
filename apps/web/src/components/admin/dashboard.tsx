'use client';

import type { DashboardView } from '@hedax/contracts';
import { useTranslations } from 'next-intl';
import { Async } from '@/components/ui/async';
import { Num } from '@/components/ui/format';
import { Badge, PageHeader, Section } from '@/components/ui/misc';
import { Link } from '@/i18n/navigation';
import { useApi } from '@/lib/use-api';

export function AdminDashboard() {
  const t = useTranslations('admin');
  const state = useApi<DashboardView>('/admin/dashboard');
  return (
    <>
      <PageHeader title={t('dashboard')} />
      <Async state={state}>
        {(d) => {
          const tiles = [
            { label: t('ordersNeedingAction'), value: d.ordersNeedingAction, href: '/admin/orders' },
            { label: t('newRequests'), value: d.newSourcingRequests, href: '/admin/sourcing' },
            { label: t('paymentsPending'), value: d.paymentsPendingVerification, href: '/admin/payments' },
            { label: t('delayed'), value: d.delayedProcurements, href: '/admin/procurements' },
            { label: t('lowStock'), value: d.lowStockProducts, href: '/admin/inventory?lowStock=1' },
            { label: t('unreadConversations'), value: d.unreadConversations, href: '/admin/conversations' },
          ];
          return (
            <div className="flex flex-col gap-6">
              {/* One strip of counters, each opening the list it counts; work waiting is marked in Tech Blue. */}
              <ul className="grid grid-cols-2 overflow-hidden rounded-[var(--radius-card)] border border-line-soft bg-line-soft [gap:1px] md:grid-cols-3 xl:grid-cols-6">
                {tiles.map((tile) => (
                  <li key={tile.label} className="bg-white">
                    <Link href={tile.href} className="group flex h-full flex-col justify-between gap-3 p-4 transition-colors hover:bg-surface focus-visible:outline-offset-[-3px] lg:p-5">
                      <span className="text-sm font-medium leading-6 text-steel group-hover:text-ink">{tile.label}</span>
                      <span className="flex items-center gap-2">
                        {tile.value > 0 ? <span aria-hidden className="size-2 rounded-full bg-tech" /> : null}
                        <span className={`text-[1.75rem] font-bold leading-none ${tile.value > 0 ? 'text-ink' : 'text-steel'}`}><Num value={tile.value} /></span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Section title={t('launchReadiness')} id="readiness">
                <ul className="grid md:grid-cols-2 md:gap-x-8">
                  {d.launchReadiness.map((r) => (
                    <li key={r.key} className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line-soft py-2.5">
                      <span>{t.has(`ready_${r.key}`) ? t(`ready_${r.key}` as never) : r.key}</span>
                      <Badge tone={r.status === 'READY' ? 'success' : r.status === 'SIMULATED' || r.status === 'ATTENTION' ? 'warning' : 'danger'}>{t(`readiness_${r.status}`)}</Badge>
                    </li>
                  ))}
                </ul>
              </Section>
            </div>
          );
        }}
      </Async>
    </>
  );
}
