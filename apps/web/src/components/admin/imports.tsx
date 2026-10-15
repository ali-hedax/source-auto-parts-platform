'use client';

import type { AttachmentView, ImportJobListItem, ImportJobView, ImportOutline, ImportRowView, ImportSettings, ImportedProductView, MeView } from '@hedax/contracts';
import { CLEARABLE_IMPORT_COLUMNS, TEMPLATE_COLUMNS, describeImportCode, formatMoney, importColumnLabel, importFieldLabel, mapHeaders, money } from '@hedax/domain';
import { ArrowLeft, ArrowRight, CheckCircle2, Download, FileSpreadsheet, Images, KeyRound, Upload } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState, type DragEvent } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select } from '@/components/ui/field';
import { DateTime, Num } from '@/components/ui/format';
import { Alert, Badge, Code, DefinitionList, EmptyState, PageHeader, Section, TableScroll, td, th } from '@/components/ui/misc';
import { Link, useRouter } from '@/i18n/navigation';
import { api, newIdempotencyKey, uploadWithProgress } from '@/lib/api/client';
import { errorText, isApiError } from '@/lib/api/errors';
import { useApi } from '@/lib/use-api';
import { ProductPhotoManager } from './product-photos';
import { useCodeLabel, useL } from './shell';

const BUSY: ReadonlyArray<ImportJobView['status']> = ['INSPECTING', 'QUEUED', 'PARSING', 'COMMITTING'];
const IMPORT_MAX_BYTES = 20 * 1024 * 1024;
type Filter = 'all' | 'errors' | 'create' | 'update' | 'unchanged' | 'warnings';

interface Taxonomy {
  categories: Array<{ id: string; code: string; nameFa: string; nameEn: string | null; active: boolean }>;
  vehicleBrands: Array<{ id: string; code: string; nameFa: string; nameEn: string | null; active: boolean }>;
  manufacturers: Array<{ id: string; nameFa: string; nameEn: string | null; active: boolean }>;
  units: Array<{ id: string; name: string; nameEn: string | null; active: boolean }>;
}

function useNumber(): (n: number) => string {
  const locale = useLocale();
  return (n) => new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-US').format(n);
}

function TemplateLinks() {
  const t = useTranslations();
  return (
    <div className="flex flex-wrap gap-2">
      <a href="/api/v1/admin/imports/template" download className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-white px-4 text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-surface"><Download aria-hidden className="size-4" />{t('admin.template')}</a>
      <a href="/api/v1/admin/exports/products.xlsx" download className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-white px-4 text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-surface"><FileSpreadsheet aria-hidden className="size-4" />{t('admin.exportProducts')}</a>
    </div>
  );
}

/** Numbered steps of one import; the current one is marked for assistive technology too. */
function Steps({ current }: { current: 1 | 2 | 3 | 4 | 5 }) {
  const l = useL();
  const num = useNumber();
  const steps = [l('بارگذاری فایل', 'Upload'), l('تطبیق ستون‌ها', 'Match columns'), l('پیش‌نمایش', 'Preview'), l('ثبت', 'Apply'), l('افزودن عکس', 'Add photos')];
  return (
    <ol className="mb-6 flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label={l('مراحل واردکردن', 'Import steps')}>
      {steps.map((s, i) => {
        const n = i + 1;
        const state = n < current ? 'done' : n === current ? 'current' : 'next';
        return (
          <li key={s} className="flex items-center gap-2" {...(state === 'current' ? { 'aria-current': 'step' as const } : {})}>
            <span className={`grid size-7 place-items-center rounded-full text-xs font-bold ${state === 'current' ? 'bg-action text-white' : state === 'done' ? 'bg-success/15 text-success' : 'border border-line-strong text-steel'}`}>
              {state === 'done' ? <CheckCircle2 aria-hidden className="size-4" /> : num(n)}
            </span>
            <span className={state === 'current' ? 'font-semibold text-ink' : 'text-steel'}>{s}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Step 1: upload (and the list of recent imports)
// ---------------------------------------------------------------------------

/** Upload → security check → the worker reads the sheets → the job page asks how to read them. */
export function ImportsPage() {
  const t = useTranslations();
  const l = useL();
  const label = useCodeLabel();
  const router = useRouter();
  const recent = useApi<ImportJobListItem[]>('/admin/imports');
  const [progress, setProgress] = useState<number | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const start = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    if (!/\.(xlsx|csv)$/i.test(file.name)) return setMessage(t('files.rejected_IMPORT_FORMAT_NOT_ALLOWED'));
    if (file.size > IMPORT_MAX_BYTES) return setMessage(t('files.rejected_FILE_TOO_LARGE'));
    try {
      setPhase(l('در حال بارگذاری فایل…', 'Uploading the file…'));
      setProgress(0);
      const form = new FormData();
      form.append('purpose', 'IMPORT');
      form.append('files', file);
      const [att] = await uploadWithProgress<AttachmentView[]>('/attachments', form, setProgress).promise;
      if (!att || att.status === 'REJECTED') throw new Error(att?.rejectReason ?? 'REJECTED');
      setPhase(l('بررسی امنیتی فایل…', 'Checking the file…'));
      setProgress(null);
      let current = att;
      for (let i = 0; i < 60 && current.status === 'SCANNING'; i += 1) {
        await new Promise((r) => setTimeout(r, 1000));
        current = await api<AttachmentView>(`/attachments/${att.id}`);
      }
      if (current.status === 'SCANNING') throw new Error('SCAN_PENDING');
      if (current.status !== 'READY') throw new Error(current.rejectReason ?? current.status);
      setPhase(l('در حال خواندن شیت‌ها…', 'Reading the sheets…'));
      const job = await api<{ jobId: string }>('/admin/imports/inspect', { method: 'POST', idempotencyKey: newIdempotencyKey(), body: { attachmentId: att.id } });
      router.push(`/admin/imports/${job.jobId}`);
    } catch (e) {
      setPhase(null);
      setProgress(null);
      const reason = (e as Error).message;
      setMessage(isApiError(e) ? errorText(t, e)
        : reason === 'SCAN_PENDING' ? l('بررسی امنیتی فایل هنوز تمام نشده است. چند دقیقه بعد دوباره بارگذاری کنید؛ اگر تکرار شد، سرویس پردازش (worker) را بررسی کنید.', 'The security check has not finished yet. Upload again in a few minutes; if this repeats, check the background worker.')
        : t.has(`files.rejected_${reason}`) ? t(`files.rejected_${reason}` as never) : t('files.rejected_default'));
    }
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    void start(e.dataTransfer.files[0]);
  };

  return (
    <>
      <PageHeader title={t('admin.imports')} description={l('مشخصات، قیمت و موجودی قطعات را از Excel وارد کنید؛ پیش از هر تغییری پیش‌نمایش را می‌بینید و پس از ثبت برای هر قطعه عکس می‌گذارید.', 'Bring parts’ details, prices and stock in from Excel: you see a preview before anything changes, then add photos to each part.')} actions={<TemplateLinks />} />
      <Steps current={1} />
      <Section title={t('admin.uploadImport')} id="imp-upload">
        <label
          htmlFor="imp-file"
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed px-4 py-8 text-center transition-colors ${dragging ? 'border-action bg-action/5' : 'border-line-strong bg-surface hover:border-ink'} has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-tech ${phase ? 'pointer-events-none opacity-70' : ''}`}
        >
          <Upload aria-hidden className="size-7 text-action" />
          <span className="font-semibold">{l('انتخاب فایل Excel یا کشیدن و رها کردن در اینجا', 'Choose an Excel file or drag and drop it here')}</span>
          <span className="text-sm text-steel">{l('XLSX یا CSV، حداکثر ۲۰ مگابایت و ۵۰۰۰ ردیف. فایل روی سرور بررسی امنیتی می‌شود؛ فرمول و ماکرو اجرا نمی‌شود.', 'XLSX or CSV, up to 20 MB and 5000 rows. The file is security-checked on the server; formulas and macros are never run.')}</span>
          <input id="imp-file" type="file" accept=".xlsx,.csv" className="sr-only" disabled={!!phase} onChange={(e) => { void start(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {phase ? (
          <div role="status" className="mt-4">
            <p className="mb-2 text-sm font-medium">{phase}</p>
            <progress className="h-2 w-full" max={1} {...(progress !== null ? { value: progress } : {})} aria-label={phase} />
          </div>
        ) : null}
        {message ? <Alert tone="danger" className="mt-4" title={message} /> : null}
        <ul className="mt-4 list-disc space-y-1 ps-5 text-sm leading-7 text-steel">
          <li>{l('ستون‌های فایل خودتان را در مرحلهٔ بعد با اطلاعات محصول تطبیق می‌دهید؛ عنوان‌های فارسی رایج (مثل «کد فنی»، «عنوان»، «قیمت») خودکار شناخته می‌شوند.', 'You match your own columns to product details in the next step; common Persian headers are recognized automatically.')}</li>
          <li>{l('تا پیش‌نمایش را تأیید نکنید، هیچ کالا، قیمت یا موجودی‌ای تغییر نمی‌کند و هیچ کالایی با فایل حذف نمی‌شود.', 'Nothing in the catalog changes until you approve the preview, and no product is ever deleted by a file.')}</li>
        </ul>
      </Section>
      <Section title={l('واردکردن‌های اخیر', 'Recent imports')} id="imp-recent">
        {recent.data?.length ? (
          <TableScroll caption={l('واردکردن‌های اخیر', 'Recent imports')}>
            <thead><tr><th className={th}>{l('فایل', 'File')}</th><th className={th}>{l('زمان', 'When')}</th><th className={th}>{l('وضعیت', 'Status')}</th><th className={th}>{l('جدید / به‌روزرسانی / خطا', 'New / updated / errors')}</th></tr></thead>
            <tbody>
              {recent.data.map((j) => (
                <tr key={j.jobId}>
                  <td className={td}><Link href={`/admin/imports/${j.jobId}`} className="font-semibold text-action underline underline-offset-4 hover:text-action-hover" dir="auto">{j.filename ?? j.jobId.slice(0, 8)}</Link></td>
                  <td className={td}><DateTime iso={j.createdAt} /></td>
                  <td className={td}><Badge tone={j.status === 'COMMITTED' ? 'success' : j.status === 'FAILED' || j.status === 'CONFLICT' ? 'danger' : 'neutral'}>{label('importStatus', j.status)}</Badge></td>
                  <td className={td}>{j.summary ? <span><Num value={j.summary.create} /> / <Num value={j.summary.update} /> / <Num value={j.summary.error} /></span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        ) : recent.data ? <EmptyState title={l('هنوز فایلی وارد نشده است.', 'No imports yet.')} />
          : recent.error ? <Alert tone="danger" title={errorText(t, recent.error)} />
          : <p className="text-sm text-steel">{t('common.loading')}</p>}
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// One import: mapping → preview → apply → result
// ---------------------------------------------------------------------------

interface MappingForm {
  sheet: number;
  headerRow: number;
  skuColumn: number | null;
  /** File column index → product field (except the SKU, chosen separately). */
  fields: Record<number, string>;
  mode: 'CREATE_AND_UPDATE' | 'UPDATE_ONLY';
  priceUnit: 'IRR' | 'TOMAN' | 'AED' | null;
  stockMode: 'SET' | 'ADD' | null;
  defaults: { categoryCode: string; partType: string; condition: string; origin: string; manufacturerBrandId: string; vehicleBrandCodes: string[]; unit: string; initialOnHand: string };
  clearWhenEmpty: string[];
}

const EMPTY_FORM_DEFAULTS: MappingForm['defaults'] = { categoryCode: '', partType: '', condition: '', origin: '', manufacturerBrandId: '', vehicleBrandCodes: [], unit: '', initialOnHand: '' };

function fromColumns(columns: Record<string, number>): Pick<MappingForm, 'skuColumn' | 'fields'> {
  const fields: Record<number, string> = {};
  for (const [field, index] of Object.entries(columns)) if (field !== 'sku') fields[index] = field;
  return { skuColumn: columns.sku ?? null, fields };
}

function initialForm(job: ImportJobView): MappingForm | null {
  const s = job.settings;
  if (s) {
    return {
      sheet: s.sheet, headerRow: s.headerRow, ...fromColumns(s.columns), mode: s.mode, priceUnit: s.priceUnit,
      stockMode: s.columns.on_hand !== undefined ? s.stockMode : null, clearWhenEmpty: s.clearWhenEmpty,
      defaults: {
        categoryCode: s.defaults.categoryCode ?? '', partType: s.defaults.partType ?? '', condition: s.defaults.condition ?? '', origin: s.defaults.origin ?? '',
        manufacturerBrandId: s.defaults.manufacturerBrandId ?? '', vehicleBrandCodes: s.defaults.vehicleBrandCodes, unit: s.defaults.unit ?? '',
        initialOnHand: s.defaults.initialOnHand === null ? '' : String(s.defaults.initialOnHand),
      },
    };
  }
  if (!job.outline) return null;
  const sg = job.outline.suggestion;
  return {
    sheet: sg.sheet, headerRow: sg.headerRow, ...fromColumns(sg.columns), mode: 'CREATE_AND_UPDATE',
    // Toman is never chosen for the person: converting it to rial must be their explicit choice.
    priceUnit: sg.priceUnit === 'TOMAN' ? null : sg.priceUnit, stockMode: null, clearWhenEmpty: [], defaults: EMPTY_FORM_DEFAULTS,
  };
}

function toSettings(f: MappingForm): ImportSettings {
  const columns: Record<string, number> = {};
  for (const [index, field] of Object.entries(f.fields)) columns[field] = Number(index);
  if (f.skuColumn !== null) columns.sku = f.skuColumn;
  const d = f.defaults;
  return {
    sheet: f.sheet, headerRow: f.headerRow, columns, mode: f.mode, priceUnit: f.priceUnit, stockMode: f.stockMode ?? 'SET', clearWhenEmpty: f.clearWhenEmpty,
    defaults: {
      categoryCode: d.categoryCode || null, partType: (d.partType || null) as ImportSettings['defaults']['partType'], condition: (d.condition || null) as ImportSettings['defaults']['condition'],
      origin: (d.origin || null) as ImportSettings['defaults']['origin'], manufacturerBrandId: d.manufacturerBrandId || null, vehicleBrandCodes: d.vehicleBrandCodes,
      unit: d.unit.trim() || null, initialOnHand: d.initialOnHand.trim() === '' ? null : Number(d.initialOnHand),
    },
  };
}

export function ImportJobPage({ jobId }: { jobId: string }) {
  const t = useTranslations();
  const l = useL();
  const locale = useLocale() as 'fa' | 'en';
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>('all');
  const job = useApi<ImportJobView>(`/admin/imports/${jobId}?page=${page}&filter=${filter}`);
  const me = useApi<MeView>('/me');
  const reload = job.reload;
  const status = job.data?.status;

  useEffect(() => {
    if (!status || !BUSY.includes(status)) return;
    const timer = setTimeout(() => void reload(), 1200);
    return () => clearTimeout(timer);
  }, [status, job.data, reload]);

  if (!job.data) {
    return job.error ? <Alert tone="danger" title={errorText(t, job.error)} /> : <p className="text-sm text-steel">{t('common.loading')}</p>;
  }
  const j = job.data;
  const step: 1 | 2 | 3 | 4 | 5 = j.status === 'COMMITTED' ? 5 : j.status === 'COMMITTING' ? 4 : j.summary ? 3 : 2;
  const editable = ['AWAITING_MAPPING', 'PREVIEW_READY', 'FAILED'].includes(j.status) && !!j.outline;
  return (
    <>
      <PageHeader
        title={<span>{l('واردکردن فایل', 'Import')} <span className="text-base font-normal text-steel" dir="auto">{j.filename}</span></span>}
        actions={<ButtonLink href="/admin/imports" variant="secondary" icon={locale === 'fa' ? <ArrowRight aria-hidden className="size-4" /> : <ArrowLeft aria-hidden className="size-4" />}>{l('همهٔ واردکردن‌ها', 'All imports')}</ButtonLink>}
      />
      <Steps current={step} />
      <JobStatus job={j} />
      {editable ? <MappingSection key={`${j.jobId}-${j.settings ? 'set' : 'new'}`} job={j} onSaved={() => { setPage(1); setFilter('all'); void reload(); }} /> : null}
      {j.summary ? <PreviewSection job={j} page={page} filter={filter} setPage={setPage} setFilter={(f) => { setPage(1); setFilter(f); }} /> : null}
      {j.status === 'PREVIEW_READY' && j.summary ? <CommitSection job={j} me={me.data} onDone={() => void reload()} /> : null}
      {j.status === 'COMMITTED' ? <ResultSection job={j} /> : null}
    </>
  );
}

function JobStatus({ job: j }: { job: ImportJobView }) {
  const l = useL();
  const label = useCodeLabel();
  const locale = useLocale() as 'fa' | 'en';
  const num = useNumber();
  const busy = BUSY.includes(j.status);
  const tone = j.status === 'COMMITTED' ? 'success' : j.status === 'FAILED' || j.status === 'CONFLICT' ? 'danger' : busy ? 'info' : 'neutral';
  return (
    <div className="mb-6" role="status" aria-live="polite">
      <p className="flex flex-wrap items-center gap-2">
        <span className="text-steel">{l('وضعیت', 'Status')}:</span>
        <Badge tone={tone}>{label('importStatus', j.status)}</Badge>
        {j.totalRows !== null && busy ? <span className="text-sm text-steel">{l(`${num(j.totalRows)} ردیف`, `${num(j.totalRows)} rows`)}</span> : null}
      </p>
      {busy ? <progress className="mt-2 h-2 w-full" max={100} value={j.progress} aria-label={label('importStatus', j.status)} /> : null}
      {j.failureReason ? <Alert tone="danger" className="mt-3" title={describeImportCode(j.failureReason, locale)}>{j.status === 'FAILED' && j.outline ? <p className="text-sm">{l('شیت، سطر عنوان یا ستون‌ها را در بخش پایین تغییر دهید و پیش‌نمایش را دوباره بسازید، یا فایل اصلاح‌شده را دوباره بارگذاری کنید.', 'Change the sheet, header row or columns below and build the preview again, or upload a corrected file.')}</p> : null}</Alert> : null}
    </div>
  );
}

function MappingSection({ job, onSaved }: { job: ImportJobView; onSaved: () => void }) {
  const t = useTranslations();
  const l = useL();
  const locale = useLocale() as 'fa' | 'en';
  const num = useNumber();
  const outline = job.outline as ImportOutline;
  const taxonomy = useApi<Taxonomy>('/admin/taxonomy');
  const [form, setForm] = useState<MappingForm>(() => initialForm(job) as MappingForm);
  // Once a preview exists the choices fold into a summary; they open again for changes.
  const [editing, setEditing] = useState(() => !job.summary || job.status === 'FAILED');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof MappingForm>(k: K, v: MappingForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setDefault = <K extends keyof MappingForm['defaults']>(k: K, v: MappingForm['defaults'][K]) => setForm((f) => ({ ...f, defaults: { ...f.defaults, [k]: v } }));

  const sheet = outline.sheets.find((s) => s.index === form.sheet) ?? outline.sheets[0];
  const header = sheet?.rows.find((r) => r.rowNumber === form.headerRow);
  const samples = (sheet?.rows ?? []).filter((r) => r.rowNumber > form.headerRow).slice(0, 3);
  const width = Math.max(header?.cells.length ?? 0, ...samples.map((r) => r.cells.length));
  const fileColumns = Array.from({ length: width }, (_, i) => i);
  const letter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(64 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`);
  const columnName = (i: number) => `${header?.cells[i]?.trim() || l('بدون عنوان', 'untitled')} (${l('ستون', 'column')} ${letter(i)})`;
  const mapped = new Set(Object.values(form.fields));
  const has = (field: string) => mapped.has(field) || (field === 'sku' && form.skuColumn !== null);

  // A new sheet or header row: suggest the columns again from that row's headers.
  const rematch = (sheetIndex: number, headerRow: number) => {
    const row = outline.sheets.find((s) => s.index === sheetIndex)?.rows.find((r) => r.rowNumber === headerRow);
    const { mapping, priceUnitHint } = mapHeaders(row?.cells ?? []);
    const cols = mapping as Record<string, number>;
    if (cols.sku === undefined && cols.technical_number !== undefined) cols.sku = cols.technical_number;
    setForm((f) => ({ ...f, sheet: sheetIndex, headerRow, ...fromColumns(cols), priceUnit: priceUnitHint === 'TOMAN' ? null : priceUnitHint }));
  };
  const chooseField = (index: number, field: string) => setForm((f) => {
    const fields = { ...f.fields };
    for (const [k, v] of Object.entries(fields)) if (v === field) delete fields[Number(k)];
    if (field) fields[index] = field;
    else delete fields[index];
    return { ...f, fields };
  });

  const needsPriceUnit = has('base_price') && !has('base_currency');
  const needsStockMode = has('on_hand');
  const missingKey = form.skuColumn === null;
  const canSave = !missingKey && (!needsStockMode || form.stockMode !== null) && (!needsPriceUnit || form.priceUnit !== null);
  const creating = form.mode === 'CREATE_AND_UPDATE';

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api(`/admin/imports/${job.jobId}/settings`, { method: 'PUT', body: toSettings(form) });
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setSaving(false);
    }
  };

  const tax = taxonomy.data;
  const name = (x: { nameFa: string; nameEn: string | null }) => (locale === 'en' ? x.nameEn ?? x.nameFa : x.nameFa);
  const fieldOptions = TEMPLATE_COLUMNS.filter((c) => c !== 'sku');
  const arrow = locale === 'fa' ? '←' : '→';

  if (!editing) {
    const unitText = form.priceUnit === 'IRR' ? l('ریال', 'rial') : form.priceUnit === 'TOMAN' ? l('تومان، تبدیل به ریال', 'toman, converted to rial') : form.priceUnit === 'AED' ? l('درهم', 'dirham') : l('از ستون ارز', 'from the currency column');
    return (
      <Section title={l('۲. تطبیق ستون‌ها', '2. Match the columns')} id="imp-mapping" actions={<Button size="sm" variant="secondary" onClick={() => setEditing(true)}>{l('تغییر تطبیق ستون‌ها', 'Change the mapping')}</Button>}>
        <DefinitionList items={[
          { term: l('شیت و سطر عنوان', 'Sheet and header row'), value: <span><bdi>{sheet?.name}</bdi> — {l(`ردیف ${num(form.headerRow)}`, `row ${num(form.headerRow)}`)}</span> },
          { term: l('کد کالا (کلید تشخیص)', 'SKU (product key)'), value: form.skuColumn !== null ? <bdi>{columnName(form.skuColumn)}</bdi> : '—' },
          {
            term: l('ستون‌های خوانده‌شده', 'Columns read'),
            value: (
              <ul className="flex flex-col gap-0.5">
                {Object.entries(form.fields).sort(([a], [b]) => Number(a) - Number(b)).map(([i, f]) => <li key={i}><bdi>{columnName(Number(i))}</bdi> {arrow} {importColumnLabel(f, locale)}</li>)}
              </ul>
            ),
          },
          ...(has('base_price') ? [{ term: l('واحد قیمت', 'Price unit'), value: unitText }] : []),
          ...(needsStockMode ? [{ term: l('موجودی', 'Stock'), value: form.stockMode === 'ADD' ? l('افزودن به موجودی فعلی', 'added to the current stock') : l('جایگزینی موجودی فعلی', 'replaces the current stock') }] : []),
          { term: l('کالاهایی که در فروشگاه نیستند', 'Products not in the shop'), value: creating ? l('به‌عنوان کالای تازه (پیش‌نویس)', 'created as drafts') : l('ثبت نمی‌شوند', 'skipped') },
        ]} />
      </Section>
    );
  }

  return (
    <Section title={l('۲. تطبیق ستون‌ها', '2. Match the columns')} id="imp-mapping">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="imp-sheet" label={l('شیت', 'Sheet')}>
          <Select id="imp-sheet" value={form.sheet} onChange={(e) => {
            const s = outline.sheets.find((x) => x.index === Number(e.target.value));
            rematch(Number(e.target.value), s?.rows[0]?.rowNumber ?? 1);
          }}>
            {outline.sheets.map((s) => <option key={s.index} value={s.index}>{s.name} — {l(`${num(s.rowCount)} ردیف`, `${num(s.rowCount)} rows`)}{s.hidden ? l(' (پنهان)', ' (hidden)') : ''}</option>)}
          </Select>
        </Field>
        <Field id="imp-header" label={l('سطر عنوان ستون‌ها', 'Header row')} hint={l('ردیفی که نام ستون‌ها در آن است؛ ردیف‌های زیر آن خوانده می‌شوند.', 'The row with the column names; the rows below it are read.')}>
          <Select id="imp-header" value={form.headerRow} onChange={(e) => rematch(form.sheet, Number(e.target.value))}>
            {(sheet?.rows ?? []).map((r) => <option key={r.rowNumber} value={r.rowNumber}>{l(`ردیف ${num(r.rowNumber)}`, `Row ${num(r.rowNumber)}`)}: {r.cells.filter(Boolean).slice(0, 4).join(' · ').slice(0, 70)}</option>)}
          </Select>
        </Field>
      </div>

      <fieldset className="mt-6 rounded-[var(--radius-card)] border border-line-soft p-4">
        <legend className="flex items-center gap-2 px-1 font-semibold"><KeyRound aria-hidden className="size-4 text-action" />{l('کلید تشخیص کالا: کد کالا', 'Product key: the SKU')}</legend>
        <Field id="imp-sku" label={l('کد هر کالا در کدام ستون است؟', 'Which column has each product’s code?')} error={missingKey ? l('این انتخاب لازم است.', 'This choice is required.') : undefined}>
          <Select id="imp-sku" value={form.skuColumn ?? ''} invalid={missingKey} onChange={(e) => set('skuColumn', e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">{l('— انتخاب ستون —', '— choose a column —')}</option>
            {fileColumns.map((i) => <option key={i} value={i}>{columnName(i)}</option>)}
          </Select>
        </Field>
        <p className="mt-2 text-sm leading-7 text-steel">
          {l('هر کالا در فروشگاه با «کد کالا» شناخته می‌شود: ردیفی که کدش در فروشگاه هست به‌روزرسانی می‌شود و بقیه کالای تازه‌اند. اگر فایل ستون کد کالای جدا ندارد، ستون شماره فنی را انتخاب کنید. شماره فنی فقط در یک برند یکتاست؛ اگر همین شماره با همین برند زیر کد دیگری ثبت شده باشد، ردیف خطا می‌گیرد و با کالای دیگر یکی نمی‌شود. شباهت نام هرگز ملاک نیست.',
            'Each product is identified by its SKU: a row whose code exists is updated, the others become new products. Without a separate SKU column, choose the technical-number column. A technical number is unique only within a brand: if the same number and brand already exist under another SKU, the row is flagged and never merged. Similar names never count as a match.')}
        </p>
      </fieldset>

      <div className="mt-6">
        <h3 className="mb-2 font-semibold">{l('ستون‌های فایل', 'File columns')}</h3>
        <TableScroll caption={l('تطبیق ستون‌های فایل', 'File column mapping')}>
          <thead><tr><th className={th}>{l('ستون فایل', 'File column')}</th><th className={th}>{l('نمونهٔ مقدار', 'Sample values')}</th><th className={th}>{l('اطلاعات محصول', 'Product field')}</th></tr></thead>
          <tbody>
            {fileColumns.map((i) => (
              <tr key={i}>
                <td className={td}><span className="font-medium" dir="auto">{columnName(i)}</span>{form.skuColumn === i ? <Badge tone="info" className="ms-2">{l('کد کالا', 'SKU')}</Badge> : null}</td>
                <td className={td}><span className="text-sm text-steel" dir="auto">{samples.map((r) => r.cells[i]).filter(Boolean).join(' · ') || '—'}</span></td>
                <td className={td}>
                  <Select aria-label={l(`اطلاعات محصول برای ${columnName(i)}`, `Product field for ${columnName(i)}`)} value={form.fields[i] ?? ''} onChange={(e) => chooseField(i, e.target.value)} className="min-w-52">
                    <option value="">{l('— خوانده نشود —', '— ignore —')}</option>
                    {fieldOptions.map((c) => <option key={c} value={c}>{importColumnLabel(c, 'fa')}{locale === 'en' ? ` (${c})` : ''}</option>)}
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      </div>

      {needsPriceUnit || has('base_price') ? (
        <fieldset className="mt-6">
          <legend className="mb-2 font-semibold">{l('واحد ستون قیمت', 'Unit of the price column')}</legend>
          <div className="flex flex-col gap-2">
            {([
              ['IRR', l('ریال', 'Rial (IRR)')],
              ['TOMAN', l('تومان — هنگام ثبت به ریال تبدیل می‌شود (×۱۰)', 'Toman — converted to rial when applied (×10)')],
              ['AED', l('درهم امارات (AED)', 'UAE dirham (AED)')],
            ] as const).map(([v, text]) => (
              <label key={v} className="flex min-h-11 cursor-pointer items-center gap-3">
                <input type="radio" name="imp-price-unit" value={v} checked={form.priceUnit === v} onChange={() => set('priceUnit', v)} className="size-5 accent-[var(--color-action)]" />
                <span>{text}</span>
              </label>
            ))}
            {has('base_currency') ? (
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <input type="radio" name="imp-price-unit" value="" checked={form.priceUnit === null} onChange={() => set('priceUnit', null)} className="size-5 accent-[var(--color-action)]" />
                <span>{l('فقط از ستون ارز خوانده شود', 'Only from the currency column')}</span>
              </label>
            ) : null}
          </div>
          {job.outline?.suggestion.priceUnit && form.sheet === job.outline.suggestion.sheet ? (
            <p className="mt-1 text-sm text-steel">{l(`عنوان ستون قیمت واحد «${job.outline.suggestion.priceUnit === 'IRR' ? 'ریال' : job.outline.suggestion.priceUnit === 'TOMAN' ? 'تومان' : 'درهم'}» را نشان می‌دهد؛ انتخاب را بررسی کنید.`, `The price header names the unit (${job.outline.suggestion.priceUnit}); check the choice.`)}</p>
          ) : null}
          {needsPriceUnit && form.priceUnit === null ? <p className="mt-1 text-sm text-danger">{l('واحد قیمت را انتخاب کنید؛ تومان فقط با انتخاب شما به ریال تبدیل می‌شود.', 'Choose the price unit; toman is converted to rial only when you choose it.')}</p> : null}
        </fieldset>
      ) : null}

      {needsStockMode ? (
        <fieldset className="mt-6">
          <legend className="mb-2 font-semibold">{l('عدد ستون موجودی چه معنایی دارد؟', 'What does the stock column mean?')}</legend>
          <div className="flex flex-col gap-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border border-line-soft p-3">
              <input type="radio" name="imp-stock-mode" value="SET" checked={form.stockMode === 'SET'} onChange={() => set('stockMode', 'SET')} className="mt-1 size-5 accent-[var(--color-action)]" />
              <span><strong>{l('جایگزینی موجودی (شمارش انبار)', 'Replace the stock (stock count)')}</strong><span className="block text-sm text-steel">{l('عدد فایل موجودی جدید است. مثال: موجودی فعلی ۵ و عدد فایل ۳ ← موجودی ۳ می‌شود.', 'The file’s number is the new stock. Example: current 5, file 3 → stock becomes 3.')}</span></span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border border-line-soft p-3">
              <input type="radio" name="imp-stock-mode" value="ADD" checked={form.stockMode === 'ADD'} onChange={() => set('stockMode', 'ADD')} className="mt-1 size-5 accent-[var(--color-action)]" />
              <span><strong>{l('افزودن به موجودی (کالای رسیده)', 'Add to the stock (goods received)')}</strong><span className="block text-sm text-steel">{l('عدد فایل به موجودی فعلی اضافه می‌شود. مثال: موجودی فعلی ۵ و عدد فایل ۳ ← موجودی ۸ می‌شود. اگر همین فایل قبلاً افزوده شده باشد، پیش از ثبت دوباره هشدار می‌گیرید.', 'The file’s number is added. Example: current 5, file 3 → stock becomes 8. If this same file was added before, you are warned before it is added again.')}</span></span>
            </label>
          </div>
          {form.stockMode === null ? <p className="mt-1 text-sm text-danger">{l('یکی را انتخاب کنید.', 'Choose one.')}</p> : null}
        </fieldset>
      ) : null}

      <Field id="imp-mode" label={l('کالاهایی که در فروشگاه نیستند', 'Products not in the shop yet')} className="mt-6 max-w-xl">
        <Select id="imp-mode" value={form.mode} onChange={(e) => set('mode', e.target.value as MappingForm['mode'])}>
          <option value="CREATE_AND_UPDATE">{l('به‌عنوان کالای تازه (پیش‌نویس) ثبت شوند', 'Create them as new products (drafts)')}</option>
          <option value="UPDATE_ONLY">{l('ثبت نشوند؛ فقط کالاهای موجود به‌روزرسانی شوند', 'Skip them; only update existing products')}</option>
        </Select>
      </Field>

      {creating ? (
        <fieldset className="mt-6 rounded-[var(--radius-card)] border border-line-soft p-4">
          <legend className="px-1 font-semibold">{l('اطلاعات لازم که در فایل نیست', 'Required details missing from the file')}</legend>
          <p className="mb-4 text-sm leading-7 text-steel">{l('این مقدارها فقط برای کالاهای تازه و فقط وقتی سلول ردیف خالی است به کار می‌روند؛ کالاهای موجود تغییری نمی‌کنند. چیزی را که نمی‌دانید حدس نزنید: اگر خالی بماند، ردیف‌های تازه در پیش‌نمایش با دلیل خطا نشان داده می‌شوند.', 'Used only for new products and only where the row’s cell is empty; existing products keep their values. Do not guess: if left empty, new rows show the reason in the preview.')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {!has('category_code') ? (
              <Field id="imp-d-category" label={l('دسته (الزامی برای کالای تازه)', 'Category (required for new products)')}>
                <Select id="imp-d-category" value={form.defaults.categoryCode} onChange={(e) => setDefault('categoryCode', e.target.value)}>
                  <option value="">{l('— انتخاب —', '— choose —')}</option>
                  {tax?.categories.filter((c) => c.active).map((c) => <option key={c.id} value={c.code}>{name(c)}</option>)}
                </Select>
              </Field>
            ) : null}
            {!has('part_type') ? (
              <Field id="imp-d-type" label={l('نوع قطعه (الزامی برای کالای تازه)', 'Part type (required for new products)')}>
                <Select id="imp-d-type" value={form.defaults.partType} onChange={(e) => setDefault('partType', e.target.value)}>
                  <option value="">{l('— انتخاب —', '— choose —')}</option>
                  {(['GENUINE', 'OEM', 'AFTERMARKET'] as const).map((v) => <option key={v} value={v}>{t(`partType.${v}`)}</option>)}
                </Select>
              </Field>
            ) : null}
            {!has('condition') ? (
              <Field id="imp-d-condition" label={l('وضعیت فیزیکی (الزامی برای کالای تازه)', 'Condition (required for new products)')} hint={l('کالای کارکرده یا بازسازی‌شده بدون عکس واقعی منتشر نمی‌شود.', 'Used or refurbished parts are not published without a real photo.')}>
                <Select id="imp-d-condition" value={form.defaults.condition} onChange={(e) => setDefault('condition', e.target.value)}>
                  <option value="">{l('— انتخاب —', '— choose —')}</option>
                  {(['NEW', 'USED', 'REFURBISHED'] as const).map((v) => <option key={v} value={v}>{t(`condition.${v}`)}</option>)}
                </Select>
              </Field>
            ) : null}
            {!has('origin') ? (
              <Field id="imp-d-origin" label={l('منشأ (الزامی برای کالای تازه)', 'Origin (required for new products)')}>
                <Select id="imp-d-origin" value={form.defaults.origin} onChange={(e) => setDefault('origin', e.target.value)}>
                  <option value="">{l('— انتخاب —', '— choose —')}</option>
                  {(['DOMESTIC', 'IMPORTED', 'UNKNOWN'] as const).map((v) => <option key={v} value={v}>{t(`origin.${v}`)}</option>)}
                </Select>
              </Field>
            ) : null}
            {!has('manufacturer_brand') ? (
              <Field id="imp-d-brand" label={l('برند سازنده (اختیاری)', 'Manufacturer brand (optional)')} hint={l('شماره فنی همراه برند، کالای تکراری را بهتر تشخیص می‌دهد.', 'A brand with the technical number detects duplicates better.')}>
                <Select id="imp-d-brand" value={form.defaults.manufacturerBrandId} onChange={(e) => setDefault('manufacturerBrandId', e.target.value)}>
                  <option value="">{l('— بدون برند —', '— no brand —')}</option>
                  {tax?.manufacturers.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{name(m)}</option>)}
                </Select>
              </Field>
            ) : null}
            {!has('unit') ? (
              <Field id="imp-d-unit" label={l('واحد فروش (اختیاری)', 'Sales unit (optional)')} hint={l('خالی: «عدد».', 'Empty: “عدد” (piece).')}>
                <Select id="imp-d-unit" value={form.defaults.unit} onChange={(e) => setDefault('unit', e.target.value)}>
                  <option value="">{l('عدد (پیش‌فرض)', 'Piece (default)')}</option>
                  {tax?.units.filter((u) => u.active).map((u) => <option key={u.id} value={u.name}>{l(u.name, u.nameEn || u.name)}</option>)}
                </Select>
              </Field>
            ) : null}
            {!has('on_hand') ? (
              <Field id="imp-d-stock" label={l('موجودی اولیهٔ کالای تازه (اختیاری)', 'First stock of new products (optional)')} hint={l('فایل ستون موجودی ندارد؛ اگر خالی بماند، موجودی کالای تازه صفر است و تا ثبت موجودی قابل خرید نیست.', 'The file has no stock column; if empty, new products start at zero and cannot be bought until stocked.')}>
                <Input id="imp-d-stock" dir="ltr" inputMode="numeric" value={form.defaults.initialOnHand} onChange={(e) => setDefault('initialOnHand', e.target.value.replace(/[^\d۰-۹]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))} />
              </Field>
            ) : null}
          </div>
          {!has('vehicle_brand_codes') && tax?.vehicleBrands.length ? (
            <fieldset className="mt-4">
              <legend className="text-sm font-semibold">{l('برند خودروهای سازگار (اختیاری)', 'Compatible vehicle brands (optional)')}</legend>
              <div className="flex flex-wrap gap-x-4">
                {tax.vehicleBrands.filter((b) => b.active).map((b) => (
                  <Checkbox key={b.id} id={`imp-d-vb-${b.code}`} label={name(b)} checked={form.defaults.vehicleBrandCodes.includes(b.code)}
                    onChange={(e) => setDefault('vehicleBrandCodes', e.target.checked ? [...form.defaults.vehicleBrandCodes, b.code] : form.defaults.vehicleBrandCodes.filter((c) => c !== b.code))} />
                ))}
              </div>
            </fieldset>
          ) : null}
        </fieldset>
      ) : null}

      <details className="mt-6">
        <summary className="cursor-pointer font-semibold">{l('پاک‌کردن مقدار با سلول خالی (فقط کالاهای موجود)', 'Clear values with empty cells (existing products only)')}</summary>
        <p className="mt-2 text-sm text-steel">{l('به‌طور پیش‌فرض سلول خالی یعنی «بدون تغییر». فقط ستون‌هایی را انتخاب کنید که سلول خالی‌شان باید مقدار فعلی را پاک کند.', 'By default an empty cell means “no change”. Choose only the columns whose empty cells should clear the current value.')}</p>
        <div className="flex flex-wrap gap-x-4">
          {CLEARABLE_IMPORT_COLUMNS.map((c) => (
            <Checkbox key={c} id={`imp-clear-${c}`} label={importColumnLabel(c, locale)} checked={form.clearWhenEmpty.includes(c)}
              onChange={(e) => set('clearWhenEmpty', e.target.checked ? [...form.clearWhenEmpty, c] : form.clearWhenEmpty.filter((x) => x !== c))} />
          ))}
        </div>
      </details>

      {error ? <Alert tone="danger" className="mt-4" title={error} /> : null}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={() => void save()} loading={saving} disabled={!canSave}>{job.summary ? l('ساخت دوبارهٔ پیش‌نمایش', 'Build the preview again') : l('ساخت پیش‌نمایش', 'Build the preview')}</Button>
        <span className="text-sm text-steel">{l('پیش‌نمایش هیچ چیزی را در فروشگاه تغییر نمی‌دهد.', 'The preview changes nothing in the shop.')}</span>
      </div>
    </Section>
  );
}

function PriceCell({ row }: { row: ImportRowView }) {
  const l = useL();
  const locale = useLocale() as 'fa' | 'en';
  const p = row.display?.price;
  if (!p) return <span className="text-steel">—</span>;
  if ('text' in p) return <span className="text-danger" dir="auto">{p.text}</span>;
  return (
    <span className="whitespace-nowrap">
      <bdi>{formatMoney(money(p.currency, BigInt(p.amountMinor)), locale)}</bdi>
      {p.fromToman ? <span className="block text-xs text-steel">{l('تبدیل‌شده از تومان', 'converted from toman')}</span> : null}
    </span>
  );
}

function StockCell({ row }: { row: ImportRowView }) {
  const l = useL();
  const num = useNumber();
  const s = row.display?.stock;
  if (!s) return <span className="text-steel">—</span>;
  if ('text' in s) return <span className="text-danger" dir="auto">{s.text}</span>;
  if (s.mode === 'ADD' && s.before !== null && s.quantity !== null) return <span className="whitespace-nowrap">{num(s.before)} + {num(s.quantity)} = <strong>{num(s.after ?? 0)}</strong></span>;
  if (s.quantity === null) return row.action === 'CREATE' ? <span className="whitespace-nowrap text-steel">{num(0)} <span className="text-xs">({l('در فایل نیست', 'not in file')})</span></span> : <span>{num(s.after ?? 0)}</span>;
  if (s.before !== null && s.before !== s.after) return <span className="whitespace-nowrap">{num(s.before)} {'←'} <strong>{num(s.after ?? 0)}</strong></span>;
  return <span>{num(s.after ?? 0)}</span>;
}

function PreviewSection({ job: j, page, filter, setPage, setFilter }: { job: ImportJobView; page: number; filter: Filter; setPage: (p: number) => void; setFilter: (f: Filter) => void }) {
  const t = useTranslations();
  const l = useL();
  const label = useCodeLabel();
  const locale = useLocale() as 'fa' | 'en';
  const num = useNumber();
  const s = j.summary;
  if (!s) return null;
  const tone = (a: ImportRowView['action']) => (a === 'ERROR' ? 'danger' : a === 'CREATE' ? 'success' : a === 'UPDATE' ? 'info' : 'neutral');
  const filters: Array<[Filter, string, number | null]> = [
    ['all', l('همه', 'All'), s.create + s.update + s.unchanged + s.error],
    ['create', label('importAction', 'CREATE'), s.create],
    ['update', label('importAction', 'UPDATE'), s.update],
    ['unchanged', label('importAction', 'UNCHANGED'), s.unchanged],
    ['errors', label('importAction', 'ERROR'), s.error],
    ['warnings', l('هشدار', 'Warnings'), null],
  ];
  const pages = Math.max(1, Math.ceil(j.rowsTotal / j.pageSize));
  const d = j.settings?.defaults;
  const fromFile = d
    ? ([['category_code', d.categoryCode], ['part_type', d.partType], ['condition', d.condition], ['origin', d.origin], ['manufacturer_brand', d.manufacturerBrandId], ['vehicle_brand_codes', d.vehicleBrandCodes.length ? 'x' : null], ['unit', d.unit], ['on_hand', d.initialOnHand]] as const)
      .filter(([, v]) => v !== null && v !== undefined).map(([c]) => c)
    : [];
  return (
    <Section
      title={j.status === 'COMMITTED' ? l('۳. ردیف‌های فایل و نتیجهٔ هر ردیف', '3. File rows and what happened to each')
        : j.status === 'COMMITTING' ? l('۳. ردیف‌های فایل (در حال ثبت)', '3. File rows (being applied)')
        : l('۳. پیش‌نمایش (هنوز چیزی ثبت نشده است)', '3. Preview (nothing applied yet)')}
      id="imp-preview"
    >
      <ul className="mb-4 flex flex-wrap gap-2" aria-label={l('خلاصه', 'Summary')}>
        <li><Badge tone="success">{l('جدید', 'New')}: <Num value={s.create} /></Badge></li>
        <li><Badge tone="info">{t('admin.summaryUpdate')}: <Num value={s.update} /></Badge></li>
        <li><Badge>{t('admin.summaryUnchanged')}: <Num value={s.unchanged} /></Badge></li>
        <li><Badge tone={s.error ? 'danger' : 'success'}>{t('admin.summaryError')}: <Num value={s.error} /></Badge></li>
        {s.warnings ? <li><Badge tone="warning">{l('هشدار', 'Warnings')}: <Num value={s.warnings} /></Badge></li> : null}
      </ul>
      {s.columns?.length ? <p className="mb-2 text-sm">{l('ستون‌های خوانده‌شده', 'Columns read')}: {s.columns.map((c) => importColumnLabel(c, locale)).join(locale === 'fa' ? '، ' : ', ')}</p> : null}
      {s.ignoredHeaders?.length ? <p className="mb-3 text-sm text-steel">{l('ستون‌های خوانده‌نشده', 'Ignored columns')}: <bdi>{s.ignoredHeaders.join(' · ')}</bdi></p> : null}
      {s.create && fromFile.length ? <p className="mb-3 text-sm text-steel">{l('برای کالاهای تازه، این مقدارها از انتخاب شما برای کل فایل آمد', 'For new products these values come from your choice for the whole file')}: {fromFile.map((c) => importColumnLabel(c, locale)).join(locale === 'fa' ? '، ' : ', ')}</p> : null}
      {s.topIssues?.length ? (
        <div className="mb-4 rounded-[var(--radius-card)] border border-line-soft bg-white p-3">
          <h3 className="mb-2 text-sm font-semibold">{l('مشکلات پرتکرار این فایل', 'Most common problems in this file')}</h3>
          <ul className="flex flex-col gap-1.5 text-sm leading-7">
            {s.topIssues.map((i) => (
              <li key={`${i.severity}-${i.code}`} className={i.severity === 'error' ? 'text-danger' : 'text-warning'}>
                <strong>{l(`${num(i.rows)} ردیف`, `${num(i.rows)} rows`)}</strong>
                {i.columns.length ? <> — {i.columns.map((c) => importColumnLabel(c, locale)).join(locale === 'fa' ? '، ' : ', ')}</> : null}: {describeImportCode(i.code, locale)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {s.fileErrors.length ? (
        <Alert tone="danger" className="mb-3" title={t('admin.importFileErrors')}>
          <ul className="list-disc ps-5">{s.fileErrors.map((code) => <li key={code}>{describeImportCode(code, locale)}</li>)}</ul>
        </Alert>
      ) : null}
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={l('نمایش ردیف‌ها', 'Show rows')}>
        {filters.map(([f, text, count]) => (
          <Button key={f} size="sm" variant={filter === f ? 'primary' : 'secondary'} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {text}{count !== null ? <span className="ms-1 opacity-80">({num(count)})</span> : null}
          </Button>
        ))}
      </div>
      {j.rows.length ? (
        <ul className="flex flex-col gap-3 md:hidden" aria-label={l('ردیف‌های فایل و نتیجهٔ بررسی', 'File rows and their check result')}>
          {j.rows.map((r) => (
            <li key={r.rowNumber} className="rounded-[var(--radius-card)] border border-line-soft bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-steel">{l('ردیف Excel', 'Excel row')} <Num value={r.rowNumber} /></span>
                <span className="flex items-center gap-1.5">
                  <Badge tone={tone(r.action)}>{r.action === 'CREATE' ? l('جدید', 'New') : label('importAction', r.action)}</Badge>
                  {r.applied ? <Badge tone="success">{l('ثبت شد', 'Applied')}</Badge> : null}
                </span>
              </div>
              <p className="mt-2 font-medium leading-7" dir="auto">{r.display?.name ?? '—'}</p>
              <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-steel">{l('شماره فنی / کد کالا', 'Technical no. / SKU')}</dt>
                <dd>{r.display?.technicalNumber ? <Code>{r.display.technicalNumber}</Code> : null}{r.sku && r.sku !== r.display?.technicalNumber ? <> <Code>{r.sku}</Code></> : null}{!r.display?.technicalNumber && !r.sku ? '—' : null}</dd>
                <dt className="text-steel">{l('قیمت', 'Price')}</dt>
                <dd><PriceCell row={r} /></dd>
                <dt className="text-steel">{l('موجودی', 'Stock')}</dt>
                <dd><StockCell row={r} /></dd>
              </dl>
              {r.issues.length || r.changes.length ? <div className="mt-2 border-t border-line-soft pt-2"><RowDetails row={r} /></div> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {j.rows.length ? (
        <div className="hidden md:block">
        <TableScroll caption={l('ردیف‌های فایل و نتیجهٔ بررسی', 'File rows and their check result')}>
          <thead>
            <tr>
              <th className={th}>{l('ردیف Excel', 'Excel row')}</th><th className={th}>{l('نام قطعه', 'Part name')}</th><th className={th}>{l('شماره فنی / کد کالا', 'Technical no. / SKU')}</th>
              <th className={th}>{l('قیمت', 'Price')}</th><th className={th}>{l('موجودی', 'Stock')}</th><th className={th}>{l('وضعیت', 'Status')}</th><th className={th}>{l('جزئیات', 'Details')}</th>
            </tr>
          </thead>
          <tbody>
            {j.rows.map((r) => (
              <tr key={r.rowNumber}>
                <td className={td}><Num value={r.rowNumber} /></td>
                <td className={td}><span dir="auto" className="block max-w-80">{r.display?.name ?? '—'}</span>{r.display?.brand ? <span className="block text-xs text-steel">{r.display.brand}</span> : null}</td>
                <td className={td}>
                  {r.display?.technicalNumber ? <Code>{r.display.technicalNumber}</Code> : null}
                  {r.sku && r.sku !== r.display?.technicalNumber ? <span className="block text-xs text-steel">{l('کد کالا', 'SKU')}: <Code>{r.sku}</Code></span> : null}
                  {!r.display?.technicalNumber && !r.sku ? '—' : null}
                </td>
                <td className={td}><PriceCell row={r} /></td>
                <td className={td}><StockCell row={r} /></td>
                <td className={td}>
                  <Badge tone={tone(r.action)}>{r.action === 'CREATE' ? l('جدید', 'New') : label('importAction', r.action)}</Badge>
                  {r.applied ? <span className="mt-1 block text-xs text-success">{l('ثبت شد', 'Applied')}</span> : null}
                </td>
                <td className={td}><RowDetails row={r} /></td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
        </div>
      ) : <p className="text-sm text-steel">{l('ردیفی با این فیلتر نیست.', 'No rows with this filter.')}</p>}
      {pages > 1 ? (
        <nav className="mt-3 flex items-center gap-3" aria-label={l('صفحه‌های پیش‌نمایش', 'Preview pages')}>
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{l('قبلی', 'Previous')}</Button>
          <span className="text-sm">{l(`صفحهٔ ${num(page)} از ${num(pages)}`, `Page ${num(page)} of ${num(pages)}`)}</span>
          <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>{l('بعدی', 'Next')}</Button>
        </nav>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-4">
        <a href={`/api/v1/admin/imports/${j.jobId}/errors.xlsx?locale=${locale}`} download className="inline-flex min-h-11 items-center gap-2 font-semibold text-action underline"><Download aria-hidden className="size-4" />{t('admin.errorReport')}</a>
        <a href={`/api/v1/admin/imports/${j.jobId}/report.xlsx?locale=${locale}`} download className="inline-flex min-h-11 items-center gap-2 font-semibold text-action underline"><Download aria-hidden className="size-4" />{l('گزارش کامل ردیف‌ها', 'Full row report')}</a>
      </div>
    </Section>
  );
}

/** A row's problems (errors first) and, for updates, each change from the current value to the file's value. */
function RowDetails({ row: r }: { row: ImportRowView }) {
  const locale = useLocale() as 'fa' | 'en';
  return (
    <>
      {groupIssues(r.issues).map((i) => (
        <span key={`${i.severity}-${i.code}-${i.detail ?? ''}`} className={`block text-xs leading-6 ${i.severity === 'error' ? 'text-danger' : 'text-warning'}`}>
          {i.columns.length ? <strong>{i.columns.map((c) => importColumnLabel(c, locale)).join(locale === 'fa' ? '، ' : ', ')}: </strong> : null}{describeImportCode(i.code, locale)}{i.detail ? <> (<bdi>{i.detail}</bdi>)</> : null}
        </span>
      ))}
      {r.changes.map((c, k) => (
        <span key={`c${k}`} className="block text-xs leading-6">
          <strong>{importFieldLabel(c.field, locale)}: </strong>
          <ChangeValue change={c} value={c.before} /> {locale === 'fa' ? '←' : '→'} <ChangeValue change={c} value={c.after} showDelta />
        </span>
      ))}
    </>
  );
}

/** One line per problem of a row: the same reason for several columns is said once, with the columns listed. */
function groupIssues(issues: ImportRowView['issues']) {
  const out: Array<{ code: string; severity: 'error' | 'warning'; detail?: string; columns: string[] }> = [];
  for (const i of issues) {
    const same = out.find((x) => x.code === i.code && x.severity === i.severity && x.detail === i.detail);
    if (same) {
      if (i.column) same.columns.push(i.column);
    } else out.push({ code: i.code, severity: i.severity, ...(i.detail ? { detail: i.detail } : {}), columns: i.column ? [i.column] : [] });
  }
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
}

function ChangeValue({ change, value, showDelta = false }: { change: ImportRowView['changes'][number]; value: string | null; showDelta?: boolean }) {
  const t = useTranslations();
  const l = useL();
  const locale = useLocale() as 'fa' | 'en';
  const num = useNumber();
  if (value === null || value === '') return <bdi>—</bdi>;
  if (change.currency && /^-?\d+$/.test(value)) return <bdi>{formatMoney(money(change.currency, BigInt(value)), locale)}</bdi>;
  const ns: Record<string, string> = { partType: 'partType', condition: 'condition', origin: 'origin' };
  const group = ns[change.field];
  if (group && t.has(`${group}.${value}`)) return <bdi>{t(`${group}.${value}` as never)}</bdi>;
  if (change.field === 'isActive') return <bdi>{value === 'true' ? l('فعال', 'Active') : l('غیرفعال', 'Inactive')}</bdi>;
  if (/^\d+$/.test(value) && ['onHand', 'onHandAdd', 'lowStockThreshold'].includes(change.field)) return <bdi>{num(Number(value))}{showDelta && change.delta ? ` (+${num(change.delta)})` : ''}</bdi>;
  return <bdi>{value}</bdi>;
}

function CommitSection({ job: j, me, onDone }: { job: ImportJobView; me: MeView | null; onDone: () => void }) {
  const t = useTranslations();
  const l = useL();
  const num = useNumber();
  const s = j.summary as NonNullable<ImportJobView['summary']>;
  const [skip, setSkip] = useState(false);
  const [repeat, setRepeat] = useState(false);
  // «کاربرد در خودرو»: new vehicles/models are created only when confirmed; similar names are linked only when ticked.
  const fleet = s.vehicles;
  const hasNew = !!fleet && fleet.newVehicles.length + fleet.newModels.length > 0;
  const [createVehicles, setCreateVehicles] = useState(true);
  const [linkSimilar, setLinkSimilar] = useState<string[]>(() => (fleet?.similar ?? []).map((x) => x.text));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = (s.requiredPermissions ?? []).filter((p) => me && !me.permissions.includes(p));
  const applicable = s.create + s.update;
  const blockedByErrors = s.error > 0 && !skip;
  const canApply = (s.canCommit || (s.canCommitValid && skip)) && !missing.length && (!j.repeatAdd || repeat);
  const permName: Record<string, string> = { 'products.write': l('ویرایش محصولات', 'edit products'), 'prices.write': l('تغییر قیمت', 'change prices'), 'inventory.adjust': l('اصلاح موجودی', 'adjust stock') };
  const unit = j.settings?.priceUnit;

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/imports/${j.jobId}/commit`, { method: 'POST', body: { planChecksum: j.planChecksum, skipErrorRows: skip, confirmRepeatAdd: repeat, createVehicles: hasNew && createVehicles, linkSimilar } });
      setConfirming(false);
      onDone();
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={l('۴. ثبت', '4. Apply')} id="imp-commit">
      {applicable === 0 ? (
        <Alert tone="info" title={l('در این فایل چیزی برای ثبت نیست', 'Nothing to apply in this file')}>
          <p>
            {!s.error ? l('همهٔ ردیف‌ها با اطلاعات فروشگاه یکی‌اند.', 'Every row already matches the shop.')
              : !s.unchanged ? l('همهٔ ردیف‌ها خطا دارند؛ فایل را اصلاح و دوباره بارگذاری کنید یا تطبیق ستون‌ها را تغییر دهید.', 'Every row has an error; correct the file and upload it again, or change the mapping.')
              : l(`${num(s.unchanged)} ردیف با اطلاعات فروشگاه یکی است و ${num(s.error)} ردیف خطا دارد؛ ردیف‌های خطادار را اصلاح و فایل را دوباره بارگذاری کنید یا تطبیق ستون‌ها را تغییر دهید.`, `${num(s.unchanged)} rows already match the shop and ${num(s.error)} rows have errors; correct those rows and upload the file again, or change the mapping.`)}
          </p>
        </Alert>
      ) : (
        <>
          {s.error ? (
            <Alert tone="warning" className="mb-4" title={l(`${num(s.error)} ردیف خطا دارد و ثبت نمی‌شود`, `${num(s.error)} rows have errors and are not applied`)}>
              <p>{l('دو راه دارید: فایل را اصلاح و دوباره بارگذاری کنید (گزارش خطا را دریافت کنید)، یا صریحاً انتخاب کنید که فقط ردیف‌های بدون خطا ثبت شوند. ردیف خطادار بی‌صدا حذف نمی‌شود و در گزارش با دلیلش می‌ماند.', 'Either correct the file and upload it again (download the error report), or explicitly choose to apply only the rows without errors. Rows with errors are never dropped silently; they stay in the report with their reason.')}</p>
              <Checkbox id="imp-skip" className="mt-2" label={l(`فقط ${num(applicable)} ردیف بدون خطا ثبت شود`, `Apply only the ${num(applicable)} rows without errors`)} checked={skip} onChange={(e) => setSkip(e.target.checked)} />
            </Alert>
          ) : null}
          {j.repeatAdd ? (
            <Alert tone="warning" className="mb-4" title={l('همین فایل قبلاً به موجودی افزوده شده است', 'This same file was already added to stock')}>
              <p>{l('ثبت دوباره، موجودی را دوباره افزایش می‌دهد. فقط اگر کالای تازه‌ای رسیده و فایل همان است تأیید کنید.', 'Applying it again increases the stock again. Confirm only if new goods arrived and the file is the same.')} (<DateTime iso={j.repeatAdd.committedAt} />)</p>
              <Checkbox id="imp-repeat" className="mt-2" label={l('می‌دانم؛ دوباره به موجودی افزوده شود', 'I know; add it to the stock again')} checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
            </Alert>
          ) : null}
          {fleet && (hasNew || fleet.similar.length) ? (
            <div className="mb-4 flex flex-col gap-3" data-testid="imp-vehicles">
              {hasNew ? (
                <Alert tone="info" title={l('خودروهای تازه در ستون «کاربرد در خودرو»', 'New vehicles in the vehicle fitment column')}>
                  <ul className="mt-1 list-disc ps-5 text-sm leading-7">
                    {fleet.newVehicles.map((v) => <li key={v.name}>{v.name} <span className="text-steel">({l('ردیف', 'row')} {v.rows.map((r) => num(r)).join('، ')})</span></li>)}
                    {fleet.newModels.map((m) => <li key={`${m.vehicle}|${m.name}`}>{m.vehicle} ← {m.name} <span className="text-steel">({l('مدل تازه، ردیف', 'new model, row')} {m.rows.map((r) => num(r)).join('، ')})</span></li>)}
                  </ul>
                  <Checkbox id="imp-create-vehicles" className="mt-2" label={l('این خودروها و مدل‌ها به فهرست خودروها اضافه شوند', 'Add these vehicles and models to the vehicle list')} checked={createVehicles} onChange={(e) => setCreateVehicles(e.target.checked)} />
                  {!createVehicles ? <p className="text-sm text-steel">{l('بدون این تأیید، این موارد ساخته و به کالاها وصل نمی‌شوند.', 'Without this, these are neither created nor linked.')}</p> : null}
                </Alert>
              ) : null}
              {fleet.similar.length ? (
                <Alert tone="warning" title={l('موارد مشکوک به تکرار: نام خیلی شبیه خودروی موجود', 'Possible duplicates: very similar to an existing vehicle')}>
                  <p className="text-sm">{l('این نام‌ها ساخته نمی‌شوند. اگر منظور همان خودروی موجود است، تیک «اتصال» را نگه دارید.', 'These names are never created. Keep «link» ticked if the existing vehicle is meant.')}</p>
                  <ul className="mt-1 flex flex-col">
                    {fleet.similar.map((x) => (
                      <li key={x.text}>
                        <Checkbox id={`imp-similar-${x.text}`} checked={linkSimilar.includes(x.text)}
                          label={<span>«{x.text}» ← {l('اتصال به', 'link to')} «{x.suggestion}» <span className="text-steel">({l('ردیف', 'row')} {x.rows.map((r) => num(r)).join('، ')})</span></span>}
                          onChange={(e) => setLinkSimilar(e.target.checked ? [...linkSimilar, x.text] : linkSimilar.filter((y) => y !== x.text))} />
                      </li>
                    ))}
                  </ul>
                </Alert>
              ) : null}
            </div>
          ) : null}
          {missing.length ? <Alert tone="danger" className="mb-4" title={l(`برای ثبت این تغییرات مجوز «${missing.map((p) => permName[p] ?? p).join('، ')}» لازم است.`, `Applying these changes needs the permission: ${missing.map((p) => permName[p] ?? p).join(', ')}.`)} /> : null}
          <ul className="mb-4 list-disc space-y-1 ps-5 text-sm leading-7">
            <li>{l(`${num(s.create)} کالای تازه به‌صورت پیش‌نویس (منتشرنشده) و ${num(s.update)} به‌روزرسانی`, `${num(s.create)} new products as drafts (unpublished) and ${num(s.update)} updates`)}</li>
            {hasNew && createVehicles ? <li>{l(`${num(fleet.newVehicles.length)} خودروی تازه و ${num(fleet.newModels.length)} مدل تازه`, `${num(fleet.newVehicles.length)} new vehicles and ${num(fleet.newModels.length)} new models`)}</li> : null}
            {unit ? <li>{l('واحد قیمت', 'Price unit')}: {unit === 'IRR' ? l('ریال', 'rial') : unit === 'AED' ? l('درهم', 'dirham') : l('تومان، تبدیل به ریال', 'toman, converted to rial')}</li> : null}
            {j.settings?.columns.on_hand !== undefined ? <li>{l('موجودی', 'Stock')}: {j.settings.stockMode === 'ADD' ? l('افزودن به موجودی فعلی', 'added to the current stock') : l('جایگزینی موجودی فعلی', 'replaces the current stock')}</li> : null}
          </ul>
          <Button size="lg" disabled={!canApply} onClick={() => setConfirming(true)}>{l('ثبت تغییرات', 'Apply the changes')}</Button>
          {blockedByErrors ? <p className="mt-2 text-sm text-steel">{t('admin.importBlocked')}</p> : null}
          <Dialog open={confirming} onOpenChange={setConfirming} title={l('ثبت تغییرات؟', 'Apply the changes?')} closeLabel={t('common.close')}
            description={l(`${num(s.create)} کالای تازه و ${num(s.update)} به‌روزرسانی ثبت می‌شود${skip && s.error ? `؛ ${num(s.error)} ردیف خطادار ثبت نمی‌شود` : ''}. اگر پس از پیش‌نمایش کالایی تغییر کرده باشد، هیچ چیز ثبت نمی‌شود.`, `${num(s.create)} new products and ${num(s.update)} updates will be applied${skip && s.error ? `; ${num(s.error)} rows with errors are left out` : ''}. If a product changed after the preview, nothing is applied.`)}>
            {error ? <Alert tone="danger" className="mb-3" title={error} /> : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void apply()} loading={busy}>{l('بله، ثبت شود', 'Yes, apply')}</Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
            </div>
          </Dialog>
          {error && !confirming ? <Alert tone="danger" className="mt-3" title={error} /> : null}
        </>
      )}
    </Section>
  );
}

function ResultSection({ job: j }: { job: ImportJobView }) {
  const l = useL();
  const locale = useLocale();
  const num = useNumber();
  const r = j.summary?.result;
  return (
    <Section title={l('نتیجهٔ ثبت', 'Result')} id="imp-result">
      <Alert tone="success" title={l('تغییرات ثبت شد', 'The changes were applied')}>
        {r ? <p>{l(`${num(r.created)} کالای تازه، ${num(r.updated)} به‌روزرسانی، ${num(r.unchanged)} بدون تغییر و ${num(r.skipped)} ردیف خطادار که ثبت نشد.`, `${num(r.created)} new, ${num(r.updated)} updated, ${num(r.unchanged)} unchanged and ${num(r.skipped)} rows with errors that were not applied.`)}</p> : null}
        {r && (r.vehiclesCreated || r.modelsCreated) ? <p>{l(`${num(r.vehiclesCreated ?? 0)} خودروی تازه و ${num(r.modelsCreated ?? 0)} مدل تازه به فهرست خودروها اضافه شد.`, `${num(r.vehiclesCreated ?? 0)} vehicles and ${num(r.modelsCreated ?? 0)} models were added to the vehicle list.`)}</p> : null}
        <p className="mt-1 text-sm">{l('کالاهای تازه پیش‌نویس‌اند و پس از بررسی و عکس، از صفحهٔ هر محصول منتشر می‌شوند.', 'New products are drafts; publish them from each product’s page after checking them and adding photos.')}</p>
      </Alert>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <ButtonLink href={`/admin/imports/${j.jobId}/products`} size="lg" icon={<Images aria-hidden className="size-5" />}>{l('مشاهدهٔ قطعات واردشده و افزودن عکس', 'View the imported parts and add photos')}</ButtonLink>
        <a href={`/api/v1/admin/imports/${j.jobId}/report.xlsx?locale=${locale}`} download className="inline-flex min-h-11 items-center gap-2 font-semibold text-action underline"><Download aria-hidden className="size-4" />{l('گزارش کامل ردیف‌ها', 'Full row report')}</a>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Step 5: the imported parts and their photos
// ---------------------------------------------------------------------------

export function ImportedProductsPage({ jobId }: { jobId: string }) {
  const t = useTranslations();
  const l = useL();
  const locale = useLocale() as 'fa' | 'en';
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const [noPhoto, setNoPhoto] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ImportedProductView | null>(null);
  const path = `/admin/imports/${jobId}/products?page=${page}${applied ? `&q=${encodeURIComponent(applied)}` : ''}${noPhoto ? '&noPhoto=1' : ''}`;
  const list = useApi<{ items: ImportedProductView[]; total: number; page: number; pageSize: number }>(path);
  const reload = list.reload;
  const onPhotosChanged = useCallback(() => void reload(), [reload]);
  const num = useNumber();
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title={l('قطعات واردشده و عکس‌ها', 'Imported parts and photos')}
        description={l('برای هر قطعه یک یا چند عکس واقعی از همان قطعه بگذارید. عکس‌ها با شناسهٔ ثابت محصول ذخیره می‌شوند، نه با نام یا ردیف Excel.', 'Add one or more real photos of each part. Photos are linked to the product’s permanent id, never to its name or Excel row.')}
        actions={<ButtonLink href={`/admin/imports/${jobId}`} variant="secondary" icon={locale === 'fa' ? <ArrowRight aria-hidden className="size-4" /> : <ArrowLeft aria-hidden className="size-4" />}>{l('بازگشت به این واردکردن', 'Back to this import')}</ButtonLink>}
      />
      <Steps current={5} />
      <form className="mb-4 flex flex-wrap items-end gap-3" role="search" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(q.trim()); }}>
        <Field id="ip-q" label={l('جست‌وجو با نام، شماره فنی یا کد کالا', 'Search by name, technical number or SKU')} className="min-w-64 flex-1"><Input id="ip-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        <Checkbox id="ip-nophoto" label={l('فقط قطعه‌های بدون عکس', 'Only parts without photos')} checked={noPhoto} onChange={(e) => { setPage(1); setNoPhoto(e.target.checked); }} />
        <Button type="submit" variant="secondary">{t('common.search')}</Button>
      </form>
      {list.error ? <Alert tone="danger" title={errorText(t, list.error)} /> : null}
      {list.data ? (
        list.data.items.length ? (
          <>
            <p className="mb-2 text-sm text-steel">{l(`${num(list.data.total)} قطعه`, `${num(list.data.total)} parts`)}</p>
            <ul className="flex flex-col gap-3 md:hidden" aria-label={l('قطعه‌های این نوبت واردکردن', 'Parts of this import')}>
              {list.data.items.map((p) => (
                <li key={p.productId} className="flex gap-3 rounded-[var(--radius-card)] border border-line-soft bg-white p-3">
                  {p.primaryPhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/media/${p.primaryPhoto.storageKey}`} alt={p.primaryPhoto.alt} width={72} height={54} className="h-14 w-18 shrink-0 rounded-[var(--radius-control)] bg-surface object-contain" loading="lazy" />
                  ) : <span aria-hidden className="media-placeholder h-14 w-18 shrink-0 rounded-[var(--radius-control)]" />}
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/products/${p.productId}`} className="font-semibold leading-7 text-action underline underline-offset-4" dir="auto">{p.nameFa}</Link>
                    <p className="mt-1 text-sm">{p.technicalNumbers.map((c) => <Code key={c} className="me-2">{c}</Code>)}{!p.technicalNumbers.includes(p.sku) ? <Code>{p.sku}</Code> : null}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-steel">
                      {p.brand ? <span>{p.brand}</span> : null}
                      {p.photoCount ? <span>{l(`${num(p.photoCount)} عکس`, `${num(p.photoCount)} photos`)}</span> : <Badge tone="warning">{l('بدون عکس', 'No photo')}</Badge>}
                      {p.published ? <Badge tone="success">{l('منتشرشده', 'Published')}</Badge> : <Badge>{l('پیش‌نویس', 'Draft')}</Badge>}
                    </p>
                    {!p.published && p.photoRequiredToPublish && !p.photoCount ? <p className="mt-1 text-xs text-warning">{l('برای انتشار، عکس واقعی لازم است', 'A real photo is needed to publish')}</p> : null}
                    <Button size="sm" variant="secondary" className="mt-2" icon={<Images aria-hidden className="size-4" />} onClick={() => setSelected(p)}>{p.photoCount ? l('مدیریت عکس‌ها', 'Manage photos') : l('افزودن عکس', 'Add photos')}</Button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
            <TableScroll caption={l('قطعه‌های این نوبت واردکردن', 'Parts of this import')}>
              <thead><tr><th className={th}>{l('شماره فنی / کد کالا', 'Technical no. / SKU')}</th><th className={th}>{l('نام قطعه', 'Part name')}</th><th className={th}>{l('برند', 'Brand')}</th><th className={th}>{l('عکس', 'Photos')}</th><th className={th}>{l('انتشار', 'Published')}</th><th className={th}><span className="sr-only">{l('اقدام', 'Action')}</span></th></tr></thead>
              <tbody>
                {list.data.items.map((p) => (
                  <tr key={p.productId}>
                    <td className={td}>
                      {p.technicalNumbers.length ? p.technicalNumbers.map((c) => <Code key={c} className="block">{c}</Code>) : null}
                      {!p.technicalNumbers.includes(p.sku) ? <span className="block text-xs text-steel">{l('کد کالا', 'SKU')}: <Code>{p.sku}</Code></span> : null}
                      <span className="block text-xs text-steel">{l(`ردیف ${num(p.rowNumber)}`, `row ${num(p.rowNumber)}`)}</span>
                    </td>
                    <td className={td}><Link href={`/admin/products/${p.productId}`} className="font-semibold text-action underline underline-offset-4 hover:text-action-hover" dir="auto">{p.nameFa}</Link></td>
                    <td className={td}>{p.brand ?? <span className="text-steel">—</span>}</td>
                    <td className={td}>
                      {p.primaryPhoto ? (
                        <span className="flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/media/${p.primaryPhoto.storageKey}`} alt={p.primaryPhoto.alt} width={48} height={36} className="h-9 w-12 rounded-[var(--radius-control)] bg-surface object-contain" loading="lazy" />
                          <span className="text-sm">{l(`${num(p.photoCount)} عکس`, `${num(p.photoCount)} photos`)}</span>
                        </span>
                      ) : <Badge tone="warning">{l('بدون عکس', 'No photo')}</Badge>}
                    </td>
                    <td className={td}>
                      {p.published ? <Badge tone="success">{l('منتشرشده', 'Published')}</Badge> : <Badge>{l('پیش‌نویس', 'Draft')}</Badge>}
                      {!p.published && p.photoRequiredToPublish && !p.photoCount ? <span className="mt-1 block text-xs text-warning">{l('برای انتشار، عکس واقعی لازم است', 'A real photo is needed to publish')}</span> : null}
                    </td>
                    <td className={td}><Button size="sm" variant="secondary" icon={<Images aria-hidden className="size-4" />} onClick={() => setSelected(p)}>{p.photoCount ? l('مدیریت عکس‌ها', 'Manage photos') : l('افزودن عکس', 'Add photos')}</Button></td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
            </div>
            {pages > 1 ? (
              <nav className="mt-3 flex items-center gap-3" aria-label={l('صفحه‌ها', 'Pages')}>
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{l('قبلی', 'Previous')}</Button>
                <span className="text-sm">{l(`صفحهٔ ${num(page)} از ${num(pages)}`, `Page ${num(page)} of ${num(pages)}`)}</span>
                <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>{l('بعدی', 'Next')}</Button>
              </nav>
            ) : null}
          </>
        ) : <EmptyState title={applied || noPhoto ? l('قطعه‌ای با این شرط نیست.', 'No parts match.') : l('این واردکردن هنوز ثبت نشده یا قطعه‌ای نداشت.', 'This import was not applied yet or had no parts.')} />
      ) : list.error ? null : <p className="text-sm text-steel">{t('common.loading')}</p>}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => { if (!open) setSelected(null); }}
        wide
        title={selected ? <span>{l('عکس‌های', 'Photos of')} <span dir="auto">{selected.nameFa}</span></span> : ''}
        description={selected ? <span>{selected.technicalNumbers.length ? <>{l('شماره فنی', 'Technical no.')}: <Code>{selected.technicalNumbers.join('، ')}</Code> · </> : null}{l('کد کالا', 'SKU')}: <Code>{selected.sku}</Code></span> : undefined}
        closeLabel={t('common.close')}
      >
        {selected ? <ProductPhotoManager productId={selected.productId} productName={selected.nameFa} onChange={onPhotosChanged} /> : null}
        {selected ? <p className="mt-4 text-sm"><Link href={`/admin/products/${selected.productId}`} className="font-semibold text-action underline">{l('ویرایش و انتشار این محصول', 'Edit and publish this product')}</Link></p> : null}
      </Dialog>
    </>
  );
}

