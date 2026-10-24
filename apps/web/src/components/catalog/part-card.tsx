import type { ProductCard } from '@hedax/contracts';
import { fitmentLabels } from '@hedax/domain';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Price } from '@/components/ui/format';
import { Badge, Code, StatusBadge } from '@/components/ui/misc';
import { PartPlaceholder } from '@/components/store/part-placeholder';

/**
 * One part in a list. Phones get a compact row (square thumbnail beside the details) so a
 * list of parts is scannable without scrolling past a large empty frame per item; from `sm`
 * up it is a card with a 4:3 picture in a soft "studio" sweep. A missing photo shows the
 * drawing-sheet placeholder and says so — no stand-in picture.
 */
export function PartCard({ product, priority = false }: { product: ProductCard; priority?: boolean }) {
  const t = useTranslations();
  const locale = useLocale() as 'fa' | 'en';
  const name = locale === 'en' ? (product.name.en ?? product.name.fa) : product.name.fa;
  const brandNames = product.vehicleBrands.map((b) => (locale === 'en' ? (b.name.en ?? b.name.fa) : b.name.fa)).join('، ');
  // «کاربرد: دنا، سمند، پژو 405»; older cached responses without fitments show nothing.
  const usedIn = fitmentLabels(product.fitments ?? [], locale).join(locale === 'en' ? ', ' : '، ');
  // No price or no stock: «قابل تأمین» (a sourcing request instead of buying now).
  const status = product.purchasable === false ? 'SOURCEABLE' : product.availability;
  const Arrow = locale === 'fa' ? ArrowLeft : ArrowRight;
  return (
    <article className="group store-card store-rise relative h-full overflow-hidden hover:border-line">
      <Link href={`/parts/${product.slug}`} className="grid h-full grid-cols-[6.5rem_minmax(0,1fr)] focus-visible:outline-offset-[-3px] sm:flex sm:flex-col">
        <div className="studio relative m-3 me-0 aspect-square overflow-hidden rounded-[calc(var(--radius-card)-6px)] sm:m-0 sm:aspect-[4/3] sm:rounded-none">
          {product.primaryImage ? (
            <Image
              src={product.primaryImage.url}
              alt={locale === 'en' ? (product.primaryImage.alt.en ?? product.primaryImage.alt.fa) : product.primaryImage.alt.fa}
              fill
              sizes="(max-width: 640px) 104px, (max-width: 1024px) 50vw, 25vw"
              className="object-contain p-2 mix-blend-multiply transition-transform duration-500 ease-[var(--ease-standard)] group-hover:scale-[1.04] sm:p-6"
              priority={priority}
            />
          ) : (
            <PartPlaceholder label={t('parts.noImage')} />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3 sm:gap-2 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="whitespace-nowrap text-xs text-steel">
              {t('parts.sku')}: <Code className="text-ink/80">{product.sku}</Code>
            </span>
            {/* One badge: inline beside the code on phones, over the photo from sm. */}
            <span className="sm:absolute sm:start-3 sm:top-3"><StatusBadge status={status} label={t(`availability.${status}`)} /></span>
          </div>
          <h3 className="line-clamp-2 text-[1.0625rem] font-bold leading-7 transition-colors group-hover:text-action">
            {name}
            {locale === 'en' && !product.name.en ? <span className="block text-xs font-normal text-steel">({t('common.englishFallback')})</span> : null}
          </h3>
          {product.partNumber ? <p className="truncate text-xs text-steel">{t('parts.partNumber')}: <Code className="text-ink/80">{product.partNumber}</Code></p> : null}
          {brandNames ? <p className="truncate text-sm text-steel">{t('parts.vehicleBrands')}: {brandNames}</p> : null}
          {usedIn ? <p className="line-clamp-1 text-xs text-steel" title={usedIn} data-testid="card-fitment">{t('parts.usedIn')}: {usedIn}</p> : null}
          <div className="flex flex-wrap gap-1">
            <Badge>{t(`partType.${product.partType}`)}</Badge>
            {product.condition !== 'NEW' ? <Badge tone="warning">{t(`condition.${product.condition}`)}</Badge> : null}
            {product.origin === 'IMPORTED' ? <Badge tone="info">{t('origin.IMPORTED')}</Badge> : null}
          </div>
          <div className="mt-auto flex items-end justify-between gap-2 border-t border-line-soft pt-2.5 sm:pt-3.5">
            {product.price.kind === 'inquiry'
              ? <span className="text-sm font-semibold text-action" data-testid="card-sourceable">{t('parts.requestSupply')}</span>
              : <Price price={product.price} unit={product.unit} />}
            <span aria-hidden className="hidden size-9 shrink-0 place-items-center rounded-full border border-line-soft text-steel transition-colors duration-200 group-hover:border-stage group-hover:bg-stage group-hover:text-white sm:grid">
              <Arrow className="size-4" />
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
