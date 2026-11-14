import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CartClient } from '@/components/commerce/cart-view';
import { ChapterBand } from '@/components/store/chapter-band';
import { PurchaseSteps } from '@/components/store/purchase-steps';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return { title: t('seo.cartTitle'), description: t('seo.cartDescription'), robots: { index: false, follow: false } };
}

export default async function CartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <div className="store-page">
      <ChapterBand title={t('cart.title')} eyebrow="SOURCE · CHECKOUT" locale={locale}>
        <PurchaseSteps current={1} label={t('checkout.steps')} labels={[t('checkout.stepCart'), t('checkout.stepDelivery'), t('checkout.stepPay')]} locale={locale} />
      </ChapterBand>
      {/* The cart and checkout load in the browser: reserving the area keeps the footer from jumping (CLS). */}
      <div className="container-page min-h-[65svh] pb-10">
        <CartClient />
      </div>
    </div>
  );
}
