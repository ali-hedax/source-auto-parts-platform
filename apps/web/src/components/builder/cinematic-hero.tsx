import type { BuilderBlock, BuilderFilm, CategoryView, SiteContentView } from '@hedax/contracts';
import { DEFAULT_BUILDER_FILM, localize } from '@hedax/contracts/constants';
import { ArrowDown, ArrowLeft, ArrowRight, Search } from 'lucide-react';
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
  const still = b.imageUrl || film.poster;
  const searchId = `discover-${b.id}`;
  const paths = [
    { href: '/cars', title: fa ? 'خودروی من' : 'My vehicle', text: fa ? 'برند، مدل و سال خودرو را انتخاب کنید' : 'Pick the make, model and year' },
    { href: '/parts', title: fa ? 'کاتالوگ قطعات' : 'Parts catalogue', text: fa ? 'دسته‌بندی‌ها، برندها و سازنده‌ها' : 'Categories, brands and makers' },
    { href: '/request-part', title: fa ? 'درخواست تأمین' : 'Request a part', text: fa ? 'پیدا نشد؟ با شماره فنی یا VIN بسپارید' : 'Not listed? Send the number or VIN' },
  ];
  const top = categories.filter(c => !c.parentSlug).slice(0, 10);

  return <section className="cine" aria-labelledby={`${b.id}-title`}>
    <div className="cine-stage">
      <div className="cine-copy">
        <p className="cine-eyebrow" dir="ltr">SOURCE <span>by</span> HEDAX</p>
        <h1 id={`${b.id}-title`} className="cine-title">{L(b.title)}</h1>
        {L(b.body) ? <p className="cine-lede">{L(b.body)}</p> : null}
        <div className="cine-actions">
          {film.discovery ? <a className="cine-cta cine-cta-primary" href={`#${searchId}`}><Search aria-hidden size={18} />{fa ? 'جست‌وجوی قطعه' : 'Find a part'}</a> : null}
          {b.href && L(b.button) ? <Link className="cine-cta cine-cta-ghost" href={b.href}>{L(b.button)}<Arrow aria-hidden size={18} /></Link> : null}
        </div>
      </div>
      <CinematicFilm film={film} still={still} mobileStill={b.mobileImageUrl || film.mobilePoster || still} alt={L(b.alt)} logoUrl={brand?.logoUrl || DEFAULT_LOGO} logoAlt={L(brand?.logoAlt) || 'SOURCE by HEDAX'} locale={locale} />
    </div>
    {film.discovery ? <a className="cine-scroll" href={`#${searchId}`}><span>{fa ? 'شروع جست‌وجو' : 'Start searching'}</span><ArrowDown aria-hidden size={16} /></a> : null}

    {film.discovery ? <div className="cine-discover">
      <div className="cine-discover-inner">
        <form action={`/${locale}/parts`} method="get" role="search" className="cine-search">
          <label htmlFor={searchId} className="cine-search-label">{fa ? 'نام قطعه، شماره فنی یا شماره OEM' : 'Part name, part number or OEM reference'}</label>
          <div className="cine-search-field">
            <Search aria-hidden size={22} />
            <input id={searchId} name="q" type="search" autoComplete="off" enterKeyHint="search" placeholder={fa ? 'مثلاً لنت ترمز جلو یا 1240100901' : 'e.g. front brake pads or 1240100901'} />
            <button type="submit">{fa ? 'جست‌وجو' : 'Search'}</button>
          </div>
        </form>
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
