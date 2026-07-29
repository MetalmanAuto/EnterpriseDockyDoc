import { NextRequest, NextResponse } from 'next/server';

/**
 * Catch-all proxy: /api/v1/* → Render backend.
 *
 * Browser always calls same-origin Vercel, so CORS is never an issue.
 * The Authorization header (Clerk JWT) is forwarded as-is; the Render
 * ClerkAuthGuard validates it there.
 *
 * BACKEND_URL resolution order:
 *   1. API_URL env var (Vercel dashboard → server-side only, no NEXT_PUBLIC_)
 *   2. In production: hardcoded staging URL.  We deliberately IGNORE
 *      NEXT_PUBLIC_API_URL in prod because old Vercel configs often set
 *      it to localhost — which now points at the Vercel container itself
 *      (where there's no API), not the user's laptop.
 *   3. In dev: NEXT_PUBLIC_API_URL (legacy compat) or localhost:8081.
 */
const BACKEND_URL = (() => {
  if (process.env.API_URL) return process.env.API_URL;
  if (process.env.NODE_ENV === 'production') {
    return 'https://dockydoc-api-staging.onrender.com';
  }
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8081';
})();

const FORWARDED_REQUEST_HEADERS = [
  'authorization',
  'content-type',
  'x-dev-user-email',
];

// Edge runtime: <50ms cold start vs 1-3s for Node.js serverless.
// All we use here is Web fetch + Headers + ArrayBuffer — fully supported in Edge.
export const runtime = 'edge';

async function proxy(
  req: NextRequest,
  params: { path: string[] },
): Promise<NextResponse> {
  const segment = params.path.join('/');
  const targetUrl = new URL(`${BACKEND_URL}/api/v1/${segment}`);

  req.nextUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  const forwardHeaders = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) forwardHeaders.set(name, value);
  }

  // Buffer the body — simpler and more compatible than streaming with
  // duplex:'half' on Vercel's Node runtime.
  let body: ArrayBuffer | undefined;
  if (!['GET', 'HEAD'].includes(req.method)) {
    body = await req.arrayBuffer();
    if (body.byteLength === 0) body = undefined;
  }

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: forwardHeaders,
      body,
      cache: 'no-store',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      {
        message: `Upstream API unreachable: ${message}`,
        backendUrl: targetUrl.origin,
      },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  const ct = upstream.headers.get('content-type');
  if (ct) responseHeaders.set('content-type', ct);
  const cd = upstream.headers.get('content-disposition');
  if (cd) responseHeaders.set('content-disposition', cd);

  // Stream the response body — Edge runtime keeps the upstream Response alive
  // for the full stream lifetime, so no buffering needed.
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, await ctx.params);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, await ctx.params);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return proxy(req, await ctx.params);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return proxy(req, await ctx.params);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return proxy(req, await ctx.params);
}
