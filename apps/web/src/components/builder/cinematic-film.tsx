'use client';
import type { BuilderFilm } from '@hedax/contracts';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type State = 'idle' | 'loading' | 'playing' | 'paused' | 'blocked' | 'ended' | 'still';
type Clip = BuilderFilm['clips'][number];
const MOBILE = '(max-width: 639px)';
const REDUCED = '(prefers-reduced-motion: reduce)';

/** Data saver or a 2G-class connection: show the still frame and never fetch a movie. */
function saveData() {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return Boolean(c?.saveData) || /(^|-)2g$/.test(c?.effectiveType ?? '');
}
/** One file per clip for this device: the mobile file on phones, otherwise WebM where VP9 plays, else MP4. */
function source(clip: Clip, mobile: boolean, webm: boolean) {
  return mobile ? (clip.mobile || clip.desktop) : ((webm && clip.desktopWebm) || clip.desktop || clip.mobile);
}

/**
 * The opening film: the active clips in their saved order. The server renders the first poster (or the still)
 * so the hero is complete without JavaScript; movies are attached afterwards, one file at a time, and never for
 * reduced motion, data saving or the 'static' mode. The logo appears once, `film.logoAt` seconds into the last clip.
 */
export function CinematicFilm({ film, still, mobileStill, alt, logoUrl, logoAlt, locale }: {
  film: BuilderFilm; still: string; mobileStill: string; alt: string; logoUrl: string; logoAlt: string; locale: string;
}) {
  const fa = locale === 'fa';
  const clips = film.clips.filter(c => c.active && (c.desktop || c.mobile));
  const first = clips[0];
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
    const mobile = matchMedia(MOBILE).matches;
    const webm = !mobile && Boolean(document.createElement('video').canPlayType('video/webm; codecs="vp9"'));
    setSources(clips.map(c => source(c, mobile, webm)).filter(Boolean));
    setIndex(0); setState('loading');
    // clipKey captures every field of the active clips that changes the files.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [film.playback, clipKey]);

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
  const picture = (desktop: string, mobile: string) => desktop || mobile ? <><source media={MOBILE} srcSet={mobile || desktop} /><img src={desktop || mobile} alt={alt} width={1280} height={720} fetchPriority="high" decoding="async" /></> : null;
  const label = state === 'playing' ? (fa ? 'توقف فیلم' : 'Pause film') : state === 'ended' ? (fa ? 'پخش دوباره' : 'Replay film') : (fa ? 'پخش فیلم' : 'Play film');
  const Icon = state === 'playing' ? Pause : state === 'ended' ? RotateCcw : Play;

  return <div ref={frame} className="cine-film" data-state={state} data-shown={shown} data-resolved={resolved || undefined} style={{ '--cine-progress': progress, '--cine-logo-width': `${film.logoWidth}%` } as React.CSSProperties}>
    <picture className="cine-still">
      {isStill || !poster ? picture(still, mobileStill) : <>
        {/* Reduced motion never shows the opening poster: it would promise a film that will not play. */}
        {still ? <source media={`${REDUCED} and ${MOBILE}`} srcSet={mobileStill || still} /> : null}
        {still ? <source media={REDUCED} srcSet={still} /> : null}
        {picture(poster, mobilePoster)}
      </>}
    </picture>
    {sources[index] && !isStill ? <video ref={video} key={index} className="cine-video" src={sources[index]} muted playsInline preload="auto" loop={film.playback === 'loop' && sources.length === 1} aria-hidden tabIndex={-1}
      onPlaying={() => setState('playing')} onPause={() => setState(s => (s === 'ended' ? s : 'paused'))} onTimeUpdate={onTime} onEnded={onEnded}
      onError={() => { if (!last) setIndex(i => i + 1); else { setSources([]); setState('still'); setResolved(true); } }} /> : null}
    {film.logoAt !== null && logoUrl ? <img className="cine-logo" src={logoUrl} alt={logoAlt} width={600} height={191} decoding="async" /> : null}
    {sources.length && !isStill ? <div className="cine-controls">
      <button type="button" className="cine-control" onClick={toggle} aria-label={label} data-emphasis={state === 'blocked' || undefined}><Icon aria-hidden size={18} />{state === 'blocked' ? <span>{label}</span> : null}</button>
      <span className="cine-progress" aria-hidden><span /></span>
    </div> : null}
  </div>;
}
