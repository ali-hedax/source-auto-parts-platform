import type { CategoryView, ContentButton, HomeSection, SearchResult, VehicleBrandView } from '@hedax/contracts';
import { localize } from '@hedax/contracts/constants';
import { ArrowLeft, ArrowRight, Plus, Search } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { RichText } from '@/components/content/rich-text';
import { ButtonLink, buttonClass } from '@/components/ui/button';
import { PartCard } from '@/components/catalog/part-card';
import { EmptyState } from '@/components/ui/misc';
import { Link } from '@/i18n/navigation';
import { serverApi } from '@/lib/api/server';
import { displayCurrency } from '@/lib/preferences';
import { getSiteContent, seoMetadata } from '@/lib/site-content';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const content = await getSiteContent();
  // The home page keeps the site title unless SEO → home page sets its own.
  const meta = seoMetadata(content, 'home', locale);
  return meta.title ? { ...meta, title: { absolute: String(meta.title) } } : meta;
}

type Variant = 'primary' | 'secondary' | 'onDark';

/** A button from site content: a page of this site, or an external address in a new tab. */
function ContentButtonLink({ button, locale, variant = 'primary', size = 'md', className }: { button: ContentButton; locale: string; variant?: Variant; size?: 'md' | 'lg'; className?: string }) {
  const label = localize(button.label, locale);
  if (!label || !button.href) return null;
  if (button.href.startsWith('/')) return <ButtonLink href={button.href} variant={variant} size={size} {...(className ? { className } : {})}>{label}</ButtonLink>;
  return <a href={button.href} className={buttonClass(variant, size, className)} {...(/^https?:/i.test(button.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{label}</a>;
}

/**
 * Home page. Every text, button and picture comes from site content → home page, in the order and
 * visibility set there; the catalog parts (categories, brands, parts) come from the catalog.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const currency = await displayCurrency();
  const [content, featured, brands, categories] = await Promise.all([
    getSiteContent(),
    serverApi<SearchResult>(`/catalog/products?inStock=1&pageSize=8&currency=${currency}`, { publicCache: 60 }).catch(() => null),
    serverApi<VehicleBrandView[]>('/catalog/vehicle-brands', { publicCache: 300 }).catch(() => []),
    serverApi<CategoryView[]>('/catalog/categories', { publicCache: 300 }).catch(() => []),
  ]);
  if (!content) {
    return <div className="container-page py-12"><EmptyState title={t('pages.errorHint')} /></div>;
  }
  const L = (text: Parameters<typeof localize>[0]) => localize(text, locale);
  const Arrow = locale === 'fa' ? ArrowLeft : ArrowRight;
  const name = (n: { fa: string; en: string | null }) => (locale === 'en' ? (n.en ?? n.fa) : n.fa);
  const digits = (n: number) => n.toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US');
  const topCategories = categories.filter((c) => !c.parentSlug);

  const render = (section: HomeSection): ReactNode => {
    switch (section.type) {
      case 'hero': {
        const s = section;
        const steps = s.steps.map((step) => ({ title: L(step.title), text: L(step.text) }));
        return (
          // The two ways to buy, side by side: search the stock, or hand the search to Source.
          <section key={s.id} className="on-dark relative isolate overflow-hidden bg-carbon text-silver">
            {s.imageUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- decorative background chosen in the panel */}
                <img src={s.imageUrl} alt="" aria-hidden className="absolute inset-0 -z-10 size-full object-cover" />
                <span aria-hidden className="absolute inset-0 -z-10 bg-carbon/80" />
              </>
            ) : null}
            <div className={`container-page grid gap-8 py-10 lg:gap-12 lg:py-14 ${s.showProcess && steps.length ? 'lg:grid-cols-[minmax(0,1fr)_23rem]' : ''}`}>
              <div className="min-w-0">
                <h1 className="max-w-2xl text-[1.75rem] font-bold text-white sm:text-4xl lg:text-[2.625rem]">{L(s.title)}</h1>
                {L(s.text) ? <p className="mt-4 max-w-2xl leading-8 text-silver/90 sm:text-lg sm:leading-8">{L(s.text)}</p> : null}
                <form action={`/${locale}/parts`} method="get" role="search" className="mt-8 max-w-2xl">
                  <label htmlFor="hero-search" className="mb-2 block text-sm font-semibold text-white">{t('search.label')}</label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative min-w-0 flex-1">
                      <Search aria-hidden className="pointer-events-none absolute inset-y-0 start-4 my-auto size-5 text-steel" />
                      <input id="hero-search" name="q" type="search" required placeholder={t('search.placeholder')} aria-describedby="hero-search-hint"
                        className="h-14 w-full rounded-[var(--radius-control)] border border-transparent bg-white ps-12 pe-4 text-base text-ink placeholder:text-steel/80" />
                    </div>
                    <button type="submit" className="inline-flex h-14 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] bg-action px-6 font-semibold text-white transition-colors hover:bg-action-hover active:bg-action-hover">
                      {L(s.searchButton)}
                    </button>
                  </div>
                  <p id="hero-search-hint" className="mt-2 text-sm leading-6 text-silver/80">{t('search.hint')}</p>
                </form>
                {s.showCategories && topCategories.length ? (
                  <nav aria-labelledby="categories-title" className="mt-7 max-w-2xl">
                    <h2 id="categories-title" className="mb-2.5 text-sm font-semibold text-white">{L(s.categoriesTitle)}</h2>
                    <ul className="flex flex-wrap gap-2">
                      {topCategories.map((c) => (
                        <li key={c.slug}>
                          <Link href={`/parts?category=${c.slug}`} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 px-4 text-sm font-medium text-silver transition-colors hover:border-white/45 hover:text-white">
                            {name(c.name)}
                            <span className="num text-xs text-silver/70">{digits(c.productCount)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </nav>
                ) : null}
              </div>

              {s.showProcess && steps.length ? (
                <section aria-labelledby="process-title" className="self-start rounded-[var(--radius-panel)] border border-white/10 bg-carbon-3 p-5 sm:p-6">
                  <h2 id="process-title" className="text-lg font-bold text-white">{L(s.processTitle)}</h2>
                  <ol className="mt-5">
                    {steps.map((step, i) => (
                      <li key={`${i}-${step.title}`} className="relative flex gap-3.5 pb-5 last:pb-0">
                        {i < steps.length - 1 ? <span aria-hidden className="absolute bottom-1 start-3.5 top-9 w-px bg-white/15" /> : null}
                        <span aria-hidden className="num grid size-7 shrink-0 place-items-center rounded-full border border-tech-light/70 text-xs font-bold text-tech-light">{digits(i + 1)}</span>
                        <div className="min-w-0">
                          <h3 className="font-semibold leading-7 text-white">{step.title}</h3>
                          {step.text ? <p className="text-sm leading-6 text-silver/80">{step.text}</p> : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                  <ContentButtonLink button={s.processButton} locale={locale} variant="onDark" size="lg" className="mt-6 w-full" />
                </section>
              ) : null}
            </div>
          </section>
        );
      }
      case 'brands': {
        const s = section;
        return (
          <section key={s.id} aria-labelledby="brands-title" className="container-page render-lazy pt-12">
            <div className="mb-4 flex items-end justify-between gap-4">
              <h2 id="brands-title" className="text-xl font-bold">{L(s.title)}</h2>
              <Link href="/brands" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-action hover:underline">
                {t('nav.brands')} <Arrow aria-hidden className="size-4" />
              </Link>
            </div>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {brands.filter((b) => b.isFeatured).map((b) => (
                <li key={b.slug}>
                  <Link href={`/brands/${b.slug}`} className="flex h-full min-h-[4.5rem] flex-col justify-center gap-0.5 rounded-[var(--radius-card)] border border-line-soft bg-white px-4 py-3 transition-colors hover:border-line-strong hover:bg-surface">
                    <span className="font-bold leading-7">{name(b.name)}</span>
                    <span className="text-xs text-steel">{t('common.partCount', { count: b.productCount })}</span>
                  </Link>
                </li>
              ))}
              {L(s.otherTitle) && s.otherHref ? (
                <li>
                  <Link href={s.otherHref} className="flex h-full min-h-[4.5rem] flex-col justify-center gap-0.5 rounded-[var(--radius-card)] border border-dashed border-line-strong px-4 py-3 transition-colors hover:border-action hover:bg-action-soft">
                    <span className="font-bold leading-7 text-action">{L(s.otherTitle)}</span>
                    {L(s.otherText) ? <span className="text-xs leading-5 text-steel">{L(s.otherText)}</span> : null}
                  </Link>
                </li>
              ) : null}
            </ul>
          </section>
        );
      }
      case 'featured': {
        const s = section;
        return (
          <section key={s.id} aria-labelledby="featured-title" className="container-page render-lazy pt-12">
            <div className="mb-4 flex items-end justify-between gap-4">
              <h2 id="featured-title" className="text-xl font-bold">{L(s.title)}</h2>
              <Link href="/parts" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-action hover:underline">
                {t('nav.parts')} <Arrow aria-hidden className="size-4" />
              </Link>
            </div>
            {featured && featured.items.length ? (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
                {featured.items.map((p, i) => (
                  <li key={p.id}><PartCard product={p} priority={i < 2} /></li>
                ))}
              </ul>
            ) : (
              <EmptyState title={L(s.emptyText)}>
                <ContentButtonLink button={s.emptyButton} locale={locale} variant="secondary" className="mt-2" />
              </EmptyState>
            )}
          </section>
        );
      }
      case 'faq': {
        const s = section;
        if (!content.faq.length) return null;
        return (
          <section key={s.id} aria-labelledby="faq-title" className="container-page render-lazy pt-14">
            <div className="grid gap-6 lg:grid-cols-[18rem_1fr] lg:gap-12">
              <h2 id="faq-title" className="text-xl font-bold">{L(s.title)}</h2>
              <div className="divide-y divide-line-soft border-y border-line-soft">
                {content.faq.map((f) => (
                  <details key={f.id} className="group">
                    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-semibold leading-7 marker:hidden hover:text-action [&::-webkit-details-marker]:hidden">
                      {L(f.question)}
                      <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full border border-line text-steel transition-transform duration-200 group-open:rotate-45"><Plus className="size-4" /></span>
                    </summary>
                    <div className="max-w-3xl pb-4 text-steel"><RichText text={L(f.answer)} /></div>
                  </details>
                ))}
              </div>
            </div>
          </section>
        );
      }
      case 'text': {
        const s = section;
        const title = L(s.title);
        const body = L(s.body);
        return (
          <section key={s.id} {...(title ? { 'aria-label': title } : {})} className="container-page render-lazy pt-12">
            <div className={`grid gap-6 ${s.imageUrl ? 'md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-center' : ''}`}>
              <div className="min-w-0">
                {title ? <h2 className="mb-3 text-xl font-bold">{title}</h2> : null}
                {body ? <RichText text={body} className="max-w-3xl space-y-3 leading-8 text-steel" /> : null}
                <ContentButtonLink button={s.button} locale={locale} variant="secondary" className="mt-5" />
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- picture chosen in the panel */}
              {s.imageUrl ? <img src={s.imageUrl} alt="" loading="lazy" className="w-full rounded-[var(--radius-card)] object-cover" /> : null}
            </div>
          </section>
        );
      }
    }
  };

  return <>{content.home.sections.filter((s) => s.visible).map(render)}</>;
}

