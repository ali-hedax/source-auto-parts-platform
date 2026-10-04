'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ButtonLink } from './button';
import { Alert, Spinner } from './misc';
import type { ApiState } from '@/lib/use-api';

/** Consistent loading / signed-out / forbidden / error / offline states for private views. */
export function Async<T>({ state, children }: { state: ApiState<T>; children: (data: T) => ReactNode }) {
  const t = useTranslations();
  const locale = useLocale();
  if (state.loading && !state.data) return <Spinner label={t('common.loading')} />;
  if (state.error) {
    if (state.error.status === 401) {
      const next = typeof window !== 'undefined' ? window.location.pathname : `/${locale}/account`;
      return (
        <Alert tone="info" title={t('errors.UNAUTHENTICATED')}>
          <ButtonLink href={`/login?next=${encodeURIComponent(next)}`} className="mt-2" size="sm">{t('nav.login')}</ButtonLink>
        </Alert>
      );
    }
    if (state.error.status === 403) return <Alert tone="warning" title={t('admin.noPermission')} />;
    if (state.error.status === 404) return <Alert tone="warning" title={t('common.notFound')} />;
    if (state.error.status === 0) return <Alert tone="warning" title={t('common.offline')} />;
    return (
      <Alert tone="danger" title={t('common.genericError')}>
        {state.error.requestId ? <p>{t('common.requestId', { id: state.error.requestId })}</p> : null}
        <button type="button" onClick={() => void state.reload()} className="mt-2 min-h-11 cursor-pointer font-semibold underline">{t('common.retry')}</button>
      </Alert>
    );
  }
  if (!state.data) return null;
  return <>{children(state.data)}</>;
}
