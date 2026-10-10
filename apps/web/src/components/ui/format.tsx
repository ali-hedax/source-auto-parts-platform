'use client';

import type { MoneyDto, PriceView } from '@hedax/contracts';
import { currencyLabel, formatDateTime, formatMinorNumber, money, toPersianDigits } from '@hedax/domain';
import { useLocale, useTranslations } from 'next-intl';

/**
 * Money is always rendered from the string minor-unit contract with its explicit unit.
 * The figure carries the weight; the unit stays beside it in the reading order of the
 * language («۱۸٬۵۰۰٬۰۰۰ ریال», "IRR 18,500,000"), slightly smaller so long amounts scan.
 */
export function Money({ value, className }: { value: MoneyDto | null | undefined; className?: string }) {
  const locale = useLocale() as 'fa' | 'en';
  if (!value) return <span className={className}>—</span>;
  const amount = money(value.currency, value.amountMinor);
  const figure = <span className="num">{formatMinorNumber(amount.minor, amount.currency, locale)}</span>;
  const unit = <span className="text-[0.8em] font-medium opacity-80">{currencyLabel(amount.currency, locale)}</span>;
  return (
    <bdi className={`whitespace-nowrap ${className ?? ''}`} dir={locale === 'fa' ? 'rtl' : 'ltr'}>
      {locale === 'fa' ? <>{figure} {unit}</> : <>{unit} {figure}</>}
    </bdi>
  );
}

export function Price({ price, size = 'md' }: { price: PriceView; size?: 'md' | 'lg' }) {
  const t = useTranslations('price');
  if (price.kind === 'inquiry') {
    return <span className="text-sm font-semibold leading-6 text-steel">{price.reason === 'NO_VALID_FX_RATE' ? t('inquiryNoRate') : t('inquiry')}</span>;
  }
  return (
    <span className="flex flex-col gap-0.5">
      <Money value={price.display} className={size === 'lg' ? 'text-[1.75rem] font-bold leading-tight' : 'text-lg font-bold leading-7'} />
      {price.displayIsReference ? (
        <span className="text-xs leading-5 text-steel">
          {t('referenceHint')}: <Money value={price.payable} className="font-semibold text-ink" />
        </span>
      ) : null}
    </span>
  );
}

export function DateTime({ iso, withTime = true }: { iso: string | null | undefined; withTime?: boolean }) {
  const locale = useLocale() as 'fa' | 'en';
  if (!iso) return <span>—</span>;
  return <time dateTime={iso}>{formatDateTime(new Date(iso), locale, withTime)}</time>;
}

/**
 * Separator between values on one line. Persian uses «، »: a middle dot beside Persian digits
 * reads as the digit zero «۰» («۱ · ۴٬۸۰۰٬۰۰۰» looks like «۱۰۴٬۸۰۰٬۰۰۰»).
 */
export function useListSeparator(): string {
  return useLocale() === 'fa' ? '، ' : ' · ';
}

export function Num({ value }: { value: number | string }) {
  const locale = useLocale();
  const text = String(value);
  return <span className="num">{locale === 'fa' ? toPersianDigits(text) : text}</span>;
}

export function formatBytes(bytes: number, locale: string): string {
  const mb = bytes / (1024 * 1024);
  const text = mb >= 1 ? `${Math.round(mb)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return locale === 'fa' ? toPersianDigits(text).replace('MB', 'مگابایت').replace('KB', 'کیلوبایت') : text;
}
