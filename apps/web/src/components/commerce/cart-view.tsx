'use client';

import type { CartView } from '@hedax/contracts';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { ButtonLink } from '@/components/ui/button';
import { Money, Price } from '@/components/ui/format';
import { Alert, EmptyState, Ltr, Spinner } from '@/components/ui/misc';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';

export function CartClient() {
  const t = useTranslations();
  const locale = useLocale() as 'fa' | 'en';
  const [cart, setCart] = useState<CartView | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
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
    try {
      await api(`/cart/items/${encodeURIComponent(lineId)}`, quantity === 0 ? { method: 'DELETE' } : { method: 'PATCH', body: { quantity } });
      await load();
      window.dispatchEvent(new Event('hedax:cart-changed'));
    } finally {
      setBusy(null);
    }
  };

  if (failed) return <Alert tone="warning" title={t('common.unavailable')} />;
  if (!cart) return <Spinner label={t('common.loading')} />;
  if (!cart.lines.length) {
    return (
      <EmptyState title={t('cart.empty')}>
        <ButtonLink href="/parts" className="mt-2">{t('cart.browse')}</ButtonLink>
      </EmptyState>
    );
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <ul className="flex flex-col gap-3">
        {cart.lines.map((l) => {
          const name = locale === 'en' ? (l.name.en ?? l.name.fa) : l.name.fa;
          return (
            <li key={l.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <Link href={`/parts/${l.slug}`} className="font-bold hover:underline">{name}</Link>
                <p className="text-xs text-steel">{t('parts.sku')}: <Ltr>{l.sku}</Ltr></p>
                <div className="mt-1"><Price price={l.unitPrice} /></div>
                {l.problems.map((p) => <p key={p} className="mt-1 text-sm font-medium text-danger">{t(`cart.problem_${p}`)}</p>)}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded border border-line">
                  <button type="button" className="grid size-11 cursor-pointer place-items-center disabled:opacity-40" disabled={busy === l.id || l.quantity <= 1} onClick={() => change(l.id, l.quantity - 1)} aria-label={t('cart.decrease', { name })}>
                    <Minus aria-hidden className="size-4" />
                  </button>
                  <span className="w-10 text-center font-semibold" aria-live="polite">{locale === 'fa' ? l.quantity.toLocaleString('fa-IR') : l.quantity}</span>
                  <button type="button" className="grid size-11 cursor-pointer place-items-center disabled:opacity-40" disabled={busy === l.id || l.quantity >= l.maxOrderQuantity} onClick={() => change(l.id, l.quantity + 1)} aria-label={t('cart.increase', { name })}>
                    <Plus aria-hidden className="size-4" />
                  </button>
                </div>
                <button type="button" className="grid size-11 cursor-pointer place-items-center rounded text-danger hover:bg-danger-soft" disabled={busy === l.id} onClick={() => change(l.id, 0)} aria-label={t('cart.removeItem', { name })}>
                  <Trash2 aria-hidden className="size-5" />
                </button>
              </div>
              <div className="sm:w-40 sm:text-end">
                <span className="block text-xs text-steel">{t('cart.lineTotal')}</span>
                <Money value={l.lineTotalPayableIrr} className="font-bold" />
              </div>
            </li>
          );
        })}
      </ul>
      <aside className="card flex h-fit flex-col gap-4 p-5 lg:sticky lg:top-28">
        <div className="flex items-center justify-between gap-2">
          <span className="text-steel">{t('cart.itemsTotal')}</span>
          <Money value={cart.itemsTotalPayableIrr} className="text-lg font-bold" />
        </div>
        <p className="text-xs text-steel">{t('cart.noReservation')}</p>
        <p className="text-xs text-steel">{t('cart.separateQuotes')}</p>
        {cart.canCheckout ? (
          <ButtonLink href="/checkout" size="lg">{t('cart.checkout')}</ButtonLink>
        ) : (
          <Alert tone="warning" title={t('checkout.blocker_CART_NOT_READY')} />
        )}
      </aside>
    </div>
  );
}
