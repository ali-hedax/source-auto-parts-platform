import { localize } from '@hedax/contracts/constants';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import type { BuilderDocument, SiteContentView } from '@hedax/contracts';
import { Link } from '@/i18n/navigation';
const DEFAULT_LOGO = '/brand/source/logo-dark.png';
import { ContactDetails } from './contact-details';
import type { CSSProperties } from 'react';

/** Footer: logo, tagline, help links, the owner's pages, social links and contact details (all from site content). */
export function SiteFooterView({ content, chrome, now }: { content: SiteContentView | null; chrome?: BuilderDocument['chrome'] | undefined; now: number }) {
  const t = useTranslations();
  const locale = useLocale() as 'fa' | 'en';
  // Jalali year in Persian (e.g. ۱۴۰۵), Gregorian in English.
  const year = new Intl.DateTimeFormat(locale === 'fa' ? 'fa-IR-u-ca-persian' : 'en-GB', { year: 'numeric', timeZone: 'Asia/Tehran' })
    .format(new Date(now))
    .replace(/[^\d۰-۹]/g, '');
  // 44 px rows: every footer link is a comfortable touch target.
  const link = 'inline-flex min-h-11 items-center text-[0.9375rem] text-white/85 underline-offset-4 transition-colors hover:text-white hover:underline';
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
    <footer style={chrome ? { background: chrome.footerBackground, '--footer-columns': chrome.footerColumns } as CSSProperties : undefined} className="on-dark render-lazy border-t border-white/10 bg-stage text-sm text-silver">
      <div className={`container-page grid gap-10 py-12 ${chrome ? 'md:grid-cols-[repeat(var(--footer-columns),minmax(0,1fr))]' : 'md:grid-cols-[1.3fr_1fr_1fr]'}`}>
        <div className="max-w-sm">
          <Image src={brand?.logoUrl || DEFAULT_LOGO} width={600} height={191} unoptimized alt={localize(brand?.logoAlt, locale) || localize(brand?.siteName, locale)} className="h-10 w-auto" />
          {tagline ? <p className="mt-4 font-medium text-signal">{tagline}</p> : null}
          {about ? <p className="mt-2 leading-7">{about}</p> : null}
          {social.length ? (
            <nav aria-label={t('pages.social')} className="mt-4">
              <ul className="flex flex-wrap gap-2">
                {social.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-sm text-white/90 transition-colors hover:border-signal hover:text-white">
                      <SocialIcon network={s.network} />
                      {s.network === 'other' ? localize(s.label, locale) || t('social.other') : t(`social.${s.network}`)}
                    </a>
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

/** Small line icons for the common networks (no icon font or extra package); others show the label only. */
function SocialIcon({ network }: { network: string }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (network === 'instagram') return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" /></svg>;
  if (network === 'linkedin') return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7" /></svg>;
  return null;
}
