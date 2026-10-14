'use client';

import type { StaffInvitationView, StaffMemberView } from '@hedax/contracts';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { Async } from '@/components/ui/async';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input } from '@/components/ui/field';
import { DateTime } from '@/components/ui/format';
import { Alert, Badge, EmptyState, Ltr, PageHeader, TableScroll, td, th } from '@/components/ui/misc';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { errorText, isApiError } from '@/lib/api/errors';
import { useApi } from '@/lib/use-api';
import { ActionMenu, type MenuAction } from './action-menu';
import { useL } from './shell';

interface RoleRow { id: string; key: string; nameFa: string; nameEn: string; isOwner: boolean }
interface StaffData { staff: StaffMemberView[]; invitations: StaffInvitationView[]; mailConfigured: boolean }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Same rule as the server (contracts staffPhoneSchema). */
const PHONE = /^\+?[0-9۰-۹][0-9۰-۹ ()-]{6,19}$/;
const CODE = /^[0-9۰-۹]{6}$/;

type Person = { kind: 'staff'; member: StaffMemberView } | { kind: 'invitation'; inv: StaffInvitationView };
type Modal =
  | { type: 'invite' }
  | { type: 'edit'; person: Person }
  | { type: 'status'; member: StaffMemberView; suspend: boolean }
  | { type: 'revoke'; inv: StaffInvitationView }
  | { type: 'resend'; inv: StaffInvitationView }
  | { type: 'erase'; person: Person }
  | { type: 'mfa'; member: StaffMemberView }
  | null;
type Notice = { tone: 'success' | 'warning'; text: string; link?: string } | null;

/** The owner's view of everyone in the panel: one list, a coloured state, «ویرایش» and a ⋮ menu per row. */
export function StaffPage() {
  const t = useTranslations();
  const l = useL();
  const state = useApi<StaffData>('/admin/staff');
  const roles = useApi<RoleRow[]>('/admin/roles');
  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [error, setError] = useState<string | null>(null);
  const roleName = (r: { nameFa: string; nameEn: string }) => l(r.nameFa, r.nameEn);
  const done = async (n: Notice) => {
    setModal(null);
    setError(null);
    setNotice(n);
    await state.reload();
  };
  const run = async (fn: () => Promise<Notice>) => {
    setError(null);
    try { await done(await fn()); } catch (e) { setModal(null); setError(errorText(t, e)); }
  };

  const nameOf = (p: Person) => (p.kind === 'staff' ? p.member.fullName ?? p.member.email ?? '' : p.inv.fullName);

  const badge = (p: Person): ReactNode => {
    if (p.kind === 'staff') return p.member.status === 'ACTIVE' ? <Badge tone="success">{l('فعال', 'Active')}</Badge> : <Badge tone="danger">{l('غیرفعال', 'Inactive')}</Badge>;
    const s = p.inv.status;
    if (s === 'EXPIRED') return <Badge tone="neutral">{l('منقضی‌شده', 'Expired')}</Badge>;
    if (s === 'REVOKED') return <Badge tone="neutral">{l('لغو شده', 'Revoked')}</Badge>;
    const mail = s === 'SENT' ? l('ایمیل دعوت ارسال شد', 'Invitation e-mail sent') : s === 'FAILED' ? l('ارسال ایمیل ناموفق بود', 'E-mail could not be sent') : state.data?.mailConfigured ? l('ایمیل در صف ارسال', 'E-mail queued') : l('ایمیل سایت تنظیم نشده', 'Site e-mail not configured');
    return <><Badge tone="warning">{l('در انتظار پذیرش', 'Awaiting acceptance')}</Badge><span className={`block text-xs ${s === 'FAILED' ? 'text-danger' : 'text-steel'}`}>{mail}</span></>;
  };

  const actions = (p: Person): MenuAction[] => {
    if (p.kind === 'invitation') {
      const inv = p.inv;
      const open = inv.status !== 'REVOKED';
      return [
        ...(open ? [{ key: 'resend', label: l('ارسال دوبارهٔ دعوت‌نامه', 'Resend invitation'), onSelect: () => (inv.roles.some((r) => r.isOwner) ? setModal({ type: 'resend', inv }) : void run(() => resend(inv))) }] : []),
        ...(open && inv.status !== 'EXPIRED' ? [{ key: 'revoke', label: l('لغو دعوت', 'Revoke invitation'), onSelect: () => setModal({ type: 'revoke', inv }) }] : []),
        { key: 'erase', label: l('حذف کامل', 'Erase'), danger: true, onSelect: () => setModal({ type: 'erase', person: p }) },
      ];
    }
    const m = p.member;
    return [
      { key: 'status', label: m.status === 'ACTIVE' ? l('غیرفعال کردن حساب', 'Deactivate account') : l('فعال کردن حساب', 'Activate account'), onSelect: () => setModal({ type: 'status', member: m, suspend: m.status === 'ACTIVE' }) },
      { key: 'mfa', label: l('ریست Authenticator (گوشی جدید)', 'Reset authenticator (new phone)'), disabled: !m.mfaEnabled, onSelect: () => setModal({ type: 'mfa', member: m }) },
      ...(m.canErase ? [{ key: 'erase', label: l('حذف کارمند', 'Delete staff member'), danger: true, onSelect: () => setModal({ type: 'erase', person: p }) }] : []),
    ];
  };

  const resend = async (inv: StaffInvitationView, confirmCode?: string): Promise<Notice> => {
    const res = await api<{ acceptUrl: string; emailQueued: boolean }>(`/admin/staff/invitations/${inv.id}/resend`, { method: 'POST', body: confirmCode ? { confirmCode } : {} });
    return res.emailQueued
      ? { tone: 'success', text: l(`دعوت‌نامهٔ تازه برای ${inv.email} فرستاده شد؛ لینک قبلی باطل شد و ۷۲ ساعت اعتبار دارد.`, `A new invitation was sent to ${inv.email}; the previous link no longer works and the new one is valid for 72 hours.`), link: res.acceptUrl }
      : { tone: 'warning', text: l('ایمیل سایت تنظیم نشده است؛ این لینک تازه را خودتان بفرستید. لینک قبلی باطل شد.', 'E-mail is not configured; share this new link yourself. The previous link no longer works.'), link: res.acceptUrl };
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('admin.staff')}
        description={l('فقط مالک این بخش را می‌بیند. غیرفعال کردن یا تغییر نقش، همهٔ نشست‌های آن کارمند را فوراً قطع می‌کند. نقش و وضعیت حساب خودتان از اینجا تغییر نمی‌کند و همیشه دست‌کم یک مالک فعال می‌ماند.', 'Only owners see this section. Deactivating or changing roles ends that person’s sessions at once. Your own roles and status cannot be changed here, and there is always at least one active owner.')}
        actions={<Button onClick={() => setModal({ type: 'invite' })}><Plus aria-hidden className="size-4" /> {t('admin.invite')}</Button>}
      />
      <div aria-live="polite">
        {notice ? (
          <Alert tone={notice.tone} title={notice.text}>
            {notice.link ? <details className="mt-1 text-sm"><summary className="cursor-pointer">{l('لینک دعوت (فقط اگر ایمیل نرسید)', 'Invitation link (only if the e-mail does not arrive)')}</summary><p className="break-all"><Ltr>{notice.link}</Ltr></p></details> : null}
          </Alert>
        ) : null}
      </div>
      {error ? <Alert tone="danger" title={error} /> : null}
      <Async state={state}>
        {(data) => {
          const people: Person[] = [
            ...data.staff.map((member): Person => ({ kind: 'staff', member })),
            ...data.invitations.filter((inv) => inv.status !== 'ACCEPTED').map((inv): Person => ({ kind: 'invitation', inv })),
          ];
          if (!people.length) return <EmptyState title={l('هنوز کسی نیست.', 'Nobody yet.')} />;
          return (
            <TableScroll caption={t('admin.staff')}>
              <thead><tr><th className={th}>{l('نام و ایمیل', 'Name and e-mail')}</th><th className={th}>{l('شماره تماس', 'Phone')}</th><th className={th}>{t('admin.roles')}</th><th className={th}>{t('order.status')}</th><th className={th}><span className="sr-only">{l('عملیات', 'Actions')}</span></th></tr></thead>
              <tbody>
                {people.map((p) => {
                  const key = p.kind === 'staff' ? `s-${p.member.id}` : `i-${p.inv.id}`;
                  const email = p.kind === 'staff' ? p.member.email : p.inv.email;
                  const phone = p.kind === 'staff' ? p.member.phone : p.inv.phone;
                  const rs = p.kind === 'staff' ? p.member.roles : p.inv.roles;
                  const self = p.kind === 'staff' && p.member.isSelf;
                  return (
                    <tr key={key}>
                      <td className={td}>
                        <span className="block font-semibold">{nameOf(p)}{self ? <span className="ms-2 text-xs font-normal text-steel">({l('شما', 'you')})</span> : null}</span>
                        {email ? <span className="block text-sm text-steel"><Ltr>{email}</Ltr></span> : null}
                        {p.kind === 'staff' && p.member.lastLoginAt ? <span className="block text-xs text-steel">{l('آخرین ورود: ', 'Last sign-in: ')}<DateTime iso={p.member.lastLoginAt} /></span> : null}
                        {p.kind === 'invitation' ? <span className="block text-xs text-steel">{l('انقضای لینک: ', 'Link expires: ')}<DateTime iso={p.inv.expiresAt} /></span> : null}
                      </td>
                      <td className={td}>{phone ? <Ltr>{phone}</Ltr> : <span className="text-steel">—</span>}</td>
                      <td className={td}>{rs.map(roleName).join('، ')}</td>
                      <td className={td}>{badge(p)}{p.kind === 'staff' ? <span className="block text-xs text-steel">{p.member.mfaEnabled ? l('تأیید دومرحله‌ای: فعال', 'Two-step: on') : l('تأیید دومرحله‌ای: ثبت نشده', 'Two-step: not set up')}</span> : null}</td>
                      <td className={td}>
                        {self ? (
                          <Link href="/admin/account" className="text-sm font-semibold text-action underline-offset-4 hover:underline">{l('حساب من', 'My account')}</Link>
                        ) : (
                          <div className="flex items-center gap-1">
                            {p.kind === 'staff' || p.inv.status !== 'REVOKED' ? <Button size="sm" variant="secondary" onClick={() => setModal({ type: 'edit', person: p })}>{t('common.edit')}</Button> : null}
                            <ActionMenu label={l(`عملیات برای ${nameOf(p)}`, `Actions for ${nameOf(p)}`)} actions={actions(p)} />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableScroll>
          );
        }}
      </Async>

      {modal?.type === 'invite' || modal?.type === 'edit' ? (
        <PersonDialog
          person={modal.type === 'edit' ? modal.person : null}
          roles={roles.data ?? []}
          onClose={() => setModal(null)}
          onSaved={(n) => void done(n)}
        />
      ) : null}

      {modal?.type === 'status' ? (
        <ConfirmDialog
          title={modal.suspend ? l(`غیرفعال کردن ${modal.member.fullName ?? ''}`, `Deactivate ${modal.member.fullName ?? ''}`) : l(`فعال کردن ${modal.member.fullName ?? ''}`, `Activate ${modal.member.fullName ?? ''}`)}
          text={modal.suspend ? l('همهٔ نشست‌های او همین حالا بسته می‌شود و تا فعال شدن دوباره نمی‌تواند وارد شود.', 'All their sessions end now and they cannot sign in until reactivated.') : l('دوباره می‌تواند با ایمیل و رمز خودش وارد شود.', 'They can sign in again with their e-mail and password.')}
          confirmLabel={modal.suspend ? l('غیرفعال شود', 'Deactivate') : l('فعال شود', 'Activate')}
          danger={modal.suspend}
          onClose={() => setModal(null)}
          onConfirm={async () => {
            const { member, suspend } = modal;
            await api(`/admin/staff/${member.id}`, { method: 'PATCH', body: { suspended: suspend, reason: suspend ? 'suspended by owner' : 'reactivated by owner' } });
            await done({ tone: 'success', text: suspend ? l('حساب غیرفعال شد و از سیستم خارج شد.', 'The account was deactivated and signed out.') : l('حساب فعال شد.', 'The account was activated.') });
          }}
        />
      ) : null}

      {modal?.type === 'revoke' ? (
        <ConfirmDialog
          title={l(`لغو دعوت ${modal.inv.fullName}`, `Revoke the invitation for ${modal.inv.fullName}`)}
          text={l('لینک دعوت دیگر کار نمی‌کند. بعداً می‌توانید دوباره دعوت بفرستید.', 'The invitation link stops working. You can invite again later.')}
          confirmLabel={l('لغو دعوت', 'Revoke')}
          danger
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await api(`/admin/staff/invitations/${modal.inv.id}/revoke`, { method: 'POST', body: {} });
            await done({ tone: 'success', text: l('دعوت لغو شد.', 'Invitation revoked.') });
          }}
        />
      ) : null}

      {modal?.type === 'resend' ? (
        <CodeDialog
          title={l(`ارسال دوبارهٔ دعوت ${modal.inv.fullName}`, `Resend the invitation for ${modal.inv.fullName}`)}
          text={l('این دعوت نقش مالک دارد؛ با کد همین لحظهٔ Authenticator خودتان تأیید کنید.', 'This invitation grants the owner role; confirm with your current authenticator code.')}
          confirmLabel={l('ارسال دوباره', 'Resend')}
          onClose={() => setModal(null)}
          onConfirm={async (code) => { const n = await resend(modal.inv, code); await done(n); }}
        />
      ) : null}

      {modal?.type === 'mfa' ? (
        <CodeDialog
          title={l(`ریست Authenticator برای ${modal.member.fullName ?? ''}`, `Reset the authenticator of ${modal.member.fullName ?? ''}`)}
          text={l('برای وقتی که گوشی‌اش را عوض کرده است. کد فعلی و کدهای بازیابی او باطل و همهٔ نشست‌هایش بسته می‌شود؛ در ورود بعدی دوباره Authenticator را ثبت می‌کند. با کد همین لحظهٔ Authenticator خودتان تأیید کنید.', 'For a new phone. Their current codes and recovery codes stop working and their sessions end; they set the authenticator up again at the next sign-in. Confirm with your own current code.')}
          confirmLabel={l('ریست شود', 'Reset')}
          danger
          onClose={() => setModal(null)}
          onConfirm={async (code) => {
            await api(`/admin/staff/${modal.member.id}/mfa-reset`, { method: 'POST', body: { confirmCode: code } });
            await done({ tone: 'success', text: l('Authenticator ریست شد؛ در ورود بعدی دوباره ثبت می‌شود.', 'Authenticator reset; it is set up again at the next sign-in.') });
          }}
        />
      ) : null}

      {modal?.type === 'erase' ? (
        <CodeDialog
          title={modal.person.kind === 'staff' ? l(`حذف کارمند ${nameOf(modal.person)}`, `Delete ${nameOf(modal.person)}`) : l(`حذف کامل دعوت ${nameOf(modal.person)}`, `Erase the invitation for ${nameOf(modal.person)}`)}
          text={l('مطمئن هستید؟ نام، ایمیل، شماره، رمز، دسترسی‌ها و دعوت‌های این شخص پاک می‌شود و در تاریخچه به‌جای نام «حذف‌شده» می‌آید. کارهای ثبت‌شده (سفارش‌ها، پیام‌ها) بدون نام می‌مانند. این کار برگشت‌پذیر نیست. با کد همین لحظهٔ Authenticator خودتان تأیید کنید.', 'Are you sure? Their name, e-mail, phone, password, access and invitations are removed and the history shows "deleted" instead of the name. Recorded work stays without a name. This cannot be undone. Confirm with your current authenticator code.')}
          confirmLabel={l('حذف برای همیشه', 'Delete permanently')}
          danger
          onClose={() => setModal(null)}
          onConfirm={async (code) => {
            const p = modal.person;
            await api(p.kind === 'staff' ? `/admin/staff/${p.member.id}/erase` : `/admin/staff/invitations/${p.inv.id}/erase`, { method: 'POST', body: { confirmCode: code } });
            await done({ tone: 'success', text: l('به‌طور کامل حذف شد؛ نام و ایمیل در هیچ جای سایت نمانده است.', 'Erased; the name and e-mail no longer appear anywhere on the site.') });
          }}
        />
      ) : null}
    </div>
  );
}

/** Field name → message, from the server's validation answer and the known error codes. */
function useFormErrors() {
  const t = useTranslations();
  const l = useL();
  return (e: unknown): { fields: Record<string, string>; general: string | null } => {
    const fields: Record<string, string> = {};
    if (!isApiError(e)) return { fields, general: errorText(t, e) };
    if (e.code === 'EMAIL_IN_USE') fields.email = l('این ایمیل برای حساب دیگری ثبت شده است.', 'This e-mail already belongs to an account.');
    else if (e.code === 'INVITATION_PENDING') fields.email = l('برای این ایمیل یک دعوت باز دیگر هست؛ آن را ویرایش یا لغو کنید.', 'Another open invitation uses this e-mail; edit or revoke it.');
    else if (e.code === 'MFA_CODE_INVALID' || e.code === 'MFA_CONFIRMATION_REQUIRED') fields.code = errorText(t, e);
    for (const f of e.fields) {
      const key = f.path.split('.')[0] ?? f.path;
      fields[key] ??= f.message === 'INVALID_PHONE' ? l('شماره معتبر نیست؛ فقط رقم، +، فاصله و خط تیره.', 'Not a valid number: digits, +, spaces and dashes.') : key === 'email' ? l('ایمیل معتبر نیست.', 'Not a valid e-mail.') : key === 'fullName' ? l('نام دست‌کم ۲ حرف.', 'At least 2 letters.') : key === 'roleIds' ? l('دست‌کم یک نقش انتخاب کنید.', 'Choose at least one role.') : l('مقدار معتبر نیست.', 'Not a valid value.');
    }
    return { fields, general: Object.keys(fields).length ? null : errorText(t, e) };
  };
}

/** Invite someone, or edit an invitation / a staff member, in a dialog. */
function PersonDialog({ person, roles, onClose, onSaved }: { person: Person | null; roles: RoleRow[]; onClose: () => void; onSaved: (n: Notice) => void }) {
  const t = useTranslations();
  const l = useL();
  const toErrors = useFormErrors();
  const isStaff = person?.kind === 'staff';
  const initial = person?.kind === 'staff'
    ? { email: person.member.email ?? '', fullName: person.member.fullName ?? '', phone: person.member.phone ?? '', roleIds: person.member.roles.map((r) => r.id) }
    : person?.kind === 'invitation'
      ? { email: person.inv.email, fullName: person.inv.fullName, phone: person.inv.phone ?? '', roleIds: person.inv.roles.map((r) => r.id) }
      : { email: '', fullName: '', phone: '', roleIds: [] as string[] };
  const [f, setF] = useState(initial);
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ownerIds = roles.filter((r) => r.isOwner).map((r) => r.id);
  // A fresh authenticator code is needed only when the owner role is added.
  const addsOwner = f.roleIds.some((id) => ownerIds.includes(id)) && !initial.roleIds.some((id) => ownerIds.includes(id));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!isStaff && !EMAIL.test(f.email.trim())) e.email = l('ایمیل معتبر نیست؛ مثل name@example.com', 'Not a valid e-mail, e.g. name@example.com');
    if (f.fullName.trim().length < 2) e.fullName = l('نام دست‌کم ۲ حرف.', 'At least 2 letters.');
    if (f.phone.trim() && !PHONE.test(f.phone.trim())) e.phone = l('شماره معتبر نیست؛ مثل ۰۹۱۲۱۲۳۴۵۶۷ یا +98 912 123 4567', 'Not a valid number, e.g. +98 912 123 4567');
    if (!f.roleIds.length) e.roleIds = l('دست‌کم یک نقش انتخاب کنید.', 'Choose at least one role.');
    if (addsOwner && !CODE.test(code.trim())) e.code = l('کد ۶ رقمی Authenticator خودتان را وارد کنید.', 'Enter your 6-digit authenticator code.');
    return e;
  };

  const save = async () => {
    setGeneral(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const confirm = addsOwner ? { confirmCode: code.trim() } : {};
    try {
      if (!person) {
        const res = await api<{ acceptUrl: string; emailQueued: boolean }>('/admin/staff/invitations', { method: 'POST', body: { email: f.email.trim(), fullName: f.fullName.trim(), phone: f.phone.trim(), roleIds: f.roleIds, ...confirm } });
        onSaved(res.emailQueued
          ? { tone: 'success', text: l(`دعوت‌نامه برای ${f.email.trim()} فرستاده شد؛ وضعیت را در جدول ببینید.`, `The invitation for ${f.email.trim()} is on its way; follow it in the table.`), link: res.acceptUrl }
          : { tone: 'warning', text: l('ایمیل سایت تنظیم نشده است؛ این لینک یک‌بارمصرف را خودتان از راهی امن بفرستید.', 'E-mail is not configured; share this one-time link through a trusted channel.'), link: res.acceptUrl });
      } else if (person.kind === 'invitation') {
        const res = await api<{ emailChanged: boolean; acceptUrl?: string; emailQueued?: boolean }>(`/admin/staff/invitations/${person.inv.id}`, { method: 'PATCH', body: { email: f.email.trim(), fullName: f.fullName.trim(), phone: f.phone.trim(), roleIds: f.roleIds, ...confirm } });
        onSaved(res.emailChanged
          ? { tone: 'success', text: l('دعوت ویرایش شد. چون ایمیل عوض شد، لینک قبلی باطل شد و دعوت‌نامهٔ تازه به نشانی جدید فرستاده شد.', 'Invitation updated. Because the e-mail changed, the old link no longer works and a new invitation went to the new address.'), ...(res.acceptUrl ? { link: res.acceptUrl } : {}) }
          : { tone: 'success', text: l('دعوت ویرایش شد.', 'Invitation updated.') });
      } else {
        const m = person.member;
        const rolesChanged = [...f.roleIds].sort().join() !== [...initial.roleIds].sort().join();
        await api(`/admin/staff/${m.id}`, { method: 'PATCH', body: { fullName: f.fullName.trim(), phone: f.phone.trim(), ...(rolesChanged ? { roleIds: f.roleIds } : {}), ...confirm } });
        onSaved({ tone: 'success', text: rolesChanged ? l('ذخیره شد. چون نقش تغییر کرد، او باید دوباره وارد شود.', 'Saved. Because the roles changed, they need to sign in again.') : l('ذخیره شد.', 'Saved.') });
      }
    } catch (err) {
      const r = toErrors(err);
      setErrors(r.fields);
      setGeneral(r.general);
    } finally {
      setBusy(false);
    }
  };

  const title = !person ? t('admin.invite') : person.kind === 'staff' ? l('ویرایش کارمند', 'Edit staff member') : l('ویرایش دعوت', 'Edit invitation');
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={title} closeLabel={l('بستن', 'Close')}
      {...(person?.kind === 'invitation' ? { description: l('اگر ایمیل را عوض کنید، لینک قبلی باطل و دعوت‌نامهٔ تازه به نشانی جدید فرستاده می‌شود.', 'If you change the e-mail, the old link stops working and a new invitation goes to the new address.') } : {})}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); void save(); }} className="flex flex-col gap-4">
        {general ? <Alert tone="danger" title={general} /> : null}
        {isStaff
          ? <p className="text-sm text-steel">{l('ایمیل ورود: ', 'Sign-in e-mail: ')}<Ltr>{f.email}</Ltr></p>
          : (
            <Field id="pd-email" label={t('auth.email')} required {...(errors.email ? { error: errors.email } : {})}>
              <Input id="pd-email" type="email" dir="ltr" autoComplete="off" invalid={!!errors.email} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </Field>
          )}
        <Field id="pd-name" label={t('auth.fullName')} required {...(errors.fullName ? { error: errors.fullName } : {})}>
          <Input id="pd-name" autoComplete="off" invalid={!!errors.fullName} value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
        </Field>
        <Field id="pd-phone" label={l('شماره تماس', 'Phone')} optionalLabel={t('common.optional')} hint={l('برای تماس همکاران؛ برای ورود استفاده نمی‌شود.', 'For colleagues to call; not used to sign in.')} {...(errors.phone ? { error: errors.phone } : {})}>
          <Input id="pd-phone" type="tel" dir="ltr" inputMode="tel" autoComplete="off" invalid={!!errors.phone} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <fieldset aria-describedby={errors.roleIds ? 'pd-roles-error' : undefined}>
          <legend className="mb-1 text-sm font-semibold">{t('admin.roles')} <span className="text-danger">*</span></legend>
          <div className="grid gap-x-4 sm:grid-cols-2">
            {roles.map((r) => (
              <Checkbox key={r.id} id={`pd-role-${r.id}`} label={l(r.nameFa, r.nameEn)} checked={f.roleIds.includes(r.id)}
                onChange={(e) => setF({ ...f, roleIds: e.target.checked ? [...f.roleIds, r.id] : f.roleIds.filter((x) => x !== r.id) })} />
            ))}
          </div>
          {errors.roleIds ? <p id="pd-roles-error" role="alert" className="mt-1 text-sm text-danger">{errors.roleIds}</p> : null}
        </fieldset>
        {addsOwner ? (
          <Field id="pd-code" label={t('admin.ownerConfirmCode')} hint={t('admin.ownerConfirmHint')} required {...(errors.code ? { error: errors.code } : {})}>
            <Input id="pd-code" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} invalid={!!errors.code} value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
        ) : null}
        <div className="flex flex-wrap gap-2 border-t border-line-soft pt-4">
          <Button type="submit" loading={busy}>{person ? l('ذخیره', 'Save') : t('admin.invite')}</Button>
          <Button variant="ghost" onClick={onClose}>{l('انصراف', 'Cancel')}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function ConfirmDialog({ title, text, confirmLabel, danger = false, onClose, onConfirm }: { title: string; text: string; confirmLabel: string; danger?: boolean; onClose: () => void; onConfirm: () => Promise<void> }) {
  const t = useTranslations();
  const l = useL();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={title} description={text} closeLabel={l('بستن', 'Close')}>
      {error ? <Alert tone="danger" title={error} className="mb-3" /> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={async () => { setBusy(true); setError(null); try { await onConfirm(); } catch (e) { setError(errorText(t, e)); } finally { setBusy(false); } }}>{confirmLabel}</Button>
        <Button variant="ghost" onClick={onClose}>{l('انصراف', 'Cancel')}</Button>
      </div>
    </Dialog>
  );
}

/** A confirmation that also needs the acting owner's current authenticator code. */
function CodeDialog({ title, text, confirmLabel, danger = false, onClose, onConfirm }: { title: string; text: string; confirmLabel: string; danger?: boolean; onClose: () => void; onConfirm: (code: string) => Promise<void> }) {
  const t = useTranslations();
  const l = useL();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = CODE.test(code.trim());
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={title} description={text} closeLabel={l('بستن', 'Close')}>
      <form noValidate onSubmit={async (e) => { e.preventDefault(); if (!valid) return; setBusy(true); setError(null); try { await onConfirm(code.trim()); } catch (err) { setError(errorText(t, err)); } finally { setBusy(false); } }} className="flex flex-col gap-4">
        <Field id="cd-code" label={t('admin.ownerConfirmCode')} required {...(error ? { error } : {})}>
          <Input id="cd-code" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} invalid={!!error} value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant={danger ? 'danger' : 'primary'} loading={busy} disabled={!valid}>{confirmLabel}</Button>
          <Button variant="ghost" onClick={onClose}>{l('انصراف', 'Cancel')}</Button>
        </div>
      </form>
    </Dialog>
  );
}
