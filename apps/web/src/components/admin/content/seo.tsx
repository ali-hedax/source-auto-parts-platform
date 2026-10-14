'use client';

import { SEO_PAGES, type SeoPage } from '@hedax/contracts/constants';
import { Async } from '@/components/ui/async';
import { Section } from '@/components/ui/misc';
import { useL } from '../shell';
import { ContentFrame, ContentHistory, ImageField, LocalizedField, SaveBar, useContentSection } from './kit';

/** Title and description for search engines, and the picture shown when a page is shared. */
export function ContentSeoPage() {
  const l = useL();
  const s = useContentSection('seo');
  const pageName: Record<SeoPage, string> = {
    home: l('صفحهٔ اصلی', 'Home page'), parts: l('قطعات موجود', 'Parts'), brands: l('برندها', 'Brands'), imported: l('قطعات وارداتی', 'Imported parts'),
    requestPart: l('درخواست تأمین قطعه', 'Request a part'), contact: l('تماس با ما', 'Contact'),
  };
  return (
    <ContentFrame title={l('سئو', 'SEO')} description={l('عنوان و توضیحی که گوگل و شبکه‌های اجتماعی از هر صفحه نشان می‌دهند. اگر خالی بماند، عنوان خود صفحه و توضیح پیش‌فرض استفاده می‌شود. صفحه‌های متنی سئوی خودشان را در ویرایشگر صفحه دارند.', 'The title and description search engines and social networks show. Empty = the page’s own title and the default description. Text pages have their own SEO fields in the page editor.')}>
      <Async state={s.state}>
        {() => {
          const d = s.draft;
          if (!d) return null;
          return (
            <>
              <Section title={l('پیش‌فرض همهٔ صفحه‌ها', 'Default for all pages')}>
                <div className="flex flex-col gap-5">
                  <LocalizedField id="seo-desc" path="defaultDescription" label={l('توضیح متا', 'Meta description')} multiline rows={2} maxLength={170} value={d.defaultDescription} onChange={(v) => s.update({ defaultDescription: v })} errors={s.errors} hint={l('حدود ۱۵۰ نویسه؛ در نتایج جست‌وجو زیر عنوان می‌آید.', 'About 150 characters; shown under the title in search results.')} />
                  <ImageField id="seo-img" label={l('تصویر اشتراک‌گذاری', 'Share image')} value={d.defaultImageUrl} onChange={(v) => s.update({ defaultImageUrl: v })} error={s.errors.defaultImageUrl} hint={l('اندازهٔ پیشنهادی ۱۲۰۰×۶۳۰؛ هنگام ارسال لینک در تلگرام، واتس‌اپ و لینکدین دیده می‌شود.', 'Suggested 1200×630; shown when a link is shared on Telegram, WhatsApp or LinkedIn.')} />
                </div>
              </Section>
              {SEO_PAGES.map((p) => (
                <Section key={p} title={pageName[p]}>
                  <div className="flex flex-col gap-5">
                    <LocalizedField id={`seo-${p}-t`} path={`pages.${p}.title`} label={l('عنوان', 'Title')} maxLength={70} value={d.pages[p].title} onChange={(v) => s.update({ pages: { ...d.pages, [p]: { ...d.pages[p], title: v } } })} errors={s.errors} hint={l('حداکثر ۷۰ نویسه.', 'Up to 70 characters.')} />
                    <LocalizedField id={`seo-${p}-d`} path={`pages.${p}.description`} label={l('توضیح', 'Description')} multiline rows={2} maxLength={170} value={d.pages[p].description} onChange={(v) => s.update({ pages: { ...d.pages, [p]: { ...d.pages[p], description: v } } })} errors={s.errors} />
                    <ImageField id={`seo-${p}-i`} label={l('تصویر اشتراک‌گذاری این صفحه (اختیاری)', 'Share image for this page (optional)')} value={d.pages[p].imageUrl} onChange={(v) => s.update({ pages: { ...d.pages, [p]: { ...d.pages[p], imageUrl: v } } })} error={s.errors[`pages.${p}.imageUrl`]} />
                  </div>
                </Section>
              ))}
              <SaveBar busy={s.busy} onSave={() => void s.save()} status={s.status} />
              <ContentHistory entityType="content" entityId="seo" refreshKey={s.saved} />
            </>
          );
        }}
      </Async>
    </ContentFrame>
  );
}
