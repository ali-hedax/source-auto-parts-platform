import type { VehicleBrandView } from '@hedax/contracts';
import { resolveContactChannels } from '@hedax/contracts/constants';
import { MessageCircle, Phone, Smartphone } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { ChapterBand } from '@/components/store/chapter-band';
import { RequestForm } from '@/components/sourcing/request-form';
import { serverApi } from '@/lib/api/server';
import { faDigits, iranNumberText, telHref, whatsappHref, whatsappText } from '@/lib/contact-format';
import { getSiteContent, seoMetadata } from '@/lib/site-content';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return { ...seoMetadata(await getSiteContent(), 'requestPart', locale, t('request.title'), t('request.metaDescription')), alternates: { canonical: `/${locale}/request-part`, languages: { fa: '/fa/request-part', en: '/en/request-part' } } };
}

export default async function RequestPartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const fa = locale === 'fa';
  const [brands, content] = await Promise.all([serverApi<VehicleBrandView[]>('/catalog/vehicle-brands', { publicCache: 300 }).catch(() => []), getSiteContent()]);
  const ch = content ? resolveContactChannels(content.contact, content.social.links) : null;
  const steps = [t('request.step1'), t('request.step2'), t('request.step3'), t('request.step4')];
  return (
    <div className="store-page su-request">
      <ChapterBand title={t('request.title')} description={t('request.intro')} locale={locale} />
      <div className="container-page su-request-layout">
        <div className="su-panel su-request-main">
          <Suspense><RequestForm brands={brands} /></Suspense>
        </div>
        <aside className="su-request-aside">
          <section className="su-panel" aria-labelledby="how-title">
            <h2 id="how-title">{t('request.howTitle')}</h2>
            <ol className="su-steps-list">
              {steps.map((s, i) => <li key={i}><span aria-hidden>{(i + 1).toLocaleString(fa ? 'fa-IR' : 'en-US')}</span>{s}</li>)}
            </ol>
          </section>
          {ch && (ch.phone || ch.mobile || ch.whatsapp) ? <section className="su-panel" aria-labelledby="quick-contact-title">
            <h2 id="quick-contact-title">{t('request.quickContact')}</h2>
            <ul className="su-quick-contact">
              {ch.phone ? <li><a href={telHref(ch.phone, ch.phoneExtension)}><Phone aria-hidden size={18} /><span>{fa ? 'تلفن' : 'Phone'}</span><bdi dir="ltr">{iranNumberText(ch.phone, fa ? 'fa' : 'en')}</bdi>{ch.phoneExtension ? <small>({fa ? `داخلی ${faDigits(ch.phoneExtension)}` : `ext. ${ch.phoneExtension}`})</small> : null}</a></li> : null}
              {ch.mobile ? <li><a href={telHref(ch.mobile)}><Smartphone aria-hidden size={18} /><span>{fa ? 'موبایل' : 'Mobile'}</span><bdi dir="ltr">{iranNumberText(ch.mobile, fa ? 'fa' : 'en')}</bdi></a></li> : null}
              {ch.whatsapp ? <li><a href={whatsappHref(ch.whatsapp)} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden size={18} /><span>{fa ? 'واتس‌اپ' : 'WhatsApp'}</span><bdi dir="ltr">{whatsappText(ch.whatsapp)}</bdi></a></li> : null}
            </ul>
          </section> : null}
        </aside>
      </div>
    </div>
  );
}
