'use client';

import type { UnitRef } from '@hedax/contracts';
import { formatQuantity, isValidQuantity } from '@hedax/domain';
import { Minus, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { unitName } from '@/components/ui/format';
import { typedNumber } from '@/lib/numbers';

/** Adds `n` steps without floating-point drift (0.1 + 0.2). */
export const addSteps = (value: number, unit: Pick<UnitRef, 'step'>, n: number) => Math.round(value * 1000 + n * unit.step * 1000) / 1000;

/** The first amount offered: 1 when the unit sells whole units of 1, otherwise one step. */
export const firstAmount = (unit: Pick<UnitRef, 'step'>) => (unit.step <= 1 && 1000 % Math.round(unit.step * 1000) === 0 ? 1 : unit.step);

/**
 * − [amount] + with the unit beside it. Buttons move by the unit's step (0.5 litre); typing is
 * accepted when the amount suits the unit (decimals only where allowed, a multiple of the step).
 */
export function QuantityStepper({ id, value, onChange, unit, max, name, disabled = false, height = 'h-12' }: {
  id: string; value: number; onChange: (v: number) => void; unit: UnitRef; max: number; name: string; disabled?: boolean; height?: string;
}) {
  const t = useTranslations();
  const locale = useLocale() as 'fa' | 'en';
  const [text, setText] = useState(formatQuantity(value, locale));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setText(formatQuantity(value, locale)); setInvalid(false); }, [value, locale]);
  const rule = { name: unit.name, allowDecimal: unit.allowDecimal, stepMilli: Math.round(unit.step * 1000) };
  const commit = () => {
    const n = typedNumber(text.replace('/', '.'));
    if (Number.isFinite(n) && n > 0 && isValidQuantity(n, rule)) {
      const next = Math.min(n, max);
      setInvalid(false);
      if (next !== value) onChange(next);
      else setText(formatQuantity(value, locale));
    } else {
      setInvalid(true);
    }
  };
  const stepLabel = formatQuantity(unit.step, locale);
  const uName = unitName(unit, locale);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className={`flex ${height} items-stretch overflow-hidden rounded-[var(--radius-control)] border ${invalid ? 'border-danger' : 'border-line-strong'} bg-white`} role="group" aria-label={t('parts.quantity')}>
          <button type="button" className="grid w-11 cursor-pointer place-items-center transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40" onClick={() => onChange(addSteps(value, unit, -1))} disabled={disabled || addSteps(value, unit, -1) <= 0} aria-label={t('cart.decrease', { name })}>
            <Minus aria-hidden className="size-4" />
          </button>
          <label htmlFor={id} className="sr-only">{`${t('parts.quantity')} (${uName})`}</label>
          <input
            id={id}
            inputMode={unit.allowDecimal ? 'decimal' : 'numeric'}
            className="num w-16 border-x border-line text-center font-semibold"
            value={text}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${id}-error` : undefined}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
          />
          <button type="button" className="grid w-11 cursor-pointer place-items-center transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40" onClick={() => onChange(Math.min(max, addSteps(value, unit, 1)))} disabled={disabled || addSteps(value, unit, 1) > max} aria-label={t('cart.increase', { name })}>
            <Plus aria-hidden className="size-4" />
          </button>
        </div>
        <span className="text-sm font-medium text-steel">{uName}</span>
      </div>
      {invalid ? <p id={`${id}-error`} role="alert" className="text-sm text-danger">{t('parts.quantityInvalid', { step: stepLabel, unit: uName })}</p> : null}
    </div>
  );
}
