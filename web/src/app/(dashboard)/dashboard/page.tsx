'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/context/UserContext';
import { fetchWorkspaceSummary, fetchExpiringDocuments } from '@/lib/documents';
import { fetchWorkspaceActivity } from '@/lib/audit';
import { describeAuditLog, auditActionCategory } from '@/lib/audit';
import { cn, fullName } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import { bucketize, formatDate, isSnoozed, type ExpiryBucket } from '@/lib/expiry';
import ExpiryActions from '@/components/expiry/ExpiryActions';
import type { WorkspaceSummary, ExpiringDocument, AuditLog } from '@/types';

// ------------------------------------------------------------------ //
// Page
// ------------------------------------------------------------------ //

export default function DashboardPage() {
  const { activeWorkspace, user, isLoading: userLoading, error: userError } = useUser();
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
  const [expiring, setExpiring] = useState<ExpiringDocument[]>([]);
  const [activity, setActivity] = useState<AuditLog[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  useEffect(() => {
    if (!activeWorkspace) return;
    let cancelled = false;
    setDataLoading(true);

    Promise.all([
      fetchWorkspaceSummary(activeWorkspace.workspaceId),
      fetchExpiringDocuments(activeWorkspace.workspaceId),
      fetchWorkspaceActivity({ workspaceId: activeWorkspace.workspaceId, limit: 10 }),
    ])
      .then(([s, exp, act]) => {
        if (cancelled) return;
        setSummary(s);
        setExpiring(exp);
        setActivity(act);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => { if (!cancelled) setDataLoading(false); });

    return () => { cancelled = true; };
  }, [activeWorkspace?.workspaceId]);

  const loading = userLoading || dataLoading;
  if (loading) return <DashboardSkeleton />;

  // API unreachable — show a clear error rather than the misleading "No workspace" state
  if (userError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-red-50 flex items-center justify-center">
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" className="text-red-400">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h2 className="text-sm font-semibold text-gray-700">Could not connect to the API</h2>
        <p className="mt-1 text-xs text-gray-400 max-w-xs">{userError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // User has no accessible workspaces (new user, or removed from all workspaces)
  if (!activeWorkspace) {
    return <NoWorkspaceState />;
  }

  const hasExpired   = (summary?.expiredCount  ?? 0) > 0;
  const hasExpiring  = (summary?.expiringCount ?? 0) > 0;

  return (
    <div className="space-y-7">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="page-title">
            Welcome back{user ? `, ${user.firstName}` : ''}
          </h1>
          <p className="page-subtitle">
            {activeWorkspace.workspaceName} — here&apos;s your workspace at a glance.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href="/documents?upload=1"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors"
          >
            <UploadIcon className="text-white" />
            Upload
          </Link>
          <Link
            href="/documents"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-stroke text-xs font-medium text-gray-700 dark:text-ink-2 hover:bg-gray-50 dark:hover:bg-surface-high transition-colors"
          >
            <FolderIcon className="text-gray-500" />
            Documents
          </Link>
          <Link
            href="/members"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-stroke text-xs font-medium text-gray-700 dark:text-ink-2 hover:bg-gray-50 dark:hover:bg-surface-high transition-colors"
          >
            <UsersIcon className="text-gray-500" />
            Members
          </Link>
        </div>
      </div>

      {/* ── 6-stat KPI grid (2 → 3 → 6 columns) ────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard
          label="Documents"
          value={summary?.totalDocuments ?? 0}
          sub={summary ? `${summary.activeDocuments} active` : '—'}
          icon={<DocIcon />}
          color="brand"
          href="/documents"
        />
        <KpiCard
          label="Archived"
          value={summary?.archivedDocuments ?? 0}
          sub="documents"
          icon={<ArchiveIcon />}
          color="gray"
          href="/documents?status=archived"
        />
        <KpiCard
          label="Expiring"
          value={summary?.expiringCount ?? 0}
          sub="within 90 days"
          icon={<ClockIcon />}
          color={hasExpiring ? 'orange' : 'gray'}
          href="/reminders?tab=expiring"
        />
        <KpiCard
          label="Expired"
          value={summary?.expiredCount ?? 0}
          sub="need attention"
          icon={<AlertIcon />}
          color={hasExpired ? 'red' : 'gray'}
          href="/reminders?tab=expired"
        />
        <KpiCard
          label="Members"
          value={summary?.memberCount ?? 0}
          sub="in workspace"
          icon={<UsersIcon />}
          color="teal"
          href="/members"
        />
        <KpiCard
          label="Shares"
          value={summary?.activeShares ?? 0}
          sub="active links"
          icon={<ShareIcon />}
          color="purple"
        />
      </div>

      {/* ── Expiry radar ────────────────────────────────────────────── */}
      <ExpiryRadar
        docs={expiring}
        onChanged={(id, patch) =>
          setExpiring((prev) => prev.map((d) => {
            if (d.id !== id) return d;
            const next = { ...d, ...patch };
            if (patch.expiryDate) {
              next.daysUntilExpiry = Math.round((new Date(patch.expiryDate).getTime() - Date.now()) / 86_400_000);
            }
            return next;
          }))
        }
      />

      {/* ── Recent activity ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 items-start">

        <div className="bg-white dark:bg-surface rounded-xl border border-gray-200 dark:border-stroke overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-stroke">
            <div className="flex items-center gap-2">
              <ActivityIcon className="text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
              {summary?.recentUploads !== undefined && summary.recentUploads > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 text-[10px] font-semibold">
                  {summary.recentUploads} upload{summary.recentUploads !== 1 ? 's' : ''} this week
                </span>
              )}
            </div>
            <Link href="/activity" className="text-xs text-brand-600 hover:underline flex-shrink-0">
              View all →
            </Link>
          </div>
          {activity.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-gray-500 font-medium">No activity yet</p>
              <p className="text-xs text-gray-400 mt-1">Upload a document or invite a team member to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {activity.map((log) => {
                const category = auditActionCategory(log.action);
                const actor = log.user
                  ? fullName(log.user)
                  : 'External';
                const diff = Date.now() - new Date(log.createdAt).getTime();
                const m = Math.floor(diff / 60000);
                const ago =
                  m < 1 ? 'just now'
                  : m < 60 ? `${m}m`
                  : m < 1440 ? `${Math.floor(m / 60)}h`
                  : new Date(log.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                return (
                  <div key={log.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', DOT_COLORS[category])} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-800 truncate">{describeAuditLog(log)}</p>
                      <p className="text-[10px] text-gray-400">{actor}</p>
                    </div>
                    <span className="text-[10px] text-gray-400 whitespace-nowrap tabular-nums">{ago}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Expiry radar
// ------------------------------------------------------------------ //

const BUCKET_STYLE: Record<ExpiryBucket['id'], { tile: string; label: string; dot: string }> = {
  expired: { tile: 'border-stroke border-t-[3px] border-t-red-500',   label: 'text-red-700 dark:text-red-300',     dot: 'bg-red-500' },
  week:    { tile: 'border-stroke border-t-[3px] border-t-amber-500', label: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  month:   { tile: 'border-stroke border-t-[3px] border-t-brand-500', label: 'text-brand-700 dark:text-brand-300', dot: 'bg-brand-500' },
  quarter: { tile: 'border-stroke border-t-[3px] border-t-slate-400', label: 'text-ink-2',                         dot: 'bg-slate-400' },
};

const RADAR_ROWS = 6;

function ExpiryRadar({
  docs,
  onChanged,
}: {
  docs: ExpiringDocument[];
  onChanged: (id: string, patch: Partial<ExpiringDocument>) => void;
}) {
  const buckets = bucketize(docs);
  const nonEmpty = buckets.filter((b) => b.docs.length > 0);
  const [active, setActive] = useState<ExpiryBucket['id'] | null>(null);
  const current = (active && buckets.find((b) => b.id === active && b.docs.length > 0)) || nonEmpty[0] || null;
  const hasUrgent = buckets[0].docs.length > 0 || buckets[1].docs.length > 0;

  return (
    <section
      className={cn(
        'bg-white dark:bg-surface rounded-xl border overflow-hidden',
        hasUrgent ? 'border-orange-200 dark:border-orange-900/50' : 'border-gray-200 dark:border-stroke',
      )}
      aria-label="Expiry radar"
    >
      <div className="flex items-center justify-between px-5 py-3 border-b border-stroke-soft">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className={cn(
              'relative w-7 h-7 rounded-full border border-stroke overflow-hidden flex-shrink-0',
              hasUrgent ? 'bg-amber-500/10' : 'bg-surface-high',
            )}
          >
            <span className="absolute inset-[6px] rounded-full border border-stroke" />
            <span className="absolute inset-0 rounded-full animate-radar-sweep motion-reduce:animate-none [background:conic-gradient(from_0deg,rgba(45,212,191,0.55),transparent_80deg)]" />
            {hasUrgent && <span className="absolute left-[9px] top-[8px] w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444]" />}
          </span>
          <h2 className="text-sm font-bold text-ink">Expiry radar</h2>
          <span className="font-mono text-[11px] text-ink-3 hidden sm:inline">next 90 days</span>
        </div>
        <Link href="/reminders" className="text-xs font-semibold text-brand-600 dark:text-brand-300 hover:underline flex-shrink-0">
          All reminders →
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4">
        {buckets.map((b) => {
          const style = BUCKET_STYLE[b.id];
          const selected = current?.id === b.id;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setActive(b.id)}
              disabled={b.docs.length === 0}
              aria-pressed={selected}
              className={cn(
                'text-left rounded-[10px] border bg-surface p-3.5 transition-all disabled:opacity-60 disabled:cursor-default hover:shadow-card-md',
                style.tile,
                selected && 'ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-canvas',
              )}
            >
              <p className={cn('font-mono text-[10px] uppercase tracking-label', style.label)}>{b.label}</p>
              <p className="mt-1.5 text-[28px] font-extrabold leading-none tabular-nums text-ink">{b.docs.length}</p>
              <p className="mt-1.5 text-[10px] text-ink-3">{b.hint}</p>
            </button>
          );
        })}
      </div>

      {!current ? (
        <div className="px-4 pb-8 pt-2 text-center">
          <p className="text-sm text-green-600 font-medium">All clear</p>
          <p className="text-xs text-gray-400 mt-1">Nothing expires in the next 90 days.</p>
        </div>
      ) : (
        <div className="border-t border-gray-100 dark:border-stroke divide-y divide-gray-50">
          {current.docs.slice(0, RADAR_ROWS).map((doc) => {
            const isExpired = doc.daysUntilExpiry < 0;
            const isToday = doc.daysUntilExpiry === 0;
            const snoozed = isSnoozed(doc);
            return (
              <div key={doc.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5">
                <div className="flex-1 min-w-[10rem]">
                  <Link href={`/documents/${doc.id}`} className="text-xs font-medium text-gray-900 hover:text-brand-600 truncate block">
                    {doc.name}
                  </Link>
                  <p className="text-[10px] text-gray-400 truncate">
                    {doc.folderName ? `${doc.folderName} · ` : ''}{formatDate(doc.expiryDate)}
                    {snoozed && <span className="ml-1.5 text-amber-700">· emails paused until {formatDate(doc.remindersSnoozedUntil)}</span>}
                  </p>
                </div>
                <span className={cn(
                  'text-[10px] font-bold whitespace-nowrap tabular-nums w-14 text-right',
                  isExpired || isToday ? 'text-red-600' : doc.daysUntilExpiry <= 7 ? 'text-orange-600' : 'text-yellow-700',
                )}>
                  {isExpired ? `${Math.abs(doc.daysUntilExpiry)}d over` : isToday ? 'Today' : `${doc.daysUntilExpiry}d`}
                </span>
                <ExpiryActions doc={doc} onChanged={(patch) => onChanged(doc.id, patch)} />
              </div>
            );
          })}
          {current.docs.length > RADAR_ROWS && (
            <Link href={`/reminders?tab=${current.id === 'expired' ? 'expired' : 'expiring'}`} className="block px-5 py-2.5 text-xs text-brand-600 hover:underline">
              {current.docs.length - RADAR_ROWS} more in {current.label.toLowerCase()} →
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ //
// KPI Card
// ------------------------------------------------------------------ //

const COLOR_ICON: Record<string, string> = {
  brand:  'bg-brand-50',
  orange: 'bg-orange-50',
  red:    'bg-red-50',
  purple: 'bg-purple-50',
  teal:   'bg-teal-50',
  gray:   'bg-gray-50',
};

const COLOR_VALUE: Record<string, string> = {
  brand:  'text-brand-600',
  orange: 'text-orange-600',
  red:    'text-red-600',
  purple: 'text-purple-600',
  teal:   'text-teal-600',
  gray:   'text-gray-700',
};

const DOT_COLORS: Record<string, string> = {
  create:   'bg-green-500',
  update:   'bg-blue-500',
  delete:   'bg-red-500',
  share:    'bg-purple-500',
  download: 'bg-amber-500',
  member:   'bg-teal-500',
};

function KpiCard({
  label,
  value,
  sub,
  icon,
  color,
  href,
}: {
  label: string;
  value: number;
  sub: string;
  icon: React.ReactNode;
  color: string;
  href?: string;
}) {
  const content = (
    <div className={cn(
      'bg-surface rounded-xl border border-stroke p-5 transition-all duration-150',
      href && 'group-hover:shadow-card-md group-hover:-translate-y-0.5',
    )}>
      <div className="flex items-center justify-between mb-3">
        <p className="font-mono text-[10px] uppercase tracking-label text-ink-3 leading-none">{label}</p>
        <div className={cn('w-6 h-6 rounded-md flex items-center justify-center transition-transform duration-150', COLOR_ICON[color], href && 'group-hover:scale-110')}>
          <span className={cn(COLOR_VALUE[color], '[&_svg]:w-3 [&_svg]:h-3')}>{icon}</span>
        </div>
      </div>
      <p className={cn('text-[28px] font-extrabold leading-none tabular-nums tracking-[-0.02em]', color === 'gray' || color === 'brand' ? 'text-ink' : COLOR_VALUE[color])}>{value}</p>
      <p className="mt-2 text-[10px] text-ink-3 truncate">{sub}</p>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block group rounded-xl">
        {content}
      </Link>
    );
  }
  return content;
}

// ------------------------------------------------------------------ //
// Skeleton
// ------------------------------------------------------------------ //

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-6 w-44 bg-gray-200 rounded mb-1.5" />
          <div className="h-3 w-64 bg-gray-100 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-20 bg-gray-200 rounded-lg" />
          <div className="h-8 w-24 bg-gray-100 rounded-lg" />
          <div className="h-8 w-20 bg-gray-100 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 h-24" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 h-72" />
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 h-72" />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Icons
// ------------------------------------------------------------------ //

function DocIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string } = {}) {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" strokeLinecap="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string } = {}) {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className={className}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string } = {}) {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className={className}>
      <path d="M4 16.004V17a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1M16 8l-4-4-4 4M12 4v12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string } = {}) {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className={className}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ActivityIcon({ className }: { className?: string } = {}) {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className={className}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ------------------------------------------------------------------ //
// No workspace state — with inline create form
// ------------------------------------------------------------------ //

function NoWorkspaceState() {
  const { refreshUser } = useUser();
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const { apiFetch } = await import('@/lib/api');
      const created = await apiFetch<{ id: string; name: string }>('/api/v1/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
      });
      toast.success(`Workspace "${created.name}" created!`);
      // refreshUser(id) atomically re-fetches user AND activates the new workspace
      await refreshUser(created.id);
    } catch {
      toast.error('Failed to create workspace. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gray-100 flex items-center justify-center">
        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" className="text-gray-400">
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        </svg>
      </div>
      <h2 className="text-sm font-semibold text-gray-700">No workspace selected</h2>
      <p className="mt-1 text-xs text-gray-400 max-w-xs">
        You don&apos;t belong to any workspace yet. Create one to get started.
      </p>

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          Create Workspace
        </button>
      ) : (
        <form onSubmit={handleCreate} className="mt-5 flex flex-col items-center gap-2 w-full max-w-xs">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workspace name"
            maxLength={60}
            required
            autoFocus
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <div className="flex gap-2 w-full">
            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="flex-1 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-500 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
