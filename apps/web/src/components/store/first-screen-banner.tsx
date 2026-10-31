'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Fit the complete opening frame below the actual header, including a CMS notice bar. */
export function FirstScreenBanner({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const banner = ref.current;
    if (!banner) return;
    const store = banner.closest('.titanium-store');
    const header = store?.querySelector('header');
    const notice = header?.previousElementSibling;
    const measure = () => {
      const top = banner.getBoundingClientRect().top + window.scrollY;
      banner.style.setProperty('--banner-top', `${Math.max(0, top)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    if (header) observer.observe(header);
    if (notice) observer.observe(notice);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  return <section ref={ref} className="atelier-banner" aria-labelledby="titanium-hero-title">{children}</section>;
}
