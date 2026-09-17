'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/context/UserContext';
import {
  createExternalShare,
  createInternalShare,
  fetchDocumentShares,
  revokeShare,
  buildSharePageUrl,
} from '@/lib/shares';
import { fetchWorkspaceDetail } from '@/lib/documents';
import { cn, initialsOf } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import ConfirmModal from '@/components/ui/ConfirmModal';
import type {
  DocumentShares,
  ExternalShare,
  InternalShare,
  SharePermission,
  WorkspaceMember,
} from '@/types';

type Tab = 'internal' | 'external' | 'active';

// ------------------------------------------------------------------ //
// Root component
// ------------------------------------------------------------------ //

export default function ShareSection({ documentId }: { documentId: string }) {
  const { activeWorkspace } = useUser();
  const [tab, setTab] = useState<Tab>('active');
  const [shares, setShares] = useState<DocumentShares | null>(null);
  const [loadingShares, setLoadingShares] = useState(true);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);

  function reload() {
    fetchDocumentShares(documentId)
      .then(setShares)
      .catch(() => {});
  }

  useEffect(() => {
    fetchDocumentShares(documentId)
      .then(setShares)
      .finally(() => setLoadingShares(false));
  }, [documentId]);

  useEffect(() => {
    if (!activeWorkspace) return;
    fetchWorkspaceDetail(activeWorkspace.workspaceId)
      .then((d) => setMembers(d.members))
      .catch(() => {});
  }, [activeWorkspace?.workspaceId]);

  const totalActive =
    (shares?.internalShares.length ?? 0) + (shares?.externalShares.length ?? 0);

  return (
    <div className="bg-surface rounded-xl border border-stroke overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-stroke-soft flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Sharing</h2>
        {totalActive > 0 && (
          <span className="text-xs font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">
            {totalActive} active
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-stroke-soft">
        {(['active', 'internal', 'external'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 py-2.5 text-xs font-medium transition-colors capitalize',
              tab === t
                ? 'text-brand-700 border-b-2 border-brand-600 -mb-px'
                : 'text-ink-3 hover:text-ink-2',
            )}
          >
            {t === 'active' ? `Active (${totalActive})` : t === 'internal' ? 'Internal' : 'External Link'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-5">
        {tab === 'active' && (
          <ActiveSharesTab
            shares={shares}
            loading={loadingShares}
            onRevoke={(shareId) => {
              revokeShare(shareId)
                .then(reload)
                .catch(() => {});
            }}
          />
        )}
        {tab === 'internal' && (
          <InternalShareTab
            documentId={documentId}
            members={members}
            onShared={reload}
          />
        )}
        {tab === 'external' && (
          <ExternalShareTab
            documentId={documentId}
            onShared={reload}
          />
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Active shares tab
// ------------------------------------------------------------------ //

function ActiveSharesTab({
  shares,
  loading,
  onRevoke,
}: {
  shares: DocumentShares | null;
  loading: boolean;
  onRevoke: (shareId: string) => void;
}) {
  const toast = useToast();
  const [revoking, setRevoking] = useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<string | null>(null);

  async function handleRevoke(shareId: string) {
    setRevoking(shareId);
    setPendingRevoke(null);
    try {
      await revokeShare(shareId);
      toast.success('Share revoked.');
      onRevoke(shareId);
    } catch {
      toast.error('Failed to revoke share.');
    } finally {
      setRevoking(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2].map((i) => (
          <div key={i} className="h-12 bg-surface-high rounded-lg" />
        ))}
      </div>
    );
  }

  const hasShares =
    (shares?.internalShares.length ?? 0) + (shares?.externalShares.length ?? 0) > 0;

  if (!hasShares) {
    return (
      <p className="text-sm text-ink-3 text-center py-6">
        No active shares. Use the tabs above to share this document.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Internal shares */}
      {(shares?.internalShares.length ?? 0) > 0 && (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-label text-ink-3 mb-2">
            Internal
          </p>
          <div className="space-y-2">
            {shares!.internalShares.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-stroke bg-surface-high px-3 py-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-[10px] font-semibold text-brand-700 flex-shrink-0">
                    {initialsOf(s.sharedWith)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-ink truncate">
                      {s.sharedWith.firstName} {s.sharedWith.lastName}
                    </p>
                    <p className="text-[10px] text-ink-3 truncate">{s.sharedWith.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <PermBadge permission={s.permission} />
                  <RevokeButton
                    shareId={s.shareId}
                    revoking={revoking}
                    onRevoke={setPendingRevoke}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* External shares */}
      {(shares?.externalShares.length ?? 0) > 0 && (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-label text-ink-3 mb-2">
            External Links
          </p>
          <div className="space-y-2">
            {shares!.externalShares.map((s) => (
              <ExternalShareRow
                key={s.id}
                share={s}
                revoking={revoking}
                onRevoke={setPendingRevoke}
              />
            ))}
          </div>
        </div>
      )}

      {pendingRevoke && (
        <ConfirmModal
          title="Revoke share"
          body="This share will be immediately deactivated. Recipients will lose access."
          confirmLabel="Revoke"
          danger
          loading={revoking === pendingRevoke}
          onConfirm={() => handleRevoke(pendingRevoke)}
          onClose={() => setPendingRevoke(null)}
        />
      )}
    </div>
  );
}

function ExternalShareRow({
  share,
  revoking,
  onRevoke,
}: {
  share: ExternalShare;
  revoking: string | null;
  onRevoke: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const url = buildSharePageUrl(share.token);

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const isExpired = share.expiresAt && new Date(share.expiresAt) < new Date();

  return (
    <div className="rounded-lg border border-stroke bg-surface-high px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="text-ink-3 flex-shrink-0">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" strokeLinecap="round" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" strokeLinecap="round" />
          </svg>
          <span className="text-xs text-ink-3 truncate font-mono">{url}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {share.hasPassword && <LockIcon />}
          {share.allowDownload && <DownloadIcon />}
          <button
            onClick={copy}
            className="text-xs px-2 py-1 rounded border border-stroke hover:bg-surface transition-colors text-ink-2"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <RevokeButton shareId={share.id} revoking={revoking} onRevoke={onRevoke} />
        </div>
      </div>
      {share.recipientEmails?.length > 0 && (
        <p className="text-xs text-ink-3 mt-1">Emailed to {share.recipientEmails.join(', ')}</p>
      )}
      {share.expiresAt && (
        <p className={cn('text-[10px]', isExpired ? 'text-red-500' : 'text-ink-3')}>
          {isExpired ? 'Expired' : 'Expires'} {new Date(share.expiresAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ //
// Internal share tab
// ------------------------------------------------------------------ //

function InternalShareTab({
  documentId,
  members,
  onShared,
}: {
  documentId: string;
  members: WorkspaceMember[];
  onShared: () => void;
}) {
  const toast = useToast();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [permission, setPermission] = useState<SharePermission>('VIEW');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useUser();

  // Exclude self from list
  const shareable = members.filter((m) => m.userId !== user?.id);

  function toggleMember(userId: string) {
    setSelectedIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  async function handleSubmit() {
    if (selectedIds.length === 0) return;
    setError(null);
    setSubmitting(true);
    try {
      const count = selectedIds.length;
      await createInternalShare(documentId, selectedIds, permission);
      setSelectedIds([]);
      toast.success(`Shared with ${count} ${count === 1 ? 'person' : 'people'}.`);
      onShared();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-ink-2 mb-2">
          Select workspace members to share with
        </label>
        {shareable.length === 0 ? (
          <p className="text-xs text-ink-3">No other workspace members found.</p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {shareable.map((m) => (
              <label
                key={m.userId}
                className={cn(
                  'flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors',
                  selectedIds.includes(m.userId)
                    ? 'border-brand-300 bg-brand-50'
                    : 'border-stroke-soft hover:border-stroke',
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(m.userId)}
                  onChange={() => toggleMember(m.userId)}
                  className="w-3.5 h-3.5 rounded border-stroke text-brand-600"
                />
                <div className="w-6 h-6 rounded-full bg-brand-100 flex items-center justify-center text-[9px] font-semibold text-brand-700 flex-shrink-0">
                  {initialsOf(m)}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-ink">{m.firstName} {m.lastName}</p>
                  <p className="text-[10px] text-ink-3 truncate">{m.email}</p>
                </div>
                <span className="ml-auto text-[10px] text-ink-3 capitalize">{m.role.toLowerCase()}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-ink-2 mb-1.5">Permission</label>
        <div className="flex gap-2">
          {(['VIEW', 'DOWNLOAD'] as SharePermission[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPermission(p)}
              className={cn(
                'flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                permission === p
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-stroke text-ink-2 hover:border-brand-400/60',
              )}
            >
              {p === 'VIEW' ? 'View only' : 'View & Download'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">
          {error}
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting || selectedIds.length === 0}
        className="w-full py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
      >
        {submitting ? 'Sharing…' : `Share with ${selectedIds.length || ''} ${selectedIds.length === 1 ? 'person' : 'people'}`}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ //
// External link tab
// ------------------------------------------------------------------ //

function ExternalShareTab({
  documentId,
  onShared,
}: {
  documentId: string;
  onShared: () => void;
}) {
  const [allowDownload, setAllowDownload] = useState(true);
  const [hasPassword, setHasPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [hasExpiry, setHasExpiry] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [recipientsText, setRecipientsText] = useState('');
  const [message, setMessage] = useState('');
  const [sentTo, setSentTo] = useState<string[]>([]);

  const recipients = recipientsText
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const badRecipient = recipients.find((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));

  async function handleCreate() {
    setError(null);
    setSubmitting(true);
    try {
      const share = await createExternalShare(documentId, {
        allowDownload,
        password: hasPassword && password ? password : undefined,
        expiresAt: hasExpiry && expiresAt ? new Date(expiresAt).toISOString() : undefined,
        recipients: recipients.length ? recipients : undefined,
        message: message.trim() || undefined,
      });
      const url = buildSharePageUrl(share.token);
      setSentTo(share.recipientEmails ?? []);
      setGeneratedLink(url);
      onShared();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create link.');
    } finally {
      setSubmitting(false);
    }
  }

  function copy() {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (generatedLink) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          {sentTo.length > 0
            ? `Link created and emailed to ${sentTo.join(', ')}.${hasPassword ? ' The password was not included; send it to them separately.' : ''}`
            : 'Link created successfully!'}
        </p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={generatedLink}
            className="flex-1 text-xs border border-stroke rounded-lg px-3 py-2 bg-surface-high text-ink font-mono"
          />
          <button
            onClick={copy}
            className="px-3 py-2 text-xs font-medium border border-stroke rounded-lg hover:bg-surface-high transition-colors whitespace-nowrap"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <button
          onClick={() => {
            setGeneratedLink(null);
            setPassword('');
            setHasPassword(false);
            setHasExpiry(false);
            setExpiresAt('');
            setRecipientsText('');
            setMessage('');
            setSentTo([]);
          }}
          className="text-xs text-brand-600 hover:underline"
        >
          Create another link
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Allow download */}
      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={allowDownload}
          onChange={(e) => setAllowDownload(e.target.checked)}
          className="w-3.5 h-3.5 rounded border-stroke text-brand-600"
        />
        <span className="text-sm text-ink-2">Allow file download</span>
      </label>

      {/* Password protection */}
      <div className="space-y-2">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={hasPassword}
            onChange={(e) => setHasPassword(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-stroke text-brand-600"
          />
          <span className="text-sm text-ink-2">Require password</span>
        </label>
        {hasPassword && (
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password (min 4 chars)"
            className="w-full text-sm border border-stroke bg-surface text-ink rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        )}
      </div>

      {/* Expiry date */}
      <div className="space-y-2">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={hasExpiry}
            onChange={(e) => setHasExpiry(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-stroke text-brand-600"
          />
          <span className="text-sm text-ink-2">Set expiry date</span>
        </label>
        {hasExpiry && (
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
            className="w-full text-sm border border-stroke bg-surface text-ink rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        )}
      </div>

      {/* Email the link */}
      <div className="space-y-2">
        <label className="block text-sm text-ink-2">Email this link to <span className="text-ink-3">(optional)</span></label>
        <textarea
          value={recipientsText}
          onChange={(e) => setRecipientsText(e.target.value)}
          rows={2}
          placeholder="one@example.com, two@example.com"
          className="w-full text-sm border border-stroke bg-surface text-ink rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {badRecipient && <p className="text-xs text-red-600">&ldquo;{badRecipient}&rdquo; does not look like an email address.</p>}
        {recipients.length > 0 && !badRecipient && (
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            placeholder="A short note to include (optional)"
            className="w-full text-sm border border-stroke bg-surface text-ink rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        )}
        {recipients.length > 0 && hasPassword && (
          <p className="text-xs text-ink-3">The password is never put in the email. Pass it on another way.</p>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">
          {error}
        </p>
      )}

      <button
        onClick={handleCreate}
        disabled={submitting || (hasPassword && password.length < 4) || !!badRecipient}
        className="w-full py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
      >
        {submitting ? 'Creating…' : recipients.length > 0 ? `Generate link and email ${recipients.length}` : 'Generate Link'}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Small UI helpers
// ------------------------------------------------------------------ //

function PermBadge({ permission }: { permission: string }) {
  return (
    <span
      className={cn(
        'text-[10px] font-semibold px-1.5 py-0.5 rounded',
        permission === 'DOWNLOAD'
          ? 'bg-blue-100 text-blue-700'
          : 'bg-surface-high text-ink-2',
      )}
    >
      {permission === 'DOWNLOAD' ? 'Download' : 'View'}
    </span>
  );
}

function RevokeButton({
  shareId,
  revoking,
  onRevoke,
}: {
  shareId: string;
  revoking: string | null;
  onRevoke: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onRevoke(shareId)}
      disabled={revoking === shareId}
      title="Revoke share"
      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors"
    >
      Revoke
    </button>
  );
}

function LockIcon() {
  return (
    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="text-ink-3" aria-label="Password protected">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="text-ink-3" aria-label="Download allowed">
      <path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
