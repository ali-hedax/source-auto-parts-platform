'use client';

import { MessageCircle, Search, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

type ChatLink = { label: string; href: string };
type ChatMessage = { id: number; from: 'visitor' | 'guide'; text: string; link?: ChatLink };
type Topic = 'search' | 'stock' | 'order' | 'support';

const topics: Topic[] = ['search', 'stock', 'order', 'support'];

function assistantCopy(en: boolean) {
  return en
    ? {
        title: 'HEDAX Guide',
        description: 'Quick website help · Not an AI agent yet',
        greeting: 'Hi! I can help you find parts and navigate the store. What do you need?',
        placeholder: 'Part name, number or question…',
        open: 'Open HEDAX guide',
        close: 'Close guide',
        send: 'Send message',
        choices: ['Find a part', 'Price & availability', 'How to order', 'Contact support'],
        search: 'Enter a part number or name in the parts search. Always confirm vehicle compatibility before ordering.',
        stock: 'Current prices and availability are shown on each product page when available. I cannot check live stock in this chat yet.',
        order: 'You can browse the catalog and use the available ordering options. For help with a specific order, contact the team.',
        support: 'Our contact page has the latest ways to reach the team.',
        fallback: 'I am a simple site guide for now, so I cannot answer technical fitment questions reliably. Search the parts catalog or contact the team.',
        searchLink: 'Browse parts',
        supportLink: 'Contact the team',
        searchHint: 'Search the catalog for your words:',
      }
    : {
        title: 'راهنمای HEDAX',
        description: 'راهنمای سریع سایت · فعلاً بدون هوش مصنوعی',
        greeting: 'سلام! 👋 من راهنمای سایت سورس هستم. برای پیدا کردن قطعه یا راهنمایی خرید کمکت می‌کنم.',
        placeholder: 'نام قطعه، شماره فنی یا سؤال شما…',
        open: 'باز کردن راهنمای HEDAX',
        close: 'بستن راهنما',
        send: 'ارسال پیام',
        choices: ['جست‌وجوی قطعه', 'قیمت و موجودی', 'روش سفارش', 'ارتباط با پشتیبانی'],
        search: 'نام یا شماره فنی قطعه را در جست‌وجوی فروشگاه وارد کنید. قبل از خرید، سازگاری قطعه با خودرو را بررسی کنید.',
        stock: 'قیمت و موجودی در صفحه هر محصول، در صورت ثبت در فروشگاه، نمایش داده می‌شود. این راهنما هنوز به موجودی لحظه‌ای وصل نیست.',
        order: 'می‌توانید قطعات را در فروشگاه بررسی و از روش‌های سفارش موجود استفاده کنید. برای پیگیری سفارش مشخص، با تیم فروش تماس بگیرید.',
        support: 'راه‌های ارتباط با تیم فروش و پشتیبانی در صفحه تماس با ما قرار دارد.',
        fallback: 'من فعلاً راهنمای ساده سایت هستم و نمی‌توانم سازگاری فنی قطعات را با اطمینان تأیید کنم. می‌توانید در کاتالوگ جست‌وجو کنید یا از تیم فروش بپرسید.',
        searchLink: 'مشاهده قطعات',
        supportLink: 'تماس با ما',
        searchHint: 'جست‌وجو در کاتالوگ برای:',
      };
}

function replyFor(topic: Topic, locale: string): { text: string; link: ChatLink } {
  const en = locale === 'en';
  const t = assistantCopy(en);
  if (topic === 'search') return { text: t.search, link: { label: t.searchLink, href: '/' + locale + '/parts' } };
  if (topic === 'stock') return { text: t.stock, link: { label: t.searchLink, href: '/' + locale + '/parts' } };
  if (topic === 'order') return { text: t.order, link: { label: t.supportLink, href: '/' + locale + '/contact' } };
  return { text: t.support, link: { label: t.supportLink, href: '/' + locale + '/contact' } };
}

/** Zero-dependency, local-only FAQ adapter. Future AI/RAG replies can replace this without changing the widget. */
function respond(input: string, locale: string): { text: string; link: ChatLink } {
  const en = locale === 'en';
  const t = assistantCopy(en);
  const q = input.toLocaleLowerCase().trim();
  if (/قیمت|موجود|انبار|price|stock|available/.test(q)) return replyFor('stock', locale);
  if (/سفارش|خرید|ارسال|پیگیری|order|delivery|shipping|buy/.test(q)) return replyFor('order', locale);
  if (/تماس|پشتیبان|مشاور|شماره تماس|support|contact|help/.test(q)) return replyFor('support', locale);
  if (/قطعه|لوازم|فنی|سپر|چراغ|فیلتر|part|sku|oem|number|filter|brake|lamp/.test(q) || /[0-9]{4,}/.test(q)) {
    return {
      text: t.searchHint + ' «' + input.trim().slice(0, 120) + '»',
      link: { label: t.searchLink, href: '/' + locale + '/parts?q=' + encodeURIComponent(input.trim().slice(0, 120)) },
    };
  }
  return { text: t.fallback, link: { label: t.supportLink, href: '/' + locale + '/contact' } };
}

export function HedaxAssistantWidget({ locale }: { locale: string }) {
  const en = locale === 'en';
  const t = assistantCopy(en);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: 0, from: 'guide', text: t.greeting }]);
  const nextId = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [open, messages.length]);

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);

  const append = (question: string, response: { text: string; link: ChatLink }) => {
    setMessages((current) => [
      ...current,
      { id: nextId.current++, from: 'visitor', text: question },
      { id: nextId.current++, from: 'guide', text: response.text, link: response.link },
    ]);
  };

  const choose = (topic: Topic) => append(t.choices[topics.indexOf(topic)] ?? t.title, replyFor(topic, locale));
  const send = () => {
    const question = draft.trim().slice(0, 160);
    if (!question) return;
    append(question, respond(question, locale));
    setDraft('');
  };

  // Keep transactional and staff flows unobstructed on small screens.
  if (/\/(checkout|payment|staff)(\/|$)/.test(pathname)) return null;

  return (
    <aside className="fixed bottom-4 end-4 z-50 sm:bottom-6 sm:end-6" aria-label={t.title}>
      {open ? (
        <section
          role="dialog"
          aria-modal="false"
          aria-label={t.title}
          className="absolute bottom-[5rem] end-0 flex h-[min(34rem,calc(100dvh-7rem))] w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[1.5rem] border border-sky-200 bg-white shadow-[0_25px_80px_-18px_rgba(12,43,89,0.55)]"
        >
          <header className="flex shrink-0 items-center gap-3 bg-[#172a49] px-4 py-3 text-white">
            {/* The image can be replaced with an animated 3D avatar later without changing chat logic. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- local mascot illustration */}
            <img src="/hedax-ai-mascot.svg" alt="" width={40} height={48} className="h-12 w-10 object-contain" />
            <div className="min-w-0 flex-1">
              <h2 className="font-bold">{t.title}</h2>
              <p className="text-xs text-slate-200">{t.description}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label={t.close} className="grid size-11 place-items-center rounded-lg hover:bg-white/15 focus-visible:outline-white">
              <X aria-hidden="true" className="size-5" />
            </button>
          </header>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f4f7fb] p-4" aria-live="polite" aria-relevant="additions">
            {messages.map((message) => (
              <div key={message.id} className={'max-w-[92%] rounded-xl px-3 py-2.5 text-sm leading-7 ' + (message.from === 'guide' ? 'me-auto border border-slate-200 bg-white text-slate-800' : 'ms-auto bg-[#2467a9] text-white')}>
                <p className="whitespace-pre-wrap break-words">{message.text}</p>
                {message.link ? (
                  <a href={message.link.href} className="mt-2 inline-flex min-h-10 items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 font-semibold text-[#175a9d] hover:bg-sky-100">
                    <Search aria-hidden="true" className="size-4" />{message.link.label}
                  </a>
                ) : null}
              </div>
            ))}
            {messages.length === 1 ? (
              <div className="grid grid-cols-2 gap-2 pt-2">
                {topics.map((topic, index) => (
                  <button key={topic} type="button" onClick={() => choose(topic)} className="min-h-12 rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-[#175a9d] hover:border-sky-400 hover:bg-sky-50">
                    {t.choices[index]}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <form className="flex shrink-0 items-center gap-2 border-t border-slate-200 bg-white p-3" onSubmit={(event) => { event.preventDefault(); send(); }}>
            <label htmlFor="hedax-guide-input" className="sr-only">{t.placeholder}</label>
            <input ref={inputRef} id="hedax-guide-input" type="text" autoComplete="off" maxLength={160} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t.placeholder} className="h-12 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm text-slate-900 placeholder:text-slate-500 focus-visible:border-sky-600" />
            <button type="submit" disabled={!draft.trim()} aria-label={t.send} className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#2467a9] text-white hover:bg-[#1d5690] disabled:cursor-not-allowed disabled:opacity-50">
              <Send aria-hidden="true" className="size-5" />
            </button>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? t.close : t.open}
        aria-expanded={open}
        className={'group relative flex cursor-pointer flex-col items-center justify-end rounded-2xl focus-visible:outline-4 focus-visible:outline-sky-500 ' + (open ? 'min-h-14 min-w-14' : 'h-44 w-36 sm:h-48 sm:w-40')}
      >
        {open ? (
          <span className="grid size-14 place-items-center rounded-full border-2 border-sky-300 bg-[#172a49] text-white shadow-xl"><X aria-hidden="true" className="size-6" /></span>
        ) : (
          <>
            <span aria-hidden="true" className="pointer-events-none absolute bottom-6 left-1/2 h-14 w-28 -translate-x-1/2 rounded-full bg-sky-400/30 blur-xl" />
            <span className="hedax-pet-float relative block h-36 w-32 sm:h-40 sm:w-36">
              {/* eslint-disable-next-line @next/next/no-img-element -- local illustrated mascot */}
              <img src="/hedax-ai-mascot.svg" alt="" width={144} height={180} className="size-full object-contain drop-shadow-[0_10px_8px_rgba(16,48,94,0.28)]" />
            </span>
            <span className="relative -mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-sky-300 bg-[#172a49] px-3 text-xs font-bold text-white shadow-lg transition-colors group-hover:bg-[#2467a9]">
              <MessageCircle aria-hidden="true" className="size-4 text-sky-300" />
              {en ? 'Ask HEDAX' : 'کمک می‌خوای؟'}
            </span>
          </>
        )}
      </button>
    </aside>
  );
}
