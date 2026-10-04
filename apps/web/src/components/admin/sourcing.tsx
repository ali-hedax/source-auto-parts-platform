'use client';

import type { MoneyDto, QuoteVersionView, SourcingRequestView, StaffQuoteRow } from '@hedax/contracts';
import { QUOTE_VERSION_STATUSES } from '@hedax/contracts/constants';
import { parseDecimalAmount } from '@hedax/domain';
import { Plus, Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Async } from '@/components/ui/async';
import { ErrorSummary } from '@/components/ui/error-summary';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { DateTime, Money, Num, useListSeparator } from '@/components/ui/format';
import { Alert, Badge, DefinitionList, EmptyState, Ltr, PageHeader, Section, StatusBadge, TableScroll, td, th } from '@/components/ui/misc';
import { ChatThread } from '@/components/chat/chat-thread';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { errorText, isApiError } from '@/lib/api/errors';
import { useApi } from '@/lib/use-api';
import { useL } from './shell';

interface ReqRow { id: string; reference: string; title: string; status: string; urgency: string; customer: string | null; assignee: string | null; itemCount: number; createdAt: string }

export function SourcingList() {
  const t = useTranslations();
  const [status, setStatus] = useState('');
  const state = useApi<ReqRow[]>(`/admin/sourcing-requests${status ? `?status=${status}` : ''}`);
  return (
    <>
      <PageHeader title={t('admin.sourcing')} />
      <Field id="sr-status" label={t('order.status')} className="mb-3 max-w-xs">
        <Select id="sr-status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('common.all')}</option>
          {['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CUSTOMER_INFO', 'QUOTED', 'CONVERTED', 'CLOSED', 'CANCELLED'].map((s) => <option key={s} value={s}>{t(`status.${s}` as never)}</option>)}
        </Select>
      </Field>
      <Async state={state}>
        {(rows) => rows.length ? (
          <TableScroll caption={t('admin.sourcing')}>
            <thead><tr><th className={th}>{t('request.reference')}</th><th className={th}>{t('request.requestTitle')}</th><th className={th}>{t('admin.customer')}</th><th className={th}>{t('admin.assignee')}</th><th className={th}>{t('order.status')}</th><th className={th}>{t('order.date')}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={td}><Link href={`/admin/sourcing/${r.id}`} className="font-semibold text-action underline"><Ltr>{r.reference}</Ltr></Link>{r.urgency === 'URGENT' ? <Badge tone="danger" className="ms-1">{t('request.urgency_URGENT')}</Badge> : null}</td>
                  <td className={td}>{r.title}</td>
                  <td className={td}>{r.customer ?? '—'}</td>
                  <td className={td}>{r.assignee ?? '—'}</td>
                  <td className={td}><StatusBadge status={r.status} label={t(`status.${r.status}` as never)} /></td>
                  <td className={td}><DateTime iso={r.createdAt} /></td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        ) : <EmptyState title={t('account.noRequests')} />}
      </Async>
    </>
  );
}

/** Every quote version in the staff member's scope; the current one per quote is marked (spec §5.3). */
export function QuotesList() {
  const t = useTranslations();
  const l = useL();
  const [status, setStatus] = useState('');
  const state = useApi<StaffQuoteRow[]>(`/admin/quotes${status ? `?status=${status}` : ''}`);
  return (
    <>
      <PageHeader title={t('admin.quotes')} />
      <Field id="qt-status" label={t('order.status')} className="mb-3 max-w-xs">
        <Select id="qt-status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('common.all')}</option>
          {QUOTE_VERSION_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}` as never)}</option>)}
        </Select>
      </Field>
      <Async state={state}>
        {(rows) => rows.length ? (
          <TableScroll caption={t('admin.quotes')}>
            <thead>
              <tr>
                <th className={th}>{t('admin.quotes')}</th><th className={th}>{t('request.reference')}</th><th className={th}>{t('admin.customer')}</th>
                <th className={th}>{t('order.status')}</th><th className={th}>{t('quote.total')}</th><th className={th}>{t('quote.validUntil')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.versionId}>
                  <td className={td}>
                    <Link href={`/admin/quotes/${q.versionId}`} className="font-semibold text-action underline"><Ltr>{q.reference}</Ltr> — {t('quote.version', { n: q.versionNumber })}</Link>
                    {q.isCurrent ? null : <Badge className="ms-1">{l('نسخهٔ قدیمی', 'Older version')}</Badge>}
                  </td>
                  <td className={td}><Link href={`/admin/sourcing/${q.request.id}`} className="text-action underline"><Ltr>{q.request.reference}</Ltr></Link></td>
                  <td className={td}>{q.customer ?? '—'}</td>
                  <td className={td}><StatusBadge status={q.status} label={t(`status.${q.status}` as never)} /></td>
                  <td className={td}><Money value={q.totalPayableIrr} /></td>
                  <td className={td}><DateTime iso={q.validUntil} /></td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        ) : <EmptyState title={l('پیش‌فاکتوری نیست.', 'No quotes.')} />}
      </Async>
    </>
  );
}

type StaffRequest = SourcingRequestView & { version: number; customer: { id: string; fullName: string | null }; note: string | null; delivery: { province: string | null; city: string | null }; files: Array<{ id: string; filename: string; status: string; downloadUrl: string | null }> };

export function SourcingWorkbench() {
  const t = useTranslations();
  const l = useL();
  const { id } = useParams<{ id: string }>();
  const state = useApi<StaffRequest>(`/admin/sourcing-requests/${id}`);
  const staff = useApi<{ staff: Array<{ id: string; fullName: string | null; status: string }> }>('/admin/staff');
  const [error, setError] = useState<string | null>(null);
  const [transitionTo, setTransitionTo] = useState('');
  const [reason, setReason] = useState('');
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); await state.reload(); } catch (e) { setError(errorText(t, e)); }
  };
  return (
    <Async state={state}>
      {(r) => (
        <div className="flex flex-col gap-6">
          <PageHeader title={r.title} description={<Ltr>{r.reference}</Ltr>} actions={<StatusBadge status={r.status} label={t(`status.${r.status}` as never)} />} />
          {error ? <Alert tone="danger" title={error} /> : null}
          <div className="grid gap-6 xl:grid-cols-2">
            <Section title={t('common.details')} id="wb-details">
              <DefinitionList items={[
                { term: t('admin.customer'), value: r.customer.fullName ?? '—' },
                { term: t('request.urgency'), value: t(`request.urgency_${r.urgency}` as never) },
                { term: t('request.delivery'), value: [r.delivery.province, r.delivery.city].filter(Boolean).join('، ') || '—' },
                ...(r.note ? [{ term: t('request.overallNote'), value: r.note }] : []),
              ]} />
              {r.files.length ? (
                <ul className="mt-3 flex flex-col gap-1 text-sm">
                  {r.files.map((f) => <li key={f.id}>{f.downloadUrl ? <a href={f.downloadUrl} className="text-action underline"><bdi>{f.filename}</bdi></a> : <bdi>{f.filename}</bdi>} <Badge>{t(`files.${f.status}` as never)}</Badge></li>)}
                </ul>
              ) : null}
            </Section>
            <Section title={t('admin.transition')} id="wb-actions">
              <div className="flex flex-col gap-3">
                <Field id="wb-assignee" label={t('admin.assign')}>
                  <Select id="wb-assignee" defaultValue="" onChange={(e) => void run(() => api(`/admin/sourcing-requests/${r.id}/assignee`, { method: 'PUT', body: { assigneeId: e.target.value || null } }))}>
                    <option value="">{r.assignee?.displayName ?? '—'}</option>
                    {(staff.data?.staff ?? []).filter((s) => s.status === 'ACTIVE').map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                  </Select>
                </Field>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field id="wb-to" label={t('order.status')}>
                    <Select id="wb-to" value={transitionTo} onChange={(e) => setTransitionTo(e.target.value)}>
                      <option value="">—</option>
                      {['UNDER_REVIEW', 'NEEDS_CUSTOMER_INFO', 'CLOSED', 'CANCELLED'].map((s) => <option key={s} value={s}>{t(`status.${s}` as never)}</option>)}
                    </Select>
                  </Field>
                  <Field id="wb-reason" label={t('order.reason')}><Input id="wb-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
                </div>
                <Button variant="secondary" disabled={!transitionTo} onClick={() => void run(() => api(`/admin/sourcing-requests/${r.id}/transition`, { method: 'POST', body: { toState: transitionTo, reason: reason || undefined, version: r.version } }))}>{t('admin.transition')}</Button>
              </div>
            </Section>
          </div>
          <TableScroll caption={t('request.items')}>
            <thead><tr><th className={th}>{t('request.partName')}</th><th className={th}>{t('request.quantity')}</th><th className={th}>{t('request.vehicleBrand')}</th><th className={th}>{t('request.vehicleModel')}</th><th className={th}>{t('request.partCode')}</th><th className={th}>{t('request.preference')}</th></tr></thead>
            <tbody>
              {r.items.map((i) => (
                <tr key={i.id}><td className={td}>{i.partName}</td><td className={td}><Num value={i.quantity} /></td><td className={td}>{i.vehicleBrand ?? '—'}</td><td className={td}>{[i.vehicleModel, i.vehicleYear].filter(Boolean).join(' ') || '—'}</td><td className={td}><Ltr>{i.partCode ?? '—'}</Ltr></td><td className={td}>{t(`request.pref_${i.preference}` as never)}</td></tr>
              ))}
            </tbody>
          </TableScroll>
          {r.quotes.length ? (
            <Section title={t('admin.quotes')} id="wb-quotes">
              <ul className="flex flex-col gap-2">
                {r.quotes.map((q) => (
                  <li key={q.versionId} className="flex flex-wrap items-center justify-between gap-2 rounded bg-surface p-3">
                    <Link href={`/admin/quotes/${q.versionId}`} className="font-semibold text-action underline">{t('quote.version', { n: q.versionNumber })}</Link>
                    <StatusBadge status={q.status} label={t(`status.${q.status}` as never)} />
                    <Money value={q.totalPayable} />
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          <QuoteEditor request={r} onSaved={() => void state.reload()} />
          <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
            <ChatThread conversationId={r.conversationId} staff />
            <InternalNotes conversationId={r.conversationId} />
          </div>
          <p className="sr-only">{l('میز کار درخواست', 'Request workbench')}</p>
        </div>
      )}
    </Async>
  );
}

function InternalNotes({ conversationId }: { conversationId: string }) {
  const t = useTranslations();
  const sep = useListSeparator();
  const state = useApi<Array<{ id: string; body: string; author: string | null; createdAt: string }>>(`/conversations/${conversationId}/notes`);
  const [body, setBody] = useState('');
  const add = async () => {
    if (!body.trim()) return;
    await api(`/conversations/${conversationId}/notes`, { method: 'POST', body: { body } }).catch(() => undefined);
    setBody('');
    await state.reload();
  };
  return (
    <Section title={t('admin.internalNotes')} id="notes">
      <Async state={state}>
        {(rows) => (
          <ul className="mb-3 flex flex-col gap-2 text-sm">
            {rows.map((n) => <li key={n.id} className="rounded border border-warning/30 bg-warning-soft p-2"><p className="whitespace-pre-wrap">{n.body}</p><p className="text-xs text-steel">{n.author}{sep}<DateTime iso={n.createdAt} /></p></li>)}
          </ul>
        )}
      </Async>
      <Field id="note-body" label={t('admin.addNote')}><Textarea id="note-body" rows={2} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      <Button className="mt-2" variant="secondary" onClick={() => void add()}>{t('admin.addNote')}</Button>
    </Section>
  );
}

interface EditorItem {
  sourcingItemId: string | null; description: string; quantity: string; manufacturer: string; partType: string; condition: string; compatibility: string;
  alternativeNote: string; availability: 'AVAILABLE' | 'UNAVAILABLE'; currency: 'IRR' | 'AED'; unitPrice: string; leadMin: string; leadMax: string;
  leadUnit: 'HOURS' | 'DAYS'; leadDayKind: 'CALENDAR' | 'BUSINESS'; internalCost: string;
}

const LEAD_PRESETS: Array<{ label: [string, string]; min: number; max: number; unit: 'HOURS' | 'DAYS' }> = [
  { label: ['۴۸ ساعت', '48 hours'], min: 48, max: 48, unit: 'HOURS' },
  { label: ['۳ روز', '3 days'], min: 3, max: 3, unit: 'DAYS' },
  { label: ['۴ روز', '4 days'], min: 4, max: 4, unit: 'DAYS' },
  { label: ['یک هفته', '1 week'], min: 7, max: 7, unit: 'DAYS' },
];

function QuoteEditor({ request, onSaved }: { request: StaffRequest; onSaved: () => void }) {
  const t = useTranslations();
  const l = useL();
  const policies = useApi<Array<{ id: string; kind: string; status: string; titleFa: string; version: number }>>('/admin/policies');
  const [items, setItems] = useState<EditorItem[]>(request.items.map((i) => ({
    sourcingItemId: i.id, description: i.partName, quantity: String(i.quantity), manufacturer: '', partType: i.preference === 'AFTERMARKET' ? 'AFTERMARKET' : 'GENUINE', condition: i.preference === 'STOCK' ? 'USED' : 'NEW',
    compatibility: 'CONFIRMED', alternativeNote: '', availability: 'AVAILABLE', currency: 'IRR', unitPrice: '', leadMin: '3', leadMax: '3', leadUnit: 'DAYS', leadDayKind: 'CALENDAR', internalCost: '',
  })));
  const [shipping, setShipping] = useState({ label: l('هزینهٔ حمل', 'Shipping'), amount: '' });
  const [validity, setValidity] = useState('24');
  const [wording, setWording] = useState<'ESTIMATE' | 'COMMITMENT'>('ESTIMATE');
  const [termsId, setTermsId] = useState('');
  const [draft, setDraft] = useState<{ versionId: string; version: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const setItem = (i: number, patch: Partial<EditorItem>) => setItems((list) => list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const published = (policies.data ?? []).filter((p) => p.status === 'PUBLISHED' && ['TERMS', 'SOURCING'].includes(p.kind));

  const save = async (send: boolean) => {
    setError(null);
    setSaving(true);
    try {
      const body = {
        items: items.map((i) => ({
          sourcingItemId: i.sourcingItemId, description: i.description, quantity: Number(i.quantity), manufacturer: i.manufacturer || undefined, partType: i.partType,
          condition: i.condition, compatibility: i.compatibility, alternativeNote: i.alternativeNote || undefined, availability: i.availability,
          unitPrice: { currency: i.currency, amountMinor: i.availability === 'AVAILABLE' ? parseDecimalAmount(i.unitPrice, i.currency).toString() : '0' },
          leadTime: { min: Number(i.leadMin), max: Number(i.leadMax), unit: i.leadUnit, dayKind: i.leadUnit === 'HOURS' ? 'CALENDAR' : i.leadDayKind },
          internalCost: i.internalCost ? { currency: i.currency, amountMinor: parseDecimalAmount(i.internalCost, i.currency).toString() } : null,
        })),
        costs: shipping.amount ? [{ code: 'SHIPPING', label: shipping.label, amount: { currency: 'IRR', amountMinor: parseDecimalAmount(shipping.amount, 'IRR').toString() } }] : [],
        validityHours: Number(validity), leadTimeWording: wording, leadTimeOrigin: 'PAYMENT_VERIFIED', termsPolicyVersionId: termsId,
        ...(draft ? { version: draft.version } : {}),
      };
      const res = await api<{ versionId: string; version: number }>(`/admin/sourcing-requests/${request.id}/quote-draft`, { method: 'PUT', body });
      setDraft(res);
      if (send) await api(`/admin/quotes/${res.versionId}/send`, { method: 'POST' });
      onSaved();
    } catch (e) {
      setError(isApiError(e) ? errorText(t, e) : l('مقادیر عددی را بررسی کنید.', 'Check the numeric values.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title={t('admin.quoteEditor')} id="quote-editor">
      <ErrorSummary title={t('validation.summaryTitle')} errors={[]} generalError={error} />
      <div className="flex flex-col gap-4">
        {items.map((it, i) => (
          <fieldset key={i} className="rounded-[var(--radius-card)] border border-line p-4">
            <legend className="px-1 font-semibold">{t('request.item', { n: i + 1 })}</legend>
            <div className="grid gap-3 md:grid-cols-4">
              <Field id={`qe-${i}-desc`} label={t('request.partName')} className="md:col-span-2"><Input id={`qe-${i}-desc`} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} /></Field>
              <Field id={`qe-${i}-qty`} label={t('request.quantity')}><Input id={`qe-${i}-qty`} inputMode="numeric" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} /></Field>
              <Field id={`qe-${i}-av`} label={l('دسترسی', 'Availability')}>
                <Select id={`qe-${i}-av`} value={it.availability} onChange={(e) => setItem(i, { availability: e.target.value as EditorItem['availability'] })}>
                  <option value="AVAILABLE">{l('قابل تأمین', 'Available')}</option>
                  <option value="UNAVAILABLE">{t('quote.unavailable')}</option>
                </Select>
              </Field>
              <Field id={`qe-${i}-mfr`} label={t('quote.manufacturer')} optionalLabel={t('common.optional')}><Input id={`qe-${i}-mfr`} value={it.manufacturer} onChange={(e) => setItem(i, { manufacturer: e.target.value })} /></Field>
              <Field id={`qe-${i}-type`} label={t('parts.partType')}><Select id={`qe-${i}-type`} value={it.partType} onChange={(e) => setItem(i, { partType: e.target.value })}>{['GENUINE', 'OEM', 'AFTERMARKET'].map((v) => <option key={v} value={v}>{t(`partType.${v}` as never)}</option>)}</Select></Field>
              <Field id={`qe-${i}-cond`} label={t('parts.condition')}><Select id={`qe-${i}-cond`} value={it.condition} onChange={(e) => setItem(i, { condition: e.target.value })}>{['NEW', 'USED', 'REFURBISHED'].map((v) => <option key={v} value={v}>{t(`condition.${v}` as never)}</option>)}</Select></Field>
              <Field id={`qe-${i}-comp`} label={t('quote.compatibility')}><Select id={`qe-${i}-comp`} value={it.compatibility} onChange={(e) => setItem(i, { compatibility: e.target.value })}>{['CONFIRMED', 'LIKELY', 'NEEDS_CUSTOMER_CONFIRMATION'].map((v) => <option key={v} value={v}>{t(`quote.compat_${v}` as never)}</option>)}</Select></Field>
              <Field id={`qe-${i}-cur`} label={l('ارز', 'Currency')}><Select id={`qe-${i}-cur`} value={it.currency} onChange={(e) => setItem(i, { currency: e.target.value as 'IRR' | 'AED' })}><option value="IRR">IRR</option><option value="AED">AED</option></Select></Field>
              <Field id={`qe-${i}-price`} label={t('cart.unitPrice')}><Input id={`qe-${i}-price`} dir="ltr" value={it.unitPrice} onChange={(e) => setItem(i, { unitPrice: e.target.value })} disabled={it.availability === 'UNAVAILABLE'} /></Field>
              <Field id={`qe-${i}-cost`} label={t('admin.internalCost')} optionalLabel={t('common.optional')}><Input id={`qe-${i}-cost`} dir="ltr" value={it.internalCost} onChange={(e) => setItem(i, { internalCost: e.target.value })} /></Field>
              <Field id={`qe-${i}-lmin`} label={l('زمان تأمین از', 'Lead min')}><Input id={`qe-${i}-lmin`} inputMode="numeric" value={it.leadMin} onChange={(e) => setItem(i, { leadMin: e.target.value })} /></Field>
              <Field id={`qe-${i}-lmax`} label={l('تا', 'Lead max')}><Input id={`qe-${i}-lmax`} inputMode="numeric" value={it.leadMax} onChange={(e) => setItem(i, { leadMax: e.target.value })} /></Field>
              <Field id={`qe-${i}-lunit`} label={l('واحد', 'Unit')}>
                <Select id={`qe-${i}-lunit`} value={`${it.leadUnit}:${it.leadDayKind}`} onChange={(e) => { const [u, d] = e.target.value.split(':'); setItem(i, { leadUnit: u as EditorItem['leadUnit'], leadDayKind: d as EditorItem['leadDayKind'] }); }}>
                  <option value="HOURS:CALENDAR">{t('quote.unit_HOURS')}</option>
                  <option value="DAYS:CALENDAR">{t('quote.unit_DAYS')}</option>
                  <option value="DAYS:BUSINESS">{t('quote.unit_BUSINESS_DAYS')}</option>
                </Select>
              </Field>
              <div className="flex flex-wrap items-end gap-1">
                {LEAD_PRESETS.map((p) => <button key={p.label[1]} type="button" className="min-h-9 cursor-pointer rounded border border-line px-2 text-xs hover:bg-surface" onClick={() => setItem(i, { leadMin: String(p.min), leadMax: String(p.max), leadUnit: p.unit, leadDayKind: 'CALENDAR' })}>{l(p.label[0], p.label[1])}</button>)}
              </div>
              <Field id={`qe-${i}-alt`} label={t('quote.alternative')} optionalLabel={t('common.optional')} className="md:col-span-4"><Input id={`qe-${i}-alt`} value={it.alternativeNote} onChange={(e) => setItem(i, { alternativeNote: e.target.value })} /></Field>
            </div>
            {items.length > 1 ? <Button className="mt-2" size="sm" variant="ghost" icon={<Trash2 aria-hidden className="size-4" />} onClick={() => setItems((list) => list.filter((_, j) => j !== i))}>{t('common.remove')}</Button> : null}
          </fieldset>
        ))}
        <Button variant="secondary" icon={<Plus aria-hidden className="size-4" />} onClick={() => setItems((list) => [...list, { ...list[0]!, sourcingItemId: null, description: '', unitPrice: '', internalCost: '', alternativeNote: '' }])}>{t('request.addItem')}</Button>
        <div className="grid gap-3 md:grid-cols-4">
          <Field id="qe-ship-label" label={l('عنوان هزینه', 'Cost label')}><Input id="qe-ship-label" value={shipping.label} onChange={(e) => setShipping({ ...shipping, label: e.target.value })} /></Field>
          <Field id="qe-ship" label={l('مبلغ (ریال)', 'Amount (IRR)')} optionalLabel={t('common.optional')}><Input id="qe-ship" dir="ltr" value={shipping.amount} onChange={(e) => setShipping({ ...shipping, amount: e.target.value })} /></Field>
          <Field id="qe-valid" label={t('admin.validityHours')}><Input id="qe-valid" inputMode="numeric" value={validity} onChange={(e) => setValidity(e.target.value)} /></Field>
          <Field id="qe-wording" label={l('نوع زمان', 'Lead-time wording')}>
            <Select id="qe-wording" value={wording} onChange={(e) => setWording(e.target.value as typeof wording)}>
              <option value="ESTIMATE">{l('برآورد', 'Estimate')}</option>
              <option value="COMMITMENT">{l('تعهد', 'Commitment')}</option>
            </Select>
          </Field>
          <Field id="qe-terms" label={t('quote.terms')} className="md:col-span-2">
            <Select id="qe-terms" value={termsId} onChange={(e) => setTermsId(e.target.value)}>
              <option value="">—</option>
              {published.map((p) => <option key={p.id} value={p.id}>{p.titleFa} (v{p.version})</option>)}
            </Select>
          </Field>
        </div>
        {!published.length ? <Alert tone="warning" title={l('ابتدا متن شرایط را در «متن‌ها و شرایط» منتشر کنید.', 'Publish terms under “Policies & content” first.')} /> : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" loading={saving} onClick={() => void save(false)} disabled={!termsId}>{t('admin.saveDraft')}</Button>
          <Button loading={saving} onClick={() => void save(true)} disabled={!termsId}>{t('admin.sendQuote')}</Button>
        </div>
      </div>
    </Section>
  );
}

type StaffQuote = QuoteVersionView & { version: number; internalCosts: Array<{ itemId: string; cost: MoneyDto | null }> | null };

export function StaffQuotePage() {
  const t = useTranslations();
  const l = useL();
  const { id } = useParams<{ id: string }>();
  const state = useApi<StaffQuote>(`/admin/quotes/${id}`);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const act = async (path: string, body?: unknown) => {
    setError(null);
    try { await api(path, { method: 'POST', ...(body ? { body } : {}) }); await state.reload(); } catch (e) { setError(errorText(t, e)); }
  };
  return (
    <Async state={state}>
      {(q) => (
        <div className="flex flex-col gap-6">
          <PageHeader title={t('quote.title', { reference: q.reference })} description={t('quote.version', { n: q.versionNumber })} actions={<StatusBadge status={q.status} label={t(`status.${q.status}` as never)} />} />
          {error ? <Alert tone="danger" title={error} /> : null}
          <TableScroll caption={t('quote.items')}>
            <thead><tr><th className={th}>{t('cart.item')}</th><th className={th}>{t('parts.quantity')}</th><th className={th}>{t('cart.unitPrice')}</th><th className={th}>{t('cart.lineTotal')}</th><th className={th}>{t('admin.internalCost')}</th></tr></thead>
            <tbody>
              {q.items.map((i) => (
                <tr key={i.id}>
                  <td className={td}>{i.description}{i.availability === 'UNAVAILABLE' ? <Badge tone="danger" className="ms-1">{t('quote.unavailable')}</Badge> : null}</td>
                  <td className={td}><Num value={i.quantity} /></td>
                  <td className={td}><Money value={i.unitPrice} /></td>
                  <td className={td}><Money value={i.lineTotalIrr} /></td>
                  <td className={td}>{q.internalCosts ? <Money value={q.internalCosts.find((c) => c.itemId === i.id)?.cost ?? null} /> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
          <DefinitionList items={[
            { term: t('quote.total'), value: <Money value={q.totals.totalPayableIrr} className="font-bold" /> },
            ...(q.totals.referenceTotalAed ? [{ term: t('quote.referenceAed'), value: <Money value={q.totals.referenceTotalAed} /> }] : []),
            { term: t('quote.validUntil'), value: <DateTime iso={q.validUntil} /> },
          ]} />
          {q.status === 'DRAFT' ? <Button onClick={() => void act(`/admin/quotes/${q.versionId}/send`)}>{t('admin.sendQuote')}</Button> : null}
          {['DRAFT', 'SENT', 'ACCEPTED'].includes(q.status) ? (
            <div className="flex flex-wrap items-end gap-2">
              <Field id="qc-reason" label={t('order.reason')} className="min-w-64 flex-1"><Input id="qc-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
              <Button variant="danger" disabled={reason.trim().length < 3} onClick={() => void act(`/admin/quotes/${q.versionId}/cancel`, { reason })}>{l('لغو پیش‌فاکتور', 'Cancel quote')}</Button>
            </div>
          ) : null}
        </div>
      )}
    </Async>
  );
}
