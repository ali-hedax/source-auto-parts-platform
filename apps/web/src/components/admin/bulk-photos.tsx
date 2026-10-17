'use client';

import type { CatalogCodeLookupView, ProductCodeLookupView } from '@hedax/contracts';
import { MAX_PHOTO_CODES_PER_LOOKUP, photoCodeReadings } from '@hedax/domain';
import { FolderOpen, ImagePlus, Play, Square, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Select } from '@/components/ui/field';
import { formatBytes } from '@/components/ui/format';
import { Alert, Badge, Code, Section, TableScroll, td, th } from '@/components/ui/misc';
import { Link } from '@/i18n/navigation';
import { api, uploadWithProgress } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';
import { PHOTO_EXTENSIONS, PHOTO_MAX_BYTES, PHOTO_TYPES } from './product-photos';
import { useL } from './shell';

/** Most photos one batch may hold; more can be added after this batch is uploaded and cleared. */
const MAX_FILES = 2000;

/** Where the photos of this batch go: shop products, technical catalog parts, or both. */
type Destination = 'products' | 'catalog' | 'both';
type Kind = 'product' | 'catalog';

interface Target {
  kind: Kind;
  id: string;
  /** SKU of a product, technical number of a catalog part. */
  code: string;
  nameFa: string;
  photoCount: number;
}

type Status = 'checking' | 'looked' | 'invalid' | 'uploading' | 'done' | 'error';

interface Item {
  key: string;
  file: File;
  name: string;
  /** Code read from the file name that matched (or the first reading when nothing matched). */
  code: string;
  position: number;
  status: Status;
  /** Every product / catalog part the file name's code belongs to. */
  products: Target[];
  entries: Target[];
  /** Chosen by hand when a code belongs to several. */
  chosen: Partial<Record<Kind, Target>>;
  /** Destinations this photo was already saved to (a retry does not send it there again). */
  saved: Kind[];
  progress: number;
  error?: string;
}

const KINDS: Record<Destination, Kind[]> = { products: ['product'], catalog: ['catalog'], both: ['product', 'catalog'] };

/**
 * Bulk photos: the person drops many photos (or a whole folder) whose file names are the parts'
 * technical numbers or SKUs ("0450102805-2.jpg"). Each file is matched to its shop product and/or
 * its technical catalog part (same file-name rules for both), the preview shows where every photo
 * goes, ambiguous codes are chosen by hand, and the photos are uploaded one by one through the same
 * checked endpoints as single photos.
 */
export function BulkPhotoUpload() {
  const t = useTranslations();
  const l = useL();
  const locale = useLocale();
  const fileInputId = useId();
  const folderInputId = useId();
  const [items, setItems] = useState<Item[]>([]);
  const [destination, setDestination] = useState<Destination>('products');
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
    const products: ProductCodeLookupView['matches'] = {};
    const entries: CatalogCodeLookupView['matches'] = {};
    try {
      for (let i = 0; i < codes.length; i += MAX_PHOTO_CODES_PER_LOOKUP) {
        const body = { codes: codes.slice(i, i + MAX_PHOTO_CODES_PER_LOOKUP) };
        const [p, c] = await Promise.all([
          api<ProductCodeLookupView>('/admin/products/code-lookup', { method: 'POST', body }),
          api<CatalogCodeLookupView>('/admin/catalog-entries/code-lookup', { method: 'POST', body }),
        ]);
        Object.assign(products, p.matches);
        Object.assign(entries, c.matches);
      }
    } catch (e) {
      setMessage({ tone: 'danger', text: errorText(t, e) });
      setItems((list) => list.map((it) => (readingsByKey.has(it.key) ? { ...it, status: 'error', error: l('شناسایی قطعه انجام نشد؛ دوباره فایل‌ها را اضافه کنید.', 'Could not look up the parts; add the files again.') } : it)));
      return;
    }
    setItems((list) => list.map((it) => {
      const readings = readingsByKey.get(it.key);
      if (!readings) return it;
      // The first reading that matches anything wins (the whole name before "name minus -N").
      const hit = readings.find((r) => (products[r.code] ?? []).length > 0 || (entries[r.code] ?? []).length > 0) ?? readings[0]!;
      return {
        ...it, code: hit.code, position: hit.position, status: 'looked',
        products: (products[hit.code] ?? []).map((p) => ({ kind: 'product' as const, id: p.id, code: p.sku, nameFa: p.nameFa, photoCount: p.photoCount })),
        entries: (entries[hit.code] ?? []).map((e) => ({ kind: 'catalog' as const, id: e.id, code: e.partNumber, nameFa: e.nameFa, photoCount: e.photoCount })),
      };
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
      const base: Item = { key: `${name}-${file.size}-${Math.random().toString(36).slice(2)}`, file, name, code: readings[0]?.code ?? name, position: readings[0]?.position ?? 1, status: 'checking', products: [], entries: [], chosen: {}, saved: [], progress: 0 };
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

  /** Where one photo goes with the current destination: resolved targets, open choices, skipped ones. */
  const plan = (it: Item) => {
    const targets: Target[] = [];
    const skipped: Target[] = [];
    const ambiguous: Kind[] = [];
    for (const kind of KINDS[destination]) {
      const list = kind === 'product' ? it.products : it.entries;
      const target = it.chosen[kind] ?? (list.length === 1 ? list[0] : undefined);
      if (!target) {
        if (list.length > 1) ambiguous.push(kind);
        continue;
      }
      if (it.saved.includes(kind)) continue;
      if (skipExisting && target.photoCount > 0) skipped.push(target);
      else targets.push(target);
    }
    return { targets, skipped, ambiguous, found: targets.length + skipped.length + ambiguous.length > 0 || it.saved.length > 0 };
  };
  const uploadable = items.filter((it) => (it.status === 'looked' || it.status === 'error') && plan(it).targets.length > 0 && !plan(it).ambiguous.length);

  const start = async () => {
    setMessage(null);
    stopRequested.current = false;
    setRunning(true);
    // Per part, in position order: the first photo a part gets becomes its main photo.
    const tasks = uploadable.flatMap((it) => plan(it).targets.map((target) => ({ it, target })))
      .sort((a, b) => a.target.kind.localeCompare(b.target.kind) || a.target.code.localeCompare(b.target.code) || a.it.position - b.it.position || a.it.name.localeCompare(b.it.name));
    let ok = 0;
    let failed = 0;
    const savedNow = new Map<string, Kind[]>();
    for (const { it, target } of tasks) {
      if (stopRequested.current) break;
      patch(it.key, { status: 'uploading', progress: 0, error: undefined });
      const form = new FormData();
      form.append('file', it.file);
      const url = target.kind === 'product' ? `/admin/products/${target.id}/media` : `/admin/catalog-entries/${target.id}/images`;
      try {
        await uploadWithProgress<{ id: string }>(url, form, (ratio) => patch(it.key, { progress: ratio })).promise;
        const saved = [...(savedNow.get(it.key) ?? it.saved), target.kind];
        savedNow.set(it.key, saved);
        const left = KINDS[destination].some((k) => !saved.includes(k) && (k === 'product' ? it.products : it.entries).length > 0);
        patch(it.key, { status: left ? 'looked' : 'done', progress: 1, saved });
        ok += 1;
      } catch (e) {
        patch(it.key, { status: 'error', error: errorText(t, e), saved: savedNow.get(it.key) ?? it.saved });
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

  const state = (it: Item): 'ready' | 'skipped' | 'ambiguous' | 'notFound' | Exclude<Status, 'looked'> => {
    if (it.status !== 'looked') return it.status;
    const p = plan(it);
    if (p.ambiguous.length) return 'ambiguous';
    if (p.targets.length) return 'ready';
    if (p.skipped.length) return 'skipped';
    return p.found ? 'done' : 'notFound';
  };
  const count = (s: ReturnType<typeof state>) => items.filter((it) => state(it) === s).length;
  const checking = count('checking') > 0;
  const shown = problemsOnly ? items.filter((it) => ['ambiguous', 'notFound', 'invalid', 'error'].includes(state(it))) : items;
  const kindLabel = (k: Kind) => (k === 'product' ? l('محصول فروشگاه', 'Shop product') : l('قطعهٔ کاتالوگ', 'Catalog part'));

  const statusBadge = (it: Item) => {
    switch (state(it)) {
      case 'checking': return <Badge>{l('در حال شناسایی…', 'Looking up…')}</Badge>;
      case 'ready': return <Badge tone="info">{l('آماده', 'Ready')}</Badge>;
      case 'skipped': return <Badge>{l('رد می‌شود؛ قطعه عکس دارد', 'Skipped: part has photos')}</Badge>;
      case 'ambiguous': return <Badge tone="warning">{l('چند قطعه با این کد', 'Several parts share this code')}</Badge>;
      case 'notFound': return <Badge tone="danger">{destination === 'products' ? l('محصولی با این کد نیست', 'No product with this code') : destination === 'catalog' ? l('قطعهٔ کاتالوگی با این کد نیست', 'No catalog part with this code') : l('قطعه‌ای با این کد نیست', 'No part with this code')}</Badge>;
      case 'invalid': return <Badge tone="danger">{it.error}</Badge>;
      case 'uploading': return <progress className="h-2 w-24" max={1} value={it.progress} aria-label={l('پیشرفت', 'Progress')} />;
      case 'done': return <Badge tone="success">{l('ذخیره شد', 'Saved')}</Badge>;
      case 'error': return <span className="flex flex-col gap-1"><Badge tone="danger">{l('ناموفق', 'Failed')}</Badge>{it.error ? <span className="text-xs text-danger">{it.error}</span> : null}</span>;
    }
  };

  /** «مقصد»: each destination of the photo, or a choice when its code belongs to several parts. */
  const targets = (it: Item) => {
    if (it.status === 'checking' || it.status === 'invalid') return <span className="text-steel">—</span>;
    const rows = KINDS[destination].map((kind) => {
      const list = kind === 'product' ? it.products : it.entries;
      const target = it.chosen[kind] ?? (list.length === 1 ? list[0] : undefined);
      if (target) {
        const href = kind === 'product' ? `/admin/products/${target.id}` : `/admin/knowledge-catalog?tab=entries&entry=${target.id}`;
        return (
          <span key={kind} className="flex flex-col">
            <span className="text-xs text-steel">{kindLabel(kind)}{it.saved.includes(kind) ? ` · ${l('ذخیره شد', 'saved')}` : ''}</span>
            <Link href={href} className="font-semibold text-action underline underline-offset-4" dir="auto">{target.nameFa}</Link>
            <span className="text-xs text-steel"><Code>{target.code}</Code>{target.photoCount ? ` · ${l(`${num(target.photoCount)} عکس`, `${num(target.photoCount)} photos`)}` : ''}</span>
          </span>
        );
      }
      if (list.length > 1) {
        return (
          <Select key={kind} aria-label={kind === 'product' ? l('انتخاب محصول', 'Choose the product') : l('انتخاب قطعهٔ کاتالوگ', 'Choose the catalog part')} defaultValue="" disabled={running}
            onChange={(e) => { const p = list.find((c) => c.id === e.target.value); if (p) patch(it.key, { chosen: { ...it.chosen, [kind]: p } }); }}>
            <option value="" disabled>{kind === 'product' ? l('محصول را انتخاب کنید…', 'Choose the product…') : l('قطعهٔ کاتالوگ را انتخاب کنید…', 'Choose the catalog part…')}</option>
            {list.map((c) => <option key={c.id} value={c.id}>{`${c.nameFa} (${c.code})`}</option>)}
          </Select>
        );
      }
      return destination === 'both' ? <span key={kind} className="text-xs text-steel">{kindLabel(kind)}: —</span> : null;
    });
    return <div className="flex flex-col gap-2">{rows}</div>;
  };

  return (
    <>
      <p className="max-w-3xl text-sm leading-6 text-steel">
        {l('عکس‌ها را یکجا بکشید و رها کنید یا یک پوشه انتخاب کنید. نام هر فایل باید شمارهٔ فنی یا کد کالای قطعه باشد؛ برای چند عکس از یک قطعه شماره بگذارید: 0450102805-1.jpg، 0450102805-2.jpg. عکس شمارهٔ ۱ عکس اصلی می‌شود. عکس‌ها می‌توانند به محصولات فروشگاه، به قطعات کاتالوگ فنی یا به هر دو بروند (شمارهٔ فنی اصلی یا معادل قطعهٔ کاتالوگ هم شناخته می‌شود).', 'Drop many photos at once or choose a folder. Each file name must be the part’s technical number or SKU; number several photos of one part: 0450102805-1.jpg, 0450102805-2.jpg. Photo 1 becomes the main photo. Photos can go to shop products, technical catalog parts or both (a catalog part’s main or equivalent number is recognised too).')}
      </p>
      <Section title={l('انتخاب عکس‌ها', 'Choose photos')} id="bulk-photos-pick">
        <Field id="bulk-destination" label={l('عکس‌ها به کجا بروند؟', 'Where do the photos go?')} className="mb-4 max-w-md">
          <Select id="bulk-destination" value={destination} disabled={running} onChange={(e) => setDestination(e.target.value as Destination)}>
            <option value="products">{l('محصولات فروشگاه', 'Shop products')}</option>
            <option value="catalog">{l('قطعات کاتالوگ فنی', 'Technical catalog parts')}</option>
            <option value="both">{l('هر دو (محصول و قطعهٔ کاتالوگ با همان کد)', 'Both (product and catalog part with the same code)')}</option>
          </Select>
        </Field>
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
            {count('notFound') ? <Badge tone="danger">{l(`بدون مقصد: ${num(count('notFound'))}`, `No destination: ${num(count('notFound'))}`)}</Badge> : null}
            {count('invalid') ? <Badge tone="danger">{l(`فایل نامعتبر: ${num(count('invalid'))}`, `Invalid file: ${num(count('invalid'))}`)}</Badge> : null}
            {count('skipped') ? <Badge>{l(`رد می‌شود: ${num(count('skipped'))}`, `Skipped: ${num(count('skipped'))}`)}</Badge> : null}
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
            <thead><tr><th className={th}>{l('فایل', 'File')}</th><th className={th}>{l('کد خوانده‌شده', 'Code read')}</th><th className={th}>{l('مقصد', 'Goes to')}</th><th className={th}>{l('وضعیت', 'Status')}</th></tr></thead>
            <tbody>
              {shown.map((it) => (
                <tr key={it.key}>
                  <td className={td}><span className="block break-all" dir="ltr">{it.name}</span><span className="text-xs text-steel">{formatBytes(it.file.size, locale)}</span></td>
                  <td className={td}><Code>{it.code}</Code>{it.position > 1 ? <span className="ms-2 text-xs text-steel">{l(`عکس ${num(it.position)}`, `photo ${num(it.position)}`)}</span> : null}</td>
                  <td className={td}>{targets(it)}</td>
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
