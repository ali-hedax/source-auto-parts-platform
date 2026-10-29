import { localize } from '@hedax/contracts/constants';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import type { BuilderDocument, SiteContentView } from '@hedax/contracts';
import { Link } from '@/i18n/navigation';
const DEFAULT_LOGO = '/brand/source/titanium/logo.webp';
import { CONTACT_CHANNEL_ORDER, channelHref, channelText, resolveContactChannels, type ContactChannelKey } from '@hedax/contracts/constants';
import { ContactIcon, type ContactIconName } from './contact-icons';

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
  return (
    <footer className="titanium-footer render-lazy text-sm">
      <div className="container-page titanium-footer-grid">
        <div className="titanium-footer-brand max-w-sm">
          <Image src={chrome?.logo?.onLightUrl || (brand?.logoUrl && brand.logoUrl !== '/brand/source/logo-dark.png' ? brand.logoUrl : DEFAULT_LOGO)} width={600} height={191} unoptimized alt={localize(brand?.logoAlt, locale) || localize(brand?.siteName, locale)} className="titanium-footer-logo" style={chrome?.logo?.onLightUrl ? { filter: 'none' } : undefined} />
          {tagline ? <p className="mt-4 font-medium text-signal">{tagline}</p> : null}
          {about ? <p className="mt-2 leading-7">{about}</p> : null}

        </div>
        <nav className="titanium-footer-quick" aria-label={t('common.menu')}>
          <p className="mb-3 font-bold">{locale === 'fa' ? 'دسترسی سریع' : 'Quick links'}</p>
          <ul>{[{ href: '/', label: t('nav.home') }, ...(chrome?.menu.length ? chrome.menu.filter(n => n.visible && n.href).map(n => ({ href: n.href, label: localize(n.label, locale) })) : [{ href: '/parts', label: t('nav.parts') }, { href: '/cars', label: t('nav.cars') }, { href: '/brands', label: t('nav.brands') }])].map(n => <li key={n.href}><Link href={n.href} className={link}>{n.label}</Link></li>)}</ul>
        </nav>
        <nav className="titanium-footer-help" aria-label={t('footer.help')}>
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
        <div className="titanium-footer-contact">
          <p className="mb-3 font-bold">{t('nav.contact')}</p>
          {content ? <FooterContact content={content} locale={locale} /> : null}
        </div>
      </div>
      {copyright ? (
        <div className="titanium-copyright">
          <p className="container-page py-4 text-xs text-silver/80">{copyright}</p>
        </div>
      ) : null}
    </footer>
  );
}

/**
 * The footer's contact column: phone, mobile, WhatsApp, Telegram, Bale, Instagram (each from its own
 * field in Admin → content → contact), then e-mail, hours and address. Empty channels are left out,
 * so nothing is duplicated and no placeholder icons are shown.
 */
function FooterContact({ content, locale }: { content: SiteContentView; locale: 'fa' | 'en' }) {
  const fa = locale === 'fa';
  const contact = content.contact;
  const ch = resolveContactChannels(contact, content.social.links);
  const names: Record<ContactChannelKey, string> = fa
    ? { phone: 'تلفن', mobile: 'موبایل', whatsapp: 'واتس‌اپ', telegram: 'تلگرام', bale: 'بله', instagram: 'اینستاگرام' }
    : { phone: 'Phone', mobile: 'Mobile', whatsapp: 'WhatsApp', telegram: 'Telegram', bale: 'Bale', instagram: 'Instagram' };
  const external = (k: ContactChannelKey) => k !== 'phone' && k !== 'mobile';
  const address = localize(contact.address, locale);
  // Older content kept the Instagram handle in the address field; don't show it twice.
  const showAddress = address && !(ch.instagram && /اینستاگرام|instagram/i.test(address));
  const hours = localize(contact.hours, locale);
  const rows = CONTACT_CHANNEL_ORDER.filter((k) => ch[k]).map((k) => ({
    key: k, icon: k as ContactIconName, label: names[k], href: channelHref(k, ch[k], k === 'phone' ? ch.phoneExtension : '')!, external: external(k),
    value: <><bdi dir="ltr">{channelText(k, ch[k])}</bdi>{k === 'phone' && ch.phoneExtension ? <span className="footer-contact-ext">{fa ? 'داخلی' : 'ext.'} {ch.phoneExtension}</span> : null}</>,
  }));
  return <ul className="footer-contact-list" data-testid="footer-contact">
    {rows.map((r) => <li key={r.key}><a className="footer-contact-row" href={r.href} {...(r.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}><ContactIcon name={r.icon} /><span className="footer-contact-text"><span className="footer-contact-label">{r.label}</span><span className="footer-contact-value">{r.value}</span></span></a></li>)}
    {contact.email ? <li><a className="footer-contact-row" href={`mailto:${contact.email}`}><ContactIcon name="email" /><span className="footer-contact-text"><span className="footer-contact-label">{fa ? 'ایمیل' : 'Email'}</span><span className="footer-contact-value"><bdi dir="ltr">{contact.email}</bdi></span></span></a></li> : null}
    {hours ? <li><div className="footer-contact-row"><ContactIcon name="hours" /><span className="footer-contact-text"><span className="footer-contact-label">{fa ? 'ساعت پاسخ‌گویی' : 'Support hours'}</span><span className="footer-contact-value">{hours}</span></span></div></li> : null}
    {showAddress ? <li><div className="footer-contact-row"><ContactIcon name="address" /><span className="footer-contact-text"><span className="footer-contact-label">{fa ? 'آدرس' : 'Address'}</span><span className="footer-contact-value">{address}</span></span></div></li> : null}
  </ul>;
}
