import type { ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { HomeHeader } from '@/components/layout/home-header';
import { StoreShell } from '@/components/layout/store-shell';

/** The home page: the same storefront frame with the minimal centred-logo header over the film. */
export default async function HomeLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <StoreShell header={<HomeHeader locale={locale} />} locale={locale}>{children}</StoreShell>;
}
