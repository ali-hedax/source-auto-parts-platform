'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Async } from '@/components/ui/async';
import { Checkbox, Field, Input } from '@/components/ui/field';
import { Num } from '@/components/ui/format';
import { Alert, Badge, EmptyState, Ltr, PageHeader, Section, TableScroll, td, th } from '@/components/ui/misc';
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
function PermissionLabel({ permission }: { permission: string }) {
  const label = useCodeLabel();
  const text = label('perm', permission.replaceAll('.', '_'));
  return <>{text === permission.replaceAll('.', '_') ? <Ltr>{permission}</Ltr> : <>{text} <span className="text-xs text-steel [overflow-wrap:anywhere]"><Ltr>{permission}</Ltr></span></>}</>;
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
