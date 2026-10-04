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
