import Image from 'next/image';
import type { BuilderBlock } from '@hedax/contracts';
import { localize } from '@hedax/contracts/constants';
import { ATELIER_ASSETS } from './titanium-config';

/** Prices and videos have no connected source yet, so those two cards say «soon» and show no sample data. */
export function AutomotiveHub({ locale, items, heading, subtitle }: { locale: string; items?: BuilderBlock['items']; heading?: string; subtitle?: string }) {
  const fa = locale === 'fa';
  const soon = <p className="titanium-hub-status">{fa ? 'به‌زودی' : 'Coming soon'}</p>;
  return <section className="container-page titanium-hub" aria-labelledby="automotive-hub-title">
    <div className="titanium-section-heading"><div><h2 id="automotive-hub-title">{heading || (fa ? 'مجله و بازار خودرو' : 'The automotive journal')}</h2><p className="atelier-section-subtitle" dir="ltr" lang="en">{subtitle || 'The automotive journal'}</p></div></div>
    <div className="titanium-hub-grid">
      {items?.[0]?.visible !== false ? <article className="titanium-float titanium-hub-card" aria-labelledby="hub-prices-title">
        <div className="titanium-hub-cover"><Image src={items?.[0]?.imageUrl || `${ATELIER_ASSETS}/hub-0.webp`} alt={localize(items?.[0]?.alt, locale) || (fa ? 'خودرو؛ کاور مجله' : 'Automotive editorial cover')} fill sizes="(max-width: 800px) 90vw, 30vw" /></div>
        <h3 id="hub-prices-title">{localize(items?.[0]?.title, locale) || (fa ? 'قیمت روز خودرو' : 'Daily car prices')}</h3>
        <p>{localize(items?.[0]?.text, locale) || (fa ? 'نگاهی به قیمت خودرو، با تفکیک مدل، تیپ و سال ساخت.' : 'A view of car prices, by model, trim and year.')}</p>
        {soon}
      </article> : null}

      {items?.[1]?.visible !== false ? <article className="titanium-float titanium-hub-card" aria-labelledby="hub-guide-title">
        <div className="titanium-hub-cover"><Image src={items?.[1]?.imageUrl || `${ATELIER_ASSETS}/hub-1.webp`} alt={localize(items?.[1]?.alt, locale) || (fa ? 'کتاب و ابزار فنی' : 'Technical book and precision tools')} fill sizes="(max-width: 800px) 90vw, 30vw" /></div>
        <h3 id="hub-guide-title">{localize(items?.[1]?.title, locale) || (fa ? 'مجله و راهنمای فنی' : 'Journal & technical guides')}</h3>
        <p>{localize(items?.[1]?.text, locale) || (fa ? 'شماره فنی؛ نقطه شروع انتخاب قطعه مناسب' : 'Part numbers: a starting point for the right fit')}</p>
        <details className="titanium-hub-article">
          <summary>{fa ? 'خواندن راهنمای کوتاه' : 'Read the short guide'}</summary>
          <p>{fa ? 'پیش از انتخاب قطعه، مدل، تیپ و سال خودرو را مشخص کنید. نام قطعه و شماره فنی موجود روی آن را در کاتالوگ جست‌وجو کنید و اطلاعات سازگاری ثبت‌شده در صفحه محصول را بخوانید. اگر درباره تطابق مطمئن نیستید، پیش از خرید از پشتیبانی کمک بگیرید.' : 'Identify the vehicle model, trim and year before choosing a part. Search the catalogue using the part name and its reference number, then read the recorded fitment information on the product page. If you are unsure about compatibility, ask support before buying.'}</p>
        </details>
      </article> : null}

      {items?.[2]?.visible !== false ? <article className="titanium-float titanium-hub-card" aria-labelledby="hub-video-title">
        <div className="titanium-hub-cover"><Image src={items?.[2]?.imageUrl || `${ATELIER_ASSETS}/hub-2.webp`} alt={localize(items?.[2]?.alt, locale) || (fa ? 'دوربین و خودرو' : 'Camera and car')} fill sizes="(max-width: 800px) 90vw, 30vw" /></div>
        <h3 id="hub-video-title">{localize(items?.[2]?.title, locale) || (fa ? 'ویدیوهای پربازدید خودرو' : 'Popular automotive videos')}</h3>
        <p>{localize(items?.[2]?.text, locale) || (fa ? 'آموزش، بررسی و تجربه‌های دنیای خودرو' : 'Learning, reviews and experiences from the automotive world')}</p>
        {soon}
      </article> : null}
    </div>
  </section>;
}
