import type { BuilderBlock } from '@hedax/contracts';
export const blockLabels: Record<BuilderBlock['kind'], string> = {
  legacy: 'بخش فعلی سایت', hero: 'بنر اصلی', slider: 'اسلایدر تبلیغاتی', categories: 'دسته‌بندی قطعات', search: 'جستجوی قطعات',
  'vehicle-brands': 'جستجو بر اساس برند خودرو', 'vehicle-models': 'جستجو بر اساس مدل خودرو', brands: 'برندهای خودرو',
  'new-products': 'محصولات جدید', bestsellers: 'محصولات پرفروش', discounts: 'محصولات تخفیف‌دار', offers: 'پیشنهادهای ویژه',
  'selected-products': 'محصولات منتخب', 'vehicle-products': 'محصولات مرتبط با خودرو', 'image-categories': 'دسته‌بندی تصویری',
  services: 'خدمات فروشگاه', benefits: 'مزایای خرید', notice: 'اطلاعیه', banners: 'بنرهای چندستونه', 'text-image': 'متن و تصویر', custom: 'بخش سفارشی', makers: 'برندهای سازنده قطعه', 'cinematic-hero': 'افتتاحیهٔ سینمایی (فیلم)',
};
