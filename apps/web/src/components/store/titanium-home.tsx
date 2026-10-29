import type { BuilderDocument } from '@hedax/contracts';
import { localize } from '@hedax/contracts/constants';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, ClipboardList } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { BuilderView } from '@/components/builder/view';
import type { BuilderData } from '@/components/builder/data';
import { LegacyHomeView } from '@/components/builder/legacy-home';
import '@/components/builder/vehicle-finder.css';
import { VehicleFinderSteps } from '@/components/catalog/vehicle-finder-steps';
import { CinematicFilm } from '@/components/builder/cinematic-film';
import { AutomotiveHub } from './automotive-hub';
import { RepeatingSlogan } from './repeating-slogan';
import { titaniumConfig, TITANIUM_CONFIG_ID, ATELIER_ASSETS, ATELIER_BRANDS, newTitaniumConfig, defaultAtelierClosing } from './titanium-config';
import type { CSSProperties } from 'react';
import { CinematicBanner } from '@/components/builder/cinematic-banner';
import { QuickSearch } from './quick-search';

/** Approved titanium composition; catalogue and published CMS collections remain authoritative. */
export function TitaniumHome({ document, data, locale }: { document: BuilderDocument | null; data: BuilderData; locale: string }) {
  const fa = locale === 'fa';
  const config = titaniumConfig(document);
  const defaults = newTitaniumConfig();
  const copy = (i: number) => config?.items[i] ?? defaults.items[i]!;
  const sourcing = config?.items[9];
  const artwork = Object.fromEntries(ATELIER_BRANDS.map((slug, i) => [slug, config?.items[10 + i]?.imageUrl || `${ATELIER_ASSETS}/brand-${slug}.webp`]));
  const visibleBrands = data.brands.filter(brand => { const i = ATELIER_BRANDS.findIndex(slug => slug === brand.slug); return i < 0 || config?.items[10 + i]?.visible !== false; });
  const viewData = { ...data, brands: visibleBrands, brandArtwork: artwork, otherBrand: copy(14), homeCopy: Object.fromEntries(['finder', 'paths', 'products', 'brands', 'hub'].map((key, i) => [key, { title: localize(copy(15 + i).title, locale), subtitle: copy(15 + i).text.en || ['Made for your vehicle.', 'Explore the essentials', 'New to the collection', 'The marques we carry', 'The automotive journal'][i]! }])) };
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
    return { ...g, image: item?.imageUrl || `${ATELIER_ASSETS}/category-${i}.webp`, alt: localize(item?.alt, locale), text: localize(item?.text, locale), visible: item?.visible !== false, href: item?.href || (category ? `/parts?category=${encodeURIComponent(category.slug)}` : `/parts?q=${encodeURIComponent(fa ? g.query : g.queryEn)}`), title: localize(item?.title, locale) || (fa ? g.fa : g.en) };
  });
  const opening = document?.sections.find(b => b.kind === 'cinematic-hero' && b.style.template !== 'compact' && b.visible && (!b.startsAt || Date.parse(b.startsAt) <= data.now) && (!b.endsAt || Date.parse(b.endsAt) > data.now));
  const hasNewProducts = document?.sections.some(b => b.kind === 'new-products' && b.visible && (!b.startsAt || Date.parse(b.startsAt) <= data.now) && (!b.endsAt || Date.parse(b.endsAt) > data.now));
  // The new collection replaces the older duplicate in-stock list; no CMS data is mutated.
  const collections = document ? { ...document, sections: document.sections.filter(b => b.id !== TITANIUM_CONFIG_ID && b.kind !== 'makers' && !['hero', 'cinematic-hero', 'vehicle-finder', 'shopping-paths'].includes(b.kind) && !(b.kind === 'legacy' && (b.legacy?.type === 'hero' || (hasNewProducts && b.legacy?.type === 'featured')))) } : null;
  const brandsIndex = collections?.sections.findIndex(b => b.visible && (b.kind === 'brands' || (b.kind === 'legacy' && b.legacy?.type === 'brands'))) ?? -1;
  const faqIndex = collections?.sections.findIndex(b => b.kind === 'legacy' && b.legacy?.type === 'faq') ?? -1;
  const hubAfter = brandsIndex >= 0 ? brandsIndex + 1 : faqIndex >= 0 ? faqIndex : collections?.sections.length ?? 0;
  const finder = document?.sections.find(b => b.kind === 'vehicle-finder');
  const savedClosing = document?.sections.filter(b => b.kind === 'cinematic-hero' && b.style.template === 'compact') ?? [];
  const closing = savedClosing.length ? savedClosing : [defaultAtelierClosing()];
  return <div className="titanium-home" style={{ '--ti-opening-height': `${config?.style.desktop?.height ?? 420}px`, '--ti-opening-mobile-height': `${config?.style.mobile?.height ?? 240}px` } as CSSProperties}>
    <section className="atelier-banner" aria-labelledby="titanium-hero-title">
      <div className="atelier-banner-media"><Image src={config?.imageUrl || `${ATELIER_ASSETS}/hero.webp`} alt={localize(config?.alt, locale) || (fa ? 'خودرو و قطعات در فضای سنگی روشن' : 'A car and precision parts in a sunlit stone gallery')} fill priority sizes="100vw" /></div>
      <div className="titanium-hero"><RepeatingSlogan locale={locale} {...(config ? { title: localize(config.title, locale), subtitle: localize(config.body, locale), tagline: config.button.en } : {})} /></div>
    </section>
    {opening?.film ? <section className="titanium-opening-film" aria-label={fa ? 'فیلم معرفی سورس' : 'Source opening film'} data-assistant-avoid>
      <CinematicFilm film={{ ...opening.film, playback: opening.film.playback === 'static' ? 'static' : 'loop', discovery: false }} still={opening.imageUrl} mobileStill={opening.mobileImageUrl} alt={localize(opening.alt, locale)} logoUrl="" logoAlt="" locale={locale} />
    </section> : null}
    <QuickSearch locale={fa ? 'fa' : 'en'} />

    {finder?.visible !== false ? <section id="vehicle-finder" className="container-page titanium-finder-section" aria-labelledby="titanium-finder-title">
      <div className="titanium-float titanium-finder-panel">
        <div className="atelier-finder-copy"><h2 id="titanium-finder-title">{viewData.homeCopy.finder!.title}</h2>
        <p>{localize(finder?.body, locale) || (fa ? 'خودرویتان را انتخاب کنید؛ مسیر پیدا کردن قطعه کوتاه‌تر می‌شود.' : 'Choose your vehicle to find the right parts.')}</p></div>
        <VehicleFinderSteps compact groups={data.finderGroups} locale={fa ? 'fa' : 'en'} buttonLabel={localize(finder?.button, locale) || (fa ? 'نمایش قطعات سازگار' : 'Show compatible parts')} requestHref={finder?.href || `/${locale}/request-part`} />
      </div>
    </section> : null}

    <section id="shopping-paths" className="container-page titanium-paths" aria-labelledby="titanium-paths-title">
      <div className="titanium-section-heading"><div><h2 id="titanium-paths-title">{viewData.homeCopy.paths!.title}</h2><p className="atelier-section-subtitle" lang="en" dir="ltr">{viewData.homeCopy.paths!.subtitle}</p></div></div>
      <div className="titanium-path-grid">{paths.filter(p => p.visible).map(p => <Link key={p.code} href={p.href} className="titanium-float titanium-path">
        <span className="titanium-path-art"><Image src={p.image} alt={p.alt || p.title} fill sizes="(max-width: 800px) 46vw, 30vw" /></span>
        <div className="titanium-path-copy"><h3>{p.title}</h3>{p.text ? <p>{p.text}</p> : null}<span className="titanium-path-arrow"><Arrow aria-hidden size={19} /></span></div>
      </Link>)}</div>
    </section>

    <div className="titanium-collections">
      {collections ? <>
        <BuilderView document={{ ...collections, sections: collections.sections.slice(0, hubAfter) }} data={viewData} locale={locale} />
        <AutomotiveHub heading={viewData.homeCopy.hub!.title} subtitle={viewData.homeCopy.hub!.subtitle} locale={locale} {...(config ? { items: config.items.slice(6, 9) } : {})} />
        <BuilderView document={{ ...collections, sections: collections.sections.slice(hubAfter) }} data={viewData} locale={locale} />
      </> : <>
        <LegacyHomeView {...viewData} content={{ ...data.content!, home: { sections: data.content!.home.sections.filter(s => s.type !== 'hero' && s.type !== 'faq') } }} locale={locale} />
        <AutomotiveHub heading={viewData.homeCopy.hub!.title} subtitle={viewData.homeCopy.hub!.subtitle} locale={locale} {...(config ? { items: config.items.slice(6, 9) } : {})} />
        <LegacyHomeView {...viewData} content={{ ...data.content!, home: { sections: data.content!.home.sections.filter(s => s.type === 'faq') } }} locale={locale} />
      </>}
    </div>

    {sourcing?.visible !== false ? <section className="container-page titanium-sourcing titanium-sourcing-compact" aria-labelledby="titanium-sourcing-title">
      <div className="titanium-sourcing-copy"><h2 id="titanium-sourcing-title">{localize(sourcing?.title, locale) || (fa ? 'قطعه‌تان را پیدا نکردید؟' : 'Can’t find your part?')}</h2><p>{localize(sourcing?.text, locale) || (fa ? 'پیدا کردنش را به سورس بسپارید.' : 'Let Source help you find it.')}</p><Link className="titanium-button" href={sourcing?.href || '/request-part'}><ClipboardList aria-hidden size={18} />{fa ? 'درخواست تأمین قطعه' : 'Request a part'}</Link></div>
      <Image className="titanium-sourcing-art" src={sourcing?.imageUrl || '/brand/source/titanium/sourcing-box.webp'} width={1448} height={1086} unoptimized alt={localize(sourcing?.alt, locale) || (fa ? 'جعبه سورس با قطعات خودرو' : 'Source box with automotive parts')} />
    </section> : null}

    {closing.filter(b => b.visible && (!b.startsAt || Date.parse(b.startsAt) <= data.now) && (!b.endsAt || Date.parse(b.endsAt) > data.now)).map(b => <div key={b.id} className="titanium-closing-film" data-assistant-avoid>
      <CinematicBanner block={b} locale={locale} />
    </div>)}


  </div>;
}
