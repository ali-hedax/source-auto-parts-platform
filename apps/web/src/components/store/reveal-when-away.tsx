'use client';
import { useEffect, useState, type ReactNode } from 'react';

/** Shows its children only while the element `targetId` is out of view (e.g. a phone buy bar beside the buy box). */
export function RevealWhenAway({ targetId, children }: { targetId: string; children: ReactNode }) {
  const [away, setAway] = useState(false);
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setAway(!entry?.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [targetId]);
  return <div hidden={!away}>{children}</div>;
}
