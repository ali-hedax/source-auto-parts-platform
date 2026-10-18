/**
 * The former technical catalog (/catalog) is now part of the parts list: 301 to /parts, keeping the
 * search («?q=…») and the filters that still exist there.
 */
export async function GET(request: Request, { params }: { params: Promise<{ locale: string }> }): Promise<Response> {
  const { locale } = await params;
  const from = new URL(request.url).searchParams;
  const keep = new URLSearchParams();
  for (const k of ['q', 'brand', 'vehicle', 'model', 'category']) {
    const v = from.get(k);
    if (v) keep.set(k, v.slice(0, 120));
  }
  const lang = locale === 'en' ? 'en' : 'fa';
  return new Response(null, { status: 301, headers: { Location: `/${lang}/parts${keep.size ? `?${keep.toString()}` : ''}`, 'Cache-Control': 'public, max-age=3600' } });
}
