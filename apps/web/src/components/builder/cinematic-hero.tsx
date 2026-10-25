import type { BuilderBlock, BuilderFilm, CategoryView, SiteContentView } from '@hedax/contracts';
import { DEFAULT_BUILDER_FILM, localize } from '@hedax/contracts/constants';
import { preload } from 'react-dom';
import { CinematicFilm } from './cinematic-film';
import { CinematicTypewriter } from './cinematic-typewriter';
import { ShoppingPaths } from './shopping-paths';

const DEFAULT_LOGO = '/brand/source/logo-dark.png';

/**
 * Chapter 1 (the film) of the cinematic home page. The shopping paths below it are their own section
 * («مسیرهای خرید»); `discovery` keeps them under the film only for pages that have no such section.
 */
export function CinematicHero({ block: b, content, categories, locale, discovery = true }: { block: BuilderBlock; content: SiteContentView | null; categories: CategoryView[]; locale: string; discovery?: boolean }) {
  const fa = locale === 'fa';
  const secondaryTitle = fa ? b.title.en : b.title.en ? b.title.fa : '';
  const L = (v: Parameters<typeof localize>[0]) => localize(v, locale);
  const film: BuilderFilm = b.film ?? DEFAULT_BUILDER_FILM;
  const brand = content?.brand;
  preload('/fonts/hero/lalezar-arabic.woff2', { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
  preload('/fonts/hero/lalezar-latin.woff2', { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
  // The hero image is the page's LCP element: fetch it from <head>, one file per device (same choice as CinematicFilm).
  const first = film.playback === 'static' ? undefined : film.clips.find(c => c.active && (c.desktop || c.mobile));
  const lcpDesktop = first?.poster || b.imageUrl;
  const lcpMobile = (first ? first.mobilePoster || first.poster : '') || b.mobileImageUrl || lcpDesktop;
  if (lcpMobile) preload(lcpMobile, { as: 'image', fetchPriority: 'high', media: '(max-width: 639px)' });
  if (lcpDesktop) preload(lcpDesktop, { as: 'image', fetchPriority: 'high', media: '(min-width: 640px)' });

  return <><section className="cine" aria-labelledby={`${b.id}-title`}>
    <div className="cine-stage">
      <div className="cine-copy" data-assistant-avoid>
        <h1 id={`${b.id}-title`} className="cine-title" lang={fa ? 'fa' : 'en'} dir={fa ? 'rtl' : 'ltr'}><CinematicTypewriter key={L(b.title)} text={L(b.title)} delay={120} duration={1800} /></h1>
        {secondaryTitle ? <p className="cine-tagline" lang={fa ? 'en' : 'fa'} dir={fa ? 'ltr' : 'rtl'}><CinematicTypewriter key={secondaryTitle} text={secondaryTitle} delay={2070} duration={1200} /></p> : null}
      </div>
      <CinematicFilm film={film} still={b.imageUrl} mobileStill={b.mobileImageUrl} alt={L(b.alt)} logoUrl={film.logoUrl || brand?.logoUrl || DEFAULT_LOGO} logoAlt={L(brand?.logoAlt) || 'SOURCE by HEDAX'} locale={locale} />
    </div>

  </section>
    {film.discovery && discovery ? <ShoppingPaths categories={categories} locale={locale} /> : null}
  </>;
}
