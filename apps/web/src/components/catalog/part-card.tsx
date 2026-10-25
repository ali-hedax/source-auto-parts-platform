import type { ProductCard } from '@hedax/contracts';
import { fitmentLabels } from '@hedax/domain';
import { Info, PackageSearch } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Price } from '@/components/ui/format';
import { Code, StatusBadge } from '@/components/ui/misc';
import { PartImage } from '@/components/store/part-image';
import { PartPlaceholder } from '@/components/store/part-placeholder';
import { CardCartButton } from './card-cart-button';
import './part-card.css';

/** The same white product/purchase card on the home page and in the catalogue. */
export function PartCard({ product, priority = false }: { product: ProductCard; priority?: boolean }) {
  const t = useTranslations();
  const locale = useLocale() as 'fa' | 'en';
  const name = locale === 'en' ? (product.name.en ?? product.name.fa) : product.name.fa;
  const brandNames = product.vehicleBrands.map(b => locale === 'en' ? (b.name.en ?? b.name.fa) : b.name.fa).join(locale === 'en' ? ', ' : '، ');
  const usedIn = fitmentLabels(product.fitments ?? [], locale).join(locale === 'en' ? ', ' : '، ');
  const kind = [t(`partType.${product.partType}`), product.condition !== 'NEW' ? t(`condition.${product.condition}`) : '', product.origin === 'IMPORTED' ? t('origin.IMPORTED') : ''].filter(Boolean).join(locale === 'en' ? ', ' : '، ');
  const canBuy = product.purchasable && product.price.kind === 'price' && product.availability !== 'OUT_OF_STOCK';
  const status = canBuy ? product.availability : 'SOURCEABLE';
  return <article className="part-card">
    <Link href={`/parts/${product.slug}`} className="part-card-main">
      <div className="part-card-media">
        {product.primaryImage ? <PartImage
          fallback={<PartPlaceholder label={t('parts.noImage')} />}
          src={product.primaryImage.url}
          alt={locale === 'en' ? (product.primaryImage.alt.en ?? product.primaryImage.alt.fa) : product.primaryImage.alt.fa}
          fill sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
          className="object-contain p-7" priority={priority}
        /> : <PartPlaceholder label={t('parts.noImage')} />}
        <span className="part-card-stock"><StatusBadge status={status} label={t(`availability.${status}`)} /></span>
      </div>
      <div className="part-card-description">
        <h3>{name}{locale === 'en' && !product.name.en ? <span className="part-card-fallback">({t('common.englishFallback')})</span> : null}</h3>
        {product.partNumber ? <p className="part-card-meta">{t('parts.partNumber')}: <Code>{product.partNumber}</Code></p> : null}
        <p className="part-card-meta">{t('parts.sku')}: <Code>{product.sku}</Code></p>
        {brandNames ? <p className="part-card-meta">{t('parts.vehicleBrands')}: {brandNames}</p> : null}
        {usedIn ? <p className="part-card-fitment" title={usedIn} data-testid="card-fitment">{t('parts.usedIn')}: {usedIn}</p> : null}
        {/* Vehicle-finder search with a year: the link has no year range, so the year is not confirmed. */}
        {product.fitmentYearUnconfirmed ? <p className="text-xs leading-6 text-steel" data-testid="card-year-unconfirmed">{t('parts.yearUnconfirmed')}</p> : null}
        <p className="part-card-kind">{kind}</p>
        <span className="part-card-more"><Info aria-hidden size={19} />{t('common.details')}</span>
      </div>
    </Link>
    <div className="part-card-bottom">
      <div className="part-card-price">{product.price.kind === 'inquiry'
        ? <span data-testid="card-sourceable">{t('parts.requestSupply')}</span>
        : <Price price={product.price} size="lg" unit={product.unit} />}</div>
      {canBuy ? <CardCartButton productId={product.id} name={name} unit={product.unit} />
        : <Link href={`/request-part?part=${encodeURIComponent(product.partNumber || product.sku)}`} className="part-card-source"><PackageSearch aria-hidden size={21} />{t('parts.requestSupply')}</Link>}
      {product.manufacturer ? <p className="part-card-maker">{locale === 'en' ? product.manufacturer.name.en || product.manufacturer.name.fa : product.manufacturer.name.fa}</p> : null}
    </div>
  </article>;
}
