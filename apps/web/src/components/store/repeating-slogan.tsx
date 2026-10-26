'use client';

import { useState } from 'react';
import { Pause, Play } from 'lucide-react';

/** The full heading stays accessible and in flow; only the visual copy repeats. */
export function RepeatingSlogan({ locale }: { locale: string }) {
  const fa = locale === 'fa';
  const [paused, setPaused] = useState(false);
  const lines = fa ? ['دنیای قطعات خودرو', 'هوشمندتر از همیشه'] : ['The world of auto parts', 'Smarter than ever'];
  return <div className="titanium-slogan" data-paused={paused}>
    <h1 id="titanium-hero-title">
      {lines.map((line, i) => <span className={`titanium-type-line titanium-type-line-${i}`} key={line}>
        <span className="titanium-type-source">{line}</span>
        <span className="titanium-type-visual" aria-hidden>{line}</span>
      </span>)}
    </h1>
    {fa ? <p className="titanium-tagline titanium-english-type" lang="en" dir="ltr"><span className="titanium-english-source">Smarter Parts. Better Driving.</span><span className="titanium-english-visual" aria-hidden>Smarter Parts. Better Driving.</span></p> : null}
    <button type="button" className="titanium-type-toggle" aria-label={paused ? (fa ? 'ادامهٔ جلوه‌ها' : 'Resume effects') : (fa ? 'توقف جلوه‌ها' : 'Pause effects')} aria-pressed={paused} onClick={() => setPaused(p => !p)}>{paused ? <Play aria-hidden size={15} /> : <Pause aria-hidden size={15} />}</button>
  </div>;
}
