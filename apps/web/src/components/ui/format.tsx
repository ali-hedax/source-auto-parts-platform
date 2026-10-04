'use client';

import type { MoneyDto, PriceView } from '@hedax/contracts';
import { formatDateTime, formatMoney, money, toPersianDigits } from '@hedax/domain';
import { useLocale, useTranslations } from 'next-intl';

/** Money is always rendered from the string minor-unit contract with its explicit unit. */
export function Money({ value, className }: { value: MoneyDto | null | undefined; className?: string }) {
  const locale = useLocale() as 'fa' | 'en';
  if (!value) return <span className={className}>—</span>;
  return (
    <bdi className={className} dir={locale === 'fa' ? 'rtl' : 'ltr'}>
      <span className="num">{formatMoney(money(value.currency, value.amountMinor), locale)}</span>
    </bdi>
  );
}

export function Price({ price, size = 'md' }: { price: PriceView; size?: 'md' | 'lg' }) {
  const t = useTranslations('price');
  if (price.kind === 'inquiry') {
    return <span className="text-sm font-semibold text-steel">{price.reason === 'NO_VALID_FX_RATE' ? t('inquiryNoRate') : t('inquiry')}</span>;
  }
  return (
    <span className="flex flex-col">
      <Money value={price.display} className={size === 'lg' ? 'text-2xl font-bold' : 'text-lg font-bold'} />
      {price.displayIsReference ? (
        <span className="text-xs text-steel">
          {t('referenceHint')}: <Money value={price.payable} />
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
