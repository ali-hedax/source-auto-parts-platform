import type { ProductDetail } from '@hedax/contracts';
import { minorToDecimalString } from '@hedax/domain';
import { ImageOff } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AddToCart } from '@/components/catalog/add-to-cart';
import { ButtonLink } from '@/components/ui/button';
import { Price } from '@/components/ui/format';
import { Alert, Badge, DefinitionList, Ltr, StatusBadge } from '@/components/ui/misc';
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

  return (
    <div className="container-page py-8">
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} /> : null}
      <nav aria-label="breadcrumb" className="mb-4 text-sm text-steel">
        <Link href="/parts" className="underline-offset-2 hover:underline">{t('nav.parts')}</Link>
        {p.category ? <> / <Link href={`/parts?category=${p.category.slug}`} className="underline-offset-2 hover:underline">{text(p.category.name)}</Link></> : null}
      </nav>
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="card relative aspect-[4/3] overflow-hidden bg-surface">
          {p.images[0] ? (
            <Image src={p.images[0].url} alt={text(p.images[0].alt) ?? name} fill priority sizes="(max-width: 1024px) 100vw, 50vw" className="object-contain p-6" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-steel">
              <ImageOff aria-hidden className="size-12" />
              {t('parts.noImage')}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={p.availability} label={t(`availability.${p.availability}`)} />
            <Badge>{t(`partType.${p.partType}`)}</Badge>
            <Badge tone={p.condition === 'NEW' ? 'neutral' : 'warning'}>{t(`condition.${p.condition}`)}</Badge>
            <Badge tone="info">{t(`origin.${p.origin}`)}</Badge>
          </div>
          <h1 className="text-2xl font-bold leading-snug md:text-3xl">
            {name}
            {L === 'en' && !p.name.en ? <span className="mt-1 block text-sm font-normal text-steel">({t('common.englishFallback')})</span> : null}
          </h1>
          <Price price={p.price} size="lg" />
          {purchasable ? (
            <AddToCart productId={p.id} max={p.maxOrderQuantity} name={name} />
          ) : (
            <Alert tone="warning" title={t('parts.notPurchasable')}>
              <ButtonLink href={`/request-part?part=${encodeURIComponent(p.name.fa)}&similar=${encodeURIComponent(p.sku)}`} className="mt-3">
                {t('parts.outOfStockAction')}
              </ButtonLink>
            </Alert>
          )}
          <DefinitionList
            items={[
              { term: t('parts.sku'), value: <Ltr>{p.sku}</Ltr> },
              { term: t('parts.partType'), value: <span>{t(`partType.${p.partType}`)} <span className="block text-sm font-normal text-steel">{t(`partType.${p.partType}_help`)}</span></span> },
              { term: t('parts.condition'), value: t(`condition.${p.condition}`) },
              { term: t('parts.origin'), value: t(`origin.${p.origin}`) },
              ...(p.manufacturer ? [{ term: t('parts.manufacturer'), value: text(p.manufacturer.name) }] : []),
              ...(p.vehicleBrands.length ? [{ term: t('parts.vehicleBrands'), value: p.vehicleBrands.map((b) => text(b.name)).join('، ') }] : []),
              ...(p.countryOfManufacture ? [{ term: t('parts.country'), value: <Ltr>{p.countryOfManufacture}</Ltr> }] : []),
              { term: t('parts.unit'), value: `${p.unit}${p.packQuantity > 1 ? ` × ${p.packQuantity}` : ''}` },
              { term: t('parts.warranty'), value: text(p.warranty) ?? <span className="text-steel">{t('parts.noWarranty')}</span> },
              ...(p.oemCodes.length ? [{ term: t('parts.oemCodes'), value: <Ltr>{p.oemCodes.join(', ')}</Ltr> }] : []),
            ]}
          />
          <p className="text-xs text-steel">{t('parts.claimNote')}</p>
        </div>
      </div>
      {p.description || p.specs.length ? (
        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          {p.description ? (
            <div className="card p-6">
              <h2 className="mb-3 text-lg font-bold">{t('parts.description')}</h2>
              <p className="whitespace-pre-line leading-8">{text(p.description)}</p>
            </div>
          ) : null}
          {p.specs.length ? (
            <div className="card p-6">
              <h2 className="mb-3 text-lg font-bold">{t('parts.specs')}</h2>
              <DefinitionList items={p.specs.map((s) => ({ term: text(s.label), value: s.value }))} />
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
