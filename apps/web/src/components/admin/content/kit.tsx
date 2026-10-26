'use client';

import type { ContentSectionKey, ContentSections, Localized } from '@hedax/contracts';
import { CONTENT_IMAGE_MAX_BYTES } from '@hedax/contracts/constants';
import { ArrowRight, ChevronDown, ChevronUp, ImagePlus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/field';
import { DateTime } from '@/components/ui/format';
import { Alert, Ltr, PageHeader, Section } from '@/components/ui/misc';
import { api } from '@/lib/api/client';
import { errorText, isApiError } from '@/lib/api/errors';
import { useApi } from '@/lib/use-api';
import { useL } from '../shell';

export type FieldErrors = Record<string, string>;
export type Status = { tone: 'success' | 'danger' | 'warning'; text: string } | null;

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Persian/English text for a validation code from the shared schemas or the API. */
export function useFieldMessage() {
  const l = useL();
  return (code: string): string => {
    switch (code) {
      case 'INVALID_LINK': return l('لینک معتبر نیست. با / (صفحه‌ای از همین سایت) یا https:// شروع کنید.', 'Not a valid link. Start with / (a page of this site) or https://.');
      case 'INVALID_URL': return l('نشانی معتبر نیست. با https:// شروع کنید.', 'Not a valid address. Start with https://.');
      case 'INVALID_IMAGE': return l('تصویر معتبر نیست. از دکمهٔ آپلود استفاده کنید.', 'Not a valid image. Use the upload button.');
      case 'INVALID_EMAIL': return l('ایمیل معتبر نیست؛ مثل info@example.com', 'Not a valid e-mail, e.g. info@example.com');
      case 'INVALID_PHONE': return l('شماره معتبر نیست؛ فقط رقم، +، فاصله و خط تیره. مثل +98 25 3666 6669', 'Not a valid number: digits, +, spaces and dashes, e.g. +98 25 3666 6669');
      case 'INVALID_SLUG': return l('نشانی صفحه فقط حروف کوچک انگلیسی، عدد و خط تیره، مثل shipping-terms', 'Lower-case letters, digits and dashes only, e.g. shipping-terms');
      case 'DUPLICATE_SECTION': return l('این بخش دو بار آمده است.', 'This section appears twice.');
      case 'REQUIRED':
      case 'too_small': return l('این مورد را پر کنید.', 'Fill this in.');
      case 'too_big': return l('متن بیش از حد طولانی است.', 'This text is too long.');
      default: return l('مقدار معتبر نیست.', 'Not a valid value.');
    }
  };
}

/** Field path → validation code, from the API error (e.g. "phones.0.number" → "INVALID_PHONE"). */
export function fieldErrors(e: { fields: ReadonlyArray<{ path: string; message: string; code: string }> }): FieldErrors {
  const out: FieldErrors = {};
  for (const f of e.fields) out[f.path] ??= /^[A-Z_]+$/.test(f.message) ? f.message : f.code;
  return out;
}

type SectionsResponse = { [K in ContentSectionKey]: { value: ContentSections[K]; version: number; updatedAt: string | null } };

/**
 * Loads one content section, keeps the edited copy, saves it with its version and shows the
 * result. The server validates with the shared schema and names every field that needs fixing.
 */
export function useContentSection<K extends ContentSectionKey>(key: K) {
  const t = useTranslations();
  const l = useL();
  const state = useApi<SectionsResponse>('/admin/content');
  const [draft, setDraft] = useState<ContentSections[K] | null>(null);
  const [version, setVersion] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    if (!state.data) return;
    setDraft(state.data[key].value);
    setVersion(state.data[key].version);
  }, [state.data, key]);

  const save = async () => {
    if (!draft) return;
    setStatus(null);
    setBusy(true);
    try {
      const res = await api<{ version: number }>(`/admin/content/sections/${key}`, { method: 'PUT', body: { version, value: draft } });
      setVersion(res.version);
      setErrors({});
      setSaved((n) => n + 1);
      setStatus({ tone: 'success', text: l('ذخیره شد و همین حالا روی سایت دیده می‌شود.', 'Saved; the site shows it now.') });
    } catch (e) {
      const fields = isApiError(e) ? fieldErrors(e) : {};
      setErrors(fields);
      setStatus({
        tone: 'danger',
        text: Object.keys(fields).length
          ? l('چند مورد نیاز به اصلاح دارد؛ کادرهای قرمز را ببینید.', 'Some fields need fixing; see the fields marked in red.')
          : isApiError(e) && e.code === 'VERSION_CONFLICT'
          ? l('این بخش هم‌زمان توسط شخص دیگری ذخیره شده است. صفحه را دوباره بارگذاری کنید تا آخرین نسخه را ببینید.', 'Someone else saved this section meanwhile. Reload the page to see the latest version.')
          : errorText(t, e),
      });
    } finally {
      setBusy(false);
    }
  };
  const update = useCallback((patch: Partial<ContentSections[K]>) => setDraft((d) => (d ? { ...d, ...patch } : d)), []);
  return { state, draft, setDraft, update, errors, status, busy, save, saved };
}

/** Page frame for one content section: title, a way back to the content list, and the content. */
export function ContentFrame({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const l = useL();
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-6 pb-4">
      <div>
        <ButtonLink href="/admin/content" variant="ghost" size="sm" className="-ms-2 mb-1">
          <ArrowRight aria-hidden className={`size-4 ${locale === 'fa' ? '' : 'rotate-180'}`} /> {l('مدیریت سایت', 'Website management')}
        </ButtonLink>
        <PageHeader title={title} {...(description ? { description } : {})} />
      </div>
      {children}
    </div>
  );
}

/** One text in both languages: Persian (right-to-left) and English (left-to-right). */
export function LocalizedField({
  id, label, value, onChange, errors, path, multiline = false, rows = 3, maxLength, required = false, hint,
}: {
  id: string; label: string; value: Localized; onChange: (v: Localized) => void; errors: FieldErrors; path: string;
  multiline?: boolean; rows?: number; maxLength?: number; required?: boolean; hint?: string;
}) {
  const l = useL();
  const msg = useFieldMessage();
  const errFa = errors[`${path}.fa`];
  const errEn = errors[`${path}.en`];
  const control = (lang: 'fa' | 'en', err: string | undefined) => {
    const common = {
      id: `${id}-${lang}`,
      value: value[lang],
      dir: lang === 'fa' ? 'rtl' : 'ltr',
      lang,
      maxLength,
      invalid: !!err,
      'aria-describedby': err ? `${id}-${lang}-error` : undefined,
    } as const;
    return multiline
      ? <Textarea {...common} rows={rows} onChange={(e) => onChange({ ...value, [lang]: e.target.value })} />
      : <Input {...common} onChange={(e) => onChange({ ...value, [lang]: e.target.value })} />;
  };
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-semibold">{label}{required ? <span className="text-danger"> *</span> : null}</legend>
      {hint ? <p className="mb-2 text-xs leading-5 text-steel">{hint}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Field id={`${id}-fa`} label={l('فارسی', 'Persian')} {...(errFa ? { error: msg(errFa) } : {})}>{control('fa', errFa)}</Field>
        <Field id={`${id}-en`} label={l('انگلیسی (اگر خالی بماند، متن فارسی نمایش داده می‌شود)', 'English (empty = the Persian text is shown)')} {...(errEn ? { error: msg(errEn) } : {})}>{control('en', errEn)}</Field>
      </div>
    </fieldset>
  );
}

export function TextField({
  id, label, value, onChange, error, hint, ltr = false, type = 'text', inputMode, placeholder, required = false, maxLength,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string | undefined; hint?: string; ltr?: boolean;
  type?: string; inputMode?: 'text' | 'tel' | 'email' | 'url' | 'numeric' | 'decimal'; placeholder?: string; required?: boolean; maxLength?: number;
}) {
  const msg = useFieldMessage();
  return (
    <Field id={id} label={label} required={required} {...(hint ? { hint } : {})} {...(error ? { error: msg(error) } : {})}>
      <Input id={id} type={type} value={value} invalid={!!error} {...(ltr ? { dir: 'ltr' } : {})} {...(inputMode ? { inputMode } : {})} {...(placeholder ? { placeholder } : {})} {...(maxLength ? { maxLength } : {})} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

/** A link target with the accepted forms explained. */
export function LinkField({ id, label, value, onChange, error }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string | undefined }) {
  const l = useL();
  return <TextField id={id} label={label} value={value} onChange={onChange} error={error} ltr inputMode="url" placeholder="/request-part" hint={l('صفحه‌ای از همین سایت مثل /parts، یا نشانی کامل مثل https://…', 'A page of this site like /parts, or a full address like https://…')} />;
}

export function ToggleField({ id, label, checked, onChange, hint }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div>
      <Checkbox id={id} label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {hint ? <p className="ms-7 text-xs leading-5 text-steel">{hint}</p> : null}
    </div>
  );
}

/**
 * Picture field: upload (JPG, PNG or WebP up to 5 MB; compressed on the server), preview and
 * remove. The saved value is the address the server returns.
 */
export function ImageField({
  id, label, value, onChange, purpose = 'image', error, hint, previewClassName = 'max-h-32', dark = false,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void; purpose?: 'image' | 'logo' | 'favicon'; error?: string | undefined;
  hint?: string; previewClassName?: string; dark?: boolean;
}) {
  const t = useTranslations();
  const l = useL();
  const msg = useFieldMessage();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    if (!IMAGE_TYPES.includes(file.type)) {
      setProblem(l('فقط تصویر JPG، PNG یا WebP.', 'Only JPG, PNG or WebP images.'));
      return;
    }
    if (file.size > CONTENT_IMAGE_MAX_BYTES) {
      setProblem(l('حجم تصویر بیش از ۵ مگابایت است.', 'The image is larger than 5 MB.'));
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api<{ url: string }>(`/admin/content/images?purpose=${purpose}`, { method: 'POST', body: form });
      onChange(res.url);
    } catch (e) {
      setProblem(errorText(t, e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const shown = problem ?? (error ? msg(error) : null);
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold">{label}</p>
      {hint ? <p className="mb-2 text-xs leading-5 text-steel">{hint}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <div className={`grid min-h-16 min-w-24 place-items-center rounded-[var(--radius-control)] border border-line-soft p-2 ${dark ? 'bg-carbon' : 'bg-surface'}`}>
          {value
            // eslint-disable-next-line @next/next/no-img-element -- preview of an uploaded file of any size
            ? <img src={value} alt="" className={`w-auto ${previewClassName}`} />
            : <span className="text-xs text-steel">{l('بدون تصویر', 'No image')}</span>}
        </div>
        <input ref={input} id={id} type="file" accept={IMAGE_TYPES.join(',')} className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
        <Button size="sm" variant="secondary" loading={busy} onClick={() => input.current?.click()}><ImagePlus aria-hidden className="size-4" /> {value ? l('تعویض تصویر', 'Replace') : l('آپلود تصویر', 'Upload')}</Button>
        {value ? <Button size="sm" variant="ghost" onClick={() => onChange('')}><Trash2 aria-hidden className="size-4" /> {l('حذف', 'Remove')}</Button> : null}
      </div>
      <p className="mt-1 text-xs text-steel">{l('JPG، PNG یا WebP تا ۵ مگابایت؛ خودکار فشرده می‌شود.', 'JPG, PNG or WebP up to 5 MB; compressed automatically.')}</p>
      {shown ? <p role="alert" className="mt-1 text-sm text-danger">{shown}</p> : null}
    </div>
  );
}

/** Move an item up or down a list (keyboard and touch friendly). */
export function MoveButtons({ index, count, onMove, name }: { index: number; count: number; onMove: (from: number, to: number) => void; name: string }) {
  const l = useL();
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label={l(`انتقال «${name}» به بالا`, `Move "${name}" up`)}><ChevronUp aria-hidden className="size-4" /></Button>
      <Button size="sm" variant="ghost" disabled={index === count - 1} onClick={() => onMove(index, index + 1)} aria-label={l(`انتقال «${name}» به پایین`, `Move "${name}" down`)}><ChevronDown aria-hidden className="size-4" /></Button>
    </div>
  );
}

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

/** Save button kept in reach at the bottom of the screen, with the result announced. */
export function SaveBar({ busy, onSave, status, label }: { busy: boolean; onSave: () => void; status: Status; label?: string }) {
  const l = useL();
  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t border-line-soft bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-[var(--radius-card)] sm:border">
      <div aria-live="polite">{status ? <Alert tone={status.tone} title={status.text} className="mb-3" /> : null}</div>
      <Button loading={busy} onClick={onSave} className="w-full sm:w-auto">{label ?? l('ذخیره', 'Save')}</Button>
    </div>
  );
}

type AuditRow = { id: string; at: string; actor: string; action: string; before: unknown; after: unknown };

const changedFields = (before: unknown, after: unknown): string[] => {
  if (!after || typeof after !== 'object' || Array.isArray(after)) return [];
  const b = (before && typeof before === 'object' ? before : {}) as Record<string, unknown>;
  return Object.keys(after as Record<string, unknown>).filter((k) => JSON.stringify(b[k]) !== JSON.stringify((after as Record<string, unknown>)[k]));
};

/** Recent changes: who changed what, and when (from the audit log). Hidden without audit access. */
export function ContentHistory({ entityType, entityId, refreshKey, fieldNames = {} }: { entityType: string; entityId?: string; refreshKey: number; fieldNames?: Record<string, string> }) {
  const l = useL();
  const t = useTranslations();
  const state = useApi<AuditRow[]>(`/admin/audit?entityType=${entityType}${entityId ? `&entityId=${encodeURIComponent(entityId)}` : ''}`);
  const { reload } = state;
  useEffect(() => {
    if (refreshKey) void reload();
  }, [refreshKey, reload]);
  if (state.error || !state.data) return null;
  const rows = state.data.slice(0, 10);
  const action = (code: string) => {
    const key = `admin.auditAction_${code.replaceAll('.', '_')}`;
    return t.has(key as never) ? t(key as never) : code;
  };
  return (
    <Section title={l('تاریخچهٔ تغییرات', 'Change history')}>
      {rows.length ? (
        <ul className="divide-y divide-line-soft text-sm">
          {rows.map((r) => {
            const fields = changedFields(r.before, r.after);
            return (
              <li key={r.id} className="py-2.5 leading-6">
                <span className="font-semibold">{r.actor}</span> · {action(r.action)} · <span className="text-steel"><DateTime iso={r.at} /></span>
                {fields.length ? <span className="block text-xs text-steel">{l('تغییر در: ', 'Changed: ')}{fields.map((f) => fieldNames[f] ?? f).join('، ')}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-steel">{l('هنوز تغییری ثبت نشده است.', 'No changes recorded yet.')}</p>}
    </Section>
  );
}

/** Shows an address in a left-to-right isolate inside Persian text. */
export function Address({ children }: { children: string }) {
  return <Ltr className="break-all">{children}</Ltr>;
}
