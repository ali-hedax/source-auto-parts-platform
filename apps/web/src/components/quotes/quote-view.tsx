'use client';

import type { PaymentRedirect, QuoteVersionView } from '@hedax/contracts';
import { formatDecimalString } from '@hedax/domain';
import { Download } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Textarea } from '@/components/ui/field';
import { DateTime, Money } from '@/components/ui/format';
import { Alert, Badge, DefinitionList, Ltr, PageHeader, Section, StatusBadge, TableScroll, td, th } from '@/components/ui/misc';
import { api, newIdempotencyKey } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';

/**
 * Structured quote (independent of chat text). Accepting ≠ paying; only the
 * exact version shown can be accepted; old/expired versions cannot be paid.
 */
export function QuoteView({ quote, onChange }: { quote: QuoteVersionView; onChange: () => void }) {
  const t = useTranslations();
  const locale = useLocale() as 'fa' | 'en';
  const available = quote.items.filter((i) => i.availability === 'AVAILABLE');
  const [included, setIncluded] = useState<Set<string>>(new Set(available.filter((i) => i.included).map((i) => i.id)));
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [procurementId, setProcurementId] = useState<string | null>(null);
  const idem = useRef(newIdempotencyKey());
  const fail = (e: unknown) => setError(errorText(t, e));
  const expired = new Date(quote.validUntil) <= new Date();
  const open = quote.status === 'SENT' && !expired;

  const decide = async (decision: 'ACCEPT' | 'REJECT') => {
    setBusy(decision);
    setError(null);
    try {
      const res = await api<{ status: string; procurementId: string | null }>('/quote-acceptance', {
        method: 'POST',
        body: { decision, quoteVersionId: quote.versionId, versionNumber: quote.versionNumber, ...(decision === 'ACCEPT' ? { includedItemIds: [...included] } : { rejectReason: reason || undefined }) },
      });
      if (res.procurementId) setProcurementId(res.procurementId);
      onChange();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const pay = async (id: string) => {
    setBusy('PAY');
    setError(null);
    try {
      const res = await api<PaymentRedirect>(`/procurements/${id}/pay`, { method: 'POST', idempotencyKey: idem.current });
      window.location.assign(res.redirectUrl);
    } catch (e) {
      fail(e);
      setBusy(null);
    }
  };

  const unitLabel = (unit: string, dayKind: string) => (unit === 'HOURS' ? t('quote.unit_HOURS') : dayKind === 'BUSINESS' ? t('quote.unit_BUSINESS_DAYS') : t('quote.unit_DAYS'));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('quote.title', { reference: quote.reference })}
        description={t('quote.version', { n: quote.versionNumber })}
        actions={<StatusBadge status={expired && quote.status === 'SENT' ? 'EXPIRED' : quote.status} label={t(`status.${expired && quote.status === 'SENT' ? 'EXPIRED' : quote.status}` as never)} />}
      />
      {quote.status === 'SUPERSEDED' ? <Alert tone="warning" title={t('quote.superseded')} /> : null}
      <DefinitionList
        items={[
          { term: t('quote.issuedAt'), value: <DateTime iso={quote.issuedAt} /> },
          { term: t('quote.validUntil'), value: <DateTime iso={quote.validUntil} /> },
        ]}
      />
      <TableScroll caption={t('quote.items')}>
        <thead>
          <tr>
            <th className={th}>{t('cart.item')}</th>
            <th className={th}>{t('quote.type')}</th>
            <th className={th}>{t('quote.compatibility')}</th>
            <th className={th}>{t('parts.quantity')}</th>
            <th className={th}>{t('cart.unitPrice')}</th>
            <th className={th}>{t('cart.lineTotal')}</th>
            <th className={th}>{t('quote.leadTime')}</th>
          </tr>
        </thead>
        <tbody>
          {quote.items.map((i) => (
            <tr key={i.id} className={i.availability === 'UNAVAILABLE' ? 'text-steel' : ''}>
              {/* The item cell is the one pinned on phones, so it also holds the include checkbox of an open quote. */}
              <td className={`${td} max-lg:min-w-44`}>
                <div className="flex items-start gap-1">
                  {open && i.availability === 'AVAILABLE' ? (
                    <Checkbox
                      id={`inc-${i.id}`}
                      className="-my-2.5 -ms-1 shrink-0 px-1"
                      label={<span className="sr-only">{t('quote.include')}: {i.description}</span>}
                      checked={included.has(i.id)}
                      onChange={(e) => setIncluded((s) => { const n = new Set(s); if (e.target.checked) n.add(i.id); else n.delete(i.id); return n; })}
                    />
                  ) : null}
                  <div className="min-w-0">
                    <span className="font-semibold">{i.description}</span>
                    {i.manufacturer ? <span className="block text-xs">{t('quote.manufacturer')}: {i.manufacturer}</span> : null}
                    {i.alternativeNote ? <span className="mt-1 block text-xs text-warning">{t('quote.alternative')}: {i.alternativeNote}</span> : null}
                  </div>
                </div>
              </td>
              <td className={td}>{t(`partType.${i.partType}` as never)} / {t(`condition.${i.condition}` as never)}</td>
              <td className={td}><Badge tone={i.compatibility === 'CONFIRMED' ? 'success' : 'warning'}>{t(`quote.compat_${i.compatibility}` as never)}</Badge></td>
              <td className={td}>{locale === 'fa' ? i.quantity.toLocaleString('fa-IR') : i.quantity}</td>
              <td className={td}>{i.availability === 'AVAILABLE' ? <Money value={i.unitPrice} /> : '—'}</td>
              <td className={td}>{i.availability === 'UNAVAILABLE' ? <Badge tone="danger">{t('quote.unavailable')}</Badge> : <Money value={i.lineTotalIrr} />}</td>
              <td className={td}>
                {i.availability === 'AVAILABLE' ? t('quote.leadRange', { min: i.leadTime.min, max: i.leadTime.max, unit: unitLabel(i.leadTime.unit, i.leadTime.dayKind) }) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </TableScroll>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t('quote.total')} id="q-totals">
          <DefinitionList
            items={[
              { term: t('checkout.items'), value: <Money value={quote.totals.itemsIrr} /> },
              ...quote.costs.map((c) => ({ term: c.label, value: <Money value={c.amountIrr} /> })),
              { term: t('quote.tax'), value: <Money value={quote.totals.taxIrr} /> },
              { term: t('quote.total'), value: <Money value={quote.totals.totalPayableIrr} className="text-lg font-bold" /> },
              ...(quote.totals.referenceTotalAed ? [{ term: t('quote.referenceAed'), value: <Money value={quote.totals.referenceTotalAed} /> }] : []),
            ]}
          />
          {quote.fx ? <p className="mt-3 text-xs text-steel">{t('quote.rate', { rate: formatDecimalString(quote.fx.irrPerAed, locale) })}</p> : null}
        </Section>
        <Section title={t('quote.schedule')} id="q-schedule">
          <p className="text-sm">{t('quote.scheduleNote', { wording: t(`quote.wording_${quote.schedule.wording}` as never) })}</p>
          <p className="mt-2 font-semibold">{t('quote.readyToShip', { days: quote.schedule.readyToShip.maxDays })}</p>
          <p className="mt-1 text-sm">{quote.schedule.shipping ? t('quote.shippingTime', { min: quote.schedule.shipping.min, max: quote.schedule.shipping.max }) : t('quote.shippingSeparate')}</p>
          <p className="mt-1 text-xs text-steel">{t('quote.slowest')}</p>
        </Section>
      </div>
      <Section title={t('quote.terms')} id="q-terms">
        <p className="font-semibold">{quote.terms.title}</p>
        <p className="mt-2 whitespace-pre-line text-sm leading-7">{quote.terms.body}</p>
      </Section>
      {quote.pdfUrls.fa || quote.pdfUrls.en ? (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {(['fa', 'en'] as const).map((lang) => quote.pdfUrls[lang] ? (
            <a key={lang} href={quote.pdfUrls[lang] as string} hrefLang={lang} className="inline-flex min-h-11 w-fit items-center gap-2 font-semibold text-action underline">
              <Download aria-hidden className="size-4" />{t('quote.pdfIn', { language: t(`quote.pdfLanguage_${lang}`) })}
            </a>
          ) : null)}
        </div>
      ) : quote.status !== 'DRAFT' ? <p className="text-sm text-steel">{t('quote.pdfPending')}</p> : null}
      {error ? <Alert tone="danger" title={error} /> : null}
      {open ? (
        <div className="card flex flex-col gap-3 p-5">
          <p className="text-sm">{t('quote.acceptNote')}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={() => decide('ACCEPT')} loading={busy === 'ACCEPT'} disabled={included.size === 0}>{t('quote.accept')}</Button>
            <Button variant="secondary" onClick={() => setRejecting((r) => !r)}>{t('quote.reject')}</Button>
          </div>
          {rejecting ? (
            <div className="flex flex-col gap-2">
              <Field id="reject-reason" label={t('quote.rejectReason')} optionalLabel={t('common.optional')}>
                <Textarea id="reject-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
              </Field>
              <Button variant="danger" onClick={() => decide('REJECT')} loading={busy === 'REJECT'}>{t('common.confirm')}</Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {quote.status === 'ACCEPTED' || procurementId ? (
        quote.payable.allowed || procurementId ? (
          <PayQuoteButton quote={quote} procurementId={procurementId} onPay={pay} busy={busy === 'PAY'} />
        ) : (
          <Alert tone="warning" title={t('quote.notPayable')}>
            <ul className="list-disc ps-5">{quote.payable.blockers.map((b) => <li key={b}>{t.has(`quote.blocker_${b}`) ? t(`quote.blocker_${b}` as never) : b}</li>)}</ul>
          </Alert>
        )
      ) : null}
    </div>
  );
}

function PayQuoteButton({ quote, procurementId, onPay, busy }: { quote: QuoteVersionView; procurementId: string | null; onPay: (id: string) => void; busy: boolean }) {
  const t = useTranslations();
  const [id, setId] = useState<string | null>(procurementId);
  const resolve = async () => {
    if (id) return onPay(id);
    // The procurement created at acceptance is looked up from the customer's list.
    const list = await api<Array<{ id: string; quoteReference: string; status: string }>>('/procurements');
    const match = list.find((p) => p.quoteReference === quote.reference && p.status === 'AWAITING_PAYMENT');
    if (match) {
      setId(match.id);
      onPay(match.id);
    }
  };
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
      <span className="font-semibold">{t('quote.total')}: <Money value={quote.totals.totalPayableIrr} /></span>
      <Button size="lg" loading={busy} onClick={() => void resolve()}>{t('quote.pay')}</Button>
      <span className="sr-only"><Ltr>{quote.versionId}</Ltr></span>
    </div>
  );
}
