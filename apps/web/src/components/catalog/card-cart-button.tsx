'use client';

import type { CartView, UnitRef } from '@hedax/contracts';
import { Check, Loader2, ShoppingCart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { firstAmount } from '@/components/commerce/quantity-stepper';
import { api } from '@/lib/api/client';
import { cartChanged } from '@/lib/cart-count';
import { errorText } from '@/lib/api/errors';

/** «افزودن به سبد» on a card: the same CSRF-protected cart call and sales-unit rules as the product page. */
export function CardCartButton({ productId, name, unit }: { productId: string; name: string; unit: UnitRef }) {
  const t = useTranslations();
  const busy = useRef(false);
  const [state, setState] = useState<'idle' | 'adding' | 'added' | 'error'>('idle');
  const [error, setError] = useState('');
  const [atLimit, setAtLimit] = useState(false);
  async function add() {
    if (busy.current) return;
    busy.current = true;
    setState('adding'); setError('');
    try {
      const cart = await api<CartView>('/cart/items', { method: 'POST', body: { productId, quantity: firstAmount(unit) } });
      const line = cart.lines.find((l) => l.productId === productId);
      setAtLimit(Boolean(line && line.quantity >= line.maxOrderQuantity));
      setState('added'); cartChanged(cart);
    } catch (e) { setState('error'); setError(errorText(t, e)); }
    finally { busy.current = false; }
  }
  return <div className="su-card-buy">
    <button type="button" className="su-btn su-btn-primary su-btn-block" onClick={add} disabled={state === 'adding'} aria-busy={state === 'adding' || undefined} aria-label={`${state === 'adding' ? t('parts.adding') : t('parts.addToCart')}: ${name}`}>
      {state === 'adding' ? <Loader2 aria-hidden size={18} className="animate-spin" /> : state === 'added' ? <Check aria-hidden size={18} /> : <ShoppingCart aria-hidden size={18} />}
      <span aria-hidden>{state === 'added' ? t('parts.added') : t('parts.addToCart')}</span>
    </button>
    <div className="su-card-feedback" aria-live="polite" aria-atomic="true">
      {state === 'added' ? <p>{atLimit ? t('parts.addedAtLimit') : null} <Link href="/cart">{t('parts.viewCart')}</Link></p> : null}
      {state === 'error' ? <p role="alert" className="su-card-error">{error}</p> : null}
    </div>
  </div>;
}
