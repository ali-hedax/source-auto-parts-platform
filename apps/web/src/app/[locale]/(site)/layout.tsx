import type { ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { SiteHeader } from '@/components/layout/site-header';
import { StoreShell } from '@/components/layout/store-shell';

export default async function SiteLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <StoreShell header={<SiteHeader />} locale={locale}>{children}</StoreShell>;
}
