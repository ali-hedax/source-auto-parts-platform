'use client';
import { startTransition, useEffect, useState } from 'react';

/**
 * Runs `fn` once the page has loaded and the main thread is idle (at most `timeout` ms after load), so decoration
 * and optional media never compete with the page's own content for bandwidth or the main thread. Returns a cancel.
 */
export function afterLoad(fn: () => void, timeout = 2500): () => void {
  let idle = 0; let timer = 0;
  const go = () => { if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(fn, { timeout }); else timer = window.setTimeout(fn, 600); };
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
  return () => { window.removeEventListener('load', go); if (idle) window.cancelIdleCallback(idle); window.clearTimeout(timer); };
}

/** True once {@link afterLoad} has fired. */
export function useAfterLoad(): boolean {
  const [ready, setReady] = useState(false);
  // A transition: React renders what this reveals in small, interruptible slices (no long task that could delay input).
  useEffect(() => afterLoad(() => startTransition(() => setReady(true))), []);
  return ready;
}
