import { redirect } from '@/i18n/navigation';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: '/admin/appearance', locale });
}
