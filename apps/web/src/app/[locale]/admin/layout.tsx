import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { AdminShell } from '@/components/admin/shell';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** The staff panel gets the full message set (the storefront's browser bundle leaves the panel's out). */
export default async function AdminLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <NextIntlClientProvider locale={locale} messages={await getMessages()}><AdminShell>{children}</AdminShell></NextIntlClientProvider>;
}
