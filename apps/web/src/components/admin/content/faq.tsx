'use client';

import type { FaqItemView, Localized } from '@hedax/contracts';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Async } from '@/components/ui/async';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Section } from '@/components/ui/misc';
import { api } from '@/lib/api/client';
import { errorText, isApiError } from '@/lib/api/errors';
import { useApi } from '@/lib/use-api';
import { useL } from '../shell';
import { ContentFrame, ContentHistory, type FieldErrors, LocalizedField, MoveButtons, type Status, ToggleField, fieldErrors, moveItem } from './kit';

type Draft = { question: Localized; answer: Localized; visible: boolean };
const blank: Draft = { question: { fa: '', en: '' }, answer: { fa: '', en: '' }, visible: true };

function FaqForm({ id, initial, onSaved, onCancel, saveLabel }: { id: string; initial: Draft; onSaved: (d: Draft) => Promise<void>; onCancel?: () => void; saveLabel: string }) {
  const t = useTranslations();
  const l = useL();
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setStatus(null);
    setBusy(true);
    try {
      await onSaved(draft);
      setErrors({});
      setStatus({ tone: 'success', text: l('ذخیره شد.', 'Saved.') });
    } catch (e) {
      const fields = isApiError(e) ? fieldErrors(e) : {};
      setErrors(fields);
      setStatus({ tone: 'danger', text: Object.keys(fields).length ? l('چند مورد نیاز به اصلاح دارد؛ کادرهای قرمز را ببینید.', 'Some fields need fixing; see the fields marked in red.') : errorText(t, e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <LocalizedField id={`${id}-q`} path="question" label={l('پرسش', 'Question')} required maxLength={200} value={draft.question} onChange={(v) => setDraft({ ...draft, question: v })} errors={errors} />
      <LocalizedField id={`${id}-a`} path="answer" label={l('پاسخ', 'Answer')} required multiline rows={4} maxLength={2000} value={draft.answer} onChange={(v) => setDraft({ ...draft, answer: v })} errors={errors} />
      <ToggleField id={`${id}-v`} label={l('نمایش روی سایت', 'Show on the site')} checked={draft.visible} onChange={(v) => setDraft({ ...draft, visible: v })} />
      <div aria-live="polite">{status ? <Alert tone={status.tone} title={status.text} /> : null}</div>
      <div className="flex flex-wrap gap-2">
        <Button loading={busy} onClick={() => void submit()}>{saveLabel}</Button>
        {onCancel ? <Button variant="ghost" onClick={onCancel}>{l('انصراف', 'Cancel')}</Button> : null}
      </div>
    </div>
  );
}

/** Questions on the home page: add, edit, hide, reorder and delete. */
export function ContentFaqPage() {
  const t = useTranslations();
  const l = useL();
  const state = useApi<FaqItemView[]>('/admin/content/faq');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changes, setChanges] = useState(0);
  const done = async () => {
    setChanges((n) => n + 1);
    await state.reload();
  };
  const body = (d: Draft) => ({ question: d.question, answer: d.answer, visible: d.visible });
  const reorder = async (items: FaqItemView[], from: number, to: number) => {
    setError(null);
    try {
      await api('/admin/content/faq/order', { method: 'POST', body: { ids: moveItem(items, from, to).map((x) => x.id) } });
      await done();
    } catch (e) { setError(errorText(t, e)); }
  };
  const remove = async (item: FaqItemView) => {
    if (!window.confirm(l(`پرسش «${item.question.fa}» حذف شود؟`, `Delete the question "${item.question.fa}"?`))) return;
    setError(null);
    try {
      await api(`/admin/content/faq/${item.id}`, { method: 'DELETE' });
      await done();
    } catch (e) { setError(errorText(t, e)); }
  };
  return (
    <ContentFrame title={l('پرسش‌های متداول', 'FAQ')} description={l('در بخش «پرسش‌های متداول» صفحهٔ اصلی، به همین ترتیب نمایش داده می‌شوند.', 'Shown in this order in the FAQ section of the home page.')}>
      {error ? <Alert tone="danger" title={error} /> : null}
      <Async state={state}>
        {(items) => (
          <ol className="flex flex-col gap-3">
            {items.map((item, i) => (
              <li key={item.id} className="card">
                <div className="flex flex-wrap items-center gap-2 p-3 sm:p-4">
                  <button type="button" className="min-h-11 basis-full cursor-pointer text-start font-semibold leading-7 sm:basis-auto sm:flex-1" aria-expanded={open === item.id} onClick={() => setOpen(open === item.id ? null : item.id)}>
                    <span className="num me-2 text-steel">{i + 1}.</span>{item.question.fa}
                  </button>
                  {item.visible ? null : <Badge tone="neutral">{l('مخفی', 'Hidden')}</Badge>}
                  <MoveButtons index={i} count={items.length} name={item.question.fa} onMove={(a, b) => void reorder(items, a, b)} />
                  <Button size="sm" variant="ghost" className="text-danger" aria-label={l(`حذف «${item.question.fa}»`, `Delete "${item.question.fa}"`)} onClick={() => void remove(item)}><Trash2 aria-hidden className="size-4" /></Button>
                </div>
                {open === item.id ? (
                  <div className="border-t border-line-soft p-3 sm:p-4">
                    <FaqForm id={`f-${item.id}`} initial={{ question: item.question, answer: item.answer, visible: item.visible }} saveLabel={l('ذخیره', 'Save')}
                      onSaved={async (d) => { await api(`/admin/content/faq/${item.id}`, { method: 'PUT', body: body(d) }); await done(); }} />
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Async>
      <Section title={l('پرسش تازه', 'New question')}>
        {adding ? (
          <FaqForm id="f-new" initial={blank} saveLabel={l('افزودن', 'Add')} onCancel={() => setAdding(false)}
            onSaved={async (d) => { await api('/admin/content/faq', { method: 'POST', body: body(d) }); setAdding(false); await done(); }} />
        ) : <Button variant="secondary" onClick={() => setAdding(true)}><Plus aria-hidden className="size-4" /> {l('افزودن پرسش', 'Add a question')}</Button>}
      </Section>
      <ContentHistory entityType="faq_item" refreshKey={changes} />
    </ContentFrame>
  );
}
