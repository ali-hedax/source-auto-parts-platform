'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';

/** One entry sequence, whole graphemes, stable accessible copy and a no-JS fallback. */
export function RepeatingSlogan({ locale, title, subtitle, tagline = 'Smarter Parts. Better Driving.' }: { locale: string; title?: string; subtitle?: string; tagline?: string }) {
  const fa = locale === 'fa';
  const lines = useMemo(() => [title ?? (fa ? 'دنیای قطعات خودرو' : 'The world of auto parts'), subtitle ?? (fa ? 'هوشمندتر از همیشه' : 'Smarter than ever'), tagline], [fa, title, subtitle, tagline]);
  const segments = useMemo(() => {
    const segmenter = new Intl.Segmenter(locale, { granularity: 'grapheme' });
    return lines.map(line => [...segmenter.segment(line)].map(s => s.segment));
  }, [lines, locale]);
  const key = lines.join('\u0001');
  const progress = useRef({ key, position: 0 });
  const [count, setCount] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const total = segments.reduce((n, s) => n + s.length, 0);
    const run = () => {
      clearTimeout(timer);
      void document.fonts.ready.then(() => {
        if (!alive) return;
        if (media.matches) { setCount(null); return; }
        if (progress.current.key !== key) progress.current = { key, position: 0 };
        setCount(progress.current.position);
        if (paused) return;
        const tick = () => {
          if (!alive || progress.current.position >= total) return;
          progress.current.position++;
          setCount(progress.current.position);
          const boundaries = [segments[0]!.length, segments[0]!.length + segments[1]!.length];
          const delay = boundaries.includes(progress.current.position) ? 380 : progress.current.position > boundaries[1]! ? 48 : 72;
          timer = setTimeout(tick, delay);
        };
        timer = setTimeout(tick, progress.current.position ? 80 : 350);
      });
    };
    run(); media.addEventListener('change', run);
    return () => { alive = false; clearTimeout(timer); media.removeEventListener('change', run); };
  }, [segments, key, paused]);
  let offset = 0;
  const rendered = lines.map((line, i) => {
    const length = segments[i]!.length;
    const shown = count === null ? length : Math.max(0, Math.min(length, count - offset));
    const typing = count !== null && count >= offset && shown < length;
    offset += length;
    return <span className={`atelier-type-line ${typing ? 'is-typing' : ''}`} key={i}><span className="atelier-type-source">{line}</span><span className="atelier-type-render" aria-hidden>{segments[i]!.slice(0, shown).join('')}</span></span>;
  });
  return <div className="titanium-slogan atelier-typewriter" data-typing={count !== null} data-paused={paused}>
    <h1 id="titanium-hero-title">{rendered.slice(0, 2)}</h1>
    <p className="titanium-tagline" lang="en" dir="ltr">{rendered[2]}</p>
    <button type="button" className="titanium-type-toggle" aria-label={paused ? (fa ? 'ادامهٔ جلوه‌ها' : 'Resume effects') : (fa ? 'توقف جلوه‌ها' : 'Pause effects')} aria-pressed={paused} onClick={() => setPaused(p => !p)}>{paused ? <Play aria-hidden size={15} /> : <Pause aria-hidden size={15} />}</button>
  </div>;
}
