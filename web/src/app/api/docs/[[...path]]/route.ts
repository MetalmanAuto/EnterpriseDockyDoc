import { NextRequest, NextResponse } from 'next/server';

/**
 * Serves the API reference (Swagger UI and the OpenAPI JSON) from the
 * backend at https://dockydoc.app/api/docs, so developers never need the
 * backend host name. GET only; no credentials involved.
 */
const BACKEND_URL = (() => {
  if (process.env.API_URL) return process.env.API_URL;
  if (process.env.NODE_ENV === 'production') return 'https://dockydoc-api-staging.onrender.com';
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8081';
})();

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }): Promise<NextResponse> {
  const { path = [] } = await ctx.params;
  const segment = path.join('/');
  const target = new URL(`${BACKEND_URL}/api/docs${segment ? `/${segment}` : ''}`);
  req.nextUrl.searchParams.forEach((v, k) => target.searchParams.set(k, v));
  const upstream = await fetch(target, { headers: { accept: req.headers.get('accept') ?? '*/*' }, redirect: 'manual' });
  const headers = new Headers();
  for (const name of ['content-type', 'cache-control', 'etag', 'last-modified']) {
    const v = upstream.headers.get(name);
    if (v) headers.set(name, v);
  }
  if (upstream.status >= 300 && upstream.status < 400) {
    const loc = upstream.headers.get('location') ?? '/api/docs/';
    return NextResponse.redirect(new URL(loc.replace(BACKEND_URL, ''), req.nextUrl.origin), 302);
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
