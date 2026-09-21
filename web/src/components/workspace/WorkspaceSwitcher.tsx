'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/context/UserContext';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';

/**
 * WorkspaceSwitcher — workspace selector in the sidebar.
 * Styled for the dark sidebar context.
 */
export default function WorkspaceSwitcher() {
  const { user, activeWorkspace, switchWorkspace } = useUser();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  if (!user || !activeWorkspace) {
    return (
      <div className="px-2 py-2 space-y-1.5">
        <div className="h-3.5 w-28 bg-white/[0.08] rounded animate-pulse" />
        <div className="h-3 w-20 bg-white/[0.05] rounded animate-pulse" />
      </div>
    );
  }

  async function handleSwitch(id: string) {
    if (id === activeWorkspace?.workspaceId || switching) return;
    setSwitching(id);
    try {
      await switchWorkspace(id);
      const ws = user?.workspaces.find((w) => w.workspaceId === id);
      toast.success(ws ? `Switched to "${ws.workspaceName}".` : 'Workspace switched.');
    } catch {
      toast.error('Failed to switch workspace.');
    } finally {
      setSwitching(null);
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all duration-150 text-left',
          open ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05] active:bg-white/[0.11]',
        )}
      >
        <div className="w-7 h-7 rounded-md bg-brand-600/70 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-xs font-bold">
            {activeWorkspace.workspaceName[0].toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white leading-tight line-clamp-2 break-words" title={activeWorkspace.workspaceName}>
            {activeWorkspace.workspaceName}
          </p>
          <p className="font-mono text-[10px] text-slate-400 truncate leading-tight mt-0.5 uppercase tracking-label">
            {activeWorkspace.workspaceType.slice(0, 3)} &middot; {activeWorkspace.role}
          </p>
        </div>
        <svg
          className={cn('flex-shrink-0 text-white/30 transition-transform duration-150', open && 'rotate-180')}
          width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown — renders at document level via portal-like absolute positioning */}
      {open && (
        <div
          role="listbox"
          aria-label="Switch workspace"
          className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-surface border border-gray-200 dark:border-stroke rounded-xl shadow-lg overflow-hidden z-[60] animate-dropdown"
        >
          <div className="px-3 py-2 border-b border-gray-100 dark:border-stroke">
            <p className="text-[10px] font-semibold text-gray-400 dark:text-ink-3 uppercase tracking-widest">
              {user.workspaces.length > 1 ? 'Switch workspace' : 'Workspaces'}
            </p>
          </div>
          <ul className="py-1 max-h-56 overflow-y-auto">
            {user.workspaces.map((ws) => {
              const isActive = ws.workspaceId === activeWorkspace.workspaceId;
              const isLoading = switching === ws.workspaceId;
              return (
                <li key={ws.workspaceId}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => handleSwitch(ws.workspaceId)}
                    disabled={isLoading}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all duration-100',
                      isActive ? 'bg-brand-50 dark:bg-brand-900/20' : 'hover:bg-gray-50 dark:hover:bg-surface-high active:bg-gray-100 dark:active:bg-surface-high',
                      isLoading && 'opacity-60 cursor-wait',
                    )}
                  >
                    <div className={cn(
                      'w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 text-[10px] font-bold',
                      isActive ? 'bg-brand-600 text-white' : 'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-ink-2',
                    )}>
                      {ws.workspaceName[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        'text-sm font-medium truncate',
                        isActive ? 'text-brand-700 dark:text-brand-400' : 'text-gray-900 dark:text-ink',
                      )}>
                        {ws.workspaceName}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-ink-3">{ws.role}</p>
                    </div>
                    {isActive && (
                      <svg className="flex-shrink-0 text-brand-600" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                    {isLoading && (
                      <svg className="flex-shrink-0 text-gray-400 animate-spin" width="13" height="13" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <Link
            href="/workspaces"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 border-t border-gray-100 dark:border-stroke text-xs font-semibold text-brand-600 dark:text-brand-300 hover:bg-gray-50 dark:hover:bg-surface-high"
          >
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Manage workspaces
          </Link>
        </div>
      )}
    </div>
  );
}
