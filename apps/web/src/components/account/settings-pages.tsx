'use client';

import { Bell, Pencil, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Async } from '@/components/ui/async';
import { ErrorSummary } from '@/components/ui/error-summary';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { DateTime, Money } from '@/components/ui/format';
import { Alert, EmptyState, Ltr, PageHeader, Section, StatusBadge } from '@/components/ui/misc';
import { FileUploader } from '@/components/files/file-uploader';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';
import { useApi } from '@/lib/use-api';
import { AddressForm, type AddressRow } from './address-form';

interface NotificationRow { id: string; type: string; params: Record<string, unknown>; linkPath: string | null; readAt: string | null; createdAt: string }

const NOTIFICATION_TEXT: Record<string, { fa: string; en: string }> = {
  'quote.sent': { fa: 'پیش‌فاکتور جدید صادر شد', en: 'A new quote was issued' },
  'quote.expiring': { fa: 'پیش‌فاکتور به‌زودی منقضی می‌شود', en: 'A quote expires soon' },
  'quote.expired': { fa: 'پیش‌فاکتور منقضی شد', en: 'A quote expired' },
  'order.paid': { fa: 'پرداخت سفارش تأیید شد', en: 'Order payment verified' },
  'order.shipped': { fa: 'سفارش ارسال شد', en: 'Order shipped' },
  'payment.failed': { fa: 'پرداخت ناموفق بود', en: 'Payment failed' },
  'message.new': { fa: 'پیام تازه', en: 'New message' },
  'sourcing.submitted': { fa: 'درخواست تأمین ثبت شد', en: 'Sourcing request submitted' },
  'sourcing.needs_info': { fa: 'برای درخواست شما اطلاعات بیشتری لازم است', en: 'More information is needed for your request' },
  'procurement.paid': { fa: 'پرداخت تأمین تأیید شد', en: 'Sourcing payment verified' },
  'procurement.delayed': { fa: 'زمان برآورد تأمین تغییر کرد', en: 'Sourcing estimate changed' },
  'refund.succeeded': { fa: 'بازپرداخت انجام شد', en: 'Refund completed' },
  // Decisions on a cancellation or return request (`return.${decision}` in the API).
  'return.approved': { fa: 'درخواست لغو یا مرجوعی شما تأیید شد', en: 'Your cancellation or return request was approved' },
  'return.rejected': { fa: 'درخواست لغو یا مرجوعی شما تأیید نشد', en: 'Your cancellation or return request was not approved' },
  'order.paid_needs_resolution': { fa: 'پرداخت ثبت شد اما موجودی کافی نبود؛ سفارش برای بازپرداخت یا جایگزین به کارشناس ارجاع شد', en: 'Payment recorded but stock was not available; the order was referred to staff for a refund or an alternative' },
  'payment.duplicate_received': { fa: 'پرداخت تکراری دریافت شد؛ مبلغ اضافه بررسی و بازگردانده می‌شود', en: 'A duplicate payment was received; the extra amount will be reviewed and refunded' },
  'procurement.shipped': { fa: 'سفارش تأمین ارسال شد', en: 'Sourcing order shipped' },
};

/** Fixed texts first; status changes (order.<state>, procurement.<state>) read as the status; never a raw code. */
function useNotificationText(): (type: string) => string {
  const t = useTranslations();
  const locale = useLocale() as 'fa' | 'en';
  return (type) => {
    const fixed = NOTIFICATION_TEXT[type]?.[locale];
    if (fixed) return fixed;
    const change = /^(order|procurement)\.([a-z_]+)$/.exec(type);
    const state = change?.[2]?.toUpperCase();
    if (change && state && t.has(`status.${state}`)) {
      const subject = change[1] === 'order' ? (locale === 'fa' ? 'وضعیت سفارش' : 'Order status') : (locale === 'fa' ? 'وضعیت سفارش تأمین' : 'Sourcing order status');
      return `${subject}: ${t(`status.${state}` as never)}`;
    }
    return locale === 'fa' ? 'اعلان تازه' : 'New notification';
  };
}

export function NotificationsPage() {
  const t = useTranslations();
  const state = useApi<NotificationRow[]>('/notifications');
  const notificationText = useNotificationText();
  const markAll = async () => {
    await api('/notifications/all/read', { method: 'POST' }).catch(() => undefined);
    await state.reload();
  };
  return (
    <>
      <PageHeader title={t('account.notifications')} actions={<Button variant="secondary" size="sm" onClick={markAll}>{t('common.confirm')}</Button>} />
      <Async state={state}>
        {(rows) =>
          rows.length ? (
            <ul className="flex flex-col gap-2">
              {rows.map((n) => {
                const text = notificationText(n.type);
                const ref = typeof n.params.reference === 'string' ? n.params.reference : null;
                const body = (
                  <span className="flex flex-col">
                    <span className={`font-semibold ${n.readAt ? '' : 'text-action'}`}>{text}{ref ? <> — <Ltr>{ref}</Ltr></> : null}</span>
                    <span className="text-xs text-steel"><DateTime iso={n.createdAt} /></span>
                  </span>
                );
                return (
                  <li key={n.id} className="card flex items-center gap-3 p-4">
                    <Bell aria-hidden className={`size-5 ${n.readAt ? 'text-steel' : 'text-action'}`} />
                    {n.linkPath ? <Link href={n.linkPath} className="hover:underline">{body}</Link> : body}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title={t('common.results', { count: 0 })} />
          )
        }
      </Async>
    </>
  );
}

interface ReturnRow { id: string; reference: string; kind: string; status: string; reason: string; decisionReason: string | null; createdAt: string; refunds: Array<{ reference: string; status: string; amount: { currency: 'IRR'; amountMinor: string } }> }

export function ReturnsPage() {
  const t = useTranslations();
  const state = useApi<ReturnRow[]>('/returns');
  return (
    <>
      <PageHeader title={t('account.returns')} />
      <Async state={state}>
        {(rows) =>
          rows.length ? (
            <ul className="flex flex-col gap-3">
              {rows.map((r) => (
                <li key={r.id} className="card flex flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold"><Ltr>{r.reference}</Ltr> — {r.kind === 'CANCEL' ? t('order.requestCancel') : t('order.requestReturn')}</span>
                    <StatusBadge status={r.status} label={t(`status.${r.status}` as never)} />
                  </div>
                  <p className="text-sm">{r.reason}</p>
                  {r.decisionReason ? <p className="text-sm text-steel">{r.decisionReason}</p> : null}
                  {r.refunds.map((f) => (
                    <p key={f.reference} className="text-sm"><Ltr>{f.reference}</Ltr>: <Money value={f.amount} /> — {t(`status.${f.status}` as never)}</p>
                  ))}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t('common.results', { count: 0 })} />
          )
        }
      </Async>
    </>
  );
}

export function AddressesPage() {
  const t = useTranslations();
  const state = useApi<AddressRow[]>('/account/addresses');
  const [editing, setEditing] = useState<AddressRow | 'new' | null>(null);
  const archive = async (id: string) => {
    await api(`/account/addresses/${id}`, { method: 'DELETE' }).catch(() => undefined);
    await state.reload();
  };
  return (
    <>
      <PageHeader title={t('account.addresses')} actions={<Button onClick={() => setEditing('new')}>{t('checkout.addAddress')}</Button>} />
      {editing ? (
        <div className="card mb-6 p-5">
          <AddressForm initial={editing === 'new' ? undefined : editing} onSaved={() => { setEditing(null); void state.reload(); }} onCancel={() => setEditing(null)} />
        </div>
      ) : null}
      <Async state={state}>
        {(rows) =>
          rows.length ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {rows.map((a) => (
                <li key={a.id} className="card flex flex-col gap-1 p-4">
                  <span className="font-semibold">{a.label ?? a.recipientName}{a.isDefault ? <span className="ms-2 text-xs text-action">({t('account.defaultAddress')})</span> : null}</span>
                  <span className="text-sm">{a.recipientName} — <Ltr>{a.recipientMobile}</Ltr></span>
                  <span className="text-sm">{a.province}، {a.city} — {a.addressLine}</span>
                  <span className="text-sm text-steel"><Ltr>{a.postalCode}</Ltr></span>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(a)} icon={<Pencil aria-hidden className="size-4" />}>{t('common.edit')}</Button>
                    <Button size="sm" variant="ghost" onClick={() => void archive(a.id)} icon={<Trash2 aria-hidden className="size-4" />}>{t('common.delete')}</Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t('common.results', { count: 0 })} />
          )
        }
      </Async>
    </>
  );
}

interface Profile { fullName: string | null; email: string | null; preferredLocale: 'fa' | 'en'; customerType: string; groupStatus: string; requestedType: string | null; businessName: string | null; companyRole: string | null }

export function ProfilePage() {
  const t = useTranslations();
  const state = useApi<Profile>('/account/profile');
  return (
    <>
      <PageHeader title={t('account.profile')} />
      <Async state={state}>{(p) => <ProfileForms profile={p} reload={state.reload} />}</Async>
    </>
  );
}

function ProfileForms({ profile, reload }: { profile: Profile; reload: () => Promise<void> }) {
  const t = useTranslations();
  const [v, setV] = useState({ fullName: profile.fullName ?? '', email: profile.email ?? '', preferredLocale: profile.preferredLocale, companyName: profile.businessName ?? '', companyRole: profile.companyRole ?? '' });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [biz, setBiz] = useState({ requestedType: 'WORKSHOP', businessName: profile.businessName ?? '', city: '', note: '' });
  const [bizFiles, setBizFiles] = useState<string[]>([]);
  const [bizState, setBizState] = useState<'idle' | 'saving' | 'done'>('idle');
  const onFiles = useCallback((ids: string[]) => setBizFiles(ids), []);
  const save = async () => {
    setError(null);
    try {
      await api('/account/profile', { method: 'PUT', body: { ...v, email: v.email || '', companyName: v.companyName || undefined, companyRole: v.companyRole || undefined } });
      setSaved(true);
    } catch (e) {
      setError(errorText(t, e));
    }
  };
  const requestBusiness = async () => {
    setBizState('saving');
    try {
      await api('/account/business-request', { method: 'POST', body: { ...biz, note: biz.note || undefined, attachmentIds: bizFiles } });
      setBizState('done');
      await reload();
    } catch (e) {
      setBizState('idle');
      setError(errorText(t, e));
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <ErrorSummary title={t('validation.summaryTitle')} errors={[]} generalError={error} />
      <Section title={t('account.profile')} id="profile-form">
        <form noValidate onSubmit={(e) => { e.preventDefault(); void save(); }} className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="pf-name" label={t('auth.fullName')} required><Input id="pf-name" value={v.fullName} onChange={(e) => setV({ ...v, fullName: e.target.value })} /></Field>
            <Field id="pf-email" label={t('account.email')} optionalLabel={t('common.optional')}><Input id="pf-email" type="email" dir="ltr" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
            <Field id="pf-company" label={t('account.companyName')} optionalLabel={t('common.optional')}><Input id="pf-company" value={v.companyName} onChange={(e) => setV({ ...v, companyName: e.target.value })} /></Field>
            <Field id="pf-role" label={t('account.companyRole')} optionalLabel={t('common.optional')}><Input id="pf-role" value={v.companyRole} onChange={(e) => setV({ ...v, companyRole: e.target.value })} /></Field>
            <Field id="pf-locale" label={t('account.preferredLocale')}>
              <Select id="pf-locale" value={v.preferredLocale} onChange={(e) => setV({ ...v, preferredLocale: e.target.value as 'fa' | 'en' })}>
                <option value="fa">فارسی</option>
                <option value="en">English</option>
              </Select>
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit">{t('common.save')}</Button>
            {saved ? <span role="status" className="text-sm text-success">✓ {t('common.save')}</span> : null}
          </div>
        </form>
      </Section>
      <Section title={t('account.businessRequest')} id="business">
        <p className="mb-3 text-sm text-steel">{t('account.businessRequestHint')}</p>
        <p className="mb-3">{t('account.customerType')}: <strong>{t(`account.type_${profile.customerType}` as never)}</strong></p>
        {profile.groupStatus !== 'NONE' ? <Alert tone={profile.groupStatus === 'APPROVED' ? 'success' : profile.groupStatus === 'REJECTED' ? 'danger' : 'info'} title={t(`account.groupStatus_${profile.groupStatus}` as never)} /> : null}
        {profile.groupStatus === 'NONE' || profile.groupStatus === 'REJECTED' ? (
          bizState === 'done' ? <Alert tone="success" title={t('account.groupStatus_PENDING')} /> : (
            <form noValidate onSubmit={(e) => { e.preventDefault(); void requestBusiness(); }} className="mt-4 flex flex-col gap-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Field id="bz-type" label={t('account.customerType')}>
                  <Select id="bz-type" value={biz.requestedType} onChange={(e) => setBiz({ ...biz, requestedType: e.target.value })}>
                    <option value="WORKSHOP">{t('account.type_WORKSHOP')}</option>
                    <option value="WHOLESALER">{t('account.type_WHOLESALER')}</option>
                  </Select>
                </Field>
                <Field id="bz-name" label={t('account.businessName')} required><Input id="bz-name" value={biz.businessName} onChange={(e) => setBiz({ ...biz, businessName: e.target.value })} /></Field>
                <Field id="bz-city" label={t('request.city')} required><Input id="bz-city" value={biz.city} onChange={(e) => setBiz({ ...biz, city: e.target.value })} /></Field>
              </div>
              <Field id="bz-note" label={t('request.overallNote')} optionalLabel={t('common.optional')}><Textarea id="bz-note" rows={2} value={biz.note} onChange={(e) => setBiz({ ...biz, note: e.target.value })} /></Field>
              <FileUploader purpose="BUSINESS_VERIFICATION" onChange={onFiles} id="bz-files" />
              <Button type="submit" loading={bizState === 'saving'} disabled={!biz.businessName.trim() || !biz.city.trim()}>{t('common.submit')}</Button>
            </form>
          )
        ) : null}
      </Section>
    </div>
  );
}
