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
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {tiles.map((tile) => (
                  <li key={tile.label}>
                    <Link href={tile.href} className="card flex h-full flex-col gap-1 p-4 hover:border-tech">
                      <span className="text-sm text-steel">{tile.label}</span>
                      <span className="text-2xl font-bold"><Num value={tile.value} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Section title={t('launchReadiness')} id="readiness">
                <ul className="grid gap-2 md:grid-cols-2">
                  {d.launchReadiness.map((r) => (
                    <li key={r.key} className="flex items-center justify-between gap-2 rounded bg-surface p-3">
                      <span>{t.has(`ready_${r.key}`) ? t(`ready_${r.key}` as never) : r.key}</span>
                      <Badge tone={r.status === 'READY' ? 'success' : r.status === 'SIMULATED' ? 'warning' : 'danger'}>{t(`readiness_${r.status}`)}</Badge>
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
