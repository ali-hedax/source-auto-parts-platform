import type { BuilderBlock, BuilderFilm, CategoryView, SiteContentView } from '@hedax/contracts';
import { DEFAULT_BUILDER_FILM, localize } from '@hedax/contracts/constants';
import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import { preload } from 'react-dom';
import { Link } from '@/i18n/navigation';
import { CinematicFilm } from './cinematic-film';

const DEFAULT_LOGO = '/brand/source/logo-dark.png';

/**
 * Chapter 1 (the film) and chapter 2 (finding the part) of the cinematic home page.
 * Everything a shopper needs — search, vehicle, catalogue, sourcing — is plain server markup,
 * usable before (or without) the film and without client JavaScript.
 */
export function CinematicHero({ block: b, content, categories, locale }: { block: BuilderBlock; content: SiteContentView | null; categories: CategoryView[]; locale: string }) {
  const fa = locale === 'fa';
  const L = (v: Parameters<typeof localize>[0]) => localize(v, locale);
  const film: BuilderFilm = b.film ?? DEFAULT_BUILDER_FILM;
  const Arrow = fa ? ArrowLeft : ArrowRight;
  const name = (n: { fa: string; en: string | null }) => (fa ? n.fa : (n.en ?? n.fa));
  const digits = (n: number) => n.toLocaleString(fa ? 'fa-IR' : 'en-US');
  const brand = content?.brand;
  const paths = [
    { href: '/cars', title: fa ? 'خودروی من' : 'My vehicle', text: fa ? 'برند، مدل و سال خودرو را انتخاب کنید' : 'Pick the make, model and year' },
    { href: '/parts', title: fa ? 'کاتالوگ قطعات' : 'Parts catalogue', text: fa ? 'دسته‌بندی‌ها، برندها و سازنده‌ها' : 'Categories, brands and makers' },
    { href: '/request-part', title: fa ? 'درخواست تأمین' : 'Request a part', text: fa ? 'پیدا نشد؟ با شماره فنی یا VIN بسپارید' : 'Not listed? Send the number or VIN' },
  ];
  const top = categories.filter(c => !c.parentSlug).slice(0, 10);
  // The hero image is the page's LCP element: fetch it from <head>, one file per device (same choice as CinematicFilm).
  const first = film.playback === 'static' ? undefined : film.clips.find(c => c.active && (c.desktop || c.mobile));
  const lcpDesktop = first?.poster || b.imageUrl;
  const lcpMobile = (first ? first.mobilePoster || first.poster : '') || b.mobileImageUrl || lcpDesktop;
  if (lcpMobile) preload(lcpMobile, { as: 'image', fetchPriority: 'high', media: '(max-width: 639px)' });
  if (lcpDesktop) preload(lcpDesktop, { as: 'image', fetchPriority: 'high', media: '(min-width: 640px)' });

  return <section className="cine" aria-labelledby={`${b.id}-title`}>
    <div className="cine-stage">
      <div className="cine-copy" data-assistant-avoid>
        <p className="cine-eyebrow" dir="ltr">SOURCE <span>by</span> HEDAX</p>
        <h1 id={`${b.id}-title`} className="cine-title">{L(b.title)}</h1>
        {/* The saved body text (panel → film block → «متن») is kept but not shown for now, to keep the hero uncluttered. */}
        {/* The page's main search (the header's quick search hides on phones while this one is present). */}
        <form action={`/${locale}/parts`} method="get" role="search" className="cine-search">
          <label htmlFor="hero-search" className="sr-only">{fa ? 'نام قطعه، شماره فنی یا شماره OEM' : 'Part name, part number or OEM reference'}</label>
          <div className="cine-search-field">
            <Search aria-hidden size={20} />
            <input id="hero-search" name="q" type="search" autoComplete="off" enterKeyHint="search" placeholder={fa ? 'نام یا شماره قطعه' : 'Part name or number'} />
            <button type="submit"><Search aria-hidden size={18} />{fa ? 'جست‌وجوی قطعه' : 'Find a part'}</button>
          </div>
        </form>
        {b.href && L(b.button) ? <div className="cine-actions"><Link className="cine-cta cine-cta-ghost" href={b.href}>{L(b.button)}<Arrow aria-hidden size={18} /></Link></div> : null}
      </div>
      <CinematicFilm film={film} still={b.imageUrl} mobileStill={b.mobileImageUrl} alt={L(b.alt)} logoUrl={film.logoUrl || brand?.logoUrl || DEFAULT_LOGO} logoAlt={L(brand?.logoAlt) || 'SOURCE by HEDAX'} locale={locale} />
    </div>

    {film.discovery ? <div className="cine-discover">
      <div className="cine-discover-inner">
        <ol className="cine-paths">
          {paths.map((p, i) => <li key={p.href}><Link href={p.href}>
            <span className="cine-path-index" dir="ltr">{String(i + 1).padStart(2, '0')}</span>
            <span className="cine-path-text"><strong>{p.title}</strong><span>{p.text}</span></span>
            <Arrow aria-hidden size={18} className="cine-path-arrow" />
          </Link></li>)}
        </ol>
        {top.length ? <nav className="cine-categories" aria-label={fa ? 'دسته‌بندی قطعات' : 'Part categories'}>
          <ul>{top.map(c => <li key={c.slug}><Link href={`/parts?category=${encodeURIComponent(c.slug)}`}>{name(c.name)}{c.productCount ? <span className="num">{digits(c.productCount)}</span> : null}</Link></li>)}</ul>
        </nav> : null}
      </div>
    </div> : null}
  </section>;
}
