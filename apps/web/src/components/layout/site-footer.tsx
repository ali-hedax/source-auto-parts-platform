import { getSiteContent } from '@/lib/site-content';
import { getPublishedBuilder } from '@/lib/builder-server';
import { SiteFooterView } from './site-footer-view';
export async function SiteFooter() {
  const [content, document] = await Promise.all([getSiteContent(), getPublishedBuilder('home')]);
  return <SiteFooterView content={content} chrome={document?.chrome} now={new Date().getTime()} />;
}
