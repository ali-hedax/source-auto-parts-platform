/**
 * Every cacheable public API read (catalog, prices, stock, policies, contact)
 * carries this tag, so one purge from the API after a change refreshes them all
 * (spec §15). Private data is never cached.
 */
export const PUBLIC_CACHE_TAG = 'hedax-public';
