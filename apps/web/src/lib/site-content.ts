import type { PublicContentPage, SiteContentView } from '@hedax/contracts';
import { localize, type SeoPage } from '@hedax/contracts/constants';
import type { Metadata } from 'next';
import { cache } from 'react';
import { serverApi, serverApiOptional } from './api/server';

/** Built-in logo, used when none was uploaded in the panel. */
export const DEFAULT_LOGO = '/brand/source/logo-dark.png';

/**
 * Everything editable under «محتوای سایت» (texts, contact, social links, home sections, notice bar,
 * SEO), in one request per render. Cached for 5 minutes and purged as soon as the panel saves.
 */
export const getSiteContent = cache(async (): Promise<SiteContentView | null> =>
  serverApi<SiteContentView>('/site/content', { publicCache: 300 }).catch(() => null),
);

/** A published text page, or null. */
export const getContentPage = cache(async (slug: string): Promise<PublicContentPage | null> =>
  serverApiOptional<PublicContentPage>(`/site/pages/${slug}`, { publicCache: 300 }).catch(() => null),
);

/** Persian digits for Persian text (numbers typed in the panel are usually Latin). */
export function faDigits(text: string): string {
  return text.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);
}

/**
 * Title, description and share image of a page from site content → SEO; anything left empty there
 * falls back to the page's own title and the site's default description and image.
 */
export function seoMetadata(content: SiteContentView | null, page: SeoPage, locale: string, fallbackTitle?: string): Metadata {
  const entry = content?.seo.pages[page];
  const title = localize(entry?.title, locale) || fallbackTitle;
  const description = localize(entry?.description, locale) || localize(content?.seo.defaultDescription, locale);
  const image = entry?.imageUrl || content?.seo.defaultImageUrl;
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(image || title || description ? { openGraph: { ...(title ? { title } : {}), ...(description ? { description } : {}), ...(image ? { images: [image] } : {}) } } : {}),
  };
}
