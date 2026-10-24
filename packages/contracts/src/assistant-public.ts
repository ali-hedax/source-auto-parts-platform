import type { AssistantSettings } from './assistant.js';

export const ASSISTANT_TOPICS = ['search', 'stock', 'order', 'support'] as const;
export type AssistantTopic = typeof ASSISTANT_TOPICS[number];

export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = {
  enabled: false,
  name: { fa: 'راهنمای HEDAX', en: 'HEDAX Guide' },
  introduction: { fa: 'راهنمای سایت برای جست‌وجو و خرید قطعه.', en: 'Your guide to finding parts and navigating the store.' },
  greeting: { fa: 'سلام! از کجا شروع کنیم؟', en: 'Hello! Where would you like to start?' },
  animationEnabled: true, mobileSize: 64, desktopSize: 104, placement: 'end', avatarUrl: '',
  topics: {
    search: { label: { fa: 'پیدا کردن قطعه', en: 'Find a part' }, answer: { fa: 'نام یا شماره فنی را در کاتالوگ جست‌وجو کنید. سازگاری را پیش از خرید با تیم فروش تأیید کنید.', en: 'Search the catalog by name or part number. Confirm vehicle compatibility with the team before buying.' } },
    stock: { label: { fa: 'قیمت و موجودی', en: 'Price & availability' }, answer: { fa: 'قیمت و موجودی ثبت‌شده را در صفحهٔ قطعه ببینید. این راهنما موجودی یا قیمت تازه‌ای محاسبه نمی‌کند.', en: 'See recorded price and availability on the part page. This guide does not calculate prices or check live stock.' } },
    order: { label: { fa: 'سفارش یا درخواست تأمین', en: 'Order or request a part' }, answer: { fa: 'از صفحهٔ قطعه و سبد خرید سفارش دهید؛ برای قطعات دیگر فرم درخواست تأمین را تکمیل کنید. این گفتگو چیزی ثبت نمی‌کند.', en: 'Order from a part page and your cart, or complete the sourcing request form. This conversation does not submit anything.' } },
    support: { label: { fa: 'ارتباط با پشتیبانی', en: 'Contact support' }, answer: { fa: 'راه‌های ارتباط واقعی در صفحهٔ تماس هستند. این راهنما وضعیت آنلاین کارشناس را نشان نمی‌دهد.', en: 'Find the configured contact methods on the contact page. This guide does not show an agent’s online status.' } },
  },
  ai: { systemPrompt: { fa: 'کوتاه، دقیق و فقط بر پایه اطلاعات ثبت‌شده پاسخ بده.', en: 'Answer concisely and only from registered facts.' }, maxOutputTokens: 400, dailyRequestLimit: 100 },
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
