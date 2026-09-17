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

/** Statuses the fetch spec forbids a body on. */
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

const FORWARDED_REQUEST_HEADERS = [
  'authorization',
  'content-type',
  'x-dev-user-email',
];

// Allow up to 60s for Render free-tier cold starts. Hobby plan caps at 10s,
// Pro at 60s — Vercel will silently clamp this to whatever the plan allows.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

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

  // 204, 205 and 304 must not carry a body. The Response constructor throws
  // on one — an empty ArrayBuffer still counts — and Next turns that throw
  // into a 500. Every endpoint answering 204 looked broken in the browser
  // while the API had already done the work: deleting a label, deleting or
  // restoring a folder, removing a member, revoking an invitation.
  if (NULL_BODY_STATUSES.has(upstream.status)) {
    return new NextResponse(null, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  // Buffer the response body too — matches the request side and avoids
  // stream-lifetime weirdness when the upstream Response is GC'd.
  const responseBody = await upstream.arrayBuffer();
  return new NextResponse(responseBody, {
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
