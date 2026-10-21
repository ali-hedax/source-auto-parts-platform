'use client';

import type { AssistantPublicSettings } from '@hedax/contracts';
import { assistantRouteAllowed } from '@hedax/contracts/constants';
import dynamic from 'next/dynamic';
import { useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useApi } from '@/lib/use-api';

const Widget = dynamic(() => import('./hedax-assistant-widget').then((m) => m.HedaxAssistantWidget), { ssr: false });

export function AssistantEntry() {
  const pathname = usePathname();
  const locale = useLocale() as 'fa' | 'en';
  const allowed = assistantRouteAllowed(pathname);
  // no-store request on navigation: a stale cached page cannot enable the assistant.
  const state = useApi<AssistantPublicSettings>(allowed ? `/site/assistant?path=${encodeURIComponent(pathname)}` : null);
  if (!allowed || state.loading || state.error || state.data?.enabled !== true) return null;
  return <Widget key={`${locale}:${pathname}`} locale={locale} settings={state.data} />;
}
