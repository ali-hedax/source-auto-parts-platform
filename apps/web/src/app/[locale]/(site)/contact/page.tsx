import { SITE_CONTACT } from '@hedax/contracts/site-contact';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ContactDetails } from '@/components/layout/contact-details';
import { ButtonLink } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/misc';

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const L = locale as 'fa' | 'en';
  return (
    <div className="container-page max-w-3xl py-8">
      <PageHeader title={t('pages.contactTitle')} description={t('pages.contactChat')} />
      <div className="card p-6">
        <p className="mb-4 font-bold" dir="ltr" lang="en">{SITE_CONTACT.displayName}</p>
        <ContactDetails locale={L} variant="page" linkClassName="text-action underline-offset-4 hover:underline" />
      </div>
      <div className="mt-6">
        <ButtonLink href="/account/messages">{t('chat.openSupport')}</ButtonLink>
      </div>
    </div>
  );
}
