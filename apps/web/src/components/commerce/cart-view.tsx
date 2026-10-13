'use client';

import type { CartView } from '@hedax/contracts';
import { ImageOff, Info, Minus, Plus, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { ButtonLink } from '@/components/ui/button';
import { Money, Price } from '@/components/ui/format';
import { Alert, Code, EmptyState, Spinner } from '@/components/ui/misc';
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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <ul className="divide-y divide-line-soft self-start rounded-[var(--radius-card)] border border-line-soft bg-white">
        {cart.lines.map((l) => {
          const name = locale === 'en' ? (l.name.en ?? l.name.fa) : l.name.fa;
          return (
            <li key={l.id} className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-4 gap-y-3 p-4 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto_9.5rem] sm:items-center">
              <div className="relative row-span-2 aspect-square overflow-hidden rounded-[var(--radius-control)] border border-line-soft sm:row-span-1">
                {l.imageUrl ? (
                  <Image src={l.imageUrl} alt="" fill sizes="72px" className="bg-white object-contain p-1" />
                ) : (
                  <div className="media-placeholder grid h-full place-items-center text-steel"><ImageOff aria-hidden className="size-5" /></div>
                )}
              </div>
              <div className="min-w-0">
                <Link href={`/parts/${l.slug}`} className="font-bold leading-7 hover:text-action hover:underline">{name}</Link>
                <p className="text-xs text-steel">{t('parts.sku')}: <Code>{l.sku}</Code></p>
                <div className="mt-1"><Price price={l.unitPrice} /></div>
                {l.problems.map((p) => <p key={p} className="mt-1 text-sm font-medium text-danger">{t(`cart.problem_${p}`)}</p>)}
              </div>
              {/* Phones: quantity and line total share one row under the name; from sm each is its own column. */}
              <div className="col-start-2 flex flex-wrap items-end justify-between gap-3 sm:contents">
              <div className="flex items-center gap-2">
                <div className="flex h-11 items-stretch overflow-hidden rounded-[var(--radius-control)] border border-line-strong bg-white">
                  <button type="button" className="grid w-11 cursor-pointer place-items-center transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40" disabled={busy === l.id || l.quantity <= 1} onClick={() => change(l.id, l.quantity - 1)} aria-label={t('cart.decrease', { name })}>
                    <Minus aria-hidden className="size-4" />
                  </button>
                  <span className="num grid w-10 place-items-center border-x border-line text-center font-semibold" aria-live="polite">{locale === 'fa' ? l.quantity.toLocaleString('fa-IR') : l.quantity}</span>
                  <button type="button" className="grid w-11 cursor-pointer place-items-center transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40" disabled={busy === l.id || l.quantity >= l.maxOrderQuantity} onClick={() => change(l.id, l.quantity + 1)} aria-label={t('cart.increase', { name })}>
                    <Plus aria-hidden className="size-4" />
                  </button>
                </div>
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
      <aside className="flex h-fit flex-col gap-4 rounded-[var(--radius-card)] border border-line-soft bg-white p-5 lg:sticky lg:top-32">
        <div className="flex items-baseline justify-between gap-2 border-b border-line-soft pb-4">
          <span className="font-semibold">{t('cart.itemsTotal')}</span>
          <Money value={cart.itemsTotalPayableIrr} className="text-xl font-bold" />
        </div>
        <ul className="flex flex-col gap-2 text-xs leading-6 text-steel">
          <li className="flex gap-2"><Info aria-hidden className="mt-1 size-3.5 shrink-0" />{t('cart.noReservation')}</li>
          <li className="flex gap-2"><Info aria-hidden className="mt-1 size-3.5 shrink-0" />{t('cart.separateQuotes')}</li>
        </ul>
        {cart.canCheckout ? (
          <ButtonLink href="/checkout" size="lg">{t('cart.checkout')}</ButtonLink>
        ) : (
          <Alert tone="warning" title={t('checkout.blocker_CART_NOT_READY')} />
        )}
      </aside>
    </div>
  );
}
