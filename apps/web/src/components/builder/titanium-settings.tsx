'use client';

import type { BuilderBlock, BuilderDocument } from '@hedax/contracts';
import { useTranslations } from 'next-intl';
import { ImageField, LinkField, LocalizedField } from '@/components/admin/content/kit';
import { newTitaniumConfig, titaniumConfig, TITANIUM_CONFIG_ID } from '@/components/store/titanium-config';

/** A draft-only form using the existing validated/versioned builder document. */
export function TitaniumSettings({ document: doc, change }: { document: BuilderDocument; change: (doc: BuilderDocument) => void }) {
  const ta = useTranslations('atelier');
  const defaults = newTitaniumConfig();
  const saved = titaniumConfig(doc);
  const b = saved ? { ...saved, items: defaults.items.map((item, i) => saved.items[i] ?? item) } : defaults;
  const update = (patch: Partial<BuilderBlock>) => {
    const next = { ...b, ...patch };
    change({ ...doc, sections: saved ? doc.sections.map(s => s.id === TITANIUM_CONFIG_ID ? next : s) : [...doc.sections, next] });
  };
  const item = (i: number, patch: Partial<BuilderBlock['items'][number]>) => update({ items: b.items.map((x, j) => i === j ? { ...x, ...patch } : x) });
  return <div className="builder-panel !static !max-h-none space-y-6">
    <button type="button" onClick={() => update({ style: { ...b.style, background: '#f5f0e8', foreground: '#f5f0e8', borderColor: '#aa9275' } })}>{ta('applyPalette')}</button>
    <div><h2 className="text-xl font-bold">طراحی و محتوای صفحهٔ اصلی</h2><p className="mt-2 text-sm leading-7">از بالا به پایین سایت ویرایش کنید. تغییرها ابتدا پیش‌نویس‌اند؛ با «پیش‌نمایش کامل» بررسی و سپس منتشر کنید. فیلم‌ها و محصولات واقعی در «بخش‌های فروشگاه و فیلم‌ها» ویرایش می‌شوند.</p></div>
    <details open><summary className="font-bold">۱. شعار و نوار فیلم بالا</summary><div className="mt-4 space-y-4">
      <ImageField id="ti-hero-image" label="تصویر بنر اصلی / Main banner image" value={b.imageUrl} onChange={imageUrl => update({ imageUrl })} />
      <LocalizedField id="ti-hero-alt" path="alt" label="توضیح تصویر / Image description" value={b.alt} onChange={alt => update({ alt })} maxLength={160} errors={{}} />
      <LocalizedField id="ti-main" path="title" label="خط اول شعار" value={b.title} onChange={title => update({ title })} maxLength={160} errors={{}} />
      <LocalizedField id="ti-sub" path="body" label="خط دوم شعار" value={b.body} onChange={body => update({ body })} maxLength={160} errors={{}} />
      <label>متن انگلیسی / English tagline<input dir="ltr" maxLength={60} value={b.button.en} onChange={e => update({ button: { ...b.button, en: e.target.value } })} /></label>
      <div className="grid gap-4 sm:grid-cols-2">{(['desktop', 'mobile'] as const).map(device => <label key={device}>{device === 'desktop' ? 'حداکثر ارتفاع فیلم دسکتاپ' : 'ارتفاع فیلم موبایل'}<input type="number" min={device === 'desktop' ? 240 : 220} max={device === 'desktop' ? 420 : 260} value={b.style[device]?.height ?? (device === 'desktop' ? 420 : 240)} onChange={e => update({ style: { ...b.style, [device]: { ...b.style[device], height: Math.max(device === 'desktop' ? 240 : 220, Math.min(device === 'desktop' ? 420 : 260, Number(e.target.value))) } } })} /></label>)}</div>
      <p className="text-xs">شعار روی تصویر بنر ظاهر می‌شود. فیلم‌های موجود CMS حفظ می‌شوند؛ ارتفاع قاب با نسبت واقعی فیلم تنظیم می‌شود. / The title overlays the banner; existing CMS films remain visible at their natural ratio.</p>
    </div></details>
    <details><summary className="font-bold">۲. رنگ‌های یکپارچهٔ سایت</summary><div className="my-4 grid gap-4 sm:grid-cols-3">{([['background', 'زمینهٔ عاجی بالا / Top canvas', '#f5f0e8'], ['foreground', 'زمینهٔ عاجی پایین / Bottom canvas', '#f5f0e8'], ['borderColor', 'برنز قاب‌ها / Bronze edges', '#aa9275']] as const).map(([key, label, fallback]) => <label key={key}>{label}<input type="color" value={b.style[key] ?? fallback} onChange={e => update({ style: { ...b.style, [key]: e.target.value } })} /></label>)}</div><p className="text-xs">زمینهٔ باکس‌ها شفاف می‌ماند؛ برای حفظ خوانایی، ابتدا در موبایل و دسکتاپ پیش‌نمایش بگیرید.</p></details>
    {[[0, 6, '۳. شش مسیر خرید'], [6, 9, '۴. قیمت خودرو، مجله و ویدیو'], [9, 10, '۵. دعوت به درخواست تأمین'], [10, 14, '۶. تصاویر نشان برندها / Brand artwork']] .map(([from, to, title]) => <details key={String(title)}><summary className="font-bold">{title}</summary><div className="mt-4 grid gap-4 lg:grid-cols-2">{b.items.slice(Number(from), Number(to)).map((x, offset) => {
      const i = Number(from) + offset;
      return <div key={i} className="space-y-4 rounded-xl border p-4"><label className="!flex-row"><input type="checkbox" checked={x.visible} onChange={e => item(i, { visible: e.target.checked })} />نمایش {x.title.fa}</label>
        <LocalizedField id={`ti-${i}-title`} path="title" label="عنوان" value={x.title} onChange={title => item(i, { title })} maxLength={160} errors={{}} />
        <LocalizedField id={`ti-${i}-text`} path="text" label="توضیح کوتاه" value={x.text} onChange={text => item(i, { text })} maxLength={1000} errors={{}} />
        <ImageField id={`ti-${i}-image`} label="کاور (خالی = تصویر تأییدشدهٔ فعلی)" value={x.imageUrl} onChange={imageUrl => item(i, { imageUrl })} />
        <LocalizedField id={`ti-${i}-alt`} path="alt" label="توضیح تصویر برای صفحه‌خوان" value={x.alt} onChange={alt => item(i, { alt })} maxLength={160} errors={{}} />
        {i < 6 || i === 9 ? <LinkField id={`ti-${i}-link`} label="لینک (خالی = مسیر فعلی)" value={x.href} onChange={href => item(i, { href })} /> : null}
      </div>;
    })}</div>{Number(from) === 6 ? <p className="mt-4 text-sm">این سه باکس فعلاً محتوای ثابت دارند؛ اتصال قیمت روز و آپارات مرحلهٔ جداگانه است و با ویرایش این فرم فعال نمی‌شود.</p> : null}</details>)}
  </div>;
}
