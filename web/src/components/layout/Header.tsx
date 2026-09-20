'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useSidebar } from '@/context/SidebarContext';
import { cn, fullName, initialsOf } from '@/lib/utils';

// ------------------------------------------------------------------ //
// Theme hook — reads/writes localStorage, toggles .dark on <html>
// ------------------------------------------------------------------ //

function useTheme() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Read initial state from the html class (set by inline script in layout)
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('dd-theme', next ? 'dark' : 'light'); } catch { /* noop */ }
  }

  return { isDark, toggle };
}

// ------------------------------------------------------------------ //
// Page title resolver
// ------------------------------------------------------------------ //

const TITLE_MAP: [string, string][] = [
  ['/dashboard',  'Dashboard'],
  ['/documents',  'Documents'],
  ['/workspaces', 'Workspaces'],
  ['/members',    'Members'],
  ['/reminders',  'Reminders'],
  ['/reports',    'Reports'],
  ['/activity',   'Activity'],
  ['/settings',   'Settings'],
  ['/admin',      'Platform admin'],
  ['/plans',      'Plans'],
];

function resolveTitle(pathname: string): string {
  const match = TITLE_MAP.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + '/'));
  return match?.[1] ?? 'DockyDoc';
}

// ------------------------------------------------------------------ //
// Header
// ------------------------------------------------------------------ //

export default function Header() {
  const { user, isLoading, logout } = useUser();
  const { toggle: toggleSidebar } = useSidebar();
  const { isDark, toggle: toggleTheme } = useTheme();
  const pathname = usePathname();

  const pageTitle = resolveTitle(pathname);
  const initials = initialsOf(user);
  const name = fullName(user);

  return (
    <header className="h-[52px] bg-surface border-b border-stroke flex items-center gap-3 px-4 flex-shrink-0">
      {/* Mobile hamburger — hidden on desktop */}
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
        className="lg:hidden w-8 h-8 flex items-center justify-center rounded-md text-ink-3 hover:bg-surface-high transition-colors"
      >
        <HamburgerIcon />
      </button>

      {/* Page title */}
      <div className="flex-1 min-w-0">
        {isLoading ? (
          <div className="h-4 w-24 bg-surface-high rounded animate-pulse" />
        ) : (
          <span className="text-[13px] font-bold text-ink truncate">
            {pageTitle}
          </span>
        )}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <HeaderSearch />
        <Link href="/documents?upload=1" className="btn-primary h-8 px-3 py-0 text-xs">
          Upload
        </Link>

        <div className="w-px h-5 bg-stroke mx-1" />

        {/* Dark mode toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className={cn(
            'w-8 h-8 flex items-center justify-center rounded-md transition-all duration-150',
            'text-ink-3 hover:bg-surface-high hover:text-ink active:scale-90',
          )}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>

        {/* User avatar */}
        <div
          title={user ? `${name} — ${user.email}` : ''}
          className="w-7 h-7 rounded-full bg-brand-400/20 flex items-center justify-center text-[11px] font-extrabold text-brand-700 dark:text-brand-300 flex-shrink-0 select-none"
          role="img"
          aria-label={name || 'User'}
        >
          {isLoading ? '…' : initials}
        </div>

        {/* Logout */}
        <button
          type="button"
          onClick={logout}
          title="Sign out"
          aria-label="Sign out"
          className={cn(
            'w-8 h-8 flex items-center justify-center rounded-md transition-all duration-150',
            'text-ink-3 hover:bg-surface-high hover:text-ink active:scale-90',
          )}
        >
          <LogoutIcon />
        </button>
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ //
// Search — a real input, not a link that pretended to be one
// ------------------------------------------------------------------ //

function HeaderSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  // ⌘K / Ctrl-K focuses the box from anywhere in the app
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        inputRef.current?.blur();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Leaving the documents page clears the box, so it never shows a stale query
  useEffect(() => {
    if (!pathname.startsWith('/documents')) setValue('');
  }, [pathname]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    router.push(`/documents?q=${encodeURIComponent(q)}`);
  }

  return (
    <form onSubmit={submit} className="hidden md:block" role="search">
      <div className="relative w-60">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none">
          <SearchIcon />
        </span>
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search documents…"
          aria-label="Search documents"
          className="h-8 w-full rounded-lg bg-surface-high border border-stroke pl-8 pr-12 text-xs text-ink placeholder:text-ink-3"
        />
        {value ? (
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[10px] font-semibold text-brand-600 dark:text-brand-300 hover:underline"
          >
            Search
          </button>
        ) : (
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] px-1.5 py-0.5 rounded border border-stroke text-ink-3 pointer-events-none">
            ⌘K
          </kbd>
        )}
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ //
// Icons
// ------------------------------------------------------------------ //

function HamburgerIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
