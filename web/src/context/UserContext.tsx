'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { fetchCurrentUser, switchWorkspaceApi, ApiError } from '@/lib/api';
import type { CurrentUser, WorkspaceMembership } from '@/types';

// ------------------------------------------------------------------ //
// Context shape
// ------------------------------------------------------------------ //

interface UserContextValue {
  /** Null while loading or on error. */
  user: CurrentUser | null;
  /** The workspace the user is currently operating in. */
  activeWorkspace: WorkspaceMembership | null;
  isLoading: boolean;
  error: string | null;
  /**
   * Switch the active workspace.
   * Validates membership server-side, then updates local state + localStorage.
   */
  switchWorkspace: (workspaceId: string) => Promise<void>;
  /**
   * The workspace being switched to, while the switch is in flight.
   * Drives the app-wide "switching workspace" overlay so the change is visible.
   */
  switchingTo: WorkspaceMembership | null;
  /**
   * Re-fetch the current user (refreshes workspace names, roles, etc.).
   * Call after renaming a workspace or after a role change that affects the current user.
   * Pass workspaceId to atomically switch to a specific workspace after the refresh
   * (used by the invite-accept flow to land the user in the correct workspace).
   */
  refreshUser: (workspaceId?: string) => Promise<void>;
  /**
   * Clear the stored JWT, reset user state, and redirect to /login.
   */
  logout: () => void;
}

const UserContext = createContext<UserContextValue | null>(null);

// ------------------------------------------------------------------ //
// Provider
// ------------------------------------------------------------------ //

const STORAGE_KEY = 'dockydoc:activeWorkspaceId';

/** Minimum time the switching overlay stays up, so the change registers. */
const SWITCH_MIN_MS = 550;

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [activeWorkspace, setActiveWorkspace] =
    useState<WorkspaceMembership | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [switchingTo, setSwitchingTo] = useState<WorkspaceMembership | null>(null);
  const router = useRouter();

  // Fetch current user on mount
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const data = await fetchCurrentUser();
        if (cancelled) return;

        setUser(data);

        // Restore previously selected workspace from localStorage
        const savedId =
          typeof window !== 'undefined'
            ? localStorage.getItem(STORAGE_KEY)
            : null;

        const restored = savedId
          ? data.workspaces.find((w) => w.workspaceId === savedId)
          : null;

        setActiveWorkspace(restored ?? data.defaultWorkspace);
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError && err.status === 401) {
            // Token is missing or expired — soft navigation avoids a full page reload
            router.replace('/login');
            return;
          }
          console.error('[UserContext] Failed to load user:', err);
          setError('Could not load user data. Is the API running?');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const refreshUser = useCallback(async (workspaceId?: string) => {
    try {
      const data = await fetchCurrentUser();
      setUser(data);

      if (workspaceId) {
        // Caller wants to explicitly switch to a specific workspace after refresh
        // (e.g., post invite-accept — land in the newly joined workspace)
        const target = data.workspaces.find((w) => w.workspaceId === workspaceId);
        setActiveWorkspace(target ?? data.defaultWorkspace);
        if (target) localStorage.setItem(STORAGE_KEY, workspaceId);
      } else {
        // Re-validate the current active workspace against the fresh membership list.
        // If it's no longer present (e.g., removed from workspace) fall back to the
        // server-computed default instead of keeping a stale reference.
        setActiveWorkspace((prev) => {
          if (!prev) return data.defaultWorkspace;
          const refreshed = data.workspaces.find((w) => w.workspaceId === prev.workspaceId);
          return refreshed ?? data.defaultWorkspace;
        });
      }
    } catch {
      // Ignore errors on background refresh
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setActiveWorkspace(null);
    // When Clerk is active, use its signOut so the session cookie is cleared.
    // In dev mode (no Clerk), soft-navigate to /login.
    type ClerkGlobal = { signOut: (opts?: { redirectUrl?: string }) => Promise<void> };
    const clerk = (window as typeof window & { Clerk?: ClerkGlobal }).Clerk;
    if (clerk?.signOut) {
      clerk.signOut({ redirectUrl: '/login' }).catch(() => {
        router.replace('/login');
      });
    } else {
      router.replace('/login');
    }
  }, [router]);

  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      if (!user) return;

      // Optimistic update — revert if server rejects
      const previous = activeWorkspace;
      const optimistic =
        user.workspaces.find((w) => w.workspaceId === workspaceId) ?? null;

      setSwitchingTo(optimistic);
      setActiveWorkspace(optimistic);

      try {
        // Server validates membership
        await Promise.all([
          switchWorkspaceApi(workspaceId),
          // Hold the overlay long enough to be seen. Without this the switch
          // finishes in a blink and nothing tells the user it happened.
          new Promise((resolve) => setTimeout(resolve, SWITCH_MIN_MS)),
        ]);
        // Persist selection
        localStorage.setItem(STORAGE_KEY, workspaceId);
      } catch (err) {
        // Revert on failure
        setActiveWorkspace(previous);
        throw err;
      } finally {
        setSwitchingTo(null);
      }
    },
    [user, activeWorkspace],
  );

  return (
    <UserContext.Provider
      value={{ user, activeWorkspace, isLoading, error, switchWorkspace, switchingTo, refreshUser, logout }}
    >
      {children}
    </UserContext.Provider>
  );
}

// ------------------------------------------------------------------ //
// Hook
// ------------------------------------------------------------------ //

/**
 * useUser() — access current user and active workspace from any client component.
 * Must be rendered inside <UserProvider>.
 */
export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error('useUser() must be called inside <UserProvider>');
  }
  return ctx;
}
