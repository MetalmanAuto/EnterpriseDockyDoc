'use client';

import { useState } from 'react';
import { useUser } from '@/context/UserContext';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

// ------------------------------------------------------------------ //
// Types
// ------------------------------------------------------------------ //

interface ExpiringItem {
  id: string;
  name: string;
  fileType: string;
  expiryDate: string | null;
  daysUntilExpiry: number | null;
  owner: string;
  folder: string | null;
}

interface ExpiringReport {
  reportType: string;
  generatedAt: string;
  total: number;
  items: ExpiringItem[];
}

interface ActivityItem {
  id: string;
  action: string;
  entityId: string;
  actor: string;
  createdAt: string;
}

interface ActivityReport {
  reportType: string;
  generatedAt: string;
  total: number;
  actionCounts: Record<string, number>;
  items: ActivityItem[];
}

interface StorageReport {
  reportType: string;
  generatedAt: string;
  totalVersions: number;
  totalDocuments: number;
  totalBytes: number;
  totalMB: number;
  byMimeType: Record<string, { count: number; bytes: number }>;
}

interface MemberItem {
  userId: string;
  name: string;
  email: string;
  role: string;
  actions: number;
}

interface MemberReport {
  reportType: string;
  generatedAt: string;
  total: number;
  items: MemberItem[];
}

interface TagItem {
  id: string;
  name: string;
  color: string | null;
  documentCount: number;
}

interface TagReport {
  reportType: string;
  generatedAt: string;
  totalDocuments: number;
  taggedDocuments: number;
  untaggedDocuments: number;
  coveragePercent: number;
  tags: TagItem[];
}

interface ComplianceReport {
  reportType: string;
  generatedAt: string;
  documents: {
    total: number;
    expired: number;
    expiringSoon: number;
    noExpiry: number;
    compliant: number;
  };
  shares: {
    externalActive: number;
    expiredButActive: number;
  };
  riskScore: number;
}

interface AiSearchResponse {
  answer: string;
  relevantDocuments: { id: string; name: string }[];
}

interface AiInsights {
  summary: string;
  insights: string[];
  recommendations: string[];
  urgentItems: string[];
}

type ReportId =
  | 'expiring-docs'
  | 'document-activity'
  | 'storage-usage'
  | 'member-activity'
  | 'tag-coverage'
  | 'compliance-audit';

// ------------------------------------------------------------------ //
// Report card definitions
// ------------------------------------------------------------------ //

const REPORTS: { id: ReportId; title: string; description: string; icon: string; category: string }[] = [
  {
    id: 'expiring-docs',
    title: 'Expiring Documents',
    description: 'Documents approaching their expiry date, grouped by urgency.',
    icon: '📅',
    category: 'Compliance',
  },
  {
    id: 'storage-usage',
    title: 'Storage Usage',
    description: 'Breakdown of storage consumption by folder, owner, and file type.',
    icon: '💾',
    category: 'Operations',
  },
  {
    id: 'document-activity',
    title: 'Document Activity',
    description: 'Upload, edit, download, and delete events over a selected period.',
    icon: '📊',
    category: 'Activity',
  },
  {
    id: 'member-activity',
    title: 'Member Activity',
    description: 'Per-member contribution and access patterns across the workspace.',
    icon: '👥',
    category: 'Activity',
  },
  {
    id: 'tag-coverage',
    title: 'Tag Coverage',
    description: 'Documents missing tags and tag usage across the workspace.',
    icon: '🏷️',
    category: 'Governance',
  },
  {
    id: 'compliance-audit',
    title: 'Compliance Exposure',
    description: 'Expired documents, expiring-soon, and share risks with a risk score.',
    icon: '🛡️',
    category: 'Compliance',
  },
];

// ------------------------------------------------------------------ //
// Page
// ------------------------------------------------------------------ //

export default function ReportsPage() {
  const { activeWorkspace, isLoading: userLoading } = useUser();
  const [activeReport, setActiveReport] = useState<ReportId | null>(null);
  const [reportData, setReportData] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI insights (per-report)
  const [aiInsights, setAiInsights] = useState<AiInsights | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  // AI search
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResult, setAiResult] = useState<AiSearchResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const REPORT_TYPE_MAP: Record<ReportId, string> = {
    'expiring-docs': 'expiring_documents',
    'document-activity': 'document_activity',
    'storage-usage': 'storage_usage',
    'member-activity': 'member_activity',
    'tag-coverage': 'tag_coverage',
    'compliance-audit': 'compliance_exposure',
  };

  async function runReport(id: ReportId) {
    if (!activeWorkspace) return;
    setActiveReport(id);
    setReportData(null);
    setError(null);
    setLoading(true);
    setAiInsights(null);

    const wid = activeWorkspace.workspaceId;
    const endpointMap: Record<ReportId, string> = {
      'expiring-docs': `/api/v1/reports/expiring-documents?workspaceId=${wid}&days=90`,
      'document-activity': `/api/v1/reports/document-activity?workspaceId=${wid}&days=30`,
      'storage-usage': `/api/v1/reports/storage-usage?workspaceId=${wid}`,
      'member-activity': `/api/v1/reports/member-activity?workspaceId=${wid}&days=30`,
      'tag-coverage': `/api/v1/reports/tag-coverage?workspaceId=${wid}`,
      'compliance-audit': `/api/v1/reports/compliance-exposure?workspaceId=${wid}`,
    };

    try {
      const data = await apiFetch<unknown>(endpointMap[id]);
      setReportData(data);

      // Fetch AI insights after report data loads (fire-and-forget, never blocks)
      setLoadingInsights(true);
      apiFetch<AiInsights>(
        `/api/v1/ai/reports/insights?workspaceId=${wid}&reportType=${REPORT_TYPE_MAP[id]}`,
        { method: 'POST', body: JSON.stringify({ data }) },
      )
        .then((insights) => { setAiInsights(insights); })
        .catch(() => { setAiInsights(null); })
        .finally(() => { setLoadingInsights(false); });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report.');
    } finally {
      setLoading(false);
    }
  }

  async function runAiSearch() {
    if (!activeWorkspace || !aiQuestion.trim()) return;
    setAiLoading(true);
    setAiResult(null);
    setAiError(null);
    try {
      const data = await apiFetch<AiSearchResponse>(
        `/api/v1/ai/search?workspaceId=${activeWorkspace.workspaceId}`,
        { method: 'POST', body: JSON.stringify({ question: aiQuestion.trim() }) },
      );
      setAiResult(data);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI search failed.');
    } finally {
      setAiLoading(false);
    }
  }

  if (userLoading) return <PageSkeleton />;

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">
          {activeWorkspace?.workspaceName ?? 'No workspace'} &middot; insights and analytics
        </p>
      </div>

      {/* AI Report Generator */}
      <div className="mb-6 rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-indigo-50 p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-brand-600 flex items-center justify-center flex-shrink-0">
            <svg width="20" height="20" fill="none" stroke="white" strokeWidth={1.8} viewBox="0 0 24 24">
              <path d="M12 2a2 2 0 0 1 2 2v1a7 7 0 0 1 0 14v1a2 2 0 0 1-4 0v-1a7 7 0 0 1 0-14V4a2 2 0 0 1 2-2z" strokeLinecap="round" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-ink mb-1">AI Document Assistant</h2>
            <p className="text-sm text-ink-2 leading-relaxed mb-3">
              Ask questions about your documents in plain language.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !aiLoading) void runAiSearch(); }}
                placeholder="e.g. Which contracts expire this quarter?"
                className="flex-1 h-9 rounded-lg border border-stroke bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand-500"
                disabled={aiLoading}
              />
              <button
                onClick={() => void runAiSearch()}
                disabled={aiLoading || !aiQuestion.trim()}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white dark:bg-brand-400 dark:text-slate-900 text-sm font-semibold hover:bg-slate-800 dark:hover:bg-brand-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {aiLoading ? 'Thinking…' : 'Ask'}
              </button>
            </div>
            {aiError && (
              <p className="mt-2 text-xs text-red-600">{aiError}</p>
            )}
            {aiResult && (
              <div className="mt-3 bg-surface rounded-lg border border-brand-100 p-3">
                <p className="text-sm text-ink leading-relaxed">{aiResult.answer}</p>
                {aiResult.relevantDocuments.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-stroke">
                    <p className="text-xs font-medium text-ink-3 mb-1">Relevant documents:</p>
                    <div className="flex flex-wrap gap-1">
                      {aiResult.relevantDocuments.map((d) => (
                        <a
                          key={d.id}
                          href={`/documents/${d.id}`}
                          className="text-xs text-brand-600 hover:underline bg-brand-50 px-2 py-0.5 rounded"
                        >
                          {d.name}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Active report view */}
      {activeReport ? (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => { setActiveReport(null); setReportData(null); setAiInsights(null); }}
              className="flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink transition-colors"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back to reports
            </button>
            <span className="text-ink-3">/</span>
            <h2 className="text-sm font-semibold text-ink">
              {REPORTS.find((r) => r.id === activeReport)?.title}
            </h2>
            <span className="text-xs text-ink-3 ml-auto">
              {(reportData as { generatedAt?: string })?.generatedAt
                ? `Generated ${new Date((reportData as { generatedAt: string }).generatedAt).toLocaleString()}`
                : ''}
            </span>
          </div>

          {loading ? (
            <div className="bg-surface rounded-xl border border-stroke p-10 flex items-center justify-center">
              <svg className="animate-spin text-brand-600" width="24" height="24" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : error ? (
            <div className="bg-surface rounded-xl border border-red-200 p-6 text-sm text-red-600">{error}</div>
          ) : reportData ? (
            <>
              <ReportView id={activeReport} data={reportData} />
              <AiInsightsPanel loading={loadingInsights} insights={aiInsights} />
            </>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mb-3">
            <h2 className="font-mono text-[10px] uppercase tracking-label text-ink-3">Available Reports</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {REPORTS.map((report) => (
              <ReportCard key={report.id} report={report} onRun={() => { void runReport(report.id); }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ //
// Report view dispatcher
// ------------------------------------------------------------------ //

function ReportView({ id, data }: { id: ReportId; data: unknown }) {
  switch (id) {
    case 'expiring-docs': return <ExpiringDocsView data={data as ExpiringReport} />;
    case 'document-activity': return <ActivityView data={data as ActivityReport} />;
    case 'storage-usage': return <StorageView data={data as StorageReport} />;
    case 'member-activity': return <MemberView data={data as MemberReport} />;
    case 'tag-coverage': return <TagView data={data as TagReport} />;
    case 'compliance-audit': return <ComplianceView data={data as ComplianceReport} />;
    default: return null;
  }
}

// ------------------------------------------------------------------ //
// Expiring Documents
// ------------------------------------------------------------------ //

function ExpiringDocsView({ data }: { data: ExpiringReport }) {
  return (
    <div className="bg-surface rounded-xl border border-stroke overflow-hidden">
      <div className="px-5 py-3 border-b border-stroke flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">{data.total} documents found</p>
      </div>
      {data.items.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-ink-3">No expiring documents in the next 90 days.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-high border-b border-stroke">
              <th className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-label text-ink-3">Document</th>
              <th className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-label text-ink-3 hidden sm:table-cell">Owner</th>
              <th className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-label text-ink-3 hidden md:table-cell">Folder</th>
              <th className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-label text-ink-3">Expires</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stroke-soft">
            {data.items.map((item) => {
              const days = item.daysUntilExpiry ?? 0;
              const urgency = days < 0 ? 'text-red-600 bg-red-50' : days <= 7 ? 'text-red-600' : days <= 30 ? 'text-orange-600' : 'text-yellow-700';
              return (
                <tr key={item.id} className="hover:bg-surface-high">
                  <td className="px-4 py-3">
                    <a href={`/documents/${item.id}`} className="font-medium text-ink hover:text-brand-600">{item.name}</a>
                  </td>
                  <td className="px-4 py-3 text-ink-3 hidden sm:table-cell">{item.owner}</td>
                  <td className="px-4 py-3 text-ink-3 hidden md:table-cell">{item.folder ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs font-semibold', urgency)}>
                      {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `${days}d`}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ //
// Document Activity
// ------------------------------------------------------------------ //

function ActivityView({ data }: { data: ActivityReport }) {
  const ACTION_LABELS: Record<string, string> = {
    DOCUMENT_CREATED: 'Uploaded',
    DOCUMENT_UPDATED: 'Updated',
    DOCUMENT_DELETED: 'Deleted',
    DOCUMENT_SHREDDED: 'Shredded',
    DOCUMENT_VERSION_ADDED: 'Version added',
    DOCUMENT_DOWNLOADED: 'Downloaded',
    DOCUMENT_SHARED_INTERNAL: 'Shared internally',
    DOCUMENT_SHARED_EXTERNAL: 'Shared externally',
    SHARE_REVOKED: 'Share revoked',
    REMINDER_CREATED: 'Reminder created',
    REMINDER_UPDATED: 'Reminder updated',
    MEMBER_ADDED: 'Member added',
    MEMBER_ROLE_UPDATED: 'Role updated',
  };

  return (
    <div className="space-y-4">
      <div className="bg-surface rounded-xl border border-stroke p-5">
        <h3 className="text-sm font-semibold text-ink mb-3">Action breakdown ({data.total} total)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Object.entries(data.actionCounts).map(([action, count]) => (
            <div key={action} className="flex items-center justify-between bg-surface-high rounded-lg px-3 py-2">
              <span className="text-xs text-ink-2">{ACTION_LABELS[action] ?? action}</span>
              <span className="text-xs font-semibold text-ink tabular-nums">{count}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-surface rounded-xl border border-stroke overflow-hidden">
        <div className="px-5 py-3 border-b border-stroke">
          <p className="text-sm font-semibold text-ink">Recent activity (last 30 days)</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-high border-b border-stroke">
              <th className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-label text-ink-3">Action</th>
              <th className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-label text-ink-3 hidden sm:table-cell">Actor</th>
              <th className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-label text-ink-3">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stroke-soft">
            {data.items.slice(0, 50).map((item) => (
              <tr key={item.id} className="hover:bg-surface-high">
                <td className="px-4 py-2.5 text-ink-2">{ACTION_LABELS[item.action] ?? item.action}</td>
                <td className="px-4 py-2.5 text-ink-3 hidden sm:table-cell">{item.actor}</td>
                <td className="px-4 py-2.5 text-ink-3 text-xs">
                  {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Storage Usage
// ------------------------------------------------------------------ //

function StorageView({ data }: { data: StorageReport }) {
  const totalBytes = data.totalBytes;
  const fmt = (b: number) => b >= 1_073_741_824 ? `${(b / 1_073_741_824).toFixed(2)} GB` : `${(b / 1_048_576).toFixed(1)} MB`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label="Total storage" value={fmt(totalBytes)} />
        <StatCard label="Documents" value={String(data.totalDocuments)} />
        <StatCard label="File versions" value={String(data.totalVersions)} />
      </div>
      <div className="bg-surface rounded-xl border border-stroke p-5">
        <h3 className="text-sm font-semibold text-ink mb-3">By file type</h3>
        <div className="space-y-2">
          {Object.entries(data.byMimeType).map(([type, stats]) => {
            const pct = totalBytes > 0 ? Math.round((stats.bytes / totalBytes) * 100) : 0;
            return (
              <div key={type} className="flex items-center gap-3">
                <span className="w-20 text-xs text-ink-2 capitalize">{type}</span>
                <div className="flex-1 h-2 bg-surface-high rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-ink-3 w-16 text-right tabular-nums">{fmt(stats.bytes)}</span>
                <span className="text-xs text-ink-3 w-12 text-right tabular-nums">{stats.count} files</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Member Activity
// ------------------------------------------------------------------ //

function MemberView({ data }: { data: MemberReport }) {
  const ROLE_CLASS: Record<string, string> = {
    OWNER: 'bg-purple-100 text-purple-700',
    ADMIN: 'bg-blue-100 text-blue-700',
    EDITOR: 'bg-green-100 text-green-700',
    VIEWER: 'bg-surface-high text-ink-2',
  };
  const maxActions = Math.max(...data.items.map((m) => m.actions), 1);

  return (
    <div className="bg-surface rounded-xl border border-stroke overflow-hidden">
      <div className="px-5 py-3 border-b border-stroke">
        <p className="text-sm font-semibold text-ink">{data.total} members</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-high border-b border-stroke">
            <th className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-label text-ink-3">Member</th>
            <th className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-label text-ink-3 hidden sm:table-cell">Role</th>
            <th className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-label text-ink-3">Activity (30d)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stroke-soft">
          {data.items.map((m) => (
            <tr key={m.userId} className="hover:bg-surface-high">
              <td className="px-4 py-3">
                <p className="font-medium text-ink">{m.name}</p>
                <p className="text-xs text-ink-3">{m.email}</p>
              </td>
              <td className="px-4 py-3 hidden sm:table-cell">
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', ROLE_CLASS[m.role] ?? 'bg-surface-high text-ink-2')}>
                  {m.role}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 max-w-24 h-1.5 bg-surface-high rounded-full overflow-hidden">
                    <div className="h-full bg-brand-500 rounded-full" style={{ width: `${Math.round((m.actions / maxActions) * 100)}%` }} />
                  </div>
                  <span className="text-xs text-ink-2 tabular-nums">{m.actions}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Tag Coverage
// ------------------------------------------------------------------ //

function TagView({ data }: { data: TagReport }) {
  const pct = data.coveragePercent;
  const pctColor = pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Coverage" value={`${pct}%`} valueClass={pctColor} />
        <StatCard label="Tagged" value={String(data.taggedDocuments)} />
        <StatCard label="Untagged" value={String(data.untaggedDocuments)} valueClass={data.untaggedDocuments > 0 ? 'text-orange-600' : undefined} />
      </div>
      <div className="bg-surface rounded-xl border border-stroke p-5">
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-ink-3">Tag coverage across {data.totalDocuments} documents</span>
            <span className={cn('text-xs font-semibold', pctColor)}>{pct}%</span>
          </div>
          <div className="h-2 bg-surface-high rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full', pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500')} style={{ width: `${pct}%` }} />
          </div>
        </div>
        {data.tags.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-ink mb-2 mt-4">Tags in use</h3>
            <div className="flex flex-wrap gap-2">
              {data.tags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border border-stroke"
                  style={tag.color ? { borderColor: tag.color, color: tag.color } : undefined}
                >
                  {tag.name}
                  <span className="text-ink-3 font-normal">({tag.documentCount})</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Compliance Exposure
// ------------------------------------------------------------------ //

function ComplianceView({ data }: { data: ComplianceReport }) {
  const risk = data.riskScore;
  const riskLabel = risk < 20 ? 'Low' : risk < 60 ? 'Medium' : 'High';
  const riskColor = risk < 20 ? 'text-green-600' : risk < 60 ? 'text-yellow-600' : 'text-red-600';
  const riskBg = risk < 20 ? 'bg-green-50 border-green-200' : risk < 60 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200';

  return (
    <div className="space-y-4">
      <div className={cn('rounded-xl border p-5 flex items-center gap-4', riskBg)}>
        <div className="text-center">
          <p className={cn('text-4xl font-bold', riskColor)}>{risk}</p>
          <p className={cn('text-sm font-semibold', riskColor)}>Risk score</p>
          <p className="text-xs text-ink-3">{riskLabel} risk</p>
        </div>
        <div className="h-16 w-px bg-stroke" />
        <div className="text-sm text-ink-2 leading-relaxed">
          <p>Calculated from expired documents ({data.documents.expired} &times; 10)</p>
          <p>+ expiring soon ({data.documents.expiringSoon} &times; 3)</p>
          <p>+ expired-but-active shares ({data.shares.expiredButActive})</p>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Expired" value={String(data.documents.expired)} valueClass={data.documents.expired > 0 ? 'text-red-600' : undefined} />
        <StatCard label="Expiring soon" value={String(data.documents.expiringSoon)} valueClass={data.documents.expiringSoon > 0 ? 'text-orange-600' : undefined} />
        <StatCard label="No expiry set" value={String(data.documents.noExpiry)} />
        <StatCard label="Compliant" value={String(data.documents.compliant)} valueClass="text-green-600" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Active external shares" value={String(data.shares.externalActive)} />
        <StatCard label="Expired-but-active shares" value={String(data.shares.expiredButActive)} valueClass={data.shares.expiredButActive > 0 ? 'text-red-600' : undefined} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// AI Insights Panel
// ------------------------------------------------------------------ //

function AiInsightsPanel({
  loading,
  insights,
}: {
  loading: boolean;
  insights: { summary: string; insights: string[]; recommendations: string[]; urgentItems: string[] } | null;
}) {
  if (!loading && !insights) {
    return (
      <p className="mt-4 text-xs text-ink-3">AI insights unavailable</p>
    );
  }

  if (loading) {
    return (
      <div className="mt-4 flex items-center gap-2 text-sm text-ink-3">
        <svg className="animate-spin text-brand-600 flex-shrink-0" width="16" height="16" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Generating AI insights…
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-indigo-50 p-5">
      <div className="flex items-center gap-2 mb-3">
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" className="text-brand-600 flex-shrink-0">
          <path d="M12 2l2.4 4.8L20 8l-4 3.9 1 5.6L12 15l-5 2.5 1-5.6L4 8l5.6-.8L12 2z" strokeLinejoin="round" />
        </svg>
        <h3 className="text-sm font-semibold text-ink">AI Insights</h3>
      </div>

      {insights!.summary && (
        <p className="text-sm text-ink-2 leading-relaxed mb-4">{insights!.summary}</p>
      )}

      {insights!.urgentItems.length > 0 && (
        <div className="mb-4">
          <p className="font-mono text-[10px] uppercase tracking-label text-orange-700 mb-2">Urgent items</p>
          <ul className="space-y-1.5">
            {insights!.urgentItems.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-orange-800 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                <span className="mt-0.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-orange-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {insights!.insights.length > 0 && (
        <div className="mb-4">
          <p className="font-mono text-[10px] uppercase tracking-label text-ink-3 mb-2">Key insights</p>
          <ul className="space-y-1">
            {insights!.insights.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-2">
                <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-brand-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {insights!.recommendations.length > 0 && (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-label text-ink-3 mb-2">Recommendations</p>
          <ul className="space-y-1">
            {insights!.recommendations.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-2">
                <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-indigo-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ //
// Shared components
// ------------------------------------------------------------------ //

function StatCard({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-surface rounded-xl border border-stroke px-4 py-4">
      <p className="text-xs text-ink-3 mb-1">{label}</p>
      <p className={cn('text-2xl font-bold text-ink', valueClass)}>{value}</p>
    </div>
  );
}

function ReportCard({
  report,
  onRun,
}: {
  report: { id: ReportId; title: string; description: string; icon: string; category: string };
  onRun: () => void;
}) {
  return (
    <div className="bg-surface rounded-xl border border-stroke p-5 flex flex-col gap-3 hover:border-ink-3 hover:shadow-card transition-all">
      <div className="flex items-start justify-between gap-2">
        <span className="text-2xl leading-none">{report.icon}</span>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-surface-high text-ink-3">
          {report.category}
        </span>
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-ink mb-1">{report.title}</h3>
        <p className="text-xs text-ink-3 leading-relaxed">{report.description}</p>
      </div>
      <button
        type="button"
        onClick={onRun}
        className="text-xs text-brand-600 font-medium hover:underline text-left"
      >
        Run report →
      </button>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="max-w-5xl animate-pulse">
      <div className="h-7 w-28 bg-stroke rounded mb-2" />
      <div className="h-4 w-52 bg-surface-high rounded mb-6" />
      <div className="h-32 bg-surface-high rounded-xl mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-surface-high rounded-xl h-36" />
        ))}
      </div>
    </div>
  );
}
