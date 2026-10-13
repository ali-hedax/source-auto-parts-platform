'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * The part's photos: the main photo large, the others as thumbnails in the
 * order chosen in the panel. A thumbnail shows that photo large.
 */
export function ProductGallery({ images }: { images: Array<{ url: string; alt: string }> }) {
  const t = useTranslations('parts');
  const [index, setIndex] = useState(0);
  const current = images[index] ?? images[0];
  if (!current) return null;
  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-card)] border border-line-soft bg-white">
        <Image key={current.url} src={current.url} alt={current.alt} fill priority={index === 0} sizes="(max-width: 1024px) 100vw, 50vw" className="object-contain p-6" />
      </div>
      {images.length > 1 ? (
        <ul className="flex flex-wrap gap-2" aria-label={t('photos')}>
          {images.map((img, i) => (
            <li key={img.url}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-pressed={i === index}
                aria-label={t('photoN', { n: i + 1 })}
                className={`relative block size-16 cursor-pointer overflow-hidden rounded-[var(--radius-control)] border bg-white transition-colors sm:size-20 ${i === index ? 'border-action ring-2 ring-action/30' : 'border-line-soft hover:border-ink'}`}
              >
                <Image src={img.url} alt="" fill sizes="80px" className="object-contain p-1" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
