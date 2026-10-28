'use client';
import type { BuilderFilm } from '@hedax/contracts';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { startTransition, useEffect, useRef, useState } from 'react';
import { afterLoad } from '@/lib/after-load';

type State = 'idle' | 'loading' | 'playing' | 'paused' | 'blocked' | 'ended' | 'still' | 'ondemand';
type Clip = BuilderFilm['clips'][number];
const MOBILE = '(max-width: 639px)';
const REDUCED = '(prefers-reduced-motion: reduce)';

type Connection = { saveData?: boolean; effectiveType?: string };
const connection = () => (navigator as Navigator & { connection?: Connection }).connection;
/** Data saver or a 2G-class connection: show the still frame and never fetch a movie. */
function saveData() {
  const c = connection();
  return Boolean(c?.saveData) || /(^|-)2g$/.test(c?.effectiveType ?? '');
}
/**
 * A 3G-class link (the browser's own classification): show the light poster and fetch the movie only when the visitor
 * asks. The raw `downlink` estimate is not used: early in a page's life it can misjudge a good 4G connection.
 */
function slowLink() {
  return connection()?.effectiveType === '3g';
}
/** One file per clip for this device: the mobile file on phones, otherwise WebM where VP9 plays, else MP4. */
function source(clip: Clip, mobile: boolean, webm: boolean) {
  return mobile ? (clip.mobile || clip.desktop) : ((webm && clip.desktopWebm) || clip.desktop || clip.mobile);
}

/**
 * The opening film: the active clips in their saved order. The server renders the first poster (or the still)
 * so the hero is complete without JavaScript (and is the LCP image); movies are attached only after the page has
 * loaded, one file at a time, never for reduced motion, data saving or the 'static' mode, and on slow links only when
 * the visitor presses play. The logo appears once, `film.logoAt` seconds into the last clip.
 */
export function CinematicFilm({ film, still, mobileStill, alt, logoUrl, logoAlt, locale, deferUntilVisible = false }: {
  film: BuilderFilm; still: string; mobileStill: string; alt: string; logoUrl: string; logoAlt: string; locale: string;
  deferUntilVisible?: boolean;
}) {
  const fa = locale === 'fa';
  const clips = film.clips.filter(c => c.active && (c.desktop || c.mobile));
  const first = clips[0];
  const [naturalRatio, setNaturalRatio] = useState<string>();
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const userPaused = useRef(false);
  const [sources, setSources] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<State>(film.playback === 'static' || !first ? 'still' : 'idle');
  const [shown, setShown] = useState(false);
  const [resolved, setResolved] = useState(film.playback === 'static' || !first);
  const [progress, setProgress] = useState(0);
  const last = index === sources.length - 1;
  const clipKey = clips.map(c => `${c.id}:${c.desktop}:${c.desktopWebm}:${c.mobile}`).join('|');

  useEffect(() => {
    if (film.playback === 'static' || !clipKey) return;
    if (matchMedia(REDUCED).matches || saveData()) { setState('still'); setResolved(true); return; }
    if (slowLink()) { setState('ondemand'); return; }
    if (!deferUntilVisible) return afterLoad(() => startTransition(start));
    const el = frame.current;
    if (!el) return;
    let cancelLoad: (() => void) | undefined;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry || entry.intersectionRatio < 0.2) return;
      io.disconnect();
      cancelLoad = afterLoad(() => startTransition(start));
    }, { threshold: [0.2] });
    io.observe(el);
    return () => { io.disconnect(); cancelLoad?.(); };
    // clipKey captures every field of the active clips that changes the files.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [film.playback, clipKey, deferUntilVisible]);

  function start() {
    const mobile = matchMedia(MOBILE).matches;
    const webm = !mobile && Boolean(document.createElement('video').canPlayType('video/webm; codecs="vp9"'));
    setSources(clips.map(c => source(c, mobile, webm)).filter(Boolean));
    setIndex(0); setResolved(false); setState('loading');
  }

  useEffect(() => {
    const v = video.current;
    if (!v || !sources[index]) return;
    v.muted = true;
    v.play().catch(() => setState(s => (s === 'loading' ? 'blocked' : s)));
  }, [sources, index]);

  useEffect(() => {
    const el = frame.current;
    if (!el || !sources.length) return;
    // Offscreen: pause, and resume only what the visitor did not pause themselves.
    const io = new IntersectionObserver(([entry]) => {
      const v = video.current;
      if (!entry || !v || v.ended || userPaused.current) return;
      if (entry.intersectionRatio < 0.2) v.pause(); else void v.play().catch(() => undefined);
    }, { threshold: [0, 0.2] });
    io.observe(el);
    return () => io.disconnect();
  }, [sources]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (state === 'ended') { userPaused.current = false; setResolved(false); setProgress(0); if (index === 0) { v.currentTime = 0; void v.play().catch(() => setState('blocked')); } else setIndex(0); return; }
    if (v.paused) { userPaused.current = false; void v.play().catch(() => setState('blocked')); }
    else { userPaused.current = true; v.pause(); }
  };
  const onTime = () => {
    const v = video.current;
    if (!v) return;
    // A film may open from black; reveal it over the poster once the picture is on screen.
    if (!shown && v.currentTime >= 0.3) setShown(true);
    if (v.duration) setProgress(Math.min(1, (index + v.currentTime / v.duration) / sources.length));
    if (last && film.logoAt !== null && v.currentTime >= film.logoAt) setResolved(true);
  };
  const onEnded = () => {
    if (!last) { setIndex(i => i + 1); return; }
    if (film.playback === 'loop') { setResolved(true); if (sources.length > 1) setIndex(0); else { const v = video.current; if (v) { v.currentTime = 0; void v.play().catch(() => undefined); } } return; }
    setState('ended'); setShown(true); setResolved(true); setProgress(1);
  };
  const isStill = state === 'still';
  const poster = first?.poster || still; const mobilePoster = first?.mobilePoster || first?.poster || mobileStill || still;
  const picture = (desktop: string, mobile: string) => desktop || mobile ? <><source media={MOBILE} srcSet={mobile || desktop} /><img src={desktop || mobile} alt={alt} width={deferUntilVisible ? 1400 : 1280} height={deferUntilVisible ? 224 : 720} loading={deferUntilVisible ? 'lazy' : 'eager'} fetchPriority={deferUntilVisible ? 'low' : 'high'} decoding="async" /></> : null;
  const label = state === 'playing' ? (fa ? 'توقف فیلم' : 'Pause film') : state === 'ended' ? (fa ? 'پخش دوباره' : 'Replay film') : (fa ? 'پخش فیلم' : 'Play film');
  const Icon = state === 'playing' ? Pause : state === 'ended' ? RotateCcw : Play;

  return <div ref={frame} className="cine-film" data-state={state} data-shown={shown} data-resolved={resolved || undefined} style={{ '--cine-natural-ratio': naturalRatio, '--cine-progress': progress, '--cine-logo-width': `${film.logoWidth}%` } as React.CSSProperties}>
    <picture className="cine-still">
      {isStill || !poster ? picture(still, mobileStill) : <>
        {/* Reduced motion never shows the opening poster: it would promise a film that will not play. */}
        {still ? <source media={`${REDUCED} and ${MOBILE}`} srcSet={mobileStill || still} /> : null}
        {still ? <source media={REDUCED} srcSet={still} /> : null}
        {picture(poster, mobilePoster)}
      </>}
    </picture>
    {sources[index] && !isStill ? <video ref={video} key={index} className="cine-video" src={sources[index]} muted playsInline preload="auto" loop={film.playback === 'loop' && sources.length === 1} aria-hidden tabIndex={-1}
      onLoadedMetadata={e => { const v = e.currentTarget; if (v.videoWidth && v.videoHeight) setNaturalRatio(`${v.videoWidth}/${v.videoHeight}`); }} onPlaying={() => setState('playing')} onPause={() => setState(s => (s === 'ended' ? s : 'paused'))} onTimeUpdate={onTime} onEnded={onEnded}
      onError={() => { if (!last) setIndex(i => i + 1); else { setSources([]); setState('still'); setResolved(true); } }} /> : null}
    {film.logoAt !== null && logoUrl ? <img className="cine-logo" src={logoUrl} alt={logoAlt} width={600} height={191} decoding="async" /> : null}
    {(sources.length && !isStill) || state === 'ondemand' ? <div className="cine-controls">
      <button type="button" className="cine-control" onClick={state === 'ondemand' ? start : toggle} aria-label={label} data-emphasis={state === 'blocked' || state === 'ondemand' || undefined}><Icon aria-hidden size={18} />{state === 'blocked' || state === 'ondemand' ? <span>{label}</span> : null}</button>
      <span className="cine-progress" aria-hidden><span /></span>
    </div> : null}
  </div>;
}
