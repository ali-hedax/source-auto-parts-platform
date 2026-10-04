import { getLocale, getTranslations } from 'next-intl/server';
import { Alert, PageHeader } from '@/components/ui/misc';
import { serverApiOptional } from '@/lib/api/server';

interface PolicyView {
  id: string;
  version: number;
  title: { fa: string; en: string | null };
  body: { fa: string; en: string | null };
  publishedAt: string | null;
}

/**
 * Renders an owner-published policy as plain text paragraphs (never raw HTML).
 * Until the owner publishes one, a "pending" notice is shown — no legal
 * numbers or commitments are invented (spec §17).
 */
export async function PolicyPage({ kind, fallbackTitle, intro }: { kind: 'TERMS' | 'PRIVACY' | 'RETURNS' | 'SHIPPING' | 'SOURCING' | 'WARRANTY'; fallbackTitle: string; intro?: string }) {
  const t = await getTranslations('pages');
  const locale = (await getLocale()) as 'fa' | 'en';
  const policy = await serverApiOptional<PolicyView>(`/site/policies/${kind.toLowerCase()}`, { publicCache: 300 }).catch(() => null);
  const title = policy ? (locale === 'en' ? (policy.title.en ?? policy.title.fa) : policy.title.fa) : fallbackTitle;
  const body = policy ? (locale === 'en' ? (policy.body.en ?? policy.body.fa) : policy.body.fa) : null;
  return (
    <div className="container-page max-w-3xl py-8">
      <PageHeader title={title} />
      {intro ? <p className="mb-6 leading-8">{intro}</p> : null}
      {body ? (
        <article className="prose-hedax card p-6 leading-8">
          {body.split(/\n{1,}/).map((p, i) => <p key={i}>{p}</p>)}
        </article>
      ) : (
        <Alert tone="info" title={t('policyPending')} />
      )}
    </div>
  );
}
