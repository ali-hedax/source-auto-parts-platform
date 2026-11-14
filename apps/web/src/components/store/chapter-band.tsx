import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';

export interface Crumb { href?: string; label: string }

/**
 * The top of every shopping page: the page's title on the home film's dark ground, handing over to the light
 * canvas below. Server markup only (no client code). `compact` is the slim version above a product.
 */
export function ChapterBand({ title, eyebrow, description, crumbs, locale, compact = false, children, titleAs = 'h1' }: {
  title?: ReactNode; eyebrow?: string; description?: ReactNode; crumbs?: Crumb[]; locale: string; compact?: boolean; children?: ReactNode; titleAs?: 'h1' | 'p';
}) {
  const Chevron = locale === 'fa' ? ChevronLeft : ChevronRight;
  const Title = titleAs;
  return (
    <section className="store-band" data-store-band>
      <div className={`container-page ${compact ? 'pt-5 pb-1' : 'pt-8 pb-2 md:pt-12'}`}>
        {crumbs?.length ? (
          <nav aria-label="breadcrumb" className="mb-3 text-sm text-mist">
            <ol className="flex flex-wrap items-center gap-1.5">
              {crumbs.map((c, i) => (
                <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
                  {i ? <Chevron aria-hidden className="size-3.5 opacity-70" /> : null}
                  {c.href ? <Link href={c.href} className="underline-offset-4 hover:text-white hover:underline">{c.label}</Link> : <span aria-current="page" className="text-paper">{c.label}</span>}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        {eyebrow ? <p className="store-eyebrow mb-2"><span dir="ltr">{eyebrow}</span></p> : null}
        {title ? <Title className={`${compact ? 'text-xl md:text-2xl' : 'text-[clamp(1.75rem,3.4vw,2.75rem)]'} font-extrabold leading-tight tracking-tight text-white`}>{title}</Title> : null}
        {description ? <div className="mt-3 max-w-3xl leading-8 text-mist">{description}</div> : null}
        {children}
      </div>
    </section>
  );
}
