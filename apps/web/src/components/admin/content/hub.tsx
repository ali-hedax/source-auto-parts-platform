'use client';

import { Contact, FileText, HelpCircle, House, Megaphone, Palette, Search, Share2, LayoutTemplate, Film, Eye } from 'lucide-react';
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
    { href: '/admin/content/pages', icon: FileText, title: l('صفحه‌های متنی', 'Text pages'), text: l('دربارهٔ ما، راهنماها و هر صفحهٔ تازه', 'About us, help pages and new pages') },
    { href: '/admin/content/faq', icon: HelpCircle, title: l('پرسش‌های متداول', 'FAQ'), text: l('افزودن، ویرایش، حذف و ترتیب پرسش‌ها', 'Add, edit, delete and order questions') },
    { href: '/admin/content/announcement', icon: Megaphone, title: l('نوار اطلاع‌رسانی', 'Notice bar'), text: l('پیام کوتاه بالای همهٔ صفحه‌ها؛ روشن/خاموش', 'Short message above every page; on/off') },
    { href: '/admin/content/seo', icon: Search, title: l('سئو', 'SEO'), text: l('عنوان و توضیح هر صفحه برای گوگل و تصویر اشتراک‌گذاری', 'Title and description for search engines, share image') },
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={l('مدیریت سایت', 'Website management')}
        description={l('محتوا و ظاهر سایت، یک‌جا و بر اساس طراحی تیتانیوم. ابتدا بخش موردنظر را انتخاب کنید؛ تغییر چیدمان پیش‌نویس دارد، اطلاعات تماس و متن‌های عمومی پس از ذخیره اعمال می‌شوند.', 'Content and appearance together, organised around the titanium design. Layout changes use drafts; contact details and general copy take effect when saved.')}
      />
      <section className="rounded-2xl border border-blue-200 bg-gradient-to-l from-slate-100 to-blue-50 p-5 sm:p-7">
        <div className="flex items-center gap-3"><LayoutTemplate aria-hidden className="size-7 text-blue-700" /><div><h2 className="text-xl font-bold">{l('طراحی و صفحهٔ اصلی', 'Design & home page')}</h2><p className="mt-1 text-sm text-steel">{l('شعار ← انتخاب خودرو ← مسیرهای خرید ← محصولات و برندها ← مجله و بازار ← پرسش‌ها ← فیلم و فوتر', 'Slogan → finder → shopping paths → products & brands → journal → FAQ → film & footer')}</p></div></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            { href: '/admin/appearance', icon: House, title: l('ویرایش طراحی و باکس‌ها', 'Edit design & cards'), text: l('شعارها، رنگ‌ها، ارتفاع فیلم، شش مسیر خرید و سه باکس مجله', 'Slogans, colours, film height, six shopping paths and journal cards') },
            { href: '/admin/appearance?tab=0', icon: Film, title: l('فیلم‌ها و بخش‌های فروشگاه', 'Films & store sections'), text: l('فایل فیلم، پوستر، محصولات واقعی و بخش‌های منتشرشده', 'Movie files, posters, real products and published sections') },
            { href: '/admin/appearance/home/preview', icon: Eye, title: l('پیش‌نمایش پیش‌نویس', 'Preview draft'), text: l('کنترل نسخهٔ موبایل و دسکتاپ پیش از انتشار', 'Review mobile and desktop before publishing') },
          ].map(({ href, icon: Icon, title, text }) => <Link key={href} href={href} className="flex min-h-28 gap-3 rounded-xl border border-blue-100 bg-white/80 p-4 hover:border-blue-500"><Icon aria-hidden className="mt-1 size-5 shrink-0 text-blue-700" /><span><strong className="block">{title}</strong><span className="mt-2 block text-sm leading-6 text-steel">{text}</span></span></Link>)}
        </div>
      </section>
      <h2 className="text-lg font-bold">{l('هویت، ارتباط و محتوای عمومی', 'Identity, contact & general content')}</h2>
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
