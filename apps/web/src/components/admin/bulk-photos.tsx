'use client';

import type { ProductCodeLookupView, ProductCodeMatch } from '@hedax/contracts';
import { MAX_PHOTO_CODES_PER_LOOKUP, photoCodeReadings } from '@hedax/domain';
import { FolderOpen, ImagePlus, Play, Square, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox, Select } from '@/components/ui/field';
import { formatBytes } from '@/components/ui/format';
import { Alert, Badge, Code, Section, TableScroll, td, th } from '@/components/ui/misc';
import { Link } from '@/i18n/navigation';
import { api, uploadWithProgress } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';
import { PHOTO_EXTENSIONS, PHOTO_MAX_BYTES, PHOTO_TYPES } from './product-photos';
import { useL } from './shell';

/** Most photos one batch may hold; more can be added after this batch is uploaded and cleared. */
const MAX_FILES = 2000;

type Status = 'checking' | 'ready' | 'ambiguous' | 'notFound' | 'invalid' | 'uploading' | 'done' | 'error';

interface Item {
  key: string;
  file: File;
  name: string;
  /** Code read from the file name that matched (or the first reading when nothing matched). */
  code: string;
  position: number;
  status: Status;
  product?: ProductCodeMatch;
  choices?: ProductCodeMatch[];
  progress: number;
  error?: string;
}

/**
 * Bulk product photos: the person drops many photos (or a whole folder) whose file
 * names are the parts' technical numbers or SKUs ("0450102805-2.jpg"). Each file is
 * matched to its product, ambiguous codes are chosen by hand, and the photos are
 * uploaded one by one through the same checked endpoint as a single product's photos.
 */
export function BulkPhotoUpload() {
  const t = useTranslations();
  const l = useL();
  const locale = useLocale();
  const fileInputId = useId();
  const folderInputId = useId();
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [skipExisting, setSkipExisting] = useState(true);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ tone: 'danger' | 'warning' | 'success'; text: string } | null>(null);
  const stopRequested = useRef(false);
  const num = useMemo(() => {
    const f = new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-US');
    return (n: number) => f.format(n);
  }, [locale]);

  // Leaving the page mid-upload loses the rest of the batch: ask first.
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  const patch = (key: string, p: Partial<Item>) => setItems((list) => list.map((it) => (it.key === key ? { ...it, ...p } : it)));

  const lookup = async (batch: Item[]) => {
    const readingsByKey = new Map(batch.map((it) => [it.key, photoCodeReadings(it.name)]));
    const codes = [...new Set([...readingsByKey.values()].flat().map((r) => r.code))];
    const matches: ProductCodeLookupView['matches'] = {};
    try {
      for (let i = 0; i < codes.length; i += MAX_PHOTO_CODES_PER_LOOKUP) {
        const res = await api<ProductCodeLookupView>('/admin/products/code-lookup', { method: 'POST', body: { codes: codes.slice(i, i + MAX_PHOTO_CODES_PER_LOOKUP) } });
        Object.assign(matches, res.matches);
      }
    } catch (e) {
      setMessage({ tone: 'danger', text: errorText(t, e) });
      setItems((list) => list.map((it) => (readingsByKey.has(it.key) ? { ...it, status: 'error', error: l('شناسایی قطعه انجام نشد؛ دوباره فایل‌ها را اضافه کنید.', 'Could not look up the parts; add the files again.') } : it)));
      return;
    }
    setItems((list) => list.map((it) => {
      const readings = readingsByKey.get(it.key);
      if (!readings) return it;
      const hit = readings.find((r) => (matches[r.code] ?? []).length > 0);
      if (!hit) return { ...it, status: 'notFound' };
      const found = matches[hit.code] ?? [];
      if (found.length === 1) return { ...it, code: hit.code, position: hit.position, status: 'ready', product: found[0] as ProductCodeMatch };
      return { ...it, code: hit.code, position: hit.position, status: 'ambiguous', choices: found };
    }));
  };

  const addFiles = (files: FileList | File[]) => {
    setMessage(null);
    const seen = new Set(items.map((it) => `${it.name}|${it.file.size}`));
    const added: Item[] = [];
    let skipped = 0;
    for (const file of files) {
      const name = file.name;
      const isImage = PHOTO_TYPES.includes(file.type) || PHOTO_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
      if (!isImage && /^\./.test(name)) continue; // hidden files from folders (.DS_Store …)
      if (seen.has(`${name}|${file.size}`)) continue;
      if (items.length + added.length >= MAX_FILES) { skipped += 1; continue; }
      seen.add(`${name}|${file.size}`);
      const readings = photoCodeReadings(name);
      const base: Item = { key: `${name}-${file.size}-${Math.random().toString(36).slice(2)}`, file, name, code: readings[0]?.code ?? name, position: readings[0]?.position ?? 1, status: 'checking', progress: 0 };
      if (!isImage) added.push({ ...base, status: 'invalid', error: l('فقط JPG، PNG یا WebP.', 'JPG, PNG or WebP only.') });
      else if (file.size > PHOTO_MAX_BYTES) added.push({ ...base, status: 'invalid', error: l('بزرگ‌تر از ۲۰ مگابایت است.', 'Larger than 20 MB.') });
      else if (!readings.length) added.push({ ...base, status: 'invalid', error: l('نام فایل کد ندارد.', 'The file name has no code.') });
      else added.push(base);
    }
    if (skipped) setMessage({ tone: 'warning', text: l(`حداکثر ${num(MAX_FILES)} عکس در هر نوبت؛ ${num(skipped)} فایل اضافه نشد. پس از بارگذاری این نوبت، بقیه را اضافه کنید.`, `At most ${num(MAX_FILES)} photos per batch; ${num(skipped)} files were not added. Add the rest after this batch is uploaded.`) });
    if (!added.length) return;
    setItems((list) => [...list, ...added]);
    const toCheck = added.filter((it) => it.status === 'checking');
    if (toCheck.length) void lookup(toCheck);
  };

  const willSkip = (it: Item) => skipExisting && !!it.product && it.product.photoCount > 0;
  const uploadable = items.filter((it) => (it.status === 'ready' || it.status === 'error') && it.product && !willSkip(it));

  const start = async () => {
    setMessage(null);
    stopRequested.current = false;
    setRunning(true);
    // Per part, in position order: the first photo a part gets becomes its main photo.
    const queue = [...uploadable].sort((a, b) => (a.product!.id === b.product!.id ? a.position - b.position || a.name.localeCompare(b.name) : a.product!.sku.localeCompare(b.product!.sku)));
    let ok = 0;
    let failed = 0;
    for (const it of queue) {
      if (stopRequested.current) break;
      patch(it.key, { status: 'uploading', progress: 0, error: undefined });
      const form = new FormData();
      form.append('file', it.file);
      try {
        await uploadWithProgress<{ id: string }>(`/admin/products/${it.product!.id}/media`, form, (ratio) => patch(it.key, { progress: ratio })).promise;
        patch(it.key, { status: 'done', progress: 1 });
        ok += 1;
      } catch (e) {
        patch(it.key, { status: 'error', error: errorText(t, e) });
        failed += 1;
      }
    }
    setRunning(false);
    const stopped = stopRequested.current;
    setMessage(failed
      ? { tone: 'warning', text: l(`${num(ok)} عکس ذخیره شد و ${num(failed)} عکس ناموفق بود. «شروع بارگذاری» را دوباره بزنید تا فقط ناموفق‌ها دوباره فرستاده شوند.`, `${num(ok)} photos saved, ${num(failed)} failed. Press “Start upload” again to retry only the failed ones.`) }
      : { tone: 'success', text: stopped ? l(`متوقف شد؛ ${num(ok)} عکس ذخیره شد.`, `Stopped; ${num(ok)} photos saved.`) : l(`${num(ok)} عکس ذخیره شد.`, `${num(ok)} photos saved.`) });
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    if (!running && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const count = (s: Status) => items.filter((it) => it.status === s).length;
  const skippedCount = items.filter((it) => it.status === 'ready' && willSkip(it)).length;
  const checking = count('checking') > 0;
  const shown = problemsOnly ? items.filter((it) => ['ambiguous', 'notFound', 'invalid', 'error'].includes(it.status)) : items;

  const statusBadge = (it: Item) => {
    switch (it.status) {
      case 'checking': return <Badge>{l('در حال شناسایی…', 'Looking up…')}</Badge>;
      case 'ready': return willSkip(it) ? <Badge>{l('رد می‌شود؛ قطعه عکس دارد', 'Skipped: part has photos')}</Badge> : <Badge tone="info">{l('آماده', 'Ready')}</Badge>;
      case 'ambiguous': return <Badge tone="warning">{l('چند قطعه با این کد', 'Several parts share this code')}</Badge>;
      case 'notFound': return <Badge tone="danger">{l('قطعه‌ای با این کد نیست', 'No part with this code')}</Badge>;
      case 'invalid': return <Badge tone="danger">{it.error}</Badge>;
      case 'uploading': return <progress className="h-2 w-24" max={1} value={it.progress} aria-label={l('پیشرفت', 'Progress')} />;
      case 'done': return <Badge tone="success">{l('ذخیره شد', 'Saved')}</Badge>;
      case 'error': return <span className="flex flex-col gap-1"><Badge tone="danger">{l('ناموفق', 'Failed')}</Badge>{it.error ? <span className="text-xs text-danger">{it.error}</span> : null}</span>;
    }
  };

  return (
    <>
      <p className="max-w-3xl text-sm leading-6 text-steel">
        {l('عکس‌ها را یکجا بکشید و رها کنید یا یک پوشه انتخاب کنید. نام هر فایل باید کد کالا، شمارهٔ فنی یا یکی از شماره‌های معادل قطعه باشد (فاصله و خط تیره مهم نیست)؛ برای چند عکس از یک قطعه شماره بگذارید: 0450102805-1.jpg، 0450102805-2.jpg. عکس شمارهٔ ۱ عکس اصلی می‌شود.', 'Drop many photos at once or choose a folder. Each file name must be the part’s SKU, technical number or one of its equivalent numbers (spaces and dashes do not matter); number several photos of one part: 0450102805-1.jpg, 0450102805-2.jpg. Photo 1 becomes the main photo.')}
      </p>
      <Section title={l('انتخاب عکس‌ها', 'Choose photos')} id="bulk-photos-pick">
        <label
          htmlFor={fileInputId}
          onDragOver={(e) => { e.preventDefault(); if (!running) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed p-8 text-center ${dragging ? 'border-action bg-action/5' : 'border-line'} ${running ? 'pointer-events-none opacity-60' : ''}`}
        >
          <ImagePlus aria-hidden className="size-8 text-steel" />
          <span className="font-semibold">{l('انتخاب عکس‌ها یا کشیدن و رها کردن در اینجا', 'Choose photos or drag and drop them here')}</span>
          <span className="text-sm text-steel">{l(`JPG، PNG یا WebP، هر فایل حداکثر ۲۰ مگابایت، تا ${num(MAX_FILES)} عکس در هر نوبت. هر عکس روی سرور بررسی امنیتی و به WebP تبدیل می‌شود.`, `JPG, PNG or WebP, up to 20 MB each, up to ${num(MAX_FILES)} photos per batch. Each photo is security-checked and converted to WebP on the server.`)}</span>
          <input id={fileInputId} type="file" className="sr-only" multiple disabled={running} accept={[...PHOTO_TYPES, ...PHOTO_EXTENSIONS].join(',')}
            onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label htmlFor={folderInputId} className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-line px-3 font-semibold ${running ? 'pointer-events-none opacity-60' : ''}`}>
            <FolderOpen aria-hidden className="size-4" />{l('انتخاب یک پوشه', 'Choose a folder')}
          </label>
          <input id={folderInputId} type="file" className="sr-only" multiple disabled={running}
            {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
            onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
          <Checkbox id="bulk-skip-existing" label={l('قطعه‌هایی که عکس دارند رد شوند', 'Skip parts that already have photos')} checked={skipExisting} disabled={running} onChange={(e) => setSkipExisting(e.target.checked)} />
        </div>
      </Section>

      {message ? <Alert tone={message.tone} className="mb-4" title={message.text} /> : null}

      {items.length ? (
        <Section title={l('عکس‌های این نوبت', 'Photos in this batch')} id="bulk-photos-list">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="info">{l(`آماده: ${num(uploadable.length)}`, `Ready: ${num(uploadable.length)}`)}</Badge>
            {count('done') ? <Badge tone="success">{l(`ذخیره‌شده: ${num(count('done'))}`, `Saved: ${num(count('done'))}`)}</Badge> : null}
            {count('ambiguous') ? <Badge tone="warning">{l(`نیازمند انتخاب: ${num(count('ambiguous'))}`, `Need a choice: ${num(count('ambiguous'))}`)}</Badge> : null}
            {count('notFound') ? <Badge tone="danger">{l(`بدون قطعه: ${num(count('notFound'))}`, `No part: ${num(count('notFound'))}`)}</Badge> : null}
            {count('invalid') ? <Badge tone="danger">{l(`فایل نامعتبر: ${num(count('invalid'))}`, `Invalid file: ${num(count('invalid'))}`)}</Badge> : null}
            {skippedCount ? <Badge>{l(`رد می‌شود: ${num(skippedCount)}`, `Skipped: ${num(skippedCount)}`)}</Badge> : null}
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {running ? (
              <Button variant="secondary" icon={<Square aria-hidden className="size-4" />} onClick={() => { stopRequested.current = true; }}>{l('توقف پس از عکس فعلی', 'Stop after the current photo')}</Button>
            ) : (
              <Button icon={<Play aria-hidden className="size-4" />} disabled={!uploadable.length || checking} onClick={() => void start()}>
                {l(`شروع بارگذاری (${num(uploadable.length)})`, `Start upload (${num(uploadable.length)})`)}
              </Button>
            )}
            <Button variant="secondary" icon={<Trash2 aria-hidden className="size-4" />} disabled={running} onClick={() => { setItems([]); setMessage(null); }}>{l('پاک‌کردن فهرست', 'Clear the list')}</Button>
            <Checkbox id="bulk-problems-only" label={l('فقط موارد دارای مشکل', 'Only problems')} checked={problemsOnly} onChange={(e) => setProblemsOnly(e.target.checked)} />
          </div>
          <TableScroll caption={l('عکس‌های این نوبت', 'Photos in this batch')}>
            <thead><tr><th className={th}>{l('فایل', 'File')}</th><th className={th}>{l('کد خوانده‌شده', 'Code read')}</th><th className={th}>{l('قطعه', 'Part')}</th><th className={th}>{l('وضعیت', 'Status')}</th></tr></thead>
            <tbody>
              {shown.map((it) => (
                <tr key={it.key}>
                  <td className={td}><span className="block break-all" dir="ltr">{it.name}</span><span className="text-xs text-steel">{formatBytes(it.file.size, locale)}</span></td>
                  <td className={td}><Code>{it.code}</Code>{it.position > 1 ? <span className="ms-2 text-xs text-steel">{l(`عکس ${num(it.position)}`, `photo ${num(it.position)}`)}</span> : null}</td>
                  <td className={td}>
                    {it.product ? (
                      <span className="flex flex-col">
                        <Link href={`/admin/products/${it.product.id}`} className="font-semibold text-action underline underline-offset-4" dir="auto">{it.product.nameFa}</Link>
                        <span className="text-xs text-steel">{l('کد کالا', 'SKU')}: <Code>{it.product.sku}</Code>{it.product.photoCount ? ` · ${l(`${num(it.product.photoCount)} عکس`, `${num(it.product.photoCount)} photos`)}` : ''}</span>
                      </span>
                    ) : it.status === 'ambiguous' && it.choices ? (
                      <Select aria-label={l('انتخاب قطعه', 'Choose the part')} defaultValue="" disabled={running}
                        onChange={(e) => { const p = it.choices?.find((c) => c.id === e.target.value); if (p) patch(it.key, { status: 'ready', product: p }); }}>
                        <option value="" disabled>{l('قطعه را انتخاب کنید…', 'Choose the part…')}</option>
                        {it.choices.map((c) => <option key={c.id} value={c.id}>{`${c.nameFa} (${c.sku})`}</option>)}
                      </Select>
                    ) : <span className="text-steel">—</span>}
                  </td>
                  <td className={td}>{statusBadge(it)}</td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        </Section>
      ) : null}
    </>
  );
}
