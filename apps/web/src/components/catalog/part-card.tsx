import type { ProductCard } from '@hedax/contracts';
import { ImageOff } from 'lucide-react';
import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Price } from '@/components/ui/format';
import { Badge, Ltr, StatusBadge } from '@/components/ui/misc';

export async function PartCard({ product, priority = false }: { product: ProductCard; priority?: boolean }) {
  const t = await getTranslations();
  const locale = (await getLocale()) as 'fa' | 'en';
  const name = locale === 'en' ? (product.name.en ?? product.name.fa) : product.name.fa;
  const brandNames = product.vehicleBrands.map((b) => (locale === 'en' ? (b.name.en ?? b.name.fa) : b.name.fa)).join('، ');
  return (
    <article className="card group flex h-full flex-col overflow-hidden transition-shadow duration-200 hover:shadow-md">
      <Link href={`/parts/${product.slug}`} className="flex flex-1 flex-col focus-visible:outline-offset-[-3px]">
        <div className="relative aspect-[4/3] bg-surface">
          {product.primaryImage ? (
            <Image
              src={product.primaryImage.url}
              alt={locale === 'en' ? (product.primaryImage.alt.en ?? product.primaryImage.alt.fa) : product.primaryImage.alt.fa}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-contain p-3"
              priority={priority}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-steel">
              <ImageOff aria-hidden className="size-8" />
              <span className="text-xs">{t('parts.noImage')}</span>
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge status={product.availability} label={t(`availability.${product.availability}`)} />
            <Badge>{t(`partType.${product.partType}`)}</Badge>
            {product.condition !== 'NEW' ? <Badge tone="warning">{t(`condition.${product.condition}`)}</Badge> : null}
            {product.origin === 'IMPORTED' ? <Badge tone="info">{t('origin.IMPORTED')}</Badge> : null}
          </div>
          <h3 className="line-clamp-2 font-bold leading-snug">
            {name}
            {locale === 'en' && !product.name.en ? <span className="block text-xs font-normal text-steel">({t('common.englishFallback')})</span> : null}
          </h3>
          {brandNames ? <p className="text-sm text-steel">{t('parts.vehicleBrands')}: {brandNames}</p> : null}
          <p className="text-xs text-steel">
            {t('parts.sku')}: <Ltr>{product.sku}</Ltr>
          </p>
          <div className="mt-auto pt-2">
            <Price price={product.price} />
          </div>
        </div>
      </Link>
    </article>
  );
}
