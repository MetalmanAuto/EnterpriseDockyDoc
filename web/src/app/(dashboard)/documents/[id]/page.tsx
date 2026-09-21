'use client';

import React, { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { fetchDocument, downloadDocument, downloadDocumentVersion, deleteDocumentVersion, uploadDocumentVersion, fetchDocumentReminders, setDocumentReminders, unsnoozeDocumentReminders, updateDocument, deleteDocument, shredDocument, fetchFolders, createFolder, fetchTags, createTag, setDocumentTags, setDocumentMetadata,
  setLegalHold,
} from '@/lib/documents';
import { apiFetch } from '@/lib/api';
import { fetchDocumentActivity, describeAuditLog, auditActionCategory, formatAuditAction } from '@/lib/audit';
import { cn, fullName } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { useUser } from '@/context/UserContext';
import type { AuditLog, DocumentDetail, DocumentReminder, DocumentStatus, DocumentVersion, FolderListItem, Tag } from '@/types';
import ShareSection from './ShareSection';
import DocumentPreviewCard from './DocumentPreviewCard';

// ------------------------------------------------------------------ //
// Status config
// ------------------------------------------------------------------ //

const STATUS_BADGE: Record<DocumentStatus, { label: string; dot: string; bg: string }> = {
  ACTIVE: { label: 'Active', dot: 'bg-green-500', bg: 'bg-green-50 text-green-700 border-green-200' },
  ARCHIVED: { label: 'Archived', dot: 'bg-yellow-500', bg: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  DELETED: { label: 'Deleted', dot: 'bg-red-400', bg: 'bg-red-50 text-red-700 border-red-200' },
};

function formatBytes(bytes: string): string {
  const n = parseInt(bytes, 10);
  if (n === 0) return 'Pending upload';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function initials(firstName: string, lastName: string) {
  return `${firstName[0]}${lastName[0]}`.toUpperCase();
}

// ------------------------------------------------------------------ //
// AI Extraction types
// ------------------------------------------------------------------ //

interface ConfidenceByField {
  documentType: number;
  title: number;
  issuer: number;
  counterparty: number;
  contractNumber: number;
  policyNumber: number;
  certificateNumber: number;
  referenceNumber: number;
  issueDate: number;
  effectiveDate: number;
  expiryDate: number;
  renewalDueDate: number;
  suggestedTags: number;
  suggestedFolder: number;
}

interface AiExtractionResult {
  status: 'done' | 'running' | 'failed' | 'disabled' | 'none';
  documentType: string | null;
  title: string | null;
  issuer: string | null;
  counterparty: string | null;
  contractNumber: string | null;
  policyNumber: string | null;
  certificateNumber: string | null;
  referenceNumber: string | null;
  issueDate: string | null;
  effectiveDate: string | null;
  expiryDate: string | null;
  renewalDueDate: string | null;
  summary: string | null;
  keyPoints: string[];
  suggestedTags: string[];
  suggestedFolder: string | null;
  riskFlags: string[];
  overallConfidence: number;
  dateConfidence: number;
  confidenceByField: ConfidenceByField;
  ocrProvider: string | null;
  extractedAt: string | null;
  appliedFields: string[];
  userAppliedFields?: string[];
  error: string | null;
}

// ------------------------------------------------------------------ //
// Page
// ------------------------------------------------------------------ //

function DocumentDetailPageInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  // Derive the return URL from the ?from= param set by the documents list
  const fromParam = searchParams.get('from') ?? 'all';
  const backHref =
    fromParam === 'trash'
      ? '/documents?view=trash'
      : fromParam.startsWith('folder:')
      ? `/documents?folder=${fromParam.slice('folder:'.length)}`
      : '/documents';
  const backLabel =
    fromParam === 'trash'
      ? 'Trash'
      : fromParam.startsWith('folder:')
      ? 'Folder'
      : 'Documents';
  const { activeWorkspace } = useUser();
  const role = activeWorkspace?.role ?? 'VIEWER';
  const canEdit = role !== 'VIEWER';
  const canAdminOrOwner = role === 'ADMIN' || role === 'OWNER';
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null); // 'latest' | versionNumber string
  const [showVersionUpload, setShowVersionUpload] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState(false);
  const [restoringDoc, setRestoringDoc] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [togglingHold, setTogglingHold] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [shredding, setShredding] = useState(false);
  const [showShredConfirm, setShowShredConfirm] = useState(false);
  const [deletingVersion, setDeletingVersion] = useState<number | null>(null);
  const [pendingDeleteVersion, setPendingDeleteVersion] = useState<number | null>(null);
  const [aiExtraction, setAiExtraction] = useState<AiExtractionResult | null>(null);
  const [aiExtracting, setAiExtracting] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);
  const aiPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track previous AI status to detect running→done transition for live autofill (Part D)
  const prevAiStatusRef = useRef<string | null>(null);
  // Stable ref to toast so loadAiExtraction doesn't need toast in its deps
  const toastRef = useRef(toast);
  toastRef.current = toast;

  function stopAiPolling() {
    if (aiPollRef.current !== null) {
      clearInterval(aiPollRef.current);
      aiPollRef.current = null;
    }
  }

  const loadAiExtraction = useCallback(async () => {
    if (!params.id) return;
    try {
      const result = await apiFetch<AiExtractionResult>(`/api/v1/ai/documents/${params.id}/extraction`);
      const wasRunning = prevAiStatusRef.current === 'running';
      prevAiStatusRef.current = result.status;
      setAiExtraction(result);
      if (result.status !== 'running') {
        stopAiPolling();
        // Reload document when extraction just finished so auto-applied expiry dates appear live
        if (wasRunning && result.status === 'done') {
          fetchDocument(params.id).then(setDoc).catch(() => {});
          // Notify the user about any fields the backend auto-applied at high confidence
          if (result.appliedFields.length > 0) {
            const labels: Record<string, string> = {
              expiryDate: 'Expiry date',
              renewalDueDate: 'Renewal date',
            };
            const applied = result.appliedFields
              .map((f) => labels[f] ?? f)
              .join(', ');
            toastRef.current.success(`Auto-applied: ${applied}`);
          }
        }
      }
    } catch {
      // silently ignore — extraction may not exist yet
    }
  }, [params.id]);

  function startAiPolling() {
    stopAiPolling();
    aiPollRef.current = setInterval(() => {
      void loadAiExtraction();
    }, 3000);
  }

  // Clean up poll on unmount
  useEffect(() => {
    return () => stopAiPolling();
  }, []);

  async function handleAiExtract() {
    if (!params.id) return;
    setAiExtracting(true);
    try {
      const result = await apiFetch<AiExtractionResult>(`/api/v1/ai/documents/${params.id}/extract`, { method: 'POST' });
      prevAiStatusRef.current = result.status;
      setAiExtraction(result);
      // If extraction kicked off async processing, start polling until done
      if (result.status === 'running') {
        startAiPolling();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI extraction failed.');
    } finally {
      setAiExtracting(false);
    }
  }

  async function handleAiApply(fields: string[]) {
    if (!params.id) return;
    setAiApplying(true);
    try {
      const result = await apiFetch<{ applied: string[]; skipped: string[] }>(`/api/v1/ai/documents/${params.id}/apply`, {
        method: 'POST',
        body: JSON.stringify({ fields }),
      });
      reload();
      await loadAiExtraction();
      if (result.applied.length > 0) {
        toast.success(`Applied: ${result.applied.join(', ')}`);
      } else {
        toast.error('Nothing to apply — fields may already be set or have no extracted value.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply AI suggestions.');
    } finally {
      setAiApplying(false);
    }
  }

  function reload() {
    if (!params.id) return;
    fetchDocument(params.id)
      .then(setDoc)
      .catch(() => setError('Document not found or API unavailable.'));
    // Keep AI extraction in sync with the document (e.g. after version upload)
    void loadAiExtraction();
  }

  useEffect(() => {
    if (!params.id) return;
    setLoading(true);
    fetchDocument(params.id)
      .then((d) => {
        setDoc(d);
        setPreviewVersion((prev: number | null) => prev ?? d.currentVersionNumber);
        // Load extraction — also start polling if status is 'none' but document was just created
        // (background extraction may not have written its first DB status row yet)
        const docAgeMs = Date.now() - new Date((d as { createdAt?: string }).createdAt ?? 0).getTime();
        const isRecentlyCreated = docAgeMs < 45_000; // within 45 seconds
        apiFetch<AiExtractionResult>(`/api/v1/ai/documents/${params.id}/extraction`)
          .then((result) => {
            prevAiStatusRef.current = result.status;
            setAiExtraction(result);
            if (result.status === 'running' || (result.status === 'none' && isRecentlyCreated)) {
              startAiPolling();
            }
          })
          .catch(() => {});
      })
      .catch(() => setError('Document not found or API unavailable.'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function handleDelete() {
    if (!doc) return;
    setShowDeleteConfirm(false);
    setDeletingDoc(true);
    try {
      await deleteDocument(doc.id);
      toast.success(`"${doc.name}" has been deleted.`);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setDeletingDoc(false);
    }
  }

  async function handleArchiveToggle() {
    if (!doc) return;
    setArchiving(true);
    try {
      const next = doc.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED';
      await updateDocument(doc.id, { status: next });
      await reload();
      toast.success(next === 'ARCHIVED' ? 'Archived. Reminders are off and it no longer counts as expiring.' : 'Back to active.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change the status.');
    } finally {
      setArchiving(false);
    }
  }

  async function handleToggleHold() {
    if (!doc) return;
    setTogglingHold(true);
    try {
      const updated = await setLegalHold(doc.id, !doc.legalHold);
      setDoc(updated);
      toast.success(updated.legalHold ? 'Legal hold on. This document cannot be deleted or aged out until the hold is lifted.' : 'Legal hold lifted.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change legal hold.');
    } finally {
      setTogglingHold(false);
    }
  }

  async function handleShred() {
    if (!doc) return;
    setShowShredConfirm(false);
    setShredding(true);
    try {
      await shredDocument(doc.id);
      toast.success(`"${doc.name}" has been permanently deleted.`);
      // Return to original context (trash, folder, or all documents)
      router.push(backHref);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Shred failed.');
      setShredding(false);
    }
  }

  async function handleRestore() {
    if (!doc) return;
    setRestoringDoc(true);
    try {
      await updateDocument(doc.id, { status: 'ACTIVE' });
      toast.success(`"${doc.name}" has been restored.`);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restore failed.');
    } finally {
      setRestoringDoc(false);
    }
  }

  async function handleDownloadLatest() {
    if (!doc) return;
    setDownloading('latest');
    try {
      await downloadDocument(doc.id, doc.fileName);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setDownloading(null);
    }
  }

  async function handleDownloadVersion(versionNumber: number) {
    if (!doc) return;
    setDownloading(String(versionNumber));
    try {
      await downloadDocumentVersion(doc.id, versionNumber, doc.fileName);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setDownloading(null);
    }
  }

  async function handleDeleteVersion(versionNumber: number) {
    if (!doc) return;
    setPendingDeleteVersion(null);
    setDeletingVersion(versionNumber);
    try {
      const updated = await deleteDocumentVersion(doc.id, versionNumber);
      setDoc(updated);
      toast.success(`Version ${versionNumber} deleted.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete version.');
    } finally {
      setDeletingVersion(null);
    }
  }

  if (loading) return <DetailSkeleton />;

  if (error || !doc) {
    return (
      <div>
        <Link href={backHref} className="text-sm text-brand-600 hover:underline mb-4 inline-block">
          ← Back to {backLabel}
        </Link>
        <div className="rounded-xl bg-red-50 border border-red-200 px-5 py-4 text-sm text-red-700">
          {error ?? 'Document not found.'}
        </div>
      </div>
    );
  }

  const badge = STATUS_BADGE[doc.status];

  return (
    <div className="max-w-7xl">
      {/* Back navigation */}
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink transition-colors mb-5"
      >
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        {backLabel}
      </Link>

      {/* Document header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="page-title leading-tight">
            {doc.name}
          </h1>
          <p className="mt-1 text-sm text-ink-3">{doc.fileName}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border',
              badge.bg,
            )}
          >
            <span className={cn('w-1.5 h-1.5 rounded-full', badge.dot)} />
            {badge.label}
          </span>
          {/* Download latest button */}
          <button
            type="button"
            onClick={handleDownloadLatest}
            disabled={downloading === 'latest'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-brand-400 dark:text-slate-900 dark:hover:bg-brand-300 text-xs font-semibold active:scale-[0.97] transition-all duration-150 disabled:opacity-50"
          >
            {downloading === 'latest' ? (
              <svg className="animate-spin" width="12" height="12" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            Download
          </button>
          {/* Edit button — editor+ only */}
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowEditModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stroke text-xs font-medium text-ink-2 hover:bg-surface-high transition-colors"
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" strokeLinecap="round" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </button>
          )}
          {canEdit && doc.status !== 'DELETED' && (doc.status === 'ARCHIVED' || (doc.expiryDate && new Date(doc.expiryDate).getTime() < Date.now())) && (
            <button
              type="button"
              onClick={handleArchiveToggle}
              disabled={archiving}
              title={doc.status === 'ARCHIVED' ? 'Make it active again' : 'One-time document that will not be renewed: stop reminders and file it away'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stroke text-xs font-medium text-ink-2 hover:bg-surface-high transition-colors disabled:opacity-50"
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path d="M3 7h18M5 7v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7M10 12h4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {archiving ? 'Saving…' : doc.status === 'ARCHIVED' ? 'Unarchive' : 'Archive'}
            </button>
          )}
          {canAdminOrOwner && (
            <button
              type="button"
              onClick={handleToggleHold}
              disabled={togglingHold}
              title={doc.legalHold ? 'Lift the legal hold so this document can be deleted again' : 'Freeze this document: no one can delete or shred it, and retention rules skip it'}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50',
                doc.legalHold ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100' : 'border-stroke text-ink-2 hover:bg-surface-high',
              )}
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
              </svg>
              {togglingHold ? 'Saving…' : doc.legalHold ? 'On legal hold' : 'Legal hold'}
            </button>
          )}
          {/* Delete / Restore / Shred */}
          {doc.status === 'DELETED' ? (
            <>
              {canEdit && (
                <button
                  type="button"
                  onClick={handleRestore}
                  disabled={restoringDoc || shredding}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green-200 text-xs font-medium text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50"
                >
                  {restoringDoc ? (
                    <>
                      <svg className="animate-spin" width="11" height="11" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Restoring…
                    </>
                  ) : 'Restore'}
                </button>
              )}
              {canAdminOrOwner && (
                <button
                  type="button"
                  onClick={() => setShowShredConfirm(true)}
                  disabled={shredding || restoringDoc || doc.legalHold}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 bg-red-50 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
                  title="Permanently delete all files and records (Admin/Owner only)"
                >
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="10" y1="11" x2="10" y2="17" strokeLinecap="round" />
                    <line x1="14" y1="11" x2="14" y2="17" strokeLinecap="round" />
                  </svg>
                  {shredding ? 'Shredding…' : 'Shred'}
                </button>
              )}
            </>
          ) : (
            canEdit && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deletingDoc || doc.legalHold}
                title={doc.legalHold ? 'On legal hold. Lift the hold to delete.' : undefined}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
                {deletingDoc ? 'Deleting…' : 'Delete'}
              </button>
            )
          )}
        </div>
      </div>

      {/* ── ROW 1: Control layer — Overview + Versions ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

        {/* Overview */}
        <Section title="Overview">
          <InfoRow label="Workspace" value={doc.workspace.name} />
          <InfoRow label="Folder" value={doc.folder ? doc.folder.name : '—'} />
          <InfoRow
            label="Owner"
            value={
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-brand-100 flex items-center justify-center text-[9px] font-semibold text-brand-700">
                  {initials(doc.owner.firstName, doc.owner.lastName)}
                </div>
                <span>{doc.owner.firstName} {doc.owner.lastName}</span>
              </div>
            }
          />
          <InfoRow label="File type" value={doc.fileType.toUpperCase()} />
          <InfoRow label="Version" value={`v${doc.currentVersionNumber}`} />
          <InfoRow label="Created" value={formatDate(doc.createdAt)} />
          <InfoRow label="Last updated" value={formatDate(doc.updatedAt)} />
          {doc.description && (
            <div className="pt-2 mt-1 border-t border-stroke-soft">
              <p className="font-mono text-[10px] uppercase tracking-label text-ink-3 mb-1">Description</p>
              <p className="text-xs text-ink-2 leading-relaxed">{doc.description}</p>
            </div>
          )}
        </Section>

        {/* Versions */}
        <Section
          title={`Versions (${doc.versionCount})`}
          action={
            canEdit && doc.status !== 'DELETED' ? (
              <button
                type="button"
                onClick={() => setShowVersionUpload(true)}
                className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 hover:underline transition-colors"
              >
                <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path d="M4 16.004V17a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1M16 8l-4-4-4 4M12 4v12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Upload new version
              </button>
            ) : undefined
          }
        >
          {doc.versions.length === 0 ? (
            <p className="text-sm text-ink-3">No versions yet.</p>
          ) : (
            <div className="space-y-2">
              {doc.versions.map((v) => (
                <div
                  key={v.id}
                  className={cn(
                    'flex items-center justify-between rounded-lg px-3 py-2.5 border transition-all',
                    v.versionNumber === doc.currentVersionNumber
                      ? 'border-brand-200 border-l-2 border-l-brand-500 bg-brand-50'
                      : 'border-stroke-soft bg-surface-high hover:border-stroke hover:bg-surface',
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span
                        className={cn(
                          'text-xs font-bold tabular-nums px-2 py-0.5 rounded',
                          v.versionNumber === doc.currentVersionNumber
                            ? 'bg-brand-600 text-white'
                            : 'bg-surface-high text-ink-2',
                        )}
                      >
                        v{v.versionNumber}
                      </span>
                      {v.versionNumber === doc.currentVersionNumber && (
                        <span className="font-mono text-[9px] font-semibold text-brand-600 uppercase tracking-label">
                          current
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-ink-2 truncate">
                        {v.uploadedBy.firstName} {v.uploadedBy.lastName}
                      </p>
                      <p className="text-[10px] text-ink-3">{formatDateTime(v.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    <div className="text-right mr-1">
                      <p className="text-[10px] text-ink-3">{formatBytes(v.fileSizeBytes)}</p>
                      <p className="text-[10px] text-ink-3 truncate max-w-24">{v.mimeType}</p>
                    </div>
                    {/* Preview */}
                    <button
                      type="button"
                      onClick={() => setPreviewVersion(v.versionNumber)}
                      title={`Preview v${v.versionNumber}`}
                      className={cn(
                        'p-1.5 rounded-md transition-colors',
                        v.versionNumber === previewVersion
                          ? 'bg-brand-600 text-white shadow-sm'
                          : 'text-ink-3 hover:text-brand-600 hover:bg-brand-50',
                      )}
                    >
                      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                    {/* Download */}
                    {parseInt(v.fileSizeBytes, 10) > 0 && (
                      <button
                        type="button"
                        onClick={() => handleDownloadVersion(v.versionNumber)}
                        disabled={downloading === String(v.versionNumber)}
                        title={`Download v${v.versionNumber}`}
                        className="p-1.5 rounded-md text-ink-3 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-50"
                      >
                        {downloading === String(v.versionNumber) ? (
                          <svg className="animate-spin" width="13" height="13" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    )}
                    {/* Delete */}
                    {canEdit && doc.versions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPendingDeleteVersion(v.versionNumber)}
                        disabled={deletingVersion === v.versionNumber}
                        title={`Delete v${v.versionNumber}`}
                        className="p-1.5 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {deletingVersion === v.versionNumber ? (
                          <svg className="animate-spin" width="12" height="12" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* ── ROW 2: Main interaction — Preview + AI ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-5">

        {/* Preview (left 60%) */}
        <div className="lg:col-span-3">
          <div className="bg-surface rounded-xl border border-stroke overflow-hidden h-full">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-stroke-soft bg-surface-high">
              <div className="flex items-center gap-2 min-w-0">
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="text-ink-3 flex-shrink-0">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 21V9" strokeLinecap="round" />
                </svg>
                <span className="text-xs font-semibold text-ink-2">Preview</span>
                {previewVersion !== null && (
                  <span className="text-[10px] text-ink-3 truncate">
                    v{previewVersion}{previewVersion === doc.currentVersionNumber ? ' · current' : ''}
                  </span>
                )}
              </div>
              {/* Version tabs */}
              {doc.versions.length > 0 && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  {doc.versions.map((v: DocumentVersion) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setPreviewVersion(v.versionNumber)}
                      className={cn(
                        'px-2 py-0.5 rounded text-[10px] font-semibold transition-colors',
                        v.versionNumber === previewVersion
                          ? 'bg-brand-600 text-white'
                          : 'text-ink-3 hover:text-ink-2 hover:bg-surface-high',
                      )}
                    >
                      v{v.versionNumber}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {previewVersion !== null ? (
              <DocumentPreviewCard
                documentId={doc.id}
                versionNumber={previewVersion}
                fileName={doc.fileName}
                mimeHint={doc.versions.find((v: DocumentVersion) => v.versionNumber === previewVersion)?.mimeType}
              />
            ) : (
              <div className="flex items-center justify-center p-12 text-sm text-ink-3 min-h-[240px]">
                No preview available.
              </div>
            )}
          </div>
        </div>

        {/* AI Intelligence Panel (right 40%) */}
        <div className="lg:col-span-2">
          <AiExtractionSection
            documentId={doc.id}
            extraction={aiExtraction}
            extracting={aiExtracting}
            applying={aiApplying}
            workspaceId={doc.workspace.id}
            currentFolderId={doc.folder?.id ?? null}
            onExtract={() => void handleAiExtract()}
            onApply={(fields) => void handleAiApply(fields)}
            onMoveToFolder={async (folderId) => {
              try {
                await updateDocument(doc.id, { folderId });
                reload();
                const folder = folderId ? `folder` : 'root';
                toast.success(folderId ? `Moved to folder.` : 'Removed from folder.');
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Failed to move document.');
              }
            }}
          />
        </div>
      </div>

      {/* ── ROW 3: Expiry & Reminders ───────────────────────────────── */}
      <div className="mb-5">
        <ExpiryReminderSection doc={doc} onSaved={reload} aiExpiryDate={aiExtraction?.expiryDate ?? null} />
      </div>

      {/* ── ROW 4: Tags + Metadata ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <TagsSection
          doc={doc}
          canEdit={canEdit}
          workspaceId={doc.workspace.id}
          aiExtraction={aiExtraction}
          applying={aiApplying}
          onSaved={reload}
          onApplyAiTags={() => void handleAiApply(['suggestedTags'])}
        />
        <MetadataSection
          doc={doc}
          canEdit={canEdit}
          onSaved={reload}
          defaultCollapsed
        />
      </div>

      {/* ── ROW 5: Sharing ──────────────────────────────────────────── */}
      <div className="mb-5">
        <ShareSection documentId={doc.id} />
      </div>

      {/* ── ROW 6: Activity ─────────────────────────────────────────── */}
      <DocumentActivitySection documentId={doc.id} />

      {/* Version upload modal */}
      {showVersionUpload && (
        <VersionUploadModal
          documentId={doc.id}
          fileName={doc.fileName}
          currentVersion={doc.currentVersionNumber}
          onClose={() => setShowVersionUpload(false)}
          onSuccess={() => {
            setShowVersionUpload(false);
            reload();
            toast.success('New version uploaded.');
          }}
        />
      )}

      {/* Edit document modal */}
      {showEditModal && (
        <EditDocumentModal
          doc={doc}
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            setShowEditModal(false);
            reload();
            toast.success('Document updated.');
          }}
        />
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <ConfirmModal
          title="Delete document"
          body={`"${doc.name}" will be soft-deleted and can be restored later.`}
          confirmLabel="Delete Document"
          danger
          loading={deletingDoc}
          onConfirm={handleDelete}
          onClose={() => setShowDeleteConfirm(false)}
        />
      )}

      {/* Shred confirmation modal */}
      {showShredConfirm && (
        <ConfirmModal
          title="Permanently delete document"
          body={`This will permanently destroy "${doc.name}" and all its file versions. This action cannot be undone. Only Admins and Owners can shred documents.`}
          confirmLabel="Shred Permanently"
          danger
          loading={shredding}
          onConfirm={handleShred}
          onClose={() => { if (!shredding) setShowShredConfirm(false); }}
        />
      )}

      {/* Version delete confirmation modal */}
      {pendingDeleteVersion !== null && (
        <ConfirmModal
          title={`Delete version ${pendingDeleteVersion}`}
          body={
            pendingDeleteVersion === doc.currentVersionNumber
              ? `v${pendingDeleteVersion} is the current version. Deleting it will roll back to v${doc.currentVersionNumber - 1}. The file will be permanently removed.`
              : `v${pendingDeleteVersion} will be permanently removed. This cannot be undone.`
          }
          confirmLabel="Delete Version"
          danger
          loading={deletingVersion === pendingDeleteVersion}
          onConfirm={() => handleDeleteVersion(pendingDeleteVersion)}
          onClose={() => { if (deletingVersion === null) setPendingDeleteVersion(null); }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ //
// Expiry & Reminder section
// ------------------------------------------------------------------ //

// ------------------------------------------------------------------ //
// Tags section
// ------------------------------------------------------------------ //

export default function DocumentDetailPage() {
  return (
    <Suspense>
      <DocumentDetailPageInner />
    </Suspense>
  );
}

// ------------------------------------------------------------------ //
// Tag color helpers
// ------------------------------------------------------------------ //

const TAG_PALETTE = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899'];

function deriveTagColor(name: string): string {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h) ^ name.charCodeAt(i);
  return TAG_PALETTE[Math.abs(h) % TAG_PALETTE.length];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TagChip({ name, color, dotted = false }: { name: string; color: string; dotted?: boolean; key?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold',
        dotted ? 'border border-dashed' : '',
      )}
      style={{
        backgroundColor: `${color}18`,
        color,
        ...(dotted ? { borderColor: color } : {}),
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}

// ------------------------------------------------------------------ //
// Tags section — applied tags + AI suggestions with per-tag +/- actions
// ------------------------------------------------------------------ //

function TagsSection({
  doc,
  canEdit,
  workspaceId,
  aiExtraction,
  applying,
  onSaved,
  onApplyAiTags,
}: {
  doc: DocumentDetail;
  canEdit: boolean;
  workspaceId: string;
  aiExtraction: AiExtractionResult | null;
  applying: boolean;
  onSaved: () => void;
  onApplyAiTags: () => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selected, setSelected] = useState<string[]>(doc.tags.map((t: { id: string }) => t.id));
  const [saving, setSaving] = useState(false);
  // Rejected suggestions — initialized from persisted metadata (key: ai:rejectedTags), updated optimistically
  const [rejected, setRejected] = useState<Set<string>>(() => {
    const entry = doc.metadata.find((m) => m.key === 'ai:rejectedTags');
    if (!entry) return new Set<string>();
    try {
      const parsed = JSON.parse(entry.value);
      if (Array.isArray(parsed)) return new Set<string>(parsed.map((s: unknown) => String(s).toLowerCase()));
    } catch {}
    return new Set<string>();
  });
  const [acceptingTag, setAcceptingTag] = useState<string | null>(null);

  const aiAppliedFields = [
    ...(aiExtraction?.appliedFields ?? []),
    ...(aiExtraction?.userAppliedFields ?? []),
  ];
  const aiTagsAlreadyApplied = aiAppliedFields.includes('suggestedTags');
  const docTagNames = new Set(doc.tags.map((t: { name: string }) => t.name.toLowerCase()));
  // Suggestions filtered: not already on doc, not rejected
  const visibleSuggestions: string[] = aiTagsAlreadyApplied
    ? []
    : (aiExtraction?.suggestedTags ?? []).filter(
        (n: string) => !docTagNames.has(n.toLowerCase()) && !rejected.has(n.toLowerCase()),
      );

  async function ensureTags(): Promise<Tag[]> {
    if (allTags.length > 0) return allTags;
    const tags = await fetchTags(workspaceId);
    setAllTags(tags);
    return tags;
  }

  async function acceptSuggestion(tagName: string) {
    setAcceptingTag(tagName);
    try {
      let tags = await ensureTags();
      let match = tags.find((t: Tag) => t.name.toLowerCase() === tagName.toLowerCase());
      if (!match) {
        // Create the tag with a derived color
        match = await createTag(workspaceId, tagName, deriveTagColor(tagName));
        setAllTags((prev: Tag[]) => [...prev, match!]);
      }
      const currentIds = doc.tags.map((t: { id: string }) => t.id);
      if (!currentIds.includes(match.id)) {
        await setDocumentTags(doc.id, [...currentIds, match.id]);
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply tag.');
    } finally {
      setAcceptingTag(null);
    }
  }

  async function rejectSuggestion(tagName: string) {
    const lower = tagName.toLowerCase();
    const newRejected = new Set([...rejected, lower]);
    setRejected(newRejected); // optimistic UI update
    // Persist silently — reuse existing metadata, replace ai:rejectedTags entry
    try {
      const otherMeta = doc.metadata
        .filter((m) => m.key !== 'ai:rejectedTags')
        .map((m) => ({ key: m.key, value: m.value }));
      await setDocumentMetadata(doc.id, [
        ...otherMeta,
        { key: 'ai:rejectedTags', value: JSON.stringify([...newRejected]) },
      ]);
    } catch {
      // Silent fail — UI already updated optimistically; tag stays hidden for this session
    }
  }

  // Dirty check — compare selected IDs against current doc tags (order-insensitive)
  const isTagsDirty = React.useMemo((): boolean => {
    const currentSet = new Set(doc.tags.map((t: { id: string }) => t.id));
    const selectedSet = new Set(selected);
    if (currentSet.size !== selectedSet.size) return true;
    for (const id of currentSet) if (!selectedSet.has(id)) return true;
    return false;
  }, [selected, doc.tags]);

  function startEdit() {
    ensureTags().catch(() => {});
    setSelected(doc.tags.map((t: { id: string }) => t.id));
    setEditing(true);
  }

  function toggleTag(id: string) {
    setSelected((prev: string[]) =>
      prev.includes(id) ? prev.filter((x: string) => x !== id) : [...prev, id],
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await setDocumentTags(doc.id, selected);
      toast.success('Tags updated.');
      setEditing(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update tags.');
    } finally {
      setSaving(false);
    }
  }

  // ── read view ────────────────────────────────────────────────────
  if (!editing) {
    return (
      <Section
        title="Tags"
        action={
          canEdit ? (
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 hover:underline transition-colors"
            >
              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" strokeLinecap="round" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </button>
          ) : undefined
        }
      >
        {/* Applied tags */}
        {doc.tags.length === 0 && visibleSuggestions.length === 0 && (
          <p className="text-xs text-ink-3 italic">No tags applied yet.</p>
        )}
        {doc.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {doc.tags.map((tag: { id: string; name: string; color: string | null }) => (
              <TagChip
                key={tag.id}
                name={tag.name}
                color={tag.color ?? deriveTagColor(tag.name)}
              />
            ))}
          </div>
        )}

        {/* AI suggestions — per-tag +/- actions */}
        {visibleSuggestions.length > 0 && (
          <div className={cn(doc.tags.length > 0 && 'mt-3 pt-3 border-t border-stroke-soft')}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] uppercase tracking-label text-ink-3 flex items-center gap-1">
                <svg width="9" height="9" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                AI Suggestions
              </span>
              {canEdit && visibleSuggestions.length > 1 && (
                <button
                  type="button"
                  onClick={onApplyAiTags}
                  disabled={applying}
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-brand-600 hover:underline disabled:opacity-50 transition-colors"
                >
                  {applying ? <SpinnerIcon size={9} /> : null}
                  Apply all
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {visibleSuggestions.map((name: string) => {
                const isAccepting = acceptingTag === name;
                const color = deriveTagColor(name);
                return (
                  <div
                    key={name}
                    className="inline-flex items-center gap-0.5 group"
                  >
                    {/* Dotted suggestion chip */}
                    <span
                      className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-l-full border border-dashed text-xs font-semibold"
                      style={{ backgroundColor: `${color}12`, color, borderColor: color }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      {name}
                    </span>
                    {/* Accept (+) */}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => void acceptSuggestion(name)}
                        disabled={isAccepting}
                        title={`Accept "${name}"`}
                        className="inline-flex items-center justify-center w-5 h-[22px] rounded-r-full border border-l-0 border-dashed bg-green-50 text-green-600 hover:bg-green-500 hover:text-white hover:border-green-500 hover:border-solid active:scale-90 transition-all duration-150 disabled:opacity-50"
                        style={{ borderColor: color }}
                      >
                        {isAccepting
                          ? <SpinnerIcon size={8} />
                          : <svg width="9" height="9" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
                        }
                      </button>
                    )}
                    {/* Reject (−) */}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => void rejectSuggestion(name)}
                        title={`Dismiss "${name}"`}
                        className="inline-flex items-center justify-center w-5 h-[22px] rounded-full border border-dashed bg-surface-high text-ink-3 hover:bg-red-50 hover:text-red-500 hover:border-red-300 hover:border-solid active:scale-90 transition-all duration-150 ml-0.5"
                        style={{ borderColor: '#d1d5db' }}
                      >
                        <svg width="9" height="9" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Section>
    );
  }

  // ── edit view ────────────────────────────────────────────────────
  return (
    <Section title="Tags">
      {allTags.length === 0 ? (
        <p className="text-xs text-ink-3 mb-3">No tags in workspace yet. Create tags in Settings first.</p>
      ) : (
        <div className="flex flex-wrap gap-2 mb-4">
          {allTags.map((tag: Tag) => {
            const isOn = selected.includes(tag.id);
            const color = tag.color ?? deriveTagColor(tag.name);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                title={isOn ? `Remove "${tag.name}"` : `Add "${tag.name}"`}
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all select-none',
                  isOn ? 'opacity-100 ring-2 ring-offset-1' : 'opacity-40 hover:opacity-70',
                )}
                style={{ backgroundColor: `${color}18`, color }}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                {tag.name}
                {isOn && (
                  <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" className="ml-0.5">
                    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !isTagsDirty}
          title={!isTagsDirty ? 'No changes to save' : undefined}
          className="px-3 py-1.5 text-xs font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="px-3 py-1.5 text-xs text-ink-3 hover:text-ink-2 disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ //
// Metadata section — editable key/value pairs
// ------------------------------------------------------------------ //

interface MetadataRow {
  key: string;
  value: string;
  /** cuid from DB if the row already exists, undefined for newly added rows */
  id?: string;
}

function MetadataSection({
  doc,
  canEdit,
  onSaved,
  defaultCollapsed = false,
}: {
  doc: DocumentDetail;
  canEdit: boolean;
  onSaved: () => void;
  defaultCollapsed?: boolean;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<MetadataRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dirty check — save is only active when something changed
  const isDirty = React.useMemo((): boolean => {
    if (rows.length !== doc.metadata.length) return true;
    return rows.some((r: MetadataRow, i: number) => {
      const m = doc.metadata[i];
      return r.key.trim() !== m.key || r.value.trim() !== m.value;
    });
  }, [rows, doc.metadata]);

  function startEdit() {
    setRows(doc.metadata.map((m) => ({ id: m.id, key: m.key, value: m.value })));
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setError(null);
  }

  function addRow() {
    setRows((prev: MetadataRow[]) => [...prev, { key: '', value: '' }]);
  }

  function removeRow(idx: number) {
    setRows((prev: MetadataRow[]) => prev.filter((_: MetadataRow, i: number) => i !== idx));
  }

  function updateRow(idx: number, field: 'key' | 'value', val: string) {
    setRows((prev: MetadataRow[]) =>
      prev.map((r: MetadataRow, i: number) => (i === idx ? { ...r, [field]: val } : r)),
    );
  }

  async function handleSave() {
    // Validate: no duplicate keys, no blank keys
    const trimmed = rows.map((r: MetadataRow) => ({ key: r.key.trim(), value: r.value.trim() }));
    const keys = trimmed.map((r: { key: string; value: string }) => r.key).filter(Boolean);
    if (trimmed.some((r: { key: string; value: string }) => !r.key)) {
      setError('All metadata keys must be non-empty.');
      return;
    }
    if (new Set(keys).size !== keys.length) {
      setError('Duplicate metadata keys are not allowed.');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await setDocumentMetadata(doc.id, trimmed);
      toast.success('Metadata saved.');
      setEditing(false);
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save metadata.';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  // ── read-only view ────────────────────────────────────────────────
  if (!editing) {
    return (
      <Section
        title="Metadata"
        collapsible={defaultCollapsed}
        defaultCollapsed={defaultCollapsed}
        action={
          canEdit ? (
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
            >
              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" strokeLinecap="round" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </button>
          ) : undefined
        }
      >
        {doc.metadata.length === 0 ? (
          <p className="text-xs text-ink-3 italic">No metadata added.</p>
        ) : (
          <dl className="space-y-2">
            {doc.metadata.map((m) => (
              <div key={m.id} className="flex gap-3">
                <dt className="w-32 flex-shrink-0 text-xs text-ink-3 font-medium pt-0.5 truncate">
                  {m.key}
                </dt>
                <dd className="flex-1 text-sm text-ink-2 break-all">{m.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Section>
    );
  }

  // ── edit view ─────────────────────────────────────────────────────
  return (
    <Section title="Metadata">
      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="text-sm text-ink-3">No entries yet. Add one below.</p>
        )}
        {rows.map((row: MetadataRow, idx: number) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Key"
              value={row.key}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRow(idx, 'key', e.target.value)}
              className="w-36 flex-shrink-0 text-xs border border-stroke bg-surface text-ink rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 font-medium placeholder:text-ink-3"
            />
            <input
              type="text"
              placeholder="Value"
              value={row.value}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRow(idx, 'value', e.target.value)}
              className="flex-1 text-sm border border-stroke bg-surface text-ink rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-ink-3"
            />
            <button
              type="button"
              onClick={() => removeRow(idx)}
              title="Remove row"
              className="p-1.5 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Add row */}
      <button
        type="button"
        onClick={addRow}
        className="mt-3 inline-flex items-center gap-1.5 text-xs text-brand-600 hover:underline"
      >
        <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
        Add metadata
      </button>

      {/* Error */}
      {error && (
        <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !isDirty}
          title={!isDirty ? 'No changes to save' : undefined}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
        >
          {saving && (
            <svg className="animate-spin" width="12" height="12" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={cancelEdit}
          disabled={saving}
          className="px-3 py-1.5 text-xs text-ink-3 hover:text-ink-2 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </Section>
  );
}

const OFFSET_OPTIONS = [
  { days: 365, label: '1 year before' },
  { days: 180, label: '6 months before' },
  { days: 90,  label: '3 months before' },
  { days: 30,  label: '1 month before' },
  { days: 14,  label: '2 weeks before' },
  { days: 7,   label: '1 week before' },
  { days: 1,   label: '1 day before' },
];
const DEFAULT_OFFSET_DAYS = [90, 30, 7];
const MS_PER_DAY = 86_400_000;

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 10); // 'YYYY-MM-DD'
}

function offsetLabel(days: number): string {
  const preset = OFFSET_OPTIONS.find((o) => o.days === days);
  if (preset) return preset.label;
  if (days % 365 === 0) return `${days / 365} years before`;
  if (days % 30 === 0) return `${days / 30} months before`;
  return `${days} days before`;
}

/** Recover the "days before expiry" offsets from the pending reminder rows. */
function deriveOffsets(reminders: DocumentReminder[], expiryIso: string | null | undefined): number[] {
  if (!expiryIso) return [];
  const expiry = new Date(expiryIso);
  expiry.setUTCHours(23, 59, 59, 999);
  const offsets = reminders
    .filter((r) => r.status === 'PENDING')
    .map((r) => Math.round((expiry.getTime() - new Date(r.remindAt).getTime()) / MS_PER_DAY))
    .filter((d) => d > 0);
  return Array.from(new Set(offsets)).sort((a, b) => b - a);
}

function reminderStatusBadge(status: DocumentReminder['status']): string {
  switch (status) {
    case 'SENT': return 'bg-green-50 text-green-700 border-green-200';
    case 'FAILED': return 'bg-red-50 text-red-700 border-red-200';
    case 'CANCELLED': return 'bg-surface-high text-ink-3 border-stroke';
    default: return 'bg-blue-50 text-blue-700 border-blue-200';
  }
}

function ExpiryReminderSection({
  doc,
  onSaved,
  aiExpiryDate = null,
}: {
  doc: DocumentDetail;
  onSaved: () => void;
  /** Expiry date detected by AI extraction (ISO), offered as a one-click suggestion. */
  aiExpiryDate?: string | null;
}) {
  const toast = useToast();
  const [resuming, setResuming] = useState(false);
  const aiSuggestion = aiExpiryDate ? aiExpiryDate.slice(0, 10) : null;
  const snoozedUntil = doc.remindersSnoozedUntil && new Date(doc.remindersSnoozedUntil) > new Date()
    ? doc.remindersSnoozedUntil
    : null;

  async function handleResume() {
    setResuming(true);
    try {
      await unsnoozeDocumentReminders(doc.id);
      toast.success('Reminder emails resumed.');
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resume reminders.');
    } finally {
      setResuming(false);
    }
  }
  const [expiryDate, setExpiryDate] = useState(toDateInput(doc.expiryDate));
  const [renewalDueDate, setRenewalDueDate] = useState(toDateInput(doc.renewalDueDate));
  const [isReminderEnabled, setIsReminderEnabled] = useState(doc.isReminderEnabled);
  const [offsetDays, setOffsetDays] = useState<number[]>(DEFAULT_OFFSET_DAYS);
  const [customMonths, setCustomMonths] = useState('');
  const [reminders, setReminders] = useState<DocumentReminder[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate the selected offsets from what is actually scheduled server-side.
  useEffect(() => {
    let cancelled = false;
    fetchDocumentReminders(doc.id)
      .then((list) => {
        if (cancelled) return;
        setReminders(list);
        const derived = deriveOffsets(list, doc.expiryDate);
        if (derived.length > 0) setOffsetDays(derived);
      })
      .catch(() => { /* non-fatal: fall back to defaults */ });
    return () => { cancelled = true; };
  }, [doc.id, doc.expiryDate]);

  function toggleOffset(days: number) {
    setOffsetDays((prev) =>
      (prev.includes(days) ? prev.filter((d) => d !== days) : [...prev, days]).sort((a, b) => b - a),
    );
  }

  function addCustomMonths() {
    const months = parseInt(customMonths, 10);
    if (!Number.isInteger(months) || months < 1 || months > 120) {
      setError('Enter a number of months between 1 and 120.');
      return;
    }
    setError(null);
    toggleOffset(months * 30);
    setCustomMonths('');
  }

  const customOffsets = offsetDays.filter((d) => !OFFSET_OPTIONS.some((o) => o.days === d));
  const visibleReminders = reminders
    .filter((r) => r.status !== 'CANCELLED')
    .sort((a, b) => new Date(a.remindAt).getTime() - new Date(b.remindAt).getTime())
    .slice(0, 8);

  async function handleSave() {
    setError(null);

    // Validate: reminders require an expiry date
    if (isReminderEnabled && !expiryDate) {
      setError('An expiry date is required to enable reminders.');
      return;
    }

    // Validate: expiry date must be in the future
    if (expiryDate) {
      const exp = new Date(expiryDate);
      exp.setHours(23, 59, 59, 999); // end of day
      if (exp <= new Date()) {
        setError('Expiry date must be in the future.');
        return;
      }
    }

    // Validate: at least one offset must be selected when reminders are on
    if (isReminderEnabled && offsetDays.length === 0) {
      setError('Select at least one reminder interval.');
      return;
    }

    setSaving(true);
    try {
      const saved = await setDocumentReminders(doc.id, {
        expiryDate: expiryDate || null,
        renewalDueDate: renewalDueDate || null,
        isReminderEnabled,
        offsetDays: isReminderEnabled ? offsetDays : [],
        channel: 'EMAIL',
      });
      setReminders(saved);
      toast.success('Expiry & reminders saved.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Expiry &amp; Reminders">
      {!expiryDate && !renewalDueDate && !isReminderEnabled && (
        <p className="text-xs text-ink-3 mb-4">
          Set expiry dates below and enable reminders to get notified before this document lapses.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-xs font-medium text-ink-2 mb-1">
            Expiry date
          </label>
          <p className="text-[10px] text-ink-3 mb-1.5">Auto-filled when detected by AI</p>
          <input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="w-full text-sm border border-stroke bg-surface text-ink rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {aiSuggestion && aiSuggestion !== expiryDate && (
            <button
              type="button"
              onClick={() => { setExpiryDate(aiSuggestion); setIsReminderEnabled(true); }}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-brand-700 bg-brand-50 border border-brand-100 rounded-md px-2 py-1 hover:bg-brand-100"
            >
              <span aria-hidden>✦</span>
              AI detected {new Date(aiSuggestion).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} — use it
            </button>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-2 mb-1">
            Renewal due date
          </label>
          <p className="text-[10px] text-ink-3 mb-1.5">Auto-filled when detected by AI</p>
          <input
            type="date"
            value={renewalDueDate}
            onChange={(e) => setRenewalDueDate(e.target.value)}
            className="w-full text-sm border border-stroke bg-surface text-ink rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isReminderEnabled}
            onChange={(e) => setIsReminderEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-stroke text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm text-ink-2 font-medium">Enable reminders</span>
        </label>
        {snoozedUntil && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <span>
              Reminder emails are paused until{' '}
              {new Date(snoozedUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.
            </span>
            <button
              type="button"
              onClick={handleResume}
              disabled={resuming}
              className="font-medium text-amber-900 underline underline-offset-2 disabled:opacity-50"
            >
              {resuming ? 'Resuming…' : 'Resume now'}
            </button>
          </div>
        )}
      </div>

      {isReminderEnabled && (
        <div className="mt-3 pl-6">
          <p className="text-xs text-ink-3 mb-2">
            Email me before expiry:
          </p>
          <div className="flex flex-wrap gap-2">
            {OFFSET_OPTIONS.map(({ days, label }) => {
              const active = offsetDays.includes(days);
              return (
                <button
                  key={days}
                  type="button"
                  onClick={() => toggleOffset(days)}
                  aria-pressed={active}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs border transition-colors',
                    active
                      ? 'bg-brand-600 border-brand-600 text-white'
                      : 'bg-surface border-stroke text-ink-2 hover:border-brand-400',
                  )}
                >
                  {label}
                </button>
              );
            })}
            {customOffsets.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => toggleOffset(days)}
                aria-pressed
                title="Click to remove"
                className="px-2.5 py-1 rounded-full text-xs border bg-brand-600 border-brand-600 text-white"
              >
                {offsetLabel(days)} ×
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-ink-3">Remind me</span>
            <input
              type="number"
              min={1}
              max={120}
              value={customMonths}
              onChange={(e) => setCustomMonths(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomMonths(); } }}
              placeholder="6"
              className="w-16 text-xs border border-stroke bg-surface text-ink rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <span className="text-xs text-ink-3">months before expiry</span>
            <button
              type="button"
              onClick={addCustomMonths}
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              Add
            </button>
          </div>

          <p className="mt-3 text-[11px] text-ink-3">
            Reminders are emailed to the document owner and workspace admins at 09:00 UTC on each date.
          </p>

          {visibleReminders.length > 0 && (
            <ul className="mt-3 space-y-1">
              {visibleReminders.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-xs text-ink-2">
                  <span
                    className={cn(
                      'inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium uppercase tracking-wide',
                      reminderStatusBadge(r.status),
                    )}
                  >
                    {r.status === 'PENDING' ? 'Scheduled' : r.status.toLowerCase()}
                  </span>
                  <span>
                    {new Date(r.remindAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {saving && (
            <svg className="animate-spin" width="13" height="13" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ //
// Edit document modal
// ------------------------------------------------------------------ //

function EditDocumentModal({
  doc,
  onClose,
  onSaved,
}: {
  doc: DocumentDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(doc.name);
  const [description, setDescription] = useState(doc.description ?? '');
  const [folderId, setFolderId] = useState(doc.folder?.id ?? '');
  const [status, setStatus] = useState<DocumentStatus>(doc.status);
  const [folders, setFolders] = useState<FolderListItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFolders(doc.workspace.id)
      .then(setFolders)
      .catch(() => {});
  }, [doc.workspace.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      await updateDocument(doc.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        folderId: folderId || null,
        status,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop">
      <div className="bg-surface border border-stroke rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden animate-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stroke-soft">
          <h2 className="text-base font-semibold text-ink">Edit Document</h2>
          <button type="button" onClick={onClose} className="text-ink-3 hover:text-ink-2 transition-colors">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1.5">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full text-sm border border-stroke bg-surface text-ink rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full text-sm border border-stroke bg-surface text-ink rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="Optional description…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1.5">Folder</label>
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="w-full text-sm border border-stroke bg-surface text-ink rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">No folder</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1.5">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as DocumentStatus)}
                className="w-full text-sm border border-stroke bg-surface text-ink rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="ACTIVE">Active</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 px-4 py-2 rounded-lg border border-stroke text-sm text-ink-2 hover:bg-surface-high transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-brand-400 dark:text-slate-900 dark:hover:bg-brand-300 text-sm font-semibold active:scale-[0.97] transition-all duration-150 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Version upload modal
// ------------------------------------------------------------------ //

function VersionUploadModal({
  documentId,
  fileName,
  currentVersion,
  onClose,
  onSuccess,
}: {
  documentId: string;
  fileName: string;
  currentVersion: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError('Please select a file.'); return; }

    setUploading(true);
    setError(null);

    try {
      await uploadDocumentVersion(documentId, file, notes.trim() || undefined);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop"
      onClick={handleBackdrop}
    >
      <div className="bg-surface border border-stroke rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stroke-soft">
          <div>
            <h2 className="text-base font-semibold text-ink">Upload New Version</h2>
            <p className="text-xs text-ink-3 mt-0.5">
              {fileName} · current v{currentVersion} → v{currentVersion + 1}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-3 hover:text-ink-2 transition-colors"
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* File picker */}
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1.5">
              New file <span className="text-red-500">*</span>
            </label>
            <div
              className={cn(
                'relative border-2 border-dashed rounded-lg px-4 py-5 text-center cursor-pointer transition-colors',
                file ? 'border-brand-300 bg-brand-50' : 'border-stroke hover:border-brand-400/60',
              )}
              onClick={() => fileRef.current?.click()}
            >
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-sm font-medium text-ink truncate max-w-xs">{file.name}</span>
                  <span className="text-xs text-ink-3">({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
              ) : (
                <div>
                  <svg className="mx-auto mb-2 text-gray-300" width="28" height="28" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path d="M4 16.004V17a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1M16 8l-4-4-4 4M12 4v12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="text-sm text-ink-3">Click to choose the updated file</p>
                  <p className="text-xs text-ink-3 mt-1">Up to 50 MB</p>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.zip,.json"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1.5">
              Change notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What changed in this version?"
              rows={2}
              className="w-full rounded-lg border border-stroke bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              className="flex-1 px-4 py-2 rounded-lg border border-stroke text-sm text-ink-2 hover:bg-surface-high transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || !file}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-brand-400 dark:text-slate-900 dark:hover:bg-brand-300 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <>
                  <svg className="animate-spin" width="14" height="14" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Uploading…
                </>
              ) : (
                `Upload v${currentVersion + 1}`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Document activity section
// ------------------------------------------------------------------ //

const ACTIVITY_CATEGORY_STYLES = {
  create:   'bg-green-50 text-green-700',
  update:   'bg-blue-50 text-blue-700',
  delete:   'bg-red-50 text-red-700',
  share:    'bg-purple-50 text-purple-700',
  download: 'bg-amber-50 text-amber-700',
  member:   'bg-teal-50 text-teal-700',
} as const;

const ACTIVITY_DOT_STYLES = {
  create:   'bg-green-500',
  update:   'bg-blue-500',
  delete:   'bg-red-500',
  share:    'bg-purple-500',
  download: 'bg-amber-500',
  member:   'bg-teal-500',
} as const;

function DocumentActivitySection({ documentId }: { documentId: string }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDocumentActivity(documentId)
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [documentId]);

  return (
    <Section title="Activity">
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="w-2 h-2 rounded-full bg-surface-high mt-2 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-2/3 bg-surface-high rounded" />
                <div className="h-3 w-1/3 bg-surface-high rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <p className="text-xs text-ink-3 italic">No activity yet.</p>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => {
            const category = auditActionCategory(log.action);
            const actor = log.user
              ? fullName(log.user)
              : 'External user';
            const diff = Date.now() - new Date(log.createdAt).getTime();
            const m = Math.floor(diff / 60000);
            const timeAgo =
              m < 1 ? 'just now'
              : m < 60 ? `${m}m ago`
              : m < 1440 ? `${Math.floor(m / 60)}h ago`
              : new Date(log.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

            return (
              <div key={log.id} className="flex items-start gap-3">
                <span
                  className={cn(
                    'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                    ACTIVITY_DOT_STYLES[category],
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-ink leading-snug">
                      {describeAuditLog(log)}
                    </p>
                    <time className="text-xs text-ink-3 whitespace-nowrap flex-shrink-0">
                      {timeAgo}
                    </time>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-ink-3">{actor}</span>
                    <span
                      className={cn(
                        'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                        ACTIVITY_CATEGORY_STYLES[category],
                      )}
                    >
                      {formatAuditAction(log.action)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ //
// AiExtractionSection
// ------------------------------------------------------------------ //

function SpinnerIcon({ size = 14 }: { size?: number }) {
  return (
    <svg className="animate-spin" width={size} height={size} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function confidenceClass(c: number): string {
  if (c >= 0.85) return 'bg-green-50 text-green-700 border-green-200';
  if (c >= 0.6) return 'bg-yellow-50 text-yellow-700 border-yellow-200';
  return 'bg-red-50 text-red-700 border-red-200';
}

function confidenceLabel(c: number): string {
  if (c >= 0.85) return 'High';
  if (c >= 0.6) return 'Medium';
  return 'Low';
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence <= 0) return null;
  const pct = Math.round(confidence * 100);
  const cls =
    confidence >= 0.85
      ? 'bg-green-50 text-green-600 border-green-200'
      : confidence >= 0.6
      ? 'bg-yellow-50 text-yellow-600 border-yellow-200'
      : 'bg-surface-high text-ink-3 border-stroke';
  const label = confidence >= 0.85 ? 'High' : confidence >= 0.6 ? 'Medium' : 'Low';
  return (
    <span className={cn('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border', cls)}>
      {label} ({pct}%)
    </span>
  );
}

function daysUntil(iso: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function urgencyClass(days: number): string {
  if (days < 0) return 'text-red-600 font-semibold';
  if (days <= 30) return 'text-orange-600 font-medium';
  if (days <= 90) return 'text-yellow-600';
  return 'text-ink-2';
}

// ------------------------------------------------------------------ //
// Folder name scoring — multi-signal fuzzy match for AI suggestion
// ------------------------------------------------------------------ //

function scoreFolderMatch(folderName: string, suggestion: string): number {
  const canon = (s: string) =>
    s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const f = canon(folderName);
  const s = canon(suggestion);

  if (f === s) return 100;
  if (f.includes(s) || s.includes(f)) return 88;

  const fToks = f.split(' ').filter(Boolean);
  const sToks = s.split(' ').filter(Boolean);
  const fSet = new Set(fToks);

  // Exact token overlap
  const exactOverlap = sToks.filter((t) => fSet.has(t)).length;
  if (exactOverlap > 0) return 65 + exactOverlap * 8;

  // Stem/plural overlap — one token starts with the other (e.g. "passports" ↔ "passport")
  const stemOverlap = sToks.filter((t) =>
    fToks.some((ft) => (ft.startsWith(t) && t.length >= 4) || (t.startsWith(ft) && ft.length >= 4)),
  ).length;
  if (stemOverlap > 0) return 60 + stemOverlap * 6;

  // Semantic keyword groups — handles cross-term mapping like "Passport" ↔ "ID's"
  const groups: string[][] = [
    ['passport', 'id', 'ids', 'identity', 'identification', 'document', 'government'],
    ['insurance', 'policy', 'policies', 'coverage', 'premium'],
    ['contract', 'agreement', 'agreements', 'contracts', 'deal', 'terms'],
    ['invoice', 'receipt', 'receipts', 'billing', 'payment', 'finance', 'financial'],
    ['certificate', 'certification', 'certifications', 'certificates', 'accreditation'],
    ['license', 'licence', 'licenses', 'licences', 'permit', 'permits'],
    ['legal', 'law', 'court', 'litigation', 'compliance'],
    ['medical', 'health', 'healthcare', 'clinical', 'hospital', 'prescription'],
    ['hr', 'human', 'resources', 'employee', 'employment', 'payroll', 'hiring', 'staff'],
    ['tax', 'taxes', 'taxation', 'irs', 'vat', 'fiscal'],
    ['property', 'real estate', 'mortgage', 'deed', 'lease', 'rental', 'tenancy'],
    ['vehicle', 'car', 'auto', 'automobile', 'registration', 'mot', 'driving'],
    ['education', 'school', 'university', 'college', 'diploma', 'degree', 'academic', 'transcript'],
    ['travel', 'visa', 'immigration', 'itinerary', 'ticket', 'flight', 'hotel'],
    ['bank', 'banking', 'account', 'statement', 'savings', 'loan', 'credit', 'mortgage'],
    ['utility', 'utilities', 'electric', 'electricity', 'gas', 'water', 'internet', 'phone', 'broadband'],
    ['company', 'business', 'corporate', 'incorporation', 'shareholder', 'director'],
  ];
  for (const group of groups) {
    const fHit = group.some((k) => f.includes(k));
    const sHit = group.some((k) => s.includes(k));
    if (fHit && sHit) return 55;
  }
  return 0;
}

/**
 * Compute top-N best folder matches for an AI suggestion.
 * Returns at most `limit` folders with score > 0, sorted by score desc.
 */
function topFolderSuggestions(
  folders: FolderListItem[],
  aiSuggestion: string,
  limit = 3,
): Array<{ folder: FolderListItem; score: number }> {
  return folders
    .map((f) => ({ folder: f, score: scoreFolderMatch(f.name, aiSuggestion) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ------------------------------------------------------------------ //
// FolderCombobox — searchable, creatable folder picker with top-3 suggestions
// ------------------------------------------------------------------ //

function FolderCombobox({
  folders,
  currentFolderId,
  aiSuggestion,
  workspaceId,
  onMove,
  onFolderCreated,
  disabled,
}: {
  folders: FolderListItem[];
  currentFolderId: string | null;
  aiSuggestion: string | null;
  workspaceId: string;
  onMove: (folderId: string | null) => Promise<void>;
  onFolderCreated: (folder: FolderListItem) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const currentFolder = folders.find((f) => f.id === currentFolderId) ?? null;

  // Top 3 AI-ranked folder suggestions
  const suggestions = React.useMemo(
    () => (aiSuggestion ? topFolderSuggestions(folders, aiSuggestion, 3) : []),
    [folders, aiSuggestion],
  );
  const suggestionIds = React.useMemo(() => new Set(suggestions.map(({ folder: f }) => f.id)), [suggestions]);

  // In-dropdown list: when searching → filtered sorted by score; when idle → all except suggestions (to avoid duplication)
  const dropdownFolders = React.useMemo(() => {
    const lq = query.toLowerCase();
    const scored = folders.map((f) => ({
      folder: f,
      aiScore: aiSuggestion ? scoreFolderMatch(f.name, aiSuggestion) : 0,
    }));
    if (lq) {
      return scored
        .filter(({ folder: f }) => f.name.toLowerCase().includes(lq))
        .sort((a, b) => b.aiScore - a.aiScore);
    }
    // Idle: show remaining folders (not in top suggestions) sorted by score then alpha
    return scored
      .filter(({ folder: f }) => !suggestionIds.has(f.id))
      .sort((a, b) => b.aiScore - a.aiScore || a.folder.name.localeCompare(b.folder.name));
  }, [folders, query, aiSuggestion, suggestionIds]);

  const showCreate =
    query.trim().length > 0 &&
    !folders.some((f) => f.name.toLowerCase() === query.trim().toLowerCase());

  async function select(folderId: string | null) {
    setSaving(true);
    try {
      await onMove(folderId);
      setOpen(false);
      setQuery('');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    try {
      const created = await createFolder({ workspaceId, name });
      onFolderCreated(created);
      await select(created.id);
    } catch {
      // stay open on failure
    } finally {
      setCreating(false);
    }
  }

  function handleBlur(e: React.FocusEvent) {
    if (listRef.current?.contains(e.relatedTarget as Node)) return;
    if (inputRef.current?.contains(e.relatedTarget as Node)) return;
    setOpen(false);
    setQuery('');
  }

  const displayValue = open ? query : (currentFolder?.name ?? '');
  const placeholder = open
    ? 'Search or type new folder name…'
    : aiSuggestion
    ? `AI suggests: "${aiSuggestion}"`
    : 'No folder assigned';

  return (
    <div className="relative" onBlur={handleBlur}>

      {/* ── Top-3 suggestion pills — quick-pick row (visible when not busy) ── */}
      {suggestions.length > 0 && !saving && !creating && (
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          <span className="font-mono text-[9px] uppercase tracking-label text-ink-3 flex-shrink-0">Best matches</span>
          {suggestions.map(({ folder: f, score }) => {
            const isCurrent = f.id === currentFolderId;
            return (
              <button
                key={f.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); void select(f.id); }}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors cursor-pointer',
                  isCurrent
                    ? 'border-brand-400 bg-brand-50 text-brand-700'
                    : score >= 88
                    ? 'border-brand-200 bg-brand-50 text-brand-700 hover:border-brand-400 hover:bg-brand-100'
                    : 'border-stroke bg-surface text-ink-2 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700',
                )}
              >
                <svg width="8" height="8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="flex-shrink-0">
                  <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
                </svg>
                {f.name}
                {isCurrent && (
                  <svg width="8" height="8" fill="currentColor" viewBox="0 0 20 20" className="flex-shrink-0">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Input ── */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          placeholder={placeholder}
          disabled={disabled || saving || creating}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setOpen(false); setQuery(''); inputRef.current?.blur(); }
            if (e.key === 'Enter' && showCreate) { void handleCreate(); }
          }}
          className={cn(
            'w-full text-xs border rounded-md px-2.5 py-1.5 bg-surface focus:outline-none focus:ring-1 focus:ring-brand-400 pr-7 transition-colors placeholder:text-ink-3',
            open ? 'border-brand-300' : 'border-stroke text-ink',
            (disabled || saving || creating) && 'opacity-60 cursor-not-allowed',
          )}
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-ink-3">
          {saving || creating ? (
            <SpinnerIcon size={11} />
          ) : (
            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      </div>

      {/* ── Dropdown ── */}
      {open && (
        <div
          ref={listRef}
          className="absolute top-full mt-1 left-0 right-0 z-20 bg-surface border border-stroke rounded-lg shadow-card-lg overflow-hidden max-h-56 overflow-y-auto"
        >
          {/* Suggested section — pinned at top when not searching */}
          {!query && suggestions.length > 0 && (
            <>
              <div className="px-3 pt-2 pb-0.5 flex items-center gap-1.5">
                <svg width="8" height="8" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" className="text-brand-500">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
                <span className="font-mono text-[9px] font-bold text-brand-600 uppercase tracking-label">Suggested</span>
              </div>
              {suggestions.map(({ folder: f }) => (
                <button
                  key={f.id}
                  type="button"
                  tabIndex={0}
                  onMouseDown={(e) => { e.preventDefault(); void select(f.id); }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors',
                    f.id === currentFolderId
                      ? 'bg-brand-50 text-brand-700 font-semibold'
                      : 'text-brand-800 hover:bg-brand-50',
                  )}
                >
                  <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" className="flex-shrink-0 text-brand-400">
                    <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
                  </svg>
                  <span className="flex-1 truncate">{f.name}</span>
                  {f.id === currentFolderId && (
                    <svg width="10" height="10" fill="currentColor" viewBox="0 0 20 20" className="flex-shrink-0 text-brand-600">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
              <div className="border-t border-stroke-soft mx-0 my-0.5" />
            </>
          )}

          {/* No folder option */}
          <button
            type="button"
            tabIndex={0}
            onMouseDown={(e) => { e.preventDefault(); void select(null); }}
            className={cn(
              'w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-surface-high transition-colors',
              currentFolderId === null ? 'font-semibold text-brand-700 bg-brand-50' : 'text-ink-3',
            )}
          >
            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="flex-shrink-0 opacity-50">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            No folder
          </button>

          {dropdownFolders.length > 0 && <div className="border-t border-stroke-soft" />}

          {/* Remaining / search-filtered folders */}
          {dropdownFolders.map(({ folder: f, aiScore }) => (
            <button
              key={f.id}
              type="button"
              tabIndex={0}
              onMouseDown={(e) => { e.preventDefault(); void select(f.id); }}
              className={cn(
                'w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-surface-high transition-colors',
                f.id === currentFolderId ? 'font-semibold text-brand-700 bg-brand-50' : 'text-ink',
              )}
            >
              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" className="flex-shrink-0 text-ink-3">
                <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
              </svg>
              <span className="flex-1 truncate">{f.name}</span>
              {aiScore >= 55 && (
                <span className="flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-brand-100 text-brand-700">AI</span>
              )}
              {f.id === currentFolderId && (
                <svg width="10" height="10" fill="currentColor" viewBox="0 0 20 20" className="flex-shrink-0 text-brand-600">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}

          {dropdownFolders.length === 0 && !showCreate && !query && folders.length === 0 && (
            <p className="px-3 py-2 text-xs text-ink-3 italic">No folders in this workspace</p>
          )}
          {dropdownFolders.length === 0 && !showCreate && query && (
            <p className="px-3 py-2 text-xs text-ink-3 italic">No matching folders</p>
          )}

          {showCreate && (
            <>
              {dropdownFolders.length > 0 && <div className="border-t border-stroke-soft" />}
              <button
                type="button"
                tabIndex={0}
                disabled={creating}
                onMouseDown={(e) => { e.preventDefault(); void handleCreate(); }}
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 text-brand-700 hover:bg-brand-50 transition-colors font-medium disabled:opacity-50"
              >
                <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" className="flex-shrink-0">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                {creating ? 'Creating…' : `Create "${query.trim()}"`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AiExtractionSection({
  documentId,
  extraction,
  extracting,
  applying,
  workspaceId,
  currentFolderId,
  onExtract,
  onApply,
  onMoveToFolder,
}: {
  documentId: string;
  extraction: AiExtractionResult | null;
  extracting: boolean;
  applying: boolean;
  workspaceId: string;
  currentFolderId: string | null;
  onExtract: () => void;
  onApply: (fields: string[]) => void;
  onMoveToFolder: (folderId: string | null) => Promise<void>;
}) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [confirmApplyAll, setConfirmApplyAll] = useState(false);
  const [folders, setFolders] = useState<FolderListItem[]>([]);

  // Fetch workspace folders once on mount
  useEffect(() => {
    fetchFolders(workspaceId)
      .then(setFolders)
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const status = extraction?.status ?? 'none';

  // Determine applied state: userApplied = manually confirmed (locked), applied = AI auto-applied
  const applied = extraction?.appliedFields ?? [];
  const userApplied = extraction?.userAppliedFields ?? [];
  const isAppliedByAnyone = (field: string) => applied.includes(field) || userApplied.includes(field);
  const unappliedDates = (['expiryDate', 'renewalDueDate'] as const).filter(
    (f) => extraction?.[f] != null && !isAppliedByAnyone(f),
  );
  // Folder is now handled via the interactive dropdown — exclude from "Apply All"
  const allUnapplied = [...unappliedDates];

  function ExtractButton({ label = 'Extract with AI' }: { label?: string }) {
    return (
      <button
        type="button"
        onClick={onExtract}
        disabled={extracting}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-brand-400 dark:text-slate-900 dark:hover:bg-brand-300 text-xs font-semibold active:scale-[0.97] transition-all duration-150 disabled:opacity-50"
      >
        {extracting ? <><SpinnerIcon size={12} /> Extracting…</> : label}
      </button>
    );
  }

  return (
    <Section title="AI Analysis">
      {/* ── status: none ──────────────────────────────────────────── */}
      {status === 'none' && (
        <div className="space-y-3">
          <p className="text-xs text-ink-3 leading-relaxed">
            Scan with AI to automatically identify expiry dates, key parties, contract numbers, and more — no manual entry needed.
          </p>
          <div className="flex items-center gap-2">
            <ExtractButton />
            <span className="text-[10px] text-ink-3">Takes 5–15 seconds</span>
          </div>
        </div>
      )}

      {/* ── status: running ───────────────────────────────────────── */}
      {status === 'running' && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-brand-50 border border-brand-100">
          <span className="text-brand-500 flex-shrink-0 mt-0.5"><SpinnerIcon size={14} /></span>
          <div>
            <p className="text-xs font-medium text-brand-700">Analyzing document…</p>
            <p className="text-[10px] text-brand-500 mt-0.5">Reading content and extracting key fields. This takes about 5–15 seconds.</p>
          </div>
        </div>
      )}

      {/* ── status: disabled ──────────────────────────────────────── */}
      {status === 'disabled' && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-surface-high border border-stroke">
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="text-ink-3 flex-shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
          </svg>
          <div>
            <p className="text-xs font-medium text-ink-2">AI analysis not available</p>
            <p className="text-[10px] text-ink-3 mt-0.5">Contact your workspace admin to enable AI features.</p>
          </div>
        </div>
      )}

      {/* ── status: failed ────────────────────────────────────────── */}
      {status === 'failed' && (
        <div className="space-y-2.5">
          <p className="text-xs text-red-600">
            {extraction?.error ?? 'Analysis failed — the document may be corrupted or in an unsupported format.'}
          </p>
          <ExtractButton label="Try again" />
        </div>
      )}

      {/* ── status: done ──────────────────────────────────────────── */}
      {status === 'done' && extraction && (
        <div className="space-y-3">

          {/* ① Header: doc type + confidence + re-extract */}
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {extraction.documentType && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-600 text-white tracking-widest uppercase">
                  {extraction.documentType}
                </span>
              )}
              <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold border', confidenceClass(extraction.overallConfidence))}>
                {confidenceLabel(extraction.overallConfidence)} ({Math.round(extraction.overallConfidence * 100)}%)
              </span>
              <button
                type="button"
                onClick={onExtract}
                disabled={extracting}
                className="ml-auto text-[10px] text-ink-3 hover:text-brand-600 hover:underline disabled:opacity-50 flex items-center gap-1 transition-colors"
              >
                {extracting ? <><SpinnerIcon size={9} /> Re-extracting…</> : 'Re-extract'}
              </button>
            </div>
            {(extraction.ocrProvider || extraction.extractedAt) && (
              <p className="mt-0.5 text-[10px] text-ink-3">
                {extraction.ocrProvider && (
                  <span>
                    {extraction.ocrProvider
                      .replace('azure-document-intelligence', 'Azure DI')
                      .replace('mistral-ocr', 'Mistral')
                      .replace('claude-native', 'Claude')
                      .replace('search-content-fallback', 'text')}
                  </span>
                )}
                {extraction.ocrProvider && extraction.extractedAt && ' · '}
                {extraction.extractedAt && <span>{formatDateTime(extraction.extractedAt)}</span>}
              </p>
            )}
          </div>

          {/* ② Critical dates — HIGHEST PRIORITY (moved to top) */}
          {(extraction.expiryDate || extraction.renewalDueDate) && (
            <div className="rounded-lg border-2 border-brand-200 bg-brand-50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="text-brand-600 flex-shrink-0">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" strokeLinecap="round" />
                    <line x1="8" y1="2" x2="8" y2="6" strokeLinecap="round" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span className="font-mono text-[10px] font-bold text-brand-700 uppercase tracking-label">Key Dates</span>
                  <span className={cn('px-1 py-0.5 rounded text-[10px] font-medium border', confidenceClass(extraction.dateConfidence))}>
                    {confidenceLabel(extraction.dateConfidence)} ({Math.round(extraction.dateConfidence * 100)}%)
                  </span>
                </div>
                {allUnapplied.filter(f => f === 'expiryDate' || f === 'renewalDueDate').length > 0 && (
                  <button
                    type="button"
                    onClick={() => onApply(allUnapplied.filter(f => f === 'expiryDate' || f === 'renewalDueDate'))}
                    disabled={applying}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-brand-200 text-[10px] font-semibold text-brand-600 bg-surface hover:bg-brand-50 hover:border-brand-300 transition-colors disabled:opacity-50"
                  >
                    {applying ? <SpinnerIcon size={9} /> : 'Apply all dates'}
                  </button>
                )}
              </div>
              {(
                [
                  { key: 'expiryDate', label: 'Expiry', fieldKey: 'expiryDate' as keyof ConfidenceByField },
                  { key: 'renewalDueDate', label: 'Renewal', fieldKey: 'renewalDueDate' as keyof ConfidenceByField },
                ] as const
              ).map(({ key, label, fieldKey }) => {
                const iso = extraction[key];
                if (!iso) return null;
                const days = daysUntil(iso);
                const isAutoApplied = applied.includes(key);
                const isUserApplied = userApplied.includes(key);
                const fieldConf = (extraction.confidenceByField ?? {})[fieldKey] ?? 0;
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-12 flex-shrink-0 font-mono text-[10px] font-semibold text-brand-600 uppercase tracking-label">
                      {label}
                    </span>
                    <span className="flex-1 text-xs font-medium text-ink">{formatDate(iso)}</span>
                    <ConfidenceBadge confidence={fieldConf} />
                    <span className={cn('text-[10px] font-semibold tabular-nums min-w-[36px] text-right', urgencyClass(days))}>
                      {days < 0 ? `${Math.abs(days)}d over` : days === 0 ? 'today' : `${days}d`}
                    </span>
                    {isUserApplied || isAutoApplied ? (
                      <span className={cn('text-[10px] font-bold w-4 text-center', isUserApplied ? 'text-blue-600' : 'text-green-600')}>✓</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onApply([key])}
                        disabled={applying}
                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-900 text-white hover:bg-slate-800 active:scale-95 active:bg-slate-800 dark:bg-brand-400 dark:text-slate-900 dark:hover:bg-brand-300 disabled:opacity-50 transition-all duration-150 w-12 text-center flex-shrink-0"
                      >
                        {applying ? <SpinnerIcon size={9} /> : 'Apply'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ③ Key fields — identifiers, parties, reference numbers */}
          {(() => {
            const cbf = extraction.confidenceByField ?? {};
            const fields: { label: string; value: string; fieldKey: keyof ConfidenceByField }[] = [];
            if (extraction.issuer) fields.push({ label: 'Issuer', value: extraction.issuer, fieldKey: 'issuer' });
            if (extraction.counterparty) fields.push({ label: 'Counterparty', value: extraction.counterparty, fieldKey: 'counterparty' });
            if (extraction.contractNumber) fields.push({ label: 'Contract No.', value: extraction.contractNumber, fieldKey: 'contractNumber' });
            if (extraction.policyNumber) fields.push({ label: 'Policy No.', value: extraction.policyNumber, fieldKey: 'policyNumber' });
            if (extraction.certificateNumber) fields.push({ label: 'Certificate No.', value: extraction.certificateNumber, fieldKey: 'certificateNumber' });
            if (extraction.referenceNumber) fields.push({ label: 'Reference No.', value: extraction.referenceNumber, fieldKey: 'referenceNumber' });
            if (extraction.issueDate) fields.push({ label: 'Issue Date', value: formatDate(extraction.issueDate), fieldKey: 'issueDate' });
            if (extraction.effectiveDate) fields.push({ label: 'Effective Date', value: formatDate(extraction.effectiveDate), fieldKey: 'effectiveDate' });
            if (fields.length === 0) return null;
            return (
              <div className="divide-y divide-stroke-soft">
                {fields.map(({ label, value, fieldKey }) => (
                  <div key={label} className="flex items-center gap-2 py-1.5">
                    <span className="w-24 flex-shrink-0 font-mono text-[10px] uppercase tracking-label text-ink-3">{label}</span>
                    <span className="flex-1 text-xs text-ink truncate">{value}</span>
                    <ConfidenceBadge confidence={cbf[fieldKey] ?? 0} />
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ④ Folder assignment — smart combobox (always visible when extraction is done) */}
          <div className="rounded-lg border border-stroke bg-surface-high p-2.5 space-y-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-ink-3 flex-shrink-0">
                <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
              </svg>
              <span className="font-mono text-[10px] uppercase tracking-label text-ink-3">Folder</span>
              {extraction.suggestedFolder && (
                <>
                  <ConfidenceBadge confidence={(extraction.confidenceByField ?? {}).suggestedFolder ?? 0} />
                  <span className="text-[10px] text-ink-3 truncate ml-auto">
                    AI suggests &ldquo;{extraction.suggestedFolder}&rdquo;
                  </span>
                </>
              )}
              {!extraction.suggestedFolder && !isAppliedByAnyone('suggestedFolder') && (
                <span className="text-[10px] text-ink-3 ml-auto italic">AI suggests best match</span>
              )}
              {isAppliedByAnyone('suggestedFolder') && (
                <span className={cn('ml-auto text-[10px] font-semibold', userApplied.includes('suggestedFolder') ? 'text-blue-600' : 'text-green-600')}>
                  ✓ applied
                </span>
              )}
            </div>
            <FolderCombobox
              folders={folders}
              currentFolderId={currentFolderId}
              aiSuggestion={extraction.suggestedFolder}
              workspaceId={workspaceId}
              onMove={onMoveToFolder}
              onFolderCreated={(f) => setFolders((prev) => [...prev, f])}
            />
          </div>

          {/* ⑤ Risk flags */}
          {extraction.riskFlags.length > 0 && (
            <div>
              <p className="font-mono text-[10px] font-semibold text-orange-600 uppercase tracking-label mb-1.5 flex items-center gap-1">
                <svg width="9" height="9" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Risk Flags
              </p>
              <div className="flex flex-wrap gap-1.5">
                {extraction.riskFlags.map((flag, i) => (
                  <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-orange-700 border border-orange-200">
                    {flag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ⑥ Summary & key points (collapsible — lowest priority) */}
          {(extraction.summary || extraction.keyPoints.length > 0) && (
            <div className="border border-stroke rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setSummaryOpen((o) => !o)}
                className="w-full flex items-center justify-between px-3 py-2 font-mono text-[10px] uppercase tracking-label text-ink-3 bg-surface-high hover:bg-stroke transition-colors"
              >
                <span>Summary &amp; Key Points</span>
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                  className={cn('transition-transform text-ink-3', summaryOpen && 'rotate-180')}>
                  <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {summaryOpen && (
                <div className="px-3 py-2.5 space-y-2">
                  {extraction.summary && (
                    <p className="text-xs text-ink-2 leading-relaxed">{extraction.summary}</p>
                  )}
                  {extraction.keyPoints.length > 0 && (
                    <ul className="space-y-1">
                      {extraction.keyPoints.map((pt, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-ink-2">
                          <span className="text-brand-400 mt-0.5 flex-shrink-0">·</span>
                          {pt}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Apply all button — two-step confirm */}
          {allUnapplied.length > 0 && (
            <div className="pt-1 border-t border-stroke-soft">
              {confirmApplyAll ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-ink-3">
                    Apply {allUnapplied.length} field{allUnapplied.length > 1 ? 's' : ''}?
                  </span>
                  <button
                    type="button"
                    onClick={() => { setConfirmApplyAll(false); onApply(allUnapplied); }}
                    disabled={applying}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-800 dark:bg-brand-400 dark:text-slate-900 dark:hover:bg-brand-300 transition-colors disabled:opacity-50"
                  >
                    {applying ? <SpinnerIcon size={8} /> : 'Yes, apply'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmApplyAll(false)}
                    className="text-[10px] text-ink-3 hover:text-ink-2 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmApplyAll(true)}
                  disabled={applying}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-200 text-brand-600 bg-brand-50 text-xs font-medium hover:bg-brand-100 hover:border-brand-300 active:bg-brand-200 transition-colors disabled:opacity-50"
                >
                  {applying ? <><SpinnerIcon size={12} /> Applying…</> : `Apply All (${allUnapplied.length})`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ //
// Reusable sub-components
// ------------------------------------------------------------------ //

function Section({
  title,
  action,
  children,
  collapsible = false,
  defaultCollapsed = false,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}) {
  const [open, setOpen] = useState(!defaultCollapsed);
  return (
    <div className="bg-surface rounded-xl border border-stroke p-5">
      <div className={cn('flex items-center justify-between', open ? 'mb-4' : '')}>
        <div
          className={cn(
            'flex items-center gap-1.5',
            collapsible && 'cursor-pointer select-none',
          )}
          onClick={collapsible ? () => setOpen((o) => !o) : undefined}
        >
          {collapsible && (
            <svg
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              viewBox="0 0 24 24"
              className={cn(
                'text-ink-3 transition-transform duration-200 flex-shrink-0',
                open ? '' : '-rotate-90',
              )}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
        </div>
        {action && <div>{action}</div>}
      </div>
      {open && children}
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 py-1 border-b border-stroke-soft last:border-0">
      <span className="w-24 flex-shrink-0 font-mono text-[10px] uppercase tracking-label text-ink-3 pt-0.5">
        {label}
      </span>
      <span className="flex-1 text-xs text-ink-2">{value}</span>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Loading skeleton
// ------------------------------------------------------------------ //

function DetailSkeleton() {
  return (
    <div className="max-w-7xl animate-pulse">
      <div className="h-4 w-28 bg-surface-high rounded mb-5" />
      <div className="h-7 w-64 bg-surface-high rounded mb-2" />
      <div className="h-4 w-40 bg-surface-high rounded mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-5">
        <div className="lg:col-span-3 bg-surface-high rounded-xl h-72" />
        <div className="lg:col-span-2 bg-surface-high rounded-xl h-72" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-surface-high rounded-xl h-40" />
        ))}
      </div>
    </div>
  );
}
