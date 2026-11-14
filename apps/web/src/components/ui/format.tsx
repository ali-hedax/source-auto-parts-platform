'use client';

import type { MoneyDto, PriceView, UnitRef } from '@hedax/contracts';
import { currencyLabel, formatDateTime, formatMinorNumber, formatQuantity, money, toPersianDigits } from '@hedax/domain';
import { useLocale, useTranslations } from 'next-intl';
import { useMoneyUnit } from '@/lib/money-unit';

export const tomanLabel = (locale: 'fa' | 'en') => (locale === 'fa' ? 'تومان' : 'Toman');

/** A rial amount as Toman with grouped digits; a rial remainder shows as one decimal («۱۲٬۵۰۰٫۵»). */
export function formatToman(rial: bigint, locale: 'fa' | 'en'): string {
  const negative = rial < 0n;
  const abs = negative ? -rial : rial;
  const whole = new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-US', { useGrouping: true }).format(abs / 10n);
  const rest = abs % 10n;
  const fraction = rest ? `${locale === 'fa' ? '٫' : '.'}${locale === 'fa' ? toPersianDigits(rest.toString()) : rest.toString()}` : '';
  return `${negative ? (locale === 'fa' ? '−' : '-') : ''}${whole}${fraction}`;
}

/**
 * Money is always rendered from the string minor-unit contract with its explicit unit.
 * The figure carries the weight; the unit stays beside it in the reading order of the
 * language («۱۸٬۵۰۰٬۰۰۰ ریال», "IRR 18,500,000"), slightly smaller so long amounts scan.
 */
export function Money({ value, className }: { value: MoneyDto | null | undefined; className?: string }) {
  const locale = useLocale() as 'fa' | 'en';
  const shownUnit = useMoneyUnit();
  if (!value) return <span className={className}>—</span>;
  const amount = money(value.currency, value.amountMinor);
  // Storefront default: rial amounts are printed as Toman (÷10); the amount itself stays rial.
  const toman = shownUnit === 'IRT' && amount.currency === 'IRR';
  const figure = <span className="num">{toman ? formatToman(amount.minor, locale) : formatMinorNumber(amount.minor, amount.currency, locale)}</span>;
  const unit = <span className="money-unit text-[0.8em] font-medium opacity-80">{toman ? tomanLabel(locale) : currencyLabel(amount.currency, locale)}</span>;
  return (
    <bdi className={`whitespace-nowrap ${className ?? ''}`} dir={locale === 'fa' ? 'rtl' : 'ltr'}>
      {locale === 'fa' ? <>{figure} {unit}</> : <>{unit} {figure}</>}
    </bdi>
  );
}

/** The name of a sales unit in the page's language («دست» / "set"). */
export function unitName(unit: Pick<UnitRef, 'name' | 'nameEn'> | { name: string; nameEn?: string | null }, locale: string): string {
  return locale === 'en' ? (unit.nameEn || unit.name) : unit.name;
}

/** An amount with its unit: «۱٫۵ لیتر», "2 set". */
export function Quantity({ value, unit, className }: { value: number; unit: { name: string; nameEn?: string | null }; className?: string }) {
  const locale = useLocale() as 'fa' | 'en';
  return (
    <span className={`whitespace-nowrap ${className ?? ''}`}>
      <span className="num">{formatQuantity(value, locale)}</span> {unitName(unit, locale)}
    </span>
  );
}

/** `unit`: the price is per this unit and shown as «۲۵۰٬۰۰۰ تومان / دست». */
export function Price({ price, size = 'md', unit }: { price: PriceView; size?: 'md' | 'lg'; unit?: Pick<UnitRef, 'name' | 'nameEn'> }) {
  const t = useTranslations('price');
  const locale = useLocale();
  if (price.kind === 'inquiry') {
    return <span className="text-sm font-semibold leading-6 text-steel">{price.reason === 'NO_VALID_FX_RATE' ? t('inquiryNoRate') : t('inquiry')}</span>;
  }
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex flex-wrap items-baseline gap-x-1.5">
        <Money value={price.display} className={size === 'lg' ? 'text-[1.75rem] font-bold leading-tight' : 'text-lg font-bold leading-7'} />
        {unit ? <span className={`${size === 'lg' ? 'text-base' : 'text-sm'} font-medium text-steel`} data-testid="price-unit">/ {unitName(unit, locale)}</span> : null}
      </span>
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
