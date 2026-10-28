'use client';

import type { OperatorRequestDetail, OperatorRequestList, OperatorRequestSummary } from '@hedax/contracts';
import { Headset, Phone, RefreshCw, Send, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { DateTime, Num } from '@/components/ui/format';
import { Alert, Badge, EmptyState, Section, Spinner } from '@/components/ui/misc';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';
import { useApi } from '@/lib/use-api';
import { useL } from './shell';

/** Admin → AI Chatbot → Operator: messages visitors left for an operator from the guide, with replies. */
export function AssistantOperator() {
  const l = useL();
  const t = useTranslations();
  const [status, setStatus] = useState<'open' | 'all' | 'closed'>('open');
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const list = useApi<OperatorRequestList>(`/admin/operator-requests?page=${page}&status=${status}${applied ? `&q=${encodeURIComponent(applied)}` : ''}`);
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;
  return (
    <div className="space-y-5">
      {list.data ? (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label={l('خلاصه', 'Summary')}>
          <li className="rounded-[var(--radius-card)] border border-line-soft bg-white p-4"><p className="text-sm text-steel">{l('منتظر جواب شما', 'Waiting for your reply')}</p><p className={`mt-1 text-2xl font-bold ${list.data.openCount ? 'text-warning' : ''}`}><Num value={list.data.openCount} /></p></li>
          <li className="rounded-[var(--radius-card)] border border-line-soft bg-white p-4"><p className="text-sm text-steel">{l('پیام خوانده‌نشده', 'Unread')}</p><p className={`mt-1 text-2xl font-bold ${list.data.unreadCount ? 'text-warning' : ''}`}><Num value={list.data.unreadCount} /></p></li>
        </ul>
      ) : null}
      <form className="flex flex-wrap items-end gap-3" role="search" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(q.trim()); }}>
        <Field id="op-q" label={l('جست‌وجو با نام، شماره یا متن پیام', 'Search name, phone or message')} className="min-w-56 flex-1"><Input id="op-q" type="search" maxLength={120} value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        <Field id="op-status" label={l('نمایش', 'Show')}>
          <Select id="op-status" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value as typeof status); }}>
            <option value="open">{l('باز', 'Open')}</option><option value="closed">{l('بسته‌شده', 'Closed')}</option><option value="all">{l('همه', 'All')}</option>
          </Select>
        </Field>
        <Button type="submit" variant="secondary">{t('common.search')}</Button>
        <Button variant="ghost" icon={<RefreshCw aria-hidden className="size-4" />} onClick={() => void list.reload()}>{l('به‌روزرسانی', 'Refresh')}</Button>
      </form>
      {list.error ? <Alert tone="danger" title={errorText(t, list.error)} /> : null}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className={selected ? 'hidden lg:block' : ''}>
          {list.loading && !list.data ? <Spinner label={l('در حال بارگیری', 'Loading')} /> : null}
          {list.data ? (list.data.items.length ? (
            <>
              <ul className="space-y-2" aria-label={l('پیام‌ها', 'Requests')}>{list.data.items.map((r) => <Row key={r.id} r={r} active={selected === r.id} onOpen={() => setSelected(r.id)} />)}</ul>
              {pages > 1 ? <nav className="mt-3 flex items-center justify-between" aria-label={l('صفحه‌ها', 'Pages')}><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{l('قبلی', 'Previous')}</Button><span className="text-sm text-steel"><Num value={page} /> / <Num value={pages} /></span><Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>{l('بعدی', 'Next')}</Button></nav> : null}
            </>
          ) : <EmptyState icon={<Headset aria-hidden className="size-8" />} title={l('پیامی برای اپراتور نیست', 'No operator messages')}>{l('وقتی بازدیدکننده‌ای در هکسی «ارتباط با اپراتور» را بزند و پیام بگذارد، اینجا نمایش داده می‌شود.', 'When a visitor uses “Talk to an operator” in the guide, the message appears here.')}</EmptyState>) : null}
        </div>
        <div className={selected ? '' : 'hidden lg:block'}>
          {selected ? <Detail key={selected} id={selected} onBack={() => setSelected(null)} onChanged={() => void list.reload()} /> : <div className="grid min-h-48 place-items-center rounded-[var(--radius-card)] border border-dashed border-line-strong p-6 text-center text-sm text-steel">{l('یک پیام را انتخاب کنید تا گفتگو را ببینید و جواب بدهید.', 'Choose a request to read and reply.')}</div>}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ s }: { s: OperatorRequestSummary['status'] }) {
  const l = useL();
  return s === 'OPEN' ? <Badge tone="warning">{l('منتظر جواب', 'Waiting')}</Badge> : s === 'ANSWERED' ? <Badge tone="success">{l('جواب داده شد', 'Answered')}</Badge> : <Badge>{l('بسته', 'Closed')}</Badge>;
}

function Row({ r, active, onOpen }: { r: OperatorRequestSummary; active: boolean; onOpen: () => void }) {
  return (
    <li>
      <button type="button" onClick={onOpen} aria-current={active ? 'true' : undefined} className={`w-full cursor-pointer rounded-[var(--radius-card)] border p-3 text-start hover:bg-surface ${active ? 'border-action bg-surface' : 'border-line-soft bg-white'}`}>
        <p className="flex items-center justify-between gap-2 font-semibold"><span dir="auto">{r.name}</span>{r.unreadByStaff ? <span aria-hidden className="size-2.5 rounded-full bg-warning" /> : null}</p>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-steel" dir="auto">{r.lastMessage}</p>
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-steel"><DateTime iso={r.lastMessageAt} /><StatusBadge s={r.status} /><span dir="ltr">{r.phone}</span></p>
      </button>
    </li>
  );
}

function Detail({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const l = useL();
  const t = useTranslations();
  const state = useApi<OperatorRequestDetail>(`/admin/operator-requests/${id}`);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setError(''); try { await fn(); await state.reload(); onChanged(); } catch (e) { setError(errorText(t, e)); } finally { setBusy(false); } };
  if (state.error) return <Alert tone="danger" title={errorText(t, state.error)} />;
  if (!state.data) return <Spinner label={l('در حال بارگیری', 'Loading')} />;
  const r = state.data;
  return (
    <Section title={r.name} actions={<div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" className="lg:hidden" onClick={onBack}>{l('بازگشت', 'Back')}</Button>{r.status === 'CLOSED' ? <Button size="sm" variant="secondary" loading={busy} onClick={() => void act(() => api(`/admin/operator-requests/${id}/status`, { method: 'POST', body: { status: 'OPEN' } }))}>{l('باز کردن دوباره', 'Reopen')}</Button> : <Button size="sm" variant="ghost" loading={busy} onClick={() => void act(() => api(`/admin/operator-requests/${id}/status`, { method: 'POST', body: { status: 'CLOSED' } }))}>{l('بستن گفتگو', 'Close')}</Button>}</div>}>
      <p className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <a href={`tel:${r.phone.replace(/[^0-9+]/g, '')}`} className="inline-flex items-center gap-1 font-semibold text-action underline underline-offset-4" dir="ltr"><Phone aria-hidden className="size-4" />{r.phone}</a>
        <StatusBadge s={r.status} />{r.signedIn ? <Badge tone="info">{l('مشتری واردشده', 'Signed-in customer')}</Badge> : <Badge>{l('مهمان', 'Guest')}</Badge>}
        <span className="text-steel">{l('شروع: ', 'Started: ')}<DateTime iso={r.createdAt} /></span>
      </p>
      <ol className="space-y-3 text-sm leading-7" aria-label={l('پیام‌ها', 'Messages')}>
        {r.messages.map((m) => (
          <li key={m.id} className="flex gap-2">
            <span aria-hidden className={`mt-1 grid size-8 shrink-0 place-items-center rounded-full ${m.sender === 'STAFF' ? 'bg-stage text-white' : 'bg-surface text-steel'}`}>{m.sender === 'STAFF' ? <Headset className="size-4" /> : <User className="size-4" />}</span>
            <div className={`min-w-0 flex-1 rounded-xl p-3 ${m.sender === 'STAFF' ? 'border border-line-soft bg-white' : 'bg-action/10'}`}>
              <p className="mb-1 text-xs font-semibold text-steel">{m.sender === 'STAFF' ? (m.staffName ?? l('اپراتور', 'Operator')) : r.name} · <DateTime iso={m.createdAt} /></p>
              <p className="whitespace-pre-line break-words" dir="auto">{m.body}</p>
            </div>
          </li>
        ))}
      </ol>
      {error ? <Alert tone="danger" title={error} className="mt-3" /> : null}
      <form className="mt-4 space-y-2" onSubmit={(e) => { e.preventDefault(); if (reply.trim()) void act(async () => { await api(`/admin/operator-requests/${id}/reply`, { method: 'POST', body: { message: reply.trim() } }); setReply(''); }); }}>
        <Field id="op-reply" label={l('جواب شما (در هکسی و پنل مشتری نمایش داده می‌شود)', 'Your reply (shown in the guide and the customer account)')}><Textarea id="op-reply" dir="auto" rows={4} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} /></Field>
        <Button type="submit" loading={busy} disabled={!reply.trim()} icon={<Send aria-hidden className="size-4" />}>{l('ارسال جواب', 'Send reply')}</Button>
      </form>
    </Section>
  );
}
