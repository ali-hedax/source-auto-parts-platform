'use client';

import type { BrandImportListItem, BrandImportOptions, BrandImportStats, BrandImportStatus, BrandImportView } from '@hedax/contracts';
import { BRAND_FIELDS, reuseBrandMapping, selectBrandHeader } from '@hedax/domain';
import { DatabaseZap, Download, FileUp, Play, Undo2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Async } from '@/components/ui/async';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/field';
import { DateTime, Num } from '@/components/ui/format';
import { Alert, Badge, Code, EmptyState, PageHeader, Section, TableScroll, td, th } from '@/components/ui/misc';
import { Link, useRouter } from '@/i18n/navigation';
import { api, uploadWithProgress } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';
import { useApi } from '@/lib/use-api';
import { useL } from './shell';

/** Same limit as the API (and Caddy) for one brand file. */
const MAX_BYTES = 150 * 1024 * 1024;
/** While the worker is busy the page asks again every 2 seconds. */
const BUSY: BrandImportStatus[] = ['INSPECTING', 'PREVIEWING', 'QUEUED', 'RUNNING', 'ROLLING_BACK'];

interface Taxonomy { manufacturers: Array<{ id: string; nameFa: string; nameEn: string | null }> }

function useStatusLabel() {
  const l = useL();
  return (s: BrandImportStatus) => {
    const labels: Record<BrandImportStatus, [string, string]> = {
      INSPECTING: ['در حال خواندن فایل', 'Reading the file'],
      AWAITING_MAPPING: ['منتظر تعیین ستون‌ها', 'Waiting for column mapping'],
      PREVIEWING: ['در حال بررسی ردیف‌ها', 'Checking the rows'],
      PREVIEW_READY: ['آمادهٔ شروع', 'Ready to start'],
      QUEUED: ['در صف', 'Queued'],
      RUNNING: ['در حال ورود', 'Importing'],
      COMPLETED: ['انجام شد', 'Done'],
      FAILED: ['ناموفق', 'Failed'],
      ROLLING_BACK: ['در حال برگرداندن', 'Undoing'],
      ROLLED_BACK: ['برگردانده شد', 'Undone'],
    };
    return l(...labels[s]);
  };
}

const tone = (s: BrandImportStatus) => (s === 'COMPLETED' ? 'success' : s === 'FAILED' ? 'danger' : s === 'ROLLED_BACK' ? 'neutral' : BUSY.includes(s) ? 'info' : 'warning') as 'success' | 'danger' | 'neutral' | 'info' | 'warning';

function useIssueText() {
  const l = useL();
  const map: Record<string, [string, string]> = {
    PART_NUMBER_REQUIRED: ['شمارهٔ فنی خالی است', 'Part number is empty'],
    PART_NUMBER_TOO_LONG: ['شمارهٔ فنی بیش از ۸۰ نویسه است', 'Part number is longer than 80 characters'],
    DUPLICATE_IN_FILE: ['این شماره در همین فایل تکرار شده است (ردیف اول استفاده می‌شود)', 'Repeated in this file (the first row is used)'],
    UNKNOWN_VEHICLE: ['خودرو در پنل نیست (اضافه نمی‌شود)', 'Vehicle is not in the panel (not added)'],
    YEAR_INVALID: ['سال نامعتبر است', 'Invalid year'],
    FITMENT_INVALID: ['کاربرد قابل خواندن نیست', 'Fitment could not be read'],
    IMPORT_RECOVERY_REVIEW_REQUIRED: ['این ورود قدیمی نقطهٔ ادامهٔ امن ندارد. داده‌ها و گزارش حفظ شده‌اند؛ پیش از ورود دوباره، نتیجه و امکان بازگردانی را بررسی کنید.', 'This older import has no safe recovery point. Its data and report were preserved. Review the result and available Undo before importing again.'],
    ZIP_HAS_NO_SPREADSHEET: ['فایل ZIP باید شامل XLSX، XLS یا CSV باشد.', 'The ZIP must contain XLSX, XLS or CSV files.'],
    ZIP_UNSUPPORTED_SPREADSHEET: ['ZIP تو در تو یا فایل XLSM/XLSB پذیرفته نمی‌شود؛ فایل‌ها را جداگانه به XLSX تبدیل کنید.', 'Nested ZIP and XLSM/XLSB files are not supported. Convert the workbooks to XLSX first.'],
    XLS_TOO_LARGE: ['فایل XLS بیش از حد بزرگ است؛ آن را به چند فایل XLSX تقسیم کنید. سقف XLS برابر ۳۲ مگابایت است.', 'The XLS is too large. Split it into XLSX files. XLS files are limited to 32 MB.'],
    WORKBOOK_TOO_LARGE: ['یکی از فایل‌های داخل ZIP بزرگ‌تر از حد مجاز است؛ آن را تقسیم کنید.', 'A workbook inside the ZIP exceeds the size limit. Split it into smaller files.'],
    XLS_PROCESSING_LIMIT: ['خواندن XLS از حد حافظه عبور کرد یا متوقف شد؛ فایل را بررسی و به XLSX تبدیل کنید.', 'The XLS reader stopped or reached its memory limit. Check the file and convert it to XLSX.'],
    XLS_TIME_LIMIT: ['خواندن XLS بیش از حد طول کشید؛ فایل کوچک‌تر یا XLSX بارگذاری کنید.', 'Reading the XLS took too long. Upload a smaller file or an XLSX.'],
    XLS_UNREADABLE: ['فایل XLS قابل خواندن نیست؛ فایل بدون رمز را با فرمت XLSX ذخیره کنید.', 'The XLS could not be read. Save an unencrypted XLSX copy.'],
    WORKBOOK_FORMAT_MISMATCH: ['محتوای فایل با پسوند آن مطابقت ندارد؛ فایل Excel معتبر بارگذاری کنید.', 'The file content does not match its extension. Upload a valid Excel workbook.'],
    FILE_TOO_MANY_COLUMNS: ['فایل بیش از ۲۰۰ ستون دارد؛ ستون‌های غیرضروری را از نسخهٔ ورود حذف کنید.', 'The file has more than 200 columns. Remove unused columns from your import copy.'],
  };
  return (code: string) => (map[code] ? l(...map[code]) : code);
}

/** Panel → «ورود دیتابیس برند»: history and a new upload, or one import (?id=). */
export function BrandImportsPage() {
  const search = useSearchParams();
  const id = search.get('id');
  return id && /^[0-9a-f-]{36}$/i.test(id) ? <BrandImportDetail id={id} /> : <BrandImportsHome />;
}

function BrandImportsHome() {
  const l = useL();
  const t = useTranslations();
  const router = useRouter();
  const statusLabel = useStatusLabel();
  const history = useApi<BrandImportListItem[]>('/admin/brand-imports');
  const taxonomy = useApi<Taxonomy>('/admin/taxonomy');
  const [maker, setMaker] = useState('');
  const [source, setSource] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!maker) return setError(l('برند سازنده را انتخاب کنید.', 'Choose the part brand.'));
    if (!source.trim()) return setError(l('منبع داده را بنویسید (مثلاً «کاتالوگ رسمی ۱۴۰۵»).', 'Enter the data source (e.g. “Official catalog 2026”).'));
    if (!file) return setError(l('یک فایل انتخاب کنید.', 'Choose a file.'));
    if (!/\.(xlsx|xls|csv|zip)$/i.test(file.name)) return setError(l('فقط فایل xlsx، xls، csv یا zip شامل این فایل‌ها.', 'Only xlsx, xls, csv, or a zip containing these files.'));
    if (file.size > MAX_BYTES) return setError(l('حجم فایل نباید بیشتر از ۱۵۰ مگابایت باشد.', 'The file must not exceed 150 MB.'));
    setBusy(true);
    try {
      const form = new FormData();
      form.append('manufacturerBrandId', maker);
      form.append('source', source.trim());
      form.append('file', file);
      const res = await uploadWithProgress<{ id: string }>('/admin/brand-imports/upload', form, setProgress).promise;
      router.push(`/admin/brand-imports?id=${res.id}`);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={l('ورود دیتابیس برند', 'Brand database import')}
        description={l(
          'فهرست قطعه‌های یک سازنده را وارد کنید: XLSX، XLS، CSV یا ZIP شامل این فایل‌ها. ستون‌ها و ردیف عنوان هر شیت را بررسی کنید؛ تنظیمات برای همان برند و منبع ذخیره می‌شود. قطعه‌های جدید قیمت ندارند و ورود دوباره رکورد تکراری نمی‌سازد. قیمت، موجودی و عکس‌های دستی تغییر نمی‌کند.',
          'Import one manufacturer’s parts list: XLSX, XLS, CSV, or a ZIP containing these files. Review each sheet’s header and column mapping; settings are saved for that brand and source. New parts have no price, and repeated imports do not create duplicates. Existing prices, stock and photos are preserved.',
        )}
      />
      <ImportGuide />
      <Section title={l('ورود جدید', 'New import')} id="bi-upload">
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2" noValidate>
          <Async state={taxonomy}>
            {(tax) => (
              <Field id="bi-maker" label={l('برند سازنده', 'Part brand')} required>
                <Select id="bi-maker" value={maker} onChange={(e) => setMaker(e.target.value)} disabled={busy}>
                  <option value="">—</option>
                  {tax.manufacturers.map((m) => <option key={m.id} value={m.id}>{l(m.nameFa, m.nameEn ?? m.nameFa)}</option>)}
                </Select>
              </Field>
            )}
          </Async>
          <Field id="bi-source" label={l('منبع داده', 'Data source')} required hint={l('ستون‌ها برای هر «برند + منبع» جدا ذخیره می‌شوند.', 'The mapping is saved per brand and source.')}>
            <Input id="bi-source" value={source} maxLength={120} onChange={(e) => setSource(e.target.value)} disabled={busy} />
          </Field>
          <Field id="bi-file" label={l('فایل', 'File')} required hint={l('XLSX، CSV یا ZIP تا ۱۵۰ مگابایت؛ هر XLS حداکثر ۳۲ مگابایت. CSV با UTF-8 یا Windows-1256.', 'XLSX, CSV or ZIP up to 150 MB; each XLS up to 32 MB. CSV supports UTF-8 or Windows-1256.')} className="md:col-span-2">
            <Input id="bi-file" type="file" accept=".xlsx,.xls,.csv,.zip" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={busy} />
          </Field>
          {error ? <Alert tone="danger" title={error} className="md:col-span-2" /> : null}
          <div className="md:col-span-2">
            <Button type="submit" loading={busy} icon={<FileUp aria-hidden className="size-4" />}>{l('بارگذاری و خواندن ستون‌ها', 'Upload and read the columns')}</Button>
            {busy ? <progress className="ms-4 h-2 w-full max-w-xs align-middle" max={1} {...(progress !== null ? { value: progress } : {})} aria-label={l('پیشرفت بارگذاری', 'Upload progress')} /> : null}
          </div>
        </form>
      </Section>
      <Section title={l('سابقهٔ ورودها', 'Import history')} id="bi-history">
        <Async state={history}>
          {(items) => items.length ? (
            <TableScroll caption={l('سابقهٔ ورودها', 'Import history')}>
              <thead>
                <tr>
                  <th className={th}>{l('برند', 'Brand')}</th><th className={th}>{l('فایل', 'File')}</th><th className={th}>{l('تاریخ', 'Date')}</th><th className={th}>{l('کاربر', 'User')}</th>
                  <th className={th}>{l('وضعیت', 'Status')}</th><th className={th}>{l('نتیجه', 'Result')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td className={td}>{i.manufacturer.nameFa}<span className="block text-xs text-steel">{i.source}</span></td>
                    <td className={td}><Link href={`/admin/brand-imports?id=${i.id}`} className="font-semibold text-action underline underline-offset-4" dir="auto">{i.filename}</Link></td>
                    <td className={td}><DateTime iso={i.createdAt} withTime /></td>
                    <td className={td}>{i.createdBy ?? '—'}</td>
                    <td className={td}><Badge tone={tone(i.status)}>{statusLabel(i.status)}</Badge></td>
                    <td className={td}><StatsLine stats={i.stats} errorCount={i.errorCount} /></td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          ) : <EmptyState title={l('هنوز دیتابیسی وارد نشده است.', 'No brand database has been imported yet.')} icon={<DatabaseZap aria-hidden />} />}
        </Async>
      </Section>
    </div>
  );
}

/** The whole path in five steps, with the sample file, so nobody has to guess what to do first. */
function ImportGuide() {
  const l = useL();
  const steps: Array<[string, string]> = [
    ['فایل نمونه را دریافت کنید و ببینید هر ستون چه چیزی است. اگر فایل شما عنوان یا چند شیت دارد، پس از بارگذاری ردیف عنوان و شیت‌های موردنیاز را انتخاب کنید.', 'Download the sample to see what each column holds. After uploading, choose the header row and sheets you want to include.'],
    ['پایین همین صفحه برند سازنده را انتخاب کنید، منبع را بنویسید (مثلاً «کاتالوگ رسمی ۱۴۰۵») و فایل را بارگذاری کنید.', 'Below, choose the part brand, enter the source (e.g. “Official catalog 2026”) and upload the file.'],
    ['ستون‌ها را بررسی کنید: هر ستون فایل به کدام مورد می‌رود. فقط «شمارهٔ فنی» لازم است؛ بقیه اختیاری است.', 'Check the columns: which file column goes to which item. Only “Part number” is required.'],
    ['پیش‌نمایش را ببینید: تعداد قطعهٔ جدید، به‌روزرسانی، تکراری و خطا. اگر درست بود «شروع ورود» را بزنید.', 'Look at the preview: new, updated, duplicate and error counts. If it is right, press “Start the import”.'],
    ['ورود در پس‌زمینه انجام می‌شود. در پایان گزارش را دانلود کنید. «برگرداندن این ورود» تغییرات قابل بازگشت را برمی‌گرداند؛ قطعه‌های ویرایش‌شده یا استفاده‌شده در فروش حفظ و در گزارش مشخص می‌شوند.', 'The import runs in the background. Download the report when it finishes. Undo reverses eligible changes; parts edited or used in commerce afterwards are preserved and listed in the report.'],
  ];
  return (
    <Section
      title={l('راهنما: ورود گروهی قطعه‌ها در ۵ مرحله', 'Guide: bulk import in 5 steps')}
      id="bi-guide"
      actions={(
        <a href="/api/v1/admin/brand-imports/sample.xlsx" download data-testid="brand-sample"
          className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-action px-4 text-sm font-semibold text-white transition-colors hover:bg-action-hover">
          <Download aria-hidden className="size-4" />{l('دریافت فایل نمونه (Excel)', 'Download the sample (Excel)')}
        </a>
      )}
    >
      <ol className="flex flex-col gap-3">
        {steps.map(([fa, en], i) => (
          <li key={fa} className="flex gap-3">
            <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-action/10 text-sm font-bold text-action"><Num value={i + 1} /></span>
            <span className="leading-7">{l(fa, en)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 border-t border-line-soft pt-3 text-sm text-steel">
        {l('فقط چند قطعه دارید یا قیمت و موجودی هم می‌خواهید وارد کنید؟ از ', 'Only a few parts, or prices and stock too? Use ')}
        <Link href="/admin/imports" className="font-semibold text-action underline underline-offset-4">{l('ورود Excel', 'Excel import')}</Link>
        {l(' استفاده کنید (قالب آن همان‌جا دانلود می‌شود). برای یک قطعه: ', ' (its template downloads there). For one part: ')}
        <Link href="/admin/products/new" className="font-semibold text-action underline underline-offset-4">{l('قطعهٔ جدید', 'New part')}</Link>.
      </p>
    </Section>
  );
}

function StatsLine({ stats, errorCount }: { stats: BrandImportStats; errorCount: number }) {
  const l = useL();
  const parts: Array<[string, number | undefined]> = [
    [l('جدید', 'new'), stats.created], [l('به‌روز', 'updated'), stats.updated], [l('حذف', 'deleted'), stats.deleted], [l('بازگردانده', 'restored'), stats.restored], [l('حفظ‌شده', 'preserved'), stats.preserved],
  ];
  const shown = parts.filter(([, n]) => n !== undefined);
  return (
    <span className="text-sm">
      {shown.map(([label, n], i) => <span key={label}>{i ? '، ' : ''}{label}: <Num value={n ?? 0} /></span>)}
      {errorCount ? <span className="block text-xs text-danger">{l('خطا', 'Errors')}: <Num value={errorCount} /></span> : null}
    </span>
  );
}

function BrandImportDetail({ id }: { id: string }) {
  const state = useApi<BrandImportView>(`/admin/brand-imports/${id}`);
  const busy = state.data ? BUSY.includes(state.data.status) : false;
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => void state.reload(), 2000);
    return () => clearInterval(timer);
  }, [busy, state]);
  return <Async state={state}>{(v) => <ImportView v={v} reload={state.reload} />}</Async>;
}

function ImportView({ v, reload }: { v: BrandImportView; reload: () => Promise<void> }) {
  const l = useL();
  const t = useTranslations();
  const statusLabel = useStatusLabel();
  const issueText = useIssueText();
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    setWorking(true);
    try { await fn(); await reload(); } catch (e) { setError(errorText(t, e)); } finally { setWorking(false); }
  };
  const editable = v.status === 'AWAITING_MAPPING' || v.status === 'PREVIEW_READY';
  const pct = v.totalRows ? Math.min(100, Math.round((v.processedRows / v.totalRows) * 100)) : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<span dir="auto">{v.filename}</span>}
        description={`${v.manufacturer.nameFa} — ${v.source}`}
        actions={<Link href="/admin/brand-imports" className="font-semibold text-action underline underline-offset-4">{l('بازگشت به سابقهٔ ورودها', 'Back to import history')}</Link>}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={tone(v.status)}>{statusLabel(v.status)}</Badge>
        {v.totalRows !== null ? <span className="text-sm text-steel">{l('ردیف‌ها', 'Rows')}: <Num value={v.totalRows} /></span> : null}
        {v.createdBy ? <span className="text-sm text-steel">{v.createdBy} — <DateTime iso={v.createdAt} withTime /></span> : null}
      </div>
      {error ? <Alert tone="danger" title={error} /> : null}
      {v.failureReason ? <Alert tone="danger" title={l('کار متوقف شد', 'The import stopped')}>{issueText(v.failureReason)}</Alert> : null}
      {v.status === 'RUNNING' || v.status === 'QUEUED' ? (
        <Section title={l('پیشرفت', 'Progress')} id="bi-progress">
          <progress className="h-3 w-full" max={100} value={pct} aria-label={l('پیشرفت ورود', 'Import progress')} />
          <p className="mt-2 text-sm text-steel"><Num value={v.processedRows} /> / <Num value={v.totalRows ?? 0} /> ({l('درصد', 'percent')} <Num value={pct} />) — {l('می‌توانید این صفحه را ببندید؛ کار در پس‌زمینه ادامه دارد.', 'You can close this page; the work continues in the background.')}</p>
        </Section>
      ) : null}
      {BUSY.includes(v.status) && v.status !== 'RUNNING' && v.status !== 'QUEUED' ? <Alert tone="info" title={`${statusLabel(v.status)}…`} /> : null}
      {editable && v.outline ? <MappingEditor v={v} working={working} onSave={(mapping, options) => act(() => api(`/admin/brand-imports/${v.id}/mapping`, { method: 'PUT', body: { mapping, options } }))} /> : null}
      {v.status === 'PREVIEW_READY' ? (
        <Section title={l('پیش‌نمایش', 'Preview')} id="bi-preview">
          <ul className="mb-4 flex flex-wrap gap-2" data-testid="brand-import-counts">
            <li><Badge tone="success">{l('جدید', 'New')}: <Num value={v.stats.new ?? 0} /></Badge></li>
            <li><Badge tone="info">{l('به‌روزرسانی', 'Update')}: <Num value={v.stats.update ?? 0} /></Badge></li>
            <li><Badge tone="warning">{l('تکراری در فایل', 'Duplicate in file')}: <Num value={v.stats.duplicate ?? 0} /></Badge></li>
            <li><Badge tone="danger">{l('خطا', 'Error')}: <Num value={v.stats.error ?? 0} /></Badge></li>
          </ul>
          <PreviewTable v={v} issueText={issueText} />
          <p className="mt-4 text-sm text-steel">
            {v.options.publish
              ? l('قطعه‌های جدید بلافاصله در سایت منتشر می‌شوند (بدون قیمت، با «درخواست تأمین»).', 'New parts are published at once (no price, with “Request this part”).')
              : l('قطعه‌های جدید پیش‌نویس می‌مانند و در سایت دیده نمی‌شوند.', 'New parts stay as drafts and are not shown on the site.')}
          </p>
          <Button className="mt-3" loading={working} icon={<Play aria-hidden className="size-4" />} onClick={() => void act(() => api(`/admin/brand-imports/${v.id}/start`, { method: 'POST' }))}>{l('شروع ورود', 'Start the import')}</Button>
        </Section>
      ) : null}
      {v.status === 'COMPLETED' || v.status === 'FAILED' || v.status === 'ROLLED_BACK' ? (
        <Section title={l('نتیجه', 'Result')} id="bi-result">
          <StatsLine stats={v.stats} errorCount={v.errorCount} />
          {v.stats.unknownVehicles ? <p className="mt-2 text-sm text-steel">{l('خودروهایی که در پنل نبودند (کاربردشان ثبت نشد)', 'Vehicles not in the panel (their fitment was not added)')}: <Num value={v.stats.unknownVehicles} /></p> : null}
          {v.stats.archived ? <p className="mt-2 text-sm text-steel">{l('قطعه‌هایی که در این مدت فروخته، قیمت‌گذاری یا عکس‌دار شده بودند حذف نشدند و بایگانی شدند', 'Parts sold, priced or photographed meanwhile were archived instead of deleted')}: <Num value={v.stats.archived} /></p> : null}
          {v.stats.preserved ? <Alert tone="warning" title={l('بعضی قطعه‌ها بدون تغییر حفظ شدند', 'Some parts were preserved unchanged')} className="mt-3">{l('این قطعه‌ها پس از ورود تغییر کرده‌اند، در فروش استفاده شده‌اند یا سابقهٔ کافی برای بازگردانی امن ندارند. جزئیات در گزارش CSV آمده است.', 'These parts changed after import, were used in commerce, or lack a safe undo checkpoint. See the CSV report for details.')}</Alert> : null}
        </Section>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {v.errorCount ? (
          <a href={`/api/v1/admin/brand-imports/${v.id}/errors.csv`} download className="inline-flex min-h-11 items-center gap-2 font-semibold text-action underline underline-offset-4">
            <Download aria-hidden className="size-4" />{l('دانلود گزارش خطاها (CSV)', 'Download the error report (CSV)')}
          </a>
        ) : null}
        {v.canRollback ? (
          <Button variant="secondary" loading={working} icon={<Undo2 aria-hidden className="size-4" />}
            onClick={() => {
              if (window.confirm(l('تغییرات این ورود برای قطعه‌های دست‌نخورده بازگردانده می‌شود. قطعه‌های ویرایش‌شده، استفاده‌شده در فروش یا فاقد سابقهٔ بازگردانی امن حفظ و گزارش می‌شوند. ادامه می‌دهید؟', 'Undo this import for untouched parts? Later edits, commercial use and parts without a safe undo checkpoint will be preserved and reported.'))) {
                void act(() => api(`/admin/brand-imports/${v.id}/rollback`, { method: 'POST' }));
              }
            }}>
            {l('برگرداندن این ورود', 'Undo this import')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function PreviewTable({ v, issueText }: { v: BrandImportView; issueText: (code: string) => string }) {
  const l = useL();
  const t = useTranslations();
  const state: Record<string, [string, string, 'success' | 'info' | 'warning' | 'danger']> = {
    NEW: ['جدید', 'New', 'success'], UPDATE: ['به‌روزرسانی', 'Update', 'info'], DUPLICATE: ['تکراری', 'Duplicate', 'warning'], ERROR: ['خطا', 'Error', 'danger'],
  };
  if (!v.preview.length) return null;
  return (
    <TableScroll caption={l('نمونهٔ ردیف‌ها', 'Sample rows')}>
      <thead>
        <tr>
          <th className={th}>{l('ردیف', 'Row')}</th><th className={th}>{l('وضعیت', 'State')}</th><th className={th}>{t('parts.partNumber')}</th><th className={th}>{l('نام', 'Name')}</th>
          <th className={th}>{t('parts.equivalents')}</th><th className={th}>{t('parts.fitmentTable')}</th><th className={th}>{t('parts.specs')}</th>
        </tr>
      </thead>
      <tbody>
        {v.preview.map((r) => {
          const [fa, en, tn] = state[r.state] ?? ['', '', 'info'];
          return (
            <tr key={`${r.rowRef}-${r.state}`}>
              <td className={td}><Code>{r.rowRef}</Code></td>
              <td className={td}><Badge tone={tn}>{l(fa, en)}</Badge>{r.issues.map((i) => <span key={i} className="mt-1 block text-xs text-danger">{issueText(i)}</span>)}</td>
              <td className={td}>{r.partNumber ? <Code>{r.partNumber}</Code> : '—'}</td>
              <td className={td}>{r.nameFa ?? '—'}</td>
              <td className={td} dir="ltr">{r.equivalents.join(', ') || '—'}</td>
              <td className={td}>{r.fitments.join('، ') || '—'}</td>
              <td className={td}>{r.specs.join('، ') || '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </TableScroll>
  );
}

function MappingEditor({ v, working, onSave }: { v: BrandImportView; working: boolean; onSave: (mapping: Record<string, string[]>, options: BrandImportOptions) => void }) {
  const l = useL();
  const t = useTranslations();
  const [sharedMapping, setMapping] = useState<Record<string, string[]>>(v.mapping);
  const [options, setOptions] = useState<BrandImportOptions>(v.options);
  const [sourceName, setSourceName] = useState(v.outline?.[0]?.name ?? '');
  const first = v.outline?.find(s => s.name === sourceName) ?? v.outline?.[0];
  const choice = first ? options.sources?.[first.name] : undefined;
  const headers = useMemo(() => first?.sampleRows && choice
    ? selectBrandHeader(first.sampleRows, choice.headerRow).headers
    : first?.headers ?? [], [first, choice]);
  const mapping = choice?.mapping ?? sharedMapping;
  const set = (key: string, cols: string[]) => {
    if (choice && first) setOptions(o => ({ ...o, sources: { ...o.sources, [first.name]: { ...choice, mapping: { ...mapping, [key]: cols } } } }));
    else setMapping(m => ({ ...m, [key]: cols }));
  };
  const missingPartNumber = !(mapping.partNumber ?? []).length;
  const enabledSources = (v.outline ?? []).filter(s => options.sources?.[s.name]?.enabled !== false);
  const incomplete = enabledSources.filter(s => !(options.sources?.[s.name]?.mapping ?? sharedMapping).partNumber?.length);

  return (
    <Section title={l('ستون‌ها', 'Columns')} id="bi-mapping">
      <p className="mb-3 text-sm text-steel">{l('برای هر مورد، ستون فایل را انتخاب کنید. پیشنهادها از روی نام ستون‌ها پر شده‌اند. برای شماره‌های معادل، کاربرد و مشخصات می‌توانید چند ستون انتخاب کنید (ستون‌های کاربرد با هم ترکیب می‌شوند).', 'Pick the file column for each item. Suggestions are filled from the column names. For equivalents, fitment and specs you can pick several columns (fitment columns are combined).')}</p>
      <p className="mb-3 text-sm text-steel">{l('هر ورود فقط برای برند سازندهٔ انتخاب‌شده است. شیت‌های مربوط به برندهای دیگر را کنار بگذارید. قیمت و موجودی این فایل‌ها در ورود فنی استفاده نمی‌شود.', 'Each import belongs to the selected part manufacturer. Exclude sheets for other manufacturers. Technical import does not use price or stock columns.')}</p>
      {(v.outline?.length ?? 0) > 1 ? <Field id="bi-source" label={l('فایل / شیت برای بررسی ستون‌ها', 'File / sheet to review')} className="mb-4">
        <Select id="bi-source" value={sourceName} onChange={e => setSourceName(e.target.value)}>
          {v.outline?.map(s => <option key={s.name} value={s.name}>{s.name}{options.sources?.[s.name]?.enabled === false ? l(' — کنار گذاشته‌شده', ' — excluded') : ''}</option>)}
        </Select>
      </Field> : null}
      {choice && first ? <div className="mb-4 grid gap-3 md:grid-cols-2">
        <Checkbox id="bi-source-enabled" label={l('ردیف‌های این شیت وارد شوند', 'Include this sheet')} checked={choice.enabled}
          onChange={e => setOptions(o => ({ ...o, sources: { ...o.sources, [first.name]: { ...choice, enabled: e.target.checked } } }))} />
        {first.sampleRows ? <Field id="bi-header-row" label={l('ردیف عنوان ستون‌ها', 'Column header row')}>
          <Select id="bi-header-row" value={choice.headerRow} onChange={e => {
            const selected = selectBrandHeader(first.sampleRows!, Number(e.target.value));
            const nextMapping = reuseBrandMapping(mapping, selected.headers).mapping;
            setOptions(o => ({ ...o, sources: { ...o.sources, [first.name]: { ...choice, headerRow: selected.headerRow, mapping: nextMapping as Record<string, string[]> } } }));
          }}>
            <option value={0}>{l('بدون عنوان؛ همهٔ ردیف‌ها داده هستند', 'No header; every row contains data')}</option>
            {first.sampleRows.map(r => <option key={r.line} value={r.line}>{l('ردیف', 'Row')} {r.line}: {r.cells.filter(Boolean).slice(0, 3).join(' / ').slice(0, 100)}</option>)}
          </Select>
        </Field> : null}
        {first.needsHeaderReview ? <Alert tone="warning" title={l('عنوان ستون‌ها قطعی تشخیص داده نشد؛ نمونه و ردیف عنوان را بررسی کنید.', 'The header could not be identified confidently. Review the sample and header row.')} /> : null}
      </div> : null}
      {v.missingColumns.length ? <Alert tone="warning" className="mb-3" title={l(`این ستون‌های ذخیره‌شده در این فایل نیستند: ${v.missingColumns.join('، ')}`, `These saved columns are not in this file: ${v.missingColumns.join(', ')}`)} /> : null}
      {first ? (
        <details className="mb-4">
          <summary className="cursor-pointer text-sm font-semibold">{l('نمونهٔ ردیف‌های فایل', 'Sample rows of the file')} ({first.name}{first.encoding ? ` · ${first.encoding}` : ''})</summary>
          <TableScroll caption={l('نمونهٔ فایل', 'File sample')}>
            <thead><tr>{headers.map((h) => <th key={h} className={th} dir="auto">{h}</th>)}</tr></thead>
            <tbody>{(choice && first.sampleRows ? first.sampleRows.filter(r => r.line > choice.headerRow).slice(0, 5).map(r => r.cells) : first.samples).map((row, i) => <tr key={i}>{headers.map((_, j) => <td key={j} className={td} dir="auto">{row[j] ?? ''}</td>)}</tr>)}</tbody>
          </TableScroll>
        </details>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {BRAND_FIELDS.map((f) => f.multi ? (
          <fieldset key={f.key} className="flex flex-col gap-1 rounded-[var(--radius-control)] border border-line-soft p-3">
            <legend className="px-1 text-sm font-semibold">{l(f.fa, f.en)}</legend>
            <div className="flex max-h-48 flex-wrap gap-x-4 overflow-auto">
              {headers.map((h) => {
                const cols = mapping[f.key] ?? [];
                return <Checkbox key={h} id={`bi-${f.key}-${h}`} label={<span dir="auto">{h}</span>} checked={cols.includes(h)} onChange={(e) => set(f.key, e.target.checked ? [...cols, h] : cols.filter((c) => c !== h))} />;
              })}
            </div>
          </fieldset>
        ) : (
          <Field key={f.key} id={`bi-${f.key}`} label={l(f.fa, f.en)} {...(f.required ? { required: true } : { optionalLabel: t('common.optional') })}
            {...(f.key === 'partNumber' && missingPartNumber ? { error: l('ستون شمارهٔ فنی لازم است.', 'The part number column is required.') } : {})}>
            <Select id={`bi-${f.key}`} value={(mapping[f.key] ?? [])[0] ?? ''} onChange={(e) => set(f.key, e.target.value ? [e.target.value] : [])}>
              <option value="">{l('— استفاده نشود —', '— not used —')}</option>
              {headers.map((h) => <option key={h} value={h}>{h}</option>)}
            </Select>
          </Field>
        ))}
      </div>
      <div className="mt-6 grid gap-4 border-t border-line-soft pt-4 md:grid-cols-3">
        <Field id="bi-publish" label={l('قطعه‌های جدید', 'New parts')}>
          <Select id="bi-publish" value={options.publish ? '1' : '0'} onChange={(e) => setOptions({ ...options, publish: e.target.value === '1' })}>
            <option value="0">{l('پیش‌نویس (در سایت دیده نشوند)', 'Draft (not shown on the site)')}</option>
            <option value="1">{l('فوراً منتشر شوند (قابل تأمین)', 'Publish now (can be sourced)')}</option>
          </Select>
        </Field>
        <Field id="bi-parttype" label={t('parts.partType')}>
          <Select id="bi-parttype" value={options.partType} onChange={(e) => setOptions({ ...options, partType: e.target.value as BrandImportOptions['partType'] })}>
            {(['GENUINE', 'OEM', 'AFTERMARKET'] as const).map((p) => <option key={p} value={p}>{t(`partType.${p}`)}</option>)}
          </Select>
        </Field>
        <Field id="bi-encoding" label={l('کدگذاری متن CSV', 'CSV text encoding')} hint={l('اگر حروف فارسی به‌هم‌ریخته بود، Windows-1256 را انتخاب کنید.', 'If Persian letters look garbled, choose Windows-1256.')}>
          <Select id="bi-encoding" value={options.encoding} onChange={(e) => setOptions({ ...options, encoding: e.target.value as BrandImportOptions['encoding'] })}>
            <option value="auto">{l('تشخیص خودکار', 'Detect automatically')}</option>
            <option value="utf-8">UTF-8</option>
            <option value="windows-1256">Windows-1256</option>
          </Select>
        </Field>
      </div>
      {incomplete.length ? <p role="status" className="mt-3 text-sm text-danger">{l('برای این شیت‌ها شمارهٔ فنی را تعیین کنید یا آن‌ها را کنار بگذارید: ', 'Map the part number or exclude these sheets: ')}{incomplete.map(s => s.name).join('، ')}</p> : null}
      <Button className="mt-4" loading={working} disabled={!enabledSources.length || incomplete.length > 0} onClick={() => onSave(Object.fromEntries(Object.entries(sharedMapping).filter(([, c]) => c.length)), options)}>
        {l('ذخیرهٔ ستون‌ها و پیش‌نمایش', 'Save columns and preview')}
      </Button>
    </Section>
  );
}
