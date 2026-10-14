'use client';

import { Contact, FileText, HelpCircle, House, Megaphone, Palette, Search, Share2 } from 'lucide-react';
import type { ComponentType } from 'react';
import { PageHeader } from '@/components/ui/misc';
import { Link } from '@/i18n/navigation';
import { useL } from '../shell';

/** Entry point of «محتوای سایت»: one card per part of the site that can be edited. */
export function ContentHubPage() {
  const l = useL();
  const cards: Array<{ href: string; icon: ComponentType<{ className?: string }>; title: string; text: string }> = [
    { href: '/admin/content/general', icon: Palette, title: l('تنظیمات عمومی', 'General'), text: l('نام سایت، شعار، لوگو، آیکن مرورگر و متن پایین صفحه', 'Site name, tagline, logo, browser icon, footer text') },
    { href: '/admin/content/contact', icon: Contact, title: l('اطلاعات تماس', 'Contact details'), text: l('تلفن‌ها، واتس‌اپ، ایمیل، نشانی، نقشه و ساعت کاری', 'Phones, WhatsApp, e-mail, address, map, hours') },
    { href: '/admin/content/social', icon: Share2, title: l('شبکه‌های اجتماعی', 'Social networks'), text: l('اینستاگرام، لینکدین، تلگرام، ایکس و موارد دیگر', 'Instagram, LinkedIn, Telegram, X and more') },
    { href: '/admin/content/home', icon: House, title: l('صفحهٔ اصلی', 'Home page'), text: l('متن‌ها، دکمه‌ها و تصاویر هر بخش؛ ترتیب و نمایش/مخفی', 'Texts, buttons and images of each section; order and visibility') },
    { href: '/admin/content/pages', icon: FileText, title: l('صفحه‌های متنی', 'Text pages'), text: l('دربارهٔ ما، راهنماها و هر صفحهٔ تازه', 'About us, help pages and new pages') },
    { href: '/admin/content/faq', icon: HelpCircle, title: l('پرسش‌های متداول', 'FAQ'), text: l('افزودن، ویرایش، حذف و ترتیب پرسش‌ها', 'Add, edit, delete and order questions') },
    { href: '/admin/content/announcement', icon: Megaphone, title: l('نوار اطلاع‌رسانی', 'Notice bar'), text: l('پیام کوتاه بالای همهٔ صفحه‌ها؛ روشن/خاموش', 'Short message above every page; on/off') },
    { href: '/admin/content/seo', icon: Search, title: l('سئو', 'SEO'), text: l('عنوان و توضیح هر صفحه برای گوگل و تصویر اشتراک‌گذاری', 'Title and description for search engines, share image') },
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={l('محتوای سایت', 'Site content')}
        description={l('هر چه بازدیدکننده می‌خواند از اینجا تغییر می‌کند. پس از ذخیره، تغییر فوراً روی سایت دیده می‌شود و در تاریخچه ثبت می‌شود. کالاها و قیمت‌ها در بخش «کالاها» و قوانین در «سیاست‌ها» هستند.', 'Everything visitors read is edited here. Saved changes appear on the site at once and are recorded in the history. Products and prices are under Products; legal texts under Policies.')}
      />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ href, icon: Icon, title, text }) => (
          <li key={href}>
            <Link href={href} className="flex h-full min-h-24 gap-3 rounded-[var(--radius-card)] border border-line-soft bg-white p-4 transition-colors hover:border-line-strong hover:bg-surface">
              <Icon className="mt-0.5 size-5 shrink-0 text-action" />
              <span>
                <span className="block font-bold leading-7">{title}</span>
                <span className="block text-sm leading-6 text-steel">{text}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
