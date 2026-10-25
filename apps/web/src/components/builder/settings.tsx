'use client';
import { useEffect, useState } from 'react';
import type { BuilderBlock, BuilderDocument, BuilderFilm, BuilderFilmClip, BuilderMedia, BuilderStyle } from '@hedax/contracts';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { LocalizedField, ImageField, LinkField } from '@/components/admin/content/kit';
import { SectionEditor } from '@/components/admin/content/home';
import type { BuilderData } from './data';
import { ProductPicker } from './product-picker';
export type Device = 'desktop' | 'tablet' | 'mobile';
export function BlockSettings({ block: b, change, device, media, pick, data }: { block: BuilderBlock; change: (block: BuilderBlock) => void; device: Device; media: (mobile: boolean) => void; pick: MediaPick; data: BuilderData }) {
  const style = (patch: Partial<BuilderStyle>) => change({ ...b, style: { ...b.style, ...patch } });
  const layout = b.style[device] ?? {};
  return <div className="space-y-4">
    <h2 className="font-bold">تنظیمات بخش انتخاب‌شده</h2>
    <label className="!flex-row items-center"><input type="checkbox" checked={b.visible} onChange={e => change({ ...b, visible: e.target.checked })} />نمایش بخش</label>
    {b.legacy ? <SectionEditor section={b.legacy} onChange={legacy => change({ ...b, legacy, title: legacy.title })} errors={{}} path="legacy" /> : <>
      <LocalizedField id="block-title" path="title" label={b.kind === 'cinematic-hero' ? 'شعار فارسی و انگلیسی' : 'عنوان'} value={b.title} onChange={title => change({ ...b, title })} maxLength={160} errors={{}} {...(b.kind === 'cinematic-hero' ? { hint: 'هر دو زبان در بنر نمایش داده می‌شوند؛ زبان صفحه عنوان اصلی است. برای پنهان‌کردن شعار دوم، متن آن زبان را خالی کنید.' } : {})} />
      <LocalizedField id="block-body" path="body" label="متن" value={b.body} onChange={body => change({ ...b, body })} maxLength={8000} multiline errors={{}} {...(b.kind === 'cinematic-hero' ? { hint: 'ذخیره می‌شود، اما فعلاً در Hero عمومی نمایش داده نمی‌شود.' } : {})} />
      {b.kind !== 'cinematic-hero' ? <><ImageField id="block-image" label="تصویر دسکتاپ" value={b.imageUrl} onChange={imageUrl => change({ ...b, imageUrl })} />
      <LocalizedField id="block-alt" path="alt" label="متن جایگزین" value={b.alt} onChange={alt => change({ ...b, alt })} maxLength={160} errors={{}} /></> : null}
      {b.kind !== 'cinematic-hero' ? <><LinkField id="block-href" label="لینک تصویر و دکمه" value={b.href} onChange={href => change({ ...b, href })} />
      <LocalizedField id="block-button" path="button" label="متن دکمه" value={b.button} onChange={button => change({ ...b, button })} maxLength={60} errors={{}} /></> : null}
    </>}
    {b.kind === 'cinematic-hero' && b.film ? <FilmSettings block={{ ...b, film: b.film }} change={change} pick={pick} /> : <>
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => media(false)}>انتخاب تصویر از کتابخانه</Button><Button size="sm" variant="secondary" onClick={() => media(true)}>تصویر موبایل از کتابخانه</Button></div>
    <ImageField id="block-mobile-image" label="تصویر موبایل" value={b.mobileImageUrl} onChange={mobileImageUrl => change({ ...b, mobileImageUrl })} />
    </>}
    {b.kind !== 'cinematic-hero' && b.legacy?.type !== 'hero' ? <label>قالب آمادهٔ بخش<select value="" onChange={e => { const preset = SECTION_PRESETS.find(x => x.id === e.target.value); if (preset) change({ ...b, style: structuredClone(preset.style) }); }}>
      <option value="">انتخاب قالب… (ظاهر فعلی جایگزین می‌شود؛ «بازگشت» آن را برمی‌گرداند)</option>{SECTION_PRESETS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label> : null}
    <details open><summary className="cursor-pointer font-bold">ابعاد و فاصله‌ها — {device === 'desktop' ? 'دسکتاپ' : device === 'tablet' ? 'تبلت' : 'موبایل'}</summary>
      <p className="my-2 text-xs text-steel">کادر خالی از تنظیمات پیش‌فرض استفاده می‌کند. ارتفاع، حداقل ارتفاع بخش است تا متن بریده نشود.</p>
      {([['width', 'عرض (درصد)', 100], ['height', 'ارتفاع (پیکسل)', 1400], ['columns', 'تعداد ستون', 6], ['gap', 'فاصله بین باکس‌ها', 100], ['padding', 'فاصله داخلی', 160], ['margin', 'فاصله خارجی', 160]] as const).map(([key, label, max]) =>
        <label key={key}>{label}<input type="number" min={key === 'width' ? 10 : key === 'columns' ? 1 : 0} max={max} value={layout[key] ?? ''} onChange={e => { const next = { ...layout }; if (!e.target.value) delete next[key]; else next[key] = Math.min(max, Math.max(key === 'columns' ? 1 : key === 'width' ? 10 : 0, Number(e.target.value))); style({ [device]: next }); }} /></label>)}
      <label className="!flex-row items-center"><input type="checkbox" checked={layout.hidden ?? false} onChange={e => style({ [device]: { ...layout, hidden: e.target.checked } })} />مخفی در این دستگاه</label>
    </details>
    <details><summary className="cursor-pointer font-bold">رنگ، تصویر و قالب کارت</summary>
      {([['background', 'رنگ پس‌زمینه'], ['foreground', 'رنگ متن'], ['borderColor', 'رنگ حاشیه']] as const).map(([key, label]) => <label key={key}>{label}<input type="color" value={b.style[key] ?? '#ffffff'} onChange={e => style({ [key]: e.target.value })} /><button className="text-xs" onClick={() => { const next = { ...b.style }; delete next[key]; change({ ...b, style: next }); }}>بازگشت به رنگ پیش‌فرض</button></label>)}
      {([['radius', 'گردی گوشه', 80], ['borderWidth', 'ضخامت حاشیه', 12], ['imageHeight', 'ارتفاع تصویر', 700], ['titleSize', 'اندازه عنوان', 60], ['priceSize', 'اندازه قیمت', 48], ['focalX', 'نقطه کانونی افقی (درصد)', 100], ['focalY', 'نقطه کانونی عمودی (درصد)', 100]] as const).map(([key, label, max]) => <label key={key}>{label}<input type="number" min={key.endsWith('Size') ? 12 : 0} max={max} value={b.style[key] ?? ''} onChange={e => { const next = { ...b.style }; if (!e.target.value) delete next[key]; else next[key] = Math.min(max, Math.max(key.endsWith('Size') ? 12 : 0, Number(e.target.value))); change({ ...b, style: next }); }} /></label>)}
      <label>تراز محتوا<select value={b.style.align ?? 'start'} onChange={e => style({ align: e.target.value as BuilderStyle['align'] })}><option value="start">ابتدا</option><option value="center">وسط</option><option value="end">انتها</option></select></label>
      <label>نمایش تصویر<select value={b.style.imageFit ?? 'cover'} onChange={e => style({ imageFit: e.target.value as 'cover' | 'contain' })}><option value="cover">پوشاندن کادر</option><option value="contain">تصویر کامل</option></select></label>
      <label>سایه<select value={b.style.shadow ?? 'none'} onChange={e => style({ shadow: e.target.value as 'none' | 'soft' | 'raised' })}><option value="none">بدون سایه</option><option value="soft">ملایم</option><option value="raised">برجسته</option></select></label>
      <label>قالب کارت<select value={b.style.template ?? 'classic'} onChange={e => style({ template: e.target.value as 'classic' | 'compact' | 'horizontal' | 'outlined' })}><option value="classic">کلاسیک</option><option value="compact">فشرده</option><option value="horizontal">افقی</option><option value="outlined">حاشیه‌دار</option></select></label>
    </details>
    <details><summary className="cursor-pointer font-bold">زمان‌بندی نمایش</summary>
      <p className="text-xs">زمان بر اساس منطقهٔ زمانی مرورگر شما است.</p>
      {(['startsAt', 'endsAt'] as const).map(key => <label key={key}>{key === 'startsAt' ? 'شروع' : 'پایان'}<input type="datetime-local" value={b[key] ? new Date(Date.parse(b[key]!) - new Date(b[key]!).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''} onChange={e => change({ ...b, [key]: e.target.value ? new Date(e.target.value).toISOString() : null })} /></label>)}
    </details>
    {['new-products', 'bestsellers', 'discounts', 'offers', 'selected-products', 'vehicle-products'].includes(b.kind) ? <details open><summary className="cursor-pointer font-bold">انتخاب محصولات واقعی</summary>
      <p className="text-xs leading-6">قیمت و موجودی مستقیماً از فروشگاه می‌آیند. پرفروش‌ها از سفارش‌های پرداخت‌شده و تخفیف‌ها از قواعد قیمت معتبر محاسبه می‌شوند.</p>
      {['new-products', 'vehicle-products'].includes(b.kind) ? (['category', 'brand', 'vehicle', 'model'] as const).map((key, index) => {
        const options = key === 'category' ? data.categories : key === 'brand' ? data.brands : key === 'vehicle' ? data.vehicles : data.vehicles.find(v => v.slug === b.query.vehicle)?.models ?? [];
        return <label key={key}>{['دسته‌بندی', 'برند', 'خودرو', 'مدل'][index]}<select value={b.query[key]} onChange={e => change({ ...b, query: { ...b.query, [key]: e.target.value, ...(key === 'vehicle' ? { model: '' } : {}) } })}><option value="">همه</option>{options.map(o => <option key={o.slug} value={o.slug}>{o.name.fa}</option>)}</select></label>;
      }) : null}
      {['selected-products', 'offers'].includes(b.kind) ? <ProductPicker selected={b.query.productSlugs} onChange={productSlugs => change({ ...b, query: { ...b.query, productSlugs } })} /> : null}
      <label>تعداد محصولات<input type="number" min="1" max="24" value={b.query.limit} onChange={e => change({ ...b, query: { ...b.query, limit: Math.max(1, Math.min(24, Number(e.target.value))) } })} /></label>
    </details> : null}
    {['slider', 'banners', 'services', 'benefits', 'custom', 'image-categories'].includes(b.kind) ? <details open><summary className="cursor-pointer font-bold">کارت‌ها و اسلایدها</summary>
      {b.kind === 'slider' ? <label>فاصله اسلایدها (میلی‌ثانیه)<input type="number" min="3000" max="30000" step="1000" value={b.interval} onChange={e => change({ ...b, interval: Math.max(3000, Math.min(30000, Number(e.target.value))) })} /></label> : null}
      {b.items.map((item, i) => <div key={i} className="my-4 space-y-3 rounded-xl border p-3">
        <LocalizedField id={`item-${i}-title`} path="title" label={`عنوان کارت ${i + 1}`} value={item.title} onChange={title => change({ ...b, items: b.items.map((x, j) => i === j ? { ...x, title } : x) })} maxLength={160} errors={{}} />
        <LocalizedField id={`item-${i}-text`} path="text" label="توضیح" value={item.text} onChange={text => change({ ...b, items: b.items.map((x, j) => i === j ? { ...x, text } : x) })} maxLength={1000} errors={{}} />
        <ImageField id={`item-${i}-image`} label="تصویر" value={item.imageUrl} onChange={imageUrl => change({ ...b, items: b.items.map((x, j) => i === j ? { ...x, imageUrl } : x) })} />
        <ImageField id={`item-${i}-mobile`} label="تصویر موبایل" value={item.mobileImageUrl} onChange={mobileImageUrl => change({ ...b, items: b.items.map((x, j) => i === j ? { ...x, mobileImageUrl } : x) })} />
        <LocalizedField id={`item-${i}-alt`} path="alt" label="متن جایگزین" value={item.alt} onChange={alt => change({ ...b, items: b.items.map((x, j) => i === j ? { ...x, alt } : x) })} maxLength={160} errors={{}} />
        <LinkField id={`item-${i}-href`} label="لینک" value={item.href} onChange={href => change({ ...b, items: b.items.map((x, j) => i === j ? { ...x, href } : x) })} />
        <LocalizedField id={`item-${i}-button`} path="button" label="متن دکمه" value={item.button} onChange={button => change({ ...b, items: b.items.map((x, j) => i === j ? { ...x, button } : x) })} maxLength={60} errors={{}} />
        <label className="!flex-row"><input type="checkbox" checked={item.visible} onChange={e => change({ ...b, items: b.items.map((x, j) => i === j ? { ...x, visible: e.target.checked } : x) })} />نمایش کارت</label>
        <div className="flex gap-2"><Button size="sm" variant="ghost" disabled={!i} onClick={() => { const items = [...b.items]; [items[i - 1], items[i]] = [items[i]!, items[i - 1]!]; change({ ...b, items }); }}>بالا</Button><Button size="sm" variant="ghost" onClick={() => change({ ...b, items: b.items.filter((_, j) => i !== j) })}>حذف کارت</Button></div>
      </div>)}
      <Button size="sm" disabled={b.items.length >= 20} onClick={() => change({ ...b, items: [...b.items, { title: { fa: 'کارت جدید', en: 'New card' }, text: { fa: '', en: '' }, imageUrl: '', mobileImageUrl: '', alt: { fa: '', en: '' }, button: { fa: '', en: '' }, href: '', visible: true }] })}>افزودن کارت یا اسلاید</Button>
    </details> : null}
  </div>;
}
/** Controlled section looks: only values the style schema already validates, never free CSS. */
export const SECTION_PRESETS: Array<{ id: string; label: string; style: BuilderStyle }> = [
  { id: 'default', label: 'پیش‌فرض سایت', style: {} },
  { id: 'cards-compact', label: 'کارت‌های فشرده — ۴ ستون، موبایل ۲ ستون', style: { template: 'compact', shadow: 'soft', radius: 12, desktop: { columns: 4, gap: 16 }, tablet: { columns: 3 }, mobile: { columns: 2, gap: 10 } } },
  { id: 'cards-horizontal', label: 'کارت‌های افقی — ۲ ستون', style: { template: 'horizontal', radius: 16, desktop: { columns: 2, gap: 20 }, mobile: { columns: 1 } } },
  { id: 'outlined', label: 'کارت‌های حاشیه‌دار روشن', style: { template: 'outlined', radius: 16, shadow: 'none', desktop: { columns: 3, gap: 20 }, mobile: { columns: 1 } } },
  { id: 'dark-band', label: 'نوار تیرهٔ تمام‌عرض (هم‌خوان با فیلم)', style: { background: '#071b34', foreground: '#f6f8fc', radius: 0, desktop: { padding: 56 }, mobile: { padding: 24 } } },
  { id: 'narrow-center', label: 'متن وسط‌چین با عرض محدود', style: { align: 'center', desktop: { width: 70, padding: 40 }, mobile: { width: 100, padding: 20 } } },
];
export function ThemeSettings({ document: doc, change }: { document: BuilderDocument; change: (doc: BuilderDocument) => void }) {
  const theme = doc.theme;
  return <div className="builder-panel !static !max-h-none"><h2 className="text-xl font-bold">قالب‌ها و استایل‌ها</h2>
    <div className="my-4 flex flex-wrap gap-2">{[['سرمه‌ای هداکس', '#096ce5', '#f7faff', '#15243a'], ['روشن', '#075985', '#ffffff', '#14253a'], ['تیره', '#60a5fa', '#101b2b', '#f1f5f9']].map(([name, primary, background, foreground]) => <Button key={name} variant="secondary" onClick={() => change({ ...doc, theme: { ...theme, primary: primary!, background: background!, foreground: foreground! } })}>{name}</Button>)}</div>
    <div className="grid gap-4 sm:grid-cols-3">{([['primary', 'رنگ اصلی'], ['background', 'پس‌زمینه صفحه'], ['foreground', 'رنگ متن'], ['card', 'پس‌زمینه کارت'], ['border', 'حاشیه'], ['button', 'دکمه'], ['link', 'لینک']] as const).map(([key, label]) => <label key={key}>{label}<input type="color" value={theme[key]} onChange={e => change({ ...doc, theme: { ...theme, [key]: e.target.value } })} /></label>)}</div>
    <div className="grid gap-4 sm:grid-cols-3">{([['contentWidth', 'عرض محتوا', 640, 1920], ['radius', 'گردی گوشه', 0, 48], ['spacing', 'فاصله سکشن‌ها', 0, 120], ['fontSize', 'اندازه متن', 14, 22]] as const).map(([key, label, min, max]) => <label key={key}>{label}<input type="number" min={min} max={max} value={theme[key]} onChange={e => change({ ...doc, theme: { ...theme, [key]: Math.max(min, Math.min(max, Number(e.target.value))) } })} /></label>)}</div>
    <label>فونت<select value={theme.font} onChange={e => change({ ...doc, theme: { ...theme, font: e.target.value as 'brand' | 'system' } })}><option value="brand">وزیرمتن / Montserrat — هویت فعلی</option><option value="system">Tahoma / Arial</option></select></label>
    <label>وزن تیتر<select value={theme.headingWeight} onChange={e => change({ ...doc, theme: { ...theme, headingWeight: e.target.value as '600' | '700' | '800' } })}><option value="600">نیمه‌پررنگ</option><option value="700">پررنگ</option><option value="800">بسیار پررنگ</option></select></label>
  </div>;
}

const VIDEO = /^(\/(?!\/)[A-Za-z0-9/_.-]+|https:\/\/[^\s?#]+)\.(mp4|webm)$/i;
export type MediaPick = (kind: 'image' | 'video', apply: (media: BuilderMedia) => void) => void;
/** Release state of a file referenced by the hero, as the library knows it. */
function Release({ url, library }: { url: string; library: Map<string, BuilderMedia> }) {
  if (!url) return null;
  const m = library.get(url);
  const ok = m?.releaseCleared;
  return <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs ${ok ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}>{ok ? 'تأییدشده برای انتشار عمومی' : m ? 'در کتابخانه — تأیید انتشار (بدون واترمارک) لازم است' : 'خارج از کتابخانه — قابل انتشار عمومی نیست'}</span>;
}
/**
 * The opening film: an ordered list of clips (each with its own desktop/mobile movie and posters), independent
 * desktop/mobile still images, playback mode and the logo. Movies and images come from the media library.
 */
function FilmSettings({ block: b, change, pick }: { block: BuilderBlock & { film: BuilderFilm }; change: (block: BuilderBlock) => void; pick: MediaPick }) {
  const film = b.film;
  const [library, setLibrary] = useState(new Map<string, BuilderMedia>());
  useEffect(() => { void api<BuilderMedia[]>('/admin/content/media?q=').then(rows => setLibrary(new Map(rows.map(r => [r.url, r])))).catch(() => undefined); }, [film]);
  const set = (patch: Partial<BuilderFilm>) => change({ ...b, film: { ...film, ...patch } });
  const setClip = (i: number, patch: Partial<BuilderFilmClip>) => set({ clips: film.clips.map((c, j) => (i === j ? { ...c, ...patch } : c)) });
  const moveClip = (i: number, to: number) => { const clips = [...film.clips]; const [c] = clips.splice(i, 1); clips.splice(to, 0, c!); set({ clips }); };
  return <details open className="rounded-xl border p-3"><summary className="cursor-pointer font-bold">فیلم‌های بنر اصلی (Hero)</summary>
    <p className="my-2 text-xs leading-6 text-steel">فیلم‌های فعال به همین ترتیب پشت سر هم پخش می‌شوند. هر بازدیدکننده فقط فایل متناسب با دستگاه خود را دریافت می‌کند. انتشار عمومی فقط با فایل‌های کتابخانه که «تأیید انتشار» دارند ممکن است.</p>
    <ol className="space-y-3">{film.clips.map((clip, i) => <li key={clip.id} className="rounded-lg border p-3" data-film-clip={i}>
      <div className="flex flex-wrap items-center justify-between gap-2"><strong>فیلم {(i + 1).toLocaleString('fa-IR')}</strong>
        <label className="!m-0 !flex-row items-center"><input type="checkbox" checked={clip.active} onChange={e => setClip(i, { active: e.target.checked })} />فعال</label></div>
      <div className="flex gap-1"><Button size="sm" variant="ghost" disabled={!i} onClick={() => moveClip(i, i - 1)}>بالا</Button><Button size="sm" variant="ghost" disabled={i === film.clips.length - 1} onClick={() => moveClip(i, i + 1)}>پایین</Button><Button size="sm" variant="ghost" onClick={() => set({ clips: film.clips.filter((_, j) => j !== i) })}>حذف از فهرست</Button></div>
      {([['desktop', 'ویدیوی دسکتاپ (MP4)'], ['desktopWebm', 'نسخهٔ سبک دسکتاپ (WebM، اختیاری)'], ['mobile', 'ویدیوی موبایل (MP4، خالی = دسکتاپ)']] as const).map(([key, label]) => {
        const invalid = clip[key] !== '' && !VIDEO.test(clip[key]);
        return <div key={key}><label>{label}<input dir="ltr" value={clip[key]} aria-invalid={invalid} onChange={e => setClip(i, { [key]: e.target.value.trim() })} /></label>
          {invalid ? <span className="text-xs text-red-700">نشانی باید به mp4. یا webm. ختم شود.</span> : null}
          <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="secondary" onClick={() => pick('video', m => setClip(i, { [key]: m.url }))}>انتخاب از کتابخانه</Button>{clip[key] ? <Button size="sm" variant="ghost" onClick={() => setClip(i, { [key]: '' })}>پاک کردن</Button> : null}</div>
          <Release url={clip[key]} library={library} /></div>;
      })}
      {([['poster', 'پوستر شروع — دسکتاپ'], ['mobilePoster', 'پوستر شروع — موبایل']] as const).map(([key, label]) => <div key={key}>
        <ImageField id={`clip-${clip.id}-${key}`} label={label} value={clip[key]} onChange={url => setClip(i, { [key]: url })} />
        <Button size="sm" variant="secondary" onClick={() => pick('image', m => setClip(i, { [key]: m.url }))}>انتخاب از کتابخانه</Button><Release url={clip[key]} library={library} /></div>)}
    </li>)}</ol>
    <Button className="mt-3" size="sm" disabled={film.clips.length >= 6} onClick={() => set({ clips: [...film.clips, { id: crypto.randomUUID().slice(0, 12), active: true, desktop: '', desktopWebm: '', mobile: '', poster: '', mobilePoster: '' }] })}>افزودن فیلم به ترتیب پخش</Button>
    <h3 className="mt-4 font-bold">تصویر جایگزین (بدون فیلم)</h3>
    <p className="text-xs leading-6 text-steel">برای «فقط تصویر»، کاهش حرکت، صرفه‌جویی داده یا خطای پخش نمایش داده می‌شود.</p>
    {([['imageUrl', 'تصویر جایگزین دسکتاپ'], ['mobileImageUrl', 'تصویر جایگزین موبایل']] as const).map(([key, label]) => <div key={key}>
      <ImageField id={`film-${key}`} label={label} value={b[key]} onChange={url => change({ ...b, [key]: url })} />
      <Button size="sm" variant="secondary" onClick={() => pick('image', m => change({ ...b, [key]: m.url }))}>انتخاب از کتابخانه</Button><Release url={b[key]} library={library} /></div>)}
    <LocalizedField id="film-alt" path="alt" label="توضیح تصویر برای صفحه‌خوان" value={b.alt} onChange={alt => change({ ...b, alt })} maxLength={160} errors={{}} />
    <label>نحوهٔ پخش<select value={film.playback} onChange={e => set({ playback: e.target.value as BuilderFilm['playback'] })}><option value="once">یک بار پخش و توقف روی آخرین تصویر</option><option value="loop">تکرار پیوسته</option><option value="static">فقط تصویر — بدون فیلم</option></select></label>
    <h3 className="mt-4 font-bold">لوگو روی فیلم</h3>
    <label className="!flex-row items-center"><input type="checkbox" checked={film.logoAt !== null} onChange={e => set({ logoAt: e.target.checked ? 9.8 : null })} />نمایش لوگو (فقط یک بار)</label>
    {film.logoAt !== null ? <>
      <label>زمان ظاهرشدن در آخرین فیلم (ثانیه)<input type="number" min={0} max={120} step={0.1} value={film.logoAt} onChange={e => set({ logoAt: Math.max(0, Math.min(120, Number(e.target.value) || 0)) })} /></label>
      <label>عرض لوگو (درصد عرض فیلم)<input type="number" min={10} max={60} value={film.logoWidth} onChange={e => set({ logoWidth: Math.max(10, Math.min(60, Math.round(Number(e.target.value) || 28))) })} /></label>
      <ImageField id="film-logo" label="لوگوی اختصاصی (خالی = لوگوی سایت)" value={film.logoUrl} onChange={logoUrl => set({ logoUrl })} />
    </> : null}
    <label className="!flex-row items-center"><input type="checkbox" checked={film.discovery} onChange={e => set({ discovery: e.target.checked })} />کارت‌ها و دسته‌بندی‌ها در بخش مستقل زیر بنر</label>
  </details>;
}
