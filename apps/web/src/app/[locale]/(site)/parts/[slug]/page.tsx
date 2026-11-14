import type { ProductDetail } from '@hedax/contracts';
import { minorToDecimalString } from '@hedax/domain';
import { Car, PackageSearch, RotateCcw, ShieldOff, ShieldCheck, ShoppingCart, Truck } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AddToCart } from '@/components/catalog/add-to-cart';
import { ProductGallery } from '@/components/catalog/product-gallery';
import { Price } from '@/components/ui/format';
import { Code, DefinitionList, Ltr, TableScroll, td, th } from '@/components/ui/misc';
import { Link } from '@/i18n/navigation';
import { ChapterBand, type Crumb } from '@/components/store/chapter-band';
import { RevealWhenAway } from '@/components/store/reveal-when-away';
import { PartPlaceholder } from '@/components/store/part-placeholder';
import { serverApiOptional } from '@/lib/api/server';
import { publicSiteUrl } from '@/lib/config';
import { persianText } from '@/lib/persian-text';
import { displayCurrency } from '@/lib/preferences';

async function load(slug: string) {
  const currency = await displayCurrency();
  return serverApiOptional<ProductDetail>(`/catalog/products/${encodeURIComponent(slug)}?currency=${currency}`, { publicCache: 60 });
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const p = await load(slug).catch(() => null);
  if (!p) return {};
  const name = persianText(locale === 'en' ? (p.name.en || p.name.fa) : p.name.fa);
  const maker = p.manufacturer ? (locale === 'en' ? (p.manufacturer.name.en ?? p.manufacturer.name.fa) : p.manufacturer.name.fa) : null;
  // A part number in the title: people search for it exactly.
  const title = p.partNumber && !name.includes(p.partNumber) ? `${name} ${p.partNumber}${maker ? ` ${maker}` : ''}` : name;
  const fallback = [name, p.partNumber, maker, ...p.equivalents.slice(0, 5)].filter(Boolean).join(' – ');
  const description = ((locale === 'en' ? p.description?.en : p.description?.fa) ?? fallback).slice(0, 300);
  const image = p.primaryImage ? `${publicSiteUrl()}${p.primaryImage.url}` : null;
  return {
    title,
    description,
    alternates: { canonical: `/${locale}/parts/${p.slug}`, languages: { fa: `/fa/parts/${p.slug}`, en: `/en/parts/${p.slug}` } },
    openGraph: { type: 'website', title, description, url: `/${locale}/parts/${p.slug}`, ...(image ? { images: [{ url: image, alt: name }] } : {}) },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const p = await load(slug);
  if (!p) notFound();
  const L = locale as 'fa' | 'en';
  const fa = L === 'fa';
  const name = persianText(L === 'en' ? (p.name.en || p.name.fa) : p.name.fa);
  const text = (v: { fa: string; en: string | null } | null) => (v ? (L === 'en' ? (v.en ?? v.fa) : v.fa) : null);
  const purchasable = p.availability !== 'OUT_OF_STOCK' && p.maxOrderQuantity > 0 && p.price.kind === 'price';
  // No price yet: offered through a sourcing request.
  const sourceable = p.price.kind === 'inquiry';
  const status = purchasable ? p.availability : sourceable ? 'SOURCEABLE' : 'OUT_OF_STOCK';
  const requestHref = `/request-part?part=${encodeURIComponent(p.name.fa)}${p.partNumber ? `&code=${encodeURIComponent(p.partNumber)}` : ''}`;
  const warranty = text(p.warranty);
  const showOrigin = p.origin !== 'UNKNOWN';

  // Structured data: the offer only with the real, current IRR price and stock state.
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Product', name, sku: p.sku,
    ...(p.partNumber ? { mpn: p.partNumber } : {}),
    ...(p.manufacturer ? { brand: { '@type': 'Brand', name: text(p.manufacturer.name) } } : {}),
    ...(p.primaryImage ? { image: `${publicSiteUrl()}${p.primaryImage.url}` } : {}),
    ...(p.fitments.length ? {
      isAccessoryOrSparePartFor: p.fitments.map((f) => ({
        '@type': 'Vehicle',
        name: f.model ? `${text(f.vehicle.name)} ${text(f.model.name)}` : text(f.vehicle.name),
        url: `${publicSiteUrl()}/${L}/cars/${f.vehicle.slug}`,
      })),
    } : {}),
    ...(p.price.kind === 'price' ? { offers: {
      '@type': 'Offer', priceCurrency: 'IRR', price: minorToDecimalString(BigInt(p.price.payable.amountMinor), 'IRR'),
      availability: p.availability === 'OUT_OF_STOCK' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      itemCondition: p.condition === 'NEW' ? 'https://schema.org/NewCondition' : p.condition === 'USED' ? 'https://schema.org/UsedCondition' : 'https://schema.org/RefurbishedCondition',
    } } : {}),
  };

  const numbers = (list: string[]) => <ul className="flex flex-wrap gap-x-3 gap-y-1" dir="ltr">{list.map((c) => <li key={c}><Code>{c}</Code></li>)}</ul>;
  const specs = [
    ...(p.partNumber ? [{ term: t('parts.partNumber'), value: <Code>{p.partNumber}</Code> }] : []),
    ...(p.equivalents.length ? [{ term: t('parts.equivalents'), value: numbers(p.equivalents) }] : []),
    ...(p.replacements.length ? [{ term: t('parts.replacements'), value: numbers(p.replacements) }] : []),
    { term: t('parts.partType'), value: <span>{t(`partType.${p.partType}`)} <span className="block font-normal text-steel">{t(`partType.${p.partType}_help`)}</span></span> },
    { term: t('parts.condition'), value: t(`condition.${p.condition}`) },
    ...(showOrigin ? [{ term: t('parts.origin'), value: t(`origin.${p.origin}`) }] : []),
    ...(p.manufacturer ? [{ term: t('parts.manufacturer'), value: text(p.manufacturer.name) }] : []),
    ...(p.vehicleBrands.length ? [{ term: t('parts.vehicleBrands'), value: p.vehicleBrands.map((b) => text(b.name)).join('، ') }] : []),
    ...(p.countryOfManufacture ? [{ term: t('parts.country'), value: <Ltr>{p.countryOfManufacture}</Ltr> }] : []),
    { term: t('parts.unit'), value: `${L === 'en' ? p.unit.nameEn || p.unit.name : p.unit.name}${p.packQuantity > 1 ? ` × ${p.packQuantity.toLocaleString(fa ? 'fa-IR' : 'en-US')}` : ''}` },
    { term: t('parts.warranty'), value: warranty ?? t('parts.noWarranty') },
    ...(p.oemCodes.length ? [{ term: t('parts.oemCodes'), value: <ul className="flex flex-wrap gap-x-3 gap-y-1">{p.oemCodes.map((c) => <li key={c}><Code>{c}</Code></li>)}</ul> }] : []),
    ...p.specs.map((s) => ({ term: text(s.label), value: <span dir="auto">{s.value}</span> })),
  ];
  const crumbs: Crumb[] = [
    { href: '/', label: t('nav.home') },
    { href: '/parts', label: t('nav.parts') },
    ...(p.category ? [{ href: `/parts?category=${p.category.slug}`, label: text(p.category.name) ?? '' }] : []),
    { label: name },
  ];
  // Fitment table: a column with nothing in any row is left out (no rows of «— —»).
  const hasYears = p.fitments.some((f) => f.yearFrom);
  const hasNotes = p.fitments.some((f) => f.note);
  const hasModels = p.fitments.some((f) => f.model);
  const yearText = (f: ProductDetail['fitments'][number]) => {
    if (!f.yearFrom) return '';
    const n = (y: number) => y.toLocaleString(fa ? 'fa-IR' : 'en-US', { useGrouping: false });
    return f.yearTo && f.yearTo !== f.yearFrom ? `${n(f.yearFrom)}–${n(f.yearTo)}` : n(f.yearFrom);
  };

  return (
    <div className="store-page su-product pb-24 lg:pb-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <ChapterBand compact crumbs={crumbs} locale={L} />
      <div className="container-page">
        <div className="su-product-grid">
          <div className="su-product-gallery">
            {p.images[0] ? (
              <ProductGallery images={p.images.map((img) => ({ url: img.url, alt: text(img.alt) || name }))} />
            ) : (
              <div className="su-product-placeholder"><PartPlaceholder label={t('parts.noImage')} variant="hero" /></div>
            )}
          </div>

          <div id="buy" className="su-product-info">
            <p className="su-card-meta">
              <span className="su-stock" data-status={status}>{t(`availability.${status}`)}</span>
              <span className="su-product-sku">{t('parts.sku')}: <bdi dir="ltr">{p.sku}</bdi></span>
            </p>
            <h1 className="su-product-title">{name}</h1>
            <div className="su-chips">
              <span className="su-chip su-chip-static">{t(`partType.${p.partType}`)}</span>
              <span className="su-chip su-chip-static">{t(`condition.${p.condition}`)}</span>
              {showOrigin ? <span className="su-chip su-chip-static">{t(`origin.${p.origin}`)}</span> : null}
            </div>
            {p.fitments.length ? (
              <section className="su-fits" aria-labelledby="fitment-title" data-testid="fitment">
                <h2 id="fitment-title"><Car aria-hidden size={18} />{t('parts.fitsFor')}</h2>
                <ul className="su-chips">
                  {p.fitments.map((f) => {
                    const label = persianText(f.model ? `${text(f.vehicle.name)} ${text(f.model.name)}` : text(f.vehicle.name) ?? '');
                    const href = f.model ? `/cars/${f.vehicle.slug}?model=${encodeURIComponent(f.model.slug)}` : `/cars/${f.vehicle.slug}`;
                    return <li key={`${f.vehicle.slug}:${f.model?.slug ?? ''}`}><Link href={href} className="su-chip">{label}</Link></li>;
                  })}
                </ul>
              </section>
            ) : null}
            <div className="su-product-price">
              {sourceable ? <p className="su-card-inquiry">{t('parts.priceAfterInquiry')}</p> : <Price price={p.price} size="lg" unit={p.unit} />}
            </div>
            <div className="su-product-buy">
              {purchasable ? (
                <AddToCart productId={p.id} max={p.maxOrderQuantity} name={name} unit={p.unit} />
              ) : (
                <div className="su-product-source" data-testid="sourceable-box">
                  <p>{sourceable ? t('parts.sourceableText') : t('parts.notPurchasable')}</p>
                  <Link href={sourceable ? requestHref : `/request-part?part=${encodeURIComponent(p.name.fa)}&similar=${encodeURIComponent(p.sku)}`} className="su-btn su-btn-outline su-btn-lg">
                    <PackageSearch aria-hidden size={20} />{sourceable ? t('parts.requestSupply') : t('parts.outOfStockAction')}
                  </Link>
                </div>
              )}
            </div>
            <ul className="su-assurances">
              <li><Truck aria-hidden size={22} /><span><strong>{fa ? 'ارسال با تیپاکس' : 'Shipped by Tipax'}</strong><Link href="/help/shipping">{fa ? 'شرایط ارسال' : 'Shipping terms'}</Link></span></li>
              <li><RotateCcw aria-hidden size={22} /><span><strong>{fa ? '۷ روز مهلت انصراف' : '7-day withdrawal'}</strong><Link href="/help/returns">{fa ? 'شرایط مرجوعی' : 'Returns'}</Link></span></li>
              <li>{warranty ? <ShieldCheck aria-hidden size={22} /> : <ShieldOff aria-hidden size={22} />}<span><strong>{warranty ?? t('parts.noWarranty')}</strong><Link href="/terms">{fa ? 'شرایط فروش' : 'Terms of sale'}</Link></span></li>
            </ul>
          </div>
        </div>

        <div className="su-product-details">
          <section aria-labelledby="specs-title" className="su-panel">
            <h2 id="specs-title">{t('parts.specs')}</h2>
            <DefinitionList items={specs} />
            <p className="su-muted su-small-note">{t('parts.claimNote')}</p>
          </section>
          {p.fitments.length ? (
            <section aria-labelledby="fitment-table-title" className="su-panel">
              <h2 id="fitment-table-title">{t('parts.fitmentTable')}</h2>
              <TableScroll caption={t('parts.fitmentTable')}>
                <thead><tr><th className={th}>{t('parts.vehicle')}</th>{hasModels ? <th className={th}>{t('parts.model')}</th> : null}{hasYears ? <th className={th}>{t('parts.years')}</th> : null}{hasNotes ? <th className={th}>{t('parts.note')}</th> : null}</tr></thead>
                <tbody>
                  {p.fitments.map((f, i) => (
                    <tr key={`${f.vehicle.slug}-${f.model?.slug ?? ''}-${i}`}>
                      <td className={td}><Link href={`/cars/${f.vehicle.slug}`} className="su-link">{persianText(text(f.vehicle.name) ?? '')}</Link></td>
                      {hasModels ? <td className={td}>{f.model ? persianText(text(f.model.name) ?? '') : t('parts.wholeVehicle')}</td> : null}
                      {hasYears ? <td className={td}>{yearText(f)}</td> : null}
                      {hasNotes ? <td className={td}>{f.note ?? ''}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </TableScroll>
            </section>
          ) : null}
          {p.description ? (
            <section aria-labelledby="description-title" className="su-panel">
              <h2 id="description-title">{t('parts.description')}</h2>
              <p className="max-w-prose whitespace-pre-line leading-8">{text(p.description)}</p>
            </section>
          ) : null}
        </div>
      </div>
      {/* Phones: the price and the action stay one tap away while reading. */}
      {purchasable || sourceable ? (
        <RevealWhenAway targetId="buy">
          <div className="su-mobile-buy lg:hidden" data-testid="mobile-buy-bar">
            <div className="su-mobile-buy-price">{purchasable ? <Price price={p.price} unit={p.unit} /> : t('parts.priceAfterInquiry')}</div>
            <a href={purchasable ? '#buy' : `/${L}${requestHref}`} className={`su-btn ${purchasable ? 'su-btn-primary' : 'su-btn-outline'}`}>
              {purchasable ? <ShoppingCart aria-hidden size={18} /> : <PackageSearch aria-hidden size={18} />}{purchasable ? t('parts.addToCart') : t('parts.requestSupply')}
            </a>
          </div>
        </RevealWhenAway>
      ) : null}
    </div>
  );
}
