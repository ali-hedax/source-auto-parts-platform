'use client';
import { useEffect, useRef, useState } from 'react';
import type { BuilderMedia } from '@hedax/contracts';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { LocalizedField } from '@/components/admin/content/kit';

export function MediaLibrary({ onSelect }: { onSelect?: (media: BuilderMedia) => void }) {
  const [rows, setRows] = useState<BuilderMedia[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<BuilderMedia | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const reload = async () => setRows(await api<BuilderMedia[]>(`/admin/content/media?q=${encodeURIComponent(query)}`));
  useEffect(() => { let active = true; const timer = setTimeout(() => { void api<BuilderMedia[]>(`/admin/content/media?q=${encodeURIComponent(query)}`).then(r => { if (active) setRows(r); }).catch(() => { if (active) setStatus('دریافت کتابخانه ناموفق بود.'); }); }, 250); return () => { active = false; clearTimeout(timer); }; }, [query]);
  const upload = async (files: FileList | File[]) => {
    setBusy(true); setStatus('در حال اسکن و بهینه‌سازی تصاویر…');
    let count = 0;
    try {
      for (const file of Array.from(files)) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('نوع یا حجم فایل مجاز نیست؛ JPG، PNG یا WebP تا ۵ مگابایت.');
        const form = new FormData(); form.append('file', file);
        await api('/admin/content/media', { method: 'POST', body: form }); count++;
      }
      setStatus(`${count} تصویر اضافه شد.`);
    } catch { setStatus(`${count} تصویر اضافه شد؛ یکی از فایل‌ها پذیرفته نشد. نوع، حجم یا نتیجهٔ اسکن را بررسی کنید.`); }
    finally { setBusy(false); await reload(); }
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
  return <section className="rounded-2xl border bg-white p-5" aria-label="کتابخانه رسانه">
    <h2 className="mb-4 text-xl font-bold">تصاویر و رسانه‌ها</h2>
    <div className="rounded-xl border-2 border-dashed p-6 text-center" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy) void upload(e.dataTransfer.files); }}>
      <p>تصاویر را اینجا رها کنید؛ اسکن امنیتی و بهینه‌سازی خودکار انجام می‌شود.</p>
      <input type="file" ref={fileInput} className="sr-only" multiple accept="image/jpeg,image/png,image/webp" onChange={e => { if (e.target.files) void upload(e.target.files); }} />
      <Button className="mt-3" disabled={busy} onClick={() => fileInput.current?.click()}>آپلود تصاویر</Button>
    </div>
    <p role="status" className="my-3 text-sm">{status}</p>
    <label className="mb-4 block">جستجو در نام یا دسته<input className="mt-2 block min-h-11 w-full rounded-lg border px-3" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">{rows.map(row => <button key={row.id} type="button" className="overflow-hidden rounded-xl border p-2 text-start" onClick={() => setSelected(row)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- media library thumbnail */}
      <img src={row.url} alt={row.alt.fa} loading="lazy" className="h-32 w-full object-contain" /><span className="block truncate text-sm">{row.name}</span><span className="text-xs text-steel">{row.width} × {row.height}</span>
    </button>)}</div>
    {selected ? <div className="mt-5 space-y-3 rounded-xl border p-4">
      <label className="block">نام تصویر<input className="block min-h-11 w-full rounded-lg border px-3" value={selected.name} onChange={e => setSelected({ ...selected, name: e.target.value })} /></label>
      <label className="block">دسته<input className="block min-h-11 w-full rounded-lg border px-3" value={selected.category} onChange={e => setSelected({ ...selected, category: e.target.value })} /></label>
      <LocalizedField id="media-alt" path="alt" label="متن جایگزین تصویر" value={selected.alt} onChange={alt => setSelected({ ...selected, alt })} maxLength={160} errors={{}} />
      <div className="flex flex-wrap gap-2">
        {onSelect ? <Button onClick={() => onSelect(selected)}>انتخاب این تصویر</Button> : null}
        <Button variant="secondary" disabled={busy} onClick={() => void api(`/admin/content/media/${selected.id}`, { method: 'PUT', body: { name: selected.name, alt: selected.alt, category: selected.category } }).then(() => { setStatus('مشخصات ذخیره شد.'); return reload(); }).catch(() => setStatus('ذخیره ناموفق بود.'))}>ذخیره مشخصات</Button>
        <Button variant="secondary" disabled={busy} onClick={() => void crop()}>ساخت نسخه مربعی تا ۱۲۰۰ پیکسل</Button>
        <Button variant="ghost" disabled={busy} onClick={() => void api(`/admin/content/media/${selected.id}`, { method: 'DELETE' }).then(() => { setSelected(null); setStatus('تصویر بایگانی شد؛ فایل اصلی حفظ شد.'); return reload(); }).catch(() => setStatus('تصویر در صفحه یا تاریخچه استفاده شده است و قابل حذف نیست.'))}>بایگانی تصویر</Button>
      </div>
    </div> : null}
  </section>;
}
