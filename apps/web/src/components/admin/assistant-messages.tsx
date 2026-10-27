'use client';

import type { AssistantConversationDetail, AssistantConversationList, AssistantConversationSummary } from '@hedax/contracts';
import { AlertTriangle, Bot, MessagesSquare, RefreshCw, Trash2, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { DateTime, Num } from '@/components/ui/format';
import { Alert, Badge, Code, EmptyState, Section, Spinner } from '@/components/ui/misc';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';
import { useApi } from '@/lib/use-api';
import { useL } from './shell';

/**
 * Admin → AI Chatbot → Messages: what visitors asked the guide and what it answered.
 * Read-only review (plus delete); conversations are deleted automatically after the retention period.
 */
export function AssistantMessages() {
  const l = useL();
  const t = useTranslations();
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const [status, setStatus] = useState<'all' | 'failed'>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const list = useApi<AssistantConversationList>(`/admin/assistant/conversations?page=${page}&status=${status}${applied ? `&q=${encodeURIComponent(applied)}` : ''}`);
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <div className="space-y-5">
      {list.data ? (
        <ul className="grid gap-3 sm:grid-cols-3" aria-label={l('آمار هفت روز اخیر', 'Last 7 days')}>
          <Stat label={l('گفتگو در ۷ روز اخیر', 'Conversations, last 7 days')} value={list.data.stats.conversations7d} />
          <Stat label={l('پیام در ۷ روز اخیر', 'Messages, last 7 days')} value={list.data.stats.messages7d} />
          <Stat label={l('بی‌پاسخ در ۷ روز اخیر', 'Unanswered, last 7 days')} value={list.data.stats.failed7d} warn={list.data.stats.failed7d > 0} />
        </ul>
      ) : null}

      <form className="flex flex-wrap items-end gap-3" role="search" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(q.trim()); }}>
        <Field id="am-q" label={l('جست‌وجو در پرسش‌ها و پاسخ‌ها', 'Search questions and answers')} className="min-w-56 flex-1"><Input id="am-q" type="search" maxLength={120} value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        <Field id="am-status" label={l('نمایش', 'Show')}>
          <Select id="am-status" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value as 'all' | 'failed'); }}>
            <option value="all">{l('همهٔ گفتگوها', 'All conversations')}</option>
            <option value="failed">{l('فقط گفتگوهای دارای خطا', 'Only with errors')}</option>
          </Select>
        </Field>
        <Button type="submit" variant="secondary">{t('common.search')}</Button>
        <Button variant="ghost" icon={<RefreshCw aria-hidden className="size-4" />} onClick={() => void list.reload()}>{l('به‌روزرسانی', 'Refresh')}</Button>
      </form>

      {list.data ? <p className="text-sm leading-7 text-steel">{l(`گفتگوها ${list.data.retentionDays} روز پس از آخرین پیام خودکار حذف می‌شوند. فقط متن پرسش و پاسخ ذخیره می‌شود؛ IP بازدیدکننده به‌صورت رمزنگاری‌شده نگه داشته می‌شود و نمایش داده نمی‌شود.`, `Conversations are deleted automatically ${list.data.retentionDays} days after their last message. Only the question and answer text is stored; the visitor's IP is kept hashed and never shown.`)}</p> : null}
      {list.error ? <Alert tone="danger" title={errorText(t, list.error)} /> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className={selected ? 'hidden lg:block' : ''}>
          {list.loading && !list.data ? <Spinner label={l('در حال بارگیری', 'Loading')} /> : null}
          {list.data ? (
            list.data.items.length ? (
              <>
                <p className="mb-2 text-sm text-steel">{l('تعداد گفتگو: ', 'Conversations: ')}<Num value={list.data.total} /></p>
                <ul className="space-y-2" aria-label={l('گفتگوها', 'Conversations')}>
                  {list.data.items.map((c) => <ConversationRow key={c.id} c={c} active={selected === c.id} onOpen={() => setSelected(c.id)} />)}
                </ul>
                {pages > 1 ? (
                  <nav className="mt-3 flex items-center justify-between gap-2" aria-label={l('صفحه‌ها', 'Pages')}>
                    <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{l('قبلی', 'Previous')}</Button>
                    <span className="text-sm text-steel"><Num value={page} /> / <Num value={pages} /></span>
                    <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>{l('بعدی', 'Next')}</Button>
                  </nav>
                ) : null}
              </>
            ) : (
              <EmptyState icon={<MessagesSquare aria-hidden className="size-8" />} title={applied || status === 'failed' ? l('گفتگویی با این شرایط پیدا نشد', 'No conversation matches') : l('هنوز پیامی ثبت نشده است', 'No messages yet')}>
                {applied || status === 'failed' ? null : l('از این به بعد، هر پرسشی که بازدیدکننده‌ها از دستیار بپرسند اینجا نمایش داده می‌شود.', 'From now on, every question visitors ask the guide appears here.')}
              </EmptyState>
            )
          ) : null}
        </div>
        <div className={selected ? '' : 'hidden lg:block'}>
          {selected ? (
            <ConversationView key={selected} id={selected} onBack={() => setSelected(null)} onDeleted={async () => { setSelected(null); await list.reload(); }} />
          ) : (
            <div className="grid min-h-48 place-items-center rounded-[var(--radius-card)] border border-dashed border-line-strong p-6 text-center text-sm text-steel">{l('یک گفتگو را از فهرست انتخاب کنید تا پرسش‌ها و پاسخ‌های دستیار را ببینید.', 'Choose a conversation to read the questions and the guide’s answers.')}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <li className="rounded-[var(--radius-card)] border border-line-soft bg-white p-4">
      <p className="text-sm text-steel">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${warn ? 'text-warning' : ''}`}><Num value={value} /></p>
    </li>
  );
}

function ConversationRow({ c, active, onOpen }: { c: AssistantConversationSummary; active: boolean; onOpen: () => void }) {
  const l = useL();
  return (
    <li>
      <button type="button" onClick={onOpen} aria-current={active ? 'true' : undefined}
        className={`w-full cursor-pointer rounded-[var(--radius-card)] border p-3 text-start transition-colors hover:bg-surface ${active ? 'border-action bg-surface' : 'border-line-soft bg-white'}`}>
        <p className="line-clamp-2 font-semibold leading-7" dir="auto">{c.firstQuestion || l('(بدون متن)', '(empty)')}</p>
        {c.lastAnswer ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-steel" dir="auto">{c.lastAnswer}</p> : null}
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-steel">
          <DateTime iso={c.lastMessageAt} />
          <Badge>{l('پیام: ', 'Messages: ')}<Num value={c.messageCount} /></Badge>
          {c.failedCount ? <Badge tone="danger">{l('خطا: ', 'Errors: ')}<Num value={c.failedCount} /></Badge> : null}
          <Badge tone="info">{c.locale === 'fa' ? 'فارسی' : 'English'}</Badge>
          {c.signedIn ? <Badge tone="success">{l('کاربر واردشده', 'Signed in')}</Badge> : null}
        </p>
      </button>
    </li>
  );
}

function ConversationView({ id, onBack, onDeleted }: { id: string; onBack: () => void; onDeleted: () => Promise<void> }) {
  const l = useL();
  const t = useTranslations();
  const state = useApi<AssistantConversationDetail>(`/admin/assistant/conversations/${id}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const remove = async () => {
    if (!window.confirm(l('این گفتگو برای همیشه حذف شود؟', 'Delete this conversation for good?'))) return;
    setBusy(true); setError('');
    try { await api(`/admin/assistant/conversations/${id}`, { method: 'DELETE' }); await onDeleted(); } catch (e) { setError(errorText(t, e)); } finally { setBusy(false); }
  };
  if (state.error) return <Alert tone="danger" title={errorText(t, state.error)} />;
  if (!state.data) return <Spinner label={l('در حال بارگیری', 'Loading')} />;
  const c = state.data;
  return (
    <Section
      title={l('جزئیات گفتگو', 'Conversation')}
      actions={(
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" className="lg:hidden" onClick={onBack}>{l('بازگشت به فهرست', 'Back to list')}</Button>
          <Button size="sm" variant="danger" loading={busy} icon={<Trash2 aria-hidden className="size-4" />} onClick={() => void remove()}>{l('حذف گفتگو', 'Delete')}</Button>
        </div>
      )}
    >
      <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-steel">
        <span>{l('شروع: ', 'Started: ')}<DateTime iso={c.startedAt} /></span>
        <span>·</span>
        <span>{l('آخرین پیام: ', 'Last message: ')}<DateTime iso={c.lastMessageAt} /></span>
      </p>
      {error ? <Alert tone="danger" title={error} className="mb-3" /> : null}
      <ol className="space-y-4" aria-label={l('پیام‌ها', 'Messages')}>
        {c.messages.map((m) => (
          <li key={m.id} className="space-y-2 text-sm leading-7">
            <div className="flex gap-2">
              <span aria-hidden className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-surface text-steel"><User className="size-4" /></span>
              <div className="min-w-0 flex-1 rounded-xl bg-action/10 p-3">
                <p className="mb-1 text-xs font-semibold text-steel">{l('بازدیدکننده', 'Visitor')} · <DateTime iso={m.createdAt} /></p>
                <p className="whitespace-pre-line break-words" dir="auto">{m.question}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <span aria-hidden className={`mt-1 grid size-8 shrink-0 place-items-center rounded-full ${m.status === 'FAILED' ? 'bg-danger/10 text-danger' : 'bg-stage text-white'}`}>{m.status === 'FAILED' ? <AlertTriangle className="size-4" /> : <Bot className="size-4" />}</span>
              <div className="min-w-0 flex-1 rounded-xl border border-line-soft bg-white p-3">
                {m.status === 'FAILED' ? (
                  <>
                    <Badge tone="danger">{l('بدون پاسخ', 'Not answered')}</Badge>
                    <p className="mt-2 text-steel">{l('علت: ', 'Reason: ')}<span dir="ltr">{m.errorReason ?? '—'}</span></p>
                    <p className="text-xs text-steel">{failureHint(m.errorReason, l)}</p>
                  </>
                ) : <p className="whitespace-pre-line break-words" dir="auto">{m.answer}</p>}
                {m.productSkus.length ? <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-steel">{l('قطعه‌های نمایش‌داده‌شده:', 'Parts shown:')} {m.productSkus.map((s) => <Code key={s}>{s}</Code>)}</p> : null}
                <p className="mt-2 flex flex-wrap gap-3 text-xs text-steel" dir="ltr">
                  {m.latencyMs !== null ? <span>{(m.latencyMs / 1000).toFixed(1)} s</span> : null}
                  {m.promptTokens !== null && m.completionTokens !== null ? <span>{m.promptTokens} + {m.completionTokens} tokens</span> : null}
                  {m.model ? <span>{m.provider} · {m.model}</span> : null}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** A plain explanation of the usual failure reasons, so the owner knows what to fix. */
function failureHint(reason: string | null, l: (fa: string, en: string) => string): string {
  const r = reason ?? '';
  if (/budget/i.test(r)) return l('بودجهٔ روزانهٔ مصرف تمام شده یا تنظیم نشده است.', 'The daily spending budget is used up or not configured.');
  if (/request limit/i.test(r)) return l('سقف درخواست روزانه پر شده است (تنظیمات عمومی).', 'The daily request cap was reached (General settings).');
  if (/busy/i.test(r)) return l('هم‌زمان درخواست‌های زیادی در جریان بود.', 'Too many requests were running at the same time.');
  if (/provider unavailable/i.test(r)) return l('سرویس هوش مصنوعی آروان پاسخ نداد یا خطا برگرداند.', 'The Arvan AI service did not respond or returned an error.');
  if (/no text/i.test(r)) return l('مدل پاسخ خالی برگرداند.', 'The model returned an empty reply.');
  return l('جزئیات بیشتر در گزارش سرور.', 'More details are in the server log.');
}
