'use client';

import type { UnitRef } from '@hedax/contracts';
import { Check, Loader2, ShoppingCart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { firstAmount } from '@/components/commerce/quantity-stepper';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';

/** Uses the same CSRF-protected cart and sales-unit rules as the detail page. */
export function CardCartButton({ productId, name, unit }: { productId: string; name: string; unit: UnitRef }) {
  const t = useTranslations();
  const busy = useRef(false);
  const [state, setState] = useState<'idle' | 'adding' | 'added' | 'error'>('idle');
  const [error, setError] = useState('');
  async function add() {
    if (busy.current) return;
    busy.current = true;
    setState('adding'); setError('');
    try {
      await api('/cart/items', { method: 'POST', body: { productId, quantity: firstAmount(unit) } });
      setState('added'); window.dispatchEvent(new Event('hedax:cart-changed'));
    } catch (e) { setState('error'); setError(errorText(t, e)); }
    finally { busy.current = false; }
  }
  return <div className="part-card-purchase">
    <button type="button" className="part-card-cart" onClick={add} disabled={state === 'adding'} aria-busy={state === 'adding' || undefined} aria-label={`${state === 'adding' ? t('parts.adding') : t('parts.addToCart')}: ${name}`} title={t('parts.addToCart')}>
      {state === 'adding' ? <Loader2 aria-hidden className="size-6 animate-spin" /> : state === 'added' ? <Check aria-hidden className="size-6" /> : <ShoppingCart aria-hidden className="size-6" fill="currentColor" strokeWidth={1.6} />}
    </button>
    <div className="part-card-feedback" aria-live="polite" aria-atomic="true">
      {state === 'added' ? <p>{t('parts.added')} <Link href="/cart">{t('parts.viewCart')}</Link></p> : null}
      {state === 'error' ? <p role="alert" className="part-card-error">{error}</p> : null}
    </div>
  </div>;
}
