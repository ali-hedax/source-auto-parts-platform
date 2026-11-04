'use client';

import './atelier-assistant.css';

import * as RDialog from '@radix-ui/react-dialog';
import type { AssistantMessageResult, AssistantPublicSettings, AssistantReply } from '@hedax/contracts';
import { ASSISTANT_TOPICS, assistantReply } from '@hedax/contracts/constants';
import { EyeOff, LocateFixed, Maximize2, Minimize2, Pause, Play, Send, X } from 'lucide-react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Price } from '@/components/ui/format';
import { api } from '@/lib/api/client';
import { useAfterLoad } from '@/lib/after-load';
import { randomId } from '@/lib/random-id';
import { OperatorPanel } from './operator-panel';

/** Reply action that opens the operator form inside the guide instead of navigating. */
const OPERATOR_LINK = '#operator';
/** Shown when the guide cannot reach the server; the same tone as the server's "temporarily slow" reply. */
const fallbackText = (locale: 'fa' | 'en') => locale === 'fa'
  ? 'پاسخ هوشمند من همین حالا کمی کُند شده؛ ببخشید! 🙏 برای جواب دقیق، دکمهٔ «ارتباط با اپراتور» را بزنید تا همکاران ما به شما پاسخ بدهند، یا در صفحهٔ جست‌وجوی قطعات بگردید.'
  : 'My smart answers are a little slow right now, sorry! 🙏 For a precise answer, tap “Talk to an operator” and our team will reply, or search on the parts page.';
const fallbackLinks = (locale: 'fa' | 'en') => [
  { href: OPERATOR_LINK, label: locale === 'fa' ? 'ارتباط با اپراتور' : 'Talk to an operator' },
  { href: '/parts', label: locale === 'fa' ? 'جست‌وجوی قطعات' : 'Search parts' },
  { href: '/request-part', label: locale === 'fa' ? 'درخواست تأمین قطعه' : 'Request a part' },
];

/** Older saved settings still say «ارتباط با پشتیبانی»; the support topic now opens the operator form. */
const topicLabel = (label: string, topic: string, locale: 'fa' | 'en') => topic !== 'support' ? label : /پشتیبان|contact support/i.test(label) ? (locale === 'fa' ? 'ارتباط با اپراتور' : 'Talk to an operator') : label;

/** Right-sized transparent WebP renders of the character (the 1024×1536 PNG source weighs 1.6 MB). */
const MASCOT = '/brand/source/atelier/hexi';


/**
 * The configured sizes, bounded: a phone only ever shows the small launcher, and on wide screens the
 * full character must not outgrow what it stands beside, whatever an older saved setting says.
 */
const faceSize = (settings: Pick<AssistantPublicSettings, 'mobileSize'>) => Math.min(Math.max(settings.mobileSize, 48), 56);
const characterSize = (settings: Pick<AssistantPublicSettings, 'desktopSize'>) => Math.min(settings.desktopSize, 96);

/** What the guide must never sit on. A link counts unless it is a whole tall card, where only the card's own controls matter. */
const CONTROLS = 'button, input, select, textarea, video[controls], [role="combobox"], [data-assistant-avoid]';
function coversControl(dock: HTMLElement): boolean {
  const bubble = dock.querySelector('.assistant-greeting');
  for (const box of [dock.getBoundingClientRect(), ...(bubble ? [bubble.getBoundingClientRect()] : [])]) {
    for (let x = box.left + 2; x < box.right; x += 24) {
      for (let y = box.top + 2; y < box.bottom; y += 24) {
        for (const el of document.elementsFromPoint(x, y)) {
          if (dock.contains(el)) continue;
          const area = el.closest('main, footer');
          const hit = el.closest<HTMLElement>(`${CONTROLS}, a`);
          if (!area || !hit || !area.contains(hit)) continue;
          if (hit.matches(CONTROLS)) return true;
          const r = hit.getBoundingClientRect();
          if (r.height <= 64 || r.width * r.height < 160 * 64) return true;
        }
      }
    }
  }
  return false;
}

/** Against the page's own viewport, not the visible one: an opening keyboard must not push the guide about. */
function clampToViewport(x: number, y: number, el: HTMLElement | null) {
  const rect = el?.getBoundingClientRect();
  return { x: Math.max(8, Math.min(x, window.innerWidth - (rect?.width ?? 56) - 8)), y: Math.max(8, Math.min(y, window.innerHeight - (rect?.height ?? 56) - 8)) };
}

/** Wide screens (≥1024 px) get the non-modal side panel. */
function useDesktop() {
  // This component only ever renders in the browser (next/dynamic, ssr: false).
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const q = window.matchMedia('(min-width: 1024px)');
    const sync = () => setDesktop(q.matches);
    sync(); q.addEventListener('change', sync);
    return () => q.removeEventListener('change', sync);
  }, []);
  return desktop;
}

function PlainText({ text }: { text: string }) {
  return <>{text.split(/([A-Za-z0-9][A-Za-z0-9._/-]*)/g).map((part, i) => /^[A-Za-z0-9]/.test(part) ? <bdi key={i} dir="ltr">{part}</bdi> : part)}</>;
}

/** One browser tab's visit; nothing about the conversation is kept. */
function session(key: string) {
  try { return sessionStorage.getItem(key) === 'true'; } catch { return false; }
}
function rememberForVisit(key: string) {
  try { sessionStorage.setItem(key, 'true'); } catch { /* Optional. */ }
}

export function HedaxAssistantWidget({ locale, settings }: { locale: 'fa' | 'en'; settings: AssistantPublicSettings }) {
  const t = useTranslations('assistant');
  // Stock and price on product cards use the storefront's own labels and money format.
  const tSite = useTranslations();
  const artReady = useAfterLoad();
  const desktop = useDesktop();
  // The standing character needs room: only the wide home page has it. Inner pages, with a filter or form column under that corner, get the launcher.
  const pathname = usePathname();
  const home = /^\/(?:fa|en)\/?$/.test(pathname);
  // The parts lists keep a sticky filter column on the start side, so there the guide stands on the other side. Fixed per page, never while scrolling.
  const side = desktop && /\/(?:parts|imported-parts)\/?$/.test(pathname) ? 'end' : settings.placement;
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [dismissed, setDismissed] = useState(() => session('hedax-guide-dismissed'));
  const [yielding, setYielding] = useState(false);
  const [greeted, setGreeted] = useState(() => session('hedax-guide-greeted'));
  const [entrance] = useState(() => !session('hedax-guide-greeted'));
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Array<{ question: string; reply: AssistantReply; products?: AssistantMessageResult['products'] }>>([]);
  const [busy, setBusy] = useState(false);
  const [operator, setOperator] = useState(false);
  const [viewport, setViewport] = useState<{ top: number; height: number } | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const conversationId = useRef<string | null>(null);
  const dock = useRef<HTMLElement>(null);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const suppressOpen = useRef(false);
  // The guide has one fixed place: nothing moves it on scrolling (dragging is the only way). Scrolling only re-arms
  // a timer, and the check after it can change one attribute: whether to fade over a control now under it.
  // Never under a finger, while dragging or hovering, in a conversation, or with the focus on the guide itself.
  useEffect(() => {
    let timer = 0;
    let touching = false;
    const settle = () => {
      const el = dock.current;
      if (!el || touching || drag.current || document.querySelector('.assistant-panel')) return;
      if (el.contains(document.activeElement) || el.matches(':hover')) { setYielding(false); return; }
      setYielding(coversControl(el));
    };
    const later = () => { window.clearTimeout(timer); timer = window.setTimeout(settle, 140); };
    const held = () => { touching = true; window.clearTimeout(timer); };
    const released = (event: TouchEvent) => { if (!event.touches.length) { touching = false; later(); } };
    const resized = () => {
      later();
      setPosition((p) => {
        if (!p) return p;
        const next = clampToViewport(p.x, p.y, dock.current);
        return next.x === p.x && next.y === p.y ? p : next;
      });
    };
    later();
    window.addEventListener('scroll', later, { capture: true, passive: true });
    window.addEventListener('resize', resized);
    document.addEventListener('focusin', later);
    document.addEventListener('focusout', later);
    document.addEventListener('touchstart', held, { capture: true, passive: true });
    document.addEventListener('touchend', released, { capture: true, passive: true });
    document.addEventListener('touchcancel', released, { capture: true, passive: true });
    window.visualViewport?.addEventListener('resize', later);
    const observer = new ResizeObserver(later);
    const main = document.querySelector('main');
    if (main) observer.observe(main);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('scroll', later, { capture: true });
      window.removeEventListener('resize', resized);
      document.removeEventListener('focusin', later);
      document.removeEventListener('focusout', later);
      document.removeEventListener('touchstart', held, { capture: true });
      document.removeEventListener('touchend', released, { capture: true });
      document.removeEventListener('touchcancel', released, { capture: true });
      window.visualViewport?.removeEventListener('resize', later);
      observer.disconnect();
    };
  }, []);
  // The greeting speaks once per visit, on wide screens, and then leaves the page alone.
  useEffect(() => {
    if (greeted) return;
    const timer = window.setTimeout(() => { setGreeted(true); rememberForVisit('hedax-guide-greeted'); }, 8000);
    return () => window.clearTimeout(timer);
  }, [greeted]);
  useEffect(() => {
    try {
      setPaused(localStorage.getItem('hedax-guide-paused') === 'true');
      setCompact(localStorage.getItem('hedax-guide-compact') === 'true');
      const saved = JSON.parse(localStorage.getItem('hedax-guide-position') ?? 'null') as { x?: unknown; y?: unknown } | null;
      if (saved && typeof saved.x === 'number' && typeof saved.y === 'number' && Number.isFinite(saved.x) && Number.isFinite(saved.y)) setPosition({ x: saved.x, y: saved.y });
    } catch { /* Preferences are optional. */ }
    const visibility = () => setHidden(document.hidden);
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  // Only an open panel follows the visible viewport and keyboard; a closed guide renders nothing on these events.
  useEffect(() => {
    if (!open) return;
    const resize = () => { const v = window.visualViewport; if (v) setViewport({ top: v.offsetTop + 16, height: v.height - 32 }); };
    resize();
    window.visualViewport?.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('scroll', resize);
    return () => { window.visualViewport?.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('scroll', resize); };
  }, [open]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);
  const preference = (key: string, value: boolean) => { try { localStorage.setItem(key, String(value)); } catch { /* No message content is persisted. */ } };
  const toggleMotion = () => { setPaused(!paused); preference('hedax-guide-paused', !paused); };
  const toggleCompact = () => { setCompact(!compact); preference('hedax-guide-compact', !compact); };
  const hide = () => { setDismissed(true); rememberForVisit('hedax-guide-dismissed'); };
  const persistPosition = (next: { x: number; y: number } | null) => {
    setPosition(next);
    try { if (next) localStorage.setItem('hedax-guide-position', JSON.stringify(next)); else localStorage.removeItem('hedax-guide-position'); } catch { /* Optional preference. */ }
  };
  const pointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !dock.current) return;
    const rect = dock.current.getBoundingClientRect();
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: rect.left, originY: rect.top, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const dx = event.clientX - active.startX; const dy = event.clientY - active.startY;
    if (Math.hypot(dx, dy) > 6) active.moved = true;
    if (active.moved) { event.preventDefault(); setPosition(clampToViewport(active.originX + dx, active.originY + dy, dock.current)); }
  };
  const pointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.moved) { suppressOpen.current = true; persistPosition(clampToViewport(active.originX + event.clientX - active.startX, active.originY + event.clientY - active.startY, dock.current)); window.setTimeout(() => { suppressOpen.current = false; }, 0); }
    drag.current = null;
  };
  /** One random id per browser tab, so the owner's log groups this visitor's messages; no content is stored here. */
  const chatSessionId = () => {
    if (conversationId.current) return conversationId.current;
    let id: string | null = null;
    try { id = sessionStorage.getItem('hedax-guide-conversation'); } catch { /* Optional. */ }
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = randomId();
      try { if (id) sessionStorage.setItem('hedax-guide-conversation', id); } catch { /* Optional. */ }
    }
    conversationId.current = id;
    return id;
  };
  const append = (question: string, reply: AssistantReply, products?: AssistantMessageResult['products']) => setMessages((m) => [...m.slice(-19), { question, reply, products }]);
  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setBusy(true);
    try {
      // The fixed "temporarily slow" replies carry no conversation, so they are left out of the history.
      const history = messages.filter((m) => !m.reply.links.some((l) => l.href === OPERATOR_LINK)).slice(-4).flatMap((m) => [{ role: 'user' as const, content: m.question }, { role: 'assistant' as const, content: m.reply.text }]);
      const result = await api<AssistantMessageResult>('/assistant/messages', { method: 'POST', body: { locale, message: question.trim(), history, ...(chatSessionId() ? { conversationId: chatSessionId() } : {}) } });
      append(question.trim(), { text: result.text, links: result.provider === 'fallback' ? fallbackLinks(locale) : [] }, result.products); setDraft('');
    } catch { append(question.trim(), { text: fallbackText(locale), links: fallbackLinks(locale) }); }
    finally { setBusy(false); }
  };
  const moving = settings.animationEnabled && !paused && !hidden;
  const launcherOnly = !desktop || !home || compact;
  const size = { '--assistant-face': `${faceSize(settings)}px`, '--assistant-avatar-mobile': `${characterSize(settings)}px`, '--assistant-avatar-desktop': `${characterSize(settings)}px` } as CSSProperties;
  const avatar = settings.avatarUrl || `${MASCOT}.webp`;
  const customAvatar = avatar !== `${MASCOT}.webp`;
  // The default character is cropped to head and shoulders inside the circle; an uploaded avatar is shown whole.
  const avatarFit = 'object-contain';
  const panelSide = side === 'start' ? 'start-3 sm:start-6' : 'end-3 sm:end-6';
  const dockStyle = { ...size, ...(position ? { left: position.x, top: position.y, bottom: 'auto' } : {}) };
  if (dismissed) return null;
  return (
    <aside ref={dock} aria-label={settings.name[locale]} className="atelier-assistant assistant-dock fixed z-40" style={dockStyle} data-side={position ? undefined : side} data-moving={moving} data-compact={launcherOnly} data-yield={yielding && !open} data-entrance={entrance && desktop}>
      {/* Desktop: a side panel over the page (no dimming, the page stays usable); phones: a modal that follows the visible viewport and keyboard. */}
      <RDialog.Root open={open} onOpenChange={setOpen} modal={!desktop}>
        {/* The small actions row sits inside the dock (below the avatar), so it never falls off the screen edge. */}
        {open || launcherOnly || greeted ? null : <p className="assistant-greeting">{settings.greeting[locale]}</p>}
        <div className={`assistant-character-controls relative flex flex-col items-center gap-1 ${launcherOnly ? '' : 'pb-[3.25rem]'}`}>
          <RDialog.Trigger asChild>
            <button type="button" aria-label={t('open')} className="assistant-character grid min-h-12 min-w-12 touch-none cursor-grab place-items-center rounded-full text-action outline-offset-4 active:cursor-grabbing" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { drag.current = null; }} onClick={(event) => { if (suppressOpen.current) event.preventDefault(); }}>
              {launcherOnly ? (
                <span className="assistant-face" data-custom={customAvatar}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- the same pre-sized WebP; the circle reserves the box until it loads */}
                  <img {...(artReady ? { src: avatar } : {})} alt="" decoding="async" draggable={false} className="pointer-events-none select-none" />
                </span>
              ) : (
                <span className="assistant-avatar block overflow-hidden rounded-full border-2 border-white bg-stage shadow-[var(--shadow-overlay)]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP or the owner's uploaded avatar; the circle reserves the box until it loads */}
                  <img {...(artReady ? { src: avatar } : {})} alt="" width={160} height={160} decoding="async" draggable={false} className={`pointer-events-none size-full select-none ${avatarFit}`} />
                </span>
              )}
            </button>
          </RDialog.Trigger>
          {launcherOnly ? null : <div className="assistant-character-actions absolute bottom-0 start-1/2 flex -translate-x-1/2 gap-1 rounded-full border border-line-soft bg-white/95 p-1 shadow-[var(--shadow-overlay)] rtl:translate-x-1/2">
            <button type="button" className="grid size-10 cursor-pointer place-items-center rounded-full text-steel hover:bg-surface" onClick={toggleCompact} aria-label={t('minimize')}><Minimize2 aria-hidden className="size-4" /></button>
            {position ? <button type="button" className="grid size-10 cursor-pointer place-items-center rounded-full text-steel hover:bg-surface" onClick={() => persistPosition(null)} aria-label={t('resetPosition')}><LocateFixed aria-hidden className="size-4" /></button> : null}
            <button type="button" className="grid size-10 cursor-pointer place-items-center rounded-full text-steel hover:bg-surface" onClick={hide} aria-label={t('hide')}><EyeOff aria-hidden className="size-4" /></button>
          </div>}
        </div>
        <RDialog.Portal>
          {desktop ? null : <RDialog.Overlay className="fixed inset-0 z-50 bg-stage/50" />}
          <RDialog.Content dir={locale === 'fa' ? 'rtl' : 'ltr'} onInteractOutside={(e) => { if (desktop) e.preventDefault(); }}
            className={`atelier-assistant assistant-panel fixed z-50 flex flex-col overflow-hidden rounded-[var(--radius-panel)] border border-line-soft bg-white shadow-[var(--shadow-overlay)] ${desktop ? `bottom-6 w-[26rem] max-h-[min(38rem,calc(100dvh-8rem))] ${panelSide}` : 'inset-x-3 mx-auto w-auto max-w-md'}`}
            style={!desktop && viewport ? { top: viewport.top, maxHeight: viewport.height } : undefined}>
            <header className="on-dark flex items-center gap-2 bg-stage p-3 text-silver">
              <span className="block size-11 shrink-0 overflow-hidden rounded-full border border-white/20 bg-stage-2">
                <Image src={settings.avatarUrl || `${MASCOT}.webp`} alt="" width={44} height={44} unoptimized className={`size-full ${avatarFit}`} />
              </span>
              <div className="min-w-0 flex-1"><RDialog.Title className="font-bold">{settings.name[locale]}</RDialog.Title><p className="text-xs text-signal">{t('phase')}</p></div>
              <button type="button" className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg hover:bg-white/10" onClick={toggleMotion} aria-label={paused ? t('resume') : t('pause')} aria-pressed={paused}>{paused ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}</button>
              {/* The launcher has no room for controls of its own: they live here. */}
              {desktop && home && compact ? <button type="button" className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg hover:bg-white/10" onClick={toggleCompact} aria-label={t('expand')}><Maximize2 aria-hidden className="size-4" /></button> : null}
              {launcherOnly && position ? <button type="button" className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg hover:bg-white/10" onClick={() => persistPosition(null)} aria-label={t('resetPosition')}><LocateFixed aria-hidden className="size-4" /></button> : null}
              {launcherOnly ? <button type="button" className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg hover:bg-white/10" onClick={hide} aria-label={t('hide')}><EyeOff aria-hidden className="size-4" /></button> : null}
              <RDialog.Close className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg hover:bg-white/10" aria-label={t('close')}><X aria-hidden className="size-5" /></RDialog.Close>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-canvas p-4">
              <RDialog.Description className="mb-3 text-xs leading-6 text-steel">{t('disclaimer')}</RDialog.Description>
              {operator ? <OperatorPanel locale={locale} onBack={() => setOperator(false)} /> : <>
              <div className="flow-root rounded-xl border border-line-soft bg-white p-4 text-sm leading-7"><Image src={avatar} alt="" width={64} height={96} unoptimized className="assistant-intro-art" /><p className="font-semibold">{settings.greeting[locale]}</p><p>{settings.introduction[locale]}</p></div>
              <div className="my-3 grid grid-cols-2 gap-2">{ASSISTANT_TOPICS.map((topic) => <button key={topic} type="button" className="min-h-12 cursor-pointer rounded-xl border border-line-strong bg-white px-3 py-2 text-start text-sm font-semibold text-action hover:bg-surface" onClick={() => topic === 'support' ? setOperator(true) : append(settings.topics[topic].label[locale], assistantReply(settings, locale, topic))}>{topicLabel(settings.topics[topic].label[locale], topic, locale)}</button>)}</div>
              <div role="log" aria-live="polite" aria-relevant="additions" className="space-y-3">
                {messages.map((message, i) => <div key={i} className="space-y-2 text-sm leading-7"><p className="ms-6 rounded-xl bg-action p-3 text-white"><PlainText text={message.question} /></p><div className="me-3 rounded-xl border border-line-soft bg-white p-3"><p><PlainText text={message.reply.text} /></p>{message.reply.links.length ? <div className="mt-2 flex flex-wrap gap-x-4">{message.reply.links.map((link) => link.href === OPERATOR_LINK ? <button key={link.href} type="button" onClick={() => setOperator(true)} className="inline-flex min-h-11 cursor-pointer items-center font-bold text-action underline underline-offset-4">{link.label}</button> : <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center font-bold text-action underline underline-offset-4">{link.label}</Link>)}</div> : null}</div>{message.products?.map((p) => <Link key={p.slug} href={`/parts/${p.slug}`} onClick={() => setOpen(false)} className="block rounded-xl border border-line-soft bg-white p-3"><strong>{p.name[locale] || p.name.fa}</strong><div dir="ltr" className="text-xs text-steel">{p.partNumber || p.sku}</div><div className="mt-1 flex flex-wrap items-end justify-between gap-2"><span className="text-xs font-semibold text-steel">{tSite(`availability.${p.availability}`)}</span><Price price={p.price} unit={p.unit} /></div></Link>)}</div>)}
              </div></>}<div ref={end} />
            </div>
            {operator ? null : <form className="flex shrink-0 gap-2 border-t border-line-soft bg-white p-3" onSubmit={(e) => { e.preventDefault(); void ask(draft); }}>
              <label htmlFor="assistant-input" className="sr-only">{t('input')}</label><Input id="assistant-input" dir="auto" autoComplete="off" maxLength={160} placeholder={t('input')} value={draft} onChange={(e) => setDraft(e.target.value)} className="min-w-0 flex-1" />
              <Button type="submit" aria-label={t('send')} disabled={!draft.trim() || busy} loading={busy}><Send aria-hidden className="size-4" /></Button>
            </form>}
          </RDialog.Content>
        </RDialog.Portal>
      </RDialog.Root>
    </aside>
  );
}
