import { localize } from '@hedax/contracts/constants';
import { getPublishedBuilder, getBuilderData } from '@/lib/builder-server';
import { BuilderView } from '@/components/builder/view';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ContactDetails } from '@/components/layout/contact-details';
import { ButtonLink } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/misc';
import { getSiteContent, seoMetadata } from '@/lib/site-content';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const visual = await getPublishedBuilder('contact');
  if (visual) return { title: localize(visual.title, locale), description: localize(visual.description, locale) };
  const t = await getTranslations({ locale });
  return seoMetadata(await getSiteContent(), 'contact', locale, t('pages.contactTitle'));
}

/** Contact page: details from site content → contact; the chat text and button follow its «support chat» switch. */
export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const visual = await getPublishedBuilder('contact');
  if (visual) return <BuilderView document={visual} data={await getBuilderData(visual)} locale={locale} />;
  const t = await getTranslations();
  const L = locale as 'fa' | 'en';
  const content = await getSiteContent();
  const contact = content?.contact;
  const chat = contact?.supportChat ?? false;
  return (
    <div className="container-page max-w-3xl py-8">
      <PageHeader title={t('pages.contactTitle')} {...(chat ? { description: t('pages.contactChat') } : {})} />
      {contact ? (
        <div className="card p-6">
          {contact.displayName ? <p className="mb-4 font-bold" dir="ltr" lang="en">{contact.displayName}</p> : null}
          <ContactDetails contact={contact} social={content?.social.links ?? []} locale={L} variant="page" linkClassName="text-action underline-offset-4 hover:underline" />
        </div>
      ) : null}
      {chat ? (
        <div className="mt-6">
          <ButtonLink href="/account/messages">{t('chat.openSupport')}</ButtonLink>
        </div>
      ) : null}
    </div>
  );
}
