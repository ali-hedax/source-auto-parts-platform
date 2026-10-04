'use client';

import type { AttachmentView } from '@hedax/contracts';
import { CheckCircle2, FileText, Loader2, Paperclip, RotateCcw, ShieldAlert, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { api, uploadWithProgress } from '@/lib/api/client';
import { formatBytes, useListSeparator } from '@/components/ui/format';

const MAX_FILES = 10;
const MAX_FILE = 20 * 1024 * 1024;
const MAX_TOTAL = 50 * 1024 * 1024;
const ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.csv,.doc,.xls';

interface Item {
  key: string;
  file: File;
  progress: number;
  state: 'uploading' | 'uploaded' | 'error';
  attachment: AttachmentView | null;
  error: string | null;
}

/**
 * Keyboard-first file picker (a real button; drag-and-drop is only an extra),
 * limits shown before choosing, per-file progress, scan status and retry.
 * Accepted files stay "scanning" until the server marks them ready.
 */
export function FileUploader({
  purpose,
  onChange,
  id = 'files',
  label,
  disabled,
}: {
  purpose: 'MESSAGE' | 'SOURCING_REQUEST' | 'RETURN_REQUEST' | 'BUSINESS_VERIFICATION' | 'IMPORT';
  onChange: (attachmentIds: string[], busy: boolean) => void;
  id?: string;
  label?: string;
  disabled?: boolean;
}) {
  const t = useTranslations('files');
  const locale = useLocale();
  const sep = useListSeparator();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const ids = items.filter((i) => i.attachment && i.attachment.status !== 'REJECTED').map((i) => i.attachment!.id);
    onChange(ids, items.some((i) => i.state === 'uploading'));
  }, [items, onChange]);

  // Poll files still in the security check.
  useEffect(() => {
    const scanning = items.filter((i) => i.attachment?.status === 'SCANNING');
    if (!scanning.length) return;
    const timer = setTimeout(async () => {
      const updates = await Promise.all(scanning.map((i) => api<AttachmentView>(`/attachments/${i.attachment!.id}`).catch(() => null)));
      setItems((prev) => prev.map((p) => updates.find((u) => u?.id === p.attachment?.id) ? { ...p, attachment: updates.find((u) => u?.id === p.attachment?.id)! } : p));
    }, 2500);
    return () => clearTimeout(timer);
  }, [items]);

  const upload = (item: Item) => {
    const form = new FormData();
    form.append('purpose', purpose);
    form.append('files', item.file);
    const { promise } = uploadWithProgress<AttachmentView[]>('/attachments', form, (ratio) =>
      setItems((prev) => prev.map((p) => (p.key === item.key ? { ...p, progress: ratio } : p))),
    );
    promise
      .then((res) => setItems((prev) => prev.map((p) => (p.key === item.key ? { ...p, state: 'uploaded', progress: 1, attachment: res[0] ?? null } : p))))
      .catch(() => setItems((prev) => prev.map((p) => (p.key === item.key ? { ...p, state: 'error', error: t('rejected_default') } : p))));
  };

  const add = (list: FileList | null) => {
    if (!list) return;
    setMessage(null);
    const files = [...list];
    if (items.length + files.length > MAX_FILES) {
      setMessage(t('tooMany'));
      return;
    }
    const total = items.reduce((s, i) => s + i.file.size, 0) + files.reduce((s, f) => s + f.size, 0);
    if (total > MAX_TOTAL || files.some((f) => f.size > MAX_FILE)) {
      setMessage(t('rejected_FILE_TOO_LARGE'));
      return;
    }
    const fresh = files.map((file) => ({ key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`, file, progress: 0, state: 'uploading' as const, attachment: null, error: null }));
    setItems((prev) => [...prev, ...fresh]);
    fresh.forEach(upload);
    if (input.current) input.current.value = '';
  };

  const statusText = (i: Item) => {
    if (i.state === 'uploading') return `${t('uploading')} ${Math.round(i.progress * 100)}%`;
    if (i.state === 'error') return i.error;
    const a = i.attachment;
    if (!a) return '';
    if (a.status === 'REJECTED') return t.has(`rejected_${a.rejectReason}`) ? t(`rejected_${a.rejectReason}` as never) : t('rejected_default');
    return t(a.status);
  };

  return (
    <div className="flex flex-col gap-2">
      {label ? <span id={`${id}-label`} className="text-sm font-semibold">{label}</span> : null}
      <p id={`${id}-limits`} className="text-sm text-steel">
        {t('limits', { files: 10, perFile: formatBytes(MAX_FILE, locale), total: formatBytes(MAX_TOTAL, locale) })} {t('formats')}
      </p>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files); }}
        className={`flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border-2 border-dashed p-4 ${dragging ? 'border-action bg-action-soft' : 'border-line'}`}
      >
        <input ref={input} id={id} type="file" multiple accept={ACCEPT} className="sr-only" aria-describedby={`${id}-limits`} disabled={disabled} onChange={(e) => add(e.target.files)} />
        <label htmlFor={id} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-action px-4 font-semibold text-action hover:bg-action-soft ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
          <Paperclip aria-hidden className="size-4" />
          {t('choose')}
        </label>
        <span className="text-sm text-steel">{t('dropHint')}</span>
      </div>
      {message ? <p role="alert" className="text-sm font-medium text-danger">{message}</p> : null}
      {items.length ? (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {items.map((i) => {
            const rejected = i.state === 'error' || i.attachment?.status === 'REJECTED';
            const ready = i.attachment?.status === 'READY';
            return (
              <li key={i.key} className="flex items-center gap-3 rounded-[var(--radius-control)] border border-line-soft bg-surface px-3 py-2">
                {rejected ? <ShieldAlert aria-hidden className="size-5 text-danger" /> : ready ? <CheckCircle2 aria-hidden className="size-5 text-success" /> : i.state === 'uploading' || i.attachment?.status === 'SCANNING' ? <Loader2 aria-hidden className="size-5 animate-spin text-steel" /> : <FileText aria-hidden className="size-5 text-steel" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium"><bdi>{i.file.name}</bdi></p>
                  <p className={`text-xs ${rejected ? 'text-danger' : 'text-steel'}`}>{statusText(i)}{sep}{formatBytes(i.file.size, locale)}</p>
                  {i.state === 'uploading' ? (
                    <progress className="mt-1 h-1.5 w-full" max={1} value={i.progress} aria-label={`${i.file.name} ${Math.round(i.progress * 100)}%`} />
                  ) : null}
                </div>
                {i.state === 'error' ? (
                  <button type="button" onClick={() => { setItems((prev) => prev.map((p) => (p.key === i.key ? { ...p, state: 'uploading', error: null, progress: 0 } : p))); upload(i); }}
                    className="grid size-11 cursor-pointer place-items-center rounded hover:bg-silver" aria-label={t('retry')}>
                    <RotateCcw aria-hidden className="size-4" />
                  </button>
                ) : null}
                <button type="button" onClick={() => setItems((prev) => prev.filter((p) => p.key !== i.key))} className="grid size-11 cursor-pointer place-items-center rounded hover:bg-silver" aria-label={t('remove', { name: i.file.name })}>
                  <X aria-hidden className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
