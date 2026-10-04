'use client';

import type { MoneyDto } from '@hedax/contracts';
import { useTranslations } from 'next-intl';
import { ButtonLink } from '@/components/ui/button';
import { Async } from '@/components/ui/async';
import { DateTime, Money } from '@/components/ui/format';
import { EmptyState, Ltr, PageHeader, StatusBadge, TableScroll, td, th } from '@/components/ui/misc';
import { Link } from '@/i18n/navigation';
import { useApi } from '@/lib/use-api';

interface OrderRow { id: string; reference: string; status: string; paymentStatus: string; grandTotal: MoneyDto; createdAt: string }
interface ProcRow { id: string; reference: string; status: string; paymentStatus: string; total: MoneyDto; promisedReadyAt: string | null; createdAt: string }
interface RequestRow { id: string; reference: string; title: string; status: string; itemCount: number; createdAt: string }

export function OrdersList() {
  const t = useTranslations();
  const state = useApi<OrderRow[]>('/orders');
  return (
    <>
      <PageHeader title={t('account.orders')} />
      <Async state={state}>
        {(rows) =>
          rows.length ? (
            <TableScroll caption={t('account.orders')}>
              <thead>
                <tr>
                  <th className={th}>{t('order.reference')}</th>
                  <th className={th}>{t('order.date')}</th>
                  <th className={th}>{t('order.status')}</th>
                  <th className={th}>{t('order.paymentStatus')}</th>
                  <th className={th}>{t('order.total')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td className={td}><Link href={`/account/orders/${o.id}`} className="font-semibold text-action underline"><Ltr>{o.reference}</Ltr></Link></td>
                    <td className={td}><DateTime iso={o.createdAt} withTime={false} /></td>
                    <td className={td}><StatusBadge status={o.status} label={t(`status.${o.status}` as never)} /></td>
                    <td className={td}><StatusBadge status={o.paymentStatus} label={t(`status.${o.paymentStatus}` as never)} /></td>
                    <td className={td}><Money value={o.grandTotal} /></td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          ) : (
            <EmptyState title={t('account.noOrders')} />
          )
        }
      </Async>
    </>
  );
}

export function ProcurementsList() {
  const t = useTranslations();
  const state = useApi<ProcRow[]>('/procurements');
  return (
    <>
      <PageHeader title={t('account.procurements')} />
      <Async state={state}>
        {(rows) =>
          rows.length ? (
            <TableScroll caption={t('account.procurements')}>
              <thead>
                <tr>
                  <th className={th}>{t('order.reference')}</th>
                  <th className={th}>{t('order.status')}</th>
                  <th className={th}>{t('order.promisedReady')}</th>
                  <th className={th}>{t('order.total')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className={td}><Link href={`/account/procurements/${p.id}`} className="font-semibold text-action underline"><Ltr>{p.reference}</Ltr></Link></td>
                    <td className={td}><StatusBadge status={p.status} label={t(`status.${p.status}` as never)} /></td>
                    <td className={td}><DateTime iso={p.promisedReadyAt} withTime={false} /></td>
                    <td className={td}><Money value={p.total} /></td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          ) : (
            <EmptyState title={t('account.noOrders')} />
          )
        }
      </Async>
    </>
  );
}

export function RequestsList() {
  const t = useTranslations();
  const state = useApi<RequestRow[]>('/sourcing-requests');
  return (
    <>
      <PageHeader title={t('account.requests')} actions={<ButtonLink href="/request-part">{t('nav.requestPart')}</ButtonLink>} />
      <Async state={state}>
        {(rows) =>
          rows.length ? (
            <TableScroll caption={t('account.requests')}>
              <thead>
                <tr>
                  <th className={th}>{t('request.reference')}</th>
                  <th className={th}>{t('request.requestTitle')}</th>
                  <th className={th}>{t('order.status')}</th>
                  <th className={th}>{t('order.date')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className={td}><Link href={`/account/requests/${r.id}`} className="font-semibold text-action underline"><Ltr>{r.reference}</Ltr></Link></td>
                    <td className={td}>{r.title}</td>
                    <td className={td}><StatusBadge status={r.status} label={t(`status.${r.status}` as never)} /></td>
                    <td className={td}><DateTime iso={r.createdAt} withTime={false} /></td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          ) : (
            <EmptyState title={t('account.noRequests')}>
              <ButtonLink href="/request-part" className="mt-2">{t('nav.requestPart')}</ButtonLink>
            </EmptyState>
          )
        }
      </Async>
    </>
  );
}
