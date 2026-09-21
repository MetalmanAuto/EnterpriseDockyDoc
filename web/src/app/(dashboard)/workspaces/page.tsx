'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/context/UserContext';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import type { WorkspaceListItem, WorkspaceType } from '@/types';

const TYPE_BADGE: Record<WorkspaceType, { label: string; class: string }> = {
  ENTERPRISE: { label: 'Enterprise', class: 'bg-purple-100 text-purple-700' },
  PERSONAL:   { label: 'Personal',   class: 'bg-blue-100 text-blue-700' },
  FAMILY:     { label: 'Family',     class: 'bg-green-100 text-green-700' },
};

export default function WorkspacesPage() {
  const { user, activeWorkspace, switchWorkspace, refreshUser, isLoading: userLoading } = useUser();
  const toast = useToast();
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [justSwitched, setJustSwitched] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Create workspace state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    apiFetch<WorkspaceListItem[]>('/api/v1/workspaces')
      .then(setWorkspaces)
      .catch(() => setError('Failed to load workspaces.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSwitch(id: string) {
    if (id === activeWorkspace?.workspaceId) return;
    setSwitching(id);
    try {
      await switchWorkspace(id);
      const ws = workspaces.find((w) => w.id === id);
      toast.success(ws ? `Switched to "${ws.name}".` : 'Workspace switched.');
      setJustSwitched(id);
      setTimeout(() => setJustSwitched(null), 2500);
    } catch {
      toast.error('Failed to switch workspace. Please try again.');
    } finally {
      setSwitching(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const created = await apiFetch<WorkspaceListItem>('/api/v1/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setWorkspaces((prev) => [created, ...prev]);
      setNewName('');
      setShowCreate(false);
      toast.success(`Workspace "${created.name}" created.`);
      // refreshUser(id) atomically re-fetches the user AND switches to the new workspace
      await refreshUser(created.id);
    } catch {
      toast.error('Failed to create workspace. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  if (userLoading || loading) return <PageSkeleton />;

  const sorted = [...workspaces].sort((a, b) => {
    const aA = a.id === activeWorkspace?.workspaceId ? 0 : 1;
    const bA = b.id === activeWorkspace?.workspaceId ? 0 : 1;
    return aA - bA;
  });

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Workspaces</h1>
          <p className="page-subtitle">
            {user?.firstName} {user?.lastName} &middot; {workspaces.length} workspace
            {workspaces.length !== 1 ? 's' : ''}
          </p>
          {activeWorkspace && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-50 border border-brand-200 text-xs text-brand-700 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
              Active: {activeWorkspace.workspaceName}
            </div>
          )}
        </div>

        {/* Create button */}
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white dark:bg-brand-400 dark:text-slate-900 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-brand-300 transition-colors"
        >
          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          New Workspace
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="mb-5 rounded-xl border border-brand-200 bg-brand-50 p-4 flex items-end gap-3"
        >
          <div className="flex-1">
            <label className="block text-xs font-medium text-ink-2 mb-1">
              Workspace name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. My Documents"
              maxLength={60}
              required
              autoFocus
              className="w-full h-9 rounded-lg border border-stroke bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="px-4 py-1.5 rounded-lg bg-slate-900 text-white dark:bg-brand-400 dark:text-slate-900 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-brand-300 disabled:opacity-50 transition-colors"
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => { setShowCreate(false); setNewName(''); }}
            className="px-3 py-1.5 rounded-lg border border-stroke text-xs text-ink-3 hover:bg-surface-high transition-colors"
          >
            Cancel
          </button>
        </form>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Empty state */}
      {workspaces.length === 0 && !error && (
        <div className="py-16 text-center rounded-xl border-2 border-dashed border-stroke">
          <p className="text-sm text-ink-3 mb-3">You don&apos;t have any workspaces yet.</p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white dark:bg-brand-400 dark:text-slate-900 text-sm font-semibold hover:bg-slate-800 dark:hover:bg-brand-300 transition-colors"
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Create your first workspace
          </button>
        </div>
      )}

      <div className="space-y-3">
        {sorted.map((ws) => {
          const badge      = TYPE_BADGE[ws.type];
          const isActive   = ws.id === activeWorkspace?.workspaceId;
          const isNew      = ws.id === justSwitched;
          const membership = user?.workspaces.find((m) => m.workspaceId === ws.id);

          return (
            <div
              key={ws.id}
              className={cn(
                'relative flex items-center justify-between rounded-xl border p-4 transition-all duration-300',
                'border-l-4',
                isActive && !isNew
                  ? 'border-l-brand-600 border-t-brand-300 border-r-brand-300 border-b-brand-300 bg-brand-50 dark:bg-brand-900/20 dark:border-brand-700/40 shadow-sm'
                  : isNew
                  ? 'border-l-green-500 border-t-green-200 border-r-green-200 border-b-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-700/40 shadow-sm'
                  : 'border-l-stroke border-stroke bg-surface hover:border-ink-3 hover:shadow-card-md hover:-translate-y-px',
              )}
            >
              {/* Left */}
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 transition-colors duration-300',
                    isNew
                      ? 'bg-green-500 text-white'
                      : isActive
                      ? 'bg-brand-600 text-white'
                      : 'bg-surface-high text-ink-3',
                  )}
                >
                  {isNew ? (
                    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    ws.name.slice(0, 2).toUpperCase()
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-ink truncate">{ws.name}</p>
                    {isNew && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-500 text-white">
                        Switched ✓
                      </span>
                    )}
                    {isActive && !isNew && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-600 text-white">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={cn('inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded', badge.class)}>
                      {badge.label}
                    </span>
                    <span className="text-xs text-ink-3">
                      {ws.memberCount} member{ws.memberCount !== 1 ? 's' : ''}
                    </span>
                    {membership && (
                      <span className="text-xs text-ink-3 capitalize">
                        · {membership.role.toLowerCase()}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right — action button */}
              <button
                type="button"
                onClick={() => handleSwitch(ws.id)}
                disabled={isActive || isNew || switching === ws.id}
                className={cn(
                  'flex-shrink-0 ml-4 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                  isNew
                    ? 'bg-green-500 text-white cursor-default'
                    : isActive
                    ? 'bg-brand-600 text-white cursor-default'
                    : switching === ws.id
                    ? 'border border-stroke text-ink-3 cursor-wait'
                    : 'border border-stroke text-ink-2 hover:bg-surface-high hover:border-ink-3 active:scale-95',
                )}
              >
                {switching === ws.id ? (
                  <span className="flex items-center gap-1.5">
                    <Spinner />
                    Switching…
                  </span>
                ) : isNew ? (
                  <span className="flex items-center gap-1">
                    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Switched
                  </span>
                ) : isActive ? (
                  <span className="flex items-center gap-1">
                    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Current
                  </span>
                ) : (
                  'Switch'
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="11" height="11" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function PageSkeleton() {
  return (
    <div className="max-w-5xl animate-pulse">
      <div className="h-7 w-40 bg-stroke rounded mb-2" />
      <div className="h-4 w-56 bg-surface-high rounded mb-3" />
      <div className="h-7 w-44 bg-brand-100 rounded mb-6" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 bg-surface-high rounded-xl border-l-4 border-l-stroke" />
        ))}
      </div>
    </div>
  );
}
