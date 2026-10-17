import type { CatalogEntryDetail } from '@hedax/contracts';
import { ChevronLeft, ChevronRight, ImageOff, ShoppingBag } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ProductGallery } from '@/components/catalog/product-gallery';
import { ButtonLink } from '@/components/ui/button';
import { Code, DefinitionList, TableScroll, td, th } from '@/components/ui/misc';
import { Link } from '@/i18n/navigation';
import { serverApiOptional } from '@/lib/api/server';

const load = (slug: string) => serverApiOptional<CatalogEntryDetail>(`/catalog/entries/${encodeURIComponent(slug)}`, { publicCache: 60 });

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const e = await load(slug).catch(() => null);
  if (!e) return {};
  const t = await getTranslations({ locale, namespace: 'technicalCatalog' });
  const name = locale === 'en' ? (e.name.en ?? e.name.fa) : e.name.fa;
  const description = (locale === 'en' ? e.description?.en : e.description?.fa) || `${t('partNumber')} ${e.partNumber} — ${name}`;
  return {
    title: `${name} ${e.partNumber}`,
    description: description.slice(0, 300),
    alternates: { canonical: `/${locale}/catalog/${e.slug}`, languages: { fa: `/fa/catalog/${e.slug}`, en: `/en/catalog/${e.slug}` } },
  };
}

/**
 * One part of the technical catalog: photos, numbers, specifications, vehicle fitment and the
 * description. A part linked to the shop leads to its product page; otherwise to a sourcing request
 * pre-filled with its name and technical number.
 */
export default async function CatalogEntryPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('technicalCatalog');
  const tNav = await getTranslations('nav');
  const e = await load(slug);
  if (!e) notFound();
  const L = locale as 'fa' | 'en';
  const text = (v: { fa: string; en: string | null }) => (L === 'en' ? (v.en ?? v.fa) : v.fa);
  const name = text(e.name);
  const Chevron = L === 'fa' ? ChevronLeft : ChevronRight;
  const years = (from: number | null, to: number | null) => (from === null ? '—' : to === null || to === from ? String(from) : `${from}–${to}`);
  const numbers = (list: string[]) => <ul className="flex flex-wrap gap-x-3 gap-y-1">{list.map((n) => <li key={n}><Code>{n}</Code></li>)}</ul>;
  const facts = [
    { term: t('partNumber'), value: <Code className="text-base text-ink">{e.partNumber}</Code> },
    ...(e.equivalents.length ? [{ term: t('equivalents'), value: numbers(e.equivalents) }] : []),
    ...(e.replacements.length ? [{ term: t('replacements'), value: numbers(e.replacements) }] : []),
    ...(e.manufacturer ? [{ term: t('manufacturer'), value: text(e.manufacturer.name) }] : []),
    ...(e.category ? [{ term: t('category'), value: text(e.category.name) }] : []),
    ...(e.vehicleBrands.length ? [{ term: t('brand'), value: e.vehicleBrands.map((b) => text(b.name)).join(L === 'en' ? ', ' : '، ') }] : []),
  ];
  const requestHref = `/request-part?part=${encodeURIComponent(e.name.fa)}&code=${encodeURIComponent(e.partNumber)}`;

  return (
    <div className="container-page py-6 md:py-8">
      <nav aria-label="breadcrumb" className="mb-5 text-sm text-steel">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link href="/catalog" className="underline-offset-4 hover:text-ink hover:underline">{tNav('catalog')}</Link></li>
          {e.category ? (
            <li className="flex items-center gap-1.5">
              <Chevron aria-hidden className="size-3.5" />
              <Link href={`/catalog?category=${e.category.slug}`} className="underline-offset-4 hover:text-ink hover:underline">{text(e.category.name)}</Link>
            </li>
          ) : null}
        </ol>
      </nav>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-x-10">
        <div className="flex flex-col gap-4">
          {e.images.length ? (
            <ProductGallery images={e.images.map((img) => ({ url: img.url, alt: text(img.alt) || name }))} />
          ) : (
            <div className="relative aspect-[5/2] overflow-hidden rounded-[var(--radius-card)] border border-line-soft bg-white sm:aspect-[4/3]">
              <div className="media-placeholder flex h-full flex-col items-center justify-center gap-2 text-steel">
                <ImageOff aria-hidden className="size-10" />
                <span className="text-sm font-medium">{t('noImage')}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div className="part-label p-5 sm:p-6">
            <p className="text-sm text-steel">{t('partNumber')} <Code className="ms-1.5 text-base text-ink">{e.partNumber}</Code></p>
            <h1 className="mt-3 text-2xl font-bold md:text-[1.75rem]">{name}</h1>
            <div className="mt-5 border-t border-line-soft pt-5">
              {e.product ? (
                <ButtonLink href={`/parts/${e.product.slug}`} size="lg" data-testid="catalog-buy"><ShoppingBag aria-hidden className="size-5" />{t('buyInShop')}</ButtonLink>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-sm leading-7 text-steel">{t('notInShop')}</p>
                  <ButtonLink href={requestHref} size="lg" data-testid="catalog-request">{t('requestSupply')}</ButtonLink>
                </div>
              )}
            </div>
          </div>
          <section aria-labelledby="catalog-facts" className="card p-5 sm:p-6">
            <h2 id="catalog-facts" className="sr-only">{t('partNumber')}</h2>
            <DefinitionList items={facts} />
          </section>
        </div>
      </div>

      {e.specs.length ? (
        <section aria-labelledby="catalog-specs" className="mt-8">
          <h2 id="catalog-specs" className="mb-3 text-lg font-bold">{t('specs')}</h2>
          <TableScroll caption={t('specs')}>
            <tbody>
              {e.specs.map((s, i) => (
                <tr key={`${s.label}-${i}`}><th scope="row" className={`${th} w-1/3`}>{s.label}</th><td className={td} dir="auto">{s.value}</td></tr>
              ))}
            </tbody>
          </TableScroll>
        </section>
      ) : null}

      {e.fitments.length ? (
        <section aria-labelledby="catalog-fitment" className="mt-8">
          <h2 id="catalog-fitment" className="mb-3 text-lg font-bold">{t('fitments')}</h2>
          <TableScroll caption={t('fitments')}>
            <thead><tr><th className={th}>{t('vehicle')}</th><th className={th}>{t('model')}</th><th className={th}>{t('years')}</th><th className={th}>{t('note')}</th></tr></thead>
            <tbody>
              {e.fitments.map((f, i) => (
                <tr key={`${f.vehicle.slug}-${f.model?.slug ?? ''}-${i}`}>
                  <td className={td}><Link href={`/cars/${f.vehicle.slug}`} className="font-semibold text-action underline-offset-4 hover:underline">{text(f.vehicle.name)}</Link></td>
                  <td className={td}>{f.model ? text(f.model.name) : <span className="text-steel">{t('wholeVehicle')}</span>}</td>
                  <td className={td}><span dir="ltr">{years(f.yearFrom, f.yearTo)}</span></td>
                  <td className={td}>{f.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        </section>
      ) : null}

      {e.description ? (
        <section aria-labelledby="catalog-description" className="card mt-8 p-5 sm:p-6">
          <h2 id="catalog-description" className="mb-3 text-lg font-bold">{t('description')}</h2>
          <p className="max-w-prose whitespace-pre-line leading-8">{text(e.description) || e.description.fa}</p>
        </section>
      ) : null}
      <p className="mt-6 text-xs leading-6 text-steel">{t('referenceNote')}</p>
    </div>
  );
}
