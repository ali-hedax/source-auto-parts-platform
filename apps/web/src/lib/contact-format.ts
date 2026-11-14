/**
 * Readable phone numbers and working tel:/wa.me links for the contact details saved in the panel.
 * Iranian numbers are shown in Persian digits («۰۲۵-۳۶۶۶ ۸۰۰۶», «۰۹۱۲ ۱۵۳ ۱۷۹۷»); WhatsApp keeps
 * its international form in Latin digits («+971 50 144 1797») because that is how it is dialled.
 */
const FA = '۰۱۲۳۴۵۶۷۸۹';
export const faDigits = (s: string) => s.replace(/[0-9]/g, (d) => FA[Number(d)]!);
const asciiDigits = (s: string) => s.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/** Digits only, international form without + (98…, 971…). */
export function internationalDigits(value: string): string {
  let d = asciiDigits(value).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = `98${d.slice(1)}`;
  return d;
}

/** «۰۲۵-۳۶۶۶ ۸۰۰۶» for a landline, «۰۹۱۲ ۱۵۳ ۱۷۹۷» for a mobile; anything else as written. */
export function iranNumberText(value: string, locale: 'fa' | 'en'): string {
  const intl = internationalDigits(value);
  if (!intl.startsWith('98')) return value.trim();
  const national = `0${intl.slice(2)}`;
  let text = national;
  if (/^09\d{9}$/.test(national)) text = `${national.slice(0, 4)} ${national.slice(4, 7)} ${national.slice(7)}`;
  else if (/^0\d{10}$/.test(national)) text = `${national.slice(0, 3)}-${national.slice(3, 7)} ${national.slice(7)}`;
  return locale === 'fa' ? faDigits(text) : text;
}

/** «+971 50 144 1797», «+98 912 153 1797». */
export function whatsappText(value: string): string {
  const d = internationalDigits(value);
  if (d.startsWith('971') && d.length === 12) return `+971 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  if (d.startsWith('98') && d.length === 12) return `+98 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  return `+${d}`;
}

/** tel: link in international form, with the extension dialled after a pause. */
export function telHref(value: string, extension = ''): string {
  return `tel:+${internationalDigits(value)}${extension ? `,${asciiDigits(extension).replace(/\D/g, '')}` : ''}`;
}

export function whatsappHref(value: string): string {
  return `https://wa.me/${internationalDigits(value)}`;
}

/** The old built-in «support 24/7» text describes no real phone hours: treat it as not entered yet. */
export function isLegacyHours(text: string): boolean {
  return /۲۴\s*ساعته|24\s*\/\s*7/i.test(text);
}
