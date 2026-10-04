'use client';

import { SMS_NOTIFICATION_TYPES } from '@hedax/contracts/constants';
import { formatDecimalString, formatIsoDateAsJalali, isoDateToJalali, parseDecimalAmount, parseJalaliDateToIso, toAsciiDigits } from '@hedax/domain';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Async } from '@/components/ui/async';
import { Checkbox, describedBy, Field, Input, Select, Textarea } from '@/components/ui/field';
import { DateTime, Money, Num, useListSeparator } from '@/components/ui/format';
import { Alert, Badge, EmptyState, Ltr, PageHeader, Section, TableScroll, td, th } from '@/components/ui/misc';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';
import { typedNumber } from '@/lib/numbers';
import { useApi } from '@/lib/use-api';
import { useCodeLabel, useL } from './shell';

function useAction(reload: () => Promise<void>) {
  const t = useTranslations();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    setOk(false);
    try { await fn(); setOk(true); await reload(); } catch (e) { setError(errorText(t, e)); }
  };
  return { error, ok, run };
}

export function FxPage() {
  const t = useTranslations();
  const l = useL();
  const locale = useLocale() as 'fa' | 'en';
  const state = useApi<Array<{ id: string; irrPerAed: string; effectiveFrom: string; note: string | null; createdBy: string | null }>>('/admin/exchange-rates');
  const [rate, setRate] = useState('');
  const [note, setNote] = useState('');
  const { error, ok, run } = useAction(state.reload);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('admin.fx')} description={t('admin.rateNote')} />
      <Section title={t('admin.newRate')} id="fx-new">
        <div className="grid gap-3 md:grid-cols-3">
          <Field id="fx-rate" label={t('admin.irrPerAed')} hint="e.g. 165000.5"><Input id="fx-rate" dir="ltr" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
          <Field id="fx-note" label={t('order.reason')} optionalLabel={t('common.optional')} className="md:col-span-2"><Input id="fx-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        {error ? <Alert tone="danger" className="mt-3" title={error} /> : null}
        {ok ? <Alert tone="success" className="mt-3" title={t('common.save')} /> : null}
        <Button className="mt-3" disabled={!/^\d+(\.\d{1,6})?$/.test(rate)} onClick={() => void run(() => api('/admin/exchange-rates', { method: 'POST', body: { irrPerAed: rate, effectiveFrom: new Date().toISOString(), note: note || undefined } }))}>{t('admin.newRate')}</Button>
      </Section>
      <Section title={t('admin.rateHistory')} id="fx-history">
        <Async state={state}>
          {(rows) => rows.length ? (
            <ul className="flex flex-col gap-2">{rows.map((r) => <li key={r.id} className="flex flex-wrap justify-between gap-2 rounded bg-surface p-3"><span className="font-semibold">{formatDecimalString(r.irrPerAed, locale)} {l('ریال به‌ازای هر درهم', 'IRR per AED')}</span><span><DateTime iso={r.effectiveFrom} /></span><span className="text-sm text-steel">{r.createdBy} {r.note ? `— ${r.note}` : ''}</span></li>)}</ul>
          ) : <EmptyState title={t('common.results', { count: 0 })} />}
        </Async>
      </Section>
    </div>
  );
}

interface Zone { provinces: string[]; costIrrMinor: string | null; minDays: number | null; maxDays: number | null }
interface Method { id: string; code: string; nameFa: string; nameEn: string | null; carrierCode: string | null; trackingUrlTemplate: string | null; active: boolean; zones: Zone[] }

export function ShippingPage() {
  const t = useTranslations();
  const l = useL();
  const sep = useListSeparator();
  const state = useApi<Method[]>('/admin/shipping-methods');
  const [m, setM] = useState({ code: '', nameFa: '', nameEn: '', carrierCode: '', trackingUrlTemplate: '', provinces: '', cost: '', unknown: false, minDays: '', maxDays: '' });
  const { error, ok, run } = useAction(state.reload);
  const save = () => run(() => api('/admin/shipping-methods', {
    method: 'POST',
    body: {
      code: m.code, nameFa: m.nameFa, nameEn: m.nameEn || null, carrierCode: m.carrierCode || undefined, trackingUrlTemplate: m.trackingUrlTemplate || null, active: true,
      zones: [{ provinces: m.provinces.split(/[،,]/).map((p) => p.trim()).filter(Boolean), costIrr: m.unknown ? null : parseDecimalAmount(m.cost || '0', 'IRR').toString(), minDays: m.minDays ? typedNumber(m.minDays) : null, maxDays: m.maxDays ? typedNumber(m.maxDays) : null }],
    },
  }));
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('admin.shipping')} description={l('هزینهٔ نامعلوم هرگز صفر فرض نمی‌شود؛ در آن حالت پرداخت آنلاین غیرفعال و مسیر استعلام نمایش داده می‌شود.', 'An unknown cost is never assumed to be zero; online payment is disabled and an inquiry path is shown.')} />
      <Async state={state}>
        {(rows) => rows.length ? (
          <TableScroll caption={t('admin.shipping')}>
            <thead><tr><th className={th}>{l('کد', 'Code')}</th><th className={th}>{t('admin.name')}</th><th className={th}>{l('نواحی و هزینه', 'Zones & cost')}</th><th className={th}>{l('رهگیری', 'Tracking')}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={td}><Ltr>{r.code}</Ltr></td>
                  <td className={td}>{l(r.nameFa, r.nameEn ?? r.nameFa)}{r.active ? null : <Badge className="ms-1">{l('غیرفعال', 'Inactive')}</Badge>}</td>
                  <td className={td}>{r.zones.map((z, i) => (
                    <span key={i} className="block text-sm">
                      {z.provinces.length ? z.provinces.join('، ') : l('همهٔ استان‌ها', 'All provinces')}: {z.costIrrMinor === null ? <Badge tone="warning">{t('price.inquiry')}</Badge> : <Money value={{ currency: 'IRR', amountMinor: z.costIrrMinor }} />}
                      {z.minDays != null && z.maxDays != null ? <>{sep}<Num value={z.minDays} />–<Num value={z.maxDays} /> {l('روز', 'days')}</> : null}
                    </span>
                  ))}</td>
                  <td className={td}>{r.trackingUrlTemplate ? <Ltr>{r.carrierCode}</Ltr> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        ) : <EmptyState title={t('common.results', { count: 0 })} />}
      </Async>
      <Section title={l('روش ارسال جدید', 'New shipping method')} id="ship-new">
        <div className="grid gap-3 md:grid-cols-3">
          <Field id="sh-code" label={l('کد', 'Code')} hint="a-z, 0-9, _"><Input id="sh-code" dir="ltr" value={m.code} onChange={(e) => setM({ ...m, code: e.target.value })} /></Field>
          <Field id="sh-fa" label={`${t('admin.name')} (فارسی)`}><Input id="sh-fa" value={m.nameFa} onChange={(e) => setM({ ...m, nameFa: e.target.value })} /></Field>
          <Field id="sh-en" label={`${t('admin.name')} (English)`} optionalLabel={t('common.optional')}><Input id="sh-en" dir="ltr" value={m.nameEn} onChange={(e) => setM({ ...m, nameEn: e.target.value })} /></Field>
          <Field id="sh-prov" label={l('استان‌ها (خالی = همه)', 'Provinces (empty = all)')} optionalLabel={t('common.optional')}><Input id="sh-prov" value={m.provinces} onChange={(e) => setM({ ...m, provinces: e.target.value })} /></Field>
          <Field id="sh-cost" label={l('هزینه (ریال)', 'Cost (IRR)')}><Input id="sh-cost" dir="ltr" value={m.cost} disabled={m.unknown} onChange={(e) => setM({ ...m, cost: e.target.value })} /></Field>
          <Checkbox id="sh-unknown" label={l('هزینه نامعلوم (استعلام)', 'Cost unknown (inquiry)')} checked={m.unknown} onChange={(e) => setM({ ...m, unknown: e.target.checked })} />
          <Field id="sh-min" label={l('حداقل روز', 'Min days')} optionalLabel={t('common.optional')}><Input id="sh-min" inputMode="numeric" value={m.minDays} onChange={(e) => setM({ ...m, minDays: e.target.value })} /></Field>
          <Field id="sh-max" label={l('حداکثر روز', 'Max days')} optionalLabel={t('common.optional')}><Input id="sh-max" inputMode="numeric" value={m.maxDays} onChange={(e) => setM({ ...m, maxDays: e.target.value })} /></Field>
          <Field id="sh-carrier" label={l('کد شرکت حمل (برای لینک رهگیری)', 'Carrier code (for tracking link)')} optionalLabel={t('common.optional')}><Input id="sh-carrier" dir="ltr" value={m.carrierCode} onChange={(e) => setM({ ...m, carrierCode: e.target.value })} /></Field>
          <Field id="sh-template" label={l('الگوی لینک رهگیری', 'Tracking URL template')} hint="https://…/{code}" optionalLabel={t('common.optional')} className="md:col-span-2"><Input id="sh-template" dir="ltr" value={m.trackingUrlTemplate} onChange={(e) => setM({ ...m, trackingUrlTemplate: e.target.value })} /></Field>
        </div>
        {error ? <Alert tone="danger" className="mt-3" title={error} /> : null}
        {ok ? <Alert tone="success" className="mt-3" title={t('common.save')} /> : null}
        <Button className="mt-3" onClick={() => void save()} disabled={!m.code || !m.nameFa}>{t('common.save')}</Button>
      </Section>
    </div>
  );
}

export function PoliciesPage() {
  const t = useTranslations();
  const l = useL();
  const label = useCodeLabel();
  const state = useApi<Array<{ id: string; kind: string; version: number; status: string; titleFa: string; publishedAt: string | null }>>('/admin/policies');
  const [p, setP] = useState({ kind: 'TERMS', titleFa: '', titleEn: '', bodyFa: '', bodyEn: '' });
  const { error, ok, run } = useAction(state.reload);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('admin.policies')} description={l('هر تغییر نسخهٔ جدید می‌سازد؛ پذیرش‌های قبلی به نسخهٔ خودشان متصل می‌مانند. متن حقوقی یا عدد تعهدی را فقط با تأیید مالک منتشر کنید.', 'Every change creates a new version; earlier acceptances stay linked to their version. Publish legal text or commitments only with owner approval.')} />
      <Async state={state}>
        {(rows) => rows.length ? (
          <TableScroll caption={t('admin.policies')}>
            <thead><tr><th className={th}>{l('نوع', 'Kind')}</th><th className={th}>{l('نسخه', 'Version')}</th><th className={th}>{l('عنوان', 'Title')}</th><th className={th}>{t('order.status')}</th><th className={th} /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={td}>{label('policyKind', r.kind)}</td><td className={td}><Num value={r.version} /></td><td className={td}>{r.titleFa}</td>
                  <td className={td}><Badge tone={r.status === 'PUBLISHED' ? 'success' : 'neutral'}>{label('policyStatus', r.status)}</Badge></td>
                  <td className={td}>{r.status === 'DRAFT' ? <Button size="sm" onClick={() => void run(() => api(`/admin/policies/${r.id}/publish`, { method: 'POST' }))}>{t('admin.publish')}</Button> : null}</td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        ) : <EmptyState title={t('common.results', { count: 0 })} />}
      </Async>
      <Section title={l('نسخهٔ جدید', 'New version')} id="pol-new">
        <div className="grid gap-3 md:grid-cols-3">
          <Field id="pol-kind" label={l('نوع', 'Kind')}>
            <Select id="pol-kind" value={p.kind} onChange={(e) => setP({ ...p, kind: e.target.value })}>{['TERMS', 'PRIVACY', 'RETURNS', 'SHIPPING', 'SOURCING', 'WARRANTY'].map((k) => <option key={k} value={k}>{label('policyKind', k)}</option>)}</Select>
          </Field>
          <Field id="pol-tfa" label={`${l('عنوان', 'Title')} (فارسی)`}><Input id="pol-tfa" value={p.titleFa} onChange={(e) => setP({ ...p, titleFa: e.target.value })} /></Field>
          <Field id="pol-ten" label={`${l('عنوان', 'Title')} (English)`} optionalLabel={t('common.optional')}><Input id="pol-ten" dir="ltr" value={p.titleEn} onChange={(e) => setP({ ...p, titleEn: e.target.value })} /></Field>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field id="pol-bfa" label={`${l('متن', 'Body')} (فارسی)`}><Textarea id="pol-bfa" rows={8} value={p.bodyFa} onChange={(e) => setP({ ...p, bodyFa: e.target.value })} /></Field>
          <Field id="pol-ben" label={`${l('متن', 'Body')} (English)`} optionalLabel={t('common.optional')}><Textarea id="pol-ben" rows={8} dir="ltr" value={p.bodyEn} onChange={(e) => setP({ ...p, bodyEn: e.target.value })} /></Field>
        </div>
        {error ? <Alert tone="danger" className="mt-3" title={error} /> : null}
        {ok ? <Alert tone="success" className="mt-3" title={t('common.save')} /> : null}
        <Button className="mt-3" disabled={p.titleFa.length < 2 || p.bodyFa.length < 10} onClick={() => void run(() => api('/admin/policies', { method: 'POST', body: { ...p, titleEn: p.titleEn || null, bodyEn: p.bodyEn || null } }))}>{t('admin.saveDraft')}</Button>
      </Section>
    </div>
  );
}

export function CalendarPage() {
  const t = useTranslations();
  const l = useL();
  const state = useApi<Array<{ id: string; name: string; weekendDays: number[]; holidays: string[] }>>('/admin/calendars');
  return (
    <>
      <PageHeader title={t('admin.calendar')} description={l('تعطیلات حدس زده نمی‌شوند؛ فقط تاریخ‌هایی که اینجا ثبت می‌کنید در روز کاری کنار گذاشته می‌شوند.', 'Holidays are never guessed; only dates you enter here are skipped for business days.')} />
      <Async state={state}>{(rows) => <>{rows.map((c) => <CalendarEditor key={c.id} calendar={c} reload={state.reload} />)}</>}</Async>
    </>
  );
}

/** A typed Gregorian date ("2026-03-21") if it is a real date, else null. */
const parseIsoDate = (text: string) => {
  const iso = toAsciiDigits(text).trim();
  return isoDateToJalali(iso) ? iso : null;
};

function CalendarEditor({ calendar, reload }: { calendar: { id: string; name: string; weekendDays: number[]; holidays: string[] }; reload: () => Promise<void> }) {
  const t = useTranslations();
  const l = useL();
  // Persian screens show and accept Shamsi dates; the API keeps Gregorian YYYY-MM-DD (Tehran calendar days).
  const shamsi = useLocale() === 'fa';
  const [weekend, setWeekend] = useState<number[]>(calendar.weekendDays);
  const [holidays, setHolidays] = useState(calendar.holidays.map((iso) => (shamsi ? formatIsoDateAsJalali(iso) : iso)).join('\n'));
  const [invalid, setInvalid] = useState<string[]>([]);
  const { error, ok, run } = useAction(reload);
  const save = () => {
    const lines = holidays.split(/[\n,،]+/).map((line) => line.trim()).filter(Boolean);
    const parsed = lines.map((line) => ({ line, iso: shamsi ? parseJalaliDateToIso(line) : parseIsoDate(line) }));
    const bad = parsed.filter((p) => !p.iso).map((p) => p.line);
    setInvalid(bad);
    if (bad.length) return;
    void run(() => api(`/admin/calendars/${calendar.id}`, { method: 'PUT', body: { name: calendar.name, weekendDays: weekend, holidays: parsed.map((p) => p.iso as string) } }));
  };
  const holidaysId = `cal-${calendar.id}-hol`;
  const invalidText = invalid.length ? l(`این سطرها تاریخ شمسی معتبر نیستند: ${invalid.join('، ')}`, `These lines are not valid dates: ${invalid.join(', ')}`) : undefined;
  const days = [l('یکشنبه', 'Sunday'), l('دوشنبه', 'Monday'), l('سه‌شنبه', 'Tuesday'), l('چهارشنبه', 'Wednesday'), l('پنجشنبه', 'Thursday'), l('جمعه', 'Friday'), l('شنبه', 'Saturday')];
  // Values stay JavaScript day numbers (0 = Sunday); the Persian week starts on Saturday.
  const week = shamsi ? [6, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
  return (
    <Section title={calendar.name} id={`cal-${calendar.id}`}>
      <fieldset>
        <legend className="text-sm font-semibold">{l('روزهای تعطیل هفتگی', 'Weekly days off')}</legend>
        <div className="flex flex-wrap gap-x-4">
          {week.map((i) => <Checkbox key={i} id={`cal-${calendar.id}-d${i}`} label={days[i]} checked={weekend.includes(i)} onChange={(e) => setWeekend(e.target.checked ? [...weekend, i] : weekend.filter((x) => x !== i))} />)}
        </div>
      </fieldset>
      <Field id={holidaysId} label={l('تعطیلات رسمی (هر خط یک تاریخ شمسی، مثلاً ۱۴۰۵/۰۱/۰۱)', 'Holidays (one Gregorian YYYY-MM-DD per line, Tehran date)')} error={invalidText} className="mt-3">
        <Textarea id={holidaysId} dir={shamsi ? 'rtl' : 'ltr'} rows={6} value={holidays} invalid={invalid.length > 0} aria-describedby={describedBy(holidaysId, undefined, invalidText)} onChange={(e) => setHolidays(e.target.value)} />
      </Field>
      {error ? <Alert tone="danger" className="mt-3" title={error} /> : null}
      {ok ? <Alert tone="success" className="mt-3" title={t('common.save')} /> : null}
      <Button className="mt-3" onClick={save}>{t('common.save')}</Button>
    </Section>
  );
}

interface SiteSettings { contactPhone?: string; contactEmail?: string; contactAddressFa?: string; contactAddressEn?: string; workingHoursFa?: string; workingHoursEn?: string; domain?: string; reservationMinutes: number; quoteValidityHoursDefault: number; taxRateBasisPoints: number | null; taxBase: 'ITEMS' | 'ITEMS_AND_SHIPPING'; smsDisabledTypes?: string[]; version: number }

export function SiteSettingsPage() {
  const t = useTranslations();
  const state = useApi<SiteSettings>('/admin/settings');
  return (
    <>
      <PageHeader title={t('admin.settings')} />
      <Async state={state}>{(s) => <SiteSettingsForm settings={s} reload={state.reload} />}</Async>
    </>
  );
}

function SiteSettingsForm({ settings, reload }: { settings: SiteSettings; reload: () => Promise<void> }) {
  const t = useTranslations();
  const l = useL();
  const [s, setS] = useState({ ...settings, taxPercent: settings.taxRateBasisPoints === null ? '' : String(settings.taxRateBasisPoints / 100) });
  const { error, ok, run } = useAction(reload);
  const save = () => run(() => api('/admin/settings', {
    method: 'PUT',
    body: {
      contactPhone: s.contactPhone || undefined, contactEmail: s.contactEmail || '', contactAddressFa: s.contactAddressFa || undefined, contactAddressEn: s.contactAddressEn || undefined,
      workingHoursFa: s.workingHoursFa || undefined, workingHoursEn: s.workingHoursEn || undefined, domain: s.domain || undefined,
      reservationMinutes: typedNumber(s.reservationMinutes), quoteValidityHoursDefault: typedNumber(s.quoteValidityHoursDefault),
      taxRateBasisPoints: s.taxPercent === '' ? null : Math.round(typedNumber(s.taxPercent) * 100), taxBase: s.taxBase, manualBankTransferEnabled: false, smsDisabledTypes: s.smsDisabledTypes ?? [], version: settings.version,
    },
  }));
  const text = (key: keyof SiteSettings, label: string, ltr = false) => (
    <Field id={`st-${key}`} label={label} optionalLabel={t('common.optional')}>
      <Input id={`st-${key}`} dir={ltr ? 'ltr' : undefined} value={String(s[key] ?? '')} onChange={(e) => setS({ ...s, [key]: e.target.value })} />
    </Field>
  );
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); void save(); }} className="flex flex-col gap-6">
      <Section title={l('اطلاعات تماس (فقط اطلاعات تأییدشده)', 'Contact (approved details only)')} id="st-contact">
        <div className="grid gap-3 md:grid-cols-2">
          {text('contactPhone', t('pages.phone'), true)}
          {text('contactEmail', t('account.email'), true)}
          {text('contactAddressFa', `${t('pages.address')} (فارسی)`)}
          {text('contactAddressEn', `${t('pages.address')} (English)`, true)}
          {text('workingHoursFa', `${t('pages.hours')} (فارسی)`)}
          {text('workingHoursEn', `${t('pages.hours')} (English)`, true)}
          {text('domain', l('دامنه', 'Domain'), true)}
        </div>
      </Section>
      <Section title={l('فروش و پرداخت', 'Sales & payment')} id="st-sales">
        <div className="grid gap-3 md:grid-cols-4">
          <Field id="st-res" label={l('مدت رزرو (دقیقه)', 'Reservation (minutes)')}><Input id="st-res" inputMode="numeric" value={s.reservationMinutes} onChange={(e) => setS({ ...s, reservationMinutes: typedNumber(e.target.value) || 0 })} /></Field>
          <Field id="st-qv" label={l('اعتبار پیش‌فرض پیش‌فاکتور (ساعت)', 'Default quote validity (hours)')}><Input id="st-qv" inputMode="numeric" value={s.quoteValidityHoursDefault} onChange={(e) => setS({ ...s, quoteValidityHoursDefault: typedNumber(e.target.value) || 0 })} /></Field>
          <Field id="st-tax" label={l('نرخ مالیات (٪) — خالی یعنی تنظیم‌نشده', 'Tax rate (%) — empty = not configured')} optionalLabel={t('common.optional')}><Input id="st-tax" dir="ltr" value={s.taxPercent} onChange={(e) => setS({ ...s, taxPercent: e.target.value })} /></Field>
          <Field id="st-taxbase" label={l('مبنای مالیات', 'Tax base')}>
            <Select id="st-taxbase" value={s.taxBase} onChange={(e) => setS({ ...s, taxBase: e.target.value as SiteSettings['taxBase'] })}>
              <option value="ITEMS">{l('اقلام', 'Items')}</option>
              <option value="ITEMS_AND_SHIPPING">{l('اقلام و ارسال', 'Items & shipping')}</option>
            </Select>
          </Field>
        </div>
        <p className="mt-3 text-sm text-steel">{l('انتقال بانکی دستی در نسخهٔ اول غیرفعال است؛ رسید بارگذاری‌شده پرداخت محسوب نمی‌شود.', 'Manual bank transfer is disabled in v1; an uploaded receipt is not a payment.')}</p>
      </Section>
      <Section title={t('admin.notificationSettings')} id="st-notify">
        <p className="mb-3 text-sm text-steel">{t('admin.notificationSettingsHint')}</p>
        <fieldset>
          <legend className="text-sm font-semibold">{t('admin.smsCopyFor')}</legend>
          <div className="grid gap-x-4 md:grid-cols-2">
            {SMS_NOTIFICATION_TYPES.map((type) => (
              <Checkbox key={type} id={`st-sms-${type.replace('.', '-')}`} label={t(`admin.smsType_${type.replace('.', '_')}` as never)}
                checked={!(s.smsDisabledTypes ?? []).includes(type)}
                onChange={(e) => setS({ ...s, smsDisabledTypes: e.target.checked ? (s.smsDisabledTypes ?? []).filter((x) => x !== type) : [...(s.smsDisabledTypes ?? []), type] })} />
            ))}
          </div>
        </fieldset>
      </Section>
      {error ? <Alert tone="danger" title={error} /> : null}
      {ok ? <Alert tone="success" title={t('common.save')} /> : null}
      <div><Button type="submit">{t('common.save')}</Button></div>
    </form>
  );
}

export function AuditPage() {
  const t = useTranslations();
  const label = useCodeLabel();
  // Codes contain dots (message keys use «_»); an unknown code is shown as it is so nothing is hidden.
  const words = (group: string, code: string) => { const key = code.replaceAll('.', '_'); const text = label(group, key); return text === key ? code : text; };
  const state = useApi<Array<{ id: string; at: string; actor: string; action: string; entityType: string; entityId: string | null; requestId: string | null }>>('/admin/audit');
  return (
    <>
      <PageHeader title={t('admin.audit')} />
      <Async state={state}>
        {(rows) => rows.length ? (
          <TableScroll caption={t('admin.audit')}>
            <thead><tr><th className={th}>{t('order.date')}</th><th className={th}>{t('admin.auditActor')}</th><th className={th}>{t('admin.auditAction')}</th><th className={th}>{t('admin.auditEntity')}</th><th className={th}>{t('admin.auditRequest')}</th></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className={td}><DateTime iso={a.at} /></td>
                  <td className={td}>{words('auditActorKind', a.actor)}</td>
                  <td className={td}>{words('auditAction', a.action)}</td>
                  <td className={td}>{words('auditEntity', a.entityType)}{a.entityId ? <> <Ltr className="text-xs text-steel">{a.entityId.slice(0, 8)}</Ltr></> : null}</td>
                  <td className={td}><Ltr className="text-xs">{a.requestId?.slice(0, 8)}</Ltr></td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        ) : <EmptyState title={t('common.results', { count: 0 })} />}
      </Async>
    </>
  );
}
