import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Alert, PageHeader } from '@/components/ui/misc';
import type { Metadata } from 'next';
import { serverApiOptional } from '@/lib/api/server';
import { canonical, describe } from '@/lib/seo';

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
type PolicyKind = 'TERMS' | 'PRIVACY' | 'RETURNS' | 'SHIPPING' | 'SOURCING' | 'WARRANTY';

const loadPolicy = (kind: PolicyKind) => serverApiOptional<PolicyView>(`/site/policies/${kind.toLowerCase()}`, { publicCache: 300 }).catch(() => null);

/**
 * A policy page's own title and description (the published policy's title and opening words) and its
 * address as canonical; until a policy is published, the page's name and the site description.
 */
export async function policyMetadata(kind: PolicyKind, locale: string, path: string, fallbackTitle: string, intro?: string): Promise<Metadata> {
  const policy = await loadPolicy(kind);
  const pick = (v: { fa: string; en: string | null }) => (locale === 'en' ? (v.en ?? v.fa) : v.fa);
  const title = policy ? pick(policy.title) : fallbackTitle;
  const description = describe(intro) ?? (policy ? describe(pick(policy.body)) : undefined);
  return { title, ...(description ? { description } : {}), alternates: canonical(locale, path), openGraph: { title, ...(description ? { description } : {}) } };
}

export async function PolicyPage({ kind, fallbackTitle, intro }: { kind: PolicyKind; fallbackTitle: string; intro?: ReactNode }) {
  const t = await getTranslations('pages');
  const locale = (await getLocale()) as 'fa' | 'en';
  const policy = await loadPolicy(kind);
  const title = policy ? (locale === 'en' ? (policy.title.en ?? policy.title.fa) : policy.title.fa) : fallbackTitle;
  const body = policy ? (locale === 'en' ? (policy.body.en ?? policy.body.fa) : policy.body.fa) : null;
  return (
    <div className="container-page max-w-3xl py-8">
      <PageHeader title={title} />
      {intro ? <div className="mb-6">{intro}</div> : null}
      {body ? (
        <article className="prose-hedax card p-6 sm:p-8">
          {body.split(/\n{1,}/).map((p, i) => <p key={i}>{p}</p>)}
        </article>
      ) : (
        <Alert tone="info" title={t('policyPending')} />
      )}
    </div>
  );
}
