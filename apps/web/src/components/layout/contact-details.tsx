import { SITE_CONTACT } from '@hedax/contracts/site-contact';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { DefinitionList, Ltr } from '@/components/ui/misc';

type Locale = 'fa' | 'en';

/**
 * The site's contact details from the single config file (SITE_CONTACT), used by the footer and the
 * contact page so both always show the same thing. Numbers sit in a left-to-right isolate so their
 * digits and "+" never reorder inside Persian text.
 */
export async function ContactDetails({ locale, variant, linkClassName = '' }: { locale: Locale; variant: 'page' | 'footer'; linkClassName?: string }) {
  const t = await getTranslations();
  const c = SITE_CONTACT;
  const phone = c.phone[locale];
  const link = (href: string, children: ReactNode, external = false) => (
    <a href={href} className={linkClassName} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>
  );
  const items: Array<{ key: string; term: string; value: ReactNode }> = [
    {
      key: 'phone',
      term: t('pages.phone'),
      value: <>{link(c.phone.href, <Ltr>{phone.number}</Ltr>)} <span>({phone.extension})</span></>,
    },
    {
      key: 'mobile',
      term: t('pages.mobileWhatsapp'),
      // WhatsApp on its own line: a separator dot next to Persian digits reads like the digit zero (۰).
      value: <>{link(c.mobile.href, <Ltr>{c.mobile[locale]}</Ltr>)}<span className="block">{link(c.mobile.whatsapp, t('pages.whatsapp'), true)}</span></>,
    },
    { key: 'email', term: t('pages.email'), value: link(`mailto:${c.email}`, <Ltr>{c.email}</Ltr>) },
    { key: 'hours', term: t('pages.hours'), value: c.hours[locale] },
  ];
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
