'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { MeView } from '@hedax/contracts';
import { Async } from '@/components/ui/async';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select } from '@/components/ui/field';
import { Alert, Badge, EmptyState, PageHeader, TableScroll, td, th } from '@/components/ui/misc';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';
import { useApi } from '@/lib/use-api';
import { ImageField } from './content/kit';
import { useL } from './shell';

type Kind = 'categories' | 'vehicle-brands' | 'manufacturer-brands';
interface Row { id: string; code?: string; nameFa: string; nameEn: string | null; active: boolean; parentId?: string | null; sortOrder?: number; logoUrl?: string | null; isFeatured?: boolean; countryCode?: string | null }
interface Data { categories: Row[]; vehicleBrands: Row[]; manufacturers: Row[] }
const key: Record<Kind, keyof Data> = { categories: 'categories', 'vehicle-brands': 'vehicleBrands', 'manufacturer-brands': 'manufacturers' };

export function TaxonomyPage() {
  const l = useL();
  const state = useApi<Data>('/admin/taxonomy');
  const me = useApi<MeView>('/me');
  const canWrite = me.data?.isOwner || me.data?.permissions.includes('products.write');
  const [kind, setKind] = useState<Kind>('categories');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<{ row: Row | null; remove: boolean } | null>(null);
  const [notice, setNotice] = useState('');
  const labels = { categories: l('دستهٔ قطعه', 'Part categories'), 'vehicle-brands': l('برند خودرو', 'Vehicle makes'), 'manufacturer-brands': l('سازندهٔ قطعه', 'Part manufacturers') };
  return <><PageHeader title={l('دسته‌ها و برندها', 'Categories & brands')} description={l('برند خودرو با سازندهٔ قطعه متفاوت است. مورد استفاده‌شده را غیرفعال کنید تا ارتباط محصولات حفظ شود؛ مورد بدون استفاده قابل حذف است.', 'Vehicle makes differ from part manufacturers. Deactivate used entries to retain their links; unused entries can be deleted.')} actions={canWrite ? <Button onClick={() => setModal({ row: null, remove: false })}>{l('افزودن', 'Add')} {labels[kind]}</Button> : undefined} />
    {notice ? <Alert tone="success" title={notice} className="mb-4" /> : null}
    <div className="mb-4 grid gap-3 sm:grid-cols-2"><Field id="tax-kind" label={l('نوع اطلاعات', 'Type')}><Select id="tax-kind" value={kind} onChange={e => { setKind(e.target.value as Kind); setQuery(''); setNotice(''); }}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field><Field id="tax-search" label={l('جست‌وجوی نام یا کد', 'Search name or code')}><Input id="tax-search" type="search" value={query} onChange={e => setQuery(e.target.value)} /></Field></div>
    <Async state={state}>{data => {
      const rows = data[key[kind]].filter(r => [r.nameFa, r.nameEn, r.code].some(v => v?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
      return <>{rows.length ? <TableScroll caption={labels[kind]}><thead><tr><th className={th}>{l('نام', 'Name')}</th><th className={th}>{l('کد', 'Code')}</th><th className={th}>{l('وضعیت', 'Status')}</th><th className={th}>{l('مدیریت', 'Manage')}</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td className={td}><p className="font-semibold">{l(row.nameFa, row.nameEn || row.nameFa)}</p>{row.nameEn ? <p className="text-xs text-steel" dir="ltr">{row.nameEn}</p> : null}{row.parentId ? <p className="text-xs text-steel">{l('زیرمجموعهٔ', 'Under')} {data.categories.find(c => c.id === row.parentId)?.nameFa ?? '—'}</p> : null}</td><td className={td}><span dir="ltr">{row.code ?? '—'}</span></td><td className={td}><Badge tone={row.active ? 'success' : 'neutral'}>{row.active ? l('فعال', 'Active') : l('غیرفعال', 'Inactive')}</Badge></td><td className={td}>{canWrite ? <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setModal({ row, remove: false })}>{l('ویرایش', 'Edit')}</Button><Button variant="ghost" onClick={() => setModal({ row, remove: true })}>{l('حذف', 'Delete')}</Button></div> : l('فقط مشاهده', 'Read only')}</td></tr>)}</tbody></TableScroll> : <EmptyState title={l('موردی پیدا نشد.', 'No entries found.')} />}
        {modal ? <TaxonomyDialog key={`${kind}:${modal.row?.id ?? 'new'}:${modal.remove}`} kind={kind} row={modal.row} remove={modal.remove} categories={data.categories} close={() => setModal(null)} done={async () => { setModal(null); setNotice(l('تغییرات ثبت شد.', 'Changes saved.')); await state.reload(); }} /> : null}</>;
    }}</Async></>;
}

function TaxonomyDialog({ kind, row, remove, categories, close, done }: { kind: Kind; row: Row | null; remove: boolean; categories: Row[]; close: () => void; done: () => Promise<void> }) {
  const l = useL(); const t = useTranslations();
  const [value, setValue] = useState({ code: row?.code ?? '', nameFa: row?.nameFa ?? '', nameEn: row?.nameEn ?? '', parentId: row?.parentId ?? '', active: row?.active ?? true, logoUrl: row?.logoUrl ?? '', isFeatured: row?.isFeatured ?? false, countryCode: row?.countryCode ?? '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const field = <K extends keyof typeof value>(name: K, next: typeof value[K]) => setValue(v => ({ ...v, [name]: next }));
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (remove && row) await api(`/admin/taxonomy/${kind}/${row.id}`, { method: 'DELETE' });
      else {
        const common = { nameFa: value.nameFa.trim(), nameEn: value.nameEn.trim() || null, active: value.active };
        const body = kind === 'manufacturer-brands' ? { ...common, countryCode: value.countryCode.trim() || null } : { ...common, code: value.code.trim().toUpperCase(), parentId: value.parentId || null, sortOrder: row?.sortOrder ?? 0, ...(kind === 'vehicle-brands' ? { logoUrl: value.logoUrl, isFeatured: value.isFeatured } : {}) };
        await api(`/admin/${kind}${row ? `/${row.id}` : ''}`, { method: row ? 'PUT' : 'POST', body });
      }
      await done();
    } catch (e) { setError(errorText(t, e)); } finally { setBusy(false); }
  };
  // Exclude descendants as well as self; the API independently enforces this rule.
  const descendant = (id: string) => { const seen = new Set<string>(); let current: string | null | undefined = id; while (current) { if (current === row?.id || seen.has(current)) return true; seen.add(current); current = categories.find(c => c.id === current)?.parentId; } return false; };
  return <Dialog open onOpenChange={open => { if (!open && !busy) close(); }} closeLabel={l('بستن', 'Close')} title={remove ? l('حذف مورد بدون استفاده', 'Delete unused entry') : row ? l('ویرایش اطلاعات پایه', 'Edit setup entry') : l('افزودن اطلاعات پایه', 'Add setup entry')}>
    <form onSubmit={submit} className="space-y-4">{remove ? <p className="leading-8">{l(`«${row?.nameFa}» حذف شود؟ اگر به قطعه، خودرو، کاتالوگ یا سوابق ورود فایل متصل باشد، حذف انجام نمی‌شود؛ به‌جای آن از ویرایش، غیرفعالش کنید.`, `Delete “${row?.nameEn || row?.nameFa}”? Entries linked to parts, vehicles, catalogs or import history cannot be deleted; use Edit to deactivate them.`)}</p> : <>
      <Field id="tax-name-fa" label={l('نام فارسی', 'Persian name')} required><Input id="tax-name-fa" value={value.nameFa} minLength={2} maxLength={kind === 'vehicle-brands' ? 80 : 120} required onChange={e => field('nameFa', e.target.value)} /></Field>
      <Field id="tax-name-en" label={l('نام انگلیسی', 'English name')}><Input id="tax-name-en" dir="ltr" value={value.nameEn} maxLength={kind === 'vehicle-brands' ? 80 : 120} onChange={e => field('nameEn', e.target.value)} /></Field>
      {kind !== 'manufacturer-brands' ? <Field id="tax-code" label={l('کد ثابت', 'Stable code')} hint={l('مثال: BRAKES؛ حروف انگلیسی، عدد و زیرخط. تغییر کد روی فایل‌های اکسل بعدی اثر دارد.', 'Example: BRAKES; Latin letters, digits and underscores. Changing codes affects later spreadsheets.')} required><Input id="tax-code" dir="ltr" value={value.code} pattern="[A-Za-z0-9_]{2,40}" required onChange={e => field('code', e.target.value)} /></Field> : <Field id="tax-country" label={l('کد کشور (مثلاً DE)', 'Country code (e.g. DE)')}><Input id="tax-country" dir="ltr" value={value.countryCode} pattern="[A-Za-z]{2}" maxLength={2} onChange={e => field('countryCode', e.target.value.toUpperCase())} /></Field>}
      {kind === 'categories' ? <Field id="tax-parent" label={l('دستهٔ بالاتر', 'Parent category')}><Select id="tax-parent" value={value.parentId} onChange={e => field('parentId', e.target.value)}><option value="">{l('بدون دستهٔ بالاتر', 'No parent')}</option>{categories.filter(c => !descendant(c.id)).map(c => <option key={c.id} value={c.id}>{c.nameFa}</option>)}</Select></Field> : null}
      {kind === 'vehicle-brands' ? <><ImageField id="tax-logo" purpose="logo" label={l('لوگوی برند خودرو', 'Vehicle make logo')} value={value.logoUrl} onChange={v => field('logoUrl', v)} /><Checkbox id="tax-featured" label={l('نمایش ویژه در صفحهٔ اصلی', 'Featured on home page')} checked={value.isFeatured} onChange={e => field('isFeatured', e.target.checked)} /></> : null}
      <Checkbox id="tax-active" label={l('فعال و قابل انتخاب', 'Active and selectable')} checked={value.active} onChange={e => field('active', e.target.checked)} />
    </>}{error ? <Alert tone="danger" title={error} /> : null}<div className="flex gap-2"><Button type="submit" loading={busy} variant={remove ? 'danger' : 'primary'}>{remove ? l('حذف', 'Delete') : l('ذخیره', 'Save')}</Button><Button variant="secondary" disabled={busy} onClick={close}>{l('انصراف', 'Cancel')}</Button></div></form>
  </Dialog>;
}
