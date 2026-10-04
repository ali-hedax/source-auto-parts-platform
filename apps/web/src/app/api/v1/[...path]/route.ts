import { type NextRequest, NextResponse } from 'next/server';
import { apiInternalUrl, dataSource } from '@/lib/config';
import { handleFixture } from '@/lib/fixtures/handler';

export const dynamic = 'force-dynamic';

const FORWARD_REQUEST_HEADERS = [
  'accept', 'content-type', 'cookie', 'origin', 'referer', 'user-agent', 'x-csrf-token', 'idempotency-key', 'x-request-id', 'sec-fetch-site',
];
const DROP_RESPONSE_HEADERS = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'set-cookie']);

/**
 * Same-origin gateway for /api/v1 during development and self-hosting without
 * a reverse proxy. In production the reverse proxy routes /api/v1 straight to
 * the NestJS API. Business logic never lives here.
 */
async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  const subPath = `/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;

  if (dataSource() === 'fixtures') {
    const body = req.method === 'GET' || req.method === 'HEAD' ? null : await req.text().catch(() => null);
    const cookieMap = Object.fromEntries(req.cookies.getAll().map((c) => [c.name, c.value]));
    const res = await handleFixture(req.method, subPath, body, cookieMap);
    const out = NextResponse.json(res.body ?? null, { status: res.status });
    for (const [name, value] of Object.entries(res.cookies ?? {})) out.cookies.set(name, value, { path: '/', sameSite: 'lax' });
    out.headers.set('x-hedax-preview', 'fixtures');
    return out;
  }

  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const v = req.headers.get(name);
    if (v) headers.set(name, v);
  }
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) headers.set('x-forwarded-for', fwd);
  const init: RequestInit & { duplex?: 'half' } = { method: req.method, headers, redirect: 'manual', cache: 'no-store' };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req.body;
    init.duplex = 'half';
  }
  let upstream: Response;
  try {
    upstream = await fetch(`${apiInternalUrl()}${subPath}`, init);
  } catch {
    return NextResponse.json(
      { error: { code: 'API_UNREACHABLE', message: 'The API server is not reachable', requestId: 'gateway' } },
      { status: 503 },
    );
  }
  const out = new NextResponse(upstream.body, { status: upstream.status });
  upstream.headers.forEach((value, key) => {
    if (!DROP_RESPONSE_HEADERS.has(key.toLowerCase())) out.headers.set(key, value);
  });
  for (const cookie of upstream.headers.getSetCookie()) out.headers.append('set-cookie', cookie);
  return out;
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
