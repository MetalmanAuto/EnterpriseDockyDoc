'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Logo from '@/components/brand/Logo';
import { usePathname } from 'next/navigation';
import { cn, fullName, initialsOf } from '@/lib/utils';
import { useUser } from '@/context/UserContext';
import { useSidebar } from '@/context/SidebarContext';
import WorkspaceSwitcher from '@/components/workspace/WorkspaceSwitcher';

// ------------------------------------------------------------------ //
// Navigation definition
// ------------------------------------------------------------------ //

interface NavItem {
  label: string;
  href: string;
  Icon: (props: { active: boolean }) => React.ReactElement;
}

const NAV: NavItem[] = [
  { label: 'Dashboard',  href: '/dashboard',  Icon: GridIcon },
  { label: 'Documents',  href: '/documents',  Icon: DocIcon },
  { label: 'Assistant',  href: '/assistant',  Icon: SparkIcon },
  { label: 'Workspaces', href: '/workspaces', Icon: LayersIcon },
  { label: 'Members',    href: '/members',    Icon: UsersIcon },
  { label: 'Reminders',  href: '/reminders',  Icon: BellIcon },
  { label: 'Reports',    href: '/reports',    Icon: BarChartIcon },
  { label: 'Activity',   href: '/activity',   Icon: ActivityIcon },
  { label: 'Settings',   href: '/settings',   Icon: GearIcon },
];

/** Only shown to platform admins (PLATFORM_ADMIN_EMAILS on the API). */
const ADMIN_ITEM: NavItem = { label: 'Platform admin', href: '/admin', Icon: ShieldIcon };

// ------------------------------------------------------------------ //
// Sidebar
// ------------------------------------------------------------------ //

export default function Sidebar() {
  const pathname = usePathname();
  const { user, activeWorkspace, isLoading } = useUser();
  const { isOpen, close } = useSidebar();

  // Auto-close on navigation (mobile)
  useEffect(() => {
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const initials = initialsOf(user);
  const navItems = user?.isPlatformAdmin ? [...NAV, ADMIN_ITEM] : NAV;

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          aria-hidden
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden animate-backdrop"
          onClick={close}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          // Always dark, regardless of light/dark mode — matches new cool canvas
          'fixed inset-y-0 left-0 z-50 flex flex-col w-[220px] flex-shrink-0',
          'bg-[#0f172a] border-r border-slate-400/[0.12]',
          // Slide in/out on mobile; always visible on desktop
          'transition-transform duration-200 ease-out',
          'lg:static lg:translate-x-0 lg:z-auto',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* ── Logo bar ─────────────────────────────────────────────── */}
        <Link href="/dashboard" className="flex items-center px-4 h-[52px] border-b border-slate-400/[0.12] flex-shrink-0">
          <Logo size={26} motion="hover" />
        </Link>

        {/* ── Active workspace — click to switch ───────────────────── */}
        <div className="px-3 pt-3 pb-2 flex-shrink-0">
          <WorkspaceSwitcher />
        </div>

        {/* ── Navigation ───────────────────────────────────────────── */}
        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
          {navItems.map(({ label, href, Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'group relative flex items-center gap-2.5 px-3 h-9 rounded-md text-[13px] font-semibold transition-all duration-150',
                  active
                    ? 'bg-brand-400/[0.14] text-brand-100 shadow-[inset_3px_0_0_#2dd4bf]'
                    : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-100',
                )}
              >
                <span className="flex-shrink-0">
                  <Icon active={active} />
                </span>
                {label}
              </Link>
            );
          })}
        </nav>

        {/* ── User footer ──────────────────────────────────────────── */}
        <div className="px-4 py-3.5 border-t border-slate-400/[0.12] flex-shrink-0">
          {isLoading ? (
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-white/[0.08] animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-24 bg-white/[0.08] rounded animate-pulse" />
                <div className="h-2.5 w-32 bg-white/[0.05] rounded animate-pulse" />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-brand-400/20 flex items-center justify-center flex-shrink-0">
                <span className="text-brand-300 text-[10px] font-extrabold">{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-100 truncate">
                  {user ? fullName(user) : '—'}
                </p>
                <p className="text-[10px] text-slate-500 truncate">{user?.email ?? '—'}</p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// ------------------------------------------------------------------ //
// Nav icons — slightly filled stroke for a premium feel
// ------------------------------------------------------------------ //

function GridIcon({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function SparkIcon({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} viewBox="0 0 24 24">
      <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.3l-1.9-5.5L4.5 10.9 10.1 9z" strokeLinejoin="round" />
      <path d="M18.5 3.5v3M20 5h-3" strokeLinecap="round" />
    </svg>
  );
}

function DocIcon({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} viewBox="0 0 24 24">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" strokeLinejoin="round" />
      <line x1="8" y1="13" x2="16" y2="13" strokeLinecap="round" />
      <line x1="8" y1="17" x2="12" y2="17" strokeLinecap="round" />
    </svg>
  );
}

function LayersIcon({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} viewBox="0 0 24 24">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="2 12 12 17 22 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UsersIcon({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} viewBox="0 0 24 24">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" strokeLinecap="round" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" />
    </svg>
  );
}

function BellIcon({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} viewBox="0 0 24 24">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function BarChartIcon({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 17V11M12 17V7M16 17v-5" strokeLinecap="round" />
    </svg>
  );
}

function ActivityIcon({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} viewBox="0 0 24 24">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldIcon({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} viewBox="0 0 24 24">
      <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function GearIcon({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
