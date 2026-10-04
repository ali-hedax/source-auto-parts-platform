import type { CategoryView, SearchResult, VehicleBrandView } from '@hedax/contracts';
import { ArrowLeft, ArrowRight, ClipboardList, CreditCard, FileSearch, Search, Truck } from 'lucide-react';
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
  const steps = [
    { icon: ClipboardList, title: t('home.step1'), text: t('home.step1Text') },
    { icon: FileSearch, title: t('home.step2'), text: t('home.step2Text') },
    { icon: CreditCard, title: t('home.step3'), text: t('home.step3Text') },
    { icon: Truck, title: t('home.step4'), text: t('home.step4Text') },
  ];
  return (
    <>
      <section className="on-dark bg-carbon text-silver">
        <div className="container-page grid gap-8 py-12 md:py-16 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="mb-3 text-sm font-semibold tracking-wide text-tech-light">{t('meta.tagline')}</p>
            <h1 className="text-3xl font-extrabold leading-tight text-white md:text-4xl">{t('home.heroTitle')}</h1>
            <p className="mt-4 max-w-2xl text-lg">{t('home.heroText')}</p>
          </div>
          <form action={`/${locale}/parts`} method="get" role="search" className="rounded-[var(--radius-card)] bg-white p-5 text-ink shadow-lg">
            <label htmlFor="hero-search" className="mb-2 block font-bold">{t('search.label')}</label>
            <input id="hero-search" name="q" type="search" required placeholder={t('search.placeholder')} aria-describedby="hero-search-hint"
              className="min-h-12 w-full rounded-[var(--radius-control)] border border-line px-3 text-base" />
            <p id="hero-search-hint" className="mt-2 text-sm text-steel">{t('search.hint')}</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="submit" className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] bg-action px-5 font-semibold text-white hover:bg-action-hover">
                <Search aria-hidden className="size-5" />
                {t('home.primaryCta')}
              </button>
              <ButtonLink href="/request-part" variant="secondary" size="lg" className="flex-1">
                {t('home.secondaryCta')}
              </ButtonLink>
            </div>
          </form>
        </div>
      </section>

      <section aria-labelledby="brands-title" className="container-page render-lazy py-10">
        <h2 id="brands-title" className="mb-4 text-xl font-bold">{t('home.brandsTitle')}</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {brands.filter((b) => b.isFeatured).map((b) => (
            <li key={b.slug}>
              <Link href={`/brands/${b.slug}`} className="card flex min-h-20 items-center justify-center p-4 text-center text-lg font-bold hover:border-tech">
                {name(b.name)}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/request-part" className="flex min-h-20 flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-action p-4 text-center hover:bg-action-soft">
              <span className="font-bold text-action">{t('home.otherBrands')}</span>
              <span className="text-xs text-steel">{t('home.otherBrandsHint')}</span>
            </Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="featured-title" className="container-page render-lazy py-6">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 id="featured-title" className="text-xl font-bold">{t('home.featuredTitle')}</h2>
          <Link href="/parts" className="inline-flex min-h-11 items-center gap-1 font-semibold text-action hover:underline">
            {t('nav.parts')} <Arrow aria-hidden className="size-4" />
          </Link>
        </div>
        {featured && featured.items.length ? (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featured.items.map((p, i) => (
              <li key={p.id}><PartCard product={p} priority={i < 2} /></li>
            ))}
          </ul>
        ) : (
          <EmptyState title={t('home.emptyCatalog')}>
            <ButtonLink href="/request-part" variant="secondary">{t('home.secondaryCta')}</ButtonLink>
          </EmptyState>
        )}
      </section>

      {categories.length ? (
        <section aria-labelledby="categories-title" className="container-page render-lazy py-6">
          <h2 id="categories-title" className="mb-4 text-xl font-bold">{t('home.categoriesTitle')}</h2>
          <ul className="flex flex-wrap gap-2">
            {categories.filter((c) => !c.parentSlug).map((c) => (
              <li key={c.slug}>
                <Link href={`/parts?category=${c.slug}`} className="inline-flex min-h-11 items-center rounded-full border border-line px-4 font-medium hover:border-action hover:text-action">
                  {name(c.name)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="process-title" className="render-lazy bg-surface py-12">
        <div className="container-page">
          <h2 id="process-title" className="mb-6 text-xl font-bold">{t('home.processTitle')}</h2>
          <ol className="grid gap-4 md:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title} className="card flex flex-col gap-2 p-5">
                <span className="flex items-center gap-2 text-action">
                  <s.icon aria-hidden className="size-6" />
                  <span className="text-sm font-bold">{(i + 1).toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US')}</span>
                </span>
                <h3 className="font-bold">{s.title}</h3>
                <p className="text-sm text-steel">{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-6">
            <ButtonLink href="/request-part" size="lg">{t('home.secondaryCta')}</ButtonLink>
          </div>
        </div>
      </section>

      <section aria-labelledby="faq-title" className="container-page render-lazy py-12">
        <h2 id="faq-title" className="mb-4 text-xl font-bold">{t('home.faqTitle')}</h2>
        <div className="flex flex-col gap-3">
          {([1, 2, 3] as const).map((n) => (
            <details key={n} className="card group p-4">
              <summary className="min-h-8 cursor-pointer font-semibold">{t(`home.faq${n}q`)}</summary>
              <p className="mt-2 text-steel">{t(`home.faq${n}a`)}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
