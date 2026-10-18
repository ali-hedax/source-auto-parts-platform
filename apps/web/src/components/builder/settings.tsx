'use client';
import type { BuilderBlock, BuilderDocument, BuilderStyle } from '@hedax/contracts';
import { Button } from '@/components/ui/button';
import { LocalizedField, ImageField, LinkField } from '@/components/admin/content/kit';
import { SectionEditor } from '@/components/admin/content/home';
import type { BuilderData } from './data';
import { ProductPicker } from './product-picker';
export type Device = 'desktop' | 'tablet' | 'mobile';
export function BlockSettings({ block: b, change, device, media, data }: { block: BuilderBlock; change: (block: BuilderBlock) => void; device: Device; media: (mobile: boolean) => void; data: BuilderData }) {
  const style = (patch: Partial<BuilderStyle>) => change({ ...b, style: { ...b.style, ...patch } });
  const layout = b.style[device] ?? {};
  return <div className="space-y-4">
    <h2 className="font-bold">تنظیمات بخش انتخاب‌شده</h2>
    <label className="!flex-row items-center"><input type="checkbox" checked={b.visible} onChange={e => change({ ...b, visible: e.target.checked })} />نمایش بخش</label>
    {b.legacy ? <SectionEditor section={b.legacy} onChange={legacy => change({ ...b, legacy, title: legacy.title })} errors={{}} path="legacy" /> : <>
      <LocalizedField id="block-title" path="title" label="عنوان" value={b.title} onChange={title => change({ ...b, title })} maxLength={160} errors={{}} />
      <LocalizedField id="block-body" path="body" label="متن" value={b.body} onChange={body => change({ ...b, body })} maxLength={8000} multiline errors={{}} />
      <ImageField id="block-image" label="تصویر دسکتاپ" value={b.imageUrl} onChange={imageUrl => change({ ...b, imageUrl })} />
      <LocalizedField id="block-alt" path="alt" label="متن جایگزین" value={b.alt} onChange={alt => change({ ...b, alt })} maxLength={160} errors={{}} />
      <LinkField id="block-href" label="لینک تصویر و دکمه" value={b.href} onChange={href => change({ ...b, href })} />
      <LocalizedField id="block-button" path="button" label="متن دکمه" value={b.button} onChange={button => change({ ...b, button })} maxLength={60} errors={{}} />
    </>}
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => media(false)}>انتخاب تصویر از کتابخانه</Button><Button size="sm" variant="secondary" onClick={() => media(true)}>تصویر موبایل از کتابخانه</Button></div>
    <ImageField id="block-mobile-image" label="تصویر موبایل" value={b.mobileImageUrl} onChange={mobileImageUrl => change({ ...b, mobileImageUrl })} />
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
