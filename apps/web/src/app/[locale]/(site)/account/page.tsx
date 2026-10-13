'use client';

import type { MeView } from '@hedax/contracts';
import { useTranslations } from 'next-intl';
import { ButtonLink } from '@/components/ui/button';
import { Async } from '@/components/ui/async';
import { DateTime, Money } from '@/components/ui/format';
import { Alert, Code, EmptyState, PageHeader, Section, StatusBadge } from '@/components/ui/misc';
import { Link } from '@/i18n/navigation';
import { useApi } from '@/lib/use-api';

interface OrderRow { id: string; reference: string; status: string; paymentStatus: string; grandTotal: { currency: 'IRR'; amountMinor: string }; createdAt: string }
interface RequestRow { id: string; reference: string; title: string; status: string; createdAt: string }

export default function AccountOverviewPage() {
  const t = useTranslations();
  const me = useApi<MeView>('/me');
  const orders = useApi<OrderRow[]>('/orders');
  const requests = useApi<RequestRow[]>('/sourcing-requests');
  const actionable = (requests.data ?? []).filter((r) => r.status === 'QUOTED' || r.status === 'NEEDS_CUSTOMER_INFO');
  return (
    <Async state={me}>
      {(m) => (
        <div className="flex flex-col gap-6">
          <PageHeader title={t('account.title')} description={m.displayName ?? m.mobileMasked ?? ''} />
          {m.unreadMessages > 0 ? (
            <Alert tone="info" title={t('account.unread', { count: m.unreadMessages })}>
              <Link href="/account/messages" className="font-semibold underline">{t('account.messages')}</Link>
            </Alert>
          ) : null}
          {actionable.length ? (
            <Alert tone="warning" title={t('account.nextAction')}>
              <ul className="list-disc ps-5">
                {actionable.map((r) => (
                  <li key={r.id}>
                    <Link href={`/account/requests/${r.id}`} className="underline underline-offset-4"><Code>{r.reference}</Code> — {t(`status.${r.status}` as never)}</Link>
                  </li>
                ))}
              </ul>
            </Alert>
          ) : null}
          <Section title={t('account.orders')} id="ov-orders" actions={<Link href="/account/orders" className="inline-flex min-h-9 items-center text-sm font-semibold text-action underline-offset-4 hover:underline">{t('common.details')}</Link>}>
            {orders.data?.length ? (
              <ul className="-my-1 divide-y divide-line-soft">
                {orders.data.slice(0, 3).map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                    <Link href={`/account/orders/${o.id}`} className="me-auto font-semibold text-action underline-offset-4 hover:underline"><Code>{o.reference}</Code></Link>
                    <StatusBadge status={o.status} label={t(`status.${o.status}` as never)} />
                    <Money value={o.grandTotal} className="font-semibold" />
                    <span className="text-sm text-steel"><DateTime iso={o.createdAt} withTime={false} /></span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-steel">{t('account.noOrders')}</p>
            )}
          </Section>
          <Section title={t('account.requests')} id="ov-requests" actions={<ButtonLink href="/request-part" size="sm">{t('nav.requestPart')}</ButtonLink>}>
            {requests.data?.length ? (
              <ul className="-my-1 divide-y divide-line-soft">
                {requests.data.slice(0, 3).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                    <Link href={`/account/requests/${r.id}`} className="min-w-0 font-semibold text-action underline-offset-4 hover:underline">{r.title}</Link>
                    <StatusBadge status={r.status} label={t(`status.${r.status}` as never)} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title={t('account.noRequests')} />
            )}
          </Section>
        </div>
      )}
    </Async>
  );
}
