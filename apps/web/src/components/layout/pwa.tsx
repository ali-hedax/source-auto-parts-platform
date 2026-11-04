'use client';

import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { afterLoad } from '@/lib/after-load';

interface InstallPromptEvent extends Event { prompt: () => Promise<void> }

let installEvent: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

// The browser offers this event once; it may fire before any component has mounted.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installEvent = event as InstallPromptEvent;
    changed();
  });
  window.addEventListener('appinstalled', () => { installEvent = null; changed(); });
}

type InstallRoute = 'prompt' | 'ios' | null;

function installRoute(): InstallRoute {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return null;
  if (installEvent) return 'prompt';
  // iPads report themselves as Macs; a touch screen tells them apart.
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
  return ios ? 'ios' : null;
}

/** Registers the service worker on production builds only, once the page has settled. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    return afterLoad(() => { void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => undefined); });
  }, []);
  return null;
}

/**
 * «نصب برنامه», only where it can really happen: the browser's own install dialog where it offers one,
 * and on iPhone and iPad the short steps, since Safari has no install button a page can trigger. Nothing
 * shows elsewhere or once installed, and nothing opens by itself.
 */
export function InstallApp({ className }: { className?: string }) {
  const t = useTranslations('pwa');
  const route = useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, installRoute, () => null);
  const [guide, setGuide] = useState(false);
  if (!route) return null;
  const onClick = () => {
    if (route === 'ios') { setGuide((open) => !open); return; }
    void installEvent?.prompt().finally(() => { installEvent = null; changed(); });
  };
  return (
    <div className="grid gap-1">
      <button type="button" className={className ?? 'inline-flex min-h-11 cursor-pointer items-center gap-2 font-semibold'} onClick={onClick} aria-expanded={route === 'ios' ? guide : undefined}>
        <Download aria-hidden className="size-4" />
        {t('install')}
      </button>
      {guide ? <p className="max-w-xs text-sm leading-7">{t('iosGuide')}</p> : null}
    </div>
  );
}
