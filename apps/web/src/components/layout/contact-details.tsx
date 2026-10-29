import type { ContactContent } from '@hedax/contracts';
import { CONTACT_CHANNEL_ORDER, channelHref, channelText, localize, resolveContactChannels, type ContactChannelKey } from '@hedax/contracts/constants';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { DefinitionList, Ltr } from '@/components/ui/misc';
const faDigits = (text: string) => text.replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);

type Locale = 'fa' | 'en';

/** Map link: the address entered in the panel, or the coordinates on OpenStreetMap. */
function mapHref(c: ContactContent): string | null {
  if (c.mapUrl) return c.mapUrl;
  if (c.mapLat !== null && c.mapLng !== null) return `https://www.openstreetmap.org/?mlat=${c.mapLat}&mlon=${c.mapLng}#map=17/${c.mapLat}/${c.mapLng}`;
  return null;
}

/**
 * The contact details edited under site content → contact, used by the footer and the contact
 * page so both always show the same thing. Numbers sit in a left-to-right isolate so their digits
 * and "+" never reorder inside Persian text. Empty items are left out.
 */
export function ContactDetails({ contact, social = [], locale, variant, linkClassName = '' }: { contact: ContactContent; social?: Array<{ network: string; url: string }>; locale: Locale; variant: 'page' | 'footer'; linkClassName?: string }) {
  const t = useTranslations();
  const link = (href: string, children: ReactNode, external = false) => (
    // On the contact page each link is a full touch target (44 px), not just its line of text.
    <a href={href} className={`${variant === 'page' ? 'inline-flex min-h-11 items-center ' : ''}${linkClassName}`} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>
  );
  // Same channels and order as the footer (phone, mobile, WhatsApp, Telegram, Bale, Instagram).
  const ch = resolveContactChannels(contact, social);
  const names: Record<ContactChannelKey, string> = locale === 'fa'
    ? { phone: 'تلفن', mobile: 'موبایل', whatsapp: 'واتس‌اپ', telegram: 'تلگرام', bale: 'بله', instagram: 'اینستاگرام' }
    : { phone: 'Phone', mobile: 'Mobile', whatsapp: 'WhatsApp', telegram: 'Telegram', bale: 'Bale', instagram: 'Instagram' };
  const items: Array<{ key: string; term: string; value: ReactNode }> = CONTACT_CHANNEL_ORDER.filter((k) => ch[k]).map((k) => {
    const text = channelText(k, ch[k]);
    const shown = locale === 'fa' && (k === 'phone' || k === 'mobile') ? faDigits(text) : text;
    const ext = k === 'phone' && ch.phoneExtension ? <> <span>({t('pages.extension')} {locale === 'fa' ? faDigits(ch.phoneExtension) : ch.phoneExtension})</span></> : null;
    return { key: k, term: names[k], value: <>{link(channelHref(k, ch[k], k === 'phone' ? ch.phoneExtension : '')!, <Ltr>{shown}</Ltr>, k !== 'phone' && k !== 'mobile')}{ext}</> };
  });
  if (contact.email) items.push({ key: 'email', term: t('pages.email'), value: link(`mailto:${contact.email}`, <Ltr>{contact.email}</Ltr>) });
  const rawAddress = localize(contact.address, locale);
  // Older content kept the Instagram handle in the address field; don't show it twice.
  const address = ch.instagram && /اینستاگرام|instagram/i.test(rawAddress) ? '' : rawAddress;
  const map = mapHref(contact);
  if (address || map) items.push({ key: 'address', term: t('pages.address'), value: <>{address ? <span className="block">{address}</span> : null}{map ? link(map, t('pages.viewOnMap'), true) : null}</> });
  const hours = localize(contact.hours, locale);
  if (hours) items.push({ key: 'hours', term: t('pages.hours'), value: hours });
  if (!items.length) return null;
  if (variant === 'page') return <DefinitionList items={items.map(({ term, value }) => ({ term, value }))} />;
  return (
    <ul className="space-y-2 leading-7" data-testid="footer-contact">
      {items.map(({ key, term, value }) => (
        <li key={key}>
          <span className="block text-xs text-silver/70">{term}</span>
          <span>{value}</span>
        </li>
      ))}
    </ul>
  );
}
