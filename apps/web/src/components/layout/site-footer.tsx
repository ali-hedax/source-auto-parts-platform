import Image from 'next/image';
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
  const link = 'inline-flex min-h-9 items-center text-silver/90 underline-offset-4 transition-colors hover:text-white hover:underline';
  return (
    <footer className="on-dark render-lazy bg-carbon text-sm text-silver">
      <div className="container-page grid gap-10 py-12 md:grid-cols-[1.3fr_1fr_1fr]">
        <div className="max-w-sm">
          <Image src="/brand/source/logo-dark.png" width={600} height={191} unoptimized alt={locale === 'fa' ? 'سورس — محصولی از هداکس' : 'Source by HEDAX'} className="h-10 w-auto" />
          <p className="mt-4 font-medium text-tech-light">{t('meta.tagline')}</p>
          <p className="mt-2 leading-7">{t('footer.about')}</p>
        </div>
        <nav aria-label={t('footer.help')}>
          <p className="mb-3 font-bold text-white">{t('footer.help')}</p>
          <ul className="grid grid-cols-2 gap-x-6 md:grid-cols-1">
            {[
              ['/help/buying', t('footer.buying')],
              ['/help/sourcing', t('footer.sourcing')],
              ['/help/shipping', t('footer.shipping')],
              ['/help/returns', t('footer.returns')],
              ['/privacy', t('footer.privacy')],
              ['/terms', t('footer.terms')],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href as string} className={link}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <p className="mb-3 font-bold text-white">{t('nav.contact')}</p>
          {hasContact ? (
            <ul className="space-y-1.5 leading-7">
              {contact?.phone ? <li><Ltr>{contact.phone}</Ltr></li> : null}
              {contact?.email ? <li><Ltr>{contact.email}</Ltr></li> : null}
              {contact?.address[locale] ? <li>{contact.address[locale]}</li> : null}
              {contact?.workingHours[locale] ? <li>{contact.workingHours[locale]}</li> : null}
            </ul>
          ) : (
            <p className="leading-7 text-silver/90">{t('footer.contactPending')}</p>
          )}
          <Link href="/contact" className={`${link} mt-2 underline`}>
            {t('nav.contact')}
          </Link>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="container-page py-4 text-xs text-silver/80">{t('footer.rights', { year })}</p>
      </div>
    </footer>
  );
}
