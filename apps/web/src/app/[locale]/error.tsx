'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Alert } from '@/components/ui/misc';

/**
 * Localized error boundary for unexpected rendering errors. No technical details
 * are shown; the digest (if any) lets support find the server log entry.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <main id="main" tabIndex={-1} className="focus:outline-none">
      <div className="container-page max-w-3xl py-12">
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold leading-tight text-ink focus:outline-none md:text-3xl">
          {t('common.genericError')}
        </h1>
        <Alert tone="danger" className="mt-4" title={t('pages.errorHint')}>
          {error.digest ? <span className="ltr text-sm">{t('common.requestId', { id: error.digest })}</span> : null}
        </Alert>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => reset()}>{t('common.retry')}</Button>
          <ButtonLink href="/" variant="secondary">{t('nav.home')}</ButtonLink>
        </div>
      </div>
    </main>
  );
}
