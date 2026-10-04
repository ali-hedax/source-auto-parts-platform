import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/button';
import { Alert, DefinitionList, Ltr, PageHeader } from '@/components/ui/misc';
import { serverApiOptional } from '@/lib/api/server';

interface Contact {
  phone: string | null;
  email: string | null;
  address: { fa: string | null; en: string | null };
  workingHours: { fa: string | null; en: string | null };
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const L = locale as 'fa' | 'en';
  const c = await serverApiOptional<Contact>('/site/contact', { publicCache: 300 }).catch(() => null);
  const items = [
    ...(c?.phone ? [{ term: t('pages.phone'), value: <Ltr>{c.phone}</Ltr> }] : []),
    ...(c?.email ? [{ term: t('account.email'), value: <Ltr>{c.email}</Ltr> }] : []),
    ...(c?.address[L] ? [{ term: t('pages.address'), value: c.address[L] }] : []),
    ...(c?.workingHours[L] ? [{ term: t('pages.hours'), value: c.workingHours[L] }] : []),
  ];
  return (
    <div className="container-page max-w-3xl py-8">
      <PageHeader title={t('pages.contactTitle')} description={t('pages.contactChat')} />
      {items.length ? <div className="card p-6"><DefinitionList items={items} /></div> : <Alert tone="info" title={t('footer.contactPending')} />}
      <div className="mt-6">
        <ButtonLink href="/account/messages">{t('chat.openSupport')}</ButtonLink>
      </div>
    </div>
  );
}
