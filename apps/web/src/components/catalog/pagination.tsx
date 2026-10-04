import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export async function Pagination({ pathname, params, page, pageSize, total }: { pathname: string; params: Record<string, string | undefined>; page: number; pageSize: number; total: number }) {
  const t = await getTranslations('common');
  const locale = await getLocale();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const qs = new URLSearchParams(Object.entries({ ...params, page: p > 1 ? String(p) : undefined }).filter((e): e is [string, string] => !!e[1]));
    return `${pathname}${qs.size ? `?${qs.toString()}` : ''}`;
  };
  const Prev = locale === 'fa' ? ChevronRight : ChevronLeft;
  const Next = locale === 'fa' ? ChevronLeft : ChevronRight;
  const label = t('page', { page, total: pages });
  const link = 'inline-flex min-h-11 items-center gap-1 rounded border border-line px-4 font-semibold hover:bg-surface';
  return (
    <nav aria-label={label} className="mt-8 flex items-center justify-center gap-3">
      {page > 1 ? (
        <Link href={href(page - 1)} className={link} rel="prev">
          <Prev aria-hidden className="size-4" />
          {t('previous')}
        </Link>
      ) : null}
      <span aria-current="page" className="text-sm text-steel">{label}</span>
      {page < pages ? (
        <Link href={href(page + 1)} className={link} rel="next">
          {t('next')}
          <Next aria-hidden className="size-4" />
        </Link>
      ) : null}
    </nav>
  );
}
