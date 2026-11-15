import { SearchX } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/layout/site-header';
import { StoreShell } from '@/components/layout/store-shell';
import { ButtonLink } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/misc';

/**
 * Localized 404 for unknown addresses and for notFound() (e.g. an unpublished part).
 * Inside the same storefront frame as every page (header, #main for the skip link, footer and the store's
 * styles); without it the header showed unstyled on live 404 pages.
 */
export default async function NotFound() {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  return (
    <StoreShell header={<SiteHeader />} locale={locale}>
      <div className="container-page max-w-3xl py-12 md:py-16">
        <span className="mb-5 grid size-14 place-items-center rounded-full bg-canvas text-steel"><SearchX aria-hidden className="size-7" /></span>
        <PageHeader title={t('common.notFound')} description={t('pages.notFoundHint')} />
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/parts">{t('nav.parts')}</ButtonLink>
          <ButtonLink href="/request-part" variant="secondary">{t('nav.requestPart')}</ButtonLink>
          <ButtonLink href="/" variant="ghost">{t('nav.home')}</ButtonLink>
        </div>
      </div>
    </StoreShell>
  );
}
