import type { Metadata } from 'next';
import Link from 'next/link';
import { SignUp } from '@clerk/nextjs';
import AuthShell, { authPanelAppearance } from '@/components/auth/AuthShell';
import { safeNextPath } from '@/lib/next-path';

export const metadata: Metadata = {
  title: 'Create your workspace',
  description: 'Create a DockyDoc workspace',
};

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/**
 * Sign-up page — catch-all route required by Clerk's <SignUp> component
 * (verification and continue sub-routes resolve here). A personal workspace
 * is created automatically on first sign-in.
 *
 * `?next=` carries where to land afterwards, so an invitee who creates an
 * account from an invitation link comes back to it instead of the dashboard.
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const afterAuth = safeNextPath((await searchParams).next);
  return (
    <AuthShell
      title="Create your DockyDoc workspace."
      subtitle="Enter your email, type the 6-digit code we send you, and your workspace is ready. No password, no card."
      cta={{
        question: 'Already signed up?',
        label: 'Sign in instead',
        href: `/login?next=${encodeURIComponent(afterAuth)}`,
      }}
    >
      {clerkEnabled ? (
        <SignUp
          forceRedirectUrl={afterAuth}
          fallbackRedirectUrl={afterAuth}
          signInUrl={`/login?next=${encodeURIComponent(afterAuth)}`}
          appearance={authPanelAppearance}
        />
      ) : (
        <div className="w-full rounded-2xl border border-slate-400/20 bg-[#111a2e] p-6 text-sm text-slate-400">
          Sign-up is handled by Clerk. Set <code className="font-mono text-slate-200">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> to enable it, or{' '}
          <Link href={`/login?next=${encodeURIComponent(afterAuth)}`} className="text-brand-300">sign in</Link> with a dev account.
        </div>
      )}
    </AuthShell>
  );
}
