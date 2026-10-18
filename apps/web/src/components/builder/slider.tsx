'use client';
import { useEffect, useState } from 'react';
import type { BuilderBlock } from '@hedax/contracts';
import { localize } from '@hedax/contracts/constants';
import { Link } from '@/i18n/navigation';
export function BannerSlider({ items, interval, locale }: { items: BuilderBlock['items']; interval: number; locale: string }) {
  const slides = items.filter(i => i.visible);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || slides.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => { if (!document.hidden) setIndex(i => (i + 1) % slides.length); }, interval);
    return () => clearInterval(timer);
  }, [paused, slides.length, interval]);
  const item = slides[index % (slides.length || 1)];
  if (!item) return null;
  return <div aria-roledescription="carousel" aria-label={locale === 'fa' ? 'بنرها' : 'Banners'} onMouseEnter={() => setPaused(true)} onFocusCapture={() => setPaused(true)}>
    <div className="builder-composition">
      <div><h3 className="builder-heading">{localize(item.title, locale)}</h3><p>{localize(item.text, locale)}</p>{item.href ? <Link className="builder-button" href={item.href}>{localize(item.button, locale) || (locale === 'fa' ? 'مشاهده' : 'View')}</Link> : null}</div>
      {item.imageUrl ? <picture>{item.mobileImageUrl ? <source media="(max-width: 639px)" srcSet={item.mobileImageUrl} /> : null}
        <img className="builder-image" src={item.imageUrl} alt={localize(item.alt, locale)} loading="lazy" />
      </picture> : null}
    </div>
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" className="builder-button" onClick={() => setPaused(!paused)}>{paused ? (locale === 'fa' ? 'پخش' : 'Play') : (locale === 'fa' ? 'توقف' : 'Pause')}</button>{slides.map((_, i) => <button key={i} type="button" className="min-h-11 min-w-11 rounded-xl border" aria-current={index % slides.length === i} aria-label={`${locale === 'fa' ? 'اسلاید' : 'Slide'} ${i + 1}`} onClick={() => { setIndex(i); setPaused(true); }}>{i + 1}</button>)}</div>
  </div>;
}
