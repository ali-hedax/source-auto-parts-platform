import type { BuilderDocument } from '@hedax/contracts';
import { localize } from '@hedax/contracts/constants';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, CarFront, ClipboardList } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { BuilderView } from '@/components/builder/view';
import type { BuilderData } from '@/components/builder/data';
import { LegacyHomeView } from '@/components/builder/legacy-home';
import { MakersHomeSection } from '@/components/catalog/makers-home';
import '@/components/builder/vehicle-finder.css';
import { VehicleFinderSteps } from '@/components/catalog/vehicle-finder-steps';
import { CinematicFilm } from '@/components/builder/cinematic-film';
import { AutomotiveHub } from './automotive-hub';
import { RepeatingSlogan } from './repeating-slogan';
import { titaniumConfig, TITANIUM_CONFIG_ID } from './titanium-config';
import type { CSSProperties } from 'react';
import { CinematicBanner } from '@/components/builder/cinematic-banner';

/** Approved titanium composition; catalogue and published CMS collections remain authoritative. */
export function TitaniumHome({ document, data, locale }: { document: BuilderDocument | null; data: BuilderData; locale: string }) {
  const fa = locale === 'fa';
  const config = titaniumConfig(document);
  const sourcing = config?.items[9];
  const Arrow = fa ? ArrowLeft : ArrowRight;
  const groups = [
    { code: 'FILTER', slug: 'filters', fa: 'لوازم مصرفی', en: 'Service & consumables', query: 'فیلتر', queryEn: 'filter', sheet: 'path-parts.webp', position: 0 },
    { code: 'SUSPENSION', slug: 'suspension', fa: 'جلوبندی و تعلیق', en: 'Steering & suspension', query: 'تعلیق', queryEn: 'suspension', sheet: 'path-parts.webp', position: 50 },
    { code: 'ENGINE', slug: 'engine', fa: 'موتور و انتقال قدرت', en: 'Engine & drivetrain', query: 'موتور', queryEn: 'engine', sheet: 'path-parts.webp', position: 100 },
    { code: 'ELECTRICAL', slug: 'electrical', fa: 'روشنایی و برق خودرو', en: 'Lighting & electrical', query: 'چراغ', queryEn: 'headlamp', sheet: 'path-extras.webp', position: 100 },
    { code: 'BODY', slug: 'body', fa: 'بدنه و قطعات بیرونی', en: 'Body & exterior', query: 'بدنه', queryEn: 'body', sheet: 'path-extras.webp', position: 50 },
    { code: 'ACCESSORIES', slug: 'accessories', fa: 'آپشن و تجهیزات جانبی', en: 'Upgrades & accessories', query: 'آپشن', queryEn: 'accessories', sheet: 'path-extras.webp', position: 0 },
  ];
  const paths = groups.map((g, i) => {
    const item = config?.items[i];
    const category = data.categories.find(c => c.code === g.code || c.slug === g.slug);
    return { ...g, image: item?.imageUrl, alt: localize(item?.alt, locale), text: localize(item?.text, locale), visible: item?.visible !== false, href: item?.href || (category ? `/parts?category=${encodeURIComponent(category.slug)}` : `/parts?q=${encodeURIComponent(fa ? g.query : g.queryEn)}`), title: localize(item?.title, locale) || (fa ? g.fa : g.en) };
  });
  const opening = document?.sections.find(b => b.kind === 'cinematic-hero' && b.style.template !== 'compact' && b.visible && (!b.startsAt || Date.parse(b.startsAt) <= data.now) && (!b.endsAt || Date.parse(b.endsAt) > data.now));
  const hasNewProducts = document?.sections.some(b => b.kind === 'new-products' && b.visible && (!b.startsAt || Date.parse(b.startsAt) <= data.now) && (!b.endsAt || Date.parse(b.endsAt) > data.now));
  // The new collection replaces the older duplicate in-stock list; no CMS data is mutated.
  const collections = document ? { ...document, sections: document.sections.filter(b => b.id !== TITANIUM_CONFIG_ID && !['hero', 'cinematic-hero', 'vehicle-finder', 'shopping-paths'].includes(b.kind) && !(b.kind === 'legacy' && (b.legacy?.type === 'hero' || (hasNewProducts && b.legacy?.type === 'featured')))) } : null;
  const brandsIndex = collections?.sections.findIndex(b => b.visible && (b.kind === 'brands' || (b.kind === 'legacy' && b.legacy?.type === 'brands'))) ?? -1;
  const faqIndex = collections?.sections.findIndex(b => b.kind === 'legacy' && b.legacy?.type === 'faq') ?? -1;
  const hubAfter = brandsIndex >= 0 ? brandsIndex + 1 : faqIndex >= 0 ? faqIndex : collections?.sections.length ?? 0;
  const finder = document?.sections.find(b => b.kind === 'vehicle-finder');
  const categories = data.categories.filter(c => !c.parentSlug);
  return <div className="titanium-home" style={{ '--ti-opening-height': `${config?.style.desktop?.height ?? 420}px`, '--ti-opening-mobile-height': `${config?.style.mobile?.height ?? 240}px` } as CSSProperties}>
    {opening?.film ? <section className="titanium-opening-film" aria-label={fa ? 'فیلم معرفی سورس' : 'Source opening film'} data-assistant-avoid>
      <CinematicFilm film={{ ...opening.film, playback: opening.film.playback === 'static' ? 'static' : 'loop', discovery: false }} still={opening.imageUrl} mobileStill={opening.mobileImageUrl} alt={localize(opening.alt, locale)} logoUrl="" logoAlt="" locale={locale} />
    </section> : null}
    <section className="container-page titanium-hero titanium-slogan-only" aria-labelledby="titanium-hero-title">
      <RepeatingSlogan locale={locale} {...(config ? { title: localize(config.title, locale), subtitle: localize(config.body, locale), tagline: config.button.en } : {})} />
    </section>

    {finder?.visible !== false ? <section id="vehicle-finder" className="container-page titanium-finder-section" aria-labelledby="titanium-finder-title">
      <div className="titanium-float titanium-finder-panel">
        <h2 id="titanium-finder-title"><CarFront aria-hidden size={24} />{localize(finder?.title, locale) || (fa ? 'انتخاب خودرو' : 'Choose your vehicle')}</h2>
        <p>{localize(finder?.body, locale) || (fa ? 'خودرو و مدل را انتخاب کنید تا قطعات مناسب را ببینید.' : 'Select your vehicle and model to find compatible parts.')}</p>
        <VehicleFinderSteps groups={data.finderGroups} locale={fa ? 'fa' : 'en'} buttonLabel={localize(finder?.button, locale) || (fa ? 'نمایش قطعات خودرو' : 'Show parts for this vehicle')} requestHref={finder?.href || `/${locale}/request-part`} />
      </div>
    </section> : null}

    <section id="shopping-paths" className="container-page titanium-paths" aria-labelledby="titanium-paths-title">
      <div className="titanium-section-heading"><div><h2 id="titanium-paths-title">{fa ? 'مسیرهای خرید' : 'Find your way to the right part'}</h2><p>{fa ? 'از شناخت خودرو تا پیدا کردن قطعه؛ مسیر خودتان را انتخاب کنید.' : 'From knowing your vehicle to finding your part: choose your route.'}</p></div></div>
      <div className="titanium-path-grid">{paths.filter(p => p.visible).map(p => <Link key={p.code} href={p.href} className="titanium-float titanium-path">
        <span role="img" aria-label={p.alt || p.title} className="titanium-path-art titanium-path-illustration" style={{ backgroundImage: `url(${p.image || `/brand/source/titanium/${p.sheet}`})`, backgroundPosition: p.image ? 'center' : `${p.position}% 50%`, ...(p.image ? { backgroundSize: 'contain', backgroundRepeat: 'no-repeat' } : {}) }} />
        <div className="titanium-path-copy"><h3>{p.title}</h3><p>{p.text || (fa ? 'مشاهده قطعات این گروه' : 'Explore parts in this category')}</p><span className="titanium-path-arrow"><Arrow aria-hidden size={19} /></span></div>
      </Link>)}</div>
      {categories.length ? <nav className="titanium-category-links" aria-label={fa ? 'دسته‌بندی قطعات' : 'Part categories'}>{categories.map(c => <Link href={`/parts?category=${encodeURIComponent(c.slug)}`} key={c.slug}>{(fa ? c.name.fa : c.name.en || c.name.fa)}</Link>)}</nav> : null}
    </section>

    <div className="titanium-collections">
      {collections ? <>
        <BuilderView document={{ ...collections, sections: collections.sections.slice(0, hubAfter) }} data={data} locale={locale} />
        <AutomotiveHub locale={locale} {...(config ? { items: config.items.slice(6, 9) } : {})} />
        <BuilderView document={{ ...collections, sections: collections.sections.slice(hubAfter) }} data={data} locale={locale} />
      </> : <>
        <LegacyHomeView {...data} content={{ ...data.content!, home: { sections: data.content!.home.sections.filter(s => s.type !== 'hero' && s.type !== 'faq') } }} locale={locale} />
        <MakersHomeSection makers={data.makers} />
        <AutomotiveHub locale={locale} {...(config ? { items: config.items.slice(6, 9) } : {})} />
        <LegacyHomeView {...data} content={{ ...data.content!, home: { sections: data.content!.home.sections.filter(s => s.type === 'faq') } }} locale={locale} />
      </>}
    </div>

    {sourcing?.visible !== false ? <section className="container-page titanium-sourcing titanium-sourcing-compact" aria-labelledby="titanium-sourcing-title">
      <div className="titanium-sourcing-copy"><h2 id="titanium-sourcing-title">{localize(sourcing?.title, locale) || (fa ? 'قطعه‌تان را پیدا نکردید؟' : 'Can’t find your part?')}</h2><p>{localize(sourcing?.text, locale) || (fa ? 'پیدا کردنش را به سورس بسپارید.' : 'Let Source help you find it.')}</p><Link className="titanium-button" href={sourcing?.href || '/request-part'}><ClipboardList aria-hidden size={18} />{fa ? 'درخواست تأمین قطعه' : 'Request a part'}</Link></div>
      <Image className="titanium-sourcing-art" src={sourcing?.imageUrl || '/brand/source/titanium/sourcing-box.webp'} width={1448} height={1086} unoptimized alt={localize(sourcing?.alt, locale) || (fa ? 'جعبه سورس با قطعات خودرو' : 'Source box with automotive parts')} />
    </section> : null}

    {document?.sections.filter(b => b.kind === 'cinematic-hero' && b.style.template === 'compact' && b.visible && (!b.startsAt || Date.parse(b.startsAt) <= data.now) && (!b.endsAt || Date.parse(b.endsAt) > data.now)).map(b => <div key={b.id} className="titanium-closing-film" data-assistant-avoid>
      <CinematicBanner block={b} locale={locale} />
    </div>)}


  </div>;
}
