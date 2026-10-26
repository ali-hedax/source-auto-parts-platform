'use client';

import { useState, type CSSProperties } from 'react';
import { Pause, Play } from 'lucide-react';

/** The full heading stays accessible and in flow; only the visual copy repeats. */
export function RepeatingSlogan({ locale, title, subtitle, tagline = 'Smarter Parts. Better Driving.' }: { locale: string; title?: string; subtitle?: string; tagline?: string }) {
  const fa = locale === 'fa';
  const [paused, setPaused] = useState(false);
  const lines = [title ?? (fa ? 'دنیای قطعات خودرو' : 'The world of auto parts'), subtitle ?? (fa ? 'هوشمندتر از همیشه' : 'Smarter than ever')];
  return <div className="titanium-slogan" data-paused={paused}>
    <h1 id="titanium-hero-title">
      {lines.map((line, i) => <span className={`titanium-type-line titanium-type-line-${i}`} key={line}>
        <span className="titanium-type-source">{line}</span>
        <span className="titanium-type-visual" aria-hidden>{line}</span>
      </span>)}
    </h1>
    {fa ? <p className="titanium-tagline titanium-english-type" style={{ '--ti-type-length': Math.max(1, tagline.length) } as CSSProperties} lang="en" dir="ltr"><span className="titanium-english-source">{tagline}</span><span className="titanium-english-visual" aria-hidden>{tagline}</span></p> : null}
    <button type="button" className="titanium-type-toggle" aria-label={paused ? (fa ? 'ادامهٔ جلوه‌ها' : 'Resume effects') : (fa ? 'توقف جلوه‌ها' : 'Pause effects')} aria-pressed={paused} onClick={() => setPaused(p => !p)}>{paused ? <Play aria-hidden size={15} /> : <Pause aria-hidden size={15} />}</button>
  </div>;
}
