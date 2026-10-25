import type { BuilderBlock, BuilderDocument } from '@hedax/contracts';
import { localize } from '@hedax/contracts/constants';
import { RichText } from '@/components/content/rich-text';
import { Link } from '@/i18n/navigation';
import { PartCard } from '@/components/catalog/part-card';
import { MakersHomeSection } from '@/components/catalog/makers-home';
import { LegacyHomeView } from './legacy-home';
import { BannerSlider } from './slider';
import { VehicleFinder } from './vehicle-finder';
import { CinematicHero } from './cinematic-hero';
import { CinematicBanner } from './cinematic-banner';
import type { BuilderData } from './data';
import { blockVariables, themeVariables } from './styles';
import './builder.css';
import './cinematic.css';

function Picture({ block, locale }: { block: Pick<BuilderBlock, 'imageUrl' | 'mobileImageUrl' | 'alt'>; locale: string }) {
  if (!block.imageUrl) return null;
  return <picture>{block.mobileImageUrl ? <source media="(max-width: 639px)" srcSet={block.mobileImageUrl} /> : null}
    <img src={block.imageUrl} alt={localize(block.alt, locale)} loading="lazy" className="builder-image" />
  </picture>;
}
export function BuilderBlockView({ block: b, data, locale }: { block: BuilderBlock; data: BuilderData; locale: string }) {
  const L = (v: Parameters<typeof localize>[0]) => localize(v, locale);
  if (b.kind === 'legacy' && b.legacy && data.content) return <LegacyHomeView {...data} locale={locale} mobileImageUrl={b.mobileImageUrl} imageAlt={L(b.alt)} content={{ ...data.content, home: { sections: [{ ...b.legacy, id: b.id, visible: true }] } }} />;
  if (b.kind === 'cinematic-hero') return b.style.template === 'compact'
    ? <CinematicBanner block={b} locale={locale} />
    : <CinematicHero block={b} content={data.content} categories={data.categories} locale={locale} />;
  if (b.kind === 'makers') return <MakersHomeSection makers={data.makers} title={localize(b.title, locale)} />;
  const title = L(b.title);
  const heading = title ? <h2 className="builder-heading">{title}</h2> : null;
  const button = b.href && L(b.button) ? <Link className="builder-button" href={b.href}>{L(b.button)}</Link> : null;
  if (b.kind === 'slider') return <>{heading}<BannerSlider items={b.items} interval={b.interval} locale={locale} /></>;
  if (b.kind === 'vehicle-brands' || b.kind === 'vehicle-models') return <>{heading}<VehicleFinder vehicles={data.vehicles} brands={data.brands} byBrand={b.kind === 'vehicle-brands'} locale={locale} /></>;
  if (['new-products', 'bestsellers', 'discounts', 'offers', 'selected-products', 'vehicle-products'].includes(b.kind)) {
    const products = data.products[b.id] ?? [];
    return <>{heading}<ul className="builder-grid builder-products">{products.map(p => <li key={p.id}><PartCard product={p} /></li>)}</ul>{!products.length ? <p className="py-6 text-steel">{locale === 'fa' ? 'در حال حاضر کالایی در این مجموعه وجود ندارد.' : 'No products in this collection yet.'}</p> : null}{button}</>;
  }
  if (['categories', 'image-categories', 'brands'].includes(b.kind)) {
    const rows = b.kind.includes('categor') ? data.categories.map(c => ({ id: c.slug, title: c.name, href: `/parts?category=${encodeURIComponent(c.slug)}` })) : data.brands.map(c => ({ id: c.slug, title: c.name, href: b.kind === 'brands' ? `/brands/${c.slug}` : `/cars?brand=${encodeURIComponent(c.slug)}` }));
    return <>{heading}<div className="builder-grid">{rows.map(row => { const item = b.items.find(x => x.href === row.href); return <Link key={row.id} href={row.href} className="builder-tile">{item ? <Picture block={item} locale={locale} /> : null}<strong>{locale === 'en' ? row.title.en || row.title.fa : row.title.fa}</strong></Link>; })}</div></>;
  }
  if (b.kind === 'search') return <>{heading}<form action={`/${locale}/parts`} method="get" role="search" className="flex flex-wrap gap-3"><label className="flex min-w-0 flex-1 flex-col gap-2">{locale === 'fa' ? 'نام قطعه یا شماره فنی' : 'Part name or number'}<input name="q" type="search" className="min-h-12 rounded-xl border bg-white px-4 text-ink" /></label><button className="builder-button self-end" type="submit">{L(b.button) || (locale === 'fa' ? 'جست‌وجو' : 'Search')}</button></form></>;
  if (['banners', 'services', 'benefits', 'custom'].includes(b.kind)) return <>{heading}<div className="builder-grid">{b.items.filter(i => i.visible).map((item, index) => <div className="builder-tile" key={index}>{item.href ? <Link href={item.href}><Picture block={item} locale={locale} /><h3>{L(item.title)}</h3></Link> : <><Picture block={item} locale={locale} /><h3>{L(item.title)}</h3></>}<RichText text={L(item.text)} />{item.href && L(item.button) ? <Link className="builder-button" href={item.href}>{L(item.button)}</Link> : null}</div>)}</div>{button}</>;
  return <div className={`builder-composition ${b.kind === 'hero' ? 'builder-hero' : ''}`}>
    <div>{heading}<RichText text={L(b.body)} />{button}</div>
    {b.href ? <Link href={b.href}><Picture block={b} locale={locale} /></Link> : <Picture block={b} locale={locale} />}
  </div>;
}
export function BuilderView({ document, data, locale, editing = false, selectedId, onSelect, now = data.now }: {
  document: BuilderDocument; data: BuilderData; locale: string; editing?: boolean; selectedId?: string; onSelect?: (id: string) => void; now?: number;
}) {
  return <div className="builder-root autodoc-inspired-home" style={themeVariables(document.theme)} dir={locale === 'fa' ? 'rtl' : 'ltr'}>
    {document.sections.filter(b => editing || (b.visible && (!b.startsAt || Date.parse(b.startsAt) <= now) && (!b.endsAt || Date.parse(b.endsAt) > now))).map(b =>
      <div key={b.id} data-builder-kind={b.kind} data-builder-id={b.id} data-custom-background={Boolean(b.style.background)} data-template={b.style.template ?? 'classic'} data-selected={editing && selectedId === b.id} className={`builder-block ${editing ? 'builder-editable' : ''} ${!b.visible ? 'builder-muted' : ''}`} style={blockVariables(b.style)}
        {...(onSelect ? { onClickCapture: (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); onSelect(b.id); }, tabIndex: 0, role: 'button', 'aria-label': LTitle(b, locale), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') onSelect(b.id); } } : {})}>
        <div className="builder-block-inner"><BuilderBlockView block={b} data={data} locale={locale} /></div>
      </div>)}
  </div>;
}
const LTitle = (b: BuilderBlock, locale: string) => localize(b.title, locale) || b.kind;
