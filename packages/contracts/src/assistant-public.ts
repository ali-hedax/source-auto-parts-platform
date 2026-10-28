import type { AssistantSettings } from './assistant.js';

export const ASSISTANT_TOPICS = ['search', 'stock', 'order', 'support'] as const;
export type AssistantTopic = typeof ASSISTANT_TOPICS[number];

export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = {
  enabled: false,
  name: { fa: 'هکسی', en: 'Hexi' },
  introduction: { fa: 'قطعه پیدا می‌کنم، قیمت و موجودی سایت را می‌گویم و به سؤال‌های مکانیکی‌تان جواب می‌دهم.', en: 'I find parts, tell you what the site lists for price and stock, and answer your mechanical questions.' },
  greeting: { fa: 'سلام! من هکسی‌ام، روبات راهنمای سورس. دنبال چه قطعه‌ای هستید؟', en: 'Hi! I am Hexi, Source’s robot guide. Which part are you looking for?' },
  animationEnabled: true, mobileSize: 64, desktopSize: 104, placement: 'start', avatarUrl: '',
  topics: {
    search: { label: { fa: 'پیدا کردن قطعه', en: 'Find a part' }, answer: { fa: 'نام یا شماره فنی را در کاتالوگ جست‌وجو کنید. سازگاری را پیش از خرید با تیم فروش تأیید کنید.', en: 'Search the catalog by name or part number. Confirm vehicle compatibility with the team before buying.' } },
    stock: { label: { fa: 'قیمت و موجودی', en: 'Price & availability' }, answer: { fa: 'قیمت و موجودی ثبت‌شده را در صفحهٔ قطعه ببینید. این راهنما موجودی یا قیمت تازه‌ای محاسبه نمی‌کند.', en: 'See recorded price and availability on the part page. This guide does not calculate prices or check live stock.' } },
    order: { label: { fa: 'سفارش یا درخواست تأمین', en: 'Order or request a part' }, answer: { fa: 'از صفحهٔ قطعه و سبد خرید سفارش دهید؛ برای قطعات دیگر فرم درخواست تأمین را تکمیل کنید. این گفتگو چیزی ثبت نمی‌کند.', en: 'Order from a part page and your cart, or complete the sourcing request form. This conversation does not submit anything.' } },
    support: { label: { fa: 'ارتباط با اپراتور', en: 'Talk to an operator' }, answer: { fa: 'پیامتان را بگذارید؛ اپراتور سورس در اولین فرصت همین‌جا جواب می‌دهد. برای مشاوره، انتخاب قطعه یا پیگیری سفارش هم می‌توانید پیام بدهید.', en: 'Leave a message and a Source operator will reply right here as soon as possible, for advice, choosing a part or following up an order.' } },
  },
  // Kept short here because this module ships with public pages; the server and the admin form
  // use Hexi's full prompt (DEFAULT_ASSISTANT_AI in ./assistant-prompt) as the real default.
  ai: { systemPrompt: { fa: 'کوتاه، دقیق و فقط بر پایه اطلاعات ثبت‌شده پاسخ بده.', en: 'Answer concisely and only from registered facts.' }, maxOutputTokens: 600, dailyRequestLimit: 100 },
};

/** Only vetted site routes can be emitted by the deterministic adapter. */
export type AssistantReply = { text: string; links: Array<{ label: string; href: string }> };
export function assistantReply(settings: Pick<AssistantSettings, 'topics'>, locale: 'fa' | 'en', topic: AssistantTopic, query = ''): AssistantReply {
  const copy = settings.topics[topic];
  const href = topic === 'support' ? '/contact' : topic === 'order' ? '/request-part' : '/parts';
  return { text: copy.answer[locale], links: [{ label: copy.label[locale], href: `${href}${topic === 'search' && query.trim() ? `?q=${encodeURIComponent(query.trim().slice(0, 120))}` : ''}` }] };
}
export function assistantRespond(settings: AssistantSettings, locale: 'fa' | 'en', input: string): AssistantReply {
  const topic = /قیمت|موجود|price|stock|available/i.test(input) ? 'stock' : /سفارش|تأمین|خرید|order|sourc|buy/i.test(input) ? 'order' : /تماس|پشتیبان|support|contact/i.test(input) ? 'support' : 'search';
  return assistantReply(settings, locale, topic, input);
}

/** Conservative allowlist keeps transactional, account, staff and product purchase controls clear. */
export function assistantRouteAllowed(path: string): boolean {
  return /^\/(?:fa|en)(?:\/)?$/.test(path) || /^\/(?:fa|en)\/(?:parts|imported-parts|contact|request-part)\/?$/.test(path);
}
