'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/** Keep the complete, accessible phrase in flow; only its visual overlay types. */
export function CinematicTypewriter({ text, delay, duration }: { text: string; delay: number; duration: number }) {
  const letters = useMemo(() => typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), part => part.segment)
    : Array.from(text), [text]);
  const [count, setCount] = useState(0);
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let active = true;
    let frame = 0;
    let start: number | undefined;
    let last = 0;
    let started = false;
    let observer: IntersectionObserver | undefined;
    const finish = () => {
      active = false;
      observer?.disconnect();
      cancelAnimationFrame(frame);
      setCount(letters.length);
    };
    motion.addEventListener('change', finish);
    const tick = (now: number) => {
      if (!active) return;
      start ??= now;
      const progress = Math.min(1, Math.max(0, (now - start - delay) / duration));
      const next = Math.floor(progress * letters.length);
      if (next !== last) { last = next; setCount(next); }
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    // Start both phrases when their shared copy block enters view, even below a tall film.
    const begin = () => {
      if (started || !active) return;
      started = true;
      observer?.disconnect();
      void document.fonts.ready.then(() => {
        if (active) frame = requestAnimationFrame(tick);
      });
    };
    if (!motion.matches) {
      const target = root.current?.closest('.cine-copy');
      if (target && typeof IntersectionObserver === 'function') {
        observer = new IntersectionObserver(entries => {
          if (entries.some(entry => entry.isIntersecting)) begin();
        }, { threshold: 0 });
        observer.observe(target);
      } else begin();
    }
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      motion.removeEventListener('change', finish);
    };
  }, [letters, delay, duration]);

  return <span ref={root} className="cine-typewriter" data-complete={count === letters.length}>
    <span className="cine-typewriter-source">{text}</span>
    <span className="cine-typewriter-visible" aria-hidden="true">
      {letters.slice(0, count).join('')}
      {count > 0 && count < letters.length ? <span className="cine-typewriter-caret" /> : null}
    </span>
    <noscript><style>{'.cine-typewriter-source{color:inherit!important}.cine-typewriter-visible{display:none!important}'}</style></noscript>
  </span>;
}
