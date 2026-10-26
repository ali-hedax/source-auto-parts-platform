import type { CSSProperties } from 'react';
import type { BuilderBlock, BuilderDocument } from '@hedax/contracts';
import { newBuilderBlock } from '@hedax/contracts/constants';

export const TITANIUM_CONFIG_ID = 'titanium-home-settings';
export const titaniumConfig = (doc: BuilderDocument | null) => doc?.sections.find(b => b.id === TITANIUM_CONFIG_ID);
export function newTitaniumConfig(): BuilderBlock {
  const block = newBuilderBlock('custom', TITANIUM_CONFIG_ID);
  const titles = [
    ['لوازم مصرفی', 'Service & consumables'], ['جلوبندی و تعلیق', 'Steering & suspension'], ['موتور و انتقال قدرت', 'Engine & drivetrain'],
    ['روشنایی و برق خودرو', 'Lighting & electrical'], ['بدنه و قطعات بیرونی', 'Body & exterior'], ['آپشن و تجهیزات جانبی', 'Upgrades & accessories'],
    ['قیمت روز خودرو', 'Daily car prices'], ['مجله و راهنمای فنی', 'Journal & technical guides'], ['ویدیوهای پربازدید خودرو', 'Popular automotive videos'], ['قطعه‌تان را پیدا نکردید؟', 'Can’t find your part?'],
  ];
  const descriptions = [
    ['نگاهی به قیمت خودرو، با تفکیک مدل، تیپ و سال ساخت.', 'A view of car prices, by model, trim and year.'],
    ['شماره فنی؛ نقطه شروع انتخاب قطعه مناسب', 'Part numbers: a starting point for the right fit'],
    ['آموزش، بررسی و تجربه‌های دنیای خودرو', 'How-to guides, reviews and automotive experiences'],
    ['پیدا کردنش را به سورس بسپارید.', 'Let Source help you find it.'],
  ];
  return { ...block, title: { fa: 'دنیای قطعات خودرو', en: 'The world of auto parts' }, body: { fa: 'هوشمندتر از همیشه', en: 'Smarter than ever' }, button: { fa: '', en: 'Smarter Parts. Better Driving.' },
    items: titles.map(([fa, en], i) => ({ title: { fa: fa!, en: en! }, text: { fa: descriptions[i - 6]?.[0] ?? '', en: descriptions[i - 6]?.[1] ?? '' }, imageUrl: '', mobileImageUrl: '', alt: { fa: fa!, en: en! }, href: i === 9 ? '/request-part' : '', button: { fa: '', en: '' }, visible: true })),
  };
}
export function titaniumCanvasStyle(config: BuilderBlock | undefined): CSSProperties {
  if (!config) return {};
  return { ...(config.style.background ? { '--ti-top': config.style.background } : {}), ...(config.style.foreground ? { '--ti-bottom': config.style.foreground } : {}), ...(config.style.borderColor ? { '--ti-blue': config.style.borderColor } : {}) } as CSSProperties;
}
