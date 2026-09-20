'use client';

import { UserProfile } from '@clerk/nextjs';

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/**
 * Sign-in security, managed by Clerk: email addresses, two-factor
 * authentication, active sessions and connected devices.
 */
export default function AccountPage() {
  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="page-title">Sign-in and security</h1>
        <p className="text-sm text-ink-2 mt-1">Two-factor authentication, email addresses and the devices signed in to your account.</p>
      </div>
      {clerkEnabled ? (
        <UserProfile routing="hash" appearance={{ elements: { rootBox: 'w-full', cardBox: 'w-full shadow-none border border-stroke' } }} />
      ) : (
        <p className="text-sm text-ink-3">Sign-in is managed by Clerk in production. This page has nothing to show in a local run without Clerk.</p>
      )}
    </div>
  );
}
