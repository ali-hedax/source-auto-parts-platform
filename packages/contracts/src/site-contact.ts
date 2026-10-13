/**
 * The only source of the site's contact details: storefront footer and contact page, the panel's
 * read-only view and the launch-readiness check.
 * Values are exactly as approved by the owner on 2026-10-13. Fields without approved information
 * (address, map, Instagram, LinkedIn) are deliberately absent; do not add placeholders.
 * Persian display strings are written with Persian digits here; links always use Latin digits.
 */
export const SITE_CONTACT = {
  displayName: 'Source by HEDAX',
  phone: {
    href: 'tel:+982536666669,119',
    fa: { number: '۰۲۵-۳۶۶۶۶۶۶۹', extension: 'داخلی ۱۱۹' },
    en: { number: '+98 25 3666 6669', extension: 'Ext. 119' },
  },
  /** UAE mobile; the same number is on WhatsApp. */
  mobile: {
    href: 'tel:+971501441797',
    whatsapp: 'https://wa.me/971501441797',
    fa: '+۹۷۱۵۰۱۴۴۱۷۹۷',
    en: '+971 50 144 1797',
  },
  email: 'info@sourcebyhedax.ir',
  hours: {
    fa: 'پشتیبانی ۲۴ ساعته، ۷ روز هفته',
    en: 'Customer support 24/7',
  },
  /**
   * On-site support chat on the contact page («سریع‌ترین راه ارتباط، گفت‌وگو…» and the «پشتیبانی» button).
   * Off until customer SMS sign-in works: the chat needs a signed-in customer. Set to true to show it again.
   */
  supportChat: { enabled: false },
} as const;

export type SiteContact = typeof SITE_CONTACT;
