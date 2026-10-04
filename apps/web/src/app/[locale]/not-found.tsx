import { getTranslations } from 'next-intl/server';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { ButtonLink } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/misc';

/**
 * Localized 404 for unknown addresses and for notFound() (e.g. an unpublished part).
 * Keeps the header, footer and the #main target of the skip link.
 */
export default async function NotFound() {
  const t = await getTranslations();
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <div className="container-page max-w-3xl py-12">
          <PageHeader title={t('common.notFound')} description={t('pages.notFoundHint')} />
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/parts">{t('nav.parts')}</ButtonLink>
            <ButtonLink href="/request-part" variant="secondary">{t('nav.requestPart')}</ButtonLink>
            <ButtonLink href="/" variant="ghost">{t('nav.home')}</ButtonLink>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
