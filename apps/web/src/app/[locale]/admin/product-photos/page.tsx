import { redirect } from '@/i18n/navigation';

/** Bulk photo upload moved into «مرکز دانش و کاتالوگ» as a tab; send old links/bookmarks there. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: { pathname: '/admin/knowledge-catalog', query: { tab: 'photos' } }, locale });
}
