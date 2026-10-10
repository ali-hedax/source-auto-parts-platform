'use client';

import type { PaymentRedirect, PaymentResultView } from '@hedax/contracts';
import { CheckCircle2, Clock, ShieldAlert, XCircle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { DateTime, Money } from '@/components/ui/format';
import { Alert, Code, DefinitionList, Spinner } from '@/components/ui/misc';
import { api, newIdempotencyKey } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';

/**
 * Shows only what the server verified. Query parameters from the gateway are
 * never trusted; an unknown result keeps polling the server (which re-inquires
 * the provider), so closing the browser loses nothing (A10, A11).
 */
export function PaymentResultClient() {
  const t = useTranslations();
  const search = useSearchParams();
  const attempt = search.get('attempt');
  const [result, setResult] = useState<PaymentResultView | null>(null);
  const [error, setError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const tries = useRef(0);

  useEffect(() => {
    if (!attempt || !/^[0-9a-f-]{36}$/.test(attempt)) return;
    let timer: ReturnType<typeof setTimeout>;
    // A request still in flight when the page is left must not schedule another one.
    let stopped = false;
    const poll = async () => {
      try {
        const r = await api<PaymentResultView>(`/payments/attempts/${attempt}`);
        if (stopped) return;
        setResult(r);
        tries.current += 1;
        if (r.status === 'PENDING_VERIFICATION' && tries.current < 40) timer = setTimeout(poll, Math.min(2000 * tries.current, 15000));
      } catch {
        if (!stopped) setError(true);
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [attempt]);

  if (!attempt) return <Alert tone="danger" title={t('payment.missing')} />;
  if (error) return <Alert tone="warning" title={t('common.unavailable')} />;
  if (!result) return <Spinner label={t('payment.checking')} />;

  const retry = async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      const path = result.subject.kind === 'STOCK_ORDER' ? `/orders/${result.subject.id}/pay` : `/procurements/${result.subject.id}/pay`;
      const res = await api<PaymentRedirect>(path, { method: 'POST', idempotencyKey: newIdempotencyKey() });
      window.location.assign(res.redirectUrl);
    } catch (e) {
      // e.g. the reservation expired or the gateway is unreachable: say so next to the button.
      setRetrying(false);
      setRetryError(errorText(t, e));
    }
  };

  const orderHref = result.subject.kind === 'STOCK_ORDER' ? `/account/orders/${result.subject.id}` : `/account/procurements/${result.subject.id}`;
  const icon = {
    SUCCEEDED: <span className="grid size-14 place-items-center rounded-full bg-success-soft"><CheckCircle2 aria-hidden className="size-8 text-success" /></span>,
    FAILED: <span className="grid size-14 place-items-center rounded-full bg-danger-soft"><XCircle aria-hidden className="size-8 text-danger" /></span>,
    CANCELLED: <span className="grid size-14 place-items-center rounded-full bg-canvas"><XCircle aria-hidden className="size-8 text-steel" /></span>,
    PENDING_VERIFICATION: <span className="grid size-14 place-items-center rounded-full bg-warning-soft"><Clock aria-hidden className="size-8 text-warning" /></span>,
  }[result.status];
  const title =
    result.message === 'NEEDS_REVIEW' ? t('payment.needsReview')
    : result.status === 'SUCCEEDED' ? t('payment.succeeded')
    : result.status === 'FAILED' ? t('payment.failed')
    : result.status === 'CANCELLED' ? t('payment.cancelled')
    : t('payment.checking');

  return (
    <div className="card flex flex-col items-start gap-5 p-6 sm:p-8" role="status" aria-live="polite">
      {result.message === 'NEEDS_REVIEW' ? <span className="grid size-14 place-items-center rounded-full bg-warning-soft"><ShieldAlert aria-hidden className="size-8 text-warning" /></span> : icon}
      <h2 className="text-xl font-bold">{title}</h2>
      {result.status === 'PENDING_VERIFICATION' ? <p className="text-steel">{t('payment.checkingHint')}</p> : null}
      <DefinitionList
        items={[
          { term: t('order.reference'), value: <Code>{result.subject.reference}</Code> },
          { term: t('payment.amount'), value: <Money value={result.amount} /> },
          ...(result.paidAt ? [{ term: t('payment.paidAt'), value: <DateTime iso={result.paidAt} /> }] : []),
          ...(result.providerReference ? [{ term: t('payment.reference'), value: <Code>{result.providerReference}</Code> }] : []),
        ]}
      />
      {retryError ? <Alert tone="danger" title={retryError} /> : null}
      <div className="flex w-full flex-wrap gap-2 border-t border-line-soft pt-5">
        {result.canRetry ? <Button onClick={retry} loading={retrying}>{t('payment.retry')}</Button> : null}
        <ButtonLink href={orderHref} variant={result.canRetry ? 'secondary' : 'primary'}>{t('payment.viewOrder')}</ButtonLink>
      </div>
    </div>
  );
}
