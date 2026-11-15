'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Fit the full artwork below the real header while keeping the section edge-to-edge. */
export function FirstScreenBanner({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const banner = ref.current;
    if (!banner) return;
    const header = banner.closest('.titanium-store')?.querySelector('header');
    const measure = () => {
      const top = banner.getBoundingClientRect().top + window.scrollY;
      banner.style.setProperty('--banner-top', `${Math.max(0, top)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    if (header) observer.observe(header);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  return <section ref={ref} className="atelier-banner" aria-labelledby="titanium-hero-title">{children}</section>;
}
