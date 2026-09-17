import { UserProvider } from '@/context/UserContext';

/**
 * The invitation page reads the signed-in user to decide what to show: accept,
 * "wrong account", or a prompt to sign in. It lives outside the dashboard, so
 * without this layout useUser() throws and every invite link 500s before the
 * invitee sees anything.
 *
 * The page is meant to be readable signed out, so a 401 must not redirect.
 */
export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return <UserProvider redirectOnUnauthenticated={false}>{children}</UserProvider>;
}
