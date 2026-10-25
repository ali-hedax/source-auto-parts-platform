import type { BuilderBlock, BuilderFilm, CategoryView, SiteContentView } from '@hedax/contracts';
import { DEFAULT_BUILDER_FILM, localize } from '@hedax/contracts/constants';
import { ArrowLeft, ArrowRight, CarFront, Boxes, PackageSearch } from 'lucide-react';
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
  const secondaryTitle = fa ? b.title.en : b.title.en ? b.title.fa : '';
  const L = (v: Parameters<typeof localize>[0]) => localize(v, locale);
  const film: BuilderFilm = b.film ?? DEFAULT_BUILDER_FILM;
  const Arrow = fa ? ArrowLeft : ArrowRight;
  const name = (n: { fa: string; en: string | null }) => (fa ? n.fa : (n.en ?? n.fa));
  const digits = (n: number) => n.toLocaleString(fa ? 'fa-IR' : 'en-US');
  const brand = content?.brand;
  preload('/fonts/hero/lalezar-arabic.woff2', { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
  preload('/fonts/hero/lalezar-latin.woff2', { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
  const paths = [
    { href: '/cars', icon: CarFront, title: fa ? 'خودروی من' : 'My vehicle', text: fa ? 'قطعه‌ای که به خودروی شما می‌خورد' : 'Parts that fit your vehicle' },
    { href: '/parts', icon: Boxes, title: fa ? 'کاتالوگ قطعات' : 'Parts catalogue', text: fa ? 'از شماره فنی تا قطعهٔ مورد نیازتان' : 'From a part number to the part you need' },
    { href: '/request-part', icon: PackageSearch, title: fa ? 'درخواست تأمین' : 'Request a part', text: fa ? 'قطعه‌تان را پیدا نکردید؟ به ما بسپارید' : 'Can’t find your part? Leave it with us' },
  ];
  const top = categories.filter(c => !c.parentSlug).slice(0, 10);
  // The hero image is the page's LCP element: fetch it from <head>, one file per device (same choice as CinematicFilm).
  const first = film.playback === 'static' ? undefined : film.clips.find(c => c.active && (c.desktop || c.mobile));
  const lcpDesktop = first?.poster || b.imageUrl;
  const lcpMobile = (first ? first.mobilePoster || first.poster : '') || b.mobileImageUrl || lcpDesktop;
  if (lcpMobile) preload(lcpMobile, { as: 'image', fetchPriority: 'high', media: '(max-width: 639px)' });
  if (lcpDesktop) preload(lcpDesktop, { as: 'image', fetchPriority: 'high', media: '(min-width: 640px)' });

  return <><section className="cine" aria-labelledby={`${b.id}-title`}>
    <div className="cine-stage">
      <div className="cine-copy" data-assistant-avoid>
        <h1 id={`${b.id}-title`} className="cine-title" lang={fa ? 'fa' : 'en'} dir={fa ? 'rtl' : 'ltr'}>{L(b.title)}</h1>
        {secondaryTitle ? <p className="cine-tagline" lang={fa ? 'en' : 'fa'} dir={fa ? 'ltr' : 'rtl'}>{secondaryTitle}</p> : null}
      </div>
      <CinematicFilm film={film} still={b.imageUrl} mobileStill={b.mobileImageUrl} alt={L(b.alt)} logoUrl={film.logoUrl || brand?.logoUrl || DEFAULT_LOGO} logoAlt={L(brand?.logoAlt) || 'SOURCE by HEDAX'} locale={locale} />
    </div>

  </section>
    {film.discovery ? <section className="cine-discover" aria-label={fa ? 'مسیرهای خرید قطعه' : 'Find your way to the right part'}>
      <div className="cine-discover-inner">
        <ul className="cine-paths">
          {paths.map(p => <li key={p.href}><Link href={p.href}>
            <span className="cine-path-icon"><p.icon aria-hidden size={28} strokeWidth={1.6} /></span>
            <span className="cine-path-text"><strong>{p.title}</strong><span>{p.text}</span></span>
            <Arrow aria-hidden size={18} className="cine-path-arrow" />
          </Link></li>)}
        </ul>
        {top.length ? <nav className="cine-categories" aria-label={fa ? 'دسته‌بندی قطعات' : 'Part categories'}>
          <ul>{top.map(c => <li key={c.slug}><Link href={`/parts?category=${encodeURIComponent(c.slug)}`}>{name(c.name)}{c.productCount ? <span className="num">{digits(c.productCount)}</span> : null}</Link></li>)}</ul>
        </nav> : null}
      </div>
    </section> : null}
  </>;
}
