'use client';

import type { MoneyDto, OrderView } from '@hedax/contracts';
import { STOCK_ORDER_MACHINE, PROCUREMENT_MACHINE } from '@hedax/domain';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Async } from '@/components/ui/async';
import { Field, Input, Select } from '@/components/ui/field';
import { DateTime, Money, Num } from '@/components/ui/format';
import { Alert, Badge, DefinitionList, EmptyState, Ltr, PageHeader, Section, StatusBadge, TableScroll, td, th } from '@/components/ui/misc';
import { OrderDetail } from '@/components/orders/order-detail';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';
import { useApi } from '@/lib/use-api';
import { useCodeLabel, useL } from './shell';

interface OrderRow { id: string; reference: string; status: string; paymentStatus: string; customer: string | null; grandTotal: MoneyDto; createdAt: string }
interface ProcRow { id: string; reference: string; status: string; paymentStatus: string; customer: string | null; assignee: string | null; total: MoneyDto; promisedReadyAt: string | null; currentReadyEstimate: string | null; delayed: boolean }

export function AdminOrdersList() {
  const t = useTranslations();
  const [status, setStatus] = useState('');
  const state = useApi<OrderRow[]>(`/admin/orders${status ? `?status=${status}` : ''}`);
  return (
    <>
      <PageHeader title={t('admin.orders')} />
      <Field id="ao-status" label={t('order.status')} className="mb-3 max-w-xs">
        <Select id="ao-status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('common.all')}</option>
          {Object.keys(STOCK_ORDER_MACHINE).map((s) => <option key={s} value={s}>{t(`status.${s}` as never)}</option>)}
        </Select>
      </Field>
      <Async state={state}>
        {(rows) => rows.length ? (
          <TableScroll caption={t('admin.orders')}>
            <thead><tr><th className={th}>{t('order.reference')}</th><th className={th}>{t('admin.customer')}</th><th className={th}>{t('order.status')}</th><th className={th}>{t('order.paymentStatus')}</th><th className={th}>{t('order.total')}</th><th className={th}>{t('order.date')}</th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td className={td}><Link href={`/admin/orders/${o.id}`} className="font-semibold text-action underline"><Ltr>{o.reference}</Ltr></Link></td>
                  <td className={td}>{o.customer ?? '—'}</td>
                  <td className={td}><StatusBadge status={o.status} label={t(`status.${o.status}` as never)} /></td>
                  <td className={td}><StatusBadge status={o.paymentStatus} label={t(`status.${o.paymentStatus}` as never)} /></td>
                  <td className={td}><Money value={o.grandTotal} /></td>
                  <td className={td}><DateTime iso={o.createdAt} /></td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        ) : <EmptyState title={t('account.noOrders')} />}
      </Async>
    </>
  );
}

interface ShippingMethod { id: string; nameFa: string; nameEn: string | null }

function TransitionPanel({ kind, id, status, version, onDone }: { kind: 'orders' | 'procurements'; id: string; status: string; version: number; onDone: () => void }) {
  const t = useTranslations();
  const l = useL();
  const machine = (kind === 'orders' ? STOCK_ORDER_MACHINE : PROCUREMENT_MACHINE) as Record<string, readonly string[]>;
  const next = (machine[status] ?? []).filter((s) => s !== 'CONFIRMED' && s !== 'PROCUREMENT_PENDING');
  const methods = useApi<ShippingMethod[]>('/admin/shipping-methods');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [methodId, setMethodId] = useState('');
  const [tracking, setTracking] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!next.length) return null;
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/${kind}/${id}/transition`, {
        method: 'POST',
        body: { toState: to, reason: reason || undefined, version, ...(to === 'SHIPPED' ? { shipment: { shippingMethodId: methodId, trackingCode: tracking || undefined } } : {}) },
      });
      onDone();
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title={t('admin.transition')} id="transition">
      <div className="grid gap-3 md:grid-cols-4">
        <Field id="tr-to" label={t('order.status')}>
          <Select id="tr-to" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">—</option>
            {next.map((s) => <option key={s} value={s}>{t(`status.${s}` as never)}</option>)}
          </Select>
        </Field>
        <Field id="tr-reason" label={t('order.reason')} hint={['CANCELLED', 'EXCEPTION', 'ON_HOLD'].includes(to) ? l('برای این وضعیت دلیل الزامی است', 'A reason is required for this status') : undefined}>
          <Input id="tr-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {to === 'SHIPPED' ? (
          <>
            <Field id="tr-method" label={t('checkout.shipping')}>
              <Select id="tr-method" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
                <option value="">—</option>
                {(methods.data ?? []).map((m) => <option key={m.id} value={m.id}>{l(m.nameFa, m.nameEn ?? m.nameFa)}</option>)}
              </Select>
            </Field>
            <Field id="tr-tracking" label={t('order.tracking')} optionalLabel={t('common.optional')}><Input id="tr-tracking" dir="ltr" value={tracking} onChange={(e) => setTracking(e.target.value)} /></Field>
          </>
        ) : null}
      </div>
      {error ? <Alert tone="danger" className="mt-3" title={error} /> : null}
      <Button className="mt-3" loading={busy} disabled={!to || (to === 'SHIPPED' && !methodId)} onClick={() => void submit()}>{t('admin.transition')}</Button>
    </Section>
  );
}

export function AdminOrderPage() {
  const { id } = useParams<{ id: string }>();
  const state = useApi<OrderView & { version: number }>(`/admin/orders/${id}`);
  return (
    <Async state={state}>
      {(o) => (
        <div className="flex flex-col gap-6">
          <TransitionPanel kind="orders" id={o.id} status={o.status} version={o.version} onDone={() => void state.reload()} />
          <OrderDetail order={o} />
        </div>
      )}
    </Async>
  );
}

export function AdminProcurementsList() {
  const t = useTranslations();
  const state = useApi<ProcRow[]>('/admin/procurements');
  return (
    <>
      <PageHeader title={t('admin.procurements')} />
      <Async state={state}>
        {(rows) => rows.length ? (
          <TableScroll caption={t('admin.procurements')}>
            <thead><tr><th className={th}>{t('order.reference')}</th><th className={th}>{t('admin.customer')}</th><th className={th}>{t('admin.assignee')}</th><th className={th}>{t('order.status')}</th><th className={th}>{t('order.promisedReady')}</th><th className={th}>{t('order.currentEstimate')}</th><th className={th}>{t('order.total')}</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className={td}><Link href={`/admin/procurements/${p.id}`} className="font-semibold text-action underline"><Ltr>{p.reference}</Ltr></Link>{p.delayed ? <Badge tone="danger" className="ms-1">{t('admin.delayed')}</Badge> : null}</td>
                  <td className={td}>{p.customer ?? '—'}</td>
                  <td className={td}>{p.assignee ?? '—'}</td>
                  <td className={td}><StatusBadge status={p.status} label={t(`status.${p.status}` as never)} /></td>
                  <td className={td}><DateTime iso={p.promisedReadyAt} withTime={false} /></td>
                  <td className={td}><DateTime iso={p.currentReadyEstimate} withTime={false} /></td>
                  <td className={td}><Money value={p.total} /></td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        ) : <EmptyState title={t('account.noOrders')} />}
      </Async>
    </>
  );
}

type StaffProcurement = OrderView & {
  version: number;
  items: Array<{ id: string; description: string; quantity: number; status: string; supplier: string | null; supplierOrderRef: string | null; unitCost: MoneyDto | null }>;
  dateChanges: Array<{ field: string; previous: string | null; next: string; reason: string; at: string }>;
};

export function AdminProcurementPage() {
  const t = useTranslations();
  const l = useL();
  const label = useCodeLabel();
  const { id } = useParams<{ id: string }>();
  const state = useApi<StaffProcurement>(`/admin/procurements/${id}`);
  const [estimate, setEstimate] = useState({ date: '', reason: '' });
  const [error, setError] = useState<string | null>(null);
  const changeEstimate = async () => {
    setError(null);
    try {
      await api(`/admin/procurements/${id}/estimate`, { method: 'POST', body: { field: 'READY', newEstimate: new Date(`${estimate.date}T12:00:00+03:30`).toISOString(), reason: estimate.reason } });
      setEstimate({ date: '', reason: '' });
      await state.reload();
    } catch (e) {
      setError(errorText(t, e));
    }
  };
  const setItemStatus = async (itemId: string, status: string) => {
    await api(`/admin/procurements/${id}/items/${itemId}`, { method: 'PATCH', body: { status } }).catch(() => undefined);
    await state.reload();
  };
  return (
    <Async state={state}>
      {(p) => (
        <div className="flex flex-col gap-6">
          <TransitionPanel kind="procurements" id={p.id} status={p.status} version={p.version} onDone={() => void state.reload()} />
          <Section title={l('اقلام و تأمین‌کننده', 'Items & supplier')} id="proc-items">
            <TableScroll caption={l('اقلام', 'Items')}>
              <thead><tr><th className={th}>{t('cart.item')}</th><th className={th}>{t('parts.quantity')}</th><th className={th}>{t('order.status')}</th><th className={th}>{l('تأمین‌کننده', 'Supplier')}</th><th className={th}>{t('admin.internalCost')}</th></tr></thead>
              <tbody>
                {p.items.map((i) => (
                  <tr key={i.id}>
                    <td className={td}>{i.description}</td>
                    <td className={td}><Num value={i.quantity} /></td>
                    <td className={td}>
                      <label className="sr-only" htmlFor={`pi-${i.id}`}>{t('order.status')}</label>
                      <select id={`pi-${i.id}`} className="min-h-9 rounded border border-line px-2" value={i.status} onChange={(e) => void setItemStatus(i.id, e.target.value)}>
                        {['PENDING', 'SOURCING', 'PURCHASED', 'RECEIVED', 'UNAVAILABLE'].map((s) => <option key={s} value={s}>{label('procItem', s)}</option>)}
                      </select>
                    </td>
                    <td className={td}>{i.supplier ?? '—'}{i.supplierOrderRef ? <span className="block text-xs"><Ltr>{i.supplierOrderRef}</Ltr></span> : null}</td>
                    <td className={td}><Money value={i.unitCost} /></td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
            {p.items.some((i) => i.status === 'UNAVAILABLE') ? (
              <Alert tone="warning" className="mt-3" title={l('قلم غیرقابل تأمین پس از پرداخت: پیشنهاد جایگزین با موافقت مشتری یا استرداد لازم است؛ فرایند را فقط نبندید.', 'Item unavailable after payment: offer an alternative with customer consent or refund — do not just close.')} />
            ) : null}
          </Section>
          <Section title={t('admin.changeEstimate')} id="proc-estimate">
            <DefinitionList items={p.dateChanges.map((d) => ({ term: <DateTime iso={d.at} />, value: <span><DateTime iso={d.previous} withTime={false} /> → <DateTime iso={d.next} withTime={false} /> — {d.reason}</span> }))} />
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Field id="est-date" label={t('order.currentEstimate')}><Input id="est-date" type="date" value={estimate.date} onChange={(e) => setEstimate({ ...estimate, date: e.target.value })} /></Field>
              <Field id="est-reason" label={t('order.changeReason')} className="md:col-span-2"><Input id="est-reason" value={estimate.reason} onChange={(e) => setEstimate({ ...estimate, reason: e.target.value })} /></Field>
            </div>
            {error ? <Alert tone="danger" className="mt-3" title={error} /> : null}
            <Button className="mt-3" variant="secondary" disabled={!estimate.date || estimate.reason.trim().length < 5} onClick={() => void changeEstimate()}>{t('admin.changeEstimate')}</Button>
          </Section>
          <OrderDetail order={p} />
        </div>
      )}
    </Async>
  );
}
