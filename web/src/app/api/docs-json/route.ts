import { NextRequest, NextResponse } from 'next/server';

/** The OpenAPI 3 document behind the reference, served at dockydoc.app/api/docs-json. */
const BACKEND_URL = (() => {
  if (process.env.API_URL) return process.env.API_URL;
  if (process.env.NODE_ENV === 'production') return 'https://dockydoc-api-staging.onrender.com';
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8081';
})();

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const upstream = await fetch(`${BACKEND_URL}/api/docs-json`, { headers: { accept: 'application/json' } });
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json', 'cache-control': 'public, max-age=300' },
  });
}
