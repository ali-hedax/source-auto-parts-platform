'use client';

import * as RDialog from '@radix-ui/react-dialog';
import type { AssistantMessageResult, AssistantPublicSettings, AssistantReply } from '@hedax/contracts';
import { ASSISTANT_TOPICS, assistantReply } from '@hedax/contracts/constants';
import { EyeOff, LocateFixed, MessageCircle, Minimize2, Pause, Play, Send, X } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { api } from '@/lib/api/client';

function PlainText({ text }: { text: string }) {
  return <>{text.split(/([A-Za-z0-9][A-Za-z0-9._/-]*)/g).map((part, i) => /^[A-Za-z0-9]/.test(part) ? <bdi key={i} dir="ltr">{part}</bdi> : part)}</>;
}

export function HedaxAssistantWidget({ locale, settings }: { locale: 'fa' | 'en'; settings: AssistantPublicSettings }) {
  const t = useTranslations('assistant');
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [crowded, setCrowded] = useState(false);
  const [obstructed, setObstructed] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [lift, setLift] = useState(0);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Array<{ question: string; reply: AssistantReply; products?: AssistantMessageResult['products'] }>>([]);
  const [busy, setBusy] = useState(false);
  const [viewport, setViewport] = useState<{ top: number; height: number } | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLElement>(null);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const suppressOpen = useRef(false);
  useEffect(() => {
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!dock.current) return;
        const characterWidth = (window.innerWidth >= 640 ? settings.desktopSize : settings.mobileSize) * 1.8;
        const width = characterWidth + 16;
        const height = characterWidth * 1.5 + 52;
        const margin = window.innerWidth >= 640 ? 24 : 12;
        const baseBottom = dock.current.getBoundingClientRect().bottom + lift;
        const atLeft = (settings.placement === 'start') === (locale === 'en');
        const intersects = (left: number, top: number, w: number, h: number) => [...document.querySelectorAll('main a, main button, main input, main select, main textarea')].some((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.left < left + w && r.right > left && r.top < top + h && r.bottom > top;
        });
        const leftX = margin;
        const rightX = window.innerWidth - margin - 64;
        const choices = [0, 128, 256, 384].flatMap((offset) => [false, true].map((flip) => ({ offset, flip, left: flip ? !atLeft : atLeft, bottom: baseBottom - offset })));
        const choice = choices.find((c) => c.bottom - 116 >= 160 && !intersects(c.left ? leftX : rightX, c.bottom - 116, 64, 116));
        const flip = choice?.flip ?? false;
        const bottom = choice?.bottom ?? baseBottom;
        setFlipped(flip);
        setLift(choice?.offset ?? 0);
        const useLeft = flip ? !atLeft : atLeft;
        setCrowded(intersects(useLeft ? margin : window.innerWidth - margin - width, bottom - height, width, height));
        // Prefer the opposite vetted edge before yielding when both edges are occupied.
        setObstructed(!choice);
      });
    };
    check();
    window.addEventListener('scroll', check, true);
    window.addEventListener('resize', check);
    document.addEventListener('focusin', check);
    const observer = new ResizeObserver(check);
    const main = document.querySelector('main');
    if (main) observer.observe(main);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', check, true); window.removeEventListener('resize', check); document.removeEventListener('focusin', check); observer.disconnect(); };
  }, [settings.desktopSize, settings.mobileSize, settings.placement, locale, lift]);
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
    const resize = () => { const v = window.visualViewport; if (v) setViewport({ top: v.offsetTop + 16, height: v.height - 32 }); };
    resize();
    window.visualViewport?.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('scroll', resize);
    return () => { document.removeEventListener('visibilitychange', visibility); window.visualViewport?.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('scroll', resize); };
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);
  const preference = (key: string, value: boolean) => { try { localStorage.setItem(key, String(value)); } catch { /* No message content is persisted. */ } };
  const toggleMotion = () => { setPaused(!paused); preference('hedax-guide-paused', !paused); };
  const toggleCompact = () => { setCompact(!compact); preference('hedax-guide-compact', !compact); };
  const clamp = (x: number, y: number) => {
    const rect = dock.current?.getBoundingClientRect();
    const width = rect?.width ?? settings.desktopSize;
    const height = rect?.height ?? settings.desktopSize;
    return { x: Math.max(8, Math.min(x, window.innerWidth - width - 8)), y: Math.max(8 + (window.visualViewport?.offsetTop ?? 0), Math.min(y, (window.visualViewport?.offsetTop ?? 0) + (window.visualViewport?.height ?? window.innerHeight) - height - 8)) };
  };
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
    if (active.moved) { event.preventDefault(); setPosition(clamp(active.originX + dx, active.originY + dy)); }
  };
  const pointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.moved) { suppressOpen.current = true; persistPosition(clamp(active.originX + event.clientX - active.startX, active.originY + event.clientY - active.startY)); window.setTimeout(() => { suppressOpen.current = false; }, 0); }
    drag.current = null;
  };
  const append = (question: string, reply: AssistantReply, products?: AssistantMessageResult['products']) => setMessages((m) => [...m.slice(-19), { question, reply, products }]);
  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setBusy(true);
    try {
      const history = messages.slice(-4).flatMap((m) => [{ role: 'user' as const, content: m.question }, { role: 'assistant' as const, content: m.reply.text }]);
      const result = await api<AssistantMessageResult>('/assistant/messages', { method: 'POST', body: { locale, message: question.trim(), history } });
      append(question.trim(), { text: result.text, links: [] }, result.products); setDraft('');
    } catch { append(question.trim(), { text: locale === 'fa' ? 'اتصال دستیار اکنون در دسترس نیست. برای پیگیری با ما تماس بگیرید.' : 'The assistant is currently unavailable. Contact us for help.', links: [{ href: '/contact', label: locale === 'fa' ? 'تماس با ما' : 'Contact us' }] }); }
    finally { setBusy(false); }
  };
  const moving = settings.animationEnabled && !paused && !hidden;
  const size = { '--assistant-mobile': `${settings.mobileSize}px`, '--assistant-desktop': `${settings.desktopSize}px`, '--assistant-lift': `${lift}px` } as CSSProperties;
  const placement = flipped ? (settings.placement === 'start' ? 'end' : 'start') : settings.placement;
  const panelSide = placement === 'start' ? 'start-3 sm:start-6' : 'end-3 sm:end-6';
  const side = position ? '' : panelSide;
  const dockStyle = { ...size, ...(position ? { left: position.x, top: position.y, bottom: 'auto' } : {}) };
  if (dismissed) return null;
  return (
    <aside ref={dock} aria-label={settings.name[locale]} className={`assistant-dock fixed ${side} z-40 ${obstructed && !open && !position ? 'invisible' : ''}`} style={dockStyle} data-moving={moving} data-compact={compact} data-crowded={crowded}>
      <RDialog.Root open={open} onOpenChange={setOpen}>
        <div className="assistant-character-controls relative flex flex-col items-center gap-1">
          <RDialog.Trigger asChild>
            <button type="button" aria-label={t('open')} className="assistant-character flex min-h-12 min-w-12 touch-none cursor-grab flex-col items-center rounded-xl p-1 text-action outline-offset-4 active:cursor-grabbing" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { drag.current = null; }} onClick={(event) => { if (suppressOpen.current) event.preventDefault(); }}>
              {compact ? <MessageCircle aria-hidden className="size-6" /> : <Image src="/assistant/hedax-mechanic-idle-v1.png" alt="" width={1024} height={1536} unoptimized loading="lazy" className="assistant-mascot object-contain" style={{ height: 'auto' }} />}
            </button>
          </RDialog.Trigger>
          <div className="assistant-character-actions absolute start-1/2 top-full flex -translate-x-1/2 gap-1 rounded-full border border-line-soft bg-white/95 p-1 shadow-[var(--shadow-overlay)] rtl:translate-x-1/2">
            <button type="button" className="grid size-10 cursor-pointer place-items-center rounded-full text-steel hover:bg-surface" onClick={toggleCompact} aria-label={compact ? t('expand') : t('minimize')}><Minimize2 aria-hidden className="size-4" /></button>
            {position ? <button type="button" className="grid size-10 cursor-pointer place-items-center rounded-full text-steel hover:bg-surface" onClick={() => persistPosition(null)} aria-label={t('resetPosition')}><LocateFixed aria-hidden className="size-4" /></button> : null}
            <button type="button" className="grid size-10 cursor-pointer place-items-center rounded-full text-steel hover:bg-surface" onClick={() => setDismissed(true)} aria-label={t('hide')}><EyeOff aria-hidden className="size-4" /></button>
          </div>
        </div>
        <RDialog.Portal>
          <RDialog.Overlay className="fixed inset-0 z-50 bg-carbon/40" />
          <RDialog.Content dir={locale === 'fa' ? 'rtl' : 'ltr'} className={`assistant-panel fixed inset-x-3 z-50 mx-auto flex w-auto max-w-md flex-col overflow-hidden rounded-[var(--radius-panel)] border border-line-soft bg-white shadow-[var(--shadow-overlay)] sm:inset-x-auto sm:mx-0 sm:w-[26rem] ${panelSide}`} style={viewport ? { top: viewport.top, maxHeight: viewport.height } : undefined}>
            <header className="on-dark flex items-center gap-2 bg-carbon p-3 text-silver">
              <Image src="/assistant/hedax-mechanic-idle-v1.png" alt="" width={40} height={60} unoptimized className="h-12 w-auto object-contain" />
              <div className="min-w-0 flex-1"><RDialog.Title className="font-bold">{settings.name[locale]}</RDialog.Title><p className="text-xs text-tech-light">{t('phase')}</p></div>
              <button type="button" className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg hover:bg-white/10" onClick={toggleMotion} aria-label={paused ? t('resume') : t('pause')} aria-pressed={paused}>{paused ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}</button>
              <RDialog.Close className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg hover:bg-white/10" aria-label={t('close')}><X aria-hidden className="size-5" /></RDialog.Close>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-canvas p-4">
              <RDialog.Description className="mb-3 text-xs leading-6 text-steel">{t('disclaimer')}</RDialog.Description>
              <div className="rounded-xl border border-line-soft bg-white p-4 text-sm leading-7"><p className="font-semibold">{settings.greeting[locale]}</p><p>{settings.introduction[locale]}</p></div>
              <div className="my-3 grid grid-cols-2 gap-2">{ASSISTANT_TOPICS.map((topic) => <button key={topic} type="button" className="min-h-12 cursor-pointer rounded-xl border border-line-strong bg-white px-3 py-2 text-start text-sm font-semibold text-action hover:bg-surface" onClick={() => append(settings.topics[topic].label[locale], assistantReply(settings, locale, topic))}>{settings.topics[topic].label[locale]}</button>)}</div>
              <div role="log" aria-live="polite" aria-relevant="additions" className="space-y-3">
                {messages.map((message, i) => <div key={i} className="space-y-2 text-sm leading-7"><p className="ms-6 rounded-xl bg-action p-3 text-white"><PlainText text={message.question} /></p><div className="me-3 rounded-xl border border-line-soft bg-white p-3"><p><PlainText text={message.reply.text} /></p>{message.reply.links.map((link) => <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="mt-2 inline-flex min-h-11 items-center font-bold text-action underline underline-offset-4">{link.label}</Link>)}</div>{message.products?.map((p) => <Link key={p.slug} href={`/parts/${p.slug}`} onClick={() => setOpen(false)} className="block rounded-xl border border-line-soft bg-white p-3"><strong>{p.name[locale] || p.name.fa}</strong><div dir="ltr" className="text-xs text-steel">{p.partNumber || p.sku}</div><div>{p.availability} · {p.price.kind === 'price' ? `${p.price.display.amountMinor} ${p.price.display.currency} / ${locale === 'fa' ? p.unit.name : p.unit.nameEn || p.unit.name}` : (locale === 'fa' ? 'استعلام قیمت' : 'Price inquiry')}</div></Link>)}</div>)}
              </div><div ref={end} />
            </div>
            <form className="flex shrink-0 gap-2 border-t border-line-soft bg-white p-3" onSubmit={(e) => { e.preventDefault(); void ask(draft); }}>
              <label htmlFor="assistant-input" className="sr-only">{t('input')}</label><Input id="assistant-input" dir="auto" autoComplete="off" maxLength={160} placeholder={t('input')} value={draft} onChange={(e) => setDraft(e.target.value)} className="min-w-0 flex-1" />
              <Button type="submit" aria-label={t('send')} disabled={!draft.trim() || busy} loading={busy}><Send aria-hidden className="size-4" /></Button>
            </form>
          </RDialog.Content>
        </RDialog.Portal>
      </RDialog.Root>
    </aside>
  );
}
