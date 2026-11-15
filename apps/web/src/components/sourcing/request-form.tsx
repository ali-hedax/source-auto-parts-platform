'use client';

import type { GuestSourcingResult, MeView, SourcingRequestView, VehicleBrandView } from '@hedax/contracts';
import { normalizeIranMobile } from '@hedax/domain';
import { CheckCircle2, ChevronDown, Info, Package, Phone, Plus, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { ErrorSummary, type SummaryError } from '@/components/ui/error-summary';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Alert } from '@/components/ui/misc';
import { FileUploader } from '@/components/files/file-uploader';
import { api } from '@/lib/api/client';
import { randomId } from '@/lib/random-id';
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
  /** Without signing in: how the expert reaches the sender. */
  mobile?: string;
  fullName?: string;
}

const DRAFT_KEY = 'hedax:request-draft';
const emptyItem = (partName = ''): ItemDraft => ({ partName, quantity: '1', brand: '', brandText: '', vehicleModel: '', vehicleYear: '', partCode: '', vin: '', preference: 'ANY', notes: '' });
const newDraft = (): Draft => ({ clientRequestId: `draft-${randomId()}`, title: '', items: [emptyItem()], note: '', urgency: 'NORMAL', province: '', city: '', mobile: '', fullName: '' });
const GUEST_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const GUEST_PHOTO_MAX = 3;
const toAscii = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/**
 * The stored model year is Gregorian (1950–2100). A Persian year (۱۳۰۰–۱۴۹۹) is kept with the model text
 * («۲۰۶ تیپ ۵، سال ۱۳۹۸») so the request is accepted instead of failing on the year.
 */
function vehicleOf(it: ItemDraft): { vehicleModel: string | undefined; vehicleYear: number | null } {
  const year = it.vehicleYear ? Number(toAscii(it.vehicleYear)) : null;
  if (year && year < 1950) return { vehicleModel: [it.vehicleModel.trim(), `سال ${it.vehicleYear.trim()}`].filter(Boolean).join('، ').slice(0, 80), vehicleYear: null };
  return { vehicleModel: it.vehicleModel || undefined, vehicleYear: year };
}

/**
 * Multi-item sourcing request for any brand (A03). Brand = managed list OR free
 * text; VIN/part code are optional. The draft survives reloads, language
 * switches and a sign-in detour (spec §15). Without signing in (owner, 2026-11-15)
 * the same form is sent with a mobile number: part name, vehicle and mobile are
 * the only required fields; photos go with the request itself.
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
  const [guestDone, setGuestDone] = useState<string | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [savedNote, setSavedNote] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The success panel replaces the long form: move focus (and the view, on phones) to it.
  const successRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (done || guestDone) successRef.current?.focus();
  }, [done, guestDone]);

  useEffect(() => {
    let initial: Draft | null = null;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) initial = JSON.parse(raw) as Draft;
    } catch {
      /* storage unavailable */
    }
    const part = search.get('part');
    // From the vehicle finder (no parts for the chosen vehicle): group, vehicle/model text and year.
    const vehicleModel = (search.get('vehicleModel') ?? '').slice(0, 80);
    const fromVehicle = !part && (search.has('vehicleBrand') || vehicleModel !== '');
    if (!initial || (part && !initial.items.some((i) => i.partName === part)) || (fromVehicle && !initial.items.some((i) => i.vehicleModel === vehicleModel))) {
      initial = newDraft();
      if (part) {
        initial.title = part.slice(0, 200);
        // «درخواست تأمین» on a catalog part also brings its technical number (?code=).
        initial.items = [{ ...emptyItem(part.slice(0, 200)), partCode: (search.get('code') ?? '').slice(0, 80) }];
      } else if (fromVehicle) {
        const brand = brands.find((b) => b.slug === search.get('vehicleBrand'))?.code ?? '';
        initial.items = [{ ...emptyItem(), brand, vehicleModel, vehicleYear: toAscii(search.get('vehicleYear') ?? '').replace(/\D/g, '').slice(0, 4) }];
      }
    }
    setDraft(initial);
    api<MeView>('/me').then(setMe).catch(() => setMe(null));
  }, [search, brands]);

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

  const guest = me === null;
  const validate = (d: Draft): Record<string, string> => {
    const e: Record<string, string> = {};
    // The title is optional: an empty one is made from the first part and vehicle.
    if (d.title.trim() && d.title.trim().length < 3) e['req-title'] = `${t('request.requestTitle')}: ${t('validation.tooShort')}`;
    const filled = d.items.filter((i) => i.partName.trim());
    if (guest && filled.length === 0) e['item-0-name'] = t('validation.partRequired');
    else if (filled.length === 0 && files.length === 0) e['item-0-name'] = t('validation.itemsOrFiles');
    if (guest && !normalizeIranMobile(d.mobile ?? '').ok) e['req-mobile'] = t('validation.mobileRequired');
    if (guest && photos.length > GUEST_PHOTO_MAX) e['req-photos'] = t('validation.tooManyPhotos');
    d.items.forEach((it, i) => {
      if (!it.partName.trim()) return;
      const n = Number(toAscii(it.quantity));
      if (!Number.isInteger(n) || n < 1) e[`item-${i}-qty`] = `${t('request.item', { n: i + 1 })} — ${t('request.quantity')}: ${t('validation.invalidNumber')}`;
      if (!it.brand || (it.brand === '__other' && !it.brandText.trim())) e[`item-${i}-brand`] = `${t('request.item', { n: i + 1 })} — ${t('validation.brandRequired')}`;
      const year = Number(toAscii(it.vehicleYear));
      if (it.vehicleYear && (!/^\d{4}$/.test(toAscii(it.vehicleYear)) || !((year >= 1300 && year <= 1499) || (year >= 1950 && year <= 2100)))) e[`item-${i}-year`] = `${t('request.item', { n: i + 1 })} — ${t('request.vehicleYear')}: ${t('validation.invalidNumber')}`;
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
    const first = draft.items.find((i) => i.partName.trim());
    const firstBrand = first ? brands.find((b) => b.code === first.brand) : undefined;
    const firstVehicle = first ? (vehicleOf(first).vehicleModel || (first.brand === '__other' ? first.brandText.trim() : firstBrand ? brandName(firstBrand) : '')) : '';
    const title = draft.title.trim() || [first?.partName.trim() ?? '', firstVehicle].filter(Boolean).join(' — ').slice(0, 200);
    const items = draft.items
      .filter((i) => i.partName.trim())
      .map((i) => ({
        partName: i.partName.trim(),
        quantity: Number(toAscii(i.quantity)),
        vehicleBrandCode: i.brand && i.brand !== '__other' ? i.brand : null,
        vehicleBrandText: i.brand === '__other' ? i.brandText.trim() : undefined,
        ...vehicleOf(i),
        partCode: i.partCode || undefined,
        vin: i.vin ? toAscii(i.vin).toUpperCase() : '',
        preference: i.preference,
        notes: i.notes || undefined,
      }));
    try {
      if (guest) {
        const form = new FormData();
        form.set('payload', JSON.stringify({
          clientRequestId: draft.clientRequestId,
          title: draft.title.trim() || undefined,
          items,
          note: draft.note || undefined,
          urgency: draft.urgency,
          deliveryProvince: draft.province || undefined,
          deliveryCity: draft.city || undefined,
          mobile: toAscii(draft.mobile ?? ''),
          fullName: draft.fullName?.trim() || undefined,
          website: (document.getElementById('req-website') as HTMLInputElement | null)?.value || undefined,
        }));
        for (const p of photos) form.append('files', p, p.name);
        const result = await api<GuestSourcingResult>('/sourcing-requests/guest', { method: 'POST', body: form });
        localStorage.removeItem(DRAFT_KEY);
        setGuestDone(result.reference);
        return;
      }
      const view = await api<SourcingRequestView>('/sourcing-requests', {
        method: 'POST',
        body: {
          title,
          clientRequestId: draft.clientRequestId,
          note: draft.note || undefined,
          urgency: draft.urgency,
          deliveryProvince: draft.province || undefined,
          deliveryCity: draft.city || undefined,
          attachmentIds: files,
          items,
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

  if (guestDone) {
    return (
      <div ref={successRef} tabIndex={-1} className="card flex flex-col items-start gap-4 border-success/40 p-6 focus:outline-none sm:p-8" role="status">
        <span className="grid size-12 place-items-center rounded-full bg-success-soft text-success"><CheckCircle2 aria-hidden className="size-7" /></span>
        <h2 className="text-xl font-bold">{t('request.success', { reference: guestDone })}</h2>
        <p className="max-w-prose leading-7 text-steel">{t('request.guestSuccessHint')}</p>
        <ButtonLink href={`/login?next=${encodeURIComponent(`/${locale}/account/requests`)}`} variant="secondary">{t('nav.login')}</ButtonLink>
      </div>
    );
  }

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
      {guest ? (
        <Alert tone="info" title={t('request.guestNote')}>
          <a href={loginHref} className="font-semibold text-action underline underline-offset-4 hover:text-action-hover">{t('nav.login')}</a>
        </Alert>
      ) : null}

      <div className="card flex flex-col gap-4 p-5 sm:p-6">
        <Field id="req-title" label={t('request.requestTitle')} hint={t('request.requestTitleHint')} error={errors['req-title']} optionalLabel={t('common.optional')}>
          <Input id="req-title" value={draft.title} maxLength={200} invalid={!!errors['req-title']} aria-describedby="req-title-hint" onChange={(e) => set('title', e.target.value)} />
        </Field>
        {guest ? null : <p className="flex gap-2 border-t border-line-soft pt-3 text-sm leading-6 text-steel"><Info aria-hidden className="mt-0.5 size-4 shrink-0" />{t('request.filesOnly')}</p>}
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
              <Field id={`item-${i}-name`} label={t('request.partName')} error={i === 0 ? errors['item-0-name'] : undefined} required={i === 0}>
                <Input id={`item-${i}-name`} value={it.partName} maxLength={200} onChange={(e) => setItem(i, { partName: e.target.value })} />
              </Field>
              <Field id={`item-${i}-qty`} label={t('request.quantity')} error={errors[`item-${i}-qty`]}>
                <Input id={`item-${i}-qty`} inputMode="numeric" value={it.quantity} invalid={!!errors[`item-${i}-qty`]} onChange={(e) => setItem(i, { quantity: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field id={`item-${i}-brand`} label={t('request.vehicleBrand')} error={errors[`item-${i}-brand`]} required>
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
              <Field id={`item-${i}-year`} label={t('request.vehicleYear')} hint={t('request.yearHint')} optionalLabel={t('common.optional')} error={errors[`item-${i}-year`]}>
                <Input id={`item-${i}-year`} aria-describedby={`item-${i}-year-hint`} inputMode="numeric" value={it.vehicleYear} onChange={(e) => setItem(i, { vehicleYear: e.target.value })} />
              </Field>
              <Field id={`item-${i}-pref`} label={t('request.preference')}>
                <Select id={`item-${i}-pref`} value={it.preference} onChange={(e) => setItem(i, { preference: e.target.value as ItemDraft['preference'] })}>
                  {(['ANY', 'GENUINE', 'AFTERMARKET', 'STOCK'] as const).map((p) => <option key={p} value={p}>{t(`request.pref_${p}`)}</option>)}
                </Select>
              </Field>
            </div>
            {/* Shown open when it already holds a value (e.g. the technical number brought from the catalog). */}
            <details className="group rounded-[var(--radius-control)] border border-dashed border-line px-3" {...(it.partCode || it.vin ? { open: true } : {})}>
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
        {guest ? (
          <Field id="req-photos" label={t('request.guestPhotos')} hint={t('request.guestPhotosHint')} optionalLabel={t('common.optional')} error={errors['req-photos']}>
            <input id="req-photos" type="file" multiple accept={GUEST_PHOTO_TYPES.join(',')} aria-describedby="req-photos-hint" className="block min-h-11 w-full cursor-pointer text-sm file:me-3 file:min-h-11 file:cursor-pointer file:rounded-[var(--radius-control)] file:border file:border-line-strong file:bg-white file:px-4 file:font-semibold" onChange={(e) => setPhotos([...(e.target.files ?? [])].filter((p) => GUEST_PHOTO_TYPES.includes(p.type) && p.size <= 10 * 1024 * 1024))} />
          </Field>
        ) : <FileUploader purpose="SOURCING_REQUEST" onChange={onFiles} id="req-files" label={t('request.files')} disabled={me === undefined} />}
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

      {guest ? (
        <div className="card relative flex flex-col gap-4 p-5 sm:p-6">
          <h3 className="flex items-center gap-2 font-bold"><Phone aria-hidden className="size-4 text-steel" />{t('request.contact')}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="req-mobile" label={t('request.mobile')} hint={t('request.mobileHint')} error={errors['req-mobile']} required>
              <Input id="req-mobile" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" value={draft.mobile ?? ''} maxLength={20} invalid={!!errors['req-mobile']} aria-describedby="req-mobile-hint" onChange={(e) => set('mobile', e.target.value)} />
            </Field>
            <Field id="req-name" label={t('request.fullName')} optionalLabel={t('common.optional')}>
              <Input id="req-name" autoComplete="name" value={draft.fullName ?? ''} maxLength={80} onChange={(e) => set('fullName', e.target.value)} />
            </Field>
          </div>
          {/* People never see or fill this; scripts that fill every field are refused. */}
          <div aria-hidden="true" className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0" style={{ insetInlineStart: '-9999px' }}>
            <label htmlFor="req-website">Website</label>
            <input id="req-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-4 border-t border-line pt-6">
        <Button type="submit" size="lg" className="min-w-48" loading={submitting} disabled={filesBusy || me === undefined}>
          {submitting ? t('request.submitting') : t('request.submit')}
        </Button>
        {savedNote ? <span className="text-sm text-steel" role="status">{t('request.draftSaved')}</span> : null}
      </div>
    </form>
  );
}
