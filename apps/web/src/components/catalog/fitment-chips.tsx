import type { FitmentView } from '@hedax/contracts';
import { Car } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

/**
 * «مناسب برای:» under the product photo: one clickable chip per vehicle or model. A vehicle chip
 * opens /cars/[slug] (all parts for it); a model chip opens the same page narrowed to that model.
 */
export async function FitmentChips({ fitments, locale }: { fitments: FitmentView[]; locale: string }) {
  if (!fitments.length) return null;
  const t = await getTranslations();
  const name = (n: { fa: string; en: string | null }) => (locale === 'en' ? (n.en ?? n.fa) : n.fa);
  return (
    <section aria-labelledby="fitment-title" className="flex flex-wrap items-center gap-2" data-testid="fitment">
      <h2 id="fitment-title" className="inline-flex items-center gap-1.5 text-sm font-bold">
        <Car aria-hidden className="size-4 text-steel" />
        {t('parts.fitsFor')}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {fitments.map((f) => {
          const label = f.model ? `${name(f.vehicle.name)} ${name(f.model.name)}` : name(f.vehicle.name);
          const href = f.model ? `/cars/${f.vehicle.slug}?model=${encodeURIComponent(f.model.slug)}` : `/cars/${f.vehicle.slug}`;
          return (
            <li key={`${f.vehicle.slug}:${f.model?.slug ?? ''}`}>
              <Link href={href} className="inline-flex min-h-9 items-center rounded-full border border-line-strong bg-white px-3 text-sm font-medium transition-colors hover:border-action hover:bg-action-soft hover:text-action">
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
