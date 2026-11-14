import { getSiteContent } from '@/lib/site-content';
import { getPublishedBuilder } from '@/lib/builder-server';
import { displayUnit } from '@/lib/preferences';
import { SiteHeaderView } from './site-header-view';

export async function SiteHeader() {
  const [content, document] = await Promise.all([getSiteContent(), getPublishedBuilder('home')]);
  return <SiteHeaderView content={content} chrome={document?.chrome} currency={await displayUnit()} />;
}
