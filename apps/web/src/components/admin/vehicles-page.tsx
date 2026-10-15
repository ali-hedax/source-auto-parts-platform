'use client';

import type { VehicleAdminView, VehicleCategoryView } from '@hedax/contracts';
import { ArrowDown, ArrowUp, GripVertical, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { Async } from '@/components/ui/async';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { Num } from '@/components/ui/format';
import { Alert, Badge, EmptyState, Ltr, PageHeader } from '@/components/ui/misc';
import { Tabs } from '@/components/ui/tabs';
import { api } from '@/lib/api/client';
import { errorText, isApiError } from '@/lib/api/errors';
import { useApi } from '@/lib/use-api';
import { ActionMenu } from './action-menu';
import { useL } from './shell';

interface Data { categories: VehicleCategoryView[]; vehicles: VehicleAdminView[] }
type Notice = { tone: 'success' | 'warning' | 'danger'; text: string } | null;
type Modal =
  | { type: 'vehicle'; vehicle: VehicleAdminView | null }
  | { type: 'models'; vehicleId: string }
  | { type: 'merge'; vehicle: VehicleAdminView }
  | { type: 'delete'; vehicle: VehicleAdminView }
  | { type: 'category'; category: VehicleCategoryView | null }
  | null;

/**
 * Sortable list: drag a row by its handle (mouse) or move it with the ↑/↓ buttons (keyboard,
 * phone). The new order is saved at once.
 */
function useSortable<T extends { id: string }>(items: T[], save: (ids: string[]) => Promise<void>) {
  const [order, setOrder] = useState(items);
  const [dragging, setDragging] = useState<string | null>(null);
  useEffect(() => setOrder(items), [items]);
  const commit = async (next: T[]) => { setOrder(next); await save(next.map((x) => x.id)); };
  const move = (id: string, delta: number) => {
    const i = order.findIndex((x) => x.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    void commit(next);
  };
  const rowProps = (id: string) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => { setDragging(id); e.dataTransfer.effectAllowed = 'move'; },
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      if (!dragging || dragging === id) return;
      const from = order.findIndex((x) => x.id === dragging);
      const to = order.findIndex((x) => x.id === id);
      const next = [...order];
      next.splice(to, 0, next.splice(from, 1)[0]!);
      setOrder(next);
    },
    onDragEnd: () => { if (dragging) void commit(order); setDragging(null); },
    'data-dragging': dragging === id || undefined,
  });
  return { order, move, rowProps };
}

export function VehiclesPage() {
  const t = useTranslations();
  const l = useL();
  const state = useApi<Data>('/admin/vehicles');
  const [tab, setTab] = useState<'vehicles' | 'categories'>('vehicles');
  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const done = async (n: Notice) => { setModal(null); setNotice(n); await state.reload(); };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); await done({ tone: 'success', text: ok }); } catch (e) { setNotice({ tone: 'danger', text: errorText(t, e) }); }
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={l('خودروها', 'Vehicles')}
        description={l('فهرست «کاربرد در خودرو»: دسته‌ها، خودروها و مدل/تیپ‌ها. ترتیب را با کشیدن یا دکمه‌های ↑↓ عوض کنید. خودرویی که به محصول وصل است حذف نمی‌شود؛ آن را با خودروی دیگر ادغام یا غیرفعال کنید.', 'Vehicle fitment: categories, vehicles and models. Reorder by dragging or with ↑↓. A vehicle linked to products is not deleted; merge it into another or deactivate it.')}
        actions={tab === 'vehicles'
          ? <Button onClick={() => setModal({ type: 'vehicle', vehicle: null })}><Plus aria-hidden className="size-4" /> {l('افزودن خودرو', 'Add vehicle')}</Button>
          : <Button onClick={() => setModal({ type: 'category', category: null })}><Plus aria-hidden className="size-4" /> {l('افزودن دسته', 'Add category')}</Button>}
      />
      <div aria-live="polite">{notice ? <Alert tone={notice.tone} title={notice.text} /> : null}</div>
      <Tabs id="veh-tabs" label={l('خودروها', 'Vehicles')} active={tab} onChange={(k) => { setTab(k); setNotice(null); }}
        items={[
          { key: 'vehicles', label: l('خودروها', 'Vehicles'), ...(state.data ? { count: state.data.vehicles.length } : {}) },
          { key: 'categories', label: l('دسته‌ها', 'Categories'), ...(state.data ? { count: state.data.categories.length } : {}) },
        ]} />
      <div id="veh-tabs-panel" role="tabpanel" aria-labelledby={`veh-tabs-${tab}`}>
        <Async state={state}>
          {(data) => tab === 'vehicles'
            ? <VehicleList data={data} onModal={setModal} onRun={run} />
            : <CategoryList data={data} onModal={setModal} onRun={run} />}
        </Async>
      </div>

      {modal?.type === 'vehicle' && state.data ? <VehicleDialog vehicle={modal.vehicle} categories={state.data.categories} onClose={() => setModal(null)} onSaved={(n) => void done(n)} /> : null}
      {modal?.type === 'models' && state.data ? <ModelsDialog vehicle={state.data.vehicles.find((v) => v.id === modal.vehicleId)!} onClose={() => setModal(null)} onChanged={() => void state.reload()} /> : null}
      {modal?.type === 'merge' && state.data ? <MergeDialog vehicle={modal.vehicle} vehicles={state.data.vehicles} onClose={() => setModal(null)} onSaved={(n) => void done(n)} /> : null}
      {modal?.type === 'delete' ? <DeleteDialog vehicle={modal.vehicle} onClose={() => setModal(null)} onMerge={() => setModal({ type: 'merge', vehicle: modal.vehicle })} onSaved={(n) => void done(n)} /> : null}
      {modal?.type === 'category' ? <CategoryDialog category={modal.category} onClose={() => setModal(null)} onSaved={(n) => void done(n)} /> : null}
    </div>
  );
}

function VehicleList({ data, onModal, onRun }: { data: Data; onModal: (m: Modal) => void; onRun: (fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const l = useL();
  const [category, setCategory] = useState<string>('all');
  const [q, setQ] = useState('');
  const filtering = category !== 'all' || q.trim() !== '';
  const sortable = useSortable(data.vehicles, async (ids) => { await onRun(() => api('/admin/vehicles/reorder', { method: 'POST', body: { ids } }), l('ترتیب ذخیره شد.', 'Order saved.')); });
  const catName = (id: string | null) => data.categories.find((c) => c.id === id)?.name ?? l('بدون دسته', 'No category');
  const shown = useMemo(() => sortable.order.filter((v) => (category === 'all' || (category === 'none' ? !v.categoryId : v.categoryId === category)) && (!q.trim() || `${v.name} ${v.nameEn ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))), [sortable.order, category, q]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field id="veh-q" label={l('جست‌وجو', 'Search')} className="min-w-48 flex-1"><Input id="veh-q" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        <Field id="veh-cat" label={l('دسته', 'Category')} className="min-w-48">
          <Select id="veh-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">{l('همه', 'All')}</option>
            <option value="none">{l('بدون دسته', 'No category')}</option>
            {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      </div>
      {filtering ? <p className="text-xs text-steel">{l('برای تغییر ترتیب، فیلتر را بردارید.', 'Clear the filter to reorder.')}</p> : null}
      {!shown.length ? <EmptyState title={l('خودرویی نیست.', 'No vehicles.')} /> : (
        <ul className="flex flex-col divide-y divide-line-soft rounded-[var(--radius-card)] border border-line-soft bg-white" aria-label={l('خودروها', 'Vehicles')}>
          {shown.map((v, i) => (
            <li key={v.id} {...(filtering ? {} : sortable.rowProps(v.id))} className="flex flex-wrap items-center gap-3 px-3 py-3 data-[dragging]:bg-surface">
              {!filtering ? (
                <span className="flex items-center gap-0.5">
                  <GripVertical aria-hidden className="hidden size-4 cursor-grab text-steel sm:block" />
                  <button type="button" className="grid size-9 place-items-center rounded hover:bg-surface disabled:opacity-30" disabled={i === 0} onClick={() => sortable.move(v.id, -1)} aria-label={l(`بالا بردن ${v.name}`, `Move ${v.name} up`)}><ArrowUp aria-hidden className="size-4" /></button>
                  <button type="button" className="grid size-9 place-items-center rounded hover:bg-surface disabled:opacity-30" disabled={i === shown.length - 1} onClick={() => sortable.move(v.id, 1)} aria-label={l(`پایین بردن ${v.name}`, `Move ${v.name} down`)}><ArrowDown aria-hidden className="size-4" /></button>
                </span>
              ) : null}
              <div className="min-w-40 flex-1">
                <span className="font-semibold">{v.name}</span>{v.nameEn ? <span className="ms-2 text-sm text-steel"><Ltr>{v.nameEn}</Ltr></span> : null}
                <span className="block text-xs text-steel">
                  {catName(v.categoryId)} · {l('مدل‌ها', 'Models')}: <Num value={v.models.length} /> · {l('محصولات', 'Products')}: <Num value={v.productCount} /> · <Ltr>/cars/{v.slug}</Ltr>
                </span>
              </div>
              <Select id={`veh-cat-${v.id}`} aria-label={l(`دستهٔ ${v.name}`, `Category of ${v.name}`)} className="w-40" value={v.categoryId ?? ''}
                onChange={(e) => void onRun(() => api(`/admin/vehicles/${v.id}`, { method: 'PATCH', body: { categoryId: e.target.value || null } }), l('دسته ذخیره شد.', 'Category saved.'))}>
                <option value="">{l('بدون دسته', 'No category')}</option>
                {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              {v.active ? <Badge tone="success">{l('فعال', 'Active')}</Badge> : <Badge tone="neutral">{l('غیرفعال', 'Inactive')}</Badge>}
              <div className="flex items-center gap-1">
                <Button size="sm" variant="secondary" onClick={() => onModal({ type: 'models', vehicleId: v.id })}>{l('مدل‌ها', 'Models')}</Button>
                <ActionMenu label={l(`عملیات برای ${v.name}`, `Actions for ${v.name}`)} actions={[
                  { key: 'edit', label: l('ویرایش', 'Edit'), onSelect: () => onModal({ type: 'vehicle', vehicle: v }) },
                  { key: 'merge', label: l('ادغام خودروی تکراری در این خودرو', 'Merge a duplicate into this one'), onSelect: () => onModal({ type: 'merge', vehicle: v }) },
                  { key: 'active', label: v.active ? l('غیرفعال کردن', 'Deactivate') : l('فعال کردن', 'Activate'), onSelect: () => void onRun(() => api(`/admin/vehicles/${v.id}`, { method: 'PATCH', body: { active: !v.active } }), v.active ? l('غیرفعال شد؛ در سایت و فرم محصول دیده نمی‌شود.', 'Deactivated; hidden on the site and in the product form.') : l('فعال شد.', 'Activated.')) },
                  { key: 'delete', label: l('حذف', 'Delete'), danger: true, onSelect: () => onModal({ type: 'delete', vehicle: v }) },
                ]} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CategoryList({ data, onModal, onRun }: { data: Data; onModal: (m: Modal) => void; onRun: (fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const l = useL();
  const sortable = useSortable(data.categories, async (ids) => { await onRun(() => api('/admin/vehicle-categories/reorder', { method: 'POST', body: { ids } }), l('ترتیب ذخیره شد.', 'Order saved.')); });
  if (!sortable.order.length) return <EmptyState title={l('هنوز دسته‌ای نیست؛ مثلاً «سواری»، «وانت» یا «برقی» بسازید.', 'No categories yet; add e.g. "Passenger", "Pickup" or "Electric".')} />;
  return (
    <ul className="flex flex-col divide-y divide-line-soft rounded-[var(--radius-card)] border border-line-soft bg-white" aria-label={l('دسته‌ها', 'Categories')}>
      {sortable.order.map((c, i) => (
        <li key={c.id} {...sortable.rowProps(c.id)} className="flex flex-wrap items-center gap-3 px-3 py-3 data-[dragging]:bg-surface">
          <span className="flex items-center gap-0.5">
            <GripVertical aria-hidden className="hidden size-4 cursor-grab text-steel sm:block" />
            <button type="button" className="grid size-9 place-items-center rounded hover:bg-surface disabled:opacity-30" disabled={i === 0} onClick={() => sortable.move(c.id, -1)} aria-label={l(`بالا بردن ${c.name}`, `Move ${c.name} up`)}><ArrowUp aria-hidden className="size-4" /></button>
            <button type="button" className="grid size-9 place-items-center rounded hover:bg-surface disabled:opacity-30" disabled={i === sortable.order.length - 1} onClick={() => sortable.move(c.id, 1)} aria-label={l(`پایین بردن ${c.name}`, `Move ${c.name} down`)}><ArrowDown aria-hidden className="size-4" /></button>
          </span>
          <div className="min-w-40 flex-1"><span className="font-semibold">{c.name}</span><span className="block text-xs text-steel">{l('خودروها', 'Vehicles')}: <Num value={c.vehicleCount} /></span></div>
          {c.active ? <Badge tone="success">{l('فعال', 'Active')}</Badge> : <Badge tone="neutral">{l('غیرفعال', 'Inactive')}</Badge>}
          <ActionMenu label={l(`عملیات برای ${c.name}`, `Actions for ${c.name}`)} actions={[
            { key: 'edit', label: l('ویرایش', 'Edit'), onSelect: () => onModal({ type: 'category', category: c }) },
            { key: 'delete', label: l('حذف (خودروهایش بدون دسته می‌شوند)', 'Delete (its vehicles lose the category)'), danger: true, onSelect: () => void onRun(() => api(`/admin/vehicle-categories/${c.id}`, { method: 'DELETE' }), l('دسته حذف شد.', 'Category deleted.')) },
          ]} />
        </li>
      ))}
    </ul>
  );
}

function useSave(onSaved: (n: Notice) => void) {
  const t = useTranslations();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setError(null);
    try { await fn(); onSaved({ tone: 'success', text: ok }); } catch (e) { setError(errorText(t, e)); } finally { setBusy(false); }
  };
  return { busy, error, save, setError };
}

function VehicleDialog({ vehicle, categories, onClose, onSaved }: { vehicle: VehicleAdminView | null; categories: VehicleCategoryView[]; onClose: () => void; onSaved: (n: Notice) => void }) {
  const l = useL();
  const t = useTranslations();
  const [f, setF] = useState({ name: vehicle?.name ?? '', nameEn: vehicle?.nameEn ?? '', slug: vehicle?.slug ?? '', categoryId: vehicle?.categoryId ?? '', active: vehicle?.active ?? true, seoTitle: vehicle?.seoTitle ?? '', seoDescription: vehicle?.seoDescription ?? '' });
  const { busy, error, save, setError } = useSave(onSaved);
  const submit = () => {
    if (!f.name.trim()) { setError(l('نام خودرو را بنویسید.', 'Enter the vehicle name.')); return; }
    if (f.slug && !/^[a-z0-9][a-z0-9-]*$/.test(f.slug)) { setError(l('آدرس صفحه فقط حروف کوچک انگلیسی، عدد و خط تیره.', 'The address uses lowercase letters, digits and dashes only.')); return; }
    const body = { name: f.name.trim(), nameEn: f.nameEn.trim() || null, ...(f.slug ? { slug: f.slug } : {}), categoryId: f.categoryId || null, active: f.active, seoTitle: f.seoTitle.trim() || null, seoDescription: f.seoDescription.trim() || null };
    void save(() => api(vehicle ? `/admin/vehicles/${vehicle.id}` : '/admin/vehicles', { method: vehicle ? 'PATCH' : 'POST', body }), vehicle ? l('خودرو ذخیره شد.', 'Vehicle saved.') : l('خودرو اضافه شد.', 'Vehicle added.'));
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={vehicle ? l(`ویرایش ${vehicle.name}`, `Edit ${vehicle.name}`) : l('افزودن خودرو', 'Add vehicle')} closeLabel={l('بستن', 'Close')}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col gap-4">
        {error ? <Alert tone="danger" title={error} /> : null}
        <Field id="vd-name" label={l('نام', 'Name')} required><Input id="vd-name" maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field id="vd-name-en" label={l('نام انگلیسی', 'English name')} optionalLabel={t('common.optional')}><Input id="vd-name-en" dir="ltr" maxLength={80} value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} /></Field>
        <Field id="vd-slug" label={l('آدرس صفحه', 'Page address')} hint={l('مثلاً peugeot ← /cars/peugeot؛ خالی = از نام انگلیسی', 'e.g. peugeot → /cars/peugeot; empty = from the English name')} optionalLabel={t('common.optional')}>
          <Input id="vd-slug" dir="ltr" maxLength={70} value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} />
        </Field>
        <Field id="vd-cat" label={l('دسته', 'Category')}>
          <Select id="vd-cat" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
            <option value="">{l('بدون دسته', 'No category')}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field id="vd-seo-title" label={l('عنوان صفحه (سئو)', 'Page title (SEO)')} hint={l('خالی = «قطعات یدکی {نام}»', 'Empty = "Spare parts for {name}"')} optionalLabel={t('common.optional')}><Input id="vd-seo-title" maxLength={120} value={f.seoTitle} onChange={(e) => setF({ ...f, seoTitle: e.target.value })} /></Field>
        <Field id="vd-seo-desc" label={l('توضیح متا (سئو)', 'Meta description (SEO)')} optionalLabel={t('common.optional')}><Textarea id="vd-seo-desc" maxLength={300} value={f.seoDescription} onChange={(e) => setF({ ...f, seoDescription: e.target.value })} /></Field>
        <Checkbox id="vd-active" label={l('فعال (در سایت و فرم محصول)', 'Active (on the site and in the product form)')} checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
        <div className="flex flex-wrap gap-2 border-t border-line-soft pt-4">
          <Button type="submit" loading={busy}>{l('ذخیره', 'Save')}</Button>
          <Button variant="ghost" onClick={onClose}>{l('انصراف', 'Cancel')}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function ModelsDialog({ vehicle, onClose, onChanged }: { vehicle: VehicleAdminView; onClose: () => void; onChanged: () => void }) {
  const l = useL();
  const t = useTranslations();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const call = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); onChanged(); } catch (e) { setError(errorText(t, e)); } };
  const sortable = useSortable(vehicle.models, async (ids) => { await call(() => api(`/admin/vehicles/${vehicle.id}/models/reorder`, { method: 'POST', body: { ids } })); });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={l(`مدل‌ها / تیپ‌های ${vehicle.name}`, `Models of ${vehicle.name}`)} closeLabel={l('بستن', 'Close')}
      description={l('اختیاری؛ مثلاً پژو ← ۲۰۶، ۴۰۵، پارس. محصول می‌تواند به کل خودرو یا مدل‌های خاص وصل شود.', 'Optional, e.g. Peugeot → 206, 405, Pars. A product fits the whole vehicle or specific models.')}>
      <div className="flex flex-col gap-3">
        {error ? <Alert tone="danger" title={error} /> : null}
        {sortable.order.length ? (
          <ul className="flex flex-col divide-y divide-line-soft rounded-[var(--radius-control)] border border-line-soft">
            {sortable.order.map((m, i) => (
              <li key={m.id} {...sortable.rowProps(m.id)} className="flex flex-wrap items-center gap-2 px-2 py-2 data-[dragging]:bg-surface">
                <button type="button" className="grid size-9 place-items-center rounded hover:bg-surface disabled:opacity-30" disabled={i === 0} onClick={() => sortable.move(m.id, -1)} aria-label={l(`بالا بردن ${m.name}`, `Move ${m.name} up`)}><ArrowUp aria-hidden className="size-4" /></button>
                <button type="button" className="grid size-9 place-items-center rounded hover:bg-surface disabled:opacity-30" disabled={i === sortable.order.length - 1} onClick={() => sortable.move(m.id, 1)} aria-label={l(`پایین بردن ${m.name}`, `Move ${m.name} down`)}><ArrowDown aria-hidden className="size-4" /></button>
                {editing?.id === m.id ? (
                  <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); void call(() => api(`/admin/vehicles/${vehicle.id}/models/${m.id}`, { method: 'PATCH', body: { name: editing.name.trim() } })).then(() => setEditing(null)); }}>
                    <Input id={`md-edit-${m.id}`} aria-label={l('نام مدل', 'Model name')} value={editing.name} onChange={(e) => setEditing({ id: m.id, name: e.target.value })} />
                    <Button size="sm" type="submit">{l('ذخیره', 'Save')}</Button>
                  </form>
                ) : (
                  <span className="min-w-24 flex-1"><span className="font-semibold">{m.name}</span> <span className="text-xs text-steel">({l('محصولات', 'products')}: <Num value={m.productCount} />)</span>{m.active ? null : <Badge tone="neutral" className="ms-2">{l('غیرفعال', 'Inactive')}</Badge>}</span>
                )}
                <ActionMenu label={l(`عملیات برای ${m.name}`, `Actions for ${m.name}`)} actions={[
                  { key: 'edit', label: l('تغییر نام', 'Rename'), onSelect: () => setEditing({ id: m.id, name: m.name }) },
                  { key: 'active', label: m.active ? l('غیرفعال کردن', 'Deactivate') : l('فعال کردن', 'Activate'), onSelect: () => void call(() => api(`/admin/vehicles/${vehicle.id}/models/${m.id}`, { method: 'PATCH', body: { active: !m.active } })) },
                  { key: 'delete', label: l('حذف', 'Delete'), danger: true, disabled: m.productCount > 0, onSelect: () => void call(() => api(`/admin/vehicles/${vehicle.id}/models/${m.id}`, { method: 'DELETE' })) },
                ]} />
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-steel">{l('هنوز مدلی ثبت نشده است.', 'No models yet.')}</p>}
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; void call(() => api(`/admin/vehicles/${vehicle.id}/models`, { method: 'POST', body: { name: name.trim() } })).then(() => setName('')); }}>
          <Field id="md-new" label={l('مدل تازه', 'New model')} className="min-w-40 flex-1"><Input id="md-new" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Button type="submit" variant="secondary"><Plus aria-hidden className="size-4" /> {l('افزودن مدل', 'Add model')}</Button>
        </form>
      </div>
    </Dialog>
  );
}

function MergeDialog({ vehicle, vehicles, onClose, onSaved }: { vehicle: VehicleAdminView; vehicles: VehicleAdminView[]; onClose: () => void; onSaved: (n: Notice) => void }) {
  const l = useL();
  const [sourceId, setSourceId] = useState('');
  const { busy, error, save } = useSave(onSaved);
  const source = vehicles.find((v) => v.id === sourceId);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={l(`ادغام در «${vehicle.name}»`, `Merge into "${vehicle.name}"`)} closeLabel={l('بستن', 'Close')}
      description={l(`همهٔ محصولات و مدل‌های خودروی تکراری به «${vehicle.name}» منتقل می‌شوند و خودروی تکراری حذف می‌شود. این کار برگشت‌پذیر نیست.`, `Every product and model of the duplicate moves to "${vehicle.name}" and the duplicate is deleted. This cannot be undone.`)}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); if (sourceId) void save(() => api(`/admin/vehicles/${vehicle.id}/merge`, { method: 'POST', body: { sourceId } }), l('ادغام شد.', 'Merged.')); }} className="flex flex-col gap-4">
        {error ? <Alert tone="danger" title={error} /> : null}
        <Field id="mg-source" label={l('خودروی تکراری', 'Duplicate vehicle')} required>
          <Select id="mg-source" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            <option value="">{l('انتخاب کنید', 'Choose')}</option>
            {vehicles.filter((v) => v.id !== vehicle.id).map((v) => <option key={v.id} value={v.id}>{v.name}{v.productCount ? ` (${v.productCount})` : ''}</option>)}
          </Select>
        </Field>
        {source ? <p className="text-sm text-steel">{l(`${source.productCount} محصول و ${source.models.length} مدل از «${source.name}» منتقل می‌شود.`, `${source.productCount} products and ${source.models.length} models move from "${source.name}".`)}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="danger" loading={busy} disabled={!sourceId}>{l('ادغام', 'Merge')}</Button>
          <Button variant="ghost" onClick={onClose}>{l('انصراف', 'Cancel')}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteDialog({ vehicle, onClose, onMerge, onSaved }: { vehicle: VehicleAdminView; onClose: () => void; onMerge: () => void; onSaved: (n: Notice) => void }) {
  const l = useL();
  const { busy, error, save } = useSave(onSaved);
  const inUse = vehicle.productCount > 0;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={l(`حذف ${vehicle.name}`, `Delete ${vehicle.name}`)} closeLabel={l('بستن', 'Close')}
      description={inUse
        ? l(`«${vehicle.name}» به ${vehicle.productCount} محصول وصل است و مستقیم حذف نمی‌شود. اگر تکراری است آن را در خودروی درست ادغام کنید، یا غیرفعالش کنید تا در سایت دیده نشود.`, `"${vehicle.name}" is linked to ${vehicle.productCount} products and cannot be deleted directly. Merge it into the right vehicle if it is a duplicate, or deactivate it.`)
        : l('این خودرو و مدل‌هایش حذف می‌شوند.', 'This vehicle and its models will be deleted.')}>
      {error ? <Alert tone="danger" title={error} className="mb-3" /> : null}
      <div className="flex flex-wrap gap-2">
        {inUse ? (
          <>
            <Button onClick={onMerge}>{l('ادغام با خودروی دیگر', 'Merge with another vehicle')}</Button>
            {vehicle.active ? <Button variant="secondary" loading={busy} onClick={() => void save(() => api(`/admin/vehicles/${vehicle.id}`, { method: 'PATCH', body: { active: false } }), l('غیرفعال شد.', 'Deactivated.'))}>{l('غیرفعال کردن', 'Deactivate')}</Button> : null}
          </>
        ) : (
          <Button variant="danger" loading={busy} onClick={() => void save(() => api(`/admin/vehicles/${vehicle.id}`, { method: 'DELETE' }), l('حذف شد.', 'Deleted.'))}>{l('حذف', 'Delete')}</Button>
        )}
        <Button variant="ghost" onClick={onClose}>{l('انصراف', 'Cancel')}</Button>
      </div>
    </Dialog>
  );
}

function CategoryDialog({ category, onClose, onSaved }: { category: VehicleCategoryView | null; onClose: () => void; onSaved: (n: Notice) => void }) {
  const l = useL();
  const t = useTranslations();
  const [f, setF] = useState({ name: category?.name ?? '', nameEn: category?.nameEn ?? '', active: category?.active ?? true });
  const { busy, error, save, setError } = useSave(onSaved);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={category ? l('ویرایش دسته', 'Edit category') : l('افزودن دسته', 'Add category')} closeLabel={l('بستن', 'Close')}>
      <form noValidate onSubmit={(e) => {
        e.preventDefault();
        if (!f.name.trim()) { setError(l('نام دسته را بنویسید.', 'Enter a name.')); return; }
        void save(() => api(category ? `/admin/vehicle-categories/${category.id}` : '/admin/vehicle-categories', { method: category ? 'PATCH' : 'POST', body: { name: f.name.trim(), nameEn: f.nameEn.trim() || null, active: f.active } }), l('دسته ذخیره شد.', 'Category saved.'));
      }} className="flex flex-col gap-4">
        {error ? <Alert tone="danger" title={error} /> : null}
        <Field id="cd-name" label={l('نام', 'Name')} hint={l('مثلاً سواری، وانت، برقی', 'e.g. Passenger, Pickup, Electric')} required><Input id="cd-name" maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field id="cd-name-en" label={l('نام انگلیسی', 'English name')} optionalLabel={t('common.optional')}><Input id="cd-name-en" dir="ltr" maxLength={80} value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} /></Field>
        <Checkbox id="cd-active" label={l('فعال', 'Active')} checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
        <div className="flex flex-wrap gap-2 border-t border-line-soft pt-4">
          <Button type="submit" loading={busy}>{l('ذخیره', 'Save')}</Button>
          <Button variant="ghost" onClick={onClose}>{l('انصراف', 'Cancel')}</Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Used by the product form when quick-adding: a «very similar» name comes back as 409 with a suggestion. */
export function similarSuggestion(e: unknown): { id: string; name: string } | null {
  if (!isApiError(e) || e.code !== 'VEHICLE_SIMILAR') return null;
  const d = (e as unknown as { details?: { id?: string; name?: string } }).details;
  return d?.id && d.name ? { id: d.id, name: d.name } : null;
}
