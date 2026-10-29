import type { CSSProperties } from 'react';
import type { BuilderBlock, BuilderDocument } from '@hedax/contracts';
import { newBuilderBlock } from '@hedax/contracts/constants';

export const ATELIER_ASSETS = '/brand/source/atelier';
export const ATELIER_BRANDS = ['iran-khodro', 'saipa', 'toyota', 'hyundai'] as const;
export const TITANIUM_CONFIG_ID = 'titanium-home-settings';
export const titaniumConfig = (doc: BuilderDocument | null) => doc?.sections.find(b => b.id === TITANIUM_CONFIG_ID);
export function newTitaniumConfig(): BuilderBlock {
  const block = newBuilderBlock('custom', TITANIUM_CONFIG_ID);
  const titles = [
    ['لوازم مصرفی', 'Service & consumables'], ['جلوبندی و تعلیق', 'Steering & suspension'], ['موتور و انتقال قدرت', 'Engine & drivetrain'],
    ['روشنایی و برق خودرو', 'Lighting & electrical'], ['بدنه و قطعات بیرونی', 'Body & exterior'], ['آپشن و تجهیزات جانبی', 'Upgrades & accessories'],
    ['قیمت روز خودرو', 'Daily car prices'], ['مجله و راهنمای فنی', 'Journal & technical guides'], ['ویدیوهای پربازدید خودرو', 'Popular automotive videos'], ['قطعه‌تان را پیدا نکردید؟', 'Can’t find your part?'],
    ['ایران خودرو', 'Iran Khodro'], ['سایپا', 'Saipa'], ['تویوتا', 'Toyota'], ['هیوندای', 'Hyundai'],
    ['سایر برندها', 'Other brands'], ['از خودروی شما شروع کنیم.', 'Let’s start with your vehicle.'], ['هر قطعه، در جای درست.', 'Every part, in its place.'], ['تازه‌های سورس', 'New to Source'], ['برندهای دارای موجودی', 'Brands in stock'], ['فراتر از یک قطعه', 'Beyond the part'],
  ];
  const descriptions = [
    ['نگاهی به قیمت خودرو، با تفکیک مدل، تیپ و سال ساخت.', 'A view of car prices, by model, trim and year.'],
    ['شماره فنی؛ نقطه شروع انتخاب قطعه مناسب', 'Part numbers: a starting point for the right fit'],
    ['آموزش، بررسی و تجربه‌های دنیای خودرو', 'How-to guides, reviews and automotive experiences'],
    ['پیدا کردنش را به سورس بسپارید.', 'Let Source help you find it.'],
  ];
  return { ...block, imageUrl: `${ATELIER_ASSETS}/hero.webp`, alt: { fa: 'خودرو و قطعات در فضای سنگی روشن', en: 'A car and precision parts in a sunlit stone gallery' }, title: { fa: 'دنیای قطعات خودرو', en: 'The world of auto parts' }, body: { fa: 'هوشمندتر از همیشه', en: 'Smarter than ever' }, button: { fa: '', en: 'Smarter Parts. Better Driving.' },
    items: titles.map(([fa, en], i) => ({ title: { fa: fa!, en: en! }, text: { fa: i === 14 ? 'برای هر برند دیگر، درخواست تأمین قطعه ثبت کنید.' : descriptions[i - 6]?.[0] ?? '', en: i === 14 ? 'Request a part for any other marque.' : descriptions[i - 6]?.[1] ?? '' }, imageUrl: i < 6 ? `${ATELIER_ASSETS}/category-${i}.webp` : i < 9 ? `${ATELIER_ASSETS}/hub-${i - 6}.webp` : i > 9 && i < 14 ? `${ATELIER_ASSETS}/brand-${ATELIER_BRANDS[i - 10]}.webp` : i === 14 ? `${ATELIER_ASSETS}/brand-source.webp` : '', mobileImageUrl: '', alt: { fa: fa!, en: en! }, href: i === 9 || i === 14 ? '/request-part' : '', button: { fa: '', en: '' }, visible: true })),
  };
}
export function titaniumCanvasStyle(config: BuilderBlock | undefined): CSSProperties {
  if (!config) return {};
  return { ...(config.style.background ? { '--ti-top': config.style.background } : {}), ...(config.style.foreground ? { '--ti-bottom': config.style.foreground } : {}), ...(config.style.borderColor ? { '--ti-blue': config.style.borderColor, '--ti-edge': config.style.borderColor } : {}) } as CSSProperties;
}

/** Built-in reviewed film only when the CMS has no closing-film block at all. */
export function defaultAtelierClosing(): BuilderBlock {
  const b = newBuilderBlock('cinematic-hero', 'atelier-closing-default');
  return { ...b, imageUrl: `${ATELIER_ASSETS}/closing.webp`, alt: { fa: 'عبور خودرو و شکل‌گیری نشان سورس', en: 'A passing car and the Source emblem' }, style: { template: 'compact' }, film: { clips: [{ id: 'atelier-closing', active: true, desktop: `${ATELIER_ASSETS}/closing.mp4`, desktopWebm: '', mobile: '', poster: `${ATELIER_ASSETS}/closing.webp`, mobilePoster: '' }], playback: 'loop', logoAt: null, logoUrl: '', logoWidth: 28, discovery: false } };
}
