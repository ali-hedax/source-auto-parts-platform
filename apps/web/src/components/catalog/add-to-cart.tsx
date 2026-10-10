'use client';

import { Minus, Plus, ShoppingCart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Alert } from '@/components/ui/misc';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';
import { typedNumber } from '@/lib/numbers';

export function AddToCart({ productId, max, name }: { productId: string; max: number; name: string }) {
  const t = useTranslations();
  const [qty, setQty] = useState(1);
  const [state, setState] = useState<'idle' | 'adding' | 'added' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    setState('adding');
    setError(null);
    try {
      await api('/cart/items', { method: 'POST', body: { productId, quantity: qty } });
      setState('added');
      window.dispatchEvent(new Event('hedax:cart-changed'));
    } catch (e) {
      setState('error');
      setError(errorText(t, e));
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-stretch gap-3">
        <div className="flex h-12 items-stretch overflow-hidden rounded-[var(--radius-control)] border border-line-strong bg-white" role="group" aria-label={t('parts.quantity')}>
          <button type="button" className="grid w-11 cursor-pointer place-items-center transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label={t('cart.decrease', { name })}>
            <Minus aria-hidden className="size-4" />
          </button>
          <label htmlFor="qty" className="sr-only">{t('parts.quantity')}</label>
          <input
            id="qty"
            inputMode="numeric"
            className="num w-14 border-x border-line text-center font-semibold"
            value={qty}
            onChange={(e) => {
              const n = typedNumber(e.target.value);
              if (Number.isInteger(n)) setQty(Math.min(Math.max(1, n), max));
            }}
          />
          <button type="button" className="grid w-11 cursor-pointer place-items-center transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40" onClick={() => setQty((q) => Math.min(max, q + 1))} disabled={qty >= max} aria-label={t('cart.increase', { name })}>
            <Plus aria-hidden className="size-4" />
          </button>
        </div>
        <Button size="lg" className="min-w-48 flex-1 sm:flex-none" onClick={add} loading={state === 'adding'} icon={<ShoppingCart aria-hidden className="size-5" />}>
          {state === 'adding' ? t('parts.adding') : t('parts.addToCart')}
        </Button>
      </div>
      <p className="text-[0.8125rem] text-steel">{t('parts.maxQuantity', { max })}</p>
      <div aria-live="polite">
        {state === 'added' ? (
          <Alert tone="success" title={t('parts.added')}>
            <ButtonLink href="/cart" variant="secondary" size="sm" className="mt-2">
              {t('parts.viewCart')}
            </ButtonLink>
          </Alert>
        ) : null}
        {state === 'error' && error ? <Alert tone="danger" title={error} /> : null}
      </div>
    </div>
  );
}
