import '@/components/store/titanium.css';
import '@/components/store/atelier.css';
import '@/components/store/atelier-refinements.css';
import '@/components/store/source-ui.css';
import { localize } from '@hedax/contracts/constants';
import type { ReactNode } from 'react';
import { AnnouncementBarView } from '@/components/layout/announcement-bar-view';
import { SiteFooter } from '@/components/layout/site-footer';
import { NavTrailTracker } from '@/components/layout/back-control';
import { PwaRegister } from '@/components/layout/pwa';
import { getPublishedBuilder } from '@/lib/builder-server';
import { MoneyUnitProvider } from '@/lib/money-unit';
import { displayUnit } from '@/lib/preferences';
import { titaniumConfig, titaniumCanvasStyle } from '@/components/store/titanium-config';
import { getSiteContent } from '@/lib/site-content';

/** Storefront frame shared by the home page and the other pages: notice bar, header, main, footer, assistant. */
export async function StoreShell({ header, locale, children }: { header: ReactNode; locale: string; children: ReactNode }) {
  // Notice bar from site content → notice bar (on/off in the panel).
  const [content, doc, unit] = await Promise.all([getSiteContent(), getPublishedBuilder('home'), displayUnit()]);
  const notice = content?.announcement;
  const noticeText = notice?.enabled ? localize(notice.text, locale) : '';
  return (
    <MoneyUnitProvider unit={unit}>
      {/* `.store` scopes the storefront's geometry; `.su` the 2026-11 visual rules (source-ui.css). */}
      <div className="store titanium-store su" style={titaniumCanvasStyle(titaniumConfig(doc))}>
        {notice && noticeText ? <AnnouncementBarView text={noticeText} linkLabel={localize(notice.linkLabel, locale)} href={notice.href} tone={notice.tone} /> : null}
        {header}
        <main id="main" tabIndex={-1} className="pb-16 focus:outline-none">
          {children}
        </main>
        <SiteFooter />
        <NavTrailTracker />
        <PwaRegister />
      </div>
    </MoneyUnitProvider>
  );
}
