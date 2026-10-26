import { localize } from '@hedax/contracts/constants';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import type { BuilderDocument, SiteContentView } from '@hedax/contracts';
import { Link } from '@/i18n/navigation';
const DEFAULT_LOGO = '/brand/source/titanium/logo.webp';
import { Phone, Mail, MapPin, Clock3 } from 'lucide-react';

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
          <Image src={brand?.logoUrl && brand.logoUrl !== '/brand/source/logo-dark.png' ? brand.logoUrl : DEFAULT_LOGO} width={600} height={191} unoptimized alt={localize(brand?.logoAlt, locale) || localize(brand?.siteName, locale)} className="titanium-footer-logo" />
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
          <Link href="/contact" className={`${link} mt-2 underline`}>
            {t('nav.contact')}
          </Link>
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

/** Keep missing destinations visible without inventing links or account handles. */
function FooterContact({ content, locale }: { content: SiteContentView; locale: 'fa' | 'en' }) {
  const fa = locale === 'fa';
  const contact = content.contact;
  const phone = contact.phones.find(p => p.whatsapp);
  const networks = [
    { network: 'whatsapp', label: fa ? 'واتس‌اپ' : 'WhatsApp' },
    { network: 'instagram', label: fa ? 'اینستاگرام' : 'Instagram' },
    { network: 'linkedin', label: fa ? 'لینکدین' : 'LinkedIn' },
    { network: 'telegram', label: fa ? 'تلگرام' : 'Telegram' },
    { network: 'bale', label: fa ? 'بله' : 'Bale' },
  ];
  const row = 'titanium-contact-row';
  return <div className="titanium-contact-details" data-testid="footer-contact">
    <ul className="titanium-contact-list">
      {phone ? <li className={row}><SocialIcon network="whatsapp" /><div><span className="titanium-contact-label">{fa ? 'واتس‌اپ' : 'WhatsApp'}</span><a href={`https://wa.me/${phone.number.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"><bdi dir="ltr">{phone.number}</bdi></a></div></li> : null}
      {contact.phones.map((p, i) => <li className={row} key={i}><Phone aria-hidden size={18} /><div><span className="titanium-contact-label">{localize(p.label, locale) || (fa ? 'تلفن' : 'Phone')}</span><a href={`tel:${p.number.replace(/[^\d+]/g, '')}${p.extension ? `,${p.extension}` : ''}`}><bdi dir="ltr">{p.number}</bdi>{p.extension ? <span className="titanium-contact-extension">{fa ? 'داخلی' : 'ext.'} {p.extension}</span> : null}</a></div></li>)}
      <li className={row}><Mail aria-hidden size={18} /><div><span className="titanium-contact-label">{fa ? 'ایمیل' : 'Email'}</span>{contact.email ? <a href={`mailto:${contact.email}`}><bdi dir="ltr">{contact.email}</bdi></a> : <span>—</span>}</div></li>
      <li className={row}><Clock3 aria-hidden size={18} /><div><span className="titanium-contact-label">{fa ? 'ساعت پاسخ‌گویی' : 'Support hours'}</span><span>{localize(contact.hours, locale) || '—'}</span></div></li>
      <li className={row}><MapPin aria-hidden size={18} /><div><span className="titanium-contact-label">{fa ? 'آدرس' : 'Address'}</span><span>{localize(contact.address, locale) || (fa ? 'هنوز ثبت نشده' : 'Not yet provided')}</span></div></li>
    </ul>
    <nav aria-label={fa ? 'شبکه‌های اجتماعی' : 'Social networks'} className="titanium-social-row">
      {networks.map(({ network, label }) => {
        const entry = content.social.links.find(s => s.network === network || (network === 'bale' && s.network === 'other' && /^https?:\/\/(?:www\.)?bale\.ai(?:\/|$)/i.test(s.url)));
        const url = entry?.url || (network === 'whatsapp' && phone ? `https://wa.me/${phone.number.replace(/\D/g, '')}` : null);
        return url ? <a key={network} href={url} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}><SocialIcon network={network} /></a> : <span key={network} className="titanium-social-pending" role="img" aria-label={`${label} — ${fa ? 'لینک هنوز ثبت نشده' : 'link not yet provided'}`} title={`${label} — ${fa ? 'لینک هنوز ثبت نشده' : 'link not yet provided'}`}><SocialIcon network={network} /></span>;
      })}
      {content.social.links.filter(s => !networks.some(n => n.network === s.network) && !(s.network === 'other' && /^https?:\/\/(?:www\.)?bale\.ai(?:\/|$)/i.test(s.url))).map(s => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="titanium-social-extra">{localize(s.label, locale) || s.network}</a>)}
    </nav>
  </div>;
}

function SocialIcon({ network }: { network: string }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (network === 'instagram') return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" /></svg>;
  if (network === 'linkedin') return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7" /></svg>;
  if (network === 'telegram') return <svg {...common}><path d="m21 3-4 18-6-5-4 3 1-6L3 11 21 3ZM8 13 17 7l-6 9" /></svg>;
  if (network === 'bale') return <svg {...common}><path d="M5 18 3 21l1-6a9 9 0 1 1 4 5" /><path d="M7 10v2c0 3 10 3 10 0v-2M12 17h.01" /></svg>;
  return <svg {...common}><path d="m4 16-1 5 5-1a9 9 0 1 0-4-4Z" /><path d="M8 7c0 5 4 9 9 9l1-3-3-1-1 1-3-3 1-1-1-3-3 1Z" /></svg>;
}
