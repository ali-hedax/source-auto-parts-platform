'use client';
import type { BuilderFilm } from '@hedax/contracts';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type State = 'idle' | 'loading' | 'playing' | 'paused' | 'blocked' | 'ended' | 'still';
const MOBILE = '(max-width: 639px)';
const REDUCED = '(prefers-reduced-motion: reduce)';

/** Data saver or a 2G-class connection: show the still frame and never fetch the movie. */
function saveData() {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return Boolean(c?.saveData) || /(^|-)2g$/.test(c?.effectiveType ?? '');
}

/**
 * The opening film. The server renders the poster (or the still) so the hero is complete without
 * JavaScript; the movie is attached afterwards, one file per device, and never for reduced motion,
 * data saving or the 'static' mode. The site's own logo appears once, at `film.logoAt`.
 */
export function CinematicFilm({ film, still, mobileStill, alt, logoUrl, logoAlt, locale }: {
  film: BuilderFilm; still: string; mobileStill: string; alt: string; logoUrl: string; logoAlt: string; locale: string;
}) {
  const fa = locale === 'fa';
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const userPaused = useRef(false);
  const [src, setSrc] = useState('');
  const [state, setState] = useState<State>(film.playback === 'static' ? 'still' : 'idle');
  const [shown, setShown] = useState(false);
  const [resolved, setResolved] = useState(film.playback === 'static');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (film.playback === 'static') return;
    const mobile = matchMedia(MOBILE).matches;
    if (matchMedia(REDUCED).matches || saveData() || !(film.desktop || film.mobile)) { setState('still'); setResolved(true); return; }
    const probe = document.createElement('video');
    const webm = !mobile && film.desktopWebm && probe.canPlayType('video/webm; codecs="vp9"') ? film.desktopWebm : '';
    setSrc(mobile ? (film.mobile || film.desktop) : (webm || film.desktop || film.mobile));
    setState('loading');
  }, [film]);

  useEffect(() => {
    const v = video.current;
    if (!v || !src) return;
    v.muted = true;
    v.play().catch(() => setState(s => (s === 'loading' ? 'blocked' : s)));
    // Offscreen: pause, and resume only what the visitor did not pause themselves.
    const io = new IntersectionObserver(([entry]) => {
      if (!entry || v.ended || userPaused.current) return;
      if (entry.intersectionRatio < 0.2) v.pause(); else void v.play().catch(() => undefined);
    }, { threshold: [0, 0.2] });
    if (frame.current) io.observe(frame.current);
    return () => io.disconnect();
  }, [src]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.ended || state === 'ended') { userPaused.current = false; v.currentTime = 0; setResolved(false); void v.play().catch(() => setState('blocked')); return; }
    if (v.paused) { userPaused.current = false; void v.play().catch(() => setState('blocked')); }
    else { userPaused.current = true; v.pause(); }
  };
  const onTime = () => {
    const v = video.current;
    if (!v) return;
    // The film opens from black; reveal it over the poster once the parts are on screen.
    if (!shown && v.currentTime >= 0.3) setShown(true);
    if (v.duration) setProgress(Math.min(1, v.currentTime / v.duration));
    if (film.logoAt !== null && v.currentTime >= film.logoAt) setResolved(true);
  };
  const isStill = state === 'still';
  const stillSet = <><source media={MOBILE} srcSet={mobileStill || still} /><img src={still} alt={alt} width={1280} height={720} fetchPriority="high" decoding="async" /></>;
  const label = state === 'playing' ? (fa ? 'توقف فیلم' : 'Pause film') : state === 'ended' ? (fa ? 'پخش دوباره' : 'Replay film') : (fa ? 'پخش فیلم' : 'Play film');
  const Icon = state === 'playing' ? Pause : state === 'ended' ? RotateCcw : Play;

  return <div ref={frame} className="cine-film" data-state={state} data-shown={shown} data-resolved={resolved || undefined} style={{ '--cine-progress': progress } as React.CSSProperties}>
    <picture className="cine-still">
      {isStill || !film.poster ? stillSet : <>
        {/* Reduced motion never shows the opening poster: it would promise a film that will not play. */}
        <source media={`${REDUCED} and ${MOBILE}`} srcSet={mobileStill || still} />
        <source media={REDUCED} srcSet={still} />
        <source media={MOBILE} srcSet={film.mobilePoster || film.poster} />
        <img src={film.poster} alt={alt} width={1280} height={720} fetchPriority="high" decoding="async" />
      </>}
    </picture>
    {src ? <video ref={video} className="cine-video" src={src} muted playsInline preload="auto" loop={film.playback === 'loop'} aria-hidden tabIndex={-1}
      onPlaying={() => setState('playing')} onPause={() => setState(s => (s === 'ended' ? s : 'paused'))} onTimeUpdate={onTime}
      onEnded={() => { setState('ended'); setShown(true); setResolved(true); setProgress(1); }}
      onError={() => { setSrc(''); setState('still'); setResolved(true); }} /> : null}
    {film.logoAt !== null && logoUrl ? <img className="cine-logo" src={logoUrl} alt={logoAlt} width={600} height={191} decoding="async" /> : null}
    {src && !isStill ? <div className="cine-controls">
      <button type="button" className="cine-control" onClick={toggle} aria-label={label} data-emphasis={state === 'blocked' || undefined}><Icon aria-hidden size={18} />{state === 'blocked' ? <span>{label}</span> : null}</button>
      <span className="cine-progress" aria-hidden><span /></span>
    </div> : null}
  </div>;
}
