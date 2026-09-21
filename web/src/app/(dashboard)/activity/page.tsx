'use client';

import { useEffect, useRef, useState } from 'react';
import { useUser } from '@/context/UserContext';
import {
  fetchWorkspaceActivity,
  describeAuditLog,
  auditActionCategory,
  formatAuditAction,
} from '@/lib/audit';
import { cn, fullName } from '@/lib/utils';
import { apiDownload, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import type { AuditAction, AuditEntityType, AuditLog } from '@/types';

// ------------------------------------------------------------------ //
// Constants
// ------------------------------------------------------------------ //

const PAGE_SIZE = 10;

const CATEGORY_DOT: Record<string, string> = {
  create:   'bg-green-500',
  update:   'bg-blue-500',
  delete:   'bg-red-500',
  share:    'bg-purple-500',
  download: 'bg-amber-500',
  member:   'bg-teal-500',
};

const CATEGORY_RING: Record<string, string> = {
  create:   'ring-green-100',
  update:   'ring-blue-100',
  delete:   'ring-red-100',
  share:    'ring-purple-100',
  download: 'ring-amber-100',
  member:   'ring-teal-100',
};

const CATEGORY_PILL: Record<string, string> = {
  create:   'bg-green-50 text-green-700',
  update:   'bg-blue-50 text-blue-700',
  delete:   'bg-red-50 text-red-700',
  share:    'bg-purple-50 text-purple-700',
  download: 'bg-amber-50 text-amber-700',
  member:   'bg-teal-50 text-teal-700',
};

const ENTITY_FILTER_OPTIONS: { label: string; value: AuditEntityType | '' }[] = [
  { label: 'All types',   value: '' },
  { label: 'Documents',  value: 'DOCUMENT' },
  { label: 'Shares',     value: 'SHARE' },
  { label: 'Reminders',  value: 'REMINDER' },
  { label: 'Members',    value: 'USER' },
];

const ACTION_FILTER_OPTIONS: { label: string; value: AuditAction | '' }[] = [
  { label: 'All actions',       value: '' },
  { label: 'Created',           value: 'DOCUMENT_CREATED' },
  { label: 'Updated',           value: 'DOCUMENT_UPDATED' },
  { label: 'Deleted',           value: 'DOCUMENT_DELETED' },
  { label: 'New version',       value: 'DOCUMENT_VERSION_ADDED' },
  { label: 'Downloaded',        value: 'DOCUMENT_DOWNLOADED' },
  { label: 'Shared internally', value: 'DOCUMENT_SHARED_INTERNAL' },
  { label: 'External link',     value: 'DOCUMENT_SHARED_EXTERNAL' },
  { label: 'Share revoked',     value: 'SHARE_REVOKED' },
  { label: 'Reminder updated',  value: 'REMINDER_UPDATED' },
  { label: 'Member added',      value: 'MEMBER_ADDED' },
  { label: 'Role updated',      value: 'MEMBER_ROLE_UPDATED' },
];

const DATE_RANGE_OPTIONS: { label: string; days: number }[] = [
  { label: 'All time',    days: 0   },
  { label: 'Last 24h',   days: 1   },
  { label: 'Last 7d',    days: 7   },
  { label: 'Last 30d',   days: 30  },
  { label: 'Last 90d',   days: 90  },
];

// ------------------------------------------------------------------ //
// Date grouping helper
// ------------------------------------------------------------------ //

function groupByDate(logs: AuditLog[]): { label: string; items: AuditLog[] }[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;

  const today: AuditLog[] = [];
  const yesterday: AuditLog[] = [];
  const older: AuditLog[] = [];

  for (const log of logs) {
    const t = new Date(log.createdAt).getTime();
    if (t >= todayStart) today.push(log);
    else if (t >= yesterdayStart) yesterday.push(log);
    else older.push(log);
  }

  return [
    ...(today.length     ? [{ label: 'Today',     items: today     }] : []),
    ...(yesterday.length ? [{ label: 'Yesterday', items: yesterday }] : []),
    ...(older.length     ? [{ label: 'Older',     items: older     }] : []),
  ];
}

// ------------------------------------------------------------------ //
// Page
// ------------------------------------------------------------------ //

export default function ActivityPage() {
  const { activeWorkspace } = useUser();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    if (!activeWorkspace) return;
    setExporting(true);
    try {
      await apiDownload(`/api/v1/audit/export?workspaceId=${activeWorkspace.workspaceId}`, 'dockydoc-activity.csv');
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      toast.error(status === 402 ? 'Activity export is part of the Business plan and above. See Plans to upgrade.' : err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  }
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loadedCount, setLoadedCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasLoadedOnce = useRef(false);

  // Filters
  const [entityType, setEntityType] = useState<AuditEntityType | ''>('');
  const [action, setAction] = useState<AuditAction | ''>('');
  const [dateRangeDays, setDateRangeDays] = useState(0);

  const hasFilters = entityType !== '' || action !== '' || dateRangeDays !== 0;

  function clearFilters() {
    setEntityType('');
    setAction('');
    setDateRangeDays(0);
  }

  // Build dateFrom from selected range
  function buildDateFrom(days: number): string | undefined {
    if (!days) return undefined;
    return new Date(Date.now() - days * 86400000).toISOString();
  }

  // Initial/filter-change load — resets and fetches first page
  useEffect(() => {
    if (!activeWorkspace) return;
    let cancelled = false;
    setLoading(true);
    setLogs([]);
    setLoadedCount(0);
    setHasMore(false);

    fetchWorkspaceActivity({
      workspaceId: activeWorkspace.workspaceId,
      entityType: entityType || undefined,
      action: action || undefined,
      limit: PAGE_SIZE,
      offset: 0,
      dateFrom: buildDateFrom(dateRangeDays),
    })
      .then((data) => {
        if (!cancelled) {
          setLogs(data);
          setLoadedCount(data.length);
          setHasMore(data.length === PAGE_SIZE);
        }
      })
      .catch(() => { if (!cancelled) setLogs([]); })
      .finally(() => {
        if (!cancelled) {
          hasLoadedOnce.current = true;
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.workspaceId, entityType, action, dateRangeDays]);

  async function loadMore() {
    if (!activeWorkspace || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchWorkspaceActivity({
        workspaceId: activeWorkspace.workspaceId,
        entityType: entityType || undefined,
        action: action || undefined,
        limit: PAGE_SIZE,
        offset: loadedCount,
        dateFrom: buildDateFrom(dateRangeDays),
      });
      setLogs((prev) => [...prev, ...data]);
      setLoadedCount((c) => c + data.length);
      setHasMore(data.length === PAGE_SIZE);
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  }

  const showSkeleton = loading && !hasLoadedOnce.current;
  const groups = groupByDate(logs);

  // "Older" group is collapsed by default — expands on click
  const [olderExpanded, setOlderExpanded] = useState(false);

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Activity</h1>
          <p className="page-subtitle">
            A full audit trail of who did what, and when, across all documents and members.
          </p>
        </div>
        {(activeWorkspace?.role === 'ADMIN' || activeWorkspace?.role === 'OWNER') && (
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-stroke bg-surface text-sm font-medium text-ink-2 hover:bg-surface-high disabled:opacity-50 flex-shrink-0"
            title="Download the whole log as a CSV file (Business plan and above)"
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {exporting ? 'Preparing…' : 'Export CSV'}
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="bg-surface rounded-xl border border-stroke px-5 py-4 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          {/* Entity type */}
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as AuditEntityType | '')}
            className="h-9 rounded-lg border border-stroke bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {ENTITY_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Action */}
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as AuditAction | '')}
            className="h-9 rounded-lg border border-stroke bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {ACTION_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Date range */}
          <div className="flex items-center gap-1 bg-surface-high rounded-lg p-0.5">
            {DATE_RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.days}
                type="button"
                onClick={() => setDateRangeDays(opt.days)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150',
                  dateRangeDays === opt.days
                    ? 'bg-surface text-ink shadow-card'
                    : 'text-ink-3 hover:text-ink',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto text-xs text-ink-3 hover:text-ink px-2.5 py-1.5 rounded-lg border border-stroke hover:border-ink-3 transition-colors"
            >
              Clear
            </button>
          )}

          {loading && hasLoadedOnce.current && (
            <svg className="animate-spin text-brand-500 ml-1" width="13" height="13" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>
      </div>

      {/* Content */}
      {showSkeleton ? (
        <ActivitySkeleton />
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-14 px-6">
          <div className="w-11 h-11 rounded-full bg-surface-high flex items-center justify-center mx-auto mb-3">
            <ClockIcon className="text-ink-3" />
          </div>
          <p className="text-sm font-medium text-ink-2 mb-1">
            {hasFilters ? 'No matching activity' : 'No activity yet'}
          </p>
          <p className="text-xs text-ink-3 max-w-xs leading-relaxed">
            {hasFilters
              ? 'Try adjusting or clearing your filters to see more results.'
              : 'Every action in this workspace — uploads, edits, shares, member changes, and downloads — appears here automatically.'}
          </p>
          {hasFilters && (
            <button onClick={clearFilters} className="mt-3 text-xs text-brand-600 hover:underline font-medium">
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div>
          {/* Grouped timeline */}
          {groups.map((group) => {
            const isOlder = group.label === 'Older';
            const collapsed = isOlder && !olderExpanded;
            return (
              <div key={group.label} className="mb-7">
                {/* Group header */}
                <button
                  type="button"
                  onClick={isOlder ? () => setOlderExpanded((v) => !v) : undefined}
                  className={cn(
                    'flex items-center gap-3 mb-3 w-full text-left',
                    isOlder && 'cursor-pointer group',
                  )}
                >
                  <span className={cn(
                    'font-mono text-[10px] uppercase tracking-label',
                    isOlder ? 'text-ink-3 group-hover:text-ink-2 transition-colors' : 'text-ink-3',
                  )}>
                    {group.label}
                  </span>
                  <div className="flex-1 h-px bg-surface-high" />
                  <span className="text-[10px] text-ink-3 tabular-nums">{group.items.length}</span>
                  {isOlder && (
                    <svg
                      width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2}
                      viewBox="0 0 24 24"
                      className={cn('text-ink-3 transition-transform duration-200 flex-shrink-0', olderExpanded ? 'rotate-180' : '')}
                    >
                      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>

                {/* Items — hidden when older group is collapsed */}
                {!collapsed && (
                  <div className="bg-surface rounded-xl border border-stroke divide-y divide-stroke-soft overflow-hidden">
                    {group.items.map((log) => (
                      <ActivityRow key={log.id} log={log} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center mt-2 mb-4">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-ink-2 border border-stroke rounded-lg hover:bg-surface-high transition-colors disabled:opacity-50"
              >
                {loadingMore ? (
                  <>
                    <svg className="animate-spin" width="13" height="13" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading…
                  </>
                ) : (
                  `Load more (showing ${loadedCount})`
                )}
              </button>
            </div>
          )}

          {!hasMore && loadedCount > PAGE_SIZE && (
            <p className="text-center text-xs text-ink-3 mt-2 mb-4">
              All {loadedCount} records loaded
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ //
// Compact row (table-style, no timeline connector)
// ------------------------------------------------------------------ //

function ActivityRow({ log }: { log: AuditLog }) {
  const category = auditActionCategory(log.action);
  const actor = log.user
    ? fullName(log.user)
    : 'External';

  return (
    <div className="flex items-center gap-3 px-5 py-3 transition-colors duration-100 hover:bg-surface-high">
      {/* Dot */}
      <span className={cn('w-2 h-2 rounded-full flex-shrink-0', CATEGORY_DOT[category])} />

      {/* Description */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink truncate">{describeAuditLog(log)}</p>
        <div className="flex items-center gap-2 mt-1">
          <span
            className={cn(
              'inline-block text-[10px] font-medium px-1.5 py-px rounded-full',
              CATEGORY_PILL[category],
            )}
          >
            {formatAuditAction(log.action)}
          </span>
          <span className="text-[10px] text-ink-3">{actor}</span>
        </div>
      </div>

      {/* Time */}
      <time
        className="text-[11px] text-ink-3 whitespace-nowrap flex-shrink-0"
        title={new Date(log.createdAt).toLocaleString()}
      >
        {formatRelativeTime(log.createdAt)}
      </time>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Skeleton
// ------------------------------------------------------------------ //

function ActivitySkeleton() {
  return (
    <div className="bg-surface rounded-xl border border-stroke divide-y divide-stroke-soft animate-pulse overflow-hidden">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3">
          <div className="w-2 h-2 rounded-full bg-stroke flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-2/3 bg-stroke rounded" />
            <div className="h-2.5 w-1/3 bg-surface-high rounded" />
          </div>
          <div className="w-12 h-3 bg-surface-high rounded" />
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ //
// Helpers
// ------------------------------------------------------------------ //

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" strokeLinecap="round" />
    </svg>
  );
}
