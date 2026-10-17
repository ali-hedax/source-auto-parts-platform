import type { CatalogEntryCard as Entry } from '@hedax/contracts';
import { fitmentLabels } from '@hedax/domain';
import { ImageOff, ShoppingBag } from 'lucide-react';
import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Badge, Code } from '@/components/ui/misc';

/**
 * One part of the technical catalog in a list (/catalog, home page): photo, technical number,
 * name, part brand and «کاربرد» in one line. Same layout as the shop's part card: a compact row on
 * phones, a card with a 4:3 picture from `sm` up. No price or stock: a catalog entry is a reference.
 */
export async function CatalogEntryCard({ entry, priority = false }: { entry: Entry; priority?: boolean }) {
  const t = await getTranslations('technicalCatalog');
  const locale = (await getLocale()) as 'fa' | 'en';
  const text = (n: { fa: string; en: string | null }) => (locale === 'en' ? (n.en ?? n.fa) : n.fa);
  const name = text(entry.name);
  const usedIn = fitmentLabels(entry.fitments, locale).join(locale === 'en' ? ', ' : '، ');
  return (
    <article className="group h-full overflow-hidden rounded-[var(--radius-card)] border border-line-soft bg-white transition-colors duration-150 hover:border-line-strong">
      <Link href={`/catalog/${entry.slug}`} className="grid h-full grid-cols-[6.5rem_minmax(0,1fr)] focus-visible:outline-offset-[-3px] sm:flex sm:flex-col">
        <div className="relative m-3 me-0 aspect-square overflow-hidden rounded-[var(--radius-control)] border border-line-soft sm:m-0 sm:aspect-[4/3] sm:rounded-none sm:border-x-0 sm:border-t-0">
          {entry.image ? (
            <Image
              src={entry.image.url}
              alt={text(entry.image.alt) || name}
              fill
              sizes="(max-width: 640px) 104px, (max-width: 1024px) 50vw, 25vw"
              className="bg-white object-contain p-2 transition-transform duration-300 group-hover:scale-[1.03] sm:p-4"
              priority={priority}
            />
          ) : (
            <div className="media-placeholder flex h-full flex-col items-center justify-center gap-1.5 text-steel">
              <ImageOff aria-hidden className="size-6 sm:size-7" />
              <span className="hidden text-xs font-medium sm:block">{t('noImage')}</span>
              <span className="sr-only sm:hidden">{t('noImage')}</span>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3 sm:gap-2 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="min-w-0 truncate text-xs text-steel">
              {t('partNumber')}: <Code className="text-ink/80">{entry.partNumber}</Code>
            </span>
            {entry.inShop ? <Badge tone="info"><ShoppingBag aria-hidden className="size-3.5" />{t('inShop')}</Badge> : null}
          </div>
          <h3 className="line-clamp-2 font-bold leading-7 group-hover:text-action">{name}</h3>
          {entry.manufacturer ? <p className="truncate text-sm text-steel">{t('manufacturer')}: {text(entry.manufacturer.name)}</p> : null}
          {usedIn ? <p className="line-clamp-1 text-xs text-steel" title={usedIn} data-testid="catalog-fitment">{t('usedIn')}: {usedIn}</p> : null}
          {entry.category ? <div className="mt-auto flex flex-wrap gap-1 pt-1"><Badge>{text(entry.category.name)}</Badge></div> : null}
        </div>
      </Link>
    </article>
  );
}
