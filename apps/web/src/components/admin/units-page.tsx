'use client';

import type { UnitView } from '@hedax/contracts';
import { formatQuantity } from '@hedax/domain';
import { Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Async } from '@/components/ui/async';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input } from '@/components/ui/field';
import { Num } from '@/components/ui/format';
import { Alert, Badge, EmptyState, PageHeader, TableScroll, td, th } from '@/components/ui/misc';
import { api } from '@/lib/api/client';
import { errorText, isApiError } from '@/lib/api/errors';
import { typedNumber } from '@/lib/numbers';
import { useApi } from '@/lib/use-api';
import { ActionMenu } from './action-menu';
import { useL } from './shell';

type Notice = { tone: 'success' | 'warning'; text: string } | null;

/**
 * Panel → products → units. A unit in use cannot be deleted (only deactivated) and keeps its step
 * and decimal rule, because stock, carts and orders of its products are counted in its steps.
 */
export function UnitsPage() {
  const t = useTranslations();
  const l = useL();
  const locale = useLocale() as 'fa' | 'en';
  const state = useApi<UnitView[]>('/admin/units');
  const [editing, setEditing] = useState<UnitView | 'new' | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const done = async (n: Notice) => { setEditing(null); setNotice(n); await state.reload(); };
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); await done({ tone: 'success', text: ok }); } catch (e) { setNotice({ tone: 'warning', text: errorText(t, e) }); }
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={l('واحدها', 'Units')}
        description={l('واحد فروش هر محصول (عدد، دست، لیتر …). موجودی، سبد خرید و سفارش طبق قواعد واحد اعتبارسنجی می‌شوند. واحدی که در محصولی استفاده شده حذف نمی‌شود و فقط غیرفعال می‌شود؛ گام و اعشار آن هم ثابت می‌ماند.', 'The sales unit of each product (piece, set, litre …). Stock, carts and orders follow the unit\'s rules. A unit in use cannot be deleted, only deactivated, and keeps its step and decimal rule.')}
        actions={<Button onClick={() => setEditing('new')}><Plus aria-hidden className="size-4" /> {l('افزودن واحد', 'Add unit')}</Button>}
      />
      <div aria-live="polite">{notice ? <Alert tone={notice.tone} title={notice.text} /> : null}</div>
      <Async state={state}>
        {(units) => units.length ? (
          <TableScroll caption={l('واحدها', 'Units')}>
            <thead>
              <tr>
                <th className={th}>{l('نام', 'Name')}</th><th className={th}>{l('اعشار', 'Decimals')}</th><th className={th}>{l('حداقل گام', 'Step')}</th>
                <th className={th}>{l('محصولات', 'Products')}</th><th className={th}>{l('وضعیت', 'Status')}</th><th className={th}><span className="sr-only">{l('عملیات', 'Actions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id}>
                  <td className={td}><span className="font-semibold">{u.name}</span>{u.nameEn ? <span className="block text-xs text-steel">{u.nameEn}</span> : null}</td>
                  <td className={td}>{u.allowDecimal ? l('مجاز', 'Allowed') : l('فقط عدد صحیح', 'Whole numbers only')}</td>
                  <td className={td}><span className="num">{formatQuantity(u.step, locale)}</span></td>
                  <td className={td}><Num value={u.productCount} /></td>
                  <td className={td}>{u.active ? <Badge tone="success">{l('فعال', 'Active')}</Badge> : <Badge tone="neutral">{l('غیرفعال', 'Inactive')}</Badge>}</td>
                  <td className={td}>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setEditing(u)}>{t('common.edit')}</Button>
                      <ActionMenu label={l(`عملیات برای ${u.name}`, `Actions for ${u.name}`)} actions={[
                        { key: 'active', label: u.active ? l('غیرفعال کردن', 'Deactivate') : l('فعال کردن', 'Activate'), onSelect: () => void act(() => api(`/admin/units/${u.id}`, { method: 'PATCH', body: { active: !u.active } }), u.active ? l('واحد غیرفعال شد؛ محصولاتی که آن را دارند بدون تغییر می‌مانند.', 'Unit deactivated; products using it are unchanged.') : l('واحد فعال شد.', 'Unit activated.')) },
                        { key: 'delete', label: l('حذف', 'Delete'), danger: true, disabled: u.productCount > 0, onSelect: () => void act(() => api(`/admin/units/${u.id}`, { method: 'DELETE' }), l('واحد حذف شد.', 'Unit deleted.')) },
                      ]} />
                    </div>
                    {u.productCount > 0 ? <span className="mt-1 block text-xs text-steel">{l('در حال استفاده؛ فقط غیرفعال می‌شود.', 'In use; can only be deactivated.')}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        ) : <EmptyState title={l('هنوز واحدی نیست.', 'No units yet.')} />}
      </Async>
      {editing ? <UnitDialog unit={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(n) => void done(n)} /> : null}
    </div>
  );
}

function UnitDialog({ unit, onClose, onSaved }: { unit: UnitView | null; onClose: () => void; onSaved: (n: Notice) => void }) {
  const t = useTranslations();
  const l = useL();
  const locked = !!unit && unit.productCount > 0;
  const [f, setF] = useState({ name: unit?.name ?? '', nameEn: unit?.nameEn ?? '', allowDecimal: unit?.allowDecimal ?? false, step: unit ? String(unit.step) : '1', active: unit?.active ?? true, sortOrder: String(unit?.sortOrder ?? 0) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const e: Record<string, string> = {};
    const step = typedNumber(f.step);
    if (!f.name.trim()) e.name = l('نام واحد را بنویسید.', 'Enter a name.');
    if (!Number.isFinite(step) || step <= 0 || step > 1000) e.step = l('گام باید عددی بزرگ‌تر از صفر باشد.', 'The step must be greater than zero.');
    else if (!f.allowDecimal && !Number.isInteger(step)) e.step = l('واحد بدون اعشار گام صحیح می‌خواهد (مثلاً ۱).', 'A whole-number unit needs a whole step (e.g. 1).');
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setGeneral(null);
    try {
      const body = { name: f.name.trim(), nameEn: f.nameEn.trim() || null, ...(locked ? {} : { allowDecimal: f.allowDecimal, step }), active: f.active, sortOrder: typedNumber(f.sortOrder) || 0 };
      await api(unit ? `/admin/units/${unit.id}` : '/admin/units', { method: unit ? 'PATCH' : 'POST', body });
      onSaved({ tone: 'success', text: unit ? l('واحد ذخیره شد.', 'Unit saved.') : l('واحد اضافه شد.', 'Unit added.') });
    } catch (err) {
      if (isApiError(err) && err.code === 'UNIT_NAME_TAKEN') setErrors({ name: errorText(t, err) });
      else setGeneral(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={unit ? l('ویرایش واحد', 'Edit unit') : l('افزودن واحد', 'Add unit')} closeLabel={l('بستن', 'Close')}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); void save(); }} className="flex flex-col gap-4">
        {general ? <Alert tone="danger" title={general} /> : null}
        <Field id="un-name" label={l('نام', 'Name')} hint={l('مثلاً لیتر، جفت، متر', 'e.g. litre, pair, metre')} required {...(errors.name ? { error: errors.name } : {})}>
          <Input id="un-name" maxLength={30} value={f.name} invalid={!!errors.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field id="un-name-en" label={l('نام انگلیسی', 'English name')} optionalLabel={t('common.optional')}>
          <Input id="un-name-en" dir="ltr" maxLength={30} value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} />
        </Field>
        {locked ? <Alert tone="info" title={l(`این واحد در ${unit.productCount} محصول استفاده شده؛ اعشار و گام آن قابل تغییر نیست. برای قاعدهٔ دیگر واحد تازه بسازید.`, `Used by ${unit.productCount} products; its decimal rule and step cannot change. Add a new unit for a different rule.`)} /> : null}
        <Checkbox id="un-decimal" label={l('مقدار اعشاری مجاز است (مثلاً ۱٫۵ لیتر)', 'Decimals allowed (e.g. 1.5 litres)')} checked={f.allowDecimal} disabled={locked} onChange={(e) => setF({ ...f, allowDecimal: e.target.checked, step: e.target.checked ? f.step : String(Math.max(1, Math.round(typedNumber(f.step) || 1))) })} />
        <Field id="un-step" label={l('حداقل گام', 'Minimum step')} hint={l('کوچک‌ترین مقدار قابل فروش؛ مثلاً ۰٫۵ برای لیتر', 'Smallest amount that can be sold, e.g. 0.5 for litres')} required {...(errors.step ? { error: errors.step } : {})}>
          <Input id="un-step" dir="ltr" inputMode="decimal" className="w-32" value={f.step} disabled={locked} invalid={!!errors.step} onChange={(e) => setF({ ...f, step: e.target.value })} />
        </Field>
        <Field id="un-sort" label={l('ترتیب نمایش', 'Sort order')}>
          <Input id="un-sort" inputMode="numeric" className="w-32" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} />
        </Field>
        <Checkbox id="un-active" label={l('فعال (در فرم محصول قابل انتخاب است)', 'Active (can be chosen on products)')} checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
        <div className="flex flex-wrap gap-2 border-t border-line-soft pt-4">
          <Button type="submit" loading={busy}>{l('ذخیره', 'Save')}</Button>
          <Button variant="ghost" onClick={onClose}>{l('انصراف', 'Cancel')}</Button>
        </div>
      </form>
    </Dialog>
  );
}
