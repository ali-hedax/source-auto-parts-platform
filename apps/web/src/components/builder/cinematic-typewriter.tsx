'use client';

import { useEffect, useMemo, useState } from 'react';

/** Keep the complete, accessible phrase in flow; only its visual overlay types. */
export function CinematicTypewriter({ text, delay, duration }: { text: string; delay: number; duration: number }) {
  const letters = useMemo(() => typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), part => part.segment)
    : Array.from(text), [text]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let active = true;
    let frame = 0;
    let start: number | undefined;
    let last = 0;
    const finish = () => {
      active = false;
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
    // Both local font subsets settle before the single intro sequence starts.
    if (!motion.matches) void document.fonts.ready.then(() => {
      if (active) frame = requestAnimationFrame(tick);
    });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      motion.removeEventListener('change', finish);
    };
  }, [letters, delay, duration]);

  return <span className="cine-typewriter" data-complete={count === letters.length}>
    <span className="cine-typewriter-source">{text}</span>
    <span className="cine-typewriter-visible" aria-hidden="true">
      {letters.slice(0, count).join('')}
      {count > 0 && count < letters.length ? <span className="cine-typewriter-caret" /> : null}
    </span>
    <noscript><style>{'.cine-typewriter-source{color:inherit!important}.cine-typewriter-visible{display:none!important}'}</style></noscript>
  </span>;
}
