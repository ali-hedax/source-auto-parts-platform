'use client';

import type { OrderView, PaymentRedirect } from '@hedax/contracts';
import { formatDecimalString } from '@hedax/domain';
import { ExternalLink } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DateTime, Money } from '@/components/ui/format';
import { Alert, DefinitionList, Ltr, PageHeader, Section, StatusBadge, TableScroll, td, th } from '@/components/ui/misc';
import { ChatThread } from '@/components/chat/chat-thread';
import { api, newIdempotencyKey } from '@/lib/api/client';
import { ReturnRequestButton } from './return-request';

export function Timeline({ events }: { events: OrderView['timeline'] }) {
  const t = useTranslations();
  return (
    <ol className="relative flex flex-col gap-4 border-s-2 border-line ps-5">
      {events.map((e, i) => (
        <li key={i} className="relative">
          <span aria-hidden className="absolute -start-[1.72rem] top-1.5 size-3 rounded-full border-2 border-white bg-action" />
          <p className="font-semibold">
            {e.toState
              ? (t.has(`status.${e.toState}`) ? t(`status.${e.toState}` as never) : e.toState)
              : (t.has(`timelineEvent.${e.type}`) ? t(`timelineEvent.${e.type}` as never) : e.type)}
          </p>
          <p className="text-sm text-steel"><DateTime iso={e.at} /></p>
          {e.note ? <p className="text-sm">{e.note}</p> : null}
        </li>
      ))}
    </ol>
  );
}

/** Customer view of a stock order or a sourcing (procurement) order. */
export function OrderDetail({ order }: { order: OrderView }) {
  const t = useTranslations();
  const locale = useLocale() as 'fa' | 'en';
  const [paying, setPaying] = useState(false);
  const pay = async () => {
    setPaying(true);
    try {
      const res = await api<PaymentRedirect>(order.kind === 'STOCK_ORDER' ? `/orders/${order.id}/pay` : `/procurements/${order.id}/pay`, { method: 'POST', idempotencyKey: newIdempotencyKey() });
      window.location.assign(res.redirectUrl);
    } catch {
      setPaying(false);
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<Ltr>{order.reference}</Ltr>}
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={order.status} label={t(`status.${order.status}` as never)} />
            <StatusBadge status={order.paymentStatus} label={t(`status.${order.paymentStatus}` as never)} />
          </div>
        }
      />
      {order.status === 'AWAITING_PAYMENT' ? (
        <Alert tone="warning" title={t('status.AWAITING_PAYMENT')}>
          <Button className="mt-2" onClick={pay} loading={paying}>{t('order.payNow')}</Button>
        </Alert>
      ) : null}
      <TableScroll caption={t('checkout.items')}>
        <thead>
          <tr>
            <th className={th}>{t('cart.item')}</th>
            <th className={th}>{t('parts.partType')}</th>
            <th className={th}>{t('parts.quantity')}</th>
            <th className={th}>{t('cart.unitPrice')}</th>
            <th className={th}>{t('cart.lineTotal')}</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((l, i) => (
            <tr key={i}>
              <td className={td}>
                <span className="font-semibold">{locale === 'en' ? (l.name.en ?? l.name.fa) : l.name.fa}</span>
                {l.sku ? <span className="block text-xs text-steel"><Ltr>{l.sku}</Ltr></span> : null}
              </td>
              <td className={td}>{t(`partType.${l.partType}` as never)} · {t(`condition.${l.condition}` as never)}</td>
              <td className={td}>{locale === 'fa' ? l.quantity.toLocaleString('fa-IR') : l.quantity}</td>
              <td className={td}><Money value={l.unitPrice} /></td>
              <td className={td}><Money value={l.lineTotal} /></td>
            </tr>
          ))}
        </tbody>
      </TableScroll>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t('order.total')} id="totals">
          <DefinitionList
            items={[
              { term: t('checkout.items'), value: <Money value={order.totals.items} /> },
              ...(order.totals.shipping ? [{ term: t('checkout.shippingCost'), value: <Money value={order.totals.shipping} /> }] : []),
              { term: t('checkout.tax'), value: <Money value={order.totals.tax} /> },
              { term: t('checkout.grandTotal'), value: <Money value={order.totals.grandTotal} className="text-lg font-bold" /> },
              { term: t('order.date'), value: <DateTime iso={order.createdAt} /> },
            ]}
          />
          {order.fx ? <p className="mt-3 text-xs text-steel">{t('order.fxRecorded', { rate: formatDecimalString(order.fx.irrPerAed, locale) })}</p> : null}
        </Section>
        <Section title={t('order.timeline')} id="timeline">
          <Timeline events={order.timeline} />
        </Section>
      </div>
      {order.schedule ? (
        <Section title={t('quote.schedule')} id="schedule">
          <DefinitionList
            items={[
              { term: t('order.promisedReady'), value: <DateTime iso={order.schedule.promisedReadyAt} withTime={false} /> },
              { term: t('order.currentEstimate'), value: <DateTime iso={order.schedule.currentReadyEstimate} withTime={false} /> },
              ...(order.schedule.changeReason ? [{ term: t('order.changeReason'), value: order.schedule.changeReason }] : []),
            ]}
          />
        </Section>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        {order.address ? (
          <Section title={t('order.address')} id="address">
            <p className="font-semibold">{order.address.recipientName}</p>
            <p>{order.address.province}، {order.address.city}</p>
            <p>{order.address.addressLine}</p>
            <p className="text-sm text-steel"><Ltr>{order.address.postalCode}</Ltr></p>
          </Section>
        ) : null}
        {order.shipment ? (
          <Section title={t('order.shipment')} id="shipment">
            <DefinitionList
              items={[
                { term: t('checkout.shipping'), value: order.shipment.method },
                ...(order.shipment.trackingCode ? [{ term: t('order.tracking'), value: <Ltr>{order.shipment.trackingCode}</Ltr> }] : []),
                ...(order.shipment.shippedAt ? [{ term: t('status.SHIPPED'), value: <DateTime iso={order.shipment.shippedAt} /> }] : []),
                ...(order.shipment.deliveredAt ? [{ term: t('status.DELIVERED'), value: <DateTime iso={order.shipment.deliveredAt} /> }] : []),
              ]}
            />
            {order.shipment.trackingUrl ? (
              <a href={order.shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-1 font-semibold text-action underline">
                {t('order.trackingLink')} <ExternalLink aria-hidden className="size-4" />
              </a>
            ) : null}
          </Section>
        ) : null}
      </div>
      {order.receipts.length ? (
        <Section title={t('order.receipt')} id="receipts">
          <ul className="flex flex-col gap-2">
            {order.receipts.map((r) => (
              <li key={r.attemptId} className="flex flex-wrap justify-between gap-2 rounded bg-surface p-3">
                <Money value={r.amount} className="font-semibold" />
                <span className="text-sm text-steel"><DateTime iso={r.paidAt} /></span>
                {r.providerReference ? <span className="text-sm">{t('payment.reference')}: <Ltr>{r.providerReference}</Ltr></span> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {order.kind === 'STOCK_ORDER' && ['CONFIRMED', 'PREPARING'].includes(order.status) ? <ReturnRequestButton orderId={order.id} kind="CANCEL" /> : null}
        {order.kind === 'STOCK_ORDER' && order.status === 'DELIVERED' && order.lines.some((l) => l.returnableQuantity > 0) ? (
          <ReturnRequestButton orderId={order.id} kind="RETURN" lines={order.lines} />
        ) : null}
      </div>
      {order.conversationId ? <ChatThread conversationId={order.conversationId} /> : null}
    </div>
  );
}
