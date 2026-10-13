'use client';

import type { MoneyDto } from '@hedax/contracts';
import { formatMoney, minorToDecimalString, money, parseDecimalAmount } from '@hedax/domain';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Async } from '@/components/ui/async';
import { Field, Input } from '@/components/ui/field';
import { DateTime, Money, Num, useListSeparator } from '@/components/ui/format';
import { Alert, Badge, Code, DefinitionList, EmptyState, Ltr, PageHeader, Section, StatusBadge, TableScroll, td, th } from '@/components/ui/misc';
import { api, newIdempotencyKey } from '@/lib/api/client';
import { errorText, isApiError } from '@/lib/api/errors';
import { useApi } from '@/lib/use-api';
import { useCodeLabel, useL } from './shell';

interface AttemptRow { id: string; reference: string; subjectType: string; subjectReference: string | null; customer: string | null; amount: MoneyDto; status: string; provider: string; failureCode: string | null; overpayment: MoneyDto; createdAt: string; verifiedAt: string | null }
interface CaseRow { id: string; kind: string; status: string; subjectType: string; amount: MoneyDto | null; note: string | null; createdAt: string; paymentAttemptId: string | null }

export function PaymentsPage() {
  const t = useTranslations();
  const l = useL();
  const label = useCodeLabel();
  const attempts = useApi<AttemptRow[]>('/payments/admin/attempts');
  const cases = useApi<CaseRow[]>('/payments/admin/cases');
  const reconcile = async (id: string) => {
    await api(`/payments/admin/attempts/${id}/reconcile`, { method: 'POST' }).catch(() => undefined);
    await attempts.reload();
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('admin.payments')} description={l('فقط تأیید سرور به سرور، پرداخت را موفق می‌کند. رسید بارگذاری‌شده توسط مشتری پرداخت محسوب نمی‌شود.', 'Only server-to-server verification marks a payment succeeded. A receipt uploaded by a customer is not a payment.')} />
      <Async state={attempts}>
        {(rows) => rows.length ? (
          <TableScroll caption={t('admin.payments')}>
            <thead><tr><th className={th}>{l('شناسه', 'Reference')}</th><th className={th}>{l('موضوع', 'Subject')}</th><th className={th}>{t('admin.customer')}</th><th className={th}>{t('payment.amount')}</th><th className={th}>{t('order.status')}</th><th className={th}>{l('درگاه', 'Provider')}</th><th className={th}>{t('order.date')}</th><th className={th} /></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className={td}><Code>{a.reference}</Code></td>
                  <td className={td}><Code>{a.subjectReference ?? '—'}</Code></td>
                  <td className={td}>{a.customer ?? '—'}</td>
                  <td className={td}><Money value={a.amount} />{a.overpayment.amountMinor !== '0' ? <Badge tone="warning" className="ms-1">+<Money value={a.overpayment} /></Badge> : null}</td>
                  <td className={td}><StatusBadge status={a.status} label={t(`status.${a.status}` as never)} />{a.failureCode ? <span className="block text-xs text-steel">{label('paymentFailure', a.failureCode)}</span> : null}</td>
                  <td className={td}>{a.provider === 'simulator' ? <Badge tone="warning">{l('آزمایشی', 'Simulator')}</Badge> : label('paymentProvider', a.provider)}</td>
                  <td className={td}><DateTime iso={a.createdAt} /></td>
                  <td className={td}>{['PENDING', 'PENDING_VERIFICATION'].includes(a.status) ? <Button size="sm" variant="secondary" onClick={() => void reconcile(a.id)}>{l('استعلام', 'Inquire')}</Button> : null}</td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        ) : <EmptyState title={t('common.results', { count: 0 })} />}
      </Async>
      <Section title={t('admin.cases')} id="cases">
        <Async state={cases}>
          {(rows) => rows.length ? (
            <ul className="flex flex-col gap-2">
              {rows.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-line-soft bg-surface px-3 py-2.5 text-sm">
                  <span className="font-semibold">{label('caseKind', c.kind)}</span>
                  <StatusBadge status={c.status} label={t(`status.${c.status}` as never)} />
                  <Money value={c.amount} />
                  <span className="text-steel">{c.note}</span>
                  <span className="text-xs text-steel"><DateTime iso={c.createdAt} /></span>
                </li>
              ))}
            </ul>
          ) : <p className="text-steel">{l('پرونده‌ای باز نیست.', 'No open cases.')}</p>}
        </Async>
      </Section>
    </div>
  );
}

interface RefundRow { id: string; reference: string; status: string; amount: MoneyDto; reason: string; payment: string; providerRefundReference: string | null; manualReference: string | null; createdAt: string; completedAt: string | null }

export function RefundsPage() {
  const t = useTranslations();
  const l = useL();
  const state = useApi<RefundRow[]>('/admin/refunds');
  const [form, setForm] = useState({ paymentReference: '', amount: '', reason: '' });
  const [manualRef, setManualRef] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());
  const fail = (e: unknown) => setError(errorText(t, e));
  const create = async () => {
    setError(null);
    try {
      await api('/admin/refunds', { method: 'POST', idempotencyKey: key.current, body: { paymentReference: form.paymentReference.trim(), amountIrr: parseDecimalAmount(form.amount, 'IRR').toString(), reason: form.reason } });
      key.current = newIdempotencyKey();
      setForm({ paymentReference: '', amount: '', reason: '' });
      await state.reload();
    } catch (e) { fail(e); }
  };
  const act = async (path: string, body: unknown) => {
    setError(null);
    try { await api(path, { method: 'POST', body }); await state.reload(); } catch (e) { fail(e); }
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('admin.refunds')} description={l('درخواست استرداد با استرداد انجام‌شده فرق دارد. مجموع استردادها از وجه دریافت‌شده بیشتر نمی‌شود.', 'A requested refund is not a completed refund. Total refunds can never exceed the captured amount.')} />
      {error ? <Alert tone="danger" title={error} /> : null}
      <Async state={state}>
        {(rows) => rows.length ? (
          <TableScroll caption={t('admin.refunds')}>
            <thead><tr><th className={th}>{l('شناسه', 'Reference')}</th><th className={th}>{l('پرداخت', 'Payment')}</th><th className={th}>{t('payment.amount')}</th><th className={th}>{t('order.status')}</th><th className={th}>{t('order.reason')}</th><th className={th} /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={td}><Code>{r.reference}</Code></td>
                  <td className={td}><Ltr>{r.payment}</Ltr></td>
                  <td className={td}><Money value={r.amount} /></td>
                  <td className={td}><StatusBadge status={r.status} label={t(`status.${r.status}` as never)} />{r.manualReference ?? r.providerRefundReference ? <span className="block text-xs"><Code>{r.manualReference ?? r.providerRefundReference}</Code></span> : null}</td>
                  <td className={td}>{r.reason}</td>
                  <td className={td}>
                    <div className="flex flex-wrap gap-1">
                      {r.status === 'REQUESTED' ? (
                        <>
                          <Button size="sm" onClick={() => void act(`/admin/refunds/${r.id}/decision`, { decision: 'APPROVED' })}>{t('admin.approve')}</Button>
                          <Button size="sm" variant="ghost" onClick={() => void act(`/admin/refunds/${r.id}/decision`, { decision: 'REJECTED', reason: l('رد توسط مالی', 'Rejected by finance') })}>{t('admin.reject')}</Button>
                        </>
                      ) : null}
                      {['APPROVED', 'FAILED'].includes(r.status) ? (
                        <>
                          <label className="sr-only" htmlFor={`mref-${r.id}`}>{l('شمارهٔ پیگیری انتقال بانکی', 'Bank transfer reference')}</label>
                          <input id={`mref-${r.id}`} dir="ltr" className="min-h-9 w-36 rounded-[var(--radius-control)] border border-line-strong px-2 text-sm" placeholder={l('مرجع بانکی', 'Bank ref')} value={manualRef[r.id] ?? ''} onChange={(e) => setManualRef({ ...manualRef, [r.id]: e.target.value })} />
                          <Button size="sm" onClick={() => void act(`/admin/refunds/${r.id}/execute`, manualRef[r.id] ? { manualReference: manualRef[r.id] } : {})}>{l('انجام استرداد', 'Execute')}</Button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        ) : <EmptyState title={t('common.results', { count: 0 })} />}
      </Async>
      <Section title={l('درخواست استرداد جدید', 'New refund request')} id="refund-new">
        <div className="grid gap-3 md:grid-cols-3">
          <Field id="rf-attempt" label={l('کد پیگیری پرداخت', 'Payment reference')} hint={l('مثل HX-PAY-… از فهرست پرداخت‌ها', 'e.g. HX-PAY-… from the payments list')}><Input id="rf-attempt" dir="ltr" value={form.paymentReference} onChange={(e) => setForm({ ...form, paymentReference: e.target.value })} /></Field>
          <Field id="rf-amount" label={l('مبلغ (ریال)', 'Amount (IRR)')}><Input id="rf-amount" dir="ltr" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field id="rf-reason" label={t('order.reason')}><Input id="rf-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
        </div>
        <Button className="mt-3" variant="secondary" onClick={() => void create()} disabled={!form.paymentReference.trim() || !form.amount || form.reason.trim().length < 3}>{t('common.submit')}</Button>
      </Section>
    </div>
  );
}

interface ReturnRow {
  id: string; reference: string; kind: 'RETURN' | 'CANCEL'; status: string; reason: string; customer: string | null; createdAt: string;
  items: Array<{ id: string; name: string; unitPrice: MoneyDto; quantity: number; receivedQuantity: number; restockedQuantity: number }>;
  payment: { id: string; reference: string; captured: MoneyDto; refundable: MoneyDto } | null;
  refunds: Array<{ reference: string; status: string; amount: MoneyDto }>;
  suggestedRefund: MoneyDto;
}

/** A refund is offered once the items are back (return) or the cancellation is approved, while nothing is refunded yet. */
const refundDue = (r: ReturnRow) =>
  !!r.payment && BigInt(r.payment.refundable.amountMinor) > 0n && !r.refunds.some((f) => f.status !== 'REJECTED' && f.status !== 'FAILED')
  && (r.kind === 'RETURN' ? r.status === 'ITEMS_RECEIVED' : r.status === 'APPROVED');

export function AdminReturnsPage() {
  const t = useTranslations();
  const l = useL();
  const locale = useLocale() as 'fa' | 'en';
  const sep = useListSeparator();
  const state = useApi<ReturnRow[]>('/admin/returns');
  const [reason, setReason] = useState<Record<string, string>>({});
  const [amount, setAmount] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const keys = useRef<Record<string, string>>({});
  const act = async (path: string, body: unknown) => {
    setError(null);
    try { await api(path, { method: 'POST', body }); await state.reload(); } catch (e) { setError(errorText(t, e)); }
  };
  const requestRefund = async (r: ReturnRow) => {
    if (!r.payment) return;
    setError(null);
    keys.current[r.id] ??= newIdempotencyKey();
    try {
      const value = amount[r.id] ?? minorToDecimalString(BigInt(r.suggestedRefund.amountMinor), 'IRR');
      await api('/admin/refunds', {
        method: 'POST', idempotencyKey: keys.current[r.id],
        body: { paymentAttemptId: r.payment.id, amountIrr: parseDecimalAmount(value, 'IRR').toString(), reason: `${l('استرداد', 'Refund')} ${r.reference}`, returnRequestId: r.id },
      });
      await state.reload();
    } catch (e) { setError(isApiError(e) ? errorText(t, e) : t('validation.invalidNumber')); }
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('admin.returns')} description={l('ثبت درخواست مرجوعی موجودی را افزایش نمی‌دهد؛ فقط کالای بررسی‌شده و قابل فروش به موجودی برمی‌گردد.', 'A return request does not add stock; only inspected sellable items are restocked.')} />
      {error ? <Alert tone="danger" title={error} /> : null}
      <Async state={state}>
        {(rows) => rows.length ? (
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.id} className="card flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold"><Code>{r.reference}</Code> — {r.kind === 'RETURN' ? l('مرجوعی', 'Return') : l('لغو', 'Cancellation')} — {r.customer}</span>
                  <StatusBadge status={r.status} label={t(`status.${r.status}` as never)} />
                </div>
                <p className="text-sm">{r.reason}</p>
                {r.items.length ? (
                  <ul className="text-sm">
                    {r.items.map((i) => (
                      <li key={i.id}>{i.name} × <Num value={i.quantity} />{i.receivedQuantity ? <> — {l('دریافت‌شده', 'received')}: <Num value={i.receivedQuantity} /></> : null}{sep}<Money value={i.unitPrice} /></li>
                    ))}
                  </ul>
                ) : null}
                {r.refunds.length ? (
                  <ul className="text-sm">
                    {r.refunds.map((f) => <li key={f.reference}>{l('استرداد', 'Refund')} <Code>{f.reference}</Code>: <Money value={f.amount} /> — {t(`status.${f.status}` as never)}</li>)}
                  </ul>
                ) : null}
                {refundDue(r) && r.payment ? (
                  <div className="flex flex-wrap items-end gap-2 rounded-[var(--radius-control)] border border-line-soft bg-surface px-3 py-2.5">
                    <Field id={`rf-amount-${r.id}`} label={l('مبلغ استرداد (ریال)', 'Refund amount (IRR)')} hint={`${l('حداکثر', 'Up to')} ${formatMoney(money('IRR', r.payment.refundable.amountMinor), locale)}${sep}${l('پرداخت', 'Payment')} ${r.payment.reference}`}>
                      <Input id={`rf-amount-${r.id}`} dir="ltr" inputMode="numeric" value={amount[r.id] ?? minorToDecimalString(BigInt(r.suggestedRefund.amountMinor), 'IRR')} onChange={(e) => setAmount({ ...amount, [r.id]: e.target.value })} />
                    </Field>
                    <Button size="sm" onClick={() => void requestRefund(r)}>{l('ثبت درخواست استرداد', 'Request refund')}</Button>
                  </div>
                ) : null}
                {r.status === 'REQUESTED' ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <Field id={`rr-${r.id}`} label={t('order.reason')} className="min-w-64 flex-1"><Input id={`rr-${r.id}`} value={reason[r.id] ?? ''} onChange={(e) => setReason({ ...reason, [r.id]: e.target.value })} /></Field>
                    <Button size="sm" disabled={(reason[r.id] ?? '').trim().length < 3} onClick={() => void act(`/admin/returns/${r.id}/decision`, { decision: 'APPROVED', reason: reason[r.id] })}>{t('admin.approve')}</Button>
                    <Button size="sm" variant="ghost" disabled={(reason[r.id] ?? '').trim().length < 3} onClick={() => void act(`/admin/returns/${r.id}/decision`, { decision: 'REJECTED', reason: reason[r.id] })}>{t('admin.reject')}</Button>
                  </div>
                ) : null}
                {r.status === 'APPROVED' && r.items.length ? (
                  <Button size="sm" variant="secondary" onClick={() => void act(`/admin/returns/${r.id}/receive`, { items: r.items.map((i) => ({ itemId: i.id, receivedQuantity: i.quantity, restockQuantity: i.quantity })) })}>
                    {l('ثبت دریافت و بررسی (بازگشت به موجودی)', 'Record receipt & inspection (restock)')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : <EmptyState title={t('common.results', { count: 0 })} />}
      </Async>
    </div>
  );
}

interface Summary {
  range: { from: string; to: string };
  ordersByStatus: Array<{ status: string; count: number }>;
  topItems: Array<{ sku: string; name: string; quantity: number; revenue: MoneyDto }>;
  sourcing: { requests: number; convertedToPaidOrders: number };
  quotesIssued: { count: number; totalValue: MoneyDto };
  financial?: { collections: MoneyDto; collectionsCount: number; refunds: MoneyDto; refundsCount: number; net: MoneyDto };
}

export function ReportsPage() {
  const t = useTranslations();
  const l = useL();
  const sep = useListSeparator();
  const state = useApi<Summary>('/admin/reports/summary');
  return (
    <>
      <PageHeader title={t('admin.reports')} description={l('وصول واقعی فقط از پرداخت‌های تأییدشدهٔ ریالی محاسبه می‌شود؛ ارزش پیش‌فاکتورها فروش نیست.', 'Collections come only from verified IRR payments; quote value is not revenue.')} />
      <Async state={state}>
        {(s) => (
          <div className="flex flex-col gap-6">
            <p className="text-sm text-steel"><DateTime iso={s.range.from} withTime={false} /> — <DateTime iso={s.range.to} withTime={false} /></p>
            {s.financial ? (
              <Section title={t('admin.collections')} id="rep-fin">
                <DefinitionList items={[
                  { term: t('admin.collections'), value: <><Money value={s.financial.collections} /> (<Num value={s.financial.collectionsCount} />)</> },
                  { term: t('admin.refundsTotal'), value: <><Money value={s.financial.refunds} /> (<Num value={s.financial.refundsCount} />)</> },
                  { term: t('admin.net'), value: <Money value={s.financial.net} className="font-bold" /> },
                ]} />
              </Section>
            ) : null}
            <div className="grid gap-6 lg:grid-cols-2">
              <Section title={t('admin.orders')} id="rep-orders">
                <ul className="flex flex-col gap-1">{s.ordersByStatus.map((o) => <li key={o.status} className="flex justify-between"><span>{t(`status.${o.status}` as never)}</span><Num value={o.count} /></li>)}</ul>
              </Section>
              <Section title={t('admin.converted')} id="rep-conv">
                <p><Num value={s.sourcing.convertedToPaidOrders} /> / <Num value={s.sourcing.requests} /></p>
                <p className="mt-3 text-sm text-steel">{t('admin.quotesValue')}: <Money value={s.quotesIssued.totalValue} /> (<Num value={s.quotesIssued.count} />)</p>
              </Section>
            </div>
            <Section title={t('admin.topItems')} id="rep-top">
              <ul className="flex flex-col gap-1">{s.topItems.map((i) => <li key={i.sku} className="flex flex-wrap justify-between gap-2"><span><Code>{i.sku}</Code> — {i.name}</span><span><Num value={i.quantity} /> {l('عدد', 'pcs')}{sep}<Money value={i.revenue} /></span></li>)}</ul>
            </Section>
          </div>
        )}
      </Async>
    </>
  );
}
