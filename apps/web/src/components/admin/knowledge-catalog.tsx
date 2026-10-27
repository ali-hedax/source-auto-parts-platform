'use client';

import type { AttachmentView, CatalogChunkPreview, CatalogDocumentStatus, CatalogDocumentView } from '@hedax/contracts';
import { BookOpen, DatabaseZap, Download, FileSpreadsheet, FileUp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Fragment, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { DateTime } from '@/components/ui/format';
import { Alert, EmptyState, PageHeader, Section, StatusBadge, TableScroll, td, th } from '@/components/ui/misc';
import { api, uploadWithProgress } from '@/lib/api/client';
import { errorText, isApiError } from '@/lib/api/errors';
import { useApi } from '@/lib/use-api';
import { Link, useRouter } from '@/i18n/navigation';
import { useL } from './shell';

const MAX_BYTES = 20 * 1024 * 1024;
const STATUSES: CatalogDocumentStatus[] = ['UPLOADED', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED'];

function statusLabel(status: CatalogDocumentStatus, fa: boolean): string {
  const labels: Record<CatalogDocumentStatus, [string, string]> = {
    UPLOADED: ['بارگذاری‌شده', 'Uploaded'],
    PENDING_PROCESSING: ['در انتظار پردازش', 'Pending processing'],
    NEEDS_REVIEW: ['نیازمند بررسی', 'Needs review'],
    APPROVED: ['تأییدشده', 'Approved'],
    REJECTED: ['ردشده', 'Rejected'],
  };
  return labels[status][fa ? 0 : 1];
}

function bytes(value: number, locale: string): string {
  return `${new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-US', { maximumFractionDigits: 1 }).format(value / 1024 / 1024)} MB`;
}

/** Reference files (factory PDF/Excel/CSV catalogs and photos of catalog pages): archive, review, rows → parts. */
function CatalogDocuments({ onConvert }: { onConvert: (documentId: string, ordinal: number) => void }) {
  const t = useTranslations();
  const l = useL();
  const locale = useLocale();
  const fa = locale === 'fa';
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(1);
  const documents = useApi<CatalogDocumentView[]>(`/admin/knowledge-catalog?page=${page}&q=${encodeURIComponent(applied)}`);
  const [title, setTitle] = useState('');
  const [version, setVersion] = useState('1.0');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, CatalogChunkPreview[]>>({});
  const [previewOpen, setPreviewOpen] = useState<string | null>(null);
  const [moreRows, setMoreRows] = useState<Record<string, boolean>>({});

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (!file) return setMessage({ tone: 'danger', text: l('یک فایل انتخاب کنید.', 'Choose a file.') });
    if (!/\.(pdf|xlsx|csv|jpe?g|png|webp)$/i.test(file.name)) return setMessage({ tone: 'danger', text: l('فقط PDF، Excel، CSV یا عکس (JPG، PNG، WebP) پذیرفته می‌شود.', 'Only PDF, Excel, CSV or a photo (JPG, PNG, WebP) is accepted.') });
    if (file.size > MAX_BYTES) return setMessage({ tone: 'danger', text: l('حجم فایل نباید بیشتر از ۲۰ مگابایت باشد.', 'The file must not exceed 20 MB.') });
    setBusy(true);
    try {
      const form = new FormData();
      form.append('purpose', 'KNOWLEDGE_CATALOG');
      form.append('files', file);
      const [uploaded] = await uploadWithProgress<AttachmentView[]>('/attachments', form, setProgress).promise;
      if (!uploaded || uploaded.status === 'REJECTED') throw new Error(uploaded?.rejectReason ?? 'REJECTED');
      let attachment = uploaded;
      for (let i = 0; i < 60 && attachment.status === 'SCANNING'; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        attachment = await api<AttachmentView>(`/attachments/${uploaded.id}`);
      }
      if (attachment.status !== 'READY') throw new Error(attachment.rejectReason ?? 'SCAN_PENDING');
      await api<CatalogDocumentView>('/admin/knowledge-catalog', { method: 'POST', body: { attachmentId: attachment.id, title, version } });
      setTitle(''); setVersion('1.0'); setFile(null); setProgress(null);
      const input = document.getElementById('catalog-file') as HTMLInputElement | null;
      if (input) input.value = '';
      await documents.reload();
      setMessage({ tone: 'success', text: l('فایل با موفقیت به مرکز دانش افزوده شد.', 'The file was added to the knowledge center.') });
    } catch (error) {
      const fallback = (error as Error).message === 'SCAN_PENDING'
        ? l('بررسی امنیتی فایل هنوز تمام نشده است. کمی بعد دوباره تلاش کنید.', 'The security scan is still pending. Try again shortly.')
        : l('بارگذاری فایل انجام نشد.', 'The upload failed.');
      setMessage({ tone: 'danger', text: isApiError(error) ? errorText(t, error) : fallback });
    } finally {
      setBusy(false); setProgress(null);
    }
  };

  const setStatus = async (documentId: string, status: CatalogDocumentStatus) => {
    setUpdating(documentId); setMessage(null);
    try {
      await api(`/admin/knowledge-catalog/${documentId}/status`, { method: 'PATCH', body: { status } });
      await documents.reload();
    } catch (error) {
      setMessage({ tone: 'danger', text: isApiError(error) ? errorText(t, error) : l('تغییر وضعیت انجام نشد.', 'Could not change the status.') });
    } finally { setUpdating(null); }
  };

  const requestExtraction = async (id: string) => {
    setUpdating(id); setMessage(null);
    try {
      await api(`/admin/knowledge-catalog/${id}/extract`, { method: 'POST' });
      setPreviewOpen(null); setPreviews(prev => ({ ...prev, [id]: [] }));
      await documents.reload();
      setMessage({ tone: 'success', text: l('درخواست استخراج ثبت شد. وضعیت را کمی بعد بررسی کنید.', 'Extraction queued. Check status shortly.') });
    } catch (error) {
      setMessage({ tone: 'danger', text: isApiError(error) ? errorText(t, error) : l('درخواست استخراج ناموفق بود.', 'Could not queue extraction.') });
    } finally { setUpdating(null); }
  };

  const togglePreview = async (id: string) => {
    if (previewOpen === id) { setPreviewOpen(null); return; }
    setUpdating(id); setMessage(null);
    try {
      const rows = await api<CatalogChunkPreview[]>(`/admin/knowledge-catalog/${id}/preview`);
      setPreviews((prev) => ({ ...prev, [id]: rows }));
      setMoreRows(prev => ({ ...prev, [id]: rows.length === 100 }));
      setPreviewOpen(id);
    } catch (error) {
      setMessage({ tone: 'danger', text: isApiError(error) ? errorText(t, error) : l('پیش‌نمایش در دسترس نیست.', 'Preview unavailable.') });
    } finally { setUpdating(null); }
  };

  const loadMore = async (id: string) => {
    setUpdating(id); setMessage(null);
    try {
      const previous = previews[id] ?? [];
      const rows = await api<CatalogChunkPreview[]>(`/admin/knowledge-catalog/${id}/preview?after=${previous.at(-1)?.ordinal ?? -1}`);
      setPreviews(prev => ({ ...prev, [id]: [...previous, ...rows] }));
      setMoreRows(prev => ({ ...prev, [id]: rows.length === 100 }));
    } catch (error) { setMessage({ tone: 'danger', text: errorText(t, error) }); }
    finally { setUpdating(null); }
  };

  return (
    <>
      <Section title={l('بارگذاری منبع جدید', 'Upload a new source')} id="catalog-upload">
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <Field id="catalog-title" label={l('عنوان کاتالوگ', 'Catalog title')} required>
            <Input id="catalog-title" value={title} onChange={(e) => setTitle(e.target.value)} minLength={2} maxLength={160} required disabled={busy} />
          </Field>
          <Field id="catalog-version" label={l('نسخه', 'Version')} required hint={l('مثال: 1.0 یا 1405-07', 'For example: 1.0 or 2026-10')}>
            <Input id="catalog-version" value={version} onChange={(e) => setVersion(e.target.value)} maxLength={40} required disabled={busy} dir="ltr" />
          </Field>
          <Field id="catalog-file" label={l('فایل کاتالوگ', 'Catalog file')} required hint={l('PDF، Excel، CSV یا عکس صفحهٔ کاتالوگ؛ حداکثر ۲۰ مگابایت. فایل پیش از باز شدن از نظر امنیتی بررسی می‌شود.', 'PDF, Excel, CSV or a photo of a catalog page, up to 20 MB. The file is checked for safety before it can be opened.')} className="md:col-span-2">
            <Input id="catalog-file" type="file" accept=".pdf,.xlsx,.csv,.jpg,.jpeg,.png,.webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required disabled={busy} />
          </Field>
          <div className="md:col-span-2">
            <Button type="submit" loading={busy} icon={<FileUp aria-hidden className="size-4" />}>{l('بارگذاری و ثبت', 'Upload and save')}</Button>
            {busy ? <progress className="ms-4 h-2 w-full max-w-xs align-middle" max={1} {...(progress !== null ? { value: progress } : {})} aria-label={l('پیشرفت بارگذاری', 'Upload progress')} /> : null}
          </div>
        </form>
        {message ? <Alert tone={message.tone} className="mt-4" title={message.text} /> : null}
      </Section>

      <div className="mt-6">
        <Section title={l('فهرست کاتالوگ‌ها', 'Catalog sources')} id="catalog-list">
          <form className="mb-4 flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); setApplied(query.trim()); setPage(1); }}>
            <Field id="catalog-search" label={l('جست‌وجوی عنوان یا نام فایل', 'Search title or filename')} className="min-w-0 flex-1"><Input id="catalog-search" type="search" maxLength={120} value={query} onChange={e => setQuery(e.target.value)} /></Field>
            <Button type="submit" variant="secondary">{l('جست‌وجو', 'Search')}</Button><Button variant="ghost" onClick={() => void documents.reload()}>{l('تازه‌سازی وضعیت', 'Refresh status')}</Button>
          </form>
          {documents.data?.length ? (
            <TableScroll caption={l('فهرست کاتالوگ‌ها', 'Catalog sources')}>
              <thead><tr><th className={th}>{l('عنوان و فایل', 'Title & file')}</th><th className={th}>{l('نسخه', 'Version')}</th><th className={th}>{l('بارگذار / تاریخ', 'Uploader / date')}</th><th className={th}>{l('وضعیت', 'Status')}</th><th className={th}>{l('دریافت', 'Download')}</th><th className={th}>{l('استخراج و بررسی', 'Extract & review')}</th></tr></thead>
              <tbody>{documents.data.map((item) => (
                <Fragment key={item.id}>
                <tr>
                  <td className={td}><p className="font-semibold">{item.title}</p><p className="mt-1 text-xs text-steel" dir="auto">{item.filename} · {item.extension.toUpperCase()} · {bytes(item.sizeBytes, locale)}</p></td>
                  <td className={td}><span dir="ltr">{item.version}</span></td>
                  <td className={td}><p>{item.uploadedBy.name ?? item.uploadedBy.email ?? '—'}</p><p className="mt-1 text-xs text-steel"><DateTime iso={item.uploadedAt} /></p></td>
                  <td className={td}>
                    <StatusBadge status={item.status} label={statusLabel(item.status, fa)} />
                    <Select className="mt-2 min-w-44" value={item.status} disabled={updating === item.id || item.status === 'PENDING_PROCESSING'} aria-label={l('تغییر وضعیت', 'Change status')} onChange={(e) => void setStatus(item.id, e.target.value as CatalogDocumentStatus)}>
                      {item.status === 'PENDING_PROCESSING' ? <option value="PENDING_PROCESSING">{statusLabel('PENDING_PROCESSING', fa)}</option> : null}
                      {STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status, fa)}</option>)}
                    </Select>
                  </td>
                  <td className={td}><a href={item.downloadUrl} download className="inline-flex min-h-10 items-center gap-2 font-semibold text-action underline underline-offset-4"><Download aria-hidden className="size-4" />{l('دانلود', 'Download')}</a></td>
                  <td className={td}>
                    <div className="flex flex-col gap-2">
                      {(item.extension === 'csv' || item.extension === 'xlsx') && (item.status === 'UPLOADED' || item.status === 'NEEDS_REVIEW') ? (
                        <Button type="button" disabled={updating === item.id} onClick={() => void requestExtraction(item.id)}>
                          {l('خواندن ردیف‌ها', 'Read the rows')}
                        </Button>
                      ) : null}
                      <Button type="button" disabled={updating === item.id} onClick={() => void togglePreview(item.id)}>
                        {previewOpen === item.id ? l('بستن ردیف‌ها', 'Close rows') : l('دیدن ردیف‌های خوانده‌شده', 'View rows read')}
                      </Button>
                      <DocumentActions item={item} onDone={async text => { await documents.reload(); setPreviewOpen(null); setMessage({ tone: 'success', text }); }} />
                      {!['xlsx', 'csv'].includes(item.extension) ? <p className="text-xs leading-6 text-steel">{l('این فایل مرجع است؛ خواندن خودکار PDF و عکس در این نسخه فعال نیست.', 'Reference file; automatic PDF/photo extraction is not enabled in this version.')}</p> : null}
                      {item.processingError ? <p className="text-xs text-steel" dir="auto">{item.processingError}</p> : null}
                    </div>
                  </td>
                </tr>
                {previewOpen === item.id ? (
                  <tr><td colSpan={6} className={td}>
                    <div className="max-h-80 overflow-auto rounded-lg border p-3">
                      <p className="mb-2 text-sm font-semibold">{l('ردیف‌های خوانده‌شده از فایل؛ پیش از ساختن قطعه بررسی کنید.', 'Rows read from the file; check them before making a part.')}</p>
                      {(previews[item.id] ?? []).length ? (previews[item.id] ?? []).map((chunk) => (
                        <div key={chunk.ordinal} className="mb-2 flex flex-wrap items-start justify-between gap-2 border-b pb-2">
                          <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs" dir="auto">{l('ردیف', 'Row')} {chunk.rowStart ?? '—'}: {chunk.contentText}</pre>
                          {(chunk.metadata as { candidatePartNumber?: string | null } | null)?.candidatePartNumber ? (
                            <Button type="button" size="sm" variant="secondary" onClick={() => onConvert(item.id, chunk.ordinal)}>{l('تبدیل به قطعه', 'Make a part')}</Button>
                          ) : null}
                        </div>
                      )) : <p className="text-sm text-steel">{l('هنوز اطلاعاتی استخراج نشده است.', 'No extracted records yet.')}</p>}
                    </div>
                    {moreRows[item.id] ? <Button className="mt-3" variant="secondary" loading={updating === item.id} onClick={() => void loadMore(item.id)}>{l('نمایش ردیف‌های بیشتر', 'Load more rows')}</Button> : null}
                  </td></tr>
                ) : null}
                </Fragment>
              ))}</tbody>
            </TableScroll>
          ) : documents.data ? <EmptyState title={l('هنوز کاتالوگی بارگذاری نشده است.', 'No catalog source has been uploaded yet.')} icon={<BookOpen aria-hidden />} />
            : documents.error ? <Alert tone="danger" title={errorText(t, documents.error)} />
            : <p className="text-sm text-steel">{t('common.loading')}</p>}
          <div className="mt-4 flex items-center gap-3"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>{l('قبلی', 'Previous')}</Button><span>{l('صفحه', 'Page')} {new Intl.NumberFormat(locale).format(page)}</span><Button variant="secondary" disabled={!documents.data || documents.data.length < 50} onClick={() => setPage(p => p + 1)}>{l('بعدی', 'Next')}</Button></div>
        </Section>
      </div>
    </>
  );
}

function DocumentActions({ item, onDone }: { item: CatalogDocumentView; onDone: (text: string) => Promise<void> }) {
  const l = useL(); const t = useTranslations();
  const [mode, setMode] = useState<'edit' | 'delete' | null>(null);
  const [title, setTitle] = useState(item.title); const [version, setVersion] = useState(item.version);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const perform = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api(`/admin/knowledge-catalog/${item.id}`, { method: mode === 'delete' ? 'DELETE' : 'PATCH', body: { expectedUpdatedAt: item.updatedAt, ...(mode === 'edit' ? { title: title.trim(), version: version.trim() } : {}) } });
      setMode(null); await onDone(mode === 'delete' ? l('منبع حذف شد؛ قطعات تغییری نکردند.', 'Reference removed; parts were not changed.') : l('عنوان و نسخه ذخیره شد.', 'Title and version saved.'));
    } catch (e) { setError(errorText(t, e)); } finally { setBusy(false); }
  };
  return <><div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={() => { setTitle(item.title); setVersion(item.version); setError(''); setMode('edit'); }}>{l('ویرایش', 'Edit')}</Button><Button variant="ghost" disabled={item.status === 'PENDING_PROCESSING'} onClick={() => { setError(''); setMode('delete'); }}>{l('حذف منبع', 'Delete reference')}</Button></div>
    <Dialog open={mode !== null} onOpenChange={open => { if (!open && !busy) setMode(null); }} closeLabel={l('بستن', 'Close')} title={mode === 'delete' ? l('حذف منبع مرجع', 'Delete reference') : l('ویرایش کاتالوگ', 'Edit catalog')}>
      <form onSubmit={perform} className="space-y-4">{mode === 'edit' ? <><Field id={`catalog-edit-title-${item.id}`} label={l('عنوان', 'Title')} required><Input id={`catalog-edit-title-${item.id}`} required minLength={2} maxLength={160} value={title} onChange={e => setTitle(e.target.value)} /></Field><Field id={`catalog-edit-version-${item.id}`} label={l('نسخه', 'Version')} required><Input id={`catalog-edit-version-${item.id}`} required maxLength={40} dir="ltr" value={version} onChange={e => setVersion(e.target.value)} /></Field></> : <p className="leading-8">{l(`منبع «${item.title}» و ردیف‌های استخراج‌شدهٔ آن از فهرست حذف می‌شوند. هیچ قطعه‌ای حذف نمی‌شود. منبع در حال پردازش یا متصل به رکورد کاتالوگ قابل حذف نیست.`, `“${item.title}” and its extracted rows will be removed. No parts are deleted. Processing sources and sources linked to catalog entries cannot be deleted.`)}</p>}
      {error ? <Alert tone="danger" title={error} /> : null}<div className="flex gap-2"><Button type="submit" loading={busy} variant={mode === 'delete' ? 'danger' : 'primary'}>{mode === 'delete' ? l('حذف منبع', 'Delete reference') : l('ذخیره', 'Save')}</Button><Button variant="secondary" disabled={busy} onClick={() => setMode(null)}>{l('انصراف', 'Cancel')}</Button></div></form>
    </Dialog></>;
}

/**
 * مرکز دانش (فایل‌های مرجع): بایگانی کاتالوگ‌های کارخانه و عکس صفحه‌های کاتالوگ. از ردیف‌های یک فایل
 * Excel/CSV با «تبدیل به قطعه» فرم قطعه پر می‌شود؛ خودِ قطعه‌ها فقط در «قطعات» نگه‌داری می‌شوند.
 */
export function KnowledgeCatalogPage() {
  const l = useL();
  const router = useRouter();
  const convert = (documentId: string, ordinal: number) => router.push(`/admin/products/new?fromDocument=${documentId}&ordinal=${ordinal}`);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={l('مرکز دانش (فایل‌های مرجع)', 'Knowledge center (reference files)')}
        description={l(
          'کاتالوگ‌های کارخانه (PDF، Excel، CSV) و عکس صفحه‌های کاتالوگ را اینجا نگه دارید تا همیشه در دسترس باشند. از ردیف‌های فایل Excel یا CSV می‌توانید با «تبدیل به قطعه» یک قطعه بسازید. برای واردکردن یک‌جای قطعه‌ها از «ورود Excel» یا «ورود دیتابیس برند» استفاده کنید.',
          'Keep factory catalogs (PDF, Excel, CSV) and photos of catalog pages here so they are always at hand. From the rows of an Excel or CSV file you can make a part with “Make a part”. To add many parts at once, use “Excel import” or “Brand database import”.',
        )}
      />
      <BulkImportPointer />
      <CatalogDocuments onConvert={convert} />
    </div>
  );
}

/**
 * Files here are kept for reference only and do not become parts by themselves. Bulk imports have
 * their own pages with a sample file, so the person is sent there with one click.
 */
function BulkImportPointer() {
  const l = useL();
  const card = 'flex flex-col gap-2 rounded-[var(--radius-card)] border border-line-soft bg-white p-4';
  const button = 'inline-flex min-h-11 items-center gap-2 self-start rounded-[var(--radius-control)] px-4 text-sm font-semibold';
  return (
    <section aria-labelledby="kc-bulk-title" className="rounded-[var(--radius-card)] border border-action/30 bg-action/5 p-4 sm:p-5" data-testid="kc-bulk">
      <h2 id="kc-bulk-title" className="text-lg font-bold">{l('می‌خواهید قطعه‌های یک کاتالوگ را گروهی وارد کنید؟', 'Want to add the parts of a catalog in bulk?')}</h2>
      <p className="mt-1 text-sm leading-7 text-steel">{l('فایل‌هایی که در این صفحه بارگذاری می‌کنید فقط برای مراجعه نگه داشته می‌شوند و خودبه‌خود قطعه نمی‌شوند. برای اینکه قطعه‌ها در «قطعات» و در سایت بیایند، یکی از این دو راه را بروید:', 'Files uploaded on this page are kept for reference only; they do not become parts by themselves. To get the parts into «Parts» and onto the site, take one of these two paths:')}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className={card}>
          <p className="font-semibold">{l('لیست کامل یک سازنده (صدها یا هزاران قطعه، بدون قیمت)', 'A maker’s full list (hundreds or thousands of parts, no price)')}</p>
          <p className="text-sm text-steel">{l('فایل Excel یا CSV کارخانه را همان‌طور که هست وارد کنید؛ ستون‌ها را یک بار تعیین می‌کنید.', 'Import the maker’s Excel or CSV file as it is; you map the columns once.')}</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/brand-imports" className={`${button} bg-action text-white hover:bg-action-hover`}><DatabaseZap aria-hidden className="size-4" />{l('ورود دیتابیس برند', 'Brand database import')}</Link>
            <a href="/api/v1/admin/brand-imports/sample.xlsx" download className={`${button} border border-line-strong bg-white text-ink hover:border-ink`}><Download aria-hidden className="size-4" />{l('فایل نمونه', 'Sample file')}</a>
          </div>
        </div>
        <div className={card}>
          <p className="font-semibold">{l('چند قطعه، همراه با قیمت و موجودی', 'A few parts, with price and stock')}</p>
          <p className="text-sm text-steel">{l('قالب Excel را دریافت کنید، پر کنید و بارگذاری کنید؛ پیش از ثبت پیش‌نمایش را می‌بینید.', 'Download the Excel template, fill it in and upload it; you see a preview before anything is saved.')}</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/imports" className={`${button} bg-action text-white hover:bg-action-hover`}><FileSpreadsheet aria-hidden className="size-4" />{l('ورود Excel', 'Excel import')}</Link>
            <a href="/api/v1/admin/imports/template" download className={`${button} border border-line-strong bg-white text-ink hover:border-ink`}><Download aria-hidden className="size-4" />{l('قالب Excel', 'Excel template')}</a>
          </div>
        </div>
      </div>
    </section>
  );
}
