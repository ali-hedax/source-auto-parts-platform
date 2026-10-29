import { getSiteContent } from '@/lib/site-content';
import { getPublishedBuilder } from '@/lib/builder-server';
import { displayCurrency } from '@/lib/preferences';
import { HomeHeaderView } from './home-header-view';
import { SiteHeaderView } from './site-header-view';

/** Home page header: the minimal centred-logo header, or the classic bar (chosen in Appearance, or no part search on the page). */
export async function HomeHeader({ locale }: { locale: string }) {
  const [content, document] = await Promise.all([getSiteContent(), getPublishedBuilder('home')]);
  const currency = await displayCurrency();
  // The minimal header leaves the search to the part search under the film; without that section (or
  // when Appearance chooses it) the classic bar with its search box is kept, so search is never lost.
  const hasFinder = document?.sections.some((b) => b.kind === 'vehicle-finder' && b.visible) ?? false;
  if (!document || !hasFinder || document.chrome.homeHeader === 'classic') return <SiteHeaderView content={content} chrome={document?.chrome} currency={currency} />;
  return <HomeHeaderView content={content} chrome={document.chrome} currency={currency} searchHref={`/${locale}#quick-search-input`} />;
}
