import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { PUBLIC_CACHE_TAG } from '@/lib/public-cache';

export const dynamic = 'force-dynamic';

/**
 * Called by the API after a change that affects public pages (product, price,
 * stock, rate, policy, contact): cached public data expires immediately (spec §15).
 * Requires the shared REVALIDATE_SECRET; anything else gets 404. Behind the
 * reverse proxy /api/* goes to the API, so this route is reachable only on the
 * internal network (API → web).
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.REVALIDATE_SECRET ?? '';
  const given = request.headers.get('x-hedax-revalidate') ?? '';
  const valid = secret.length >= 32 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!valid) return new Response(null, { status: 404 });
  revalidateTag(PUBLIC_CACHE_TAG, { expire: 0 });
  return Response.json({ revalidated: true });
}
