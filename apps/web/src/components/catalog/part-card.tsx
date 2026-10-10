import type { ProductCard } from '@hedax/contracts';
import { ImageOff } from 'lucide-react';
import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Price } from '@/components/ui/format';
import { Badge, Code, StatusBadge } from '@/components/ui/misc';

/**
 * One part in a list. Phones get a compact row (square thumbnail beside the details) so a
 * list of parts is scannable without scrolling past a large empty frame per item; from `sm`
 * up it is a card with a 4:3 picture. A missing photo shows the drawing-sheet placeholder
 * and says so — no stand-in picture.
 */
export async function PartCard({ product, priority = false }: { product: ProductCard; priority?: boolean }) {
  const t = await getTranslations();
  const locale = (await getLocale()) as 'fa' | 'en';
  const name = locale === 'en' ? (product.name.en ?? product.name.fa) : product.name.fa;
  const brandNames = product.vehicleBrands.map((b) => (locale === 'en' ? (b.name.en ?? b.name.fa) : b.name.fa)).join('، ');
  return (
    <article className="group h-full overflow-hidden rounded-[var(--radius-card)] border border-line-soft bg-white transition-colors duration-150 hover:border-line-strong">
      <Link href={`/parts/${product.slug}`} className="grid h-full grid-cols-[6.5rem_minmax(0,1fr)] focus-visible:outline-offset-[-3px] sm:flex sm:flex-col">
        <div className="relative m-3 me-0 aspect-square overflow-hidden rounded-[var(--radius-control)] border border-line-soft sm:m-0 sm:aspect-[4/3] sm:rounded-none sm:border-x-0 sm:border-t-0">
          {product.primaryImage ? (
            <Image
              src={product.primaryImage.url}
              alt={locale === 'en' ? (product.primaryImage.alt.en ?? product.primaryImage.alt.fa) : product.primaryImage.alt.fa}
              fill
              sizes="(max-width: 640px) 104px, (max-width: 1024px) 50vw, 25vw"
              className="bg-white object-contain p-2 transition-transform duration-300 group-hover:scale-[1.03] sm:p-4"
              priority={priority}
            />
          ) : (
            <div className="media-placeholder flex h-full flex-col items-center justify-center gap-1.5 text-steel">
              <ImageOff aria-hidden className="size-6 sm:size-7" />
              <span className="hidden text-xs font-medium sm:block">{t('parts.noImage')}</span>
              <span className="sr-only sm:hidden">{t('parts.noImage')}</span>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3 sm:gap-2 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="whitespace-nowrap text-xs text-steel">
              {t('parts.sku')}: <Code className="text-ink/80">{product.sku}</Code>
            </span>
            <StatusBadge status={product.availability} label={t(`availability.${product.availability}`)} />
          </div>
          <h3 className="line-clamp-2 font-bold leading-7 group-hover:text-action">
            {name}
            {locale === 'en' && !product.name.en ? <span className="block text-xs font-normal text-steel">({t('common.englishFallback')})</span> : null}
          </h3>
          {brandNames ? <p className="truncate text-sm text-steel">{t('parts.vehicleBrands')}: {brandNames}</p> : null}
          <div className="flex flex-wrap gap-1">
            <Badge>{t(`partType.${product.partType}`)}</Badge>
            {product.condition !== 'NEW' ? <Badge tone="warning">{t(`condition.${product.condition}`)}</Badge> : null}
            {product.origin === 'IMPORTED' ? <Badge tone="info">{t('origin.IMPORTED')}</Badge> : null}
          </div>
          <div className="mt-auto border-t border-line-soft pt-2.5 sm:pt-3">
            <Price price={product.price} />
          </div>
        </div>
      </Link>
    </article>
  );
}
