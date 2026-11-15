'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

/** The home header element; marks itself `data-scrolled` once the page moves, for the compact state. */
export function HomeHeaderShell({ children, className, style, ...data }: { children: ReactNode; className: string; style?: CSSProperties | undefined; 'data-size': string; 'data-align': string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const update = () => { frame = 0; el.dataset.scrolled = String(window.scrollY > 8); };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (frame) cancelAnimationFrame(frame); };
  }, []);
  return <header ref={ref} className={className} style={style} data-scrolled="false" {...data}>{children}</header>;
}
