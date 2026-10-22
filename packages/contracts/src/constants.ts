/**
 * Plain constants and helpers shared by the API, worker and browser code. This
 * module must stay free of zod (and of any other import): the web app loads it
 * on public pages through `@hedax/contracts/constants`, while the schemas in the
 * other modules would add ~400 KB of JavaScript to every page (spec §15).
 */

/** Idempotency key header used on every retry-sensitive mutation. */
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
export const REQUEST_ID_HEADER = 'X-Request-Id';
export const CSRF_HEADER = 'X-CSRF-Token';
export const CSRF_COOKIE = 'hedax_csrf';
export const SESSION_COOKIE = 'hedax_sid';
export const CART_COOKIE = 'hedax_cart';

/**
 * System messages (request received, quote issued, …) are stored once in both
 * languages, Persian first: "fa / en". Each reader is shown their own language.
 */
export const SYSTEM_TEXT_SEPARATOR = ' / ';

export function composeSystemText(fa: string, en: string): string {
  return `${fa}${SYSTEM_TEXT_SEPARATOR}${en}`;
}

export function systemTextFor(body: string, locale: 'fa' | 'en'): string {
  const at = body.indexOf(SYSTEM_TEXT_SEPARATOR);
  if (at < 0) return body;
  return locale === 'fa' ? body.slice(0, at) : body.slice(at + SYSTEM_TEXT_SEPARATOR.length);
}

/** Socket.IO event names shared by server and client. */
export const SOCKET_EVENTS = {
  join: 'conversation:join',
  leave: 'conversation:leave',
  send: 'message:send',
  ack: 'message:ack',
  message: 'message:new',
  read: 'message:read',
  resync: 'conversation:resync',
  revoked: 'session:revoked',
  error: 'error:event',
} as const;

/**
 * Notification types that can also be sent as SMS (the API has a Persian template
 * for each). In-app notifications are always kept; the owner can switch the SMS
 * copy of each type off in the settings (spec §5.3 "تنظیمات اعلان", §17).
 */
export const SMS_NOTIFICATION_TYPES = [
  'order.paid', 'order.shipped', 'sourcing.submitted', 'sourcing.needs_info', 'quote.sent', 'procurement.paid', 'procurement.delayed', 'procurement.shipped',
] as const;
export type SmsNotificationType = (typeof SMS_NOTIFICATION_TYPES)[number];

export const QUOTE_VERSION_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED', 'REJECTED', 'SUPERSEDED', 'CANCELLED'] as const;
export type QuoteVersionStatus = (typeof QUOTE_VERSION_STATUSES)[number];

// ---- Site content (panel → «محتوای سایت»); the schemas are in content.ts ----

/** A text in both site languages. */
export interface Localized {
  fa: string;
  en: string;
}

/** Text in the visitor's language; English falls back to Persian when it was left empty. */
export function localize(text: Localized | null | undefined, locale: string): string {
  if (!text) return '';
  return locale === 'en' ? text.en || text.fa : text.fa;
}

export const SOCIAL_NETWORKS = ['instagram', 'linkedin', 'telegram', 'x', 'whatsapp', 'youtube', 'aparat', 'other'] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

/** Pages whose search title, description and share image are set under site content → SEO. */
export const SEO_PAGES = ['home', 'parts', 'brands', 'imported', 'requestPart', 'contact'] as const;
export type SeoPage = (typeof SEO_PAGES)[number];

/** Built-in text pages: they cannot be deleted and keep their address. */
export const SYSTEM_PAGE_SLUGS = ['about', 'help-buying', 'help-sourcing', 'help-shipping', 'help-returns'] as const;

export const CONTENT_IMAGE_PURPOSES = ['image', 'logo', 'favicon'] as const;
export type ContentImagePurpose = (typeof CONTENT_IMAGE_PURPOSES)[number];

/** Upload limit for site pictures (they are re-encoded and become much smaller). */
export const CONTENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export * from './assistant-public.js';

/** The owner-selected continuous assembly film (docs/media/HERO_FILM_V2_EDL.md). */
export const DEFAULT_BUILDER_FILM = {
  desktop: '/media/source-hero/v2/hero-desktop.mp4', desktopWebm: '/media/source-hero/v2/hero-desktop.webm', mobile: '/media/source-hero/v2/hero-mobile.mp4',
  poster: '/media/source-hero/v2/poster-desktop.jpg', mobilePoster: '/media/source-hero/v2/poster-mobile.jpg', playback: 'once' as 'once' | 'loop' | 'static', logoAt: 9.8 as number | null, discovery: true,
};
