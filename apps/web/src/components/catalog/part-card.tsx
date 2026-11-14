import type { ProductCard } from '@hedax/contracts';
import { fitmentLabels } from '@hedax/domain';
import { PackageSearch } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Price } from '@/components/ui/format';
import { PartImage } from '@/components/store/part-image';
import { PartPlaceholder } from '@/components/store/part-placeholder';
import { persianText } from '@/lib/persian-text';
import { CardCartButton } from './card-cart-button';

/**
 * The part card everywhere (home, catalogue, brand and vehicle pages): photo, stock state with the SKU,
 * name, the vehicles it fits on one line, price and one action — «افزودن به سبد» when it can be
 * bought now, otherwise «قیمت پس از استعلام» with «درخواست تأمین».
 */
export function PartCard({ product, priority = false, hideCountUnit = false }: { product: ProductCard; priority?: boolean; hideCountUnit?: boolean; concise?: boolean }) {
  const t = useTranslations();
  const locale = useLocale() as 'fa' | 'en';
  const name = persianText(locale === 'en' ? (product.name.en || product.name.fa) : product.name.fa);
  const usedIn = fitmentLabels(product.fitments ?? [], locale).map((l) => persianText(l)).join(locale === 'en' ? ', ' : '، ');
  const canBuy = product.purchasable && product.price.kind === 'price' && product.availability !== 'OUT_OF_STOCK';
  const status = canBuy ? product.availability : product.price.kind === 'inquiry' ? 'SOURCEABLE' : 'OUT_OF_STOCK';
  const priceUnit = hideCountUnit || product.unit.name.trim() === 'عدد' ? undefined : product.unit;
  const href = `/parts/${product.slug}`;
  return <article className="su-card">
    <Link href={href} className="su-card-media" tabIndex={-1} aria-hidden>
      {product.primaryImage ? <PartImage
        fallback={<PartPlaceholder label={t('parts.noImage')} />}
        src={product.primaryImage.url}
        alt=""
        fill sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 20vw"
        className="object-contain p-4" priority={priority}
      /> : <PartPlaceholder label={t('parts.noImage')} />}
    </Link>
    <div className="su-card-body">
      <p className="su-card-meta">
        <span className="su-stock" data-status={status}>{t(`availability.${status}`)}</span>
        <bdi dir="ltr" className="su-card-sku" title={t('parts.sku')}>{product.sku}</bdi>
      </p>
      <h3 className="su-card-name"><Link href={href}>{name}</Link></h3>
      {usedIn ? <p className="su-card-fit" title={usedIn} data-testid="card-fitment">{t('parts.usedIn')}: {usedIn}</p> : null}
      {product.finderMatch ? <p className="su-card-match" data-tier={product.finderMatch.tier} data-testid="card-finder-match">{t(`finder.reason.${product.finderMatch.reason}`)}</p> : null}
      <div className="su-card-foot">
        {product.price.kind === 'price'
          ? <div className="su-card-price"><Price price={product.price} size="lg" unit={priceUnit} /></div>
          : <p className="su-card-inquiry" data-testid="card-sourceable">{t('parts.priceAfterInquiry')}</p>}
        {canBuy ? <CardCartButton productId={product.id} name={name} unit={product.unit} />
          : <Link href={`/request-part?part=${encodeURIComponent(product.name.fa)}${product.partNumber ? `&code=${encodeURIComponent(product.partNumber)}` : ''}`} className="su-btn su-btn-outline su-btn-block su-card-action"><PackageSearch aria-hidden size={18} />{t('parts.requestSupply')}</Link>}
      </div>
    </div>
  </article>;
}
