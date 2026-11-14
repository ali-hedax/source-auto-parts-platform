import type { BuilderDocument, CategoryView } from '@hedax/contracts';
import './source-ui.css';
import { localize } from '@hedax/contracts/constants';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, Car, ClipboardList, Cog, Cpu, Eye, Gauge, Lightbulb, Link2, Package, Plus, Shield, Wrench, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { BuilderView } from '@/components/builder/view';
import type { BuilderData } from '@/components/builder/data';
import { CinematicBanner } from '@/components/builder/cinematic-banner';
import { PartCard } from '@/components/catalog/part-card';
import { VehicleSteps } from '@/components/catalog/vehicle-steps';
import { RichText } from '@/components/content/rich-text';
import { PartSearch } from './part-search';
import { titaniumConfig, TITANIUM_CONFIG_ID, ATELIER_ASSETS, newTitaniumConfig, defaultAtelierClosing } from './titanium-config';

/** A plain line icon for a category, guessed from its name (a generic box otherwise). */
function categoryIcon(c: CategoryView): LucideIcon {
  const n = `${c.name.fa} ${c.name.en ?? ''} ${c.code}`;
  if (/چراغ|روشنایی|light|lamp/i.test(n)) return Lightbulb;
  if (/آینه|mirror/i.test(n)) return Eye;
  if (/برق|electr/i.test(n)) return Zap;
  if (/سنسور|sensor/i.test(n)) return Cpu;
  if (/موتور|engine/i.test(n)) return Cog;
  if (/تسمه|belt|chain/i.test(n)) return Link2;
  if (/ایمنی|safety|protect/i.test(n)) return Shield;
  if (/بدنه|تزئین|body|trim/i.test(n)) return Car;
  if (/ترمز|brake|تعلیق|جلوبندی|suspension/i.test(n)) return Wrench;
  if (/داشبورد|گیج|dash|gauge/i.test(n)) return Gauge;
  return Package;
}

/**
 * The home page (owner layout, 2026-11): hero with one title and the large part search, the
 * three-step vehicle choice, every category and every brand with its part count, the newest parts,
 * the sourcing band, «فراتر از یک قطعه», questions and the closing film. Texts, images and lists
 * come from the panel (Appearance and site content) and the catalogue; built-in text is only a fallback.
 */
export function SourceHome({ document, data, locale }: { document: BuilderDocument | null; data: BuilderData; locale: string }) {
  const fa = locale === 'fa';
  const t = useTranslations();
  const L = (v: { fa: string; en: string } | null | undefined) => localize(v, locale);
  const config = titaniumConfig(document);
  const defaults = newTitaniumConfig();
  const copy = (i: number) => config?.items[i] ?? defaults.items[i]!;
  const Arrow = fa ? ArrowLeft : ArrowRight;
  // The built-in artwork is replaced by its full-size version; an image uploaded in the panel wins.
  const useDefaultHero = !config?.imageUrl || config.imageUrl === `${ATELIER_ASSETS}/hero.webp`;
  const heroImage = useDefaultHero ? defaults.imageUrl : config.imageUrl;
  const heroAlt = L(useDefaultHero ? defaults.alt : config.alt) || L(defaults.alt);
  const heroTitle = [L(config?.title ?? defaults.title), L(config?.body ?? defaults.body)].filter(Boolean).join(fa ? '، ' : ', ');
  const heroLede = L(data.content?.seo.defaultDescription) || (fa ? 'قطعهٔ موجود را بخرید یا برای هر برند درخواست تأمین بدهید.' : 'Buy in-stock parts or request any part for any brand.');

  const finder = document?.sections.find((b) => b.kind === 'vehicle-finder');
  const newBlock = document?.sections.find((b) => b.kind === 'new-products' && b.visible && (!b.startsAt || Date.parse(b.startsAt) <= data.now) && (!b.endsAt || Date.parse(b.endsAt) > data.now));
  const newest = (newBlock ? data.products[newBlock.id] : data.featured?.items) ?? [];
  const sourcing = config?.items[9];
  const hub = config?.items.slice(6, 9);
  const faqBlock = document?.sections.find((b) => b.kind === 'legacy' && b.legacy?.type === 'faq');
  const closing = document?.sections.filter((b) => b.kind === 'cinematic-hero' && b.style.template === 'compact') ?? [];
  const closingBlocks = (closing.length ? closing : [defaultAtelierClosing()]).filter((b) => b.visible && (!b.startsAt || Date.parse(b.startsAt) <= data.now) && (!b.endsAt || Date.parse(b.endsAt) > data.now));
  // Blocks added in Appearance that this layout has no fixed place for keep showing, after the new parts.
  const covered = (b: BuilderDocument['sections'][number]) => b.id === TITANIUM_CONFIG_ID || ['hero', 'cinematic-hero', 'vehicle-finder', 'shopping-paths', 'makers', 'new-products', 'brands'].includes(b.kind)
    || (b.kind === 'legacy' && ['hero', 'faq', 'brands', 'featured'].includes(b.legacy?.type ?? ''));
  const extra = document ? document.sections.filter((b) => b.visible && !covered(b)) : [];

  const faq = [...(data.content?.faq ?? []).map((f) => ({ id: f.id, q: L(f.question), a: L(f.answer), href: '' }))];
  const has = (re: RegExp) => faq.some((f) => re.test(f.q));
  if (fa && !has(/ارسال.*(طول|زمان)|چقدر.*ارسال/)) faq.push({ id: 'shipping-time', q: 'ارسال چقدر طول می‌کشد؟', a: 'سفارش کالای موجود حداکثر ۱ تا ۲ روز کاری پس از تأیید پرداخت به تیپاکس تحویل داده می‌شود. رسیدن مرسوله معمولاً برای مرکز استان‌ها ۱ تا ۳ روز کاری و برای شهرهای کوچک‌تر ۳ تا ۵ روز کاری طول می‌کشد.', href: '/help/shipping' });
  if (fa && !has(/مرجوع/)) faq.push({ id: 'returns', q: 'شرایط مرجوعی چیست؟', a: 'تا ۷ روز کاری پس از تحویل می‌توانید بدون ذکر دلیل از خرید انصراف دهید؛ کالا باید نصب‌نشده، سالم و با بسته‌بندی کامل بازگردانده شود. هزینهٔ بازگرداندن کالای معیوب یا مغایر با سفارش بر عهدهٔ سورس است.', href: '/help/returns' });
  if (!fa && !has(/deliver|shipping/i)) faq.push({ id: 'shipping-time', q: 'How long does delivery take?', a: 'In-stock orders are handed to Tipax within 1–2 working days of payment; delivery usually takes 1–3 working days to provincial capitals and 3–5 to smaller towns.', href: '/help/shipping' });
  if (!fa && !has(/return/i)) faq.push({ id: 'returns', q: 'What is the return policy?', a: 'You can withdraw within 7 working days of delivery without giving a reason, as long as the part is uninstalled, undamaged and in its packaging. Faulty or wrong items are returned at Source’s cost.', href: '/help/returns' });

  return <div className="su-home">
    <section className="su-hero" aria-labelledby="hero-title">
      <div className="su-hero-media"><Image src={heroImage} alt={heroAlt} fill preload quality={75} sizes="(min-width: 1920px) 100vw, (min-width: 640px) 1920px, 100vw" /></div>
      <div className="container-page su-hero-inner">
        <div className="su-hero-copy">
          <h1 id="hero-title">{heroTitle}</h1>
          <p>{heroLede}</p>
          <PartSearch locale={fa ? 'fa' : 'en'} variant="hero" idPrefix="quick-search" />
        </div>
      </div>
    </section>

    {finder?.visible !== false ? <section id="vehicle-finder" className="container-page su-section su-finder" aria-labelledby="finder-title">
      <div className="su-section-head"><h2 id="finder-title">{L(finder?.title) || (fa ? 'انتخاب خودرو' : 'Choose your vehicle')}</h2></div>
      <VehicleSteps mode="form" groups={data.finderGroups} locale={fa ? 'fa' : 'en'} buttonLabel={fa ? 'نمایش قطعات' : 'Show parts'} idPrefix="home-vehicle" />
    </section> : null}

    <section className="container-page su-section" aria-labelledby="categories-title">
      <div className="su-section-head"><h2 id="categories-title">{fa ? 'دسته‌بندی قطعات' : 'Part categories'}</h2><Link href="/parts" className="su-link">{t('nav.parts')}<Arrow aria-hidden size={16} /></Link></div>
      <ul className="su-category-grid">
        {data.categories.filter((c) => !c.parentSlug).map((c) => {
          const Icon = categoryIcon(c);
          return <li key={c.slug}><Link href={`/parts?category=${encodeURIComponent(c.slug)}`} className="su-category">
            <span className="su-category-icon" aria-hidden><Icon size={22} /></span>
            <span className="su-category-name">{fa ? c.name.fa : c.name.en || c.name.fa}</span>
            <span className="su-category-count">{t('common.partCount', { count: c.productCount })}</span>
          </Link></li>;
        })}
      </ul>
    </section>

    <section className="container-page su-section" aria-labelledby="new-title">
      <div className="su-section-head"><h2 id="new-title">{L(copy(17).title) || (fa ? 'تازه‌های سورس' : 'New to Source')}</h2><Link href="/parts?sort=newest" className="su-link">{fa ? 'همهٔ قطعات' : 'All parts'}<Arrow aria-hidden size={16} /></Link></div>
      {newest.length ? <ul className="su-card-grid su-card-grid-5">{newest.map((p, i) => <li key={p.id}><PartCard product={p} priority={i < 2} /></li>)}</ul>
        : <p className="su-muted">{fa ? 'در حال حاضر قطعهٔ تازه‌ای ثبت نشده است.' : 'No new parts yet.'}</p>}
    </section>

    {extra.length ? <div className="su-extra"><BuilderView document={{ ...document!, sections: extra }} data={data} locale={locale} /></div> : null}

    <section className="container-page su-section" aria-labelledby="brands-title">
      <div className="su-section-head"><h2 id="brands-title">{t('nav.brands')}</h2><Link href="/brands" className="su-link">{fa ? 'همهٔ برندها' : 'All brands'}<Arrow aria-hidden size={16} /></Link></div>
      <ul className="su-brand-grid">
        {data.brands.map((b) => {
          const logo = b.logoUrl || data.logos[b.slug] || null;
          return <li key={b.slug}><Link href={`/brands/${b.slug}`} className="su-brand">
            <span className="su-brand-logo">{logo ? <img src={logo} alt="" width={96} height={96} loading="lazy" decoding="async" /> : <span aria-hidden>{(fa ? b.name.fa : b.name.en || b.name.fa).slice(0, 1)}</span>}</span>
            <span className="su-brand-name">{fa ? b.name.fa : b.name.en || b.name.fa}</span>
            <span className="su-brand-count">{t('common.partCount', { count: b.productCount })}</span>
          </Link></li>;
        })}
      </ul>
    </section>

    {sourcing?.visible !== false ? <section className="su-sourcing" aria-labelledby="sourcing-title">
      <div className="container-page su-sourcing-inner">
        <div>
          <h2 id="sourcing-title">{L(sourcing?.title) || (fa ? 'قطعه‌تان را پیدا نکردید؟' : 'Can’t find your part?')}</h2>
          <p>{L(sourcing?.text) || (fa ? 'پیدا کردنش را به سورس بسپارید.' : 'Let Source find it for you.')}</p>
          <p className="su-sourcing-free">{fa ? 'بدون ثبت‌نام، بدون هزینه' : 'No sign-up, no fee'}</p>
        </div>
        <Link className="su-btn su-btn-primary su-btn-lg" href={sourcing?.href || '/request-part'}><ClipboardList aria-hidden size={20} />{t('nav.requestPart')}</Link>
      </div>
    </section> : null}

    <section className="container-page su-section" aria-labelledby="hub-title">
      <div className="su-section-head"><h2 id="hub-title">{L(copy(19).title) || (fa ? 'فراتر از یک قطعه' : 'Beyond the part')}</h2></div>
      <ul className="su-hub-grid">
        {[0, 1, 2].map((i) => {
          const item = hub?.[i] ?? defaults.items[6 + i]!;
          if (item.visible === false) return null;
          const soon = i !== 1;
          return <li key={i} className="su-hub-card">
            <span className="su-hub-cover"><Image src={item.imageUrl || `${ATELIER_ASSETS}/hub-${i}.webp`} alt={L(item.alt) || L(item.title)} fill sizes="(max-width: 800px) 90vw, 30vw" /></span>
            <div className="su-hub-body">
              <h3>{L(item.title) || L(defaults.items[6 + i]!.title)}</h3>
              <p>{L(item.text) || L(defaults.items[6 + i]!.text)}</p>
              {soon ? <span className="su-chip su-chip-muted">{fa ? 'به‌زودی' : 'Coming soon'}</span>
                : <details className="su-hub-more"><summary>{fa ? 'خواندن راهنمای کوتاه' : 'Read the short guide'}</summary><p>{fa ? 'پیش از انتخاب قطعه، مدل، تیپ و سال خودرو را مشخص کنید. نام قطعه و شماره فنی موجود روی آن را در کاتالوگ جست‌وجو کنید و اطلاعات سازگاری ثبت‌شده در صفحه محصول را بخوانید. اگر درباره تطابق مطمئن نیستید، پیش از خرید از پشتیبانی کمک بگیرید.' : 'Identify the vehicle model, trim and year before choosing a part. Search the catalogue using the part name and its reference number, then read the recorded fitment on the product page. If you are unsure, ask support before buying.'}</p></details>}
            </div>
          </li>;
        })}
      </ul>
    </section>

    {faq.length && faqBlock?.visible !== false ? <section className="container-page su-section su-faq" aria-labelledby="faq-title">
      <div className="su-section-head"><h2 id="faq-title">{L(faqBlock?.title) || (fa ? 'پرسش‌های متداول' : 'Frequently asked questions')}</h2></div>
      <div className="su-faq-list">
        {faq.map((f) => <details key={f.id}>
          <summary>{f.q}<Plus aria-hidden size={18} /></summary>
          <div className="su-faq-answer"><RichText text={f.a} />{f.href ? <Link href={f.href} className="su-link">{fa ? 'متن کامل' : 'Read more'}<Arrow aria-hidden size={16} /></Link> : null}</div>
        </details>)}
      </div>
    </section> : null}

    {closingBlocks.map((b) => <div key={b.id} className="titanium-closing-film su-closing" data-assistant-avoid><CinematicBanner block={b} locale={locale} /></div>)}
  </div>;
}
