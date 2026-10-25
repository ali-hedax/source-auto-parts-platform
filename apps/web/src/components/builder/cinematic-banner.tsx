import type { BuilderBlock } from '@hedax/contracts';
import { localize } from '@hedax/contracts/constants';
import { CinematicFilm } from './cinematic-film';

/** A quiet, editable film interlude between shopping sections; never another page heading. */
export function CinematicBanner({ block, locale }: { block: BuilderBlock; locale: string }) {
  if (!block.film) return null;
  const alt = localize(block.alt, locale) || 'Source by HEDAX';
  return <section className="cine cine-strip" aria-label={alt}>
    <CinematicFilm film={block.film} still={block.imageUrl} mobileStill={block.mobileImageUrl}
      alt={alt} logoUrl="" logoAlt="" locale={locale} deferUntilVisible />
  </section>;
}
