'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { fetchExpiringDocuments, fetchWorkspaceReminders, sendTestReminderEmail } from '@/lib/documents';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import { daysLabel, formatDate, formatDateTime, isSnoozed } from '@/lib/expiry';
import ExpiryActions from '@/components/expiry/ExpiryActions';
import type { ExpiringDocument, UpcomingReminder } from '@/types';

// ------------------------------------------------------------------ //
// Time filter options for "Expiring Soon" tab
// ------------------------------------------------------------------ //

const TIME_FILTERS = [
  { label: '7 days',   days: 7 },
  { label: '14 days',  days: 14 },
  { label: '31 days',  days: 31 },
  { label: '3 months', days: 90 },
  { label: '6 months', days: 180 },
  { label: '1 year',   days: 365 },
] as const;

type TabId = 'reminders' | 'expiring' | 'expired';

// ------------------------------------------------------------------ //
// Helpers
// ------------------------------------------------------------------ //


// ------------------------------------------------------------------ //
// Page
// ------------------------------------------------------------------ //

function RemindersPageInner() {
  const { activeWorkspace, isLoading: userLoading } = useUser();
  const searchParams = useSearchParams();
  const [expiring, setExpiring] = useState<ExpiringDocument[]>([]);
  const [reminders, setReminders] = useState<UpcomingReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Allow deep-linking via ?tab=expiring|expired|reminders
  const tabParam = searchParams.get('tab') as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(
    tabParam && ['reminders', 'expiring', 'expired'].includes(tabParam) ? tabParam : 'reminders',
  );
  const [expiringDays, setExpiringDays] = useState(31);
  const [sendingTest, setSendingTest] = useState(false);
  const toast = useToast();

  async function handleSendTest() {
    if (!activeWorkspace) return;
    setSendingTest(true);
    try {
      const res = await sendTestReminderEmail(activeWorkspace.workspaceId);
      if (res.delivered) toast.success(`Test reminder sent to ${res.to}`);
      else toast.info('Email delivery is not configured yet (RESEND_API_KEY missing on the server).');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send test email.');
    } finally {
      setSendingTest(false);
    }
  }

  useEffect(() => {
    if (!activeWorkspace) return;
    setLoading(true);
    Promise.all([
      // Fetch the widest window the filter offers so client-side filtering is exact.
      fetchExpiringDocuments(activeWorkspace.workspaceId, 365),
      fetchWorkspaceReminders(activeWorkspace.workspaceId),
    ])
      .then(([exp, rem]) => {
        setExpiring(exp);
        setReminders(rem);
      })
      .catch(() => setError('Failed to load reminders. Is the API running?'))
      .finally(() => setLoading(false));
  }, [activeWorkspace?.workspaceId]);

  function patchExpiring(id: string, patch: Partial<ExpiringDocument>) {
    setExpiring((prev) => prev.map((d) => {
      if (d.id !== id) return d;
      const next = { ...d, ...patch };
      if (patch.expiryDate) {
        next.daysUntilExpiry = Math.round((new Date(patch.expiryDate).getTime() - Date.now()) / 86_400_000);
      }
      return next;
    }));
  }

  if (userLoading || loading) return <PageSkeleton />;

  if (!activeWorkspace) {
    return <div className="text-sm text-ink-3 p-4">No active workspace selected.</div>;
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 px-5 py-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  const expired = expiring.filter((d) => d.daysUntilExpiry < 0);
  const expiringSoon = expiring.filter(
    (d) => d.daysUntilExpiry >= 0 && d.daysUntilExpiry <= expiringDays,
  );

  const TABS: { id: TabId; label: string; count: number }[] = [
    { id: 'reminders', label: 'Upcoming Reminders', count: reminders.length },
    { id: 'expiring',  label: 'Expiring Soon',      count: expiringSoon.length },
    { id: 'expired',   label: 'Expired',            count: expired.length },
  ];

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="page-title">Reminders</h1>
        <p className="page-subtitle">
          {activeWorkspace.workspaceName} &middot; never miss a renewal or expiry again
        </p>
      </div>

      {/* ---- Tab bar + optional time filter ---- */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 bg-surface-high rounded-lg p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150',
                activeTab === tab.id
                  ? 'bg-surface text-ink shadow-card scale-[1.01]'
                  : 'text-ink-3 hover:text-ink',
              )}
            >
              {tab.label}
              <span
                className={cn(
                  'text-xs font-semibold px-1.5 py-0.5 rounded-full',
                  activeTab === tab.id ? 'bg-surface-high text-ink-2' : 'bg-stroke text-ink-3',
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Time filter — only shown for "Expiring Soon" tab */}
        {activeTab === 'expiring' && (
          <select
            value={expiringDays}
            onChange={(e) => setExpiringDays(Number(e.target.value))}
            className="h-9 rounded-lg border border-stroke bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {TIME_FILTERS.map((f) => (
              <option key={f.days} value={f.days}>
                Next {f.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ---- Tab content ---- */}
      <div className="bg-surface rounded-xl border border-stroke overflow-hidden">
        {activeTab === 'reminders' && (
          <>
            <div className="flex items-center gap-3 px-5 py-3 border-b border-stroke">
              <span className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0" />
              <h2 className="text-sm font-semibold text-ink">Upcoming Reminders</h2>
              <span className="text-xs text-ink-3 hidden sm:inline">· emailed to owners &amp; admins</span>
              <button
                type="button"
                onClick={handleSendTest}
                disabled={sendingTest}
                className="ml-auto text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
              >
                {sendingTest ? 'Sending…' : 'Send me a test email'}
              </button>
              <span className="text-xs font-medium text-ink-3">{reminders.length}</span>
            </div>
            {reminders.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                <div className="w-11 h-11 rounded-full bg-surface-high flex items-center justify-center mb-3">
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" className="text-ink-3">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-ink-2 mb-1">No reminders scheduled yet</p>
                <p className="text-xs text-ink-3 leading-relaxed max-w-xs">
                  Open any document, set an expiry date, and add a reminder — we&apos;ll notify you before it lapses.
                </p>
                <Link href="/documents" className="mt-3 text-xs text-brand-600 hover:underline font-medium">
                  Go to Documents →
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-stroke-soft">
                {reminders.map((r) => <ReminderRow key={r.id} reminder={r} />)}
              </div>
            )}
          </>
        )}

        {activeTab === 'expiring' && (
          <>
            <div className="flex items-center gap-3 px-5 py-3 border-b border-stroke">
              <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
              <h2 className="text-sm font-semibold text-ink">Expiring Soon</h2>
              <span className="text-xs text-ink-3">
                (within {TIME_FILTERS.find((f) => f.days === expiringDays)?.label ?? `${expiringDays} days`})
              </span>
              <span className="ml-auto text-xs font-medium text-ink-3">{expiringSoon.length}</span>
            </div>
            {expiringSoon.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                <div className="w-11 h-11 rounded-full bg-green-50 flex items-center justify-center mb-3">
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" className="text-green-500">
                    <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-ink-2 mb-1">
                  All clear for the next {TIME_FILTERS.find((f) => f.days === expiringDays)?.label ?? `${expiringDays} days`}
                </p>
                <p className="text-xs text-ink-3 leading-relaxed max-w-xs">
                  No documents are expiring in this window. Add expiry dates on your documents to track them here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-stroke-soft">
                {expiringSoon.map((doc) => <ExpiringDocRow key={doc.id} doc={doc} onChanged={(patch) => patchExpiring(doc.id, patch)} />)}
              </div>
            )}
          </>
        )}

        {activeTab === 'expired' && (
          <>
            <div className="flex items-center gap-3 px-5 py-3 border-b border-stroke">
              <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
              <h2 className="text-sm font-semibold text-ink">Expired</h2>
              <span className="ml-auto text-xs font-medium text-ink-3">{expired.length}</span>
            </div>
            {expired.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                <div className="w-11 h-11 rounded-full bg-green-50 flex items-center justify-center mb-3">
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" className="text-green-500">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" strokeLinecap="round" />
                    <path d="M22 4 12 14.01l-3-3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-ink-2 mb-1">No expired documents</p>
                <p className="text-xs text-ink-3 leading-relaxed max-w-xs">
                  Everything is up to date. Expired documents appear here so you can renew or archive them.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-stroke-soft">
                {expired.map((doc) => <ExpiringDocRow key={doc.id} doc={doc} onChanged={(patch) => patchExpiring(doc.id, patch)} onArchived={() => setExpiring((prev) => prev.filter((d) => d.id !== doc.id))} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function RemindersPage() {
  return (
    <Suspense>
      <RemindersPageInner />
    </Suspense>
  );
}

// ------------------------------------------------------------------ //
// Expiring document row
// ------------------------------------------------------------------ //

function ExpiringDocRow({
  onArchived,
  doc,
  onChanged,
}: {
  doc: ExpiringDocument;
  onChanged: (patch: Partial<ExpiringDocument>) => void;
  onArchived?: () => void;
}) {
  const days = daysLabel(doc.daysUntilExpiry);
  const snoozed = isSnoozed(doc);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
      <div className="flex-1 min-w-[12rem]">
        <Link
          href={`/documents/${doc.id}`}
          className="text-sm font-medium text-ink hover:text-brand-600 transition-colors truncate block"
        >
          {doc.name}
        </Link>
        <div className="flex flex-wrap items-center gap-2 mt-0.5">
          {doc.folderName && (
            <span className="text-xs text-ink-3">{doc.folderName}</span>
          )}
          <span className="text-xs text-ink-3">{doc.ownerEmail}</span>
          {!doc.isReminderEnabled && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-surface-high text-ink-3">reminders off</span>
          )}
          {snoozed && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
              paused until {formatDate(doc.remindersSnoozedUntil)}
            </span>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 text-right">
        <p className="text-xs text-ink-3">
          {formatDate(doc.expiryDate)}
        </p>
        <p className={cn('text-xs font-semibold', days.class)}>
          {days.text}
        </p>
      </div>

      {doc.renewalDueDate && (
        <div className="flex-shrink-0 text-right hidden sm:block">
          <p className="text-[10px] text-ink-3">Renewal due</p>
          <p className="text-xs text-ink-3">{formatDate(doc.renewalDueDate)}</p>
        </div>
      )}

      <ExpiryActions doc={doc} onChanged={onChanged} onArchived={onArchived} />
    </div>
  );
}

// ------------------------------------------------------------------ //
// Upcoming reminder row
// ------------------------------------------------------------------ //

const STATUS_STYLES: Record<UpcomingReminder['status'], { label: string; class: string }> = {
  PENDING:   { label: 'Scheduled', class: 'bg-blue-50 text-blue-600' },
  SENT:      { label: 'Sent',      class: 'bg-green-50 text-green-700' },
  FAILED:    { label: 'Failed',    class: 'bg-red-50 text-red-600' },
  CANCELLED: { label: 'Cancelled', class: 'bg-surface-high text-ink-3' },
};

function ReminderRow({ reminder }: { reminder: UpcomingReminder }) {
  const remindAt = new Date(reminder.remindAt);
  const isOverdue = reminder.status === 'PENDING' && remindAt < new Date();
  const status = STATUS_STYLES[reminder.status] ?? STATUS_STYLES.PENDING;

  return (
    <div className="flex items-center gap-4 px-5 py-3.5">
      <div className="flex-1 min-w-0">
        <Link
          href={`/documents/${reminder.documentId}`}
          className="text-sm font-medium text-ink hover:text-brand-600 transition-colors truncate block"
        >
          {reminder.documentName}
        </Link>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', status.class)}>
            {status.label}
          </span>
          {reminder.expiryDate && (
            <span className="text-xs text-ink-3">
              Expires {formatDate(reminder.expiryDate)}
            </span>
          )}
          {reminder.status === 'FAILED' && reminder.lastError && (
            <span className="text-xs text-red-500 truncate" title={reminder.lastError}>
              {reminder.lastError}
            </span>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 text-right">
        <p className="text-xs text-ink-3">
          {reminder.status === 'SENT' && reminder.sentAt
            ? `Sent ${formatDateTime(reminder.sentAt)}`
            : formatDateTime(reminder.remindAt)}
        </p>
        {isOverdue && (
          <p className="text-[10px] text-orange-500 font-medium">Sending shortly</p>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Loading skeleton
// ------------------------------------------------------------------ //

function PageSkeleton() {
  return (
    <div className="max-w-4xl animate-pulse">
      <div className="h-7 w-32 bg-stroke rounded mb-2" />
      <div className="h-4 w-56 bg-surface-high rounded mb-6" />
      <div className="h-10 w-80 bg-surface-high rounded-lg mb-4" />
      <div className="bg-surface rounded-xl border border-stroke h-80" />
    </div>
  );
}
