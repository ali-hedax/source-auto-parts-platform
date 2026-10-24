import type { VehicleBrandView } from '@hedax/contracts';
import { localize } from '@hedax/contracts/constants';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ChapterBand } from '@/components/store/chapter-band';
import { BrandCard } from '@/components/store/brand-card';
import { serverApi } from '@/lib/api/server';
import { getPublishedBuilder } from '@/lib/builder-server';
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
  const [brands, content, visual] = await Promise.all([serverApi<VehicleBrandView[]>('/catalog/vehicle-brands', { publicCache: 300 }).catch(() => []), getSiteContent(), getPublishedBuilder('home')]);
  // Same brands section as the home page: the published visual home's block (appearance), else site content → home page.
  const other = visual?.sections.find((b) => b.legacy?.type === 'brands')?.legacy ?? content?.home.sections.find((s) => s.type === 'brands');
  const otherTitle = other?.type === 'brands' ? localize(other.otherTitle, locale) : '';
  const otherText = other?.type === 'brands' ? localize(other.otherText, locale) : '';
  const otherHref = other?.type === 'brands' && other.otherHref ? other.otherHref : '/request-part';
  const showNameFa = other?.type === 'brands' ? other.showNameFa !== false : true;
  return (
    <div className="store-page">
      <ChapterBand title={t('nav.brands')} eyebrow="SOURCE · MAKES" {...(otherText ? { description: otherText } : {})} locale={locale} />
      <ul className="container-page grid grid-cols-2 gap-2.5 pb-10 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {brands.map((b) => (
          <li key={b.slug}>
            <BrandCard href={`/brands/${b.slug}`} logo={b.logoUrl ?? vehicleBrandLogo(b.slug)} nameEn={b.name.en} nameFa={b.name.fa} showNameFa={showNameFa} meta={t('common.partCount', { count: b.productCount })} locale={locale} />
          </li>
        ))}
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
