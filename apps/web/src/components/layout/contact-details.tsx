import type { ContactContent } from '@hedax/contracts';
import { localize } from '@hedax/contracts/constants';
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
export function ContactDetails({ contact, locale, variant, linkClassName = '' }: { contact: ContactContent; locale: Locale; variant: 'page' | 'footer'; linkClassName?: string }) {
  const t = useTranslations();
  const link = (href: string, children: ReactNode, external = false) => (
    <a href={href} className={linkClassName} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>
  );
  const items: Array<{ key: string; term: string; value: ReactNode }> = contact.phones.map((p, i) => {
    const shown = locale === 'fa' ? p.numberFa || faDigits(p.number) : p.number;
    const tel = `tel:${p.number.replace(/[^\d+]/g, '')}${p.extension ? `,${p.extension}` : ''}`;
    const ext = p.extension ? <> <span>({t('pages.extension')} {locale === 'fa' ? faDigits(p.extension) : p.extension})</span></> : null;
    return {
      key: `phone-${i}`,
      term: localize(p.label, locale),
      // WhatsApp on its own line: a separator dot next to Persian digits reads like the digit zero (۰).
      value: <>{link(tel, <Ltr>{shown}</Ltr>)}{ext}{p.whatsapp ? <span className="block">{link(`https://wa.me/${p.number.replace(/\D/g, '')}`, t('pages.whatsapp'), true)}</span> : null}</>,
    };
  });
  if (contact.email) items.push({ key: 'email', term: t('pages.email'), value: link(`mailto:${contact.email}`, <Ltr>{contact.email}</Ltr>) });
  const address = localize(contact.address, locale);
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
