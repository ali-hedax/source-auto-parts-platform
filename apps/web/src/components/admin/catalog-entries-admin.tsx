'use client';

import type {
  AttachmentView, CatalogDocumentView, CatalogEntryAdminDetail, CatalogEntryAdminRow, CatalogEntryDraftView, CatalogEntryImageView, CatalogImportView, MeView, VehicleAdminView,
} from '@hedax/contracts';
import { ArrowDown, ArrowUp, Download, FileUp, Plus, Search, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { DateTime } from '@/components/ui/format';
import { Alert, Badge, Code, EmptyState, Section, TableScroll, td, th } from '@/components/ui/misc';
import { api, uploadWithProgress } from '@/lib/api/client';
import { errorText, isApiError } from '@/lib/api/errors';
import { useApi } from '@/lib/use-api';
import { PHOTO_EXTENSIONS, PHOTO_MAX_BYTES, PHOTO_TYPES } from './product-photos';
import { useL } from './shell';

interface Ref { id: string; code?: string; nameFa: string; nameEn: string | null }
interface Taxonomy { categories: Array<Ref & { parentId: string | null }>; vehicleBrands: Ref[]; manufacturers: Ref[] }
interface ListResult { items: CatalogEntryAdminRow[]; total: number; page: number; pageSize: number }

interface VehicleRow { vehicleId: string; modelId: string; yearFrom: string; yearTo: string; note: string }
interface FormState {
  partNumber: string;
  nameFa: string;
  nameEn: string;
  equivalents: string;
  replacements: string;
  manufacturerBrandId: string;
  categoryId: string;
  vehicleBrandIds: string[];
  vehicles: VehicleRow[];
  specs: Array<{ label: string; value: string }>;
  descriptionFa: string;
  descriptionEn: string;
  sourceDocumentId: string;
  product: { id: string; sku: string; nameFa: string } | null;
  status: 'DRAFT' | 'PUBLISHED';
}

const EMPTY: FormState = {
  partNumber: '', nameFa: '', nameEn: '', equivalents: '', replacements: '', manufacturerBrandId: '', categoryId: '', vehicleBrandIds: [],
  vehicles: [], specs: [], descriptionFa: '', descriptionEn: '', sourceDocumentId: '', product: null, status: 'DRAFT',
};
const list = (text: string) => [...new Set(text.split(/[,،;؛\n]+/).map((s) => s.trim()).filter(Boolean))];
const yearOf = (s: string) => (s.trim() ? Number(s.trim().replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))) : null);

function fromDetail(d: CatalogEntryAdminDetail): FormState {
  return {
    partNumber: d.partNumber, nameFa: d.nameFa, nameEn: d.nameEn ?? '', equivalents: d.equivalents.join(', '), replacements: d.replacements.join(', '),
    manufacturerBrandId: d.manufacturerBrandId ?? '', categoryId: d.categoryId ?? '', vehicleBrandIds: d.vehicleBrandIds,
    vehicles: d.vehicles.map((v) => ({ vehicleId: v.vehicleId, modelId: v.modelId ?? '', yearFrom: v.yearFrom?.toString() ?? '', yearTo: v.yearTo?.toString() ?? '', note: v.note ?? '' })),
    specs: d.specs, descriptionFa: d.descriptionFa ?? '', descriptionEn: d.descriptionEn ?? '', sourceDocumentId: d.sourceDocumentId ?? '', product: d.product, status: d.status,
  };
}

function toInput(f: FormState) {
  return {
    partNumber: f.partNumber.trim(), nameFa: f.nameFa.trim(), nameEn: f.nameEn.trim() || null,
    equivalents: list(f.equivalents), replacements: list(f.replacements),
    manufacturerBrandId: f.manufacturerBrandId || null, categoryId: f.categoryId || null, vehicleBrandIds: f.vehicleBrandIds,
    vehicles: f.vehicles.filter((v) => v.vehicleId).map((v) => ({ vehicleId: v.vehicleId, modelId: v.modelId || null, yearFrom: yearOf(v.yearFrom), yearTo: yearOf(v.yearTo), note: v.note.trim() || null })),
    specs: f.specs.map((s) => ({ label: s.label.trim(), value: s.value.trim() })).filter((s) => s.label && s.value),
    descriptionFa: f.descriptionFa.trim() || null, descriptionEn: f.descriptionEn.trim() || null,
    sourceDocumentId: f.sourceDocumentId || null, productId: f.product?.id ?? null, status: f.status,
  };
}

/**
 * Panel → knowledge center → «قطعات کاتالوگ»: the technical catalog. Reference entries only (no
 * price or stock); a shop product is linked only by choosing it here. Viewing needs imports.run or
 * products.write; changes need products.write (the server checks as well).
 */
export function CatalogEntriesAdmin({ draft, openEntryId, onDraftUsed }: { draft: { documentId: string; ordinal: number } | null; openEntryId: string | null; onDraftUsed: () => void }) {
  const t = useTranslations();
  const l = useL();
  const me = useApi<MeView>('/me');
  const canEdit = !!me.data?.permissions.includes('products.write');
  const canImport = canEdit && !!me.data?.permissions.includes('imports.run');
  const taxonomy = useApi<Taxonomy>('/admin/taxonomy');
  const vehicles = useApi<{ vehicles: VehicleAdminView[] }>('/admin/vehicles');
  const [filters, setFilters] = useState({ q: '', vehicleBrand: '', vehicle: '', category: '', status: '', page: 1 });
  const [q, setQ] = useState('');
  const qs = new URLSearchParams(Object.entries({ ...filters, page: String(filters.page), pageSize: '25' }).filter((e): e is [string, string] => !!e[1]));
  const entries = useApi<ListResult>(`/admin/catalog-entries?${qs.toString()}`);
  const [editing, setEditing] = useState<{ id: string | null; initial: FormState; draftNote?: string } | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger' | 'warning'; text: string } | null>(null);
  const [showImport, setShowImport] = useState(false);

  const open = async (id: string) => {
    setMessage(null);
    try {
      const d = await api<CatalogEntryAdminDetail>(`/admin/catalog-entries/${id}`);
      setEditing({ id, initial: fromDetail(d) });
    } catch (e) {
      setMessage({ tone: 'danger', text: errorText(t, e) });
    }
  };

  // «تبدیل به آیتم کاتالوگ» from the documents tab, or a link from bulk photos (?entry=).
  useEffect(() => {
    if (!draft) return;
    void (async () => {
      try {
        const d = await api<CatalogEntryDraftView>(`/admin/catalog-entries/draft/${draft.documentId}/${draft.ordinal}`);
        if (d.existingId) {
          await open(d.existingId);
          setMessage({ tone: 'warning', text: l(`آیتمی با شماره فنی ${d.partNumber} از قبل هست؛ همان باز شد.`, `An entry with part number ${d.partNumber} already exists; it was opened.`) });
        } else {
          setEditing({
            id: null,
            initial: { ...EMPTY, partNumber: d.partNumber, nameFa: d.nameFa, sourceDocumentId: d.sourceDocumentId, vehicles: d.vehicles.map((v) => ({ vehicleId: v.vehicleId, modelId: v.modelId ?? '', yearFrom: '', yearTo: '', note: '' })) },
            ...(d.unmatchedVehicles.length ? { draftNote: l(`این خودروها در پنل نیستند و اضافه نشدند: ${d.unmatchedVehicles.join('، ')}`, `These vehicles are not in the panel and were not added: ${d.unmatchedVehicles.join(', ')}`) } : {}),
          });
        }
      } catch (e) {
        setMessage({ tone: 'danger', text: errorText(t, e) });
      } finally {
        onDraftUsed();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per draft request
  }, [draft]);
  useEffect(() => {
    if (openEntryId) void open(openEntryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per link
  }, [openEntryId]);

  const name = (r: Ref) => r.nameFa;
  const statusBadge = (s: 'DRAFT' | 'PUBLISHED') => (s === 'PUBLISHED' ? <Badge tone="success">{l('منتشرشده', 'Published')}</Badge> : <Badge>{l('پیش‌نویس', 'Draft')}</Badge>);

  const setStatus = async (row: CatalogEntryAdminRow) => {
    setMessage(null);
    try {
      await api(`/admin/catalog-entries/${row.id}/status`, { method: 'POST', body: { status: row.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED' } });
      await entries.reload();
    } catch (e) {
      setMessage({ tone: 'danger', text: errorText(t, e) });
    }
  };
  const remove = async (row: CatalogEntryAdminRow) => {
    if (!window.confirm(l(`«${row.nameFa}» (${row.partNumber}) و عکس‌هایش حذف شود؟ این کار برگشت‌پذیر نیست.`, `Delete “${row.nameFa}” (${row.partNumber}) and its photos? This cannot be undone.`))) return;
    setMessage(null);
    try {
      await api(`/admin/catalog-entries/${row.id}`, { method: 'DELETE' });
      await entries.reload();
      setMessage({ tone: 'success', text: l('حذف شد.', 'Deleted.') });
    } catch (e) {
      setMessage({ tone: 'danger', text: errorText(t, e) });
    }
  };

  if (editing) {
    return (
      <EntryForm
        key={editing.id ?? 'new'}
        id={editing.id}
        initial={editing.initial}
        {...(editing.draftNote ? { note: editing.draftNote } : {})}
        canEdit={canEdit}
        taxonomy={taxonomy.data}
        vehicles={vehicles.data?.vehicles ?? []}
        onOpen={(id) => void open(id)}
        onClose={(saved) => { setEditing(null); if (saved) { setMessage({ tone: 'success', text: saved }); void entries.reload(); } }}
      />
    );
  }

  const tax = taxonomy.data;
  const pages = entries.data ? Math.max(1, Math.ceil(entries.data.total / entries.data.pageSize)) : 1;
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-3xl text-sm leading-6 text-steel">
        {l('کاتالوگ فنی مرجع اطلاعاتی قطعات است، نه محصول فروشگاه: قیمت و موجودی ندارد. فقط آیتم‌های «منتشرشده» در سایت (/catalog) دیده می‌شوند. لینک به محصول فروشگاه فقط دستی است و هیچ آیتمی خودکار محصول نمی‌شود.', 'The technical catalog is reference data, not shop products: no price or stock. Only “published” entries are shown on the site (/catalog). Linking a shop product is manual only; nothing becomes a product automatically.')}
      </p>
      {message ? <Alert tone={message.tone} title={message.text} /> : null}
      <div className="flex flex-wrap gap-2">
        {canEdit ? <Button icon={<Plus aria-hidden className="size-4" />} onClick={() => setEditing({ id: null, initial: EMPTY })}>{l('قطعهٔ تازه', 'New part')}</Button> : null}
        {canImport ? <Button variant="secondary" icon={<FileUp aria-hidden className="size-4" />} onClick={() => setShowImport((s) => !s)}>{showImport ? l('بستن ورود گروهی', 'Close bulk import') : l('ورود گروهی با Excel یا CSV', 'Bulk import (Excel or CSV)')}</Button> : null}
      </div>
      {showImport && canImport ? <CatalogImport onDone={() => void entries.reload()} /> : null}

      <Section title={l('قطعات کاتالوگ', 'Catalog parts')} id="catalog-entries-list">
        <form className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" role="search" onSubmit={(e) => { e.preventDefault(); setFilters((f) => ({ ...f, q: q.trim(), page: 1 })); }}>
          <Field id="ce-q" label={l('نام یا شماره فنی', 'Name or part number')} className="lg:col-span-2">
            <div className="flex gap-2">
              <Input id="ce-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={120} />
              <Button type="submit" variant="secondary" aria-label={l('جست‌وجو', 'Search')}><Search aria-hidden className="size-4" /></Button>
            </div>
          </Field>
          <Field id="ce-brand" label={l('برند خودرو', 'Vehicle brand')}>
            <Select id="ce-brand" value={filters.vehicleBrand} onChange={(e) => setFilters((f) => ({ ...f, vehicleBrand: e.target.value, page: 1 }))}>
              <option value="">{l('همه', 'All')}</option>
              {(tax?.vehicleBrands ?? []).map((b) => <option key={b.id} value={b.id}>{name(b)}</option>)}
            </Select>
          </Field>
          <Field id="ce-category" label={l('گروه قطعه', 'Part group')}>
            <Select id="ce-category" value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value, page: 1 }))}>
              <option value="">{l('همه', 'All')}</option>
              {(tax?.categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.parentId ? '— ' : ''}{name(c)}</option>)}
            </Select>
          </Field>
          <Field id="ce-status" label={l('وضعیت', 'Status')}>
            <Select id="ce-status" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}>
              <option value="">{l('همه', 'All')}</option>
              <option value="PUBLISHED">{l('منتشرشده', 'Published')}</option>
              <option value="DRAFT">{l('پیش‌نویس', 'Draft')}</option>
            </Select>
          </Field>
          <Field id="ce-vehicle" label={l('خودرو', 'Vehicle')} className="lg:col-span-2">
            <Select id="ce-vehicle" value={filters.vehicle} onChange={(e) => setFilters((f) => ({ ...f, vehicle: e.target.value, page: 1 }))}>
              <option value="">{l('همه', 'All')}</option>
              {(vehicles.data?.vehicles ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </Field>
        </form>
        {entries.error ? <Alert tone="danger" title={errorText(t, entries.error)} /> : !entries.data ? <p className="text-sm text-steel">{t('common.loading')}</p> : entries.data.items.length === 0 ? (
          <EmptyState title={l('قطعه‌ای پیدا نشد.', 'No parts found.')} />
        ) : (
          <>
            <p className="mb-2 text-sm text-steel">{l(`${entries.data.total.toLocaleString('fa-IR')} قطعه`, `${entries.data.total} parts`)}</p>
            <TableScroll caption={l('قطعات کاتالوگ', 'Catalog parts')}>
              <thead><tr><th className={th}>{l('عکس', 'Photo')}</th><th className={th}>{l('شماره فنی و نام', 'Number and name')}</th><th className={th}>{l('گروه / برند', 'Group / brand')}</th><th className={th}>{l('کاربرد', 'Fitment')}</th><th className={th}>{l('محصول فروشگاه', 'Shop product')}</th><th className={th}>{l('وضعیت', 'Status')}</th><th className={th}><span className="sr-only">{l('عملیات', 'Actions')}</span></th></tr></thead>
              <tbody>
                {entries.data.items.map((r) => (
                  <tr key={r.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- small panel thumbnail from the public media store */}
                    <td className={td}>{r.imageUrl ? <img src={r.imageUrl} alt="" width={48} height={48} className="size-12 rounded border border-line-soft object-contain" /> : <span className="text-steel">—</span>}</td>
                    <td className={td}><Code>{r.partNumber}</Code><span className="mt-1 block font-semibold" dir="auto">{r.nameFa}</span><span className="text-xs text-steel"><DateTime iso={r.updatedAt} /></span></td>
                    <td className={td}>{r.category ?? '—'}{r.manufacturer ? <span className="block text-xs text-steel">{r.manufacturer}</span> : null}</td>
                    <td className={td}>{r.vehicleCount ? l(`${r.vehicleCount.toLocaleString('fa-IR')} خودرو/مدل`, `${r.vehicleCount} vehicles/models`) : '—'}</td>
                    <td className={td}>{r.product ? <span className="text-sm"><Code>{r.product.sku}</Code><span className="block text-xs text-steel" dir="auto">{r.product.nameFa}</span></span> : '—'}</td>
                    <td className={td}>{statusBadge(r.status)}</td>
                    <td className={td}>
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="secondary" onClick={() => void open(r.id)}>{canEdit ? t('common.edit') : l('مشاهده', 'View')}</Button>
                        {canEdit ? <Button size="sm" variant="ghost" onClick={() => void setStatus(r)}>{r.status === 'PUBLISHED' ? l('لغو انتشار', 'Unpublish') : l('انتشار', 'Publish')}</Button> : null}
                        {canEdit ? <Button size="sm" variant="ghost" aria-label={l(`حذف ${r.partNumber}`, `Delete ${r.partNumber}`)} onClick={() => void remove(r)}><Trash2 aria-hidden className="size-4" /></Button> : null}
                        {r.status === 'PUBLISHED' ? <a href={`/fa/catalog/${r.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center px-2 text-sm font-semibold text-action underline underline-offset-4">{l('در سایت', 'On site')}</a> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
            {pages > 1 ? (
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" variant="secondary" disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>{l('قبلی', 'Previous')}</Button>
                <span className="text-sm text-steel">{l(`صفحهٔ ${filters.page.toLocaleString('fa-IR')} از ${pages.toLocaleString('fa-IR')}`, `Page ${filters.page} of ${pages}`)}</span>
                <Button size="sm" variant="secondary" disabled={filters.page >= pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>{l('بعدی', 'Next')}</Button>
              </div>
            ) : null}
          </>
        )}
      </Section>
    </div>
  );
}

/** Create or edit one entry. Photos can be added once the entry exists. */
function EntryForm({ id, initial, note, canEdit, taxonomy, vehicles, onOpen, onClose }: {
  id: string | null; initial: FormState; note?: string; canEdit: boolean; taxonomy: Taxonomy | null; vehicles: VehicleAdminView[];
  onOpen: (id: string) => void; onClose: (saved: string | null) => void;
}) {
  const t = useTranslations();
  const l = useL();
  const [f, setF] = useState<FormState>(initial);
  const [entryId, setEntryId] = useState<string | null>(id);
  const [images, setImages] = useState<CatalogEntryImageView[]>([]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ partNumber?: string; nameFa?: string; general?: string; existingId?: string }>({});
  const documents = useApi<CatalogDocumentView[]>('/admin/knowledge-catalog');
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (!entryId) return;
    api<CatalogEntryAdminDetail>(`/admin/catalog-entries/${entryId}`).then((d) => setImages(d.images)).catch(() => undefined);
  }, [entryId]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!f.partNumber.trim()) next.partNumber = l('شماره فنی را بنویسید.', 'Enter the part number.');
    if (!f.nameFa.trim()) next.nameFa = l('نام فارسی را بنویسید.', 'Enter the Persian name.');
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const body = toInput(f);
      const saved = await api<CatalogEntryAdminDetail>(entryId ? `/admin/catalog-entries/${entryId}` : '/admin/catalog-entries', { method: entryId ? 'PUT' : 'POST', body });
      if (!entryId) {
        // Stay on the form so photos can be added right away.
        setEntryId(saved.id);
        setF(fromDetail(saved));
        setErrors({ general: '' });
      } else {
        onClose(l('ذخیره شد.', 'Saved.'));
      }
    } catch (err) {
      if (isApiError(err) && err.code === 'CATALOG_PART_NUMBER_EXISTS') {
        const existing = err.details as { id?: string; partNumber?: string; nameFa?: string } | undefined;
        setErrors({
          partNumber: l(`این شماره فنی (با هر شکل نوشتن) قبلاً برای «${existing?.nameFa ?? ''}» (${existing?.partNumber ?? ''}) ثبت شده است.`, `This part number (written any way) already belongs to “${existing?.nameFa ?? ''}” (${existing?.partNumber ?? ''}).`),
          ...(existing?.id ? { existingId: existing.id } : {}),
        });
      } else {
        setErrors({ general: errorText(t, err) });
      }
    } finally {
      setBusy(false);
    }
  };

  const tax = taxonomy;
  const modelsOf = (vehicleId: string) => vehicles.find((v) => v.id === vehicleId)?.models ?? [];
  const disabled = !canEdit || busy;
  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{entryId ? l(`ویرایش ${f.partNumber}`, `Edit ${f.partNumber}`) : l('قطعهٔ تازهٔ کاتالوگ', 'New catalog part')}</h2>
        <Button type="button" variant="ghost" icon={<X aria-hidden className="size-4" />} onClick={() => onClose(entryId && !id ? l('ذخیره شد.', 'Saved.') : null)}>{l('بازگشت به فهرست', 'Back to the list')}</Button>
      </div>
      {note ? <Alert tone="warning" title={note} /> : null}
      {errors.general ? <Alert tone="danger" title={errors.general} /> : null}
      {entryId && !id && errors.general === '' ? <Alert tone="success" title={l('ثبت شد؛ حالا می‌توانید عکس اضافه کنید.', 'Saved; you can add photos now.')} /> : null}

      <Section title={l('مشخصات اصلی', 'Main details')} id="ce-main">
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="ce-pn" label={l('شماره فنی', 'Part number')} required hint={l('یکتا؛ فاصله، خط تیره و ارقام فارسی در جست‌وجو مهم نیست.', 'Unique; spaces, dashes and Persian digits do not matter in search.')} {...(errors.partNumber ? { error: errors.partNumber } : {})}>
            <Input id="ce-pn" dir="ltr" value={f.partNumber} onChange={(e) => set('partNumber', e.target.value)} maxLength={80} disabled={disabled} invalid={!!errors.partNumber} />
          </Field>
          {errors.existingId ? (
            <div className="flex items-end"><Button type="button" variant="secondary" onClick={() => onOpen(errors.existingId as string)}>{l('باز کردن آیتم موجود', 'Open the existing entry')}</Button></div>
          ) : <div />}
          <Field id="ce-name-fa" label={l('نام فارسی', 'Persian name')} required {...(errors.nameFa ? { error: errors.nameFa } : {})}>
            <Input id="ce-name-fa" value={f.nameFa} onChange={(e) => set('nameFa', e.target.value)} maxLength={200} disabled={disabled} invalid={!!errors.nameFa} />
          </Field>
          <Field id="ce-name-en" label={l('نام انگلیسی', 'English name')}>
            <Input id="ce-name-en" dir="ltr" value={f.nameEn} onChange={(e) => set('nameEn', e.target.value)} maxLength={200} disabled={disabled} />
          </Field>
          <Field id="ce-eq" label={l('شماره‌های معادل', 'Equivalent numbers')} hint={l('با «،» یا «,» جدا کنید.', 'Separate with commas.')}>
            <Textarea id="ce-eq" dir="ltr" rows={2} value={f.equivalents} onChange={(e) => set('equivalents', e.target.value)} disabled={disabled} />
          </Field>
          <Field id="ce-rp" label={l('شماره‌های جایگزین', 'Replacement numbers')} hint={l('شماره‌ای که جایگزین این قطعه شده است.', 'Numbers that replace this part.')}>
            <Textarea id="ce-rp" dir="ltr" rows={2} value={f.replacements} onChange={(e) => set('replacements', e.target.value)} disabled={disabled} />
          </Field>
          <Field id="ce-maker" label={l('برند قطعه (سازنده)', 'Part brand (maker)')}>
            <Select id="ce-maker" value={f.manufacturerBrandId} onChange={(e) => set('manufacturerBrandId', e.target.value)} disabled={disabled}>
              <option value="">—</option>
              {(tax?.manufacturers ?? []).map((m) => <option key={m.id} value={m.id}>{m.nameFa}</option>)}
            </Select>
          </Field>
          <Field id="ce-cat" label={l('گروه قطعه', 'Part group')}>
            <Select id="ce-cat" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)} disabled={disabled}>
              <option value="">—</option>
              {(tax?.categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.parentId ? '— ' : ''}{c.nameFa}</option>)}
            </Select>
          </Field>
          <Field id="ce-status-f" label={l('وضعیت', 'Status')} hint={l('فقط «منتشرشده» در سایت دیده می‌شود.', 'Only “published” is shown on the site.')}>
            <Select id="ce-status-f" value={f.status} onChange={(e) => set('status', e.target.value as FormState['status'])} disabled={disabled}>
              <option value="DRAFT">{l('پیش‌نویس', 'Draft')}</option>
              <option value="PUBLISHED">{l('منتشرشده', 'Published')}</option>
            </Select>
          </Field>
          <Field id="ce-doc" label={l('سند مبدأ در مرکز دانش', 'Source document in the knowledge center')}>
            <Select id="ce-doc" value={f.sourceDocumentId} onChange={(e) => set('sourceDocumentId', e.target.value)} disabled={disabled}>
              <option value="">—</option>
              {(documents.data ?? []).map((d) => <option key={d.id} value={d.id}>{`${d.title} (${d.version})`}</option>)}
            </Select>
          </Field>
        </div>
      </Section>

      <Section title={l('کاربرد در خودرو', 'Vehicle fitment')} id="ce-fit">
        <fieldset className="mb-4">
          <legend className="mb-2 text-sm font-semibold">{l('برند خودرو (خودروساز)', 'Vehicle brand (maker)')}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {(tax?.vehicleBrands ?? []).map((b) => (
              <Checkbox key={b.id} id={`ce-vb-${b.id}`} label={b.nameFa} checked={f.vehicleBrandIds.includes(b.id)} disabled={disabled}
                onChange={(e) => set('vehicleBrandIds', e.target.checked ? [...f.vehicleBrandIds, b.id] : f.vehicleBrandIds.filter((x) => x !== b.id))} />
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-3">
          {f.vehicles.map((v, i) => (
            <div key={i} className="grid gap-2 rounded-[var(--radius-control)] border border-line-soft p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_7rem_7rem_1fr_auto] lg:items-end">
              <Field id={`ce-v-${i}`} label={l('خودرو', 'Vehicle')}>
                <Select id={`ce-v-${i}`} value={v.vehicleId} disabled={disabled} onChange={(e) => set('vehicles', f.vehicles.map((x, j) => (j === i ? { ...x, vehicleId: e.target.value, modelId: '' } : x)))}>
                  <option value="">—</option>
                  {vehicles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
              </Field>
              <Field id={`ce-m-${i}`} label={l('مدل', 'Model')}>
                <Select id={`ce-m-${i}`} value={v.modelId} disabled={disabled || !modelsOf(v.vehicleId).length} onChange={(e) => set('vehicles', f.vehicles.map((x, j) => (j === i ? { ...x, modelId: e.target.value } : x)))}>
                  <option value="">{l('همهٔ مدل‌ها', 'All models')}</option>
                  {modelsOf(v.vehicleId).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              </Field>
              <Field id={`ce-yf-${i}`} label={l('از سال', 'From year')}>
                <Input id={`ce-yf-${i}`} dir="ltr" inputMode="numeric" maxLength={4} value={v.yearFrom} disabled={disabled} onChange={(e) => set('vehicles', f.vehicles.map((x, j) => (j === i ? { ...x, yearFrom: e.target.value } : x)))} />
              </Field>
              <Field id={`ce-yt-${i}`} label={l('تا سال', 'To year')}>
                <Input id={`ce-yt-${i}`} dir="ltr" inputMode="numeric" maxLength={4} value={v.yearTo} disabled={disabled} onChange={(e) => set('vehicles', f.vehicles.map((x, j) => (j === i ? { ...x, yearTo: e.target.value } : x)))} />
              </Field>
              <Field id={`ce-n-${i}`} label={l('توضیح', 'Note')}>
                <Input id={`ce-n-${i}`} value={v.note} maxLength={200} disabled={disabled} onChange={(e) => set('vehicles', f.vehicles.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} />
              </Field>
              {canEdit ? <Button type="button" variant="ghost" aria-label={l('حذف این ردیف', 'Remove this row')} onClick={() => set('vehicles', f.vehicles.filter((_, j) => j !== i))}><Trash2 aria-hidden className="size-4" /></Button> : null}
            </div>
          ))}
          {canEdit ? <Button type="button" variant="secondary" className="self-start" icon={<Plus aria-hidden className="size-4" />} onClick={() => set('vehicles', [...f.vehicles, { vehicleId: '', modelId: '', yearFrom: '', yearTo: '', note: '' }])}>{l('افزودن خودرو', 'Add vehicle')}</Button> : null}
        </div>
      </Section>

      <Section title={l('مشخصات فنی', 'Technical specifications')} id="ce-specs">
        <div className="flex flex-col gap-2">
          {f.specs.map((s, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
              <Field id={`ce-sl-${i}`} label={l('عنوان', 'Label')}><Input id={`ce-sl-${i}`} value={s.label} maxLength={80} disabled={disabled} onChange={(e) => set('specs', f.specs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} /></Field>
              <Field id={`ce-sv-${i}`} label={l('مقدار', 'Value')}><Input id={`ce-sv-${i}`} dir="auto" value={s.value} maxLength={200} disabled={disabled} onChange={(e) => set('specs', f.specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} /></Field>
              {canEdit ? <Button type="button" variant="ghost" aria-label={l('حذف این مشخصه', 'Remove this spec')} onClick={() => set('specs', f.specs.filter((_, j) => j !== i))}><Trash2 aria-hidden className="size-4" /></Button> : null}
            </div>
          ))}
          {canEdit ? <Button type="button" variant="secondary" className="self-start" icon={<Plus aria-hidden className="size-4" />} onClick={() => set('specs', [...f.specs, { label: '', value: '' }])}>{l('افزودن مشخصه', 'Add a spec')}</Button> : null}
        </div>
      </Section>

      <Section title={l('توضیحات', 'Description')} id="ce-desc">
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="ce-df" label={l('فارسی', 'Persian')}><Textarea id="ce-df" rows={5} value={f.descriptionFa} maxLength={5000} disabled={disabled} onChange={(e) => set('descriptionFa', e.target.value)} /></Field>
          <Field id="ce-de" label={l('انگلیسی', 'English')}><Textarea id="ce-de" dir="ltr" rows={5} value={f.descriptionEn} maxLength={5000} disabled={disabled} onChange={(e) => set('descriptionEn', e.target.value)} /></Field>
        </div>
      </Section>

      <Section title={l('لینک به محصول فروشگاه (اختیاری)', 'Link to a shop product (optional)')} id="ce-product">
        <ProductPicker value={f.product} disabled={disabled} onChange={(p) => set('product', p)} />
      </Section>

      {entryId ? (
        <Section title={l('عکس‌ها', 'Photos')} id="ce-images">
          <EntryImages entryId={entryId} images={images} canEdit={canEdit} onChange={setImages} />
        </Section>
      ) : (
        <p className="text-sm text-steel">{l('پس از ثبت، می‌توانید عکس اضافه کنید.', 'After saving you can add photos.')}</p>
      )}

      {canEdit ? (
        <div className="sticky bottom-0 z-10 flex flex-wrap gap-2 border-t border-line-soft bg-surface/95 py-3 backdrop-blur">
          <Button type="submit" loading={busy}>{entryId ? l('ذخیرهٔ تغییرات', 'Save changes') : l('ثبت قطعه', 'Save part')}</Button>
          <Button type="button" variant="ghost" onClick={() => onClose(entryId && !id ? l('ذخیره شد.', 'Saved.') : null)}>{l('انصراف', 'Cancel')}</Button>
        </div>
      ) : null}
    </form>
  );
}

/** Search a shop product by SKU, technical number or name and link it (only by hand). */
function ProductPicker({ value, disabled, onChange }: { value: FormState['product']; disabled: boolean; onChange: (p: FormState['product']) => void }) {
  const t = useTranslations();
  const l = useL();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Array<{ id: string; sku: string; nameFa: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const search = async () => {
    setError(null);
    try {
      setResults(await api<Array<{ id: string; sku: string; nameFa: string }>>(`/admin/catalog-entries/product-lookup?q=${encodeURIComponent(q.trim())}`));
    } catch (e) {
      setError(errorText(t, e));
    }
  };
  if (value) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span><Code>{value.sku}</Code> <span className="font-semibold" dir="auto">{value.nameFa}</span></span>
        {!disabled ? <Button type="button" variant="ghost" size="sm" icon={<X aria-hidden className="size-4" />} onClick={() => onChange(null)}>{l('حذف لینک', 'Remove link')}</Button> : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-steel">{l('اگر این قطعه در فروشگاه هست، آن را انتخاب کنید تا در سایت دکمهٔ «مشاهده و خرید در فروشگاه» نشان داده شود؛ وگرنه «درخواست تأمین» نشان داده می‌شود.', 'If this part is in the shop, choose it so the site shows “View and buy in the shop”; otherwise “Request this part” is shown.')}</p>
      <div className="flex max-w-xl gap-2">
        <Input id="ce-product-q" aria-label={l('جست‌وجوی محصول با کد کالا، شماره فنی یا نام', 'Search a product by SKU, number or name')} value={q} disabled={disabled} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }} placeholder={l('کد کالا، شماره فنی یا نام', 'SKU, number or name')} />
        <Button type="button" variant="secondary" disabled={disabled || !q.trim()} onClick={() => void search()}><Search aria-hidden className="size-4" /></Button>
      </div>
      {error ? <Alert tone="danger" title={error} /> : null}
      {results ? (results.length ? (
        <ul className="flex max-w-xl flex-col divide-y divide-line-soft rounded-[var(--radius-control)] border border-line-soft">
          {results.map((p) => (
            <li key={p.id}><button type="button" className="flex min-h-11 w-full cursor-pointer items-center gap-3 px-3 py-2 text-start hover:bg-surface" onClick={() => onChange(p)}><Code>{p.sku}</Code><span dir="auto">{p.nameFa}</span></button></li>
          ))}
        </ul>
      ) : <p className="text-sm text-steel">{l('محصولی پیدا نشد.', 'No product found.')}</p>) : null}
    </div>
  );
}

/** Photos of one entry: upload several, change the order (the first is the main photo), remove. */
function EntryImages({ entryId, images, canEdit, onChange }: { entryId: string; images: CatalogEntryImageView[]; canEdit: boolean; onChange: (images: CatalogEntryImageView[]) => void }) {
  const t = useTranslations();
  const l = useL();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sorted = useMemo(() => [...images].sort((a, b) => a.sortOrder - b.sortOrder), [images]);

  const upload = async (files: FileList) => {
    setError(null);
    setBusy(true);
    const added: CatalogEntryImageView[] = [];
    try {
      for (const file of Array.from(files)) {
        if (file.size > PHOTO_MAX_BYTES) { setError(l(`«${file.name}» بزرگ‌تر از ۲۰ مگابایت است.`, `“${file.name}” is larger than 20 MB.`)); continue; }
        const form = new FormData();
        form.append('file', file);
        added.push(await uploadWithProgress<CatalogEntryImageView>(`/admin/catalog-entries/${entryId}/images`, form, setProgress).promise);
      }
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
      setProgress(null);
      onChange([...images, ...added]);
    }
  };
  const move = async (index: number, delta: number) => {
    const next = [...sorted];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(index + delta, 0, item);
    setError(null);
    try {
      await api(`/admin/catalog-entries/${entryId}/images/order`, { method: 'PUT', body: { ids: next.map((i) => i.id) } });
      onChange(next.map((img, i) => ({ ...img, sortOrder: i })));
    } catch (e) {
      setError(errorText(t, e));
    }
  };
  const remove = async (imageId: string) => {
    setError(null);
    try {
      await api(`/admin/catalog-entries/${entryId}/images/${imageId}`, { method: 'DELETE' });
      onChange(images.filter((i) => i.id !== imageId));
    } catch (e) {
      setError(errorText(t, e));
    }
  };
  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert tone="danger" title={error} /> : null}
      {sorted.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {sorted.map((img, i) => (
            <li key={img.id} className="flex flex-col gap-1 rounded-[var(--radius-control)] border border-line-soft p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- panel thumbnail from the public media store */}
              <img src={img.url} alt="" className="aspect-square w-full object-contain" />
              {i === 0 ? <Badge tone="info">{l('عکس اصلی', 'Main photo')}</Badge> : null}
              {canEdit ? (
                <div className="flex justify-between">
                  <Button type="button" size="sm" variant="ghost" disabled={i === 0} aria-label={l('جلوتر', 'Move earlier')} onClick={() => void move(i, -1)}><ArrowUp aria-hidden className="size-4" /></Button>
                  <Button type="button" size="sm" variant="ghost" disabled={i === sorted.length - 1} aria-label={l('عقب‌تر', 'Move later')} onClick={() => void move(i, 1)}><ArrowDown aria-hidden className="size-4" /></Button>
                  <Button type="button" size="sm" variant="ghost" aria-label={l('حذف عکس', 'Remove photo')} onClick={() => void remove(img.id)}><Trash2 aria-hidden className="size-4" /></Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-steel">{l('هنوز عکسی ندارد.', 'No photos yet.')}</p>}
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="ce-images-input" className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-line px-3 font-semibold ${busy ? 'pointer-events-none opacity-60' : ''}`}>
            <Plus aria-hidden className="size-4" />{l('افزودن عکس (چندتایی)', 'Add photos (several)')}
          </label>
          <input id="ce-images-input" type="file" className="sr-only" multiple disabled={busy} accept={[...PHOTO_TYPES, ...PHOTO_EXTENSIONS].join(',')}
            onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = ''; }} />
          {busy ? <progress className="h-2 w-40" max={1} {...(progress !== null ? { value: progress } : {})} aria-label={l('پیشرفت بارگذاری', 'Upload progress')} /> : null}
          <span className="text-xs text-steel">{l('JPG، PNG یا WebP تا ۲۰ مگابایت؛ روی سرور بررسی و به WebP تبدیل می‌شود.', 'JPG, PNG or WebP up to 20 MB; checked and converted to WebP on the server.')}</span>
        </div>
      ) : null}
    </div>
  );
}

const ISSUE_FA: Record<string, [string, string]> = {
  PART_NUMBER_REQUIRED: ['شماره فنی ندارد', 'No part number'],
  PART_NUMBER_TOO_LONG: ['شماره فنی بیش از ۸۰ نویسه', 'Part number longer than 80'],
  NAME_REQUIRED: ['نام فارسی ندارد', 'No Persian name'],
  NAME_TOO_LONG: ['نام بیش از ۲۰۰ نویسه', 'Name longer than 200'],
  SPECS_INVALID: ['مشخصات باید «عنوان: مقدار» باشد', 'Specs must be “label: value”'],
  FITMENT_INVALID: ['سال یا خودرو نامعتبر در «کاربرد»', 'Invalid year or vehicle in fitment'],
  STATUS_INVALID: ['وضعیت باید «پیش‌نویس» یا «منتشرشده» باشد', 'Status must be draft or published'],
  DESCRIPTION_TOO_LONG: ['توضیحات بیش از ۵۰۰۰ نویسه', 'Description longer than 5000'],
  DUPLICATE_IN_FILE: ['همین شماره فنی در ردیف دیگری از فایل هست', 'Same part number in another row of the file'],
};
const WARN_FA: Record<string, [string, string]> = {
  UNKNOWN_MANUFACTURER: ['برند قطعه در پنل نیست', 'Unknown part brand'],
  UNKNOWN_CATEGORY: ['گروه قطعه در پنل نیست', 'Unknown part group'],
  UNKNOWN_VEHICLE_BRAND: ['برند خودرو در پنل نیست', 'Unknown vehicle brand'],
  UNKNOWN_VEHICLE: ['خودرو در پنل نیست', 'Unknown vehicle'],
};

/**
 * Bulk import: sample file → upload → preview (valid rows, rows with errors and why, rows whose
 * part number exists; choose update or skip) → the worker writes. Nothing is written before «ثبت».
 */
function CatalogImport({ onDone }: { onDone: () => void }) {
  const t = useTranslations();
  const l = useL();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<CatalogImportView | null>(null);
  const [filter, setFilter] = useState<'all' | 'errors' | 'duplicates' | 'new'>('all');
  const [duplicates, setDuplicates] = useState<'update' | 'skip'>('skip');
  const [error, setError] = useState<string | null>(null);

  const poll = async (id: string, until: Array<CatalogImportView['status']>, f = filter) => {
    for (let i = 0; i < 300; i += 1) {
      const v = await api<CatalogImportView>(`/admin/catalog-entries/import/${id}?filter=${f}`);
      setJob(v);
      if (until.includes(v.status)) return v;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return null;
  };

  const start = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setError(null); setJob(null); setBusy(true);
    try {
      const form = new FormData();
      form.append('purpose', 'IMPORT');
      form.append('files', file);
      const [uploaded] = await uploadWithProgress<AttachmentView[]>('/attachments', form, () => undefined).promise;
      if (!uploaded || uploaded.status === 'REJECTED') throw new Error(uploaded?.rejectReason ?? 'REJECTED');
      let attachment = uploaded;
      for (let i = 0; i < 60 && attachment.status === 'SCANNING'; i += 1) {
        await new Promise((r) => setTimeout(r, 1000));
        attachment = await api<AttachmentView>(`/attachments/${uploaded.id}`);
      }
      if (attachment.status !== 'READY') throw new Error(l('بررسی امنیتی فایل تمام نشد؛ کمی بعد دوباره امتحان کنید.', 'The security scan did not finish; try again shortly.'));
      const started = await api<{ id: string }>('/admin/catalog-entries/import', { method: 'POST', body: { attachmentId: attachment.id } });
      await poll(started.id, ['PREVIEW_READY', 'FAILED']);
    } catch (err) {
      setError(isApiError(err) ? errorText(t, err) : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!job) return;
    setError(null); setBusy(true);
    try {
      await api(`/admin/catalog-entries/import/${job.id}/commit`, { method: 'POST', body: { duplicates } });
      const done = await poll(job.id, ['COMMITTED', 'FAILED']);
      if (done?.status === 'COMMITTED') onDone();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  const changeFilter = async (f: typeof filter) => {
    setFilter(f);
    if (job) setJob(await api<CatalogImportView>(`/admin/catalog-entries/import/${job.id}?filter=${f}`));
  };
  const s = job?.summary;
  const issue = (code: string) => { const x = ISSUE_FA[code]; return x ? l(x[0], x[1]) : code; };
  const warning = (w: string) => { const [code, ...rest] = w.split(':'); const x = WARN_FA[code ?? '']; return `${x ? l(x[0], x[1]) : code}: ${rest.join(':')}`; };

  return (
    <Section title={l('ورود گروهی قطعات کاتالوگ', 'Bulk import of catalog parts')} id="ce-import">
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-6 text-steel">
          {l('فایل نمونه را بگیرید، در شیت اول هر قطعه را در یک ردیف بنویسید و بارگذاری کنید. پیش از ثبت، پیش‌نمایش نشان داده می‌شود. ستونی که در فایل نباشد، در به‌روزرسانی دست نمی‌خورد. نام‌هایی که در پنل نیستند (برند، گروه، خودرو) ساخته نمی‌شوند و هشدار می‌گیرند.', 'Download the sample, write one part per row in the first sheet and upload it. A preview is shown before anything is saved. Columns missing from the file are left unchanged on update. Names that are not in the panel (brand, group, vehicle) are not created; you get a warning.')}
        </p>
        <a href="/api/v1/admin/catalog-entries/import/template" download className="inline-flex min-h-11 items-center gap-2 self-start font-semibold text-action underline underline-offset-4">
          <Download aria-hidden className="size-4" />{l('دانلود فایل نمونه (Excel)', 'Download the sample file (Excel)')}
        </a>
        <form onSubmit={start} className="flex flex-wrap items-end gap-3">
          <Field id="ce-import-file" label={l('فایل Excel یا CSV', 'Excel or CSV file')} className="min-w-64">
            <Input id="ce-import-file" type="file" accept=".xlsx,.csv" disabled={busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
          <Button type="submit" loading={busy && !job} disabled={!file || busy}>{l('بارگذاری و پیش‌نمایش', 'Upload and preview')}</Button>
        </form>
        {error ? <Alert tone="danger" title={error} /> : null}
        {job ? (
          job.status === 'FAILED' ? (
            <Alert tone="danger" title={job.failureReason === 'MISSING_COLUMNS'
              ? l(`ستون‌های الزامی در فایل نیست: ${job.missingColumns.map((c) => (c === 'partNumber' ? 'شماره فنی' : c === 'nameFa' ? 'نام فارسی' : c)).join('، ')}`, `Required columns are missing: ${job.missingColumns.join(', ')}`)
              : l('فایل خوانده نشد. آن را با فایل نمونه مقایسه کنید.', 'The file could not be read. Compare it with the sample file.')} />
          ) : job.status === 'QUEUED' || job.status === 'PARSING' ? (
            <p className="text-sm text-steel">{l('در حال خواندن فایل…', 'Reading the file…')}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {s ? (
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge>{l(`کل ردیف‌ها: ${s.total}`, `Rows: ${s.total}`)}</Badge>
                  <Badge tone="success">{l(`معتبر و تازه: ${s.valid}`, `Valid new: ${s.valid}`)}</Badge>
                  <Badge tone="warning">{l(`شماره فنی موجود: ${s.duplicates}`, `Existing part number: ${s.duplicates}`)}</Badge>
                  <Badge tone="danger">{l(`دارای خطا: ${s.errors}`, `With errors: ${s.errors}`)}</Badge>
                  {s.created !== undefined ? <Badge tone="info">{l(`ثبت شد: ${s.created} تازه، ${s.updated ?? 0} به‌روز، ${s.skipped ?? 0} رد`, `Saved: ${s.created} new, ${s.updated ?? 0} updated, ${s.skipped ?? 0} skipped`)}</Badge> : null}
                </div>
              ) : null}
              {job.truncated ? <Alert tone="warning" title={l('فقط ۲۰۰۰ ردیف اول خوانده شد.', 'Only the first 2000 rows were read.')} /> : null}
              {job.status === 'PREVIEW_READY' ? (
                <fieldset className="flex flex-wrap items-center gap-4">
                  <legend className="mb-1 text-sm font-semibold">{l('ردیف‌هایی که شماره فنی‌شان از قبل هست:', 'Rows whose part number already exists:')}</legend>
                  <label className="inline-flex min-h-11 items-center gap-2"><input type="radio" name="ce-dup" checked={duplicates === 'skip'} onChange={() => setDuplicates('skip')} />{l('رد شوند (بدون تغییر)', 'Skip them (no change)')}</label>
                  <label className="inline-flex min-h-11 items-center gap-2"><input type="radio" name="ce-dup" checked={duplicates === 'update'} onChange={() => setDuplicates('update')} />{l('به‌روزرسانی شوند', 'Update them')}</label>
                  <Button type="button" loading={busy} disabled={!s || s.valid + s.duplicates === 0} onClick={() => void commit()}>{l('ثبت در کاتالوگ', 'Save to the catalog')}</Button>
                </fieldset>
              ) : job.status === 'COMMITTING' ? <p className="text-sm text-steel">{l('در حال ثبت…', 'Saving…')}</p> : null}
              <div className="flex flex-wrap gap-2">
                {(['all', 'new', 'duplicates', 'errors'] as const).map((f) => (
                  <Button key={f} type="button" size="sm" variant={filter === f ? 'primary' : 'secondary'} onClick={() => void changeFilter(f)}>
                    {f === 'all' ? l('همه', 'All') : f === 'new' ? l('تازه', 'New') : f === 'duplicates' ? l('موجود', 'Existing') : l('خطادار', 'Errors')}
                  </Button>
                ))}
              </div>
              <TableScroll caption={l('پیش‌نمایش ورود گروهی', 'Bulk import preview')}>
                <thead><tr><th className={th}>{l('ردیف', 'Row')}</th><th className={th}>{l('شماره فنی', 'Part number')}</th><th className={th}>{l('نام', 'Name')}</th><th className={th}>{l('وضعیت', 'State')}</th><th className={th}>{l('توضیح', 'Details')}</th></tr></thead>
                <tbody>
                  {job.rows.map((r) => (
                    <tr key={r.rowNumber}>
                      <td className={td}>{r.rowNumber}</td>
                      <td className={td}><Code>{r.partNumber || '—'}</Code></td>
                      <td className={td} dir="auto">{r.nameFa || '—'}</td>
                      <td className={td}>{r.state === 'NEW' ? <Badge tone="success">{l('تازه', 'New')}</Badge> : r.state === 'DUPLICATE' ? <Badge tone="warning">{l('موجود', 'Exists')}</Badge> : <Badge tone="danger">{l('خطا', 'Error')}</Badge>}</td>
                      <td className={td}>
                        {r.issues.length ? <ul className="text-sm text-danger">{r.issues.map((i) => <li key={i}>{issue(i)}</li>)}{r.details.map((d) => <li key={d} className="text-xs" dir="auto">«{d}»</li>)}</ul> : null}
                        {r.warnings.length ? <ul className="text-xs text-steel">{r.warnings.map((w) => <li key={w} dir="auto">{warning(w)}</li>)}</ul> : null}
                        {!r.issues.length && !r.warnings.length ? '—' : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableScroll>
            </div>
          )
        ) : null}
      </div>
    </Section>
  );
}
