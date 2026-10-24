'use client';
import { useEffect, useRef, useState } from 'react';
import type { BuilderMedia } from '@hedax/contracts';
import { BUILDER_VIDEO_MAX_BYTES } from '@hedax/contracts/constants';
import { api, uploadWithProgress } from '@/lib/api/client';
import { isApiError } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { LocalizedField } from '@/components/admin/content/kit';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/webm'];
const fa = (n: number) => n.toLocaleString('fa-IR');
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} مگابایت`;
const seconds = (ms: number | null) => (ms ? `${(ms / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} ثانیه` : '');
const VIDEO_REASONS: Record<string, string> = {
  CONTENT_MISMATCH: 'محتوای فایل با MP4/WebM واقعی مطابقت ندارد.', NO_VIDEO_TRACK: 'فایل تصویر ویدیویی ندارد.', UNREADABLE_CONTAINER: 'ساختار فایل خراب یا ناقص است.',
  DURATION_OUT_OF_RANGE: 'مدت ویدیو باید حداکثر ۲ دقیقه باشد.', DIMENSIONS_OUT_OF_RANGE: 'ابعاد ویدیو حداکثر 3840×2160 است.', FILE_TOO_LARGE: 'حجم بیش از ۵۰ مگابایت است.', EXTENSION_NOT_ALLOWED: 'فقط MP4 یا WebM.',
};
const LIMIT_MESSAGE = 'نوع یا حجم فایل مجاز نیست: تصویر JPG/PNG/WebP تا ۵ مگابایت، ویدیو MP4/WebM تا ۵۰ مگابایت.';

/**
 * Site media: images (re-encoded WebP/PNG) and hero videos (MP4/WebM, inspected and scanned). Files are archived,
 * never deleted, and a file used by a page or a saved revision cannot be archived. A hero film is public only with
 * files the owner or a publisher has cleared (watermark-free, rights confirmed).
 */
export function MediaLibrary({ onSelect, kind, canPublish = false }: { onSelect?: (media: BuilderMedia) => void; kind?: 'image' | 'video'; canPublish?: boolean }) {
  const [rows, setRows] = useState<BuilderMedia[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>(kind ?? 'all');
  const [selected, setSelected] = useState<BuilderMedia | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [attest, setAttest] = useState(false);
  const abort = useRef<(() => void) | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const reload = async () => setRows(await api<BuilderMedia[]>(`/admin/content/media?q=${encodeURIComponent(query)}`));
  useEffect(() => { let active = true; const timer = setTimeout(() => { void api<BuilderMedia[]>(`/admin/content/media?q=${encodeURIComponent(query)}`).then(r => { if (active) setRows(r); }).catch(() => { if (active) setStatus('دریافت کتابخانه ناموفق بود.'); }); }, 250); return () => { active = false; clearTimeout(timer); }; }, [query]);
  useEffect(() => { setAttest(false); }, [selected?.id]);
  const upload = async (files: FileList | File[]) => {
    setBusy(true);
    let count = 0;
    try {
      for (const file of Array.from(files)) {
        const video = VIDEO_TYPES.includes(file.type) || /\.(mp4|webm)$/i.test(file.name);
        if (video ? file.size > BUILDER_VIDEO_MAX_BYTES : !IMAGE_TYPES.includes(file.type) || file.size > 5 * 1024 * 1024) { setStatus(LIMIT_MESSAGE); continue; }
        setStatus(video ? `در حال ارسال ویدیو «${file.name}»…` : 'در حال اسکن و بهینه‌سازی تصاویر…');
        const form = new FormData(); form.append('file', file);
        const task = uploadWithProgress<BuilderMedia>(video ? '/admin/content/media/video' : '/admin/content/media', form, ratio => setProgress(ratio));
        abort.current = task.abort; setProgress(0);
        const created = await task.promise; count++;
        if (video) setSelected(created);
        setStatus(video ? 'ویدیو بررسی، اسکن و ذخیره شد. برای انتشار عمومی، «تأیید انتشار» لازم است.' : `${fa(count)} تصویر اضافه شد.`);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') setStatus('ارسال لغو شد.');
      else {
        const reason = isApiError(e) ? String(e.details?.reason ?? '') : '';
        setStatus(`فایل پذیرفته نشد. ${VIDEO_REASONS[reason] ?? (isApiError(e) && e.code === 'FILE_REJECTED' ? 'اسکن امنیتی آن را رد کرد.' : 'نوع، حجم، اتصال یا نتیجهٔ اسکن را بررسی کنید.')}`);
      }
    } finally { setBusy(false); setProgress(null); abort.current = null; await reload().catch(() => undefined); }
  };
  const crop = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      // Only existing same-origin scanned assets can be cropped. The result is scanned again.
      const url = new URL(selected.url, window.location.origin);
      if (url.origin !== window.location.origin) throw new Error();
      const source = new Image(); source.src = url.href; await source.decode();
      const side = Math.min(source.naturalWidth, source.naturalHeight);
      const canvas = document.createElement('canvas'); canvas.width = Math.min(side, 1200); canvas.height = canvas.width;
      canvas.getContext('2d')!.drawImage(source, (source.naturalWidth - side) / 2, (source.naturalHeight - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error()), 'image/webp', .85));
      await upload([new File([blob], `crop-${selected.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp' })]);
    } catch { setStatus('ساخت نسخهٔ برش‌خورده ناموفق بود. تصویر اصلی حفظ شده است.'); }
    finally { setBusy(false); }
  };
  const clearance = async (cleared: boolean) => {
    if (!selected) return;
    setBusy(true);
    try {
      const updated = await api<BuilderMedia>(`/admin/content/media/${selected.id}/clearance`, { method: 'POST', body: { cleared } });
      setSelected({ ...selected, ...updated }); setStatus(cleared ? 'تأیید انتشار ثبت شد (در گزارش فعالیت).' : 'تأیید انتشار لغو شد.'); await reload();
    } catch (e) { setStatus(isApiError(e) && e.code === 'MEDIA_IN_USE' ? 'این فایل در صفحهٔ منتشرشده استفاده می‌شود؛ ابتدا آن را جایگزین و منتشر کنید.' : 'ثبت ناموفق بود؛ فقط مالک یا ناشر مجاز است.'); }
    finally { setBusy(false); }
  };
  const visible = rows.filter(r => filter === 'all' || r.kind === filter);
  const isVideo = selected?.kind === 'video';
  return <section className="rounded-2xl border bg-white p-5" aria-label="کتابخانه رسانه">
    <h2 className="mb-4 text-xl font-bold">تصاویر و ویدیوها</h2>
    {onSelect ? <p className="mb-3 rounded-lg bg-blue-50 p-3 text-sm">یک {kind === 'video' ? 'ویدیو' : 'تصویر'} را انتخاب کنید و «انتخاب» را بزنید تا در بخش در حال ویرایش قرار گیرد.</p> : null}
    <div className="rounded-xl border-2 border-dashed p-6 text-center" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy) void upload(e.dataTransfer.files); }}>
      <p>تصویر یا ویدیو را اینجا رها کنید. تصاویر اسکن و بهینه می‌شوند؛ ویدیو (MP4/WebM تا ۵۰ مگابایت و ۲ دقیقه) از نظر ساختار واقعی بررسی و اسکن می‌شود.</p>
      <input type="file" ref={fileInput} className="sr-only" aria-label="انتخاب فایل" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={e => { if (e.target.files) void upload(e.target.files); e.target.value = ''; }} />
      <Button className="mt-3" disabled={busy} onClick={() => fileInput.current?.click()}>آپلود تصویر یا ویدیو</Button>
      {progress !== null ? <div className="mx-auto mt-4 max-w-md"><progress className="w-full" max={1} value={progress} aria-label="پیشرفت ارسال" /><div className="flex items-center justify-between text-sm"><span>{fa(Math.round(progress * 100))}٪{progress >= 1 ? ' — در حال بررسی و اسکن' : ''}</span><Button size="sm" variant="ghost" onClick={() => abort.current?.()}>لغو</Button></div></div> : null}
    </div>
    <p role="status" className="my-3 text-sm">{status}</p>
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <label className="block min-w-60 flex-1">جستجو در نام یا دسته<input className="mt-2 block min-h-11 w-full rounded-lg border px-3" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <div className="flex gap-1" role="group" aria-label="نوع رسانه">{([['all', 'همه'], ['image', 'تصاویر'], ['video', 'ویدیوها']] as const).map(([key, label]) => <Button key={key} size="sm" variant={filter === key ? 'secondary' : 'ghost'} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</Button>)}</div>
    </div>
    <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">{visible.map(row => <button key={row.id} type="button" data-media-kind={row.kind} aria-pressed={selected?.id === row.id} className={`overflow-hidden rounded-xl border p-2 text-start ${selected?.id === row.id ? 'border-blue-600 ring-2 ring-blue-200' : ''}`} onClick={() => setSelected(row)}>
      {row.kind === 'video'
        ? <video src={row.url} muted playsInline preload="metadata" className="h-32 w-full bg-black object-contain" aria-hidden />
        // eslint-disable-next-line @next/next/no-img-element -- media library thumbnail
        : <img src={row.url} alt={row.alt.fa} loading="lazy" className="h-32 w-full object-contain" />}
      <span className="block truncate text-sm">{row.name}</span>
      <span className="block text-xs text-steel">{row.kind === 'video' ? `ویدیو · ${seconds(row.durationMs)} · ` : ''}{fa(row.width)} × {fa(row.height)} · {mb(row.bytes)}</span>
      <span className={`mt-1 inline-block rounded px-1.5 text-xs ${row.releaseCleared ? 'bg-green-50 text-green-800' : 'bg-slate-100 text-slate-700'}`}>{row.releaseCleared ? 'تأیید انتشار' : 'بدون تأیید انتشار'}</span>
    </button>)}</div>
    {!visible.length ? <p className="py-6 text-sm text-steel">فایلی با این مشخصات در کتابخانه نیست.</p> : null}
    {selected ? <div className="mt-5 space-y-3 rounded-xl border p-4" data-media-detail>
      {isVideo ? <video src={selected.url} controls muted playsInline preload="metadata" className="max-h-72 w-full rounded-lg bg-black" /> : null}
      <p className="text-sm text-steel" dir="ltr">{selected.mime || selected.kind} · {selected.width}×{selected.height}{isVideo ? ` · ${((selected.durationMs ?? 0) / 1000).toFixed(1)} s` : ''} · {(selected.bytes / 1024 / 1024).toFixed(2)} MB</p>
      <label className="block">نام فایل<input className="block min-h-11 w-full rounded-lg border px-3" value={selected.name} onChange={e => setSelected({ ...selected, name: e.target.value })} /></label>
      <label className="block">دسته<input className="block min-h-11 w-full rounded-lg border px-3" value={selected.category} onChange={e => setSelected({ ...selected, category: e.target.value })} /></label>
      <LocalizedField id="media-alt" path="alt" label={isVideo ? 'توضیح ویدیو' : 'متن جایگزین تصویر'} value={selected.alt} onChange={alt => setSelected({ ...selected, alt })} maxLength={160} errors={{}} />
      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        <strong>انتشار عمومی:</strong> {selected.releaseCleared ? `تأییدشده توسط ${selected.clearedBy ?? '—'}${selected.clearedAt ? ` در ${new Date(selected.clearedAt).toLocaleString('fa-IR')}` : ''}` : 'تأیید نشده — در بنر اصلی منتشرشده قابل استفاده نیست.'}
        {canPublish ? (selected.releaseCleared
          ? <div className="mt-2"><Button size="sm" variant="ghost" disabled={busy} onClick={() => void clearance(false)}>لغو تأیید انتشار</Button></div>
          : <div className="mt-2 space-y-2"><label className="flex items-start gap-2"><input type="checkbox" checked={attest} onChange={e => setAttest(e.target.checked)} /><span>تأیید می‌کنم این فایل بدون واترمارک است و حق انتشار عمومی آن را داریم.</span></label><Button size="sm" disabled={busy || !attest} onClick={() => void clearance(true)}>ثبت تأیید انتشار</Button></div>)
          : <p className="mt-1 text-xs">ثبت تأیید انتشار فقط برای مالک یا ناشر است.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {onSelect && (!kind || selected.kind === kind) ? <Button onClick={() => onSelect(selected)}>انتخاب این {isVideo ? 'ویدیو' : 'تصویر'}</Button> : null}
        <Button variant="secondary" disabled={busy} onClick={() => void api(`/admin/content/media/${selected.id}`, { method: 'PUT', body: { name: selected.name, alt: selected.alt, category: selected.category } }).then(() => { setStatus('مشخصات ذخیره شد.'); return reload(); }).catch(() => setStatus('ذخیره ناموفق بود.'))}>ذخیره مشخصات</Button>
        {!isVideo ? <Button variant="secondary" disabled={busy} onClick={() => void crop()}>ساخت نسخه مربعی تا ۱۲۰۰ پیکسل</Button> : null}
        <Button variant="ghost" disabled={busy} onClick={() => void api(`/admin/content/media/${selected.id}`, { method: 'DELETE' }).then(() => { setSelected(null); setStatus('فایل بایگانی شد؛ فایل اصلی برای بازگردانی نسخه‌ها حفظ شد.'); return reload(); }).catch(() => setStatus('این فایل در صفحه، پیش‌نویس یا تاریخچه استفاده شده است و قابل حذف نیست.'))}>بایگانی (حذف ایمن)</Button>
      </div>
    </div> : null}
  </section>;
}
