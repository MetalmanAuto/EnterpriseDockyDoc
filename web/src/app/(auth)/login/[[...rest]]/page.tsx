import type { Metadata } from 'next';
import { SignIn } from '@clerk/nextjs';
import LoginForm from '@/components/auth/LoginForm';
import AuthShell, { authPanelAppearance } from '@/components/auth/AuthShell';

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to your DockyDoc workspace',
};

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/**
 * Login page — catch-all route required by Clerk's <SignIn> component
 * (SSO callback, MFA and factor sub-routes resolve here).
 */
export default function LoginPage() {
  return (
    <AuthShell
      title="Know what expires before it does."
      subtitle="One-time code by email or SMS. No password to remember."
      cta={{
        question: "Don't have an account?",
        label: 'Create your free workspace',
        href: '/register',
      }}
    >
      {clerkEnabled ? (
        <SignIn
          forceRedirectUrl="/dashboard"
          fallbackRedirectUrl="/dashboard"
          signUpUrl="/register"
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
