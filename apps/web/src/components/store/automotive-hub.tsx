import { Play, Clock3 } from 'lucide-react';

/** Static editorial shells only. Live prices, feeds and video APIs are a later owner-approved phase. */
export function AutomotiveHub({ locale }: { locale: string }) {
  const fa = locale === 'fa';
  return <section className="container-page titanium-hub" aria-labelledby="automotive-hub-title">
    <div className="titanium-section-heading"><div><h2 id="automotive-hub-title">{fa ? 'مجله و بازار خودرو' : 'The automotive journal'}</h2><p>{fa ? 'بازار، دانستنی‌های فنی و دنیای ویدیوهای خودرو' : 'The market, practical know-how and automotive videos'}</p></div></div>
    <div className="titanium-hub-grid">
      <article className="titanium-float titanium-hub-card" aria-labelledby="hub-prices-title">
        <div aria-hidden className="titanium-hub-cover" style={{ backgroundPosition: '100% 50%' }} />
        <h3 id="hub-prices-title">{fa ? 'قیمت روز خودرو' : 'Daily car prices'}</h3>
        <p>{fa ? 'نگاهی به قیمت خودرو، با تفکیک مدل، تیپ و سال ساخت.' : 'A view of car prices, by model, trim and year.'}</p>
        <p className="titanium-hub-status"><Clock3 size={15} aria-hidden />{fa ? 'در انتظار اتصال به منبع قیمت' : 'Awaiting a price-data source'}</p>
        <dl className="titanium-price-sample" aria-label={fa ? 'فهرست نمونه؛ قیمت زنده نیست' : 'Sample list; no live prices'}>
          {(fa ? ['پژو ۲۰۷', 'دنا پلاس', 'تارا'] : ['Peugeot 207', 'Dena Plus', 'Tara']).map(name => <div key={name}><dt>{name}</dt><dd aria-label={fa ? 'قیمت هنوز دریافت نشده' : 'Price not yet available'}>—</dd></div>)}
        </dl>
        <small>{fa ? 'فهرست نمایشی است؛ منبع و به‌روزرسانی روزانه در مرحله بعد متصل می‌شود.' : 'Display sample. A source and daily updates will be connected in the next phase.'}</small>
      </article>

      <article className="titanium-float titanium-hub-card" aria-labelledby="hub-guide-title">
        <div aria-hidden className="titanium-hub-cover" style={{ backgroundPosition: '50% 50%' }} />
        <h3 id="hub-guide-title">{fa ? 'مجله و راهنمای فنی' : 'Journal & technical guides'}</h3>
        <p>{fa ? 'شماره فنی؛ نقطه شروع انتخاب قطعه مناسب' : 'Part numbers: a starting point for the right fit'}</p>
        <p className="titanium-hub-status">{fa ? 'راهنمای پایه · محتوای ثابت' : 'A basic guide · static content'}</p>
        <details className="titanium-hub-article">
          <summary>{fa ? 'خواندن راهنمای کوتاه' : 'Read the short guide'}</summary>
          <p>{fa ? 'پیش از انتخاب قطعه، مدل، تیپ و سال خودرو را مشخص کنید. نام قطعه و شماره فنی موجود روی آن را در کاتالوگ جست‌وجو کنید و اطلاعات سازگاری ثبت‌شده در صفحه محصول را بخوانید. اگر درباره تطابق مطمئن نیستید، پیش از خرید از پشتیبانی کمک بگیرید.' : 'Identify the vehicle model, trim and year before choosing a part. Search the catalogue using the part name and its reference number, then read the recorded fitment information on the product page. If you are unsure about compatibility, ask support before buying.'}</p>
        </details>
        <small>{fa ? 'مقاله‌ها و مجله‌های روز خودرو در مرحله بعد به این بخش اضافه می‌شوند.' : 'Current automotive articles and journal sources will be added in the next phase.'}</small>
      </article>

      <article className="titanium-float titanium-hub-card" aria-labelledby="hub-video-title">
        <div className="titanium-hub-cover" style={{ backgroundPosition: '0% 50%' }} aria-hidden><span className="titanium-hub-play"><Play size={22} /></span></div>
        <h3 id="hub-video-title">{fa ? 'ویدیوهای پربازدید خودرو' : 'Popular automotive videos'}</h3>
        <p>{fa ? 'آموزش، بررسی و تجربه‌های دنیای خودرو' : 'Learning, reviews and experiences from the automotive world'}</p>
        <p className="titanium-hub-status"><Clock3 size={15} aria-hidden />{fa ? 'در انتظار اتصال به آپارات' : 'Awaiting an Aparat connection'}</p>
        <button className="titanium-button titanium-hub-pending" type="button" disabled>{fa ? 'انتخاب ویدیو در مرحله بعد' : 'Video selection comes next'}</button>
        <small>{fa ? 'کاور نمایشی است. ویدیو، بازدید و رتبه‌بندی واقعی پس از اتصال منبع نمایش داده می‌شود.' : 'Illustrative cover. Actual videos, views and rankings will appear after a source is connected.'}</small>
      </article>
    </div>
  </section>;
}
