import Image from 'next/image';
import { Link } from '@/i18n/navigation';

/**
 * A vehicle make: its logo in a fixed frame (contained, never stretched or cropped), the English name
 * under it and, optionally, the Persian name. Without an uploaded logo the frame shows the name as type —
 * never an invented emblem.
 */
export function BrandCard({ href, logo, nameEn, nameFa, showNameFa = true, meta, locale }: {
  href: string; logo: string | null; nameEn: string | null; nameFa: string; showNameFa?: boolean; meta?: string; locale: string;
}) {
  const latin = nameEn || nameFa;
  // English first under the logo; on the Persian site the Persian name may follow (owner's choice).
  const secondary = locale === 'fa' && showNameFa && nameEn ? nameFa : '';
  return (
    <Link href={href} className="group store-card store-rise flex h-full flex-col gap-3 p-3 sm:p-4">
      <span className="studio grid h-16 place-items-center rounded-[calc(var(--radius-card)-6px)] px-3 sm:h-20">
        {logo
          ? <Image src={logo} alt={latin} width={240} height={120} unoptimized className="max-h-14 w-auto max-w-full object-contain mix-blend-multiply sm:max-h-16" />
          : <span className="truncate font-[family-name:var(--font-en)] text-sm font-bold uppercase tracking-[0.14em] text-ink/80" dir="ltr">{latin}</span>}
      </span>
      <span className="flex min-w-0 flex-col items-center gap-0.5 text-center">
        <span className="max-w-full truncate font-[family-name:var(--font-en)] text-[0.9375rem] font-bold" dir="ltr">{latin}</span>
        {secondary ? <span className="max-w-full truncate text-sm text-steel">{secondary}</span> : null}
        {meta ? <span className="text-xs text-steel">{meta}</span> : null}
      </span>
    </Link>
  );
}
