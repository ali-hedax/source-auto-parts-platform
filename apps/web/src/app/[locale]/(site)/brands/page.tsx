import type { VehicleBrandView } from '@hedax/contracts';
import { localize } from '@hedax/contracts/constants';
import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ChapterBand } from '@/components/store/chapter-band';
import { serverApi } from '@/lib/api/server';
import { getSiteContent, seoMetadata } from '@/lib/site-content';
import { vehicleBrandLogo } from '@/lib/vehicle-brand-logos';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return { ...seoMetadata(await getSiteContent(), 'brands', locale, t('nav.brands')), alternates: { canonical: `/${locale}/brands`, languages: { fa: '/fa/brands', en: '/en/brands' } } };
}

export default async function BrandsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const [brands, content] = await Promise.all([serverApi<VehicleBrandView[]>('/catalog/vehicle-brands', { publicCache: 300 }).catch(() => []), getSiteContent()]);
  // The "other brands" card uses the same texts as the home page (site content → home page → brands).
  const other = content?.home.sections.find((s) => s.type === 'brands');
  const otherTitle = other?.type === 'brands' ? localize(other.otherTitle, locale) : '';
  const otherText = other?.type === 'brands' ? localize(other.otherText, locale) : '';
  const otherHref = other?.type === 'brands' && other.otherHref ? other.otherHref : '/request-part';
  return (
    <div className="store-page">
      <ChapterBand title={t('nav.brands')} eyebrow="SOURCE · MAKES" {...(otherText ? { description: otherText } : {})} locale={locale} />
      <ul className="container-page grid grid-cols-2 gap-2.5 pb-10 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {brands.map((b) => {
          const logo = vehicleBrandLogo(b.slug);
          const label = locale === 'en' ? (b.name.en ?? b.name.fa) : b.name.fa;
          return (
            <li key={b.slug}>
              <Link href={`/brands/${b.slug}`} className="store-card store-rise flex h-full min-h-32 flex-col justify-between gap-3 px-4 py-4 sm:px-5">
                {logo ? (
                  <span className="studio grid h-16 place-items-center rounded-[calc(var(--radius-card)-6px)]"><Image src={logo} alt={label} width={140} height={44} unoptimized className="h-10 w-auto max-w-[8.75rem] object-contain mix-blend-multiply" /></span>
                ) : (
                  <span className="text-lg font-bold leading-7">{label}</span>
                )}
                <span className="text-sm text-steel">{t('common.partCount', { count: b.productCount })}</span>
              </Link>
            </li>
          );
        })}
        {otherTitle ? <li>
          <Link href={otherHref} className="flex h-full min-h-32 flex-col justify-center gap-1 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-white/60 px-4 py-4 transition-colors hover:border-action hover:bg-action-soft sm:px-5">
            <span className="text-lg font-bold leading-7 text-action">{otherTitle}</span>
            {otherText ? <span className="text-sm leading-6 text-steel">{otherText}</span> : null}
          </Link>
        </li> : null}
      </ul>
    </div>
  );
}
