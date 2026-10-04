'use client';

import { normalizeIranMobile, toAsciiDigits } from '@hedax/domain';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorSummary } from '@/components/ui/error-summary';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/field';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';

export interface AddressRow {
  id: string;
  label: string | null;
  recipientName: string;
  recipientMobile: string;
  province: string;
  city: string;
  addressLine: string;
  postalCode: string;
  isDefault: boolean;
}

const EMPTY = { label: '', recipientName: '', recipientMobile: '', province: '', city: '', addressLine: '', postalCode: '', isDefault: false };

export function AddressForm({ onSaved, onCancel, initial }: { onSaved: (row: AddressRow) => void; onCancel?: () => void; initial?: AddressRow }) {
  const t = useTranslations();
  const [v, setV] = useState(initial ? { ...EMPTY, ...initial, label: initial.label ?? '' } : EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof EMPTY, value: string | boolean) => setV((p) => ({ ...p, [k]: value }));

  const submit = async () => {
    const e: Record<string, string> = {};
    if (v.recipientName.trim().length < 2) e['addr-name'] = `${t('account.recipient')}: ${t('validation.required')}`;
    if (!normalizeIranMobile(v.recipientMobile).ok) e['addr-mobile'] = t('validation.invalidMobile');
    if (v.province.trim().length < 2) e['addr-province'] = `${t('request.province')}: ${t('validation.required')}`;
    if (v.city.trim().length < 2) e['addr-city'] = `${t('request.city')}: ${t('validation.required')}`;
    if (v.addressLine.trim().length < 5) e['addr-line'] = `${t('account.addressLine')}: ${t('validation.tooShort')}`;
    if (!/^\d{10}$/.test(toAsciiDigits(v.postalCode.trim()))) e['addr-postal'] = t('validation.invalidPostalCode');
    setErrors(e);
    setGeneral(null);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const body = { ...v, label: v.label || undefined, postalCode: toAsciiDigits(v.postalCode.trim()) };
      const res = await api<{ id: string }>(initial ? `/account/addresses/${initial.id}` : '/account/addresses', { method: initial ? 'PUT' : 'POST', body });
      onSaved({ ...(body as AddressRow), id: res.id, label: v.label || null });
    } catch (err) {
      setGeneral(errorText(t, err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex flex-col gap-4">
      <ErrorSummary title={t('validation.summaryTitle')} errors={Object.entries(errors).map(([fieldId, message]) => ({ fieldId, message }))} generalError={general} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field id="addr-name" label={t('account.recipient')} error={errors['addr-name']} required>
          <Input id="addr-name" autoComplete="name" value={v.recipientName} onChange={(e) => set('recipientName', e.target.value)} invalid={!!errors['addr-name']} />
        </Field>
        <Field id="addr-mobile" label={t('account.recipientMobile')} hint={t('auth.mobileHint')} error={errors['addr-mobile']} required>
          <Input id="addr-mobile" dir="ltr" inputMode="tel" autoComplete="tel" value={v.recipientMobile} onChange={(e) => set('recipientMobile', e.target.value)} invalid={!!errors['addr-mobile']} />
        </Field>
        <Field id="addr-province" label={t('request.province')} error={errors['addr-province']} required>
          <Input id="addr-province" autoComplete="address-level1" value={v.province} onChange={(e) => set('province', e.target.value)} invalid={!!errors['addr-province']} />
        </Field>
        <Field id="addr-city" label={t('request.city')} error={errors['addr-city']} required>
          <Input id="addr-city" autoComplete="address-level2" value={v.city} onChange={(e) => set('city', e.target.value)} invalid={!!errors['addr-city']} />
        </Field>
      </div>
      <Field id="addr-line" label={t('account.addressLine')} error={errors['addr-line']} required>
        <Textarea id="addr-line" rows={2} autoComplete="street-address" value={v.addressLine} onChange={(e) => set('addressLine', e.target.value)} invalid={!!errors['addr-line']} />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field id="addr-postal" label={t('account.postalCode')} error={errors['addr-postal']} required>
          <Input id="addr-postal" dir="ltr" inputMode="numeric" autoComplete="postal-code" value={v.postalCode} onChange={(e) => set('postalCode', e.target.value)} invalid={!!errors['addr-postal']} />
        </Field>
        <Field id="addr-label" label={t('account.label')} optionalLabel={t('common.optional')}>
          <Input id="addr-label" value={v.label} onChange={(e) => set('label', e.target.value)} />
        </Field>
      </div>
      <Checkbox id="addr-default" label={t('account.makeDefault')} checked={v.isDefault} onChange={(e) => set('isDefault', e.target.checked)} />
      <div className="flex gap-2">
        <Button type="submit" loading={saving}>{t('common.save')}</Button>
        {onCancel ? <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button> : null}
      </div>
    </form>
  );
}
