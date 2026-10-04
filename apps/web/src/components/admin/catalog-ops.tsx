'use client';

import type { AttachmentView } from '@hedax/contracts';
import { CLEARABLE_IMPORT_COLUMNS, describeImportCode, formatMoney, importColumnLabel, importFieldLabel, money } from '@hedax/domain';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Async } from '@/components/ui/async';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select } from '@/components/ui/field';
import { DateTime, Num } from '@/components/ui/format';
import { Alert, Badge, EmptyState, Ltr, PageHeader, Section, TableScroll, td, th } from '@/components/ui/misc';
import { api, newIdempotencyKey, uploadWithProgress } from '@/lib/api/client';
import { errorText, isApiError } from '@/lib/api/errors';
import { useApi } from '@/lib/use-api';
import { useCodeLabel, useL } from './shell';

interface InvRow { productId: string; sku: string; nameFa: string; onHand: number; reserved: number; available: number; lowStockThreshold: number; isLow: boolean; version: number; updatedAt: string }

export function InventoryPage() {
  const t = useTranslations();
  const l = useL();
  const search = useSearchParams();
  const [low, setLow] = useState(search.get('lowStock') === '1');
  const state = useApi<{ items: InvRow[]; total: number }>(`/admin/inventory?pageSize=100${low ? '&lowStock=1' : ''}`);
  const [target, setTarget] = useState<InvRow | null>(null);
  const [ledgerFor, setLedgerFor] = useState<InvRow | null>(null);
  return (
    <>
      <PageHeader title={t('admin.inventory')} description={l('موجودی قابل فروش = موجودی فیزیکی − رزروشده. شمارش جدید نمی‌تواند کمتر از رزروشده باشد.', 'Available = on hand − reserved. A new count can never be lower than reserved.')} />
      <Checkbox id="inv-low" label={t('admin.lowStock')} checked={low} onChange={(e) => setLow(e.target.checked)} className="mb-3" />
      <Async state={state}>
        {(data) => data.items.length ? (
          <TableScroll caption={t('admin.inventory')}>
            <thead><tr><th className={th}>{t('admin.sku')}</th><th className={th}>{t('admin.name')}</th><th className={th}>{t('admin.onHand')}</th><th className={th}>{t('admin.reserved')}</th><th className={th}>{t('admin.available')}</th><th className={th} /></tr></thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.productId}>
                  <td className={td}><Ltr>{r.sku}</Ltr></td>
                  <td className={td}>{r.nameFa}</td>
                  <td className={td}><Num value={r.onHand} /></td>
                  <td className={td}><Num value={r.reserved} /></td>
                  <td className={td}>{r.isLow ? <Badge tone="warning"><Num value={r.available} /></Badge> : <Num value={r.available} />}</td>
                  <td className={td}>
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setTarget(r)}>{t('admin.adjustStock')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setLedgerFor(r)}>{t('admin.ledger')}</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        ) : <EmptyState title={t('parts.empty')} />}
      </Async>
      {target ? <AdjustDialog row={target} onClose={() => { setTarget(null); void state.reload(); }} /> : null}
      {ledgerFor ? <LedgerDialog row={ledgerFor} onClose={() => setLedgerFor(null)} /> : null}
    </>
  );
}

function AdjustDialog({ row, onClose }: { row: InvRow; onClose: () => void }) {
  const t = useTranslations();
  const l = useL();
  const reserved = new Intl.NumberFormat(useLocale() === 'fa' ? 'fa-IR' : 'en-US').format(row.reserved);
  const [count, setCount] = useState(String(row.onHand));
  const [reason, setReason] = useState('PHYSICAL_COUNT');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 0) { setError(t('validation.invalidNumber')); return; }
    if (n < row.reserved) { setError(l(`شمارش نمی‌تواند کمتر از رزروشده (${reserved}) باشد.`, `Count cannot be below reserved (${reserved}).`)); return; }
    setBusy(true);
    try {
      await api('/admin/inventory/adjust', { method: 'POST', body: { productId: row.productId, newOnHand: n, reason, note: note || undefined, expectedVersion: row.version } });
      onClose();
    } catch (e) {
      setError(errorText(t, e));
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`${t('admin.adjustStock')} — ${row.sku}`} closeLabel={t('common.close')}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex flex-col gap-4">
        <Field id="adj-count" label={t('admin.newOnHand')} error={error ?? undefined} hint={`${t('admin.reserved')}: ${reserved}`} required>
          <Input id="adj-count" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} invalid={!!error} />
        </Field>
        <Field id="adj-reason" label={t('admin.adjustReason')}>
          <Select id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="PHYSICAL_COUNT">{l('شمارش فیزیکی', 'Physical count')}</option>
            <option value="RECEIVED">{l('ورود کالا', 'Goods received')}</option>
            <option value="DAMAGED">{l('آسیب‌دیده', 'Damaged')}</option>
            <option value="LOST">{l('مفقود', 'Lost')}</option>
            <option value="CORRECTION">{l('اصلاح', 'Correction')}</option>
          </Select>
        </Field>
        <Field id="adj-note" label={l('یادداشت', 'Note')} optionalLabel={t('common.optional')}><Input id="adj-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <Button type="submit" loading={busy}>{t('common.save')}</Button>
      </form>
    </Dialog>
  );
}

function LedgerDialog({ row, onClose }: { row: InvRow; onClose: () => void }) {
  const t = useTranslations();
  const label = useCodeLabel();
  const state = useApi<Array<{ id: string; type: string; onHandDelta: number; reservedDelta: number; onHandAfter: number; reservedAfter: number; reason: string; createdAt: string }>>(`/admin/inventory/${row.productId}/movements`);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`${t('admin.ledger')} — ${row.sku}`} closeLabel={t('common.close')}>
      <Async state={state}>
        {(rows) => (
          <ul className="flex flex-col gap-2 text-sm">
            {rows.map((m) => (
              <li key={m.id} className="rounded bg-surface p-2">
                <span className="font-semibold">{label('movement', m.type)}</span> · {label('movementReason', m.reason)}
                <span className="block text-xs"><Ltr>Δ {m.onHandDelta} / {m.reservedDelta} → {m.onHandAfter} / {m.reservedAfter}</Ltr></span>
                <span className="block text-xs text-steel"><DateTime iso={m.createdAt} /></span>
              </li>
            ))}
          </ul>
        )}
      </Async>
    </Dialog>
  );
}

interface ImportPreview {
  jobId: string; status: string; mode: string; progress: number; totalRows: number | null; failureReason: string | null;
  summary: {
    create: number; update: number; unchanged: number; error: number; warnings: number; canCommit: boolean; fileErrors: string[];
    /** Template columns read from the file, and file columns that matched nothing (ignored). */
    columns?: string[]; ignoredHeaders?: string[];
  } | null;
  planChecksum: string | null;
  rows: Array<{ rowNumber: number; sku: string | null; action: string; issues: Array<{ column: string | null; code: string; severity: string }>; changes: ImportChange[] }>;
}

interface ImportChange { field: string; before: string | null; after: string | null; currency?: 'IRR' | 'AED' }

/** A preview value in the reader's terms: money with its unit, localized choices and counts; text as typed. */
function useChangeValue(): (change: ImportChange, value: string | null) => string {
  const t = useTranslations();
  const l = useL();
  const locale = useLocale() as 'fa' | 'en';
  const choice: Record<string, string> = { partType: 'partType', condition: 'condition', origin: 'origin' };
  return (change, value) => {
    if (value === null || value === '') return '—';
    if (change.currency && /^-?\d+$/.test(value)) return formatMoney(money(change.currency, BigInt(value)), locale);
    const ns = choice[change.field];
    if (ns && t.has(`${ns}.${value}`)) return t(`${ns}.${value}` as never);
    if (change.field === 'isActive') return value === 'true' ? l('فعال', 'Active') : l('غیرفعال', 'Inactive');
    if (/^-?\d+$/.test(value) && ['onHand', 'lowStockThreshold'].includes(change.field)) return new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-US').format(Number(value));
    return value;
  };
}

/** Upload → validate & preview (no writes) → apply everything or nothing (spec §12). */
export function ImportsPage() {
  const t = useTranslations();
  const l = useL();
  const label = useCodeLabel();
  const locale = useLocale() as 'fa' | 'en';
  const changeValue = useChangeValue();
  const [mode, setMode] = useState<'UPDATE_ONLY' | 'CREATE_AND_UPDATE'>('UPDATE_ONLY');
  const [clear, setClear] = useState<string[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idem = useRef(newIdempotencyKey());

  useEffect(() => {
    if (!jobId) return;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const p = await api<ImportPreview>(`/admin/imports/${jobId}`).catch(() => null);
      if (p) setPreview(p);
      if (!p || ['QUEUED', 'PARSING', 'COMMITTING'].includes(p.status)) timer = setTimeout(poll, 1500);
    };
    void poll();
    return () => clearTimeout(timer);
  }, [jobId]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append('purpose', 'IMPORT');
      form.append('files', file);
      const [att] = await uploadWithProgress<AttachmentView[]>('/attachments', form, () => undefined).promise;
      if (!att || att.status === 'REJECTED') throw new Error(att?.rejectReason ?? 'REJECTED');
      let current = att;
      for (let i = 0; i < 30 && current.status === 'SCANNING'; i += 1) {
        await new Promise((r) => setTimeout(r, 1500));
        current = await api<AttachmentView>(`/attachments/${att.id}`);
      }
      if (current.status !== 'READY') throw new Error(current.rejectReason ?? current.status);
      idem.current = newIdempotencyKey();
      const res = await api<{ jobId: string }>('/admin/imports', { method: 'POST', idempotencyKey: idem.current, body: { attachmentId: att.id, mode, clearWhenEmpty: clear, manufacturerBrandMapping: {} } });
      setJobId(res.jobId);
    } catch (e) {
      setMessage(isApiError(e) ? errorText(t, e) : t.has(`files.rejected_${(e as Error).message}`) ? t(`files.rejected_${(e as Error).message}` as never) : t('files.rejected_default'));
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!preview?.planChecksum) return;
    try {
      await api(`/admin/imports/${preview.jobId}/commit`, { method: 'POST', body: { planChecksum: preview.planChecksum } });
      setJobId(null);
      setTimeout(() => setJobId(preview.jobId), 50);
    } catch (e) {
      setMessage(errorText(t, e));
    }
  };

  return (
    <>
      <PageHeader title={t('admin.imports')} actions={
        <div className="flex flex-wrap gap-2">
          <a href="/api/v1/admin/imports/template" download className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-action px-4 font-semibold text-action hover:bg-action-soft"><Download aria-hidden className="size-4" />{t('admin.template')}</a>
          <a href="/api/v1/admin/exports/products.xlsx" download className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line px-4 font-semibold hover:bg-surface"><FileSpreadsheet aria-hidden className="size-4" />{t('admin.exportProducts')}</a>
        </div>
      } />
      <Section title={t('admin.uploadImport')} id="imp-upload">
        <div className="flex flex-wrap items-end gap-4">
          <Field id="imp-mode" label={t('admin.mode')}>
            <Select id="imp-mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="UPDATE_ONLY">{t('admin.mode_UPDATE_ONLY')}</option>
              <option value="CREATE_AND_UPDATE">{t('admin.mode_CREATE_AND_UPDATE')}</option>
            </Select>
          </Field>
          <input id="imp-file" type="file" accept=".xlsx,.csv" className="sr-only" disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} />
          <label htmlFor="imp-file" className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] bg-action px-4 font-semibold text-white hover:bg-action-hover ${busy ? 'pointer-events-none opacity-60' : ''}`}>
            <Upload aria-hidden className="size-4" />{t('admin.uploadImport')}
          </label>
        </div>
        <p className="mt-3 text-sm text-steel">{l('فقط XLSX یا CSV، حداکثر ۵۰۰۰ ردیف. سلول خالی در به‌روزرسانی یعنی «بدون تغییر». هیچ محصولی با فایل حذف نمی‌شود.', 'XLSX or CSV only, up to 5000 rows. Empty cells in update mean “no change”. The file never deletes products.')}</p>
        <fieldset className="mt-3">
          <legend className="text-sm font-semibold">{l('پاک‌کردن مقدار با سلول خالی (فقط کالاهای موجود)', 'Clear values with empty cells (existing products only)')}</legend>
          <p className="text-xs text-steel">{l('فقط ستون‌هایی را انتخاب کنید که سلول خالی‌شان باید مقدار فعلی را پاک کند؛ بقیه بدون تغییر می‌مانند.', 'Choose only the columns whose empty cells should clear the current value; all others stay unchanged.')}</p>
          <div className="flex flex-wrap gap-x-4">
            {CLEARABLE_IMPORT_COLUMNS.map((c) => (
              <Checkbox key={c} id={`imp-clear-${c}`} label={importColumnLabel(c, locale)} checked={clear.includes(c)}
                onChange={(e) => setClear((list) => (e.target.checked ? [...list, c] : list.filter((x) => x !== c)))} />
            ))}
          </div>
        </fieldset>
        {message ? <Alert tone="danger" className="mt-3" title={message} /> : null}
      </Section>
      {preview ? (
        <Section title={t('admin.preview')} id="imp-preview">
          <p className="mb-3">{l('وضعیت', 'Status')}: <Badge>{label('importStatus', preview.status)}</Badge> {preview.failureReason ? <span className="text-danger">{describeImportCode(preview.failureReason, locale)}</span> : null}</p>
          {['QUEUED', 'PARSING', 'COMMITTING'].includes(preview.status) ? (
            <progress className="mb-3 w-full" max={100} value={preview.progress} aria-label={label('importStatus', preview.status)} />
          ) : null}
          {preview.summary?.columns?.length ? (
            <p className="mb-2 text-sm">{l('ستون‌های خوانده‌شده', 'Columns read')}: {preview.summary.columns.map((c) => importColumnLabel(c, locale)).join(locale === 'fa' ? '، ' : ', ')}</p>
          ) : null}
          {preview.summary?.ignoredHeaders?.length ? (
            <Alert tone="warning" className="mb-3" title={l('این ستون‌های فایل شناخته نشدند و وارد نمی‌شوند', 'These file columns were not recognized and are ignored')}>
              <p><bdi>{preview.summary.ignoredHeaders.join(' · ')}</bdi></p>
              <p className="text-sm">{l('اگر لازم‌اند، عنوانشان را مطابق قالب (فارسی یا کلید انگلیسی) بنویسید و دوباره بارگذاری کنید.', 'If they matter, rename them to the template headers (Persian or the English key) and upload again.')}</p>
            </Alert>
          ) : null}
          {preview.summary?.fileErrors.length ? (
            <Alert tone="danger" className="mb-3" title={t('admin.importFileErrors')}>
              <ul className="list-disc ps-5">{preview.summary.fileErrors.map((code) => <li key={code}>{describeImportCode(code, locale)}</li>)}</ul>
            </Alert>
          ) : null}
          {preview.summary ? (
            <ul className="mb-4 flex flex-wrap gap-2">
              <li><Badge tone="info">{t('admin.summaryCreate')}: <Num value={preview.summary.create} /></Badge></li>
              <li><Badge tone="info">{t('admin.summaryUpdate')}: <Num value={preview.summary.update} /></Badge></li>
              <li><Badge>{t('admin.summaryUnchanged')}: <Num value={preview.summary.unchanged} /></Badge></li>
              <li><Badge tone={preview.summary.error ? 'danger' : 'success'}>{t('admin.summaryError')}: <Num value={preview.summary.error} /></Badge></li>
            </ul>
          ) : null}
          {preview.rows.length ? (
            <TableScroll caption={t('admin.preview')}>
              <thead><tr><th className={th}>#</th><th className={th}>{t('admin.sku')}</th><th className={th}>{l('عملیات', 'Action')}</th><th className={th}>{l('تغییرات / خطاها', 'Changes / issues')}</th></tr></thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.rowNumber}>
                    <td className={td}><Num value={r.rowNumber} /></td>
                    <td className={td}><Ltr>{r.sku ?? '—'}</Ltr></td>
                    <td className={td}><Badge tone={r.action === 'ERROR' ? 'danger' : 'info'}>{label('importAction', r.action)}</Badge></td>
                    <td className={td}>
                      {r.issues.map((i, k) => (
                        <span key={k} className={`block text-xs ${i.severity === 'error' ? 'text-danger' : 'text-warning'}`}>
                          {i.column ? <strong>{importColumnLabel(i.column, locale)}: </strong> : null}{describeImportCode(i.code, locale)}
                        </span>
                      ))}
                      {r.changes.map((c, k) => (
                        <span key={k} className="block text-xs">
                          <strong>{importFieldLabel(c.field, locale)}: </strong>
                          <bdi>{changeValue(c, c.before)}</bdi> {locale === 'fa' ? '←' : '→'} <bdi>{changeValue(c, c.after)}</bdi>
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a href={`/api/v1/admin/imports/${preview.jobId}/errors.xlsx?locale=${locale}`} download className="inline-flex min-h-11 items-center gap-2 font-semibold text-action underline"><Download aria-hidden className="size-4" />{t('admin.errorReport')}</a>
            {preview.status === 'PREVIEW_READY' ? (
              preview.summary?.canCommit ? <Button onClick={() => void commit()}>{t('admin.apply')}</Button> : <Alert tone="warning" title={t('admin.importBlocked')} />
            ) : null}
          </div>
        </Section>
      ) : null}
    </>
  );
}

interface TaxonomyFull {
  categories: Array<{ id: string; code: string; slug: string; nameFa: string; nameEn: string | null; active: boolean }>;
  vehicleBrands: Array<{ id: string; code: string; slug: string; nameFa: string; nameEn: string | null; isFeatured: boolean; active: boolean }>;
  manufacturers: Array<{ id: string; nameFa: string; nameEn: string | null }>;
}

export function TaxonomyPage() {
  const t = useTranslations();
  const l = useL();
  const state = useApi<TaxonomyFull>('/admin/taxonomy');
  const [kind, setKind] = useState<'categories' | 'vehicle-brands' | 'manufacturer-brands'>('categories');
  const [v, setV] = useState({ code: '', nameFa: '', nameEn: '' });
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    setError(null);
    try {
      const body = kind === 'manufacturer-brands' ? { nameFa: v.nameFa, nameEn: v.nameEn || null } : { code: v.code.toUpperCase(), nameFa: v.nameFa, nameEn: v.nameEn || null, sortOrder: 0, active: true, ...(kind === 'vehicle-brands' ? { isFeatured: false } : {}) };
      await api(`/admin/${kind}`, { method: 'POST', body });
      setV({ code: '', nameFa: '', nameEn: '' });
      await state.reload();
    } catch (e) {
      setError(errorText(t, e));
    }
  };
  return (
    <>
      <PageHeader title={t('admin.taxonomy')} description={l('فهرست برندها قابل توسعه است؛ درخواست تأمین برای برندهای خارج از فهرست هم با نام آزاد پذیرفته می‌شود.', 'Brand lists are extensible; sourcing requests also accept free-text brands outside the list.')} />
      <Async state={state}>
        {(data) => (
          <div className="grid gap-6 lg:grid-cols-3">
            <Section title={t('parts.category')} id="tx-cat"><ul className="text-sm">{data.categories.map((c) => <li key={c.id} className="py-1"><Ltr>{c.code}</Ltr> — {l(c.nameFa, c.nameEn ?? c.nameFa)}</li>)}</ul></Section>
            <Section title={t('parts.vehicleBrands')} id="tx-vb"><ul className="text-sm">{data.vehicleBrands.map((c) => <li key={c.id} className="py-1"><Ltr>{c.code}</Ltr> — {l(c.nameFa, c.nameEn ?? c.nameFa)}{c.isFeatured ? ' ★' : ''}</li>)}</ul></Section>
            <Section title={t('parts.manufacturer')} id="tx-mb"><ul className="text-sm">{data.manufacturers.map((c) => <li key={c.id} className="py-1">{l(c.nameFa, c.nameEn ?? c.nameFa)}</li>)}</ul></Section>
          </div>
        )}
      </Async>
      <Section title={t('common.add')} id="tx-add">
        <div className="grid gap-3 md:grid-cols-4">
          <Field id="tx-kind" label={l('نوع', 'Type')}>
            <Select id="tx-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="categories">{t('parts.category')}</option>
              <option value="vehicle-brands">{t('parts.vehicleBrands')}</option>
              <option value="manufacturer-brands">{t('parts.manufacturer')}</option>
            </Select>
          </Field>
          {kind !== 'manufacturer-brands' ? <Field id="tx-code" label={l('کد', 'Code')} hint="A-Z, 0-9, _"><Input id="tx-code" dir="ltr" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} /></Field> : null}
          <Field id="tx-fa" label={`${t('admin.name')} (فارسی)`}><Input id="tx-fa" value={v.nameFa} onChange={(e) => setV({ ...v, nameFa: e.target.value })} /></Field>
          <Field id="tx-en" label={`${t('admin.name')} (English)`}><Input id="tx-en" dir="ltr" value={v.nameEn} onChange={(e) => setV({ ...v, nameEn: e.target.value })} /></Field>
        </div>
        {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
        <Button className="mt-3" onClick={() => void create()}>{t('common.add')}</Button>
      </Section>
    </>
  );
}
