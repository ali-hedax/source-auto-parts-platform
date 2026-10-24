'use client';

import type { UnitRef } from '@hedax/contracts';
import { formatQuantity } from '@hedax/domain';
import { ShoppingCart } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { QuantityStepper, firstAmount } from '@/components/commerce/quantity-stepper';
import { Button, ButtonLink } from '@/components/ui/button';
import { unitName } from '@/components/ui/format';
import { Alert } from '@/components/ui/misc';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';

/** Quantity in the product's unit (whole for «عدد», steps of 0.5 for «لیتر» …) and «افزودن به سبد». */
export function AddToCart({ productId, max, name, unit }: { productId: string; max: number; name: string; unit: UnitRef }) {
  const t = useTranslations();
  const locale = useLocale() as 'fa' | 'en';
  const [qty, setQty] = useState(Math.min(firstAmount(unit), max));
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
      <div className="flex flex-wrap items-start gap-3">
        <QuantityStepper id="qty" value={qty} onChange={setQty} unit={unit} max={max} name={name} />
        <Button variant="commerce" size="lg" className="min-w-48 flex-1 sm:flex-none" onClick={add} loading={state === 'adding'} icon={<ShoppingCart aria-hidden className="size-5" />}>
          {state === 'adding' ? t('parts.adding') : t('parts.addToCart')}
        </Button>
      </div>
      <p className="text-[0.8125rem] text-steel">
        {t('parts.maxQuantity', { max: formatQuantity(max, locale), unit: unitName(unit, locale) })}
        {unit.allowDecimal ? <> {t('parts.decimalStep', { step: formatQuantity(unit.step, locale), unit: unitName(unit, locale) })}</> : null}
      </p>
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
