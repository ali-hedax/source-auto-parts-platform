'use client';

import type { AttachmentView, CatalogChunkPreview, CatalogDocumentStatus, CatalogDocumentView } from '@hedax/contracts';
import { BookOpen, Download, FileUp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Fragment, Suspense, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { DateTime } from '@/components/ui/format';
import { Alert, EmptyState, PageHeader, Section, StatusBadge, TableScroll, td, th } from '@/components/ui/misc';
import { Tabs } from '@/components/ui/tabs';
import { api, uploadWithProgress } from '@/lib/api/client';
import { errorText, isApiError } from '@/lib/api/errors';
import { useApi } from '@/lib/use-api';
import { BulkPhotoUpload } from './bulk-photos';
import { useL } from './shell';

const MAX_BYTES = 20 * 1024 * 1024;
const STATUSES: CatalogDocumentStatus[] = ['UPLOADED', 'PENDING_PROCESSING', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED'];

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

/** The "اسناد و فایل‌های مرجع" tab: upload CSV/XLSX/PDF catalog sources and review/extract them. */
function CatalogDocuments() {
  const t = useTranslations();
  const l = useL();
  const locale = useLocale();
  const fa = locale === 'fa';
  const documents = useApi<CatalogDocumentView[]>('/admin/knowledge-catalog');
  const [title, setTitle] = useState('');
  const [version, setVersion] = useState('1.0');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, CatalogChunkPreview[]>>({});
  const [previewOpen, setPreviewOpen] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (!file) return setMessage({ tone: 'danger', text: l('یک فایل انتخاب کنید.', 'Choose a file.') });
    if (!/\.(pdf|xlsx|csv)$/i.test(file.name)) return setMessage({ tone: 'danger', text: l('فقط PDF، XLSX و CSV پذیرفته می‌شود.', 'Only PDF, XLSX and CSV are accepted.') });
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
      setPreviewOpen(id);
    } catch (error) {
      setMessage({ tone: 'danger', text: isApiError(error) ? errorText(t, error) : l('پیش‌نمایش در دسترس نیست.', 'Preview unavailable.') });
    } finally { setUpdating(null); }
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
          <Field id="catalog-file" label={l('فایل کاتالوگ', 'Catalog file')} required hint={l('PDF، XLSX یا CSV؛ حداکثر ۲۰ مگابایت. فایل پیش از دسترسی اسکن امنیتی می‌شود.', 'PDF, XLSX or CSV, up to 20 MB. The file is security-scanned before access.')} className="md:col-span-2">
            <Input id="catalog-file" type="file" accept=".pdf,.xlsx,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required disabled={busy} />
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
                    <Select className="mt-2 min-w-44" value={item.status} disabled={updating === item.id} aria-label={l('تغییر وضعیت', 'Change status')} onChange={(e) => void setStatus(item.id, e.target.value as CatalogDocumentStatus)}>
                      {STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status, fa)}</option>)}
                    </Select>
                  </td>
                  <td className={td}><a href={item.downloadUrl} download className="inline-flex min-h-10 items-center gap-2 font-semibold text-action underline underline-offset-4"><Download aria-hidden className="size-4" />{l('دانلود', 'Download')}</a></td>
                  <td className={td}>
                    <div className="flex flex-col gap-2">
                      {item.extension !== 'pdf' && (item.status === 'UPLOADED' || item.status === 'NEEDS_REVIEW') ? (
                        <Button type="button" disabled={updating === item.id} onClick={() => void requestExtraction(item.id)}>
                          {l('استخراج اطلاعات', 'Extract candidates')}
                        </Button>
                      ) : null}
                      <Button type="button" disabled={updating === item.id} onClick={() => void togglePreview(item.id)}>
                        {previewOpen === item.id ? l('بستن پیش‌نمایش', 'Close preview') : l('مشاهده داده‌های استخراجی', 'View extracted data')}
                      </Button>
                      {item.processingError ? <p className="text-xs text-steel" dir="auto">{item.processingError}</p> : null}
                    </div>
                  </td>
                </tr>
                {previewOpen === item.id ? (
                  <tr><td colSpan={6} className={td}>
                    <div className="max-h-80 overflow-auto rounded-lg border p-3">
                      <p className="mb-2 text-sm font-semibold">{l('داده‌های پیشنهادی؛ نیازمند تأیید کارشناس', 'Unverified candidates — expert review required')}</p>
                      {(previews[item.id] ?? []).length ? (previews[item.id] ?? []).map((chunk) => (
                        <pre key={chunk.ordinal} className="mb-2 whitespace-pre-wrap break-words border-b pb-2 text-xs" dir="auto">{l('ردیف', 'Row')} {chunk.rowStart ?? '—'}: {chunk.contentText}</pre>
                      )) : <p className="text-sm text-steel">{l('هنوز اطلاعاتی استخراج نشده است.', 'No extracted records yet.')}</p>}
                    </div>
                  </td></tr>
                ) : null}
                </Fragment>
              ))}</tbody>
            </TableScroll>
          ) : documents.data ? <EmptyState title={l('هنوز کاتالوگی بارگذاری نشده است.', 'No catalog source has been uploaded yet.')} icon={<BookOpen aria-hidden />} />
            : documents.error ? <Alert tone="danger" title={errorText(t, documents.error)} />
            : <p className="text-sm text-steel">{t('common.loading')}</p>}
        </Section>
      </div>
    </>
  );
}

type CatalogTab = 'documents' | 'photos';

/**
 * مرکز دانش و کاتالوگ: جایی واحد برای هر مادهٔ خامی که قرار است بعداً به کاتالوگ تبدیل شود — چه
 * فایل مرجع (اکسل/CSV/PDF) باشد، چه دسته‌عکسی که از قطعات یا از صفحات یک کاتالوگ کاغذی گرفته‌اید.
 * بارگذاری گروهی عکس قبلاً صفحهٔ جداگانه‌ای بود؛ حالا یک تب همین‌جاست تا عکس‌ها هم در همین مرکز
 * جمع شوند و بعداً با بقیهٔ منابع کاتالوگ ادغام شوند.
 */
export function KnowledgeCatalogPage() {
  const l = useL();
  const initialTab = useSearchParams().get('tab') === 'photos' ? 'photos' : 'documents';
  const [tab, setTab] = useState<CatalogTab>(initialTab);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={l('مرکز دانش و کاتالوگ', 'Knowledge & catalog center')}
        description={l(
          'هر چیزی که قرار است منبع کاتالوگ شود را اینجا جمع کنید: فایل مرجع (اکسل، CSV، PDF) یا عکس‌های گروهی قطعات. استخراج اولیهٔ CSV/Excel با تأیید انسانی فعال است؛ استخراج متن PDF، OCR روی عکس‌ها و embedding هنوز فعال نیست — فعلاً فقط بایگانی و بررسی دستی.',
          'Collect everything that will become a catalog source here: reference files (Excel, CSV, PDF) or bulk part photos. CSV/Excel candidate extraction is available for human review; PDF text extraction, OCR on photos and embeddings are not enabled yet — for now this is archiving and manual review only.',
        )}
      />
      <Tabs
        id="catalog-tabs"
        label={l('مرکز دانش و کاتالوگ', 'Knowledge & catalog center')}
        active={tab}
        onChange={setTab}
        items={[
          { key: 'documents', label: l('اسناد و فایل‌های مرجع', 'Reference documents') },
          { key: 'photos', label: l('بارگذاری گروهی عکس', 'Bulk photo upload') },
        ]}
      />
      <div id="catalog-tabs-panel" role="tabpanel" aria-labelledby={`catalog-tabs-${tab}`} className="flex flex-col gap-6">
        {tab === 'documents' ? <CatalogDocuments /> : <Suspense><BulkPhotoUpload /></Suspense>}
      </div>
    </div>
  );
}
