import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CartClient } from '@/components/commerce/cart-view';
import { PageHeader } from '@/components/ui/misc';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <div className="page-canvas container-page py-8">
      <PageHeader title={t('cart.title')} />
      <CartClient />
    </div>
  );
}
