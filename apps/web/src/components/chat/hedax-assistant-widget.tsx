'use client';

import './atelier-assistant.css';

import * as RDialog from '@radix-ui/react-dialog';
import type { AssistantMessageResult, AssistantPublicSettings, AssistantReply } from '@hedax/contracts';
import { ASSISTANT_TOPICS, assistantReply } from '@hedax/contracts/constants';
import { EyeOff, Minus, Send, X } from 'lucide-react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
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


/** Wide screens (≥1024 px) get the panel in the corner; phones a panel that follows the visible viewport and keyboard. */
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

/** Whether this visitor keeps the guide collapsed; a preference only, nothing about the conversation. */
function savedCollapsed() {
  try { return localStorage.getItem('hedax-guide-collapsed') === 'true'; } catch { return false; }
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
  const pathname = usePathname();
  // Lines of text and field labels begin on the start side, so on small screens he stands at the end of the lines.
  // The parts lists keep a sticky filter column on the start side, so he stands on the other side there too. Fixed per page.
  const list = /\/(?:parts|imported-parts)\/?$/.test(pathname);
  const side = desktop && !list ? settings.placement : 'end';
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => session('hedax-guide-dismissed'));
  const [collapsed, setCollapsed] = useState(savedCollapsed);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Array<{ question: string; reply: AssistantReply; products?: AssistantMessageResult['products'] }>>([]);
  const [busy, setBusy] = useState(false);
  const [operator, setOperator] = useState(false);
  const [viewport, setViewport] = useState<{ top: number; height: number } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const conversationId = useRef<string | null>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const chip = useRef<HTMLButtonElement>(null);
  const movedByHand = useRef(false);
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
  // The button pressed goes away with the swap, so the focus moves to the one that replaces it.
  useEffect(() => {
    if (!movedByHand.current) return;
    movedByHand.current = false;
    (collapsed ? chip : launcher).current?.focus();
  }, [collapsed]);
  const hide = () => { setDismissed(true); rememberForVisit('hedax-guide-dismissed'); };
  const collapse = (next: boolean) => {
    movedByHand.current = true;
    setCollapsed(next);
    try { localStorage.setItem('hedax-guide-collapsed', String(next)); } catch { /* Optional. */ }
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
  const avatar = settings.avatarUrl || `${MASCOT}.webp`;
  const customAvatar = avatar !== `${MASCOT}.webp`;
  const avatarFit = 'object-contain';
  const panelSide = side === 'start' ? 'start-3 sm:start-6' : 'end-3 sm:end-6';
  if (dismissed) return null;
  return (
    // A direct child of <body> with its place set in CSS: no transformed parent can move it, and no script writes to it.
    <aside aria-label={settings.name[locale]} className="atelier-assistant assistant-dock" data-side={side} data-list={list} data-state={collapsed ? 'collapsed' : 'full'} data-motion={settings.animationEnabled} style={{ '--hexi-mobile': `${settings.mobileSize}px`, '--hexi-desktop': `${settings.desktopSize}px` } as CSSProperties}>
      <RDialog.Root open={open} onOpenChange={setOpen}>
        {collapsed ? (
          <button ref={chip} type="button" className="assistant-chip" aria-label={t('expand')} onClick={() => collapse(false)}>
            <span className="assistant-chip-face" data-custom={customAvatar}>
              {/* eslint-disable-next-line @next/next/no-img-element -- the same pre-sized WebP, cropped to his face in CSS */}
              <img {...(artReady ? { src: avatar } : {})} alt="" decoding="async" draggable={false} />
            </span>
            {t('label')}
          </button>
        ) : <>
          <RDialog.Trigger ref={launcher} aria-label={t('open')} className="assistant-launcher">
            <span className="assistant-pose">
              {/* eslint-disable-next-line @next/next/no-img-element -- the same pre-sized WebP; the pose box reserves its space until it loads */}
              <img {...(artReady ? { src: avatar } : {})} alt="" decoding="async" draggable={false} className="assistant-art" />
            </span>
            <span className="assistant-plate"><span className="assistant-plate-name">{settings.name[locale]}</span><span className="assistant-plate-role">{t('phase')}</span></span>
          </RDialog.Trigger>
          <button type="button" className="assistant-collapse" aria-label={t('collapse')} onClick={() => collapse(true)}><Minus aria-hidden className="size-3.5" /></button>
        </>}
        <RDialog.Portal>
          {/* Modal at every size: the page behind cannot be tapped by mistake while the panel is over it. */}
          <RDialog.Overlay className="fixed inset-0 z-50 bg-stage/50" />
          <RDialog.Content dir={locale === 'fa' ? 'rtl' : 'ltr'}
            className={`atelier-assistant assistant-panel fixed z-50 flex flex-col overflow-hidden rounded-[var(--radius-panel)] border border-line-soft bg-white shadow-[var(--shadow-overlay)] ${desktop ? `bottom-6 w-[26rem] max-h-[min(38rem,calc(100dvh-8rem))] ${panelSide}` : 'inset-x-3 mx-auto w-auto max-w-md'}`}
            style={!desktop && viewport ? { top: viewport.top, maxHeight: viewport.height } : undefined}>
            <header className="on-dark flex items-center gap-2 bg-stage p-3 text-silver">
              <span className="block size-11 shrink-0 overflow-hidden rounded-full border border-white/20 bg-stage-2">
                <Image src={settings.avatarUrl || `${MASCOT}.webp`} alt="" width={44} height={44} unoptimized className={`size-full ${avatarFit}`} />
              </span>
              <div className="min-w-0 flex-1"><RDialog.Title className="font-bold">{settings.name[locale]}</RDialog.Title><p className="text-xs text-signal">{t('phase')}</p></div>
              <button type="button" className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg hover:bg-white/10" onClick={hide} aria-label={t('hide')}><EyeOff aria-hidden className="size-4" /></button>
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
