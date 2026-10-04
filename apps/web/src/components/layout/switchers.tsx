'use client';

import { Languages } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useRouter as useNextRouter } from 'next/navigation';

/** Switches language on the same page (keeps path and query), not back to home (spec §15). */
export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const [pending, start] = useTransition();
  const t = useTranslations('common');
  const target = locale === 'fa' ? 'en' : 'fa';
  return (
    <button
      type="button"
      lang={target}
      disabled={pending}
      onClick={() => start(() => router.replace(`${pathname}${search.size ? `?${search.toString()}` : ''}`, { locale: target }))}
      className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded px-2 text-sm font-semibold hover:bg-white/10"
      aria-label={`${t('language')}: ${target === 'en' ? 'English' : 'فارسی'}`}
    >
      <Languages aria-hidden className="size-4" />
      <span>{target === 'en' ? 'EN' : 'فا'}</span>
    </button>
  );
}

/** Display currency only; the payable amount is always IRR and computed on the server. */
export function CurrencySwitcher({ initial }: { initial: 'IRR' | 'AED' }) {
  const t = useTranslations('common');
  const tp = useTranslations('price');
  const router = useNextRouter();
  return (
    <label className="inline-flex min-h-11 items-center gap-1 text-sm">
      <span className="sr-only">{t('currency')}</span>
      <select
        defaultValue={initial}
        onChange={(e) => {
          document.cookie = `hedax_currency=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
          router.refresh();
        }}
        className="min-h-9 cursor-pointer rounded border border-carbon-2 bg-carbon px-2 font-semibold text-silver"
      >
        <option value="IRR">{tp('IRR')}</option>
        <option value="AED">{tp('AED')}</option>
      </select>
    </label>
  );
}
