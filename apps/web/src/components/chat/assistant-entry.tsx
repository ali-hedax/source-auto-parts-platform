'use client';

import type { AssistantPublicSettings } from '@hedax/contracts';
import { assistantRouteAllowed } from '@hedax/contracts/constants';
import dynamic from 'next/dynamic';
import { useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useApi } from '@/lib/use-api';
import { useAfterLoad } from '@/lib/after-load';

const Widget = dynamic(() => import('./hedax-assistant-widget').then((m) => m.HedaxAssistantWidget), { ssr: false });

export function AssistantEntry() {
  const pathname = usePathname();
  const locale = useLocale() as 'fa' | 'en';
  // Not on the request form: it is all fields, and the guide has nothing to add there that would justify sitting on them.
  const allowed = assistantRouteAllowed(pathname) && !/\/request-part\/?$/.test(pathname);
  // The guide is optional: its settings request and code wait until the page itself has loaded.
  const ready = useAfterLoad();
  // no-store request on navigation: a stale cached page cannot enable the assistant.
  const state = useApi<AssistantPublicSettings>(allowed && ready ? `/site/assistant?path=${encodeURIComponent(pathname)}` : null);
  // While the next page's answer loads the guide stays as it is; only an answer that turns it off removes it.
  if (!allowed || !ready || state.error || state.data?.enabled !== true) return null;
  return <Widget key={locale} locale={locale} settings={state.data} />;
}
