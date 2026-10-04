'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Async } from '@/components/ui/async';
import { Checkbox, Field, Input } from '@/components/ui/field';
import { DateTime, Num } from '@/components/ui/format';
import { Alert, Badge, EmptyState, Ltr, PageHeader, Section, StatusBadge, TableScroll, td, th } from '@/components/ui/misc';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';
import { useApi } from '@/lib/use-api';
import { useCodeLabel, useL } from './shell';

interface CustomerRow { id: string; fullName: string | null; mobile: string | null; status: string; customerType: string; groupStatus: string; requestedType: string | null; businessName: string | null; group: string | null; orders: number; requests: number; createdAt: string }

export function CustomersPage() {
  const t = useTranslations();
  const l = useL();
  const [pending, setPending] = useState(false);
  const state = useApi<CustomerRow[]>(`/admin/customers${pending ? '?pending=1' : ''}`);
  const [error, setError] = useState<string | null>(null);
  const decide = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    setError(null);
    try { await api(`/admin/customers/${id}/group-decision`, { method: 'POST', body: { decision } }); await state.reload(); } catch (e) { setError(errorText(t, e)); }
  };
  return (
    <>
      <PageHeader title={t('admin.customers')} description={l('انتخاب «عمده‌فروش هستم» به‌تنهایی قیمت خصوصی فعال نمی‌کند؛ فقط تأیید شما.', 'Self-declared wholesale grants nothing; only your approval does.')} />
      <Checkbox id="cu-pending" label={t('account.groupStatus_PENDING')} checked={pending} onChange={(e) => setPending(e.target.checked)} className="mb-3" />
      {error ? <Alert tone="danger" title={error} /> : null}
      <Async state={state}>
        {(rows) => rows.length ? (
          <TableScroll caption={t('admin.customers')}>
            <thead><tr><th className={th}>{t('auth.fullName')}</th><th className={th}>{t('auth.mobile')}</th><th className={th}>{t('account.customerType')}</th><th className={th}>{l('گروه', 'Group')}</th><th className={th}>{t('account.orders')}</th><th className={th} /></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className={td}>{c.fullName ?? '—'}{c.businessName ? <span className="block text-xs text-steel">{c.businessName}</span> : null}</td>
                  <td className={td}><Ltr>{c.mobile ?? '—'}</Ltr></td>
                  <td className={td}>{t(`account.type_${c.customerType}` as never)}</td>
                  <td className={td}>{c.groupStatus === 'NONE' ? '—' : <Badge tone={c.groupStatus === 'APPROVED' ? 'success' : c.groupStatus === 'PENDING' ? 'warning' : 'danger'}>{t(`account.groupStatus_${c.groupStatus}` as never)}{c.requestedType ? ` (${t(`account.type_${c.requestedType}` as never)})` : ''}</Badge>}</td>
                  <td className={td}><Num value={c.orders} /> / <Num value={c.requests} /></td>
                  <td className={td}>
                    {c.groupStatus === 'PENDING' ? (
                      <div className="flex gap-1">
                        <Button size="sm" onClick={() => void decide(c.id, 'APPROVED')}>{t('admin.approve')}</Button>
                        <Button size="sm" variant="ghost" onClick={() => void decide(c.id, 'REJECTED')}>{t('admin.reject')}</Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        ) : <EmptyState title={t('common.results', { count: 0 })} />}
      </Async>
    </>
  );
}

interface RoleRow { id: string; key: string; nameFa: string; nameEn: string; isSystem: boolean; isOwner: boolean; requiresMfa: boolean; permissions: string[]; members: number }
interface StaffData { staff: Array<{ id: string; email: string | null; fullName: string | null; status: string; mfaEnabled: boolean; lastLoginAt: string | null; roles: Array<{ id: string; key: string; nameFa: string; nameEn: string }> }>; pendingInvitations: Array<{ id: string; email: string; fullName: string; expiresAt: string }> }

export function StaffPage() {
  const t = useTranslations();
  const l = useL();
  const state = useApi<StaffData>('/admin/staff');
  const roles = useApi<RoleRow[]>('/admin/roles');
  const [invite, setInvite] = useState({ email: '', fullName: '', roleIds: [] as string[] });
  const [confirmCode, setConfirmCode] = useState('');
  // Granting the owner role is confirmed with a current authenticator code (spec §13).
  const grantsOwner = (roles.data ?? []).some((r) => r.isOwner && invite.roleIds.includes(r.id));
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fail = (e: unknown) => setError(errorText(t, e));
  const send = async () => {
    setError(null);
    try {
      const res = await api<{ acceptUrl: string }>('/admin/staff/invitations', { method: 'POST', body: { ...invite, ...(grantsOwner ? { confirmCode: confirmCode.trim() } : {}) } });
      setLink(res.acceptUrl);
      setInvite({ email: '', fullName: '', roleIds: [] });
      setConfirmCode('');
      await state.reload();
    } catch (e) { fail(e); }
  };
  const toggleSuspend = async (id: string, suspended: boolean) => {
    setError(null);
    try { await api(`/admin/staff/${id}`, { method: 'PATCH', body: { suspended, reason: suspended ? 'suspended by admin' : 'reactivated' } }); await state.reload(); } catch (e) { fail(e); }
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('admin.staff')} description={l('تغییر نقش یا تعلیق، همهٔ نشست‌ها و اتصال‌های زندهٔ آن کارمند را فوراً قطع می‌کند. آخرین مالک قابل حذف یا تعلیق نیست.', 'Role changes or suspension end all sessions and live connections immediately. The last owner cannot be removed or suspended.')} />
      {error ? <Alert tone="danger" title={error} /> : null}
      <Async state={state}>
        {(data) => (
          <TableScroll caption={t('admin.staff')}>
            <thead><tr><th className={th}>{t('auth.fullName')}</th><th className={th}>{t('auth.email')}</th><th className={th}>{t('admin.roles')}</th><th className={th}>MFA</th><th className={th}>{t('order.status')}</th><th className={th} /></tr></thead>
            <tbody>
              {data.staff.map((s) => (
                <tr key={s.id}>
                  <td className={td}>{s.fullName}<span className="block text-xs text-steel"><DateTime iso={s.lastLoginAt} /></span></td>
                  <td className={td}><Ltr>{s.email}</Ltr></td>
                  <td className={td}>{s.roles.map((r) => l(r.nameFa, r.nameEn)).join('، ')}</td>
                  <td className={td}>{s.mfaEnabled ? <Badge tone="success">✓</Badge> : <Badge tone="warning">—</Badge>}</td>
                  <td className={td}><StatusBadge status={s.status} label={t(`status.${s.status}` as never)} /></td>
                  <td className={td}><Button size="sm" variant="ghost" onClick={() => void toggleSuspend(s.id, s.status === 'ACTIVE')}>{s.status === 'ACTIVE' ? t('admin.suspend') : t('admin.reactivate')}</Button></td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        )}
      </Async>
      <Section title={t('admin.invite')} id="invite">
        <div className="grid gap-3 md:grid-cols-2">
          <Field id="inv-email" label={t('auth.email')}><Input id="inv-email" type="email" dir="ltr" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} /></Field>
          <Field id="inv-name" label={t('auth.fullName')}><Input id="inv-name" value={invite.fullName} onChange={(e) => setInvite({ ...invite, fullName: e.target.value })} /></Field>
        </div>
        <fieldset className="mt-3">
          <legend className="text-sm font-semibold">{t('admin.roles')}</legend>
          <div className="flex flex-wrap gap-x-4">
            {(roles.data ?? []).map((r) => (
              <Checkbox key={r.id} id={`inv-role-${r.id}`} label={l(r.nameFa, r.nameEn)} checked={invite.roleIds.includes(r.id)}
                onChange={(e) => setInvite({ ...invite, roleIds: e.target.checked ? [...invite.roleIds, r.id] : invite.roleIds.filter((x) => x !== r.id) })} />
            ))}
          </div>
        </fieldset>
        {grantsOwner ? (
          <Field id="inv-confirm" label={t('admin.ownerConfirmCode')} hint={t('admin.ownerConfirmHint')} className="mt-3 max-w-xs" required>
            <Input id="inv-confirm" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={confirmCode} onChange={(e) => setConfirmCode(e.target.value)} />
          </Field>
        ) : null}
        <Button className="mt-3" onClick={() => void send()} disabled={!invite.email || !invite.fullName || !invite.roleIds.length || (grantsOwner && !/^[0-9]{6}$/.test(confirmCode.trim()))}>{t('admin.invite')}</Button>
        {link ? <Alert tone="warning" className="mt-3" title={t('admin.inviteLink')}><p className="break-all"><Ltr>{link}</Ltr></p></Alert> : null}
      </Section>
    </div>
  );
}

/** A permission in words (the technical key stays visible, small and LTR, for support). */
function PermissionLabel({ permission }: { permission: string }) {
  const label = useCodeLabel();
  const text = label('perm', permission.replaceAll('.', '_'));
  return <>{text === permission.replaceAll('.', '_') ? <Ltr>{permission}</Ltr> : <>{text} <span className="text-xs text-steel"><Ltr>{permission}</Ltr></span></>}</>;
}

export function RolesPage() {
  const t = useTranslations();
  const l = useL();
  const roles = useApi<RoleRow[]>('/admin/roles');
  const perms = useApi<Array<{ key: string; description: string }>>('/admin/permissions');
  // The API lists permissions grouped by area (products, stock, sourcing, orders, money, settings…).
  const position = new Map((perms.data ?? []).map((p, i) => [p.key, i]));
  const grouped = (keys: string[]) => [...keys].sort((a, b) => (position.get(a) ?? keys.length) - (position.get(b) ?? keys.length));
  const [draft, setDraft] = useState({ key: '', nameFa: '', nameEn: '', permissions: [] as string[], requiresMfa: false });
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    setError(null);
    try { await api('/admin/roles', { method: 'POST', body: draft }); setDraft({ key: '', nameFa: '', nameEn: '', permissions: [], requiresMfa: false }); await roles.reload(); } catch (e) { setError(errorText(t, e)); }
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('admin.roles')} description={l('هیچ‌کس نمی‌تواند مجوزی بیش از مجوزهای خودش اعطا کند.', 'Nobody can grant permissions they do not hold themselves.')} />
      <Async state={roles}>
        {(rows) => (
          <div className="grid gap-4 lg:grid-cols-2">
            {rows.map((r) => (
              <Section key={r.id} id={`role-${r.id}`} title={<>{l(r.nameFa, r.nameEn)} {r.isOwner ? <Badge tone="info">{l('مالک', 'Owner')}</Badge> : null} {r.requiresMfa ? <Badge>MFA</Badge> : null}</>}>
                <p className="mb-2 text-sm text-steel"><Num value={r.members} /> {l('عضو', 'members')}</p>
                <ul className="flex flex-col gap-1 text-sm">{grouped(r.permissions).map((p) => <li key={p}><PermissionLabel permission={p} /></li>)}</ul>
              </Section>
            ))}
          </div>
        )}
      </Async>
      <Section title={l('نقش جدید', 'New role')} id="role-new">
        <div className="grid gap-3 md:grid-cols-3">
          <Field id="rl-key" label={l('کلید', 'Key')} hint="a-z, 0-9, _"><Input id="rl-key" dir="ltr" value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value })} /></Field>
          <Field id="rl-fa" label={`${t('admin.name')} (فارسی)`}><Input id="rl-fa" value={draft.nameFa} onChange={(e) => setDraft({ ...draft, nameFa: e.target.value })} /></Field>
          <Field id="rl-en" label={`${t('admin.name')} (English)`}><Input id="rl-en" dir="ltr" value={draft.nameEn} onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })} /></Field>
        </div>
        <Checkbox id="rl-mfa" label={l('الزام تأیید دومرحله‌ای', 'Require MFA')} checked={draft.requiresMfa} onChange={(e) => setDraft({ ...draft, requiresMfa: e.target.checked })} />
        <fieldset className="mt-2">
          <legend className="text-sm font-semibold">{l('مجوزها', 'Permissions')}</legend>
          <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
            {(perms.data ?? []).map((p) => (
              <Checkbox key={p.key} id={`rl-p-${p.key}`} label={<PermissionLabel permission={p.key} />} checked={draft.permissions.includes(p.key)}
                onChange={(e) => setDraft({ ...draft, permissions: e.target.checked ? [...draft.permissions, p.key] : draft.permissions.filter((x) => x !== p.key) })} />
            ))}
          </div>
        </fieldset>
        {error ? <Alert tone="danger" className="mt-3" title={error} /> : null}
        <Button className="mt-3" onClick={() => void create()} disabled={!draft.key || !draft.nameFa || !draft.nameEn}>{t('common.add')}</Button>
      </Section>
    </div>
  );
}
