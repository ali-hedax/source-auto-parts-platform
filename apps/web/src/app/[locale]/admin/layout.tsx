import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { AdminShell } from '@/components/admin/shell';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  // The storefront layout passes only the storefront texts; the panel needs all of them.
  return (
    <NextIntlClientProvider locale={locale} messages={await getMessages()}>
      <AdminShell>{children}</AdminShell>
    </NextIntlClientProvider>
  );
}
