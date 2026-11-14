import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';

export interface Crumb { href?: string; label: string }

/**
 * The top of every shopping page: the page's title on the home film's dark ground, handing over to the light
 * canvas below. Server markup only (no client code). `compact` is the slim version above a product.
 */
export function ChapterBand({ title, description, crumbs, locale, compact = false, children, titleAs = 'h1' }: {
  title?: ReactNode; /** Kept for callers; the decorative Latin label is no longer shown (owner, 2026-11). */ eyebrow?: string; description?: ReactNode; crumbs?: Crumb[]; locale: string; compact?: boolean; children?: ReactNode; titleAs?: 'h1' | 'p';
}) {
  const Chevron = locale === 'fa' ? ChevronLeft : ChevronRight;
  const Title = titleAs;
  return (
    <section className="store-band" data-store-band>
      <div className={`container-page ${compact ? 'pt-4 pb-1' : 'pt-6 pb-2 md:pt-8'}`}>
        {crumbs?.length ? (
          <nav aria-label={locale === 'fa' ? 'مسیر صفحه' : 'Breadcrumb'} className="su-breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5">
              {crumbs.map((c, i) => (
                <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
                  {i ? <Chevron aria-hidden className="size-3.5 opacity-70" /> : null}
                  {c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        {title ? <Title className="su-page-title">{title}</Title> : null}
        {description ? <div className="su-page-lede">{description}</div> : null}
        {children}
      </div>
    </section>
  );
}
