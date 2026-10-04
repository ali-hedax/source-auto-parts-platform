'use client';

import type { CheckoutPreview, PaymentRedirect } from '@hedax/contracts';
import { formatMoney, money } from '@hedax/domain';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/field';
import { Money } from '@/components/ui/format';
import { Alert, Spinner } from '@/components/ui/misc';
import { Link } from '@/i18n/navigation';
import { api, newIdempotencyKey } from '@/lib/api/client';
import { errorText, isApiError } from '@/lib/api/errors';
import { AddressForm, type AddressRow } from '@/components/account/address-form';

/**
 * Checkout always re-reads totals from the server; the browser sends back
 * the total it showed only so the server can refuse if anything changed.
 */
export function CheckoutClient() {
  const t = useTranslations();
  const locale = useLocale() as 'fa' | 'en';
  const [addresses, setAddresses] = useState<AddressRow[] | null>(null);
  const [addressId, setAddressId] = useState<string>('');
  const [shippingId, setShippingId] = useState<string>('');
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [loginNeeded, setLoginNeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [adding, setAdding] = useState(false);
  const idem = useRef<string>(newIdempotencyKey());

  const loadPreview = useCallback(async (a: string, s: string) => {
    const qs = new URLSearchParams({ currency: document.cookie.includes('hedax_currency=AED') ? 'AED' : 'IRR', ...(a ? { addressId: a } : {}), ...(s ? { shippingMethodId: s } : {}) });
    try {
      setPreview(await api<CheckoutPreview>(`/checkout/preview?${qs.toString()}`));
    } catch (e) {
      if (isApiError(e) && e.status === 401) setLoginNeeded(true);
      else setError(t('common.unavailable'));
    }
  }, [t]);

  useEffect(() => {
    api<AddressRow[]>('/account/addresses')
      .then((rows) => {
        setAddresses(rows);
        const def = rows.find((r) => r.isDefault) ?? rows[0];
        if (def) setAddressId(def.id);
      })
      .catch((e) => {
        if (isApiError(e) && e.status === 401) setLoginNeeded(true);
        setAddresses([]);
      });
  }, []);

  useEffect(() => {
    if (addresses !== null && !loginNeeded) void loadPreview(addressId, shippingId);
  }, [addressId, shippingId, addresses, loginNeeded, loadPreview]);

  // Any change to what is being paid for gets a fresh idempotency key.
  useEffect(() => { idem.current = newIdempotencyKey(); }, [addressId, shippingId, preview?.totals?.grandTotal?.amountMinor]);

  const pay = async () => {
    if (!preview?.totals?.grandTotal) return;
    setPaying(true);
    setError(null);
    try {
      const res = await api<PaymentRedirect>(`/checkout?locale=${locale}`, {
        method: 'POST',
        idempotencyKey: idem.current,
        body: { addressId, shippingMethodId: shippingId, acceptedPolicyVersionId: preview.policy.id, expectedGrandTotalIrr: preview.totals.grandTotal.amountMinor },
      });
      window.location.assign(res.redirectUrl);
    } catch (e) {
      setPaying(false);
      if (isApiError(e) && e.code === 'TOTAL_CHANGED') {
        setError(t('checkout.totalChanged'));
        await loadPreview(addressId, shippingId);
      } else if (isApiError(e) && e.code === 'POLICY_CHANGED') {
        setAccepted(false);
        setError(t('checkout.policyChanged'));
        await loadPreview(addressId, shippingId);
      } else {
        setError(errorText(t, e));
      }
    }
  };

  if (loginNeeded) {
    return (
      <Alert tone="info" title={t('checkout.loginRequired')}>
        <ButtonLink href={`/login?next=${encodeURIComponent(`/${locale}/checkout`)}`} className="mt-3">{t('nav.login')}</ButtonLink>
      </Alert>
    );
  }
  if (!preview || addresses === null) return <Spinner label={t('common.loading')} />;

  const selected = preview.shippingOptions.find((o) => o.id === shippingId);
  const grand = preview.totals?.grandTotal;
  const canPay = !!grand && accepted && preview.blockers.length === 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
      <div className="flex flex-col gap-6">
        <section aria-labelledby="addr-title" className="card p-5">
          <h2 id="addr-title" className="mb-3 text-lg font-bold">{t('checkout.address')}</h2>
          {addresses.length ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">{t('checkout.address')}</legend>
              {addresses.map((a) => (
                <label key={a.id} className={`flex cursor-pointer gap-3 rounded-[var(--radius-control)] border p-3 ${addressId === a.id ? 'border-action bg-action-soft' : 'border-line'}`}>
                  <input type="radio" name="address" value={a.id} checked={addressId === a.id} onChange={() => setAddressId(a.id)} className="mt-1 size-5 accent-[var(--color-action)]" />
                  <span>
                    <span className="block font-semibold">{a.recipientName} — {a.province}، {a.city}</span>
                    <span className="block text-sm text-steel">{a.addressLine}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}
          {adding ? (
            <div className="mt-4">
              <AddressForm onSaved={(row) => { setAddresses((prev) => [...(prev ?? []), row]); setAddressId(row.id); setAdding(false); }} onCancel={() => setAdding(false)} />
            </div>
          ) : (
            <Button variant="secondary" className="mt-3" onClick={() => setAdding(true)}>{t('checkout.addAddress')}</Button>
          )}
        </section>

        <section aria-labelledby="ship-title" className="card p-5">
          <h2 id="ship-title" className="mb-3 text-lg font-bold">{t('checkout.shipping')}</h2>
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">{t('checkout.shipping')}</legend>
            {preview.shippingOptions.map((o) => (
              <label key={o.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] border p-3 ${shippingId === o.id ? 'border-action bg-action-soft' : 'border-line'}`}>
                <span className="flex items-center gap-3">
                  <input type="radio" name="shipping" value={o.id} checked={shippingId === o.id} onChange={() => setShippingId(o.id)} className="size-5 accent-[var(--color-action)]" />
                  <span>{locale === 'en' ? (o.name.en ?? o.name.fa) : o.name.fa}</span>
                </span>
                {o.cost.status === 'KNOWN' ? <Money value={o.cost.amount} className="font-semibold" /> : <span className="text-sm text-warning">{t('price.inquiry')}</span>}
              </label>
            ))}
          </fieldset>
          {selected?.cost.status === 'UNKNOWN' ? (
            <Alert tone="warning" className="mt-3" title={t('checkout.shippingUnknown')}>
              <Link href="/account/messages" className="font-semibold underline">{t('checkout.shippingInquiry')}</Link>
            </Alert>
          ) : null}
        </section>
      </div>

      <aside className="card flex h-fit flex-col gap-3 p-5 lg:sticky lg:top-28" aria-labelledby="review-title">
        <h2 id="review-title" className="text-lg font-bold">{t('checkout.review')}</h2>
        {preview.totals ? (
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-2"><dt>{t('checkout.items')}</dt><dd><Money value={preview.totals.itemsTotal} /></dd></div>
            <div className="flex justify-between gap-2"><dt>{t('checkout.shippingCost')}</dt><dd>{preview.totals.shipping ? <Money value={preview.totals.shipping} /> : t('price.inquiry')}</dd></div>
            <div className="flex justify-between gap-2"><dt>{t('checkout.tax')}</dt><dd>{preview.totals.taxConfigured ? <Money value={preview.totals.tax} /> : <span className="text-steel">{t('checkout.taxNotConfigured')}</span>}</dd></div>
            <div className="mt-2 flex justify-between gap-2 border-t border-line pt-3 text-base font-bold"><dt>{t('checkout.grandTotal')}</dt><dd><Money value={preview.totals.grandTotal} /></dd></div>
            {preview.totals.referenceAed ? <div className="flex justify-between gap-2 text-steel"><dt>{t('checkout.referenceAed')}</dt><dd><Money value={preview.totals.referenceAed} /></dd></div> : null}
          </dl>
        ) : null}
        {preview.blockers.length ? (
          <Alert tone="warning" title={t('checkout.blockers')}>
            <ul className="list-disc ps-5">{preview.blockers.map((b) => <li key={b}>{t.has(`checkout.blocker_${b}`) ? t(`checkout.blocker_${b}` as never) : b}</li>)}</ul>
          </Alert>
        ) : null}
        {preview.policy.id ? (
          <Checkbox
            id="accept-terms"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            label={<>{t('checkout.acceptTerms', { title: preview.policy.title })} <Link href="/terms" target="_blank" className="text-action underline">{t('checkout.readTerms')}</Link></>}
          />
        ) : null}
        <p className="text-xs text-steel">{t('checkout.reservationNote', { minutes: preview.reservationMinutes })}</p>
        {error ? <Alert tone="danger" title={error} /> : null}
        <Button size="lg" disabled={!canPay} loading={paying} onClick={pay}>
          {paying ? t('checkout.starting') : grand ? t('checkout.pay', { amount: formatMoney(money('IRR', grand.amountMinor), locale) }) : t('checkout.review')}
        </Button>
      </aside>
    </div>
  );
}
