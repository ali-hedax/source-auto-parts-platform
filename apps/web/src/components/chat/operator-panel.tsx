'use client';

import type { OperatorRequestCreated, OperatorThreadView } from '@hedax/contracts';
import { ArrowRight, Headset, Send } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/field';
import { api } from '@/lib/api/client';

const STORE = 'hedax-operator-request';

type Saved = { id: string; key: string };
function readSaved(): Saved | null {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Partial<Saved> | null;
    return v && typeof v.id === 'string' && typeof v.key === 'string' ? { id: v.id, key: v.key } : null;
  } catch { return null; }
}

const copy = {
  fa: {
    title: 'ارتباط با اپراتور', back: 'بازگشت به هکسی',
    intro: 'پیامتان را بگذارید؛ اپراتور سورس در اولین فرصت همین‌جا جواب می‌دهد. برای مشاوره، انتخاب قطعه یا پیگیری سفارش.',
    name: 'نام شما', phone: 'شماره تماس', message: 'پیام شما', send: 'ارسال برای اپراتور', follow: 'پیام تکمیلی', sendShort: 'ارسال',
    waiting: 'پیام شما ثبت شد ✅ اپراتور به‌زودی جواب می‌دهد. جواب همین‌جا نمایش داده می‌شود؛ می‌توانید صفحه را ببندید و بعداً برگردید.',
    you: 'شما', operator: 'اپراتور سورس', closed: 'این گفتگو بسته شده است.', newRequest: 'پیام جدید', error: 'ارسال نشد. دوباره تلاش کنید.',
    privacy: 'شماره تماس فقط برای پاسخ اپراتور استفاده می‌شود.',
  },
  en: {
    title: 'Talk to an operator', back: 'Back to Hexi',
    intro: 'Leave a message and a Source operator will reply right here as soon as possible: advice, choosing a part or following up an order.',
    name: 'Your name', phone: 'Phone number', message: 'Your message', send: 'Send to operator', follow: 'Follow-up message', sendShort: 'Send',
    waiting: 'Your message was received ✅ An operator will reply soon. The reply appears here; you can close this page and come back later.',
    you: 'You', operator: 'Source operator', closed: 'This conversation is closed.', newRequest: 'New message', error: 'Could not send. Please try again.',
    privacy: 'Your phone number is only used for the operator’s reply.',
  },
} as const;

/** "Talk to an operator" inside the guide: a short form, then the thread with the operator's replies. */
export function OperatorPanel({ locale, onBack }: { locale: 'fa' | 'en'; onBack: () => void }) {
  const c = copy[locale];
  const [saved, setSaved] = useState<Saved | null>(null);
  const [thread, setThread] = useState<OperatorThreadView | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', message: '' });
  const [follow, setFollow] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (s: Saved) => {
    try { setThread(await api<OperatorThreadView>(`/assistant/operator/${s.id}?key=${encodeURIComponent(s.key)}`)); }
    catch { /* A removed request simply shows the form again. */ setSaved(null); try { localStorage.removeItem(STORE); } catch { /* optional */ } }
  }, []);

  useEffect(() => { const s = readSaved(); if (s) { setSaved(s); void load(s); } }, [load]);
  // While the panel is open, check for the operator's reply every 30 seconds.
  useEffect(() => {
    if (!saved) return;
    const timer = window.setInterval(() => { if (!document.hidden) void load(saved); }, 30_000);
    return () => window.clearInterval(timer);
  }, [saved, load]);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const created = await api<OperatorRequestCreated>('/assistant/operator', { method: 'POST', body: { locale, name: form.name.trim(), phone: form.phone.trim(), message: form.message.trim() } });
      const s = { id: created.id, key: created.key };
      try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* the thread still shows until the page closes */ }
      setSaved(s); await load(s); setForm({ name: '', phone: '', message: '' });
    } catch { setError(c.error); } finally { setBusy(false); }
  };
  const sendFollow = async () => {
    if (!saved || !follow.trim()) return;
    setBusy(true); setError('');
    try { setThread(await api<OperatorThreadView>(`/assistant/operator/${saved.id}/messages`, { method: 'POST', body: { key: saved.key, message: follow.trim() } })); setFollow(''); }
    catch { setError(c.error); } finally { setBusy(false); }
  };
  const startNew = () => { try { localStorage.removeItem(STORE); } catch { /* optional */ } setSaved(null); setThread(null); };

  return (
    <section aria-label={c.title} className="space-y-3 text-sm leading-7">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-bold"><Headset aria-hidden className="size-5 text-action" />{c.title}</h3>
        <button type="button" onClick={onBack} className="inline-flex min-h-11 cursor-pointer items-center gap-1 text-xs font-semibold text-action underline underline-offset-4"><ArrowRight aria-hidden className="size-4 ltr:rotate-180" />{c.back}</button>
      </div>
      {thread ? (
        <>
          <ol className="space-y-2" aria-live="polite">
            {thread.messages.map((m) => (
              <li key={m.id} className={m.sender === 'VISITOR' ? 'ms-6 rounded-xl bg-action p-3 text-white' : 'me-3 rounded-xl border border-line-soft bg-white p-3'}>
                <p className="mb-1 text-xs opacity-80">{m.sender === 'VISITOR' ? c.you : c.operator}</p>
                <p className="whitespace-pre-line break-words" dir="auto">{m.body}</p>
              </li>
            ))}
          </ol>
          {thread.messages.every((m) => m.sender === 'VISITOR') ? <p className="rounded-xl bg-surface p-3 text-xs">{c.waiting}</p> : null}
          {thread.status === 'CLOSED' ? (
            <div className="space-y-2"><p className="text-xs text-steel">{c.closed}</p><Button variant="secondary" size="sm" onClick={startNew}>{c.newRequest}</Button></div>
          ) : (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void sendFollow(); }}>
              <label htmlFor="operator-follow" className="sr-only">{c.follow}</label>
              <Input id="operator-follow" dir="auto" maxLength={1000} placeholder={c.follow} value={follow} onChange={(e) => setFollow(e.target.value)} className="min-w-0 flex-1" />
              <Button type="submit" aria-label={c.sendShort} disabled={!follow.trim() || busy} loading={busy}><Send aria-hidden className="size-4" /></Button>
            </form>
          )}
        </>
      ) : (
        <form className="space-y-3 rounded-xl border border-line-soft bg-white p-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <p>{c.intro}</p>
          <div><label htmlFor="operator-name" className="mb-1 block text-xs font-semibold">{c.name}</label><Input id="operator-name" autoComplete="name" required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label htmlFor="operator-phone" className="mb-1 block text-xs font-semibold">{c.phone}</label><Input id="operator-phone" type="tel" dir="ltr" inputMode="tel" autoComplete="tel" required maxLength={30} placeholder="09xx xxx xxxx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label htmlFor="operator-message" className="mb-1 block text-xs font-semibold">{c.message}</label><Textarea id="operator-message" dir="auto" required rows={4} maxLength={1000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
          <p className="text-xs text-steel">{c.privacy}</p>
          <Button type="submit" className="w-full" loading={busy} disabled={!form.name.trim() || !form.phone.trim() || !form.message.trim()}>{c.send}</Button>
        </form>
      )}
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </section>
  );
}
