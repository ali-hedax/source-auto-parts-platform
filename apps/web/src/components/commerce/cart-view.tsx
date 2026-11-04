'use client';

import type { CartView } from '@hedax/contracts';
import { Info, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { formatQuantity } from '@hedax/domain';
import { useEffect, useRef, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Money, Price, unitName } from '@/components/ui/format';
import { Alert, Code, EmptyState, Spinner } from '@/components/ui/misc';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';
import { cartChanged } from '@/lib/cart-count';
import { QuantityStepper } from './quantity-stepper';
import { PartImage } from '@/components/store/part-image';
import { PartPlaceholder } from '@/components/store/part-placeholder';

export function CartClient() {
  const t = useTranslations();
  const locale = useLocale() as 'fa' | 'en';
  const [cart, setCart] = useState<CartView | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [changeError, setChangeError] = useState<string | null>(null);
  // Resets a typed amount that the server refused or never received.
  const [failures, setFailures] = useState(0);
  const latest = useRef(0);

  // Two lines changed in quick succession reload twice; only the newest answer is shown.
  const load = () => {
    const seq = ++latest.current;
    return api<CartView>(`/cart?currency=${document.cookie.includes('hedax_currency=AED') ? 'AED' : 'IRR'}`)
      .then((c) => { if (seq === latest.current) { setCart(c); setFailed(false); } })
      .catch(() => { if (seq === latest.current) setFailed(true); });
  };
  useEffect(() => { void load(); }, []);

  const change = async (lineId: string, quantity: number) => {
    setBusy(lineId);
    setChangeError(null);
    try {
      cartChanged(await api<CartView>(`/cart/items/${encodeURIComponent(lineId)}`, quantity === 0 ? { method: 'DELETE' } : { method: 'PATCH', body: { quantity } }));
    } catch (e) {
      setChangeError(errorText(t, e));
      setFailures((n) => n + 1);
    }
    try {
      await load();
    } finally {
      setBusy(null);
    }
  };

  // A failed refresh leaves a cart already on screen in place; only the first load has nothing to show.
  if (failed && !cart) {
    return (
      <Alert tone="warning" title={t('common.unavailable')}>
        <Button variant="secondary" size="sm" className="mt-2" onClick={() => { setFailed(false); void load(); }}>{t('common.retry')}</Button>
      </Alert>
    );
  }
  if (!cart) return <Spinner label={t('common.loading')} />;
  if (!cart.lines.length) {
    return (
      <EmptyState title={t('cart.empty')}>
        <ButtonLink href="/parts" className="mt-2">{t('cart.browse')}</ButtonLink>
      </EmptyState>
    );
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {changeError ? <div className="lg:col-span-2"><Alert tone="danger" title={changeError} /></div> : null}
      <ul className="store-card divide-y divide-line-soft self-start overflow-hidden">
        {cart.lines.map((l) => {
          const name = (locale === 'en' ? (l.name.en ?? l.name.fa) : l.name.fa) || t('cart.unavailableName');
          const gone = l.problems.includes('OUT_OF_STOCK') || l.problems.includes('UNAVAILABLE');
          return (
            <li key={l.id} className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-4 gap-y-3 p-4 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto_9.5rem] sm:items-center">
              <div className="studio relative row-span-2 aspect-square overflow-hidden rounded-[var(--radius-control)] sm:row-span-1">
                {l.imageUrl ? (
                  <PartImage fallback={<PartPlaceholder label={t('parts.noImage')} variant="thumb" />} src={l.imageUrl} alt="" fill sizes="72px" className="object-contain p-1.5 mix-blend-multiply" />
                ) : (
                  <PartPlaceholder label={t('parts.noImage')} variant="thumb" />
                )}
              </div>
              <div className="min-w-0">
                {l.slug ? <Link href={`/parts/${l.slug}`} className="font-bold leading-7 hover:text-action hover:underline">{name}</Link> : <span className="font-bold leading-7">{name}</span>}
                <p className="text-xs text-steel">{t('parts.sku')}: <Code>{l.sku}</Code></p>
                <div className="mt-1"><Price price={l.unitPrice} unit={l.unit} /></div>
                {l.problems.map((p) => <p key={p} className="mt-1 text-sm font-medium text-danger">{t(`cart.problem_${p}`)}</p>)}
                {l.problems.includes('QUANTITY_REDUCED') && l.maxOrderQuantity > 0 ? (
                  <Button variant="secondary" size="sm" className="mt-2" disabled={busy === l.id} onClick={() => void change(l.id, l.maxOrderQuantity)}>
                    {t('cart.fixTo', { amount: formatQuantity(l.maxOrderQuantity, locale), unit: unitName(l.unit, locale) })}
                  </Button>
                ) : null}
                {gone ? <Link href="/request-part" className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-action underline underline-offset-4">{t('parts.outOfStockAction')}</Link> : null}
              </div>
              {/* Phones: quantity and line total share one row under the name; from sm each is its own column. */}
              <div className="col-start-2 flex flex-wrap items-end justify-between gap-3 sm:contents">
              <div className="flex items-center gap-2">
                {gone ? null : <QuantityStepper key={failures} id={`qty-${l.id}`} value={l.quantity} onChange={(q) => void change(l.id, q)} unit={l.unit} max={Math.max(l.maxOrderQuantity, l.quantity)} name={name} disabled={busy === l.id} height="h-11" showLimit={!l.problems.length} />}
                <button type="button" className="grid size-11 cursor-pointer place-items-center rounded-[var(--radius-control)] text-steel transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-40" disabled={busy === l.id} onClick={() => change(l.id, 0)} aria-label={t('cart.removeItem', { name })}>
                  <Trash2 aria-hidden className="size-5" />
                </button>
              </div>
              <div className="text-end">
                <span className="block text-xs text-steel">{t('cart.lineTotal')}</span>
                <Money value={l.lineTotalPayableIrr} className="font-bold" />
              </div>
              </div>
            </li>
          );
        })}
      </ul>
      <aside className="store-card flex h-fit flex-col gap-4 p-5 sm:p-6 lg:sticky lg:top-32">
        <div className="flex items-baseline justify-between gap-2 border-b border-line-soft pb-4">
          <span className="font-semibold">{t('cart.itemsTotal')}</span>
          <Money value={cart.itemsTotalPayableIrr} className="text-xl font-bold" />
        </div>
        <ul className="flex flex-col gap-2 text-xs leading-6 text-steel">
          <li className="flex gap-2"><Info aria-hidden className="mt-1 size-3.5 shrink-0" />{t('cart.shippingLater')}</li>
          <li className="flex gap-2"><Info aria-hidden className="mt-1 size-3.5 shrink-0" />{t('cart.noReservation')}</li>
          <li className="flex gap-2"><Info aria-hidden className="mt-1 size-3.5 shrink-0" />{t('cart.separateQuotes')}</li>
        </ul>
        {cart.canCheckout ? (
          <ButtonLink href="/checkout" variant="commerce" size="lg">{t('cart.checkout')}</ButtonLink>
        ) : (
          <Alert tone="warning" title={t('checkout.blocker_CART_NOT_READY')} />
        )}
        <ButtonLink href="/parts" variant="secondary">{t('cart.keepShopping')}</ButtonLink>
      </aside>
    </div>
  );
}
