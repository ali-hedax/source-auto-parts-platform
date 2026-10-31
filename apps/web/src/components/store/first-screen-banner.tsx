import type { ReactNode } from 'react';

/** Full-width opening artwork; keep its complete frame at every viewport size. */
export function FirstScreenBanner({ children }: { children: ReactNode }) {
  return <section className="atelier-banner" aria-labelledby="titanium-hero-title">{children}</section>;
}
