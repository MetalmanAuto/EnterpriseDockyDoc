import type { Metadata } from 'next';
import { SignIn } from '@clerk/nextjs';
import LoginForm from '@/components/auth/LoginForm';
import AuthShell, { authPanelAppearance } from '@/components/auth/AuthShell';
import { safeNextPath } from '@/lib/next-path';

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to your DockyDoc workspace',
};

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/**
 * Login page — catch-all route required by Clerk's <SignIn> component
 * (SSO callback, MFA and factor sub-routes resolve here).
 *
 * `?next=` carries where to land afterwards. An invitation link sends the
 * invitee here with next=/join/<token>, and without honouring it they sign in
 * and arrive at the dashboard having never joined the workspace. The link
 * across to sign-up carries it too, since an invitee usually has no account.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const afterAuth = safeNextPath((await searchParams).next);
  return (
    <AuthShell
      title="Know what expires before it does."
      subtitle="One-time code by email or SMS. No password to remember."
      cta={{
        question: "Don't have an account?",
        label: 'Create your free workspace',
        href: `/register?next=${encodeURIComponent(afterAuth)}`,
      }}
    >
      {clerkEnabled ? (
        <SignIn
          forceRedirectUrl={afterAuth}
          fallbackRedirectUrl={afterAuth}
          signUpUrl={`/register?next=${encodeURIComponent(afterAuth)}`}
          appearance={authPanelAppearance}
        />
      ) : (
        <div className="w-full rounded-2xl border border-slate-400/20 bg-[#111a2e] p-6">
          <LoginForm />
        </div>
      )}
    </AuthShell>
  );
}
