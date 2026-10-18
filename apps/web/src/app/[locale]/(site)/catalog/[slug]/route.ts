import { serverApiOptional } from '@/lib/api/server';

/**
 * A part of the former technical catalog (/catalog/[slug]) → its page as a part (301). The address
 * mapping was recorded when the catalog entries became parts; an unknown address opens the search.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Response> {
  const { locale, slug } = await params;
  const lang = locale === 'en' ? 'en' : 'fa';
  const clean = decodeURIComponent(slug).slice(0, 120);
  const found = await serverApiOptional<{ slug: string }>(`/catalog/legacy-catalog/${encodeURIComponent(clean)}`, { publicCache: 3600 }).catch(() => null);
  const target = found ? `/${lang}/parts/${encodeURIComponent(found.slug)}` : `/${lang}/parts?q=${encodeURIComponent(clean.replace(/-/g, ' '))}`;
  return new Response(null, { status: 301, headers: { Location: target, 'Cache-Control': 'public, max-age=3600' } });
}
