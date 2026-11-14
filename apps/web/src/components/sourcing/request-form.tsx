'use client';

import type { GuestSourcingResult, MeView, VehicleBrandView } from '@hedax/contracts';
import { normalizeIranMobile } from '@hedax/domain';
import { CheckCircle2, ImagePlus, Send, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { ErrorSummary, type SummaryError } from '@/components/ui/error-summary';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { randomId } from '@/lib/random-id';
import { errorText, isApiError } from '@/lib/api/errors';

interface Draft {
  clientRequestId: string;
  partName: string;
  vehicle: string;
  trim: string;
  year: string;
  partCode: string;
  vin: string;
  notes: string;
  fullName: string;
  mobile: string;
}

const DRAFT_KEY = 'hedax:request-draft-v2';
const MAX_PHOTOS = 3;
const newDraft = (): Draft => ({ clientRequestId: `req-${randomId()}`, partName: '', vehicle: '', trim: '', year: '', partCode: '', vin: '', notes: '', fullName: '', mobile: '' });
const toAscii = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/**
 * «درخواست تأمین قطعه» — no sign-in needed. Required: part, vehicle, mobile; everything else optional.
 * The request is filed under the account of that mobile number (created if new) and the answer goes to
 * the same number by Bale and SMS. A signed-in customer's own account is used and the number is not asked.
 * The draft survives reloads; a hidden trap field and server limits stop automated submissions.
 */
export function RequestForm({ brands }: { brands: VehicleBrandView[] }) {
  const t = useTranslations();
  const locale = useLocale() as 'fa' | 'en';
  const fa = locale === 'fa';
  const search = useSearchParams();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [me, setMe] = useState<MeView | null | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<GuestSourcingResult | null>(null);
  const trap = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (done) successRef.current?.focus(); }, [done]);

  useEffect(() => {
    let initial: Draft | null = null;
    try { const raw = localStorage.getItem(DRAFT_KEY); if (raw) initial = { ...newDraft(), ...(JSON.parse(raw) as Partial<Draft>) }; } catch { /* storage unavailable */ }
    // Arriving from a part («?part=&code=»), a vehicle («?vehicle=») or the vehicle finder («?vehicleBrand=&vehicleModel=&vehicleYear=»).
    const part = (search.get('part') ?? '').slice(0, 200);
    const brand = brands.find((b) => b.slug === search.get('vehicleBrand'));
    const vehicle = [search.get('vehicle') ?? '', brand ? (fa ? brand.name.fa : brand.name.en || brand.name.fa) : '', search.get('vehicleModel') ?? ''].filter(Boolean).join(' ').slice(0, 80);
    if (part || vehicle) {
      initial = { ...(initial ?? newDraft()), clientRequestId: `req-${randomId()}` };
      if (part) { initial.partName = part; initial.partCode = (search.get('code') ?? '').slice(0, 64); }
      if (vehicle) initial.vehicle = vehicle;
      const year = toAscii(search.get('vehicleYear') ?? '').replace(/\D/g, '').slice(0, 4);
      if (year) initial.year = year;
    }
    setDraft(initial ?? newDraft());
    api<MeView>('/me').then(setMe).catch(() => setMe(null));
  }, [search, brands, fa]);

  useEffect(() => {
    if (!draft) return;
    const timer = setTimeout(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* ignore */ } }, 400);
    return () => clearTimeout(timer);
  }, [draft]);

  const set = (key: keyof Draft, value: string) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const customer = me?.kind === 'CUSTOMER';

  const validate = (d: Draft): Record<string, string> => {
    const e: Record<string, string> = {};
    if (d.partName.trim().length < 2) e['req-part'] = t('request.errPart');
    if (d.vehicle.trim().length < 2) e['req-vehicle'] = t('request.errVehicle');
    if (!customer && !normalizeIranMobile(toAscii(d.mobile)).ok) e['req-mobile'] = t('request.errMobile');
    const year = toAscii(d.year).trim();
    if (year && !(/^\d{4}$/.test(year) && Number(year) >= 1300 && Number(year) <= 2100)) e['req-year'] = t('request.errYear');
    const vin = toAscii(d.vin).trim().toUpperCase();
    if (vin && !/^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin)) e['req-vin'] = t('request.errVin');
    return e;
  };

  const addPhotos = (list: FileList | null) => {
    if (!list) return;
    const images = [...list].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type) && f.size <= 10 * 1024 * 1024);
    if (images.length < list.length) setGeneralError(t('request.photoRule'));
    setPhotos((p) => [...p, ...images].slice(0, MAX_PHOTOS));
  };

  const submit = async () => {
    if (!draft) return;
    setGeneralError(null);
    const e = validate(draft);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSubmitting(true);
    try {
      const year = toAscii(draft.year).trim();
      const payload = {
        clientRequestId: draft.clientRequestId,
        partName: draft.partName.trim(),
        vehicle: draft.vehicle.trim(),
        trim: draft.trim.trim() || undefined,
        vehicleYear: year ? Number(year) : null,
        partCode: draft.partCode.trim() || undefined,
        vin: toAscii(draft.vin).trim().toUpperCase(),
        notes: draft.notes.trim() || undefined,
        fullName: draft.fullName.trim() || undefined,
        mobile: customer ? undefined : toAscii(draft.mobile).trim(),
        website: trap.current?.value ?? '',
      };
      const form = new FormData();
      form.set('payload', JSON.stringify(payload));
      for (const p of photos) form.append('files', p, p.name);
      const result = await api<GuestSourcingResult>('/sourcing-requests/guest', { method: 'POST', body: form });
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      setDone(result);
    } catch (err) {
      setGeneralError(isApiError(err) && err.code === 'RATE_LIMITED' ? t('request.tooMany') : isApiError(err) && err.code === 'MOBILE_NOT_ACCEPTED' ? t('request.mobileNotAccepted') : errorText(t, err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!draft) return null;

  if (done) {
    return (
      <div ref={successRef} tabIndex={-1} className="su-request-done" role="status">
        <CheckCircle2 aria-hidden size={40} />
        <h2>{t('request.success', { reference: done.reference })}</h2>
        <p>{t('request.replyChannels')}</p>
        <div className="su-actions">
          {customer ? <Link href="/account/requests" className="su-btn su-btn-primary">{t('request.viewRequest')}</Link>
            : <Link href={`/login?next=${encodeURIComponent(`/${locale}/account/requests`)}`} className="su-btn su-btn-primary">{t('request.followUp')}</Link>}
          <Link href="/parts" className="su-btn su-btn-outline">{t('nav.parts')}</Link>
        </div>
      </div>
    );
  }

  const summary: SummaryError[] = Object.entries(errors).map(([fieldId, message]) => ({ fieldId, message }));
  const optional = t('common.optional');
  return (
    <form noValidate onSubmit={(ev) => { ev.preventDefault(); void submit(); }} className="su-request-form">
      <ErrorSummary title={t('validation.summaryTitle')} errors={summary} generalError={generalError} />
      <div className="su-form-grid">
        <Field id="req-part" label={t('request.partName')} error={errors['req-part']} required className="su-span-2">
          <Input id="req-part" value={draft.partName} maxLength={200} invalid={!!errors['req-part']} autoComplete="off" onChange={(e) => set('partName', e.target.value)} />
        </Field>
        <Field id="req-vehicle" label={t('request.vehicle')} hint={t('request.vehicleHint')} error={errors['req-vehicle']} required>
          <Input id="req-vehicle" value={draft.vehicle} maxLength={80} invalid={!!errors['req-vehicle']} aria-describedby="req-vehicle-hint" onChange={(e) => set('vehicle', e.target.value)} />
        </Field>
        <Field id="req-trim" label={t('request.trim')} optionalLabel={optional}>
          <Input id="req-trim" value={draft.trim} maxLength={80} onChange={(e) => set('trim', e.target.value)} />
        </Field>
        <Field id="req-year" label={t('request.vehicleYear')} optionalLabel={optional} error={errors['req-year']}>
          <Input id="req-year" inputMode="numeric" value={draft.year} maxLength={4} invalid={!!errors['req-year']} onChange={(e) => set('year', e.target.value)} />
        </Field>
        <Field id="req-code" label={t('request.partCode')} optionalLabel={optional}>
          <Input id="req-code" dir="ltr" value={draft.partCode} maxLength={64} onChange={(e) => set('partCode', e.target.value)} />
        </Field>
        <Field id="req-vin" label={t('request.vin')} hint={t('request.vinHint')} optionalLabel={optional} error={errors['req-vin']} className="su-span-2">
          <Input id="req-vin" dir="ltr" value={draft.vin} maxLength={17} invalid={!!errors['req-vin']} aria-describedby="req-vin-hint" onChange={(e) => set('vin', e.target.value)} />
        </Field>
        <div className="su-span-2 su-photos">
          <span className="su-field-label">{t('request.photos')} <span className="su-muted">({optional})</span></span>
          <ul className="su-photo-list">
            {photos.map((p, i) => (
              <li key={`${p.name}-${i}`}><span dir="auto">{p.name}</span>
                <button type="button" className="su-icon-btn" aria-label={`${t('common.remove')}: ${p.name}`} onClick={() => setPhotos((list) => list.filter((_, j) => j !== i))}><X aria-hidden size={16} /></button>
              </li>
            ))}
          </ul>
          {photos.length < MAX_PHOTOS ? <label className="su-btn su-btn-outline su-photo-pick">
            <ImagePlus aria-hidden size={18} />{t('request.addPhoto')}
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
          </label> : null}
          <p className="su-muted">{t('request.photoRule')}</p>
        </div>
        <Field id="req-notes" label={t('request.notes')} optionalLabel={optional} className="su-span-2">
          <Textarea id="req-notes" rows={3} value={draft.notes} maxLength={1000} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <Field id="req-name" label={t('request.fullName')} optionalLabel={optional}>
          <Input id="req-name" value={draft.fullName} maxLength={80} autoComplete="name" onChange={(e) => set('fullName', e.target.value)} />
        </Field>
        {customer ? (
          <p className="su-signed-in">{t('request.signedInAs', { mobile: me?.mobileMasked ?? '' })}</p>
        ) : (
          <Field id="req-mobile" label={t('request.mobile')} error={errors['req-mobile']} required>
            <Input id="req-mobile" dir="ltr" inputMode="tel" autoComplete="tel" placeholder="09xx xxx xxxx" value={draft.mobile} maxLength={20} invalid={!!errors['req-mobile']} onChange={(e) => set('mobile', e.target.value)} />
          </Field>
        )}
        {/* Trap for scripts: hidden from people and assistive technology, never filled by a person. */}
        <div className="su-trap" aria-hidden>
          <label htmlFor="req-website">Website</label>
          <input ref={trap} id="req-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </div>
      </div>
      <div className="su-request-submit">
        <button type="submit" className="su-btn su-btn-primary su-btn-lg" disabled={submitting} aria-busy={submitting || undefined}>
          <Send aria-hidden size={18} />{submitting ? t('request.submitting') : t('request.submit')}
        </button>
        <p>{t('request.replyNote')}</p>
      </div>
    </form>
  );
}
