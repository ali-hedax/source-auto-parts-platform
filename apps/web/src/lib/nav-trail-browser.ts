'use client';

import { localeOf, moveTo, newTrail, pushEntry, replaceEntry, resolveLoad, stepsBack, translatedTarget, type NavStamp, type NavTrail } from './nav-trail';

const STORE_KEY = 'hedax-nav-trail';
const STAMP_KEY = 'hedaxNav';

let trail: NavTrail | null = null;
let installed = false;
let showPage: (url: string) => void = () => undefined;
let unveil = 0;

const currentUrl = () => `${location.pathname}${location.search}`;
const generationId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function save() {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(trail)); } catch { /* The control falls back to the page's parent. */ }
}

function stored(): NavTrail | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? 'null') as NavTrail | null;
    return value && typeof value.generation === 'string' && typeof value.index === 'number' && Array.isArray(value.entries) ? value : null;
  } catch { return null; }
}

const stampOf = (state: unknown): NavStamp | null => (state as Record<string, NavStamp> | null)?.[STAMP_KEY] ?? null;
const stamped = (data: unknown): Record<string, unknown> => ({ ...(data as Record<string, unknown> | null), [STAMP_KEY]: { generation: trail!.generation, index: trail!.index } });
const pathAndQuery = (url: string | URL) => { const u = new URL(url, location.href); return `${u.pathname}${u.search}`; };

function sameOriginReferrer(): string | null {
  if (!document.referrer) return null;
  try {
    const u = new URL(document.referrer);
    return u.origin === location.origin ? `${u.pathname}${u.search}` : null;
  } catch { return null; }
}

const SWAPPING = 'localeSwap';
function endSwap() {
  window.clearTimeout(unveil);
  delete document.documentElement.dataset[SWAPPING];
}

/**
 * History can only return to the address an entry was made with, so after a language switch the back
 * button (ours or the browser's or phone's) lands on a page in the old language. That page is held back
 * for the moment it takes to replace it with the same address in the current language.
 */
function correctLanguage() {
  const target = translatedTarget(trail, currentUrl());
  if (!target) return;
  document.documentElement.dataset[SWAPPING] = '';
  window.clearTimeout(unveil);
  unveil = window.setTimeout(endSwap, 2000);
  window.setTimeout(() => showPage(target), 0);
}

/** Follows every history change of the tab from its first storefront page. Scroll positions stay with the browser. */
export function installNavTrail(show: (url: string) => void) {
  showPage = show;
  if (installed) return;
  installed = true;
  const { pushState, replaceState } = window.history;
  const earlier = stored();
  trail = resolveLoad(earlier, stampOf(history.state), currentUrl(), sameOriginReferrer(), generationId());
  // Back or forward across a full page load is still history, not a choice of language.
  const [load] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  if (load?.type === 'back_forward' && earlier?.locale) trail = { ...trail, locale: earlier.locale };
  save();
  replaceState.call(history, stamped(history.state), '');
  correctLanguage();

  // Next.js patches these too; the stamp travels with its state in whichever order the patches landed.
  history.pushState = function push(data: unknown, unused: string, url?: string | URL | null) {
    if (url != null) { trail = pushEntry(trail!, pathAndQuery(url)); save(); }
    pushState.call(this, stamped(data), unused, url);
  };
  history.replaceState = function replace(data: unknown, unused: string, url?: string | URL | null) {
    if (url != null) { trail = replaceEntry(trail!, pathAndQuery(url)); save(); endSwap(); }
    replaceState.call(this, stamped(data), unused, url);
  };
  const sync = () => {
    const url = currentUrl();
    const locale = trail?.locale ?? localeOf(url);
    trail = moveTo(trail, stampOf(history.state), url) ?? { ...newTrail(generationId(), url), locale };
    save();
    correctLanguage();
  };
  window.addEventListener('popstate', sync);
  // A page from the back/forward cache wakes up with its old memory; the tab's record is what is current.
  window.addEventListener('pageshow', (event) => { if (event.persisted) { trail = stored() ?? trail; sync(); } });
}

/** History entries to the previous useful site page of this tab, or null. */
export const backSteps = () => stepsBack(trail, currentUrl());
