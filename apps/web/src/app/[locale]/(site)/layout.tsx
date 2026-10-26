import '@/components/store/titanium.css';
import { localize } from '@hedax/contracts/constants';
import type { ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { AnnouncementBarView } from '@/components/layout/announcement-bar-view';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { AssistantEntry } from '@/components/chat/assistant-entry';
import { getSiteContent } from '@/lib/site-content';

export default async function SiteLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Notice bar from site content → notice bar (on/off in the panel).
  const notice = (await getSiteContent())?.announcement;
  const noticeText = notice?.enabled ? localize(notice.text, locale) : '';
  return (
    // One continuous titanium canvas contains header, storefront and footer; admin is outside it.
    <div className="store titanium-store">
      {notice && noticeText ? <AnnouncementBarView text={noticeText} linkLabel={localize(notice.linkLabel, locale)} href={notice.href} tone={notice.tone} /> : null}
      <SiteHeader />
      <main id="main" tabIndex={-1} className="pb-16 focus:outline-none">
        {children}
      </main>
      <SiteFooter />
      <AssistantEntry />
    </div>
  );
}
