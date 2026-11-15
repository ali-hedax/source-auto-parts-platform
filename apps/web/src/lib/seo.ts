import type { Metadata } from 'next';

/**
 * Search-engine helpers. The English pages are not indexed until their translation is complete (the
 * locale layout sends noindex for /en), so pages name only their own address as canonical and no
 * language alternates: an alternate pointing at a noindex page is a contradiction search engines
 * report. When /en is ready, add `languages` back here and in the sitemaps.
 */
export function canonical(locale: string, path = ''): NonNullable<Metadata['alternates']> {
  return { canonical: `/${locale}${path}` };
}

/** A meta description from running text: one line, cut at a word near 160 characters. */
export function describe(text: string | null | undefined, max = 160): string | undefined {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return undefined;
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[،,؛;:.\-–—]+$/, '')}…`;
}

/** The home page's share image when none is set under site content → SEO: the hero photo. */
export const DEFAULT_SHARE_IMAGE = '/brand/source/atelier/hero-parts.webp';

interface SiteFacts {
  base: string;
  locale: string;
  name: string;
  description?: string | undefined;
  logo: string;
  telephone?: string | undefined;
  email?: string | undefined;
  address?: string | undefined;
  sameAs: string[];
}

/** Organization and WebSite (with the parts search) for the home page, as schema.org JSON-LD. */
export function homeJsonLd(f: SiteFacts): string {
  const home = `${f.base}/${f.locale}`;
  const graph = [
    {
      '@type': 'Organization',
      '@id': `${f.base}/#organization`,
      name: f.name,
      url: home,
      logo: new URL(f.logo, f.base).toString(),
      ...(f.description ? { description: f.description } : {}),
      ...(f.email ? { email: f.email } : {}),
      ...(f.telephone ? { telephone: f.telephone, contactPoint: [{ '@type': 'ContactPoint', telephone: f.telephone, contactType: 'customer service', areaServed: 'IR', availableLanguage: ['fa'] }] } : {}),
      ...(f.address ? { address: { '@type': 'PostalAddress', streetAddress: f.address, addressCountry: 'IR' } } : {}),
      ...(f.sameAs.length ? { sameAs: f.sameAs } : {}),
    },
    {
      '@type': 'WebSite',
      '@id': `${f.base}/#website`,
      name: f.name,
      url: home,
      inLanguage: f.locale === 'fa' ? 'fa-IR' : 'en',
      publisher: { '@id': `${f.base}/#organization` },
      potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${home}/parts?q={search_term_string}` }, 'query-input': 'required name=search_term_string' },
    },
  ];
  // "<" is escaped so no text from the panel can close the script element.
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}
