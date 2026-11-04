/*
 * Source by HEDAX service worker. Deliberately small, and an allowlist:
 * - Only public, versioned or brand files are ever stored (see isStatic). Pages, the API, the cart,
 *   sign-in, orders, payments and prices are never stored, so nothing old can pass for current.
 * - Pages always come from the network. Without one the visitor gets the offline page, which promises
 *   nothing and sends nothing.
 * - A new worker takes over without reloading any page, so an update cannot interrupt checkout; the next
 *   page load simply uses the new files. Raise VERSION only when this file's caching rules change.
 */
/* global self, caches */
const VERSION = 1;
const CACHE = `source-static-v${VERSION}`;
const OFFLINE = '/offline.html';
const OFFLINE_FILES = [OFFLINE, '/icons/icon-192.png'];
const MAX_ENTRIES = 120;

const isStatic = (url) => url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/brand/') || url.pathname.startsWith('/icons/');

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(OFFLINE_FILES.map((file) => new Request(file, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith('source-') && name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

/** Oldest first; what the offline page needs is never removed. */
async function trim(cache) {
  const keys = await cache.keys();
  const removable = keys.filter((request) => !OFFLINE_FILES.includes(new URL(request.url).pathname));
  const extra = removable.length - MAX_ENTRIES;
  if (extra > 0) await Promise.all(removable.slice(0, extra).map((request) => cache.delete(request)));
}

async function fromCacheFirst(request, event) {
  const cache = await caches.open(CACHE);
  const stored = await cache.match(request);
  if (stored) return stored;
  const response = await fetch(request);
  // A file that failed, or was redirected, is not stored.
  if (response.ok && response.type === 'basic') {
    event.waitUntil(cache.put(request, response.clone()).then(() => trim(cache)));
  }
  return response;
}

async function pageOrOffline(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(CACHE);
    return (await cache.match(OFFLINE)) ?? new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(pageOrOffline(request));
    return;
  }
  if (isStatic(url)) event.respondWith(fromCacheFirst(request, event));
  // Everything else, the API and page data included, goes to the network untouched.
});
