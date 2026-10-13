import type { ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';

export default async function SiteLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="pb-16 focus:outline-none">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
