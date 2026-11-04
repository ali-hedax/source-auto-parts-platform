'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter as useAddressRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { ignoresHistory, parentOf } from '@/lib/nav-trail';
import { backSteps, installNavTrail } from '@/lib/nav-trail-browser';

/** Starts the tab's trail on every storefront page, the home page included. */
export function NavTrailTracker() {
  const router = useAddressRouter();
  useEffect(() => { installNavTrail((url) => router.replace(url, { scroll: false })); }, [router]);
  return null;
}

/**
 * «بازگشت»: one step back to the previous page of this site in this tab, which keeps its filters and
 * scroll position because the browser restores them. With no such page the visitor moves up to the
 * page's parent instead, replacing the current entry, so the control never leaves the site or loops.
 * After a language switch the previous page comes back in the current language (see nav-trail-browser).
 * A plain link underneath: it works without JavaScript and in a new tab.
 */
export function BackControl() {
  const t = useTranslations('common');
  const pathname = usePathname();
  const router = useRouter();
  const parent = parentOf(pathname);
  return (
    <div className="container-page back-control-row">
      <Link
        href={parent}
        className="back-control"
        onClick={(event) => {
          if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          const steps = ignoresHistory(pathname) ? null : backSteps();
          if (steps === null) { router.replace(parent); return; }
          // Should the browser have no such entry after all (a tab that inherited this one's storage), nothing fires: use the parent.
          const fallback = window.setTimeout(() => router.replace(parent), 500);
          window.addEventListener('popstate', () => window.clearTimeout(fallback), { once: true });
          window.history.go(-steps);
        }}
      >
        <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
        {t('back')}
      </Link>
    </div>
  );
}
