import { NextResponse, type NextRequest } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

/**
 * Route protection middleware powered by Clerk.
 *
 * When NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is set:
 *   - Unauthenticated users hitting protected routes are redirected to /login.
 *   - Public routes (/login, /register, /s/*, /api/health) pass through freely.
 *
 * When the key is absent (local dev without Clerk):
 *   - Every route passes through and the client-side UserContext handles the
 *     401-redirect fallback, with the API accepting an x-dev-user-email header.
 *
 * The no-key branch must not call clerkMiddleware() at all. Checking the key
 * *inside* the handler is too late: clerkMiddleware throws "Missing
 * publishableKey" while building the response, so every route 500s and the
 * app cannot be run locally without Clerk credentials.
 *
 * Both keys are required here, not just the publishable one. clerkMiddleware
 * also throws "Missing secretKey" while building the response, on public
 * routes too, so a publishable-key-only run (the sandbox, showing the real
 * Clerk sign-in and sign-up screens without a backend secret) 500s on every
 * route unless this branch skips the middleware entirely. Deployed
 * environments set both keys, so route protection there is unchanged; the
 * API's ClerkAuthGuard verifies the session on every request regardless.
 *
 * Note: JWT / localStorage cannot be read in Edge middleware, but Clerk uses
 * an HttpOnly __session cookie set during the OAuth callback, so this works
 * server-side without any localStorage access.
 */

const isPublicRoute = createRouteMatcher([
  '/',                  // landing page
  '/pricing(.*)',
  '/security(.*)',
  '/terms(.*)',
  '/privacy(.*)',
  '/refunds(.*)',
  '/acceptable-use(.*)',
  '/contact(.*)',
  '/help(.*)',
  '/login(.*)',
  '/register(.*)',
  '/forgot-password(.*)',
  '/s/(.*)',            // public share links
  '/join/(.*)',         // workspace invitation acceptance
  '/api/health(.*)',   // health-check endpoint
  '/api/v1/(.*)',      // Render backend API — auth is handled by ClerkAuthGuard there
]);

const clerkEnabled =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;

const withClerk = clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
  return withCountry(request, NextResponse.next());
});

/**
 * Vercel tells us the visitor's country; the pricing pages use it to show
 * rupees to India and dollars elsewhere, and the checkout picks the processor.
 */
function withCountry(request: NextRequest, response: NextResponse): NextResponse {
  const country = request.headers.get('x-vercel-ip-country');
  if (country && !request.cookies.get('dd_country')) {
    response.cookies.set('dd_country', country, { path: '/', maxAge: 60 * 60 * 24 * 30, sameSite: 'lax' });
  }
  return response;
}

/** Transparent pass-through for local runs with no Clerk instance. */
function withoutClerk(request: NextRequest) {
  return withCountry(request, NextResponse.next());
}

export default clerkEnabled ? withClerk : withoutClerk;

export const config = {
  // Apply to all routes except Next.js internals, static assets, AND /api/v1/*.
  // /api/v1/* is our backend proxy — it must run with zero Clerk overhead so
  // streaming bodies and Authorization headers pass through untouched.
  matcher: ['/((?!api/v1|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
