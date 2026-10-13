'use client';

import type { StaffInvitationStatus, StaffInvitationView } from '@hedax/contracts';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { DateTime } from '@/components/ui/format';
import { Alert, Badge, EmptyState, Ltr, Section, TableScroll, td, th } from '@/components/ui/misc';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';
import { EraseConfirm } from './erase-confirm';
import { useL } from './shell';

const TONE: Record<StaffInvitationStatus, 'warning' | 'info' | 'danger' | 'success' | 'neutral'> = {
  PENDING: 'warning', SENT: 'info', FAILED: 'danger', ACCEPTED: 'success', EXPIRED: 'neutral', REVOKED: 'neutral',
};

/** Invitations with their e-mail state; resend replaces the link, revoke cancels it. Both are checked by the API too. */
export function InvitationsSection({ invitations, mailConfigured, reload }: { invitations: StaffInvitationView[]; mailConfigured: boolean; reload: () => Promise<void> }) {
  const t = useTranslations();
  const l = useL();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; link?: string } | null>(null);
  const [ownerResend, setOwnerResend] = useState<{ id: string; code: string } | null>(null);
  const [erasing, setErasing] = useState<string | null>(null);
  const label: Record<StaffInvitationStatus, string> = {
    PENDING: mailConfigured ? l('در صف ارسال ایمیل', 'Queued for e-mail') : l('ایمیل تنظیم نشده', 'E-mail not configured'),
    SENT: l('ارسال شد (سرور ایمیل پذیرفت)', 'Sent (accepted by the mail server)'),
    FAILED: l('ارسال ناموفق', 'Sending failed'),
    ACCEPTED: l('پذیرفته شد', 'Accepted'),
    EXPIRED: l('منقضی', 'Expired'),
    REVOKED: l('لغو شد', 'Revoked'),
  };
  const act = async (fn: () => Promise<void>) => {
    setError(null);
    setNotice(null);
    try { await fn(); await reload(); } catch (e) { setError(errorText(t, e)); }
  };
  const resend = (inv: StaffInvitationView, confirmCode?: string) => act(async () => {
    const res = await api<{ acceptUrl: string; emailQueued: boolean }>(`/admin/staff/invitations/${inv.id}/resend`, { method: 'POST', body: confirmCode ? { confirmCode } : {} });
    setOwnerResend(null);
    setNotice(res.emailQueued
      ? { text: l(`دعوت‌نامهٔ تازه برای ${inv.email} در صف ارسال است؛ لینک قبلی دیگر کار نمی‌کند.`, `A new invitation for ${inv.email} is queued; the previous link no longer works.`), link: res.acceptUrl }
      : { text: l('ایمیل سایت تنظیم نشده است؛ این لینک تازه را خودتان بفرستید. لینک قبلی دیگر کار نمی‌کند.', 'E-mail is not configured; share this new link yourself. The previous link no longer works.'), link: res.acceptUrl });
  });
  const revoke = (inv: StaffInvitationView) => act(async () => {
    if (!window.confirm(l(`دعوت ${inv.email} لغو شود؟ لینک آن دیگر کار نمی‌کند.`, `Revoke the invitation for ${inv.email}? Its link will stop working.`))) return;
    await api(`/admin/staff/invitations/${inv.id}/revoke`, { method: 'POST', body: {} });
    setNotice({ text: l('دعوت لغو شد.', 'Invitation revoked.') });
  });
  const erase = (inv: StaffInvitationView, confirmCode: string) => act(async () => {
    await api(`/admin/staff/invitations/${inv.id}/erase`, { method: 'POST', body: { confirmCode } });
    setErasing(null);
    setNotice({ text: l('دعوت به‌طور کامل حذف شد؛ نام و ایمیل در هیچ جای سایت نمانده است.', 'The invitation was erased; the name and e-mail no longer appear anywhere on the site.') });
  });
  const open = (s: StaffInvitationStatus) => s === 'PENDING' || s === 'SENT' || s === 'FAILED';
  return (
    <Section title={l('دعوت‌ها', 'Invitations')} id="invitations">
      <p className="mb-3 text-sm text-steel">{l('«ارسال شد» یعنی سرور ایمیل پیام را پذیرفته است؛ رسیدن به صندوق گیرنده را خود او تأیید می‌کند. هر دعوت فقط برای همان ایمیل، یک‌بار و تا زمان انقضا کار می‌کند.', '"Sent" means the mail server accepted the message; the recipient confirms it arrived. Each invitation works once, only for that address, until it expires.')}</p>
      {error ? <Alert tone="danger" title={error} className="mb-3" /> : null}
      {notice ? (
        <Alert tone="success" title={notice.text} className="mb-3">
          {notice.link ? <details className="mt-1 text-sm"><summary className="cursor-pointer">{l('لینک دعوت (فقط اگر ایمیل نرسید)', 'Invitation link (only if the e-mail does not arrive)')}</summary><p className="break-all"><Ltr>{notice.link}</Ltr></p></details> : null}
        </Alert>
      ) : null}
      {invitations.length ? (
        <TableScroll caption={l('دعوت‌ها', 'Invitations')}>
          <thead><tr><th className={th}>{t('auth.fullName')}</th><th className={th}>{t('auth.email')}</th><th className={th}>{t('admin.roles')}</th><th className={th}>{t('order.status')}</th><th className={th}>{l('انقضا', 'Expires')}</th><th className={th} /></tr></thead>
          <tbody>
            {invitations.map((inv) => (
              <tr key={inv.id}>
                <td className={td}>{inv.fullName}</td>
                <td className={td}><Ltr>{inv.email}</Ltr></td>
                <td className={td}>{inv.roles.map((r) => l(r.nameFa, r.nameEn)).join('، ')}</td>
                <td className={td}>
                  <Badge tone={TONE[inv.status]}>{label[inv.status]}</Badge>
                  {inv.status === 'SENT' && inv.sentAt ? <span className="block text-xs text-steel"><DateTime iso={inv.sentAt} /></span> : null}
                  {inv.lastError ? <span className="block text-xs text-danger"><Ltr>{inv.lastError}</Ltr></span> : null}
                </td>
                <td className={td}><DateTime iso={inv.expiresAt} /></td>
                <td className={td}>
                  <div className="flex flex-wrap gap-1">
                    {inv.status !== 'ACCEPTED' && inv.status !== 'REVOKED' ? (
                      inv.roles.some((r) => r.isOwner) ? (
                        <Button size="sm" variant="secondary" onClick={() => setOwnerResend({ id: inv.id, code: '' })}>{l('ارسال دوباره', 'Resend')}</Button>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => void resend(inv)}>{l('ارسال دوباره', 'Resend')}</Button>
                      )
                    ) : null}
                    {open(inv.status) ? <Button size="sm" variant="ghost" onClick={() => void revoke(inv)}>{l('لغو دعوت', 'Revoke')}</Button> : null}
                    {/* An accepted invitation goes together with the staff account (table above). */}
                    {inv.status !== 'ACCEPTED' ? <Button size="sm" variant="ghost" className="text-danger" onClick={() => setErasing(inv.id)}>{l('حذف کامل', 'Erase')}</Button> : null}
                  </div>
                  {erasing === inv.id ? <EraseConfirm id={inv.id} title={l(`حذف کامل دعوت ${inv.fullName}`, `Erase the invitation for ${inv.fullName}`)} onConfirm={(code) => erase(inv, code)} onCancel={() => setErasing(null)} /> : null}
                  {ownerResend?.id === inv.id ? (
                    <div className="mt-2 flex items-end gap-2">
                      <Field id={`inv-resend-${inv.id}`} label={t('admin.ownerConfirmCode')} className="max-w-[12rem]">
                        <Input id={`inv-resend-${inv.id}`} dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={ownerResend.code} onChange={(e) => setOwnerResend({ id: inv.id, code: e.target.value })} />
                      </Field>
                      <Button size="sm" disabled={!/^[0-9۰-۹]{6}$/.test(ownerResend.code.trim())} onClick={() => void resend(inv, ownerResend.code.trim())}>{l('تأیید و ارسال', 'Confirm & send')}</Button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      ) : <EmptyState title={l('هنوز دعوتی ثبت نشده است.', 'No invitations yet.')} />}
    </Section>
  );
}
