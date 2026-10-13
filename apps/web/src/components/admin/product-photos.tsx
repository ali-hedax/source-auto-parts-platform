'use client';

import type { ProductMediaView } from '@hedax/contracts';
import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { formatBytes } from '@/components/ui/format';
import { Alert, Badge } from '@/components/ui/misc';
import { api, uploadWithProgress } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';
import { useApi } from '@/lib/use-api';
import { useL } from './shell';

/** What the server accepts for a product photo (it checks again: real content, security scan, re-encoding). */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
export const PHOTO_MAX_BYTES = 20 * 1024 * 1024;

interface QueueItem {
  key: string;
  name: string;
  size: number;
  preview: string | null;
  status: 'waiting' | 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
  file: File;
}

/**
 * Photos of one product, linked by its id: add several (choose or drag & drop),
 * see each upload's progress, choose the main photo, change the order and delete
 * with a confirmation. A failed upload never changes the product's data.
 */
export function ProductPhotoManager({ productId, productName, onChange }: { productId: string; productName: string; onChange?: () => void }) {
  const t = useTranslations();
  const l = useL();
  const locale = useLocale();
  const inputId = useId();
  const media = useApi<ProductMediaView[]>(`/admin/products/${productId}/media`);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const running = useRef(false);
  const queueRef = useRef<QueueItem[]>([]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  // Object URLs of previews are released when the component goes away.
  useEffect(() => () => queueRef.current.forEach((q) => q.preview && URL.revokeObjectURL(q.preview)), []);

  const reloadMedia = media.reload;

  const addFiles = (files: FileList | File[]) => {
    setError(null);
    setNotice(null);
    const items: QueueItem[] = [...files].map((file) => {
      const okType = PHOTO_TYPES.includes(file.type) || PHOTO_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
      const tooBig = file.size > PHOTO_MAX_BYTES;
      return {
        key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`, name: file.name, size: file.size, file,
        preview: okType && !tooBig ? URL.createObjectURL(file) : null, progress: 0,
        status: okType && !tooBig ? 'waiting' : 'error',
        ...(okType ? (tooBig ? { error: l('بزرگ‌تر از ۲۰ مگابایت است.', 'Larger than 20 MB.') } : {}) : { error: l('فقط JPG، PNG یا WebP.', 'JPG, PNG or WebP only.') }),
      };
    });
    setQueue((list) => [...list, ...items]);
  };

  // Uploads one file at a time so each shows its own progress; the server checks every file.
  useEffect(() => {
    if (running.current) return;
    const next = queue.find((q) => q.status === 'waiting');
    if (!next) return;
    running.current = true;
    const patch = (p: Partial<QueueItem>) => setQueue((list) => list.map((q) => (q.key === next.key ? { ...q, ...p } : q)));
    patch({ status: 'uploading', progress: 0 });
    const form = new FormData();
    form.append('file', next.file);
    uploadWithProgress<{ id: string }>(`/admin/products/${productId}/media`, form, (ratio) => patch({ progress: ratio })).promise
      .then(async () => {
        patch({ status: 'done', progress: 1 });
        await reloadMedia();
        onChange?.();
      })
      .catch((e: unknown) => patch({ status: 'error', error: errorText(t, e) }))
      .finally(() => {
        running.current = false;
        setQueue((list) => [...list]);
      });
  }, [queue, productId, reloadMedia, onChange, t]);

  const act = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await fn();
      await media.reload();
      onChange?.();
      setNotice(done);
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(null);
    }
  };
  const photos = media.data ?? [];
  const move = (index: number, delta: -1 | 1) => {
    const ids = photos.map((p) => p.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved as string);
    return act(`move-${index}`, () => api(`/admin/products/${productId}/media/order`, { method: 'PUT', body: { ids } }), l('ترتیب عکس‌ها ذخیره شد.', 'Photo order saved.'));
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };
  const uploading = queue.some((q) => q.status === 'waiting' || q.status === 'uploading');
  const failed = queue.filter((q) => q.status === 'error');

  return (
    <div className="flex flex-col gap-5">
      <label
        htmlFor={inputId}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed px-4 py-7 text-center transition-colors ${dragging ? 'border-action bg-action/5' : 'border-line-strong bg-surface hover:border-ink'} has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-tech`}
      >
        <ImagePlus aria-hidden className="size-7 text-action" />
        <span className="font-semibold">{l('انتخاب عکس یا کشیدن و رها کردن در اینجا', 'Choose photos or drag and drop them here')}</span>
        <span className="text-sm text-steel">{l('چند عکس با هم مجاز است. JPG، PNG یا WebP، هر فایل حداکثر ۲۰ مگابایت. عکس روی سرور بررسی امنیتی و به WebP تبدیل می‌شود و اطلاعات EXIF آن حذف می‌شود.', 'Several at once. JPG, PNG or WebP, up to 20 MB each. Each photo is security-checked on the server, converted to WebP and stripped of EXIF data.')}</span>
        <input
          id={inputId}
          type="file"
          multiple
          accept={[...PHOTO_TYPES, ...PHOTO_EXTENSIONS].join(',')}
          className="sr-only"
          data-testid="photo-input"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </label>

      {queue.length ? (
        <ul className="flex flex-col gap-2" aria-label={l('بارگذاری‌ها', 'Uploads')}>
          {queue.map((q) => (
            <li key={q.key} className="flex items-center gap-3 rounded-[var(--radius-control)] border border-line-soft bg-white p-2 text-sm">
              {q.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={q.preview} alt="" className="size-12 shrink-0 rounded-[var(--radius-control)] bg-surface object-contain" />
              ) : <span aria-hidden className="media-placeholder size-12 shrink-0 rounded-[var(--radius-control)]" />}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium" dir="auto">{q.name} <span className="text-xs font-normal text-steel">({formatBytes(q.size, locale)})</span></p>
                {q.status === 'uploading' || q.status === 'waiting' ? (
                  <progress className="mt-1 h-1.5 w-full" max={1} value={q.status === 'waiting' ? 0 : q.progress} aria-label={l(`پیشرفت بارگذاری ${q.name}`, `Upload progress of ${q.name}`)} />
                ) : q.status === 'done' ? (
                  <p className="text-xs text-success">{l('ذخیره شد', 'Saved')}</p>
                ) : (
                  <p role="alert" className="text-xs text-danger">{q.error}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {!uploading && failed.length ? (
        <p className="text-sm text-steel">{l('عکس‌های ناموفق ذخیره نشدند؛ اطلاعات قطعه تغییری نکرد. فایل درست را دوباره انتخاب کنید.', 'Failed photos were not saved; the part’s data did not change. Choose a valid file again.')}</p>
      ) : null}
      {!uploading && queue.length ? (
        <div>
          <Button size="sm" variant="ghost" onClick={() => {
            queue.forEach((q) => q.preview && URL.revokeObjectURL(q.preview));
            setQueue([]);
          }}>{l('پاک‌کردن فهرست بارگذاری‌ها', 'Clear the upload list')}</Button>
        </div>
      ) : null}

      {error ? <Alert tone="danger" title={error} /> : null}
      <p role="status" className="sr-only">{notice}</p>

      <div>
        <h3 className="mb-3 font-bold">{l('عکس‌های ذخیره‌شده', 'Saved photos')} {photos.length ? <span className="font-normal text-steel">({new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-US').format(photos.length)})</span> : null}</h3>
        {media.loading && !media.data ? <p className="text-sm text-steel">{t('common.loading')}</p> : null}
        {media.data && !photos.length ? <p className="text-sm text-steel">{l('هنوز عکسی برای این قطعه ثبت نشده است.', 'No photos for this part yet.')}</p> : null}
        {photos.length ? (
          <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {photos.map((p, i) => (
              <li key={p.id} className={`flex flex-col rounded-[var(--radius-card)] border bg-white p-2 ${p.isPrimary ? 'border-action' : 'border-line-soft'}`}>
                <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-control)] bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/media/${p.storageKey}`} alt={p.altFa || productName} width={p.width} height={p.height} className="h-full w-full object-contain" />
                  <span className="absolute start-2 top-2 rounded bg-carbon/80 px-1.5 text-xs font-semibold text-white">{new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-US').format(i + 1)}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {p.isPrimary ? (
                    <Badge tone="info">{l('عکس اصلی', 'Main photo')}</Badge>
                  ) : (
                    <Button size="sm" variant="secondary" loading={busy === `primary-${p.id}`} onClick={() => void act(`primary-${p.id}`, () => api(`/admin/products/${productId}/media/${p.id}`, { method: 'PATCH', body: { isPrimary: true } }), l('عکس اصلی تغییر کرد.', 'Main photo changed.'))}>
                      {l('انتخاب به‌عنوان اصلی', 'Make main photo')}
                    </Button>
                  )}
                  <span className="ms-auto flex gap-1">
                    <Button size="sm" variant="ghost" icon={<ArrowUp aria-hidden className="size-4" />} disabled={i === 0 || !!busy} onClick={() => void move(i, -1)} aria-label={l(`جابه‌جایی عکس ${i + 1} به جلو`, `Move photo ${i + 1} earlier`)}>
                      <span className="sr-only">{l('جلوتر', 'Earlier')}</span>
                    </Button>
                    <Button size="sm" variant="ghost" icon={<ArrowDown aria-hidden className="size-4" />} disabled={i === photos.length - 1 || !!busy} onClick={() => void move(i, 1)} aria-label={l(`جابه‌جایی عکس ${i + 1} به عقب`, `Move photo ${i + 1} later`)}>
                      <span className="sr-only">{l('عقب‌تر', 'Later')}</span>
                    </Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 aria-hidden className="size-4 text-danger" />} disabled={!!busy} onClick={() => setConfirmDelete(p.id)} aria-label={l(`حذف عکس ${i + 1}`, `Delete photo ${i + 1}`)}>
                      <span className="sr-only">{l('حذف', 'Delete')}</span>
                    </Button>
                  </span>
                </div>
                {confirmDelete === p.id ? (
                  <div role="alertdialog" aria-label={l('تأیید حذف عکس', 'Confirm photo deletion')} className="mt-2 rounded-[var(--radius-control)] border border-danger/40 bg-danger/5 p-2 text-sm">
                    <p className="mb-2">{p.isPrimary && photos.length > 1 ? l('این عکس اصلی است؛ پس از حذف، عکس بعدی اصلی می‌شود. حذف شود؟', 'This is the main photo; the next photo becomes the main one. Delete it?') : l('این عکس حذف شود؟ این کار بازگشت ندارد.', 'Delete this photo? This cannot be undone.')}</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="danger" loading={busy === `delete-${p.id}`} onClick={() => void act(`delete-${p.id}`, () => api(`/admin/products/${productId}/media/${p.id}`, { method: 'DELETE' }), l('عکس حذف شد.', 'Photo deleted.')).then(() => setConfirmDelete(null))}>
                        {l('حذف عکس', 'Delete photo')}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(null)}>{t('common.cancel')}</Button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}
