/**
 * Pure rules of the on-page back control. A trail is this tab's own record of the site pages it moved
 * through; the browser's history cannot tell whether the previous entry belongs to this site
 * (history.length counts other sites too), and its entries cannot be listed.
 */
export interface NavTrail {
  generation: string; index: number; entries: string[];
  /** The language this tab reads in: set by every forward move and language switch, kept when moving through history. */
  locale?: string | null;
}

/** Where a history entry sits in the trail; stored on the entry itself, so it survives reloads and leaving the site. */
export interface NavStamp { generation: string; index: number }

const MAX_ENTRIES = 50;
const LOCALE_PREFIX = /^\/(fa|en)(?=[/?#]|$)/;

export const localeOf = (url: string): string | null => LOCALE_PREFIX.exec(url)?.[1] ?? null;
const inLocale = (url: string, locale: string | null | undefined) => (locale ? url.replace(LOCALE_PREFIX, `/${locale}`) : url);

export const newTrail = (generation: string, url: string): NavTrail => ({ generation, index: 0, entries: [url], locale: localeOf(url) });

export function pushEntry(trail: NavTrail, url: string): NavTrail {
  // A new page cuts off the entries ahead of it, as the browser does.
  const entries = [...trail.entries.slice(0, trail.index + 1), url];
  const drop = Math.max(0, entries.length - MAX_ENTRIES);
  return { ...trail, entries: entries.slice(drop), index: entries.length - 1 - drop, locale: localeOf(url) };
}

export function replaceEntry(trail: NavTrail, url: string): NavTrail {
  const entries = [...trail.entries];
  entries[trail.index] = url;
  return { ...trail, entries, locale: localeOf(url) };
}

/** The trail after moving onto a history entry, or null when that entry is not part of it (another visit in the same tab). */
export function moveTo(trail: NavTrail | null, stamp: NavStamp | null | undefined, url: string): NavTrail | null {
  if (!trail || !stamp || stamp.generation !== trail.generation || trail.entries[stamp.index] !== url) return null;
  return { ...trail, index: stamp.index };
}

/** A full page load: its own entry again, one more step from the page that linked to it, or the start of a new trail. */
export function resolveLoad(trail: NavTrail | null, stamp: NavStamp | null | undefined, url: string, referrer: string | null, generation: string): NavTrail {
  const known = moveTo(trail, stamp, url);
  if (known) return known;
  if (trail && referrer && trail.entries[trail.index] === referrer) return pushEntry(trail, url);
  return newTrail(generation, url);
}

const pathOf = (url: string) => url.split(/[?#]/)[0] ?? url;
/** Sign-in pages are passed over: after signing in, going back to the form means nothing. */
const SKIPPED = /^\/(?:fa|en)\/(?:login|staff\/login|staff\/invite)(?:\/|$)/;

/** How many history entries back the previous useful site page is, or null when the trail has none. */
export function stepsBack(trail: NavTrail | null, url: string): number | null {
  if (!trail) return null;
  for (let i = trail.index - 1; i >= 0; i--) {
    const entry = trail.entries[i]!;
    // An entry from before a language switch is the same page as its translation.
    if (inLocale(entry, trail.locale) !== url && !SKIPPED.test(pathOf(entry))) return trail.index - i;
  }
  return null;
}

/**
 * The address to show instead when history landed on a page in the language the visitor has left:
 * the same page, query and filters in the current language. Null when there is nothing to correct.
 */
export function translatedTarget(trail: NavTrail | null, url: string): string | null {
  const locale = trail?.locale;
  const here = localeOf(url);
  return locale && here && here !== locale ? inLocale(url, locale) : null;
}

const PARENTS: Array<[RegExp, string]> = [
  [/^\/parts\/.+/, '/parts'],
  [/^\/catalog\/.+/, '/parts'],
  [/^\/imported-parts\/.+/, '/imported-parts'],
  [/^\/brands\/.+/, '/brands'],
  [/^\/cars\/.+/, '/cars'],
  [/^\/help\/.+/, '/help'],
  [/^\/checkout(?:\/|$)/, '/cart'],
  [/^\/cart(?:\/|$)/, '/parts'],
  [/^\/payment(?:\/|$)/, '/account/orders'],
  [/^\/account\/orders\/.+/, '/account/orders'],
  [/^\/account\/procurements\/.+/, '/account/procurements'],
  [/^\/account\/quotes\/.+/, '/account/quotes'],
  [/^\/account\/requests\/.+/, '/account/requests'],
  [/^\/account\/returns\/.+/, '/account/returns'],
  [/^\/account\/.+/, '/account'],
];

/**
 * Where the control leads when the tab has no earlier site page (a direct visit, a new tab, an
 * arrival from another site). Always a step up towards home, and used with a history replace, so
 * following it repeatedly ends at home and never goes round in a circle.
 */
export function parentOf(pathname: string): string {
  for (const [pattern, parent] of PARENTS) if (pattern.test(pathname)) return parent;
  return '/';
}

/** The page a visitor returns to from a payment gateway must not lead back into the gateway. */
export const ignoresHistory = (pathname: string) => /^\/payment(?:\/|$)/.test(pathname);
