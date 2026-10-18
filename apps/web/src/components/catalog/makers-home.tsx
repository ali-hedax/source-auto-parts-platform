import type { ManufacturerView } from '@hedax/contracts';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

/**
 * Home page → «مرور بر اساس برند سازنده»: the part brands (makers) that have published parts.
 * Not async, so the visual builder's live preview can render it in the browser as well.
 */
export function MakersHomeSection({ makers, title }: { makers: ManufacturerView[]; title?: string }) {
  const t = useTranslations();
  const locale = useLocale();
  if (!makers.length) return null;
  const Arrow = locale === 'fa' ? ArrowLeft : ArrowRight;
  const name = (n: { fa: string; en: string | null }) => (locale === 'en' ? (n.en ?? n.fa) : n.fa);
  return (
    <section aria-labelledby="makers-title" className="container-page render-lazy pt-14" data-testid="home-makers">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 id="makers-title" className="text-xl font-bold">{title || t('home.makersTitle')}</h2>
        <Link href="/parts" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-action hover:underline">
          {t('nav.parts')} <Arrow aria-hidden className="size-4" />
        </Link>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {makers.slice(0, 12).map((m) => (
          <li key={m.slug}>
            <Link href={`/parts?maker=${m.slug}`} className="flex h-full min-h-[4.5rem] flex-col justify-center gap-1 rounded-2xl border border-[#e1eaf5] bg-white px-4 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-action">
              <span className="font-bold leading-6">{name(m.name)}</span>
              <span className="text-xs text-steel">{t('common.partCount', { count: m.productCount })}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
