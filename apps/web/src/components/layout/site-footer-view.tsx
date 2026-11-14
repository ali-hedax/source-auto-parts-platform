import { localize, resolveContactChannels, channelText } from '@hedax/contracts/constants';
import { useLocale, useTranslations } from 'next-intl';
import type { BuilderDocument, SiteContentView } from '@hedax/contracts';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { faDigits, iranNumberText, isLegacyHours, telHref, whatsappHref, whatsappText } from '@/lib/contact-format';
import { ContactIcon, type ContactIconName } from './contact-icons';
import { InstallApp } from './pwa';

const DEFAULT_LOGO = '/brand/source/atelier/logo.webp';

/**
 * Footer: introduction (logo, short text, warehouse address, room for the trust seal), quick links,
 * guide pages and contact details. Every text and number comes from site content in the panel
 * (general → brand, contact, text pages); only the link labels are built in.
 */
export function SiteFooterView({ content, chrome, now }: { content: SiteContentView | null; chrome?: BuilderDocument['chrome'] | undefined; now: number }) {
  const t = useTranslations();
  const locale = useLocale() as 'fa' | 'en';
  const fa = locale === 'fa';
  const year = new Intl.DateTimeFormat(fa ? 'fa-IR-u-ca-persian' : 'en-GB', { year: 'numeric', timeZone: 'Asia/Tehran' }).format(new Date(now)).replace(/[^\d۰-۹]/g, '');
  const brand = content?.brand;
  const about = localize(brand?.footerAbout, locale);
  const copyright = localize(brand?.copyright, locale).replaceAll('{year}', year);
  const rawAddress = content ? localize(content.contact.address, locale) : '';
  // Older content kept the Instagram handle in the address field; that is not an address.
  const address = /اینستاگرام|instagram/i.test(rawAddress) ? '' : rawAddress;
  const logo = chrome?.logo?.onLightUrl || DEFAULT_LOGO;
  const quick: Array<[string, string]> = [
    ['/parts', t('nav.parts')], ['/imported-parts', t('nav.imported')], ['/cars', t('nav.cars')], ['/brands', t('nav.brands')], ['/request-part', t('nav.requestPart')],
  ];
  const guide: Array<[string, string]> = [
    ['/about', t('footer.about')], ['/contact', t('footer.contact')], ['/help/buying', t('footer.buying')], ['/help/shipping', t('footer.shipping')],
    ['/help/returns', t('footer.returns')], ['/terms', t('footer.terms')], ['/privacy', t('footer.privacy')],
    ...(content?.footerPages ?? []).filter((p) => p.slug !== 'about').map((p): [string, string] => [`/pages/${p.slug}`, localize(p.title, locale)]),
  ];
  return (
    <footer className="su-footer">
      <div className="container-page su-footer-grid">
        <div className="su-footer-intro">
          <img src={logo} alt={localize(brand?.logoAlt, locale) || 'Source by HEDAX'} width={1100} height={368} loading="lazy" decoding="async" className="su-footer-logo" />
          {about ? <p>{about}</p> : null}
          {address ? <p className="su-footer-address"><ContactIcon name="address" /><span>{address}</span></p> : null}
          {/* Reserved for the e-Namad trust seal once it is issued. */}
          <div className="su-trust-slot" data-slot="trust-seal" aria-hidden />
        </div>
        <nav aria-labelledby="footer-quick">
          <h2 id="footer-quick">{t('footer.links')}</h2>
          <ul>{quick.map(([href, label]) => <li key={href}><Link href={href}>{label}</Link></li>)}</ul>
        </nav>
        <nav aria-labelledby="footer-guide">
          <h2 id="footer-guide">{t('footer.help')}</h2>
          <ul>{guide.map(([href, label]) => <li key={href}><Link href={href}>{label}</Link></li>)}</ul>
        </nav>
        <div>
          <h2>{t('nav.contact')}</h2>
          {content ? <FooterContact content={content} locale={locale} /> : null}
          <InstallApp className="su-footer-install" />
        </div>
      </div>
      {copyright ? <div className="su-footer-copy"><p className="container-page">{copyright}</p></div> : null}
    </footer>
  );
}

function Row({ icon, label, children, href, external }: { icon: ContactIconName; label: string; children: ReactNode; href?: string; external?: boolean }) {
  const body = <><ContactIcon name={icon} /><span className="su-contact-text"><span className="su-contact-label">{label}</span><span className="su-contact-value">{children}</span></span></>;
  return <li>{href ? <a className="su-contact-row" href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{body}</a> : <div className="su-contact-row">{body}</div>}</li>;
}

/** Contact column, in the order phone, mobile, WhatsApp, Bale, Telegram, Instagram, e-mail, hours. Empty channels are left out. */
function FooterContact({ content, locale }: { content: SiteContentView; locale: 'fa' | 'en' }) {
  const fa = locale === 'fa';
  const ch = resolveContactChannels(content.contact, content.social.links);
  const hours = localize(content.contact.hours, locale);
  const phoneHours = hours && !isLegacyHours(hours) ? hours : '';
  return <ul className="su-contact" data-testid="footer-contact">
    {ch.phone ? <Row icon="phone" label={fa ? 'تلفن' : 'Phone'} href={telHref(ch.phone, ch.phoneExtension)}>
      <bdi dir="ltr">{iranNumberText(ch.phone, locale)}</bdi>{ch.phoneExtension ? <span className="su-contact-ext"> ({fa ? `داخلی ${faDigits(ch.phoneExtension)}` : `ext. ${ch.phoneExtension}`})</span> : null}
    </Row> : null}
    {ch.mobile ? <Row icon="mobile" label={fa ? 'موبایل' : 'Mobile'} href={telHref(ch.mobile)}><bdi dir="ltr">{iranNumberText(ch.mobile, locale)}</bdi></Row> : null}
    {ch.whatsapp ? <Row icon="whatsapp" label={fa ? 'واتس‌اپ' : 'WhatsApp'} href={whatsappHref(ch.whatsapp)} external><bdi dir="ltr">{whatsappText(ch.whatsapp)}</bdi></Row> : null}
    {ch.bale ? <Row icon="bale" label={fa ? 'بله' : 'Bale'} href={/^https:/i.test(ch.bale) ? ch.bale : `https://ble.ir/${ch.bale.replace(/^@/, '')}`} external><bdi dir="ltr">{channelText('bale', ch.bale)}</bdi></Row> : null}
    {ch.telegram ? <Row icon="telegram" label={fa ? 'تلگرام' : 'Telegram'} href={/^https:/i.test(ch.telegram) ? ch.telegram : `https://t.me/${ch.telegram.replace(/^@/, '')}`} external><bdi dir="ltr">{channelText('telegram', ch.telegram)}</bdi></Row> : null}
    {ch.instagram ? <Row icon="instagram" label={fa ? 'اینستاگرام' : 'Instagram'} href={/^https:/i.test(ch.instagram) ? ch.instagram : `https://instagram.com/${ch.instagram.replace(/^@/, '')}`} external><bdi dir="ltr">{channelText('instagram', ch.instagram)}</bdi></Row> : null}
    {content.contact.email ? <Row icon="email" label={fa ? 'ایمیل' : 'Email'} href={`mailto:${content.contact.email}`}><bdi dir="ltr">{content.contact.email}</bdi></Row> : null}
    <Row icon="hours" label={fa ? 'ساعت پاسخ‌گویی' : 'Response hours'}>
      <span className="block">{fa ? 'هکسی: ۲۴ ساعته' : 'Hexi: 24 hours'}</span>
      {phoneHours ? <span className="block">{fa ? 'تلفن' : 'Phone'}: {phoneHours}</span> : null}
    </Row>
  </ul>;
}
