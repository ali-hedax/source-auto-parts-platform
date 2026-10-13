import type { CategoryView, SearchResult, VehicleBrandView } from '@hedax/contracts';
import { ArrowLeft, ArrowRight, Plus, Search } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/button';
import { PartCard } from '@/components/catalog/part-card';
import { EmptyState } from '@/components/ui/misc';
import { Link } from '@/i18n/navigation';
import { serverApi } from '@/lib/api/server';
import { displayCurrency } from '@/lib/preferences';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const currency = await displayCurrency();
  const [featured, brands, categories] = await Promise.all([
    serverApi<SearchResult>(`/catalog/products?inStock=1&pageSize=8&currency=${currency}`, { publicCache: 60 }).catch(() => null),
    serverApi<VehicleBrandView[]>('/catalog/vehicle-brands', { publicCache: 300 }).catch(() => []),
    serverApi<CategoryView[]>('/catalog/categories', { publicCache: 300 }).catch(() => []),
  ]);
  const Arrow = locale === 'fa' ? ArrowLeft : ArrowRight;
  const name = (n: { fa: string; en: string | null }) => (locale === 'en' ? (n.en ?? n.fa) : n.fa);
  const digits = (n: number) => n.toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US');
  const steps = [
    { title: t('home.step1'), text: t('home.step1Text') },
    { title: t('home.step2'), text: t('home.step2Text') },
    { title: t('home.step3'), text: t('home.step3Text') },
    { title: t('home.step4'), text: t('home.step4Text') },
  ];
  const topCategories = categories.filter((c) => !c.parentSlug);
  return (
    <>
      {/* The two ways to buy, side by side: search the stock, or hand the search to Source. */}
      <section className="on-dark bg-carbon text-silver">
        <div className="container-page grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-12 lg:py-14">
          <div className="min-w-0">
            <h1 className="max-w-2xl text-[1.75rem] font-bold text-white sm:text-4xl lg:text-[2.625rem]">{t('home.heroTitle')}</h1>
            <p className="mt-4 max-w-2xl leading-8 text-silver/90 sm:text-lg sm:leading-8">{t('home.heroText')}</p>
            <form action={`/${locale}/parts`} method="get" role="search" className="mt-8 max-w-2xl">
              <label htmlFor="hero-search" className="mb-2 block text-sm font-semibold text-white">{t('search.label')}</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                  <Search aria-hidden className="pointer-events-none absolute inset-y-0 start-4 my-auto size-5 text-steel" />
                  <input id="hero-search" name="q" type="search" required placeholder={t('search.placeholder')} aria-describedby="hero-search-hint"
                    className="h-14 w-full rounded-[var(--radius-control)] border border-transparent bg-white ps-12 pe-4 text-base text-ink placeholder:text-steel/80" />
                </div>
                <button type="submit" className="inline-flex h-14 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] bg-action px-6 font-semibold text-white transition-colors hover:bg-action-hover active:bg-action-hover">
                  {t('home.primaryCta')}
                </button>
              </div>
              <p id="hero-search-hint" className="mt-2 text-sm leading-6 text-silver/80">{t('search.hint')}</p>
            </form>
            {topCategories.length ? (
              <nav aria-labelledby="categories-title" className="mt-7 max-w-2xl">
                <h2 id="categories-title" className="mb-2.5 text-sm font-semibold text-white">{t('home.categoriesTitle')}</h2>
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

          <section aria-labelledby="process-title" className="self-start rounded-[var(--radius-panel)] border border-white/10 bg-carbon-3 p-5 sm:p-6">
            <h2 id="process-title" className="text-lg font-bold text-white">{t('home.processTitle')}</h2>
            <ol className="mt-5">
              {steps.map((s, i) => (
                <li key={s.title} className="relative flex gap-3.5 pb-5 last:pb-0">
                  {i < steps.length - 1 ? <span aria-hidden className="absolute bottom-1 start-3.5 top-9 w-px bg-white/15" /> : null}
                  <span aria-hidden className="num grid size-7 shrink-0 place-items-center rounded-full border border-tech-light/70 text-xs font-bold text-tech-light">{digits(i + 1)}</span>
                  <div className="min-w-0">
                    <h3 className="font-semibold leading-7 text-white">{s.title}</h3>
                    <p className="text-sm leading-6 text-silver/80">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <ButtonLink href="/request-part" variant="onDark" size="lg" className="mt-6 w-full">
              {t('home.secondaryCta')}
            </ButtonLink>
          </section>
        </div>
      </section>

      <section aria-labelledby="brands-title" className="container-page render-lazy pt-12">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 id="brands-title" className="text-xl font-bold">{t('home.brandsTitle')}</h2>
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
          <li>
            <Link href="/request-part" className="flex h-full min-h-[4.5rem] flex-col justify-center gap-0.5 rounded-[var(--radius-card)] border border-dashed border-line-strong px-4 py-3 transition-colors hover:border-action hover:bg-action-soft">
              <span className="font-bold leading-7 text-action">{t('home.otherBrands')}</span>
              <span className="text-xs leading-5 text-steel">{t('home.otherBrandsHint')}</span>
            </Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="featured-title" className="container-page render-lazy pt-12">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 id="featured-title" className="text-xl font-bold">{t('home.featuredTitle')}</h2>
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
          <EmptyState title={t('home.emptyCatalog')}>
            <ButtonLink href="/request-part" variant="secondary" className="mt-2">{t('home.secondaryCta')}</ButtonLink>
          </EmptyState>
        )}
      </section>

      <section aria-labelledby="faq-title" className="container-page render-lazy pt-14">
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr] lg:gap-12">
          <h2 id="faq-title" className="text-xl font-bold">{t('home.faqTitle')}</h2>
          <div className="divide-y divide-line-soft border-y border-line-soft">
            {([1, 2, 3] as const).map((n) => (
              <details key={n} className="group">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-semibold leading-7 marker:hidden hover:text-action [&::-webkit-details-marker]:hidden">
                  {t(`home.faq${n}q`)}
                  <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full border border-line text-steel transition-transform duration-200 group-open:rotate-45"><Plus className="size-4" /></span>
                </summary>
                <p className="max-w-3xl pb-4 leading-8 text-steel">{t(`home.faq${n}a`)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
