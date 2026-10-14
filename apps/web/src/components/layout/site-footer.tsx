import { localize } from '@hedax/contracts/constants';
import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { DEFAULT_LOGO, getSiteContent } from '@/lib/site-content';
import { ContactDetails } from './contact-details';

/** Footer: logo, tagline, help links, the owner's pages, social links and contact details (all from site content). */
export async function SiteFooter() {
  const t = await getTranslations();
  const locale = (await getLocale()) as 'fa' | 'en';
  const content = await getSiteContent();
  // Jalali year in Persian (e.g. ۱۴۰۵), Gregorian in English.
  const year = new Intl.DateTimeFormat(locale === 'fa' ? 'fa-IR-u-ca-persian' : 'en-GB', { year: 'numeric', timeZone: 'Asia/Tehran' })
    .format(new Date())
    .replace(/[^\d۰-۹]/g, '');
  const link = 'inline-flex min-h-9 items-center text-silver/90 underline-offset-4 transition-colors hover:text-white hover:underline';
  const brand = content?.brand;
  const helpLinks: Array<[string, string]> = [
    ['/help/buying', t('footer.buying')],
    ['/help/sourcing', t('footer.sourcing')],
    ['/help/shipping', t('footer.shipping')],
    ['/help/returns', t('footer.returns')],
    ['/privacy', t('footer.privacy')],
    ['/terms', t('footer.terms')],
    ...(content?.footerPages ?? []).map((p): [string, string] => [p.slug === 'about' ? '/about' : `/pages/${p.slug}`, localize(p.title, locale)]),
  ];
  const tagline = localize(brand?.tagline, locale);
  const about = localize(brand?.footerAbout, locale);
  const copyright = localize(brand?.copyright, locale).replaceAll('{year}', year);
  const social = content?.social.links ?? [];
  return (
    <footer className="on-dark render-lazy bg-carbon text-sm text-silver">
      <div className="container-page grid gap-10 py-12 md:grid-cols-[1.3fr_1fr_1fr]">
        <div className="max-w-sm">
          <Image src={brand?.logoUrl || DEFAULT_LOGO} width={600} height={191} unoptimized alt={localize(brand?.logoAlt, locale) || localize(brand?.siteName, locale)} className="h-10 w-auto" />
          {tagline ? <p className="mt-4 font-medium text-tech-light">{tagline}</p> : null}
          {about ? <p className="mt-2 leading-7">{about}</p> : null}
          {social.length ? (
            <nav aria-label={t('pages.social')} className="mt-4">
              <ul className="flex flex-wrap gap-x-4">
                {social.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className={link}>{s.network === 'other' ? localize(s.label, locale) || t('social.other') : t(`social.${s.network}`)}</a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>
        <nav aria-label={t('footer.help')}>
          <p className="mb-3 font-bold text-white">{t('footer.help')}</p>
          <ul className="grid grid-cols-2 gap-x-6 md:grid-cols-1">
            {helpLinks.map(([href, label]) => (
              <li key={href}>
                <Link href={href} className={link}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <p className="mb-3 font-bold text-white">{t('nav.contact')}</p>
          {content ? <ContactDetails contact={content.contact} locale={locale} variant="footer" linkClassName={link} /> : null}
          <Link href="/contact" className={`${link} mt-2 underline`}>
            {t('nav.contact')}
          </Link>
        </div>
      </div>
      {copyright ? (
        <div className="border-t border-white/10">
          <p className="container-page py-4 text-xs text-silver/80">{copyright}</p>
        </div>
      ) : null}
    </footer>
  );
}
