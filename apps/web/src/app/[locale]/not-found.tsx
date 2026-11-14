import { ClipboardList, Home, Package, SearchX } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { SiteHeader } from '@/components/layout/site-header';
import { StoreShell } from '@/components/layout/store-shell';
import { PartSearch } from '@/components/store/part-search';

/**
 * Localized 404 for unknown addresses and notFound() (e.g. an unpublished part), inside the normal
 * storefront frame; the response status stays 404. A search box and the three likely next steps.
 */
export default async function NotFound() {
  const t = await getTranslations();
  const locale = (await getLocale()) as 'fa' | 'en';
  return (
    <StoreShell header={<SiteHeader />} locale={locale}>
      <div className="container-page su-notfound">
        <span className="su-notfound-icon" aria-hidden><SearchX size={32} /></span>
        <h1>{t('common.notFound')}</h1>
        <p>{t('pages.notFoundHint')}</p>
        <PartSearch locale={locale} variant="hero" idPrefix="notfound-search" />
        <div className="su-actions">
          <Link href="/" className="su-btn su-btn-secondary"><Home aria-hidden size={18} />{t('nav.home')}</Link>
          <Link href="/parts" className="su-btn su-btn-outline"><Package aria-hidden size={18} />{t('nav.parts')}</Link>
          <Link href="/request-part" className="su-btn su-btn-outline"><ClipboardList aria-hidden size={18} />{t('nav.requestPart')}</Link>
        </div>
      </div>
    </StoreShell>
  );
}
