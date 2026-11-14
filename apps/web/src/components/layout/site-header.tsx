import { getSiteContent } from '@/lib/site-content';
import { getPublishedBuilder } from '@/lib/builder-server';
import { SiteHeaderView } from './site-header-view';
import { displayCurrency } from '@/lib/preferences';
export async function SiteHeader() {
  const [content, document] = await Promise.all([getSiteContent(), getPublishedBuilder('home')]);
  return <SiteHeaderView content={content} chrome={document?.chrome} currency={await displayCurrency()} />;
}
