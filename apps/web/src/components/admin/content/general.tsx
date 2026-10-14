'use client';

import { Async } from '@/components/ui/async';
import { Section } from '@/components/ui/misc';
import { useL } from '../shell';
import { ContentFrame, ContentHistory, ImageField, LocalizedField, SaveBar, useContentSection } from './kit';

/** Site name, tagline, logo, browser icon and the footer's texts. */
export function ContentGeneralPage() {
  const l = useL();
  const s = useContentSection('brand');
  const names = { siteName: l('نام کوتاه', 'Short name'), siteTitle: l('عنوان سایت', 'Site title'), tagline: l('شعار', 'Tagline'), footerAbout: l('معرفی کوتاه', 'Short introduction'), copyright: l('حق نشر', 'Copyright'), logoUrl: l('لوگو', 'Logo'), logoAlt: l('متن جایگزین لوگو', 'Logo alt text'), faviconUrl: l('آیکن مرورگر', 'Browser icon') };
  return (
    <ContentFrame title={l('تنظیمات عمومی', 'General')} description={l('نام، شعار و نشانه‌های سایت که در سربرگ، پایین صفحه و عنوان مرورگر دیده می‌شوند.', 'Name, tagline and marks shown in the header, footer and browser tab.')}>
      <Async state={s.state}>
        {() => s.draft ? (
          <>
            <Section title={l('نام و شعار', 'Name and tagline')}>
              <div className="flex flex-col gap-5">
                <LocalizedField id="b-name" path="siteName" label={names.siteName} required maxLength={60} value={s.draft.siteName} onChange={(v) => s.update({ siteName: v })} errors={s.errors} hint={l('بعد از عنوان هر صفحه می‌آید؛ مثل «قطعات | سورس».', 'Shown after each page title, e.g. "Parts | Source".')} />
                <LocalizedField id="b-title" path="siteTitle" label={names.siteTitle} required maxLength={120} value={s.draft.siteTitle} onChange={(v) => s.update({ siteTitle: v })} errors={s.errors} hint={l('عنوان صفحهٔ اصلی در مرورگر و نتایج جست‌وجو.', 'Home page title in the browser and search results.')} />
                <LocalizedField id="b-tagline" path="tagline" label={names.tagline} maxLength={160} value={s.draft.tagline} onChange={(v) => s.update({ tagline: v })} errors={s.errors} />
              </div>
            </Section>
            <Section title={l('لوگو و آیکن', 'Logo and icon')}>
              <div className="flex flex-col gap-5">
                <ImageField id="b-logo" purpose="logo" dark label={names.logoUrl} value={s.draft.logoUrl} onChange={(v) => s.update({ logoUrl: v })} error={s.errors.logoUrl} previewClassName="max-h-12" hint={l('روی زمینهٔ تیرهٔ سربرگ و پایین صفحه؛ PNG شفاف بهتر است. اگر خالی بماند، لوگوی پیش‌فرض سورس نمایش داده می‌شود.', 'Shown on the dark header and footer; a transparent PNG works best. Empty = the built-in Source logo.')} />
                <LocalizedField id="b-alt" path="logoAlt" label={names.logoAlt} maxLength={120} value={s.draft.logoAlt} onChange={(v) => s.update({ logoAlt: v })} errors={s.errors} hint={l('برای صفحه‌خوان نابینایان.', 'Read out by screen readers.')} />
                <ImageField id="b-favicon" purpose="favicon" label={names.faviconUrl} value={s.draft.faviconUrl} onChange={(v) => s.update({ faviconUrl: v })} error={s.errors.faviconUrl} previewClassName="max-h-12" hint={l('تصویر مربع، مثلاً ۵۱۲×۵۱۲. خالی = آیکن پیش‌فرض.', 'A square image, e.g. 512×512. Empty = the built-in icon.')} />
              </div>
            </Section>
            <Section title={l('پایین صفحه', 'Footer')}>
              <div className="flex flex-col gap-5">
                <LocalizedField id="b-about" path="footerAbout" label={names.footerAbout} multiline maxLength={400} value={s.draft.footerAbout} onChange={(v) => s.update({ footerAbout: v })} errors={s.errors} />
                <LocalizedField id="b-copy" path="copyright" label={names.copyright} maxLength={120} value={s.draft.copyright} onChange={(v) => s.update({ copyright: v })} errors={s.errors} hint={l('{year} به سال جاری تبدیل می‌شود؛ مثل «© {year} هداکس».', '{year} becomes the current year, e.g. "© {year} HEDAX".')} />
              </div>
            </Section>
            <SaveBar busy={s.busy} onSave={() => void s.save()} status={s.status} />
            <ContentHistory entityType="content" entityId="brand" refreshKey={s.saved} fieldNames={names} />
          </>
        ) : null}
      </Async>
    </ContentFrame>
  );
}
