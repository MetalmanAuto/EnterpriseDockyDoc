'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@/context/UserContext';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import {
  fetchAdminOverview,
  setUserPlan,
  type AdminActivityRow,
  type AdminOverview,
  type AdminUserRow,
  type AdminWorkspaceRow,
} from '@/lib/admin';

/**
 * Platform admin: who has signed up, what they have stored, how much AI they
 * have used, and what happened recently. Only people named in
 * PLATFORM_ADMIN_EMAILS on the API can load it; everyone else sees a notice.
 */
export default function AdminPage() {
  const { user, isLoading: userLoading } = useUser();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchAdminOverview();
      setData(d);
      setRefreshedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the overview.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (userLoading) return;
    if (!user?.isPlatformAdmin) {
      setLoading(false);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLoading, user?.isPlatformAdmin]);

  if (!userLoading && user && !user.isPlatformAdmin) {
    return (
      <div className="p-6 max-w-2xl">
        <h1 className="page-title">Platform admin</h1>
        <p className="mt-3 text-sm text-ink-2">
          This page is only for the people who run DockyDoc. Your account is not on that list.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Platform admin</h1>
          <p className="text-sm text-ink-2 mt-1">
            Everyone who has signed up to dockydoc.app, across every workspace.
            {refreshedAt && <span className="text-ink-3"> Updated {timeAgo(refreshedAt.toISOString())}.</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="h-9 px-3 rounded-lg border border-stroke bg-surface text-sm font-semibold text-ink hover:bg-surface-high disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {!data && loading && <Skeleton />}

      {data && (
        <>
          <KpiRow data={data} />
          <SignupsChart days={data.signupsByDay} />
          <PeopleTable users={data.users} />
          <WorkspacesTable workspaces={data.workspaces} />
          <ActivityFeed rows={data.recentActivity} />
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ //
// KPI row
// ------------------------------------------------------------------ //

function KpiRow({ data }: { data: AdminOverview }) {
  const t = data.totals;
  const tiles: { label: string; value: string; note?: string }[] = [
    { label: 'People signed up', value: String(t.users), note: t.usersLast7Days ? `+${t.usersLast7Days} in the last 7 days` : 'none in the last 7 days' },
    { label: 'Workspaces', value: String(t.workspaces) },
    { label: 'Documents stored', value: String(t.documents), note: t.documentsLast7Days ? `+${t.documentsLast7Days} in the last 7 days` : 'none in the last 7 days' },
    { label: 'Storage used', value: formatBytes(t.storageBytes) },
    { label: 'AI tokens used', value: formatNumber(t.aiTokens), note: 'across all workspaces' },
    { label: 'Share links', value: String(t.externalShares) },
    { label: 'API keys', value: String(t.apiKeys), note: 'active' },
    { label: 'Invitations pending', value: String(t.pendingInvitations) },
  ];
  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {tiles.map((tile) => (
        <div key={tile.label} className="bg-surface rounded-xl border border-stroke px-4 py-4">
          <p className="text-xs text-ink-3 mb-1">{tile.label}</p>
          <p className="text-2xl font-bold text-ink tabular-nums">{tile.value}</p>
          {tile.note && <p className="text-[11px] text-ink-3 mt-1">{tile.note}</p>}
        </div>
      ))}
    </section>
  );
}

// ------------------------------------------------------------------ //
// Sign-ups per day, last 30 days. One series, so no legend; the title
// names it. Hover shows the exact day and count.
// ------------------------------------------------------------------ //

function SignupsChart({ days }: { days: { day: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((s, d) => s + d.count, 0);
  const W = 600;
  const H = 120;
  const padL = 24;
  const padB = 18;
  const plotW = W - padL - 4;
  const plotH = H - padB - 6;
  const slot = plotW / Math.max(1, days.length);
  const barW = Math.max(2, slot - 2);
  const y = (v: number) => 6 + plotH - (v / max) * plotH;
  const ticks = max <= 4 ? [...Array(max + 1).keys()] : [0, Math.round(max / 2), max];

  return (
    <section className="bg-surface rounded-xl border border-stroke p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-bold text-ink">Sign-ups per day, last 30 days</h2>
        <span className="text-xs text-ink-3">{total} in total</span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[140px]" role="img" aria-label={`Sign-ups per day for the last 30 days, ${total} in total`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - 4} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-stroke-soft" strokeWidth={1} />
              <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill="currentColor" className="text-ink-3">{t}</text>
            </g>
          ))}
          {days.map((d, i) => {
            const x = padL + i * slot + 1;
            const h = d.count === 0 ? 0 : Math.max(2, (d.count / max) * plotH);
            const top = 6 + plotH - h;
            const active = hover === i;
            return (
              <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                {/* hit target is the whole column, bigger than the bar */}
                <rect x={padL + i * slot} y={0} width={slot} height={H} fill="transparent" />
                {h > 0 && (
                  <rect
                    x={x}
                    y={top}
                    width={barW}
                    height={h}
                    rx={h >= 4 ? 2 : 0}
                    fill={active ? '#0f766e' : '#0d9488'}
                  />
                )}
                {(i % 7 === 0 || (i === days.length - 1 && i % 7 >= 3)) && (
                  <text x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize={9} fill="currentColor" className="text-ink-3">
                    {shortDay(d.day)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute -top-1 rounded-md border border-stroke bg-surface px-2 py-1 text-xs text-ink shadow-md"
            style={{ left: `${((hover + 0.5) / days.length) * 100}%`, transform: 'translateX(-50%)' }}
          >
            {longDay(days[hover].day)}: {days[hover].count} {days[hover].count === 1 ? 'sign-up' : 'sign-ups'}
          </div>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ //
// People
// ------------------------------------------------------------------ //

type UserSort = 'joined' | 'active' | 'documents' | 'storage' | 'ai';

const PLAN_OPTIONS = ['FREE', 'PERSONAL', 'BUSINESS', 'TEAM', 'ENTERPRISE'] as const;

function PeopleTable({ users: initialUsers }: { users: AdminUserRow[] }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<UserSort>('joined');
  const [users, setUsers] = useState(initialUsers);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  useEffect(() => setUsers(initialUsers), [initialUsers]);

  async function changePlan(u: AdminUserRow, plan: string) {
    if (plan === u.plan) return;
    const months = plan === 'FREE' || plan === 'ENTERPRISE' ? undefined : 6;
    setBusy(u.id);
    try {
      const r = await setUserPlan(u.id, plan, months);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, plan: r.plan, planSource: 'complimentary', planRenewsAt: r.renewsAt } : x)));
      toast.success(`${u.name} is now on ${plan}${months ? ` for ${months} months` : ''}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change the plan');
    } finally {
      setBusy(null);
    }
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.workspaces.some((w) => w.name.toLowerCase().includes(q)))
      : users;
    const key: Record<UserSort, (u: AdminUserRow) => number> = {
      joined: (u) => Date.parse(u.joinedAt),
      active: (u) => (u.lastActiveAt ? Date.parse(u.lastActiveAt) : 0),
      documents: (u) => u.documents,
      storage: (u) => u.storageBytes,
      ai: (u) => u.aiTokens,
    };
    return [...filtered].sort((a, b) => key[sort](b) - key[sort](a));
  }, [users, query, sort]);

  return (
    <section className="bg-surface rounded-xl border border-stroke">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stroke-soft">
        <h2 className="text-sm font-bold text-ink">People <span className="text-ink-3 font-normal">({users.length})</span></h2>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email or workspace"
            className="h-8 w-56 rounded-md border border-stroke bg-surface px-2 text-xs text-ink placeholder:text-ink-3"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as UserSort)}
            className="h-8 rounded-md border border-stroke bg-surface px-2 text-xs text-ink"
            aria-label="Sort people by"
          >
            <option value="joined">Newest first</option>
            <option value="active">Most recently active</option>
            <option value="documents">Most documents</option>
            <option value="storage">Most storage</option>
            <option value="ai">Most AI used</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-3">
              <Th>Person</Th>
              <Th>Plan</Th>
              <Th>Joined</Th>
              <Th>Last active</Th>
              <Th>Workspaces</Th>
              <Th right>Documents</Th>
              <Th right>Storage</Th>
              <Th right>AI tokens</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-ink-3">No one matches that search.</td></tr>
            )}
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-stroke-soft align-top">
                <td className="px-4 py-2.5">
                  <div className="font-semibold text-ink">{u.name}{!u.isActive && <span className="ml-2 text-[10px] uppercase text-ink-3">inactive</span>}</div>
                  <div className="text-xs text-ink-3">{u.email}</div>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <select
                    value={u.plan}
                    disabled={busy === u.id}
                    onChange={(e) => void changePlan(u, e.target.value)}
                    className="h-7 rounded-md border border-stroke bg-surface px-1.5 text-xs text-ink"
                    aria-label={`Plan for ${u.name}`}
                  >
                    {PLAN_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <div className="text-[10px] text-ink-3 mt-0.5">
                    {u.aiActionsUsed}/{u.aiActionsIncluded >= 1_000_000_000 ? '\u221e' : u.aiActionsIncluded} actions
                    {u.planSource === 'complimentary' && u.planRenewsAt ? ` \u00b7 free until ${shortDate(u.planRenewsAt)}` : u.planSource ? ` \u00b7 ${u.planSource}` : ''}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-ink-2 whitespace-nowrap" title={u.joinedAt}>{shortDate(u.joinedAt)}</td>
                <td className="px-4 py-2.5 text-ink-2 whitespace-nowrap" title={u.lastActiveAt ?? undefined}>{u.lastActiveAt ? timeAgo(u.lastActiveAt) : <span className="text-ink-3">never</span>}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {u.workspaces.length === 0 && <span className="text-ink-3">none</span>}
                    {u.workspaces.map((w) => (
                      <span key={w.id} className="inline-flex items-center gap-1 rounded-md border border-stroke-soft bg-surface-high px-1.5 py-0.5 text-[11px] text-ink-2">
                        {w.name}
                        <span className="text-ink-3">{roleLabel(w.role)} · {w.plan}</span>
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink">{u.documents}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink">{formatBytes(u.storageBytes)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink">{formatNumber(u.aiTokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ //
// Workspaces
// ------------------------------------------------------------------ //

function WorkspacesTable({ workspaces }: { workspaces: AdminWorkspaceRow[] }) {
  const rows = useMemo(
    () => [...workspaces].sort((a, b) => (b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0) - (a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0)),
    [workspaces],
  );
  return (
    <section className="bg-surface rounded-xl border border-stroke">
      <div className="px-4 py-3 border-b border-stroke-soft">
        <h2 className="text-sm font-bold text-ink">Workspaces <span className="text-ink-3 font-normal">({workspaces.length}, most recently active first)</span></h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-3">
              <Th>Workspace</Th>
              <Th>Owner</Th>
              <Th>Plan</Th>
              <Th right>Members</Th>
              <Th right>Documents</Th>
              <Th right>Storage</Th>
              <Th right>AI tokens</Th>
              <Th>Last activity</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.id} className="border-t border-stroke-soft">
                <td className="px-4 py-2.5">
                  <div className="font-semibold text-ink">{w.name}</div>
                  <div className="text-xs text-ink-3">{w.type === 'PERSONAL' ? 'Personal' : 'Team'} · created {shortDate(w.createdAt)}</div>
                </td>
                <td className="px-4 py-2.5 text-ink-2">{w.ownerEmail ?? <span className="text-ink-3">no owner</span>}</td>
                <td className="px-4 py-2.5"><PlanBadge plan={w.plan} /></td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink">{w.members}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink">{w.documents}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink">{formatBytes(w.storageBytes)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink">{formatNumber(w.aiTokens)}</td>
                <td className="px-4 py-2.5 text-ink-2 whitespace-nowrap">{w.lastActivityAt ? timeAgo(w.lastActivityAt) : <span className="text-ink-3">none yet</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ //
// Recent activity
// ------------------------------------------------------------------ //

function ActivityFeed({ rows }: { rows: AdminActivityRow[] }) {
  return (
    <section className="bg-surface rounded-xl border border-stroke">
      <div className="px-4 py-3 border-b border-stroke-soft">
        <h2 className="text-sm font-bold text-ink">Recent activity <span className="text-ink-3 font-normal">(last {rows.length} events)</span></h2>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-3">Nothing has happened yet.</p>
      ) : (
        <ul className="divide-y divide-stroke-soft">
          {rows.map((r) => (
            <li key={r.id} className="px-4 py-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
              <span className="text-xs text-ink-3 w-20 shrink-0 tabular-nums" title={r.at}>{timeAgo(r.at)}</span>
              <span className="font-semibold text-ink">{r.who}</span>
              <span className="text-ink-2">{actionLabel(r.action)}</span>
              {r.detail && <span className="text-ink truncate max-w-[280px]" title={r.detail}>{r.detail}</span>}
              <span className="text-xs text-ink-3">in {r.workspace}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ //
// Small pieces
// ------------------------------------------------------------------ //

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={cn('px-4 py-2 font-semibold', right && 'text-right')}>{children}</th>;
}

function PlanBadge({ plan }: { plan: string }) {
  const tone =
    plan === 'ENTERPRISE' || plan === 'TEAM' ? 'border-teal-600/40 text-teal-700 dark:text-teal-300'
    : plan === 'BUSINESS' || plan === 'PERSONAL' ? 'border-blue-600/40 text-blue-700 dark:text-blue-300'
    : 'border-stroke text-ink-2';
  return <span className={cn('inline-block rounded-md border px-1.5 py-0.5 text-[11px] font-semibold', tone)}>{plan}</span>;
}

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(8).keys()].map((i) => <div key={i} className="h-20 rounded-xl bg-surface-high" />)}
      </div>
      <div className="h-44 rounded-xl bg-surface-high" />
      <div className="h-64 rounded-xl bg-surface-high" />
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = {
  DOCUMENT_CREATED: 'uploaded',
  DOCUMENT_UPDATED: 'updated',
  DOCUMENT_DELETED: 'binned',
  DOCUMENT_SHREDDED: 'permanently deleted',
  DOCUMENT_VERSION_ADDED: 'added a new version of',
  DOCUMENT_DOWNLOADED: 'downloaded',
  DOCUMENT_SHARED_INTERNAL: 'shared',
  DOCUMENT_SHARED_EXTERNAL: 'created a share link for',
  SHARE_REVOKED: 'revoked a share link for',
  REMINDER_CREATED: 'set a reminder on',
  REMINDER_UPDATED: 'changed a reminder on',
  REMINDER_SENT: 'was sent a reminder for',
  MEMBER_ADDED: 'added a member',
  MEMBER_ROLE_UPDATED: 'changed a member role',
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.toLowerCase().replace(/_/g, ' ');
}

function roleLabel(role: string): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-IN').format(n);
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function shortDay(isoDay: string): string {
  return new Date(isoDay + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function longDay(isoDay: string): string {
  return new Date(isoDay + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return shortDate(iso);
}
