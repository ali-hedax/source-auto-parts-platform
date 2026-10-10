'use client';

import type { MeView, SourcingRequestView, VehicleBrandView } from '@hedax/contracts';
import { CheckCircle2, ChevronDown, Info, Package, Plus, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { ErrorSummary, type SummaryError } from '@/components/ui/error-summary';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Alert } from '@/components/ui/misc';
import { FileUploader } from '@/components/files/file-uploader';
import { api } from '@/lib/api/client';
import { errorText, isApiError } from '@/lib/api/errors';

interface ItemDraft {
  partName: string;
  quantity: string;
  brand: string; // vehicle brand id | '__other' | ''
  brandText: string;
  vehicleModel: string;
  vehicleYear: string;
  partCode: string;
  vin: string;
  preference: 'ANY' | 'GENUINE' | 'AFTERMARKET' | 'STOCK';
  notes: string;
}

interface Draft {
  clientRequestId: string;
  title: string;
  items: ItemDraft[];
  note: string;
  urgency: 'NORMAL' | 'URGENT';
  province: string;
  city: string;
}

const DRAFT_KEY = 'hedax:request-draft';
const emptyItem = (partName = ''): ItemDraft => ({ partName, quantity: '1', brand: '', brandText: '', vehicleModel: '', vehicleYear: '', partCode: '', vin: '', preference: 'ANY', notes: '' });
const newDraft = (): Draft => ({ clientRequestId: `draft-${crypto.randomUUID()}`, title: '', items: [emptyItem()], note: '', urgency: 'NORMAL', province: '', city: '' });
const toAscii = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/**
 * Multi-item sourcing request for any brand (A03). Brand = managed list OR free
 * text; VIN/part code are optional. The draft survives reloads, language
 * switches and a sign-in detour (spec §15).
 */
export function RequestForm({ brands }: { brands: VehicleBrandView[] }) {
  const t = useTranslations();
  const locale = useLocale() as 'fa' | 'en';
  const search = useSearchParams();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [filesBusy, setFilesBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [me, setMe] = useState<MeView | null | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<SourcingRequestView | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The success panel replaces the long form: move focus (and the view, on phones) to it.
  const successRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (done) successRef.current?.focus();
  }, [done]);

  useEffect(() => {
    let initial: Draft | null = null;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) initial = JSON.parse(raw) as Draft;
    } catch {
      /* storage unavailable */
    }
    const part = search.get('part');
    if (!initial || (part && !initial.items.some((i) => i.partName === part))) {
      initial = newDraft();
      if (part) {
        initial.title = part.slice(0, 200);
        initial.items = [emptyItem(part.slice(0, 200))];
      }
    }
    setDraft(initial);
    api<MeView>('/me').then(setMe).catch(() => setMe(null));
  }, [search]);

  useEffect(() => {
    if (!draft) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        setSavedNote(true);
      } catch {
        /* ignore */
      }
    }, 500);
  }, [draft]);

  const onFiles = useCallback((ids: string[], busy: boolean) => {
    setFiles(ids);
    setFilesBusy(busy);
  }, []);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const setItem = (index: number, patch: Partial<ItemDraft>) =>
    setDraft((d) => (d ? { ...d, items: d.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) } : d));

  const brandName = useMemo(() => (b: VehicleBrandView) => (locale === 'en' ? (b.name.en ?? b.name.fa) : b.name.fa), [locale]);

  const validate = (d: Draft): Record<string, string> => {
    const e: Record<string, string> = {};
    if (d.title.trim().length < 3) e['req-title'] = `${t('request.requestTitle')}: ${t('validation.tooShort')}`;
    const filled = d.items.filter((i) => i.partName.trim());
    if (filled.length === 0 && files.length === 0) e['item-0-name'] = t('validation.itemsOrFiles');
    d.items.forEach((it, i) => {
      if (!it.partName.trim()) return;
      const n = Number(toAscii(it.quantity));
      if (!Number.isInteger(n) || n < 1) e[`item-${i}-qty`] = `${t('request.item', { n: i + 1 })} — ${t('request.quantity')}: ${t('validation.invalidNumber')}`;
      if (!it.brand || (it.brand === '__other' && !it.brandText.trim())) e[`item-${i}-brand`] = `${t('request.item', { n: i + 1 })} — ${t('validation.brandRequired')}`;
      if (it.vehicleYear && !/^\d{4}$/.test(toAscii(it.vehicleYear))) e[`item-${i}-year`] = `${t('request.item', { n: i + 1 })} — ${t('request.vehicleYear')}: ${t('validation.invalidNumber')}`;
    });
    return e;
  };

  const submit = async () => {
    if (!draft) return;
    setGeneralError(null);
    const e = validate(draft);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSubmitting(true);
    try {
      const view = await api<SourcingRequestView>('/sourcing-requests', {
        method: 'POST',
        body: {
          title: draft.title.trim(),
          clientRequestId: draft.clientRequestId,
          note: draft.note || undefined,
          urgency: draft.urgency,
          deliveryProvince: draft.province || undefined,
          deliveryCity: draft.city || undefined,
          attachmentIds: files,
          items: draft.items
            .filter((i) => i.partName.trim())
            .map((i) => ({
              partName: i.partName.trim(),
              quantity: Number(toAscii(i.quantity)),
              vehicleBrandCode: i.brand && i.brand !== '__other' ? i.brand : null,
              vehicleBrandText: i.brand === '__other' ? i.brandText.trim() : undefined,
              vehicleModel: i.vehicleModel || undefined,
              vehicleYear: i.vehicleYear ? Number(toAscii(i.vehicleYear)) : null,
              partCode: i.partCode || undefined,
              vin: i.vin ? toAscii(i.vin).toUpperCase() : '',
              preference: i.preference,
              notes: i.notes || undefined,
            })),
        },
      });
      localStorage.removeItem(DRAFT_KEY);
      setDone(view);
    } catch (err) {
      if (isApiError(err) && err.fields.length) {
        setGeneralError(t('errors.VALIDATION_FAILED'));
      } else {
        setGeneralError(errorText(t, err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!draft) return null;

  if (done) {
    return (
      <div ref={successRef} tabIndex={-1} className="card flex flex-col items-start gap-4 border-success/40 p-6 focus:outline-none sm:p-8" role="status">
        <span className="grid size-12 place-items-center rounded-full bg-success-soft text-success"><CheckCircle2 aria-hidden className="size-7" /></span>
        <h2 className="text-xl font-bold">{t('request.success', { reference: done.reference })}</h2>
        <p className="max-w-prose leading-7 text-steel">{t('request.successHint')}</p>
        <ButtonLink href={`/account/requests/${done.id}`}>{t('request.viewRequest')}</ButtonLink>
      </div>
    );
  }

  const summary: SummaryError[] = Object.entries(errors).map(([fieldId, message]) => ({ fieldId, message }));
  const loginHref = `/${locale}/login?next=${encodeURIComponent(`/${locale}/request-part`)}`;

  return (
    <form noValidate onSubmit={(ev) => { ev.preventDefault(); void submit(); }} className="flex flex-col gap-6">
      <ErrorSummary title={t('validation.summaryTitle')} errors={summary} generalError={generalError} />
      {me === null ? (
        <Alert tone="info" title={t('request.loginRequired')}>
          <a href={loginHref} className="font-semibold text-action underline underline-offset-4 hover:text-action-hover">{t('nav.login')}</a>
        </Alert>
      ) : null}

      <div className="card flex flex-col gap-4 p-5 sm:p-6">
        <Field id="req-title" label={t('request.requestTitle')} hint={t('request.requestTitleHint')} error={errors['req-title']} required>
          <Input id="req-title" value={draft.title} maxLength={200} invalid={!!errors['req-title']} aria-describedby="req-title-hint" onChange={(e) => set('title', e.target.value)} />
        </Field>
        <p className="flex gap-2 border-t border-line-soft pt-3 text-sm leading-6 text-steel"><Info aria-hidden className="mt-0.5 size-4 shrink-0" />{t('request.filesOnly')}</p>
      </div>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 text-lg font-bold">{t('request.items')}</legend>
        {draft.items.map((it, i) => (
          <div key={i} className="card flex flex-col gap-4 p-5 sm:p-6">
            <div className="-mt-1 flex min-h-11 items-center justify-between gap-3 border-b border-line-soft pb-3">
              <h3 className="flex items-center gap-2 font-bold"><Package aria-hidden className="size-4 text-steel" />{t('request.item', { n: i + 1 })}</h3>
              {draft.items.length > 1 ? (
                <Button variant="ghost" size="sm" onClick={() => set('items', draft.items.filter((_, j) => j !== i))} icon={<Trash2 aria-hidden className="size-4" />}>
                  {t('request.removeItem', { n: i + 1 })}
                </Button>
              ) : null}
            </div>
            <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
              <Field id={`item-${i}-name`} label={t('request.partName')} error={i === 0 ? errors['item-0-name'] : undefined}>
                <Input id={`item-${i}-name`} value={it.partName} maxLength={200} onChange={(e) => setItem(i, { partName: e.target.value })} />
              </Field>
              <Field id={`item-${i}-qty`} label={t('request.quantity')} error={errors[`item-${i}-qty`]}>
                <Input id={`item-${i}-qty`} inputMode="numeric" value={it.quantity} invalid={!!errors[`item-${i}-qty`]} onChange={(e) => setItem(i, { quantity: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field id={`item-${i}-brand`} label={t('request.vehicleBrand')} error={errors[`item-${i}-brand`]}>
                <Select id={`item-${i}-brand`} value={it.brand} invalid={!!errors[`item-${i}-brand`]} onChange={(e) => setItem(i, { brand: e.target.value })}>
                  <option value="">{t('request.chooseBrand')}</option>
                  {brands.map((b) => <option key={b.code} value={b.code}>{brandName(b)}</option>)}
                  <option value="__other">{t('request.otherBrand')}</option>
                </Select>
              </Field>
              {it.brand === '__other' ? (
                <Field id={`item-${i}-brandtext`} label={t('request.brandText')}>
                  <Input id={`item-${i}-brandtext`} value={it.brandText} maxLength={80} onChange={(e) => setItem(i, { brandText: e.target.value })} />
                </Field>
              ) : null}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Field id={`item-${i}-model`} label={t('request.vehicleModel')} optionalLabel={t('common.optional')}>
                <Input id={`item-${i}-model`} value={it.vehicleModel} maxLength={80} onChange={(e) => setItem(i, { vehicleModel: e.target.value })} />
              </Field>
              <Field id={`item-${i}-year`} label={t('request.vehicleYear')} optionalLabel={t('common.optional')} error={errors[`item-${i}-year`]}>
                <Input id={`item-${i}-year`} inputMode="numeric" value={it.vehicleYear} onChange={(e) => setItem(i, { vehicleYear: e.target.value })} />
              </Field>
              <Field id={`item-${i}-pref`} label={t('request.preference')}>
                <Select id={`item-${i}-pref`} value={it.preference} onChange={(e) => setItem(i, { preference: e.target.value as ItemDraft['preference'] })}>
                  {(['ANY', 'GENUINE', 'AFTERMARKET', 'STOCK'] as const).map((p) => <option key={p} value={p}>{t(`request.pref_${p}`)}</option>)}
                </Select>
              </Field>
            </div>
            <details className="group rounded-[var(--radius-control)] border border-dashed border-line px-3">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-action [&::-webkit-details-marker]:hidden"><ChevronDown aria-hidden className="size-4 transition-transform duration-200 group-open:rotate-180" />{t('request.partCode')} / {t('request.vin')} ({t('common.optional')})</summary>
              <div className="grid gap-4 pb-4 pt-1 md:grid-cols-2">
                <Field id={`item-${i}-code`} label={t('request.partCode')} optionalLabel={t('common.optional')}>
                  <Input id={`item-${i}-code`} dir="ltr" value={it.partCode} maxLength={64} onChange={(e) => setItem(i, { partCode: e.target.value })} />
                </Field>
                <Field id={`item-${i}-vin`} label={t('request.vin')} hint={t('request.vinHint')} optionalLabel={t('common.optional')}>
                  <Input id={`item-${i}-vin`} dir="ltr" value={it.vin} maxLength={17} aria-describedby={`item-${i}-vin-hint`} onChange={(e) => setItem(i, { vin: e.target.value })} />
                </Field>
              </div>
            </details>
            <Field id={`item-${i}-notes`} label={t('request.notes')} optionalLabel={t('common.optional')}>
              <Textarea id={`item-${i}-notes`} rows={2} value={it.notes} maxLength={1000} onChange={(e) => setItem(i, { notes: e.target.value })} />
            </Field>
          </div>
        ))}
        <div>
          <Button variant="secondary" onClick={() => set('items', [...draft.items, emptyItem()])} disabled={draft.items.length >= 100} icon={<Plus aria-hidden className="size-4" />}>
            {t('request.addItem')}
          </Button>
        </div>
      </fieldset>

      <div className="card flex flex-col gap-4 p-5 sm:p-6">
        <FileUploader purpose="SOURCING_REQUEST" onChange={onFiles} id="req-files" label={t('request.files')} disabled={me === null} />
        <Field id="req-note" label={t('request.overallNote')} optionalLabel={t('common.optional')}>
          <Textarea id="req-note" value={draft.note} maxLength={3000} onChange={(e) => set('note', e.target.value)} />
        </Field>
        <div className="grid gap-4 md:grid-cols-3">
          <Field id="req-urgency" label={t('request.urgency')}>
            <Select id="req-urgency" value={draft.urgency} onChange={(e) => set('urgency', e.target.value as Draft['urgency'])}>
              <option value="NORMAL">{t('request.urgency_NORMAL')}</option>
              <option value="URGENT">{t('request.urgency_URGENT')}</option>
            </Select>
          </Field>
          <Field id="req-province" label={t('request.province')} optionalLabel={t('common.optional')}>
            <Input id="req-province" value={draft.province} maxLength={80} onChange={(e) => set('province', e.target.value)} />
          </Field>
          <Field id="req-city" label={t('request.city')} optionalLabel={t('common.optional')}>
            <Input id="req-city" value={draft.city} maxLength={80} onChange={(e) => set('city', e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-steel">{t('request.delivery')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-line pt-6">
        <Button type="submit" size="lg" className="min-w-48" loading={submitting} disabled={filesBusy || me === null}>
          {submitting ? t('request.submitting') : t('request.submit')}
        </Button>
        {savedNote ? <span className="text-sm text-steel" role="status">{t('request.draftSaved')}</span> : null}
      </div>
    </form>
  );
}
