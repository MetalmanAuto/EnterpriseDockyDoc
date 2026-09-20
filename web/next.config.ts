import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Bake environment variables into the client bundle at build time.
  // Values set in the Vercel / hosting dashboard take precedence because
  // Next.js merges actual process.env BEFORE evaluating this block.
  env: {
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME ?? 'DockyDoc',
    // Default to the staging Render URL so Vercel builds work without any
    // dashboard env-var configuration. Override via NEXT_PUBLIC_API_URL in
    // the Vercel environment settings when promoting to a different backend.
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL ??
      (process.env.NODE_ENV === 'production'
        ? 'https://dockydoc-api-staging.onrender.com'
        : 'http://localhost:8081'),
  },

  images: {
    remotePatterns: [],
  },

  // Security headers on every response. CSP is deliberately left off until
  // the third-party tags (Clerk, ad pixels) have a stable allow-list.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self)' },
        ],
      },
    ];
  },
};

export default nextConfig;
