import type { ProductDetail } from '@hedax/contracts';
import { minorToDecimalString } from '@hedax/domain';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AddToCart } from '@/components/catalog/add-to-cart';
import { ButtonLink } from '@/components/ui/button';
import { Price } from '@/components/ui/format';
import { Alert, Badge, Code, DefinitionList, Ltr, StatusBadge } from '@/components/ui/misc';
import { Link } from '@/i18n/navigation';
import { serverApiOptional } from '@/lib/api/server';
import { publicSiteUrl } from '@/lib/config';
import { displayCurrency } from '@/lib/preferences';

async function load(slug: string) {
  const currency = await displayCurrency();
  return serverApiOptional<ProductDetail>(`/catalog/products/${encodeURIComponent(slug)}?currency=${currency}`, { publicCache: 60 });
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const p = await load(slug).catch(() => null);
  if (!p) return {};
  const name = locale === 'en' ? (p.name.en ?? p.name.fa) : p.name.fa;
  return {
    title: name,
    description: (locale === 'en' ? p.description?.en : p.description?.fa) ?? undefined,
    alternates: { canonical: `/${locale}/parts/${p.slug}`, languages: { fa: `/fa/parts/${p.slug}`, en: `/en/parts/${p.slug}` } },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const p = await load(slug);
  if (!p) notFound();
  const L = locale as 'fa' | 'en';
  const name = L === 'en' ? (p.name.en ?? p.name.fa) : p.name.fa;
  const text = (v: { fa: string; en: string | null } | null) => (v ? (L === 'en' ? (v.en ?? v.fa) : v.fa) : null);
  const purchasable = p.availability !== 'OUT_OF_STOCK' && p.maxOrderQuantity > 0 && p.price.kind === 'price';

  // Structured data only with the real, current IRR price and stock state.
  const jsonLd = p.price.kind === 'price'
    ? {
        '@context': 'https://schema.org', '@type': 'Product', name, sku: p.sku,
        ...(p.primaryImage ? { image: `${publicSiteUrl()}${p.primaryImage.url}` } : {}),
        offers: {
          '@type': 'Offer', priceCurrency: 'IRR', price: minorToDecimalString(BigInt(p.price.payable.amountMinor), 'IRR'),
          availability: p.availability === 'OUT_OF_STOCK' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
          itemCondition: p.condition === 'NEW' ? 'https://schema.org/NewCondition' : p.condition === 'USED' ? 'https://schema.org/UsedCondition' : 'https://schema.org/RefurbishedCondition',
        },
      }
    : null;

  const specs = [
    { term: t('parts.partType'), value: <span>{t(`partType.${p.partType}`)} <span className="block text-sm font-normal text-steel">{t(`partType.${p.partType}_help`)}</span></span> },
    { term: t('parts.condition'), value: t(`condition.${p.condition}`) },
    { term: t('parts.origin'), value: t(`origin.${p.origin}`) },
    ...(p.manufacturer ? [{ term: t('parts.manufacturer'), value: text(p.manufacturer.name) }] : []),
    ...(p.vehicleBrands.length ? [{ term: t('parts.vehicleBrands'), value: p.vehicleBrands.map((b) => text(b.name)).join('، ') }] : []),
    ...(p.countryOfManufacture ? [{ term: t('parts.country'), value: <Ltr>{p.countryOfManufacture}</Ltr> }] : []),
    { term: t('parts.unit'), value: `${p.unit}${p.packQuantity > 1 ? ` × ${p.packQuantity}` : ''}` },
    { term: t('parts.warranty'), value: text(p.warranty) ?? <span className="font-normal text-steel">{t('parts.noWarranty')}</span> },
    ...(p.oemCodes.length ? [{ term: t('parts.oemCodes'), value: <ul className="flex flex-wrap gap-x-3 gap-y-1">{p.oemCodes.map((c) => <li key={c}><Code>{c}</Code></li>)}</ul> }] : []),
    ...p.specs.map((s) => ({ term: text(s.label), value: <span dir="auto">{s.value}</span> })),
  ];
  const Chevron = L === 'fa' ? ChevronLeft : ChevronRight;

  return (
    <div className="container-page py-6 md:py-8">
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} /> : null}
      <nav aria-label="breadcrumb" className="mb-5 text-sm text-steel">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link href="/parts" className="underline-offset-4 hover:text-ink hover:underline">{t('nav.parts')}</Link></li>
          {p.category ? (
            <li className="flex items-center gap-1.5">
              <Chevron aria-hidden className="size-3.5" />
              <Link href={`/parts?category=${p.category.slug}`} className="underline-offset-4 hover:text-ink hover:underline">{text(p.category.name)}</Link>
            </li>
          ) : null}
        </ol>
      </nav>
      {/* Phones read in DOM order (photo, label, specification, description); from lg the description sits under the photo. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-10">
        <div className={`relative overflow-hidden rounded-[var(--radius-card)] border border-line-soft bg-white lg:col-start-1 lg:row-start-1 ${p.images[0] ? 'aspect-[4/3]' : 'aspect-[5/2] sm:aspect-[4/3]'}`}>
          {p.images[0] ? (
            <Image src={p.images[0].url} alt={text(p.images[0].alt) ?? name} fill priority sizes="(max-width: 1024px) 100vw, 50vw" className="object-contain p-6" />
          ) : (
            <div className="media-placeholder flex h-full flex-col items-center justify-center gap-2 text-steel">
              <ImageOff aria-hidden className="size-10" />
              <span className="text-sm font-medium">{t('parts.noImage')}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="part-label p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pe-4">
              <p className="text-sm text-steel">
                {t('parts.sku')} <Code className="ms-1.5 text-base text-ink">{p.sku}</Code>
              </p>
              <StatusBadge status={p.availability} label={t(`availability.${p.availability}`)} />
            </div>
            <h1 className="mt-3 text-2xl font-bold md:text-[1.75rem]">
              {name}
              {L === 'en' && !p.name.en ? <span className="mt-1 block text-sm font-normal text-steel">({t('common.englishFallback')})</span> : null}
            </h1>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge>{t(`partType.${p.partType}`)}</Badge>
              <Badge tone={p.condition === 'NEW' ? 'neutral' : 'warning'}>{t(`condition.${p.condition}`)}</Badge>
              <Badge tone="info">{t(`origin.${p.origin}`)}</Badge>
            </div>
            <div className="mt-5 border-t border-line-soft pt-5">
              <Price price={p.price} size="lg" />
            </div>
            <div className="mt-5">
              {purchasable ? (
                <AddToCart productId={p.id} max={p.maxOrderQuantity} name={name} />
              ) : (
                <Alert tone="warning" title={t('parts.notPurchasable')}>
                  <ButtonLink href={`/request-part?part=${encodeURIComponent(p.name.fa)}&similar=${encodeURIComponent(p.sku)}`} className="mt-3">
                    {t('parts.outOfStockAction')}
                  </ButtonLink>
                </Alert>
              )}
            </div>
          </div>

          <section aria-labelledby="specs-title" className="card p-5 sm:p-6">
            <h2 id="specs-title" className="mb-4 text-lg font-bold">{t('parts.specs')}</h2>
            <DefinitionList items={specs} />
            <p className="mt-4 border-t border-line-soft pt-3 text-xs leading-6 text-steel">{t('parts.claimNote')}</p>
          </section>
        </div>

        {p.description ? (
          <section aria-labelledby="description-title" className="card self-start p-5 sm:p-6 lg:col-start-1 lg:row-start-2">
            <h2 id="description-title" className="mb-3 text-lg font-bold">{t('parts.description')}</h2>
            <p className="max-w-prose whitespace-pre-line leading-8">{text(p.description)}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
