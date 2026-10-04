import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { serverApiOptional } from '@/lib/api/server';
import { Ltr } from '@/components/ui/misc';

interface Contact {
  phone: string | null;
  email: string | null;
  address: { fa: string | null; en: string | null };
  workingHours: { fa: string | null; en: string | null };
}

/** Only owner-configured contact details are shown; nothing is assumed from brand documents (spec §17). */
export async function SiteFooter() {
  const t = await getTranslations();
  const locale = (await getLocale()) as 'fa' | 'en';
  const contact = await serverApiOptional<Contact>('/site/contact', { publicCache: 300 }).catch(() => null);
  const hasContact = !!(contact?.phone || contact?.email || contact?.address[locale]);
  // Jalali year in Persian (e.g. ۱۴۰۵), Gregorian in English.
  const year = new Intl.DateTimeFormat(locale === 'fa' ? 'fa-IR-u-ca-persian' : 'en-GB', { year: 'numeric', timeZone: 'Asia/Tehran' })
    .format(new Date())
    .replace(/[^\d۰-۹]/g, '');
  return (
    <footer className="on-dark render-lazy mt-16 bg-carbon text-silver">
      <div className="container-page grid gap-8 py-10 md:grid-cols-3">
        <div>
          <p className="text-lg font-extrabold text-white">{locale === 'fa' ? 'هداکس | HEDAX' : 'HEDAX | هداکس'}</p>
          <p className="mt-1 text-sm text-tech-light">{t('meta.tagline')}</p>
          <p className="mt-3 text-sm">{t('footer.about')}</p>
        </div>
        <nav aria-label={t('footer.help')}>
          <p className="mb-2 font-semibold text-white">{t('footer.help')}</p>
          <ul className="space-y-1 text-sm">
            {[
              ['/help/buying', t('footer.buying')],
              ['/help/sourcing', t('footer.sourcing')],
              ['/help/shipping', t('footer.shipping')],
              ['/help/returns', t('footer.returns')],
              ['/privacy', t('footer.privacy')],
              ['/terms', t('footer.terms')],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href as string} className="inline-flex min-h-9 items-center underline-offset-2 hover:underline">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <p className="mb-2 font-semibold text-white">{t('nav.contact')}</p>
          {hasContact ? (
            <ul className="space-y-1 text-sm">
              {contact?.phone ? <li><Ltr>{contact.phone}</Ltr></li> : null}
              {contact?.email ? <li><Ltr>{contact.email}</Ltr></li> : null}
              {contact?.address[locale] ? <li>{contact.address[locale]}</li> : null}
              {contact?.workingHours[locale] ? <li>{contact.workingHours[locale]}</li> : null}
            </ul>
          ) : (
            <p className="text-sm">{t('footer.contactPending')}</p>
          )}
          <Link href="/contact" className="mt-2 inline-flex min-h-9 items-center text-sm underline underline-offset-2">
            {t('nav.contact')}
          </Link>
        </div>
      </div>
      <div className="border-t border-carbon-2">
        <p className="container-page py-4 text-xs">{t('footer.rights', { year })}</p>
      </div>
    </footer>
  );
}
