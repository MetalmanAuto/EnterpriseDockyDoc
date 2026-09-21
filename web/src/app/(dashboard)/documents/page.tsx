'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { fetchFolders, fetchDocuments, fetchDeletedFolders, restoreFolder, uploadDocument, searchDocuments, createFolder, updateFolder, moveFolder, deleteFolder, deleteDocument, updateDocument, fetchTags, createTag, fetchWorkspaceSummary, bulkMoveDocuments, bulkTagDocuments, bulkDeleteDocuments } from '@/lib/documents';
import { cn, initialsOf } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import ConfirmModal from '@/components/ui/ConfirmModal';
import BulkUploadModal, { collectDroppedFiles } from '@/components/documents/BulkUploadModal';
import type { AiDocumentStatus, DocumentListItem, DocumentStatus, FolderListItem, SearchResult, Tag } from '@/types';

interface PendingConfirm {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
}

// ------------------------------------------------------------------ //
// Status helpers
// ------------------------------------------------------------------ //

/** How many labels the filter bar shows before hiding the rest behind "+N more". */
const TAG_FILTER_VISIBLE = 8;

/** Shared empty set so the folder tree does not re-render on every pass. */
const EMPTY_ID_SET: Set<string> = new Set();

const STATUS_BADGE: Record<DocumentStatus, { label: string; class: string }> = {
  ACTIVE: { label: 'Active', class: 'bg-green-100 text-green-700' },
  ARCHIVED: { label: 'Archived', class: 'bg-yellow-100 text-yellow-700' },
  DELETED: { label: 'Deleted', class: 'bg-red-100 text-red-700' },
};

/** Colored SVG document icon — file type indicated by stroke/fill color. */
function FileTypeIcon({ fileType, size = 18 }: { fileType: string; size?: number }) {
  const ext = fileType.toLowerCase();
  const color =
    ext === 'pdf'                          ? '#ef4444' :
    ext === 'docx' || ext === 'doc'        ? '#3b82f6' :
    ext === 'xlsx' || ext === 'xls'        ? '#22c55e' :
    ext === 'pptx' || ext === 'ppt'        ? '#f97316' :
    ['png','jpg','jpeg','webp','gif'].includes(ext) ? '#a855f7' :
    '#94a3b8';

  const w = size;
  const h = Math.round(size * 1.2);
  return (
    <svg width={w} height={h} fill="none" viewBox="0 0 18 22" className="flex-shrink-0">
      <path
        d="M11 1H3C1.9 1 1 1.9 1 3v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V7l-6-6z"
        stroke={color} strokeWidth={1.4} fill={color} fillOpacity={0.1}
      />
      <path d="M11 1v6h6" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}

function initials(firstName: string, lastName: string) {
  return initialsOf({ firstName, lastName });
}

// ------------------------------------------------------------------ //
// Folder sidebar helpers
// ------------------------------------------------------------------ //

function buildTree(folders: FolderListItem[]) {
  const roots = folders.filter((f) => !f.parentFolderId);
  const childMap = new Map<string, FolderListItem[]>();
  for (const f of folders) {
    if (f.parentFolderId) {
      if (!childMap.has(f.parentFolderId)) childMap.set(f.parentFolderId, []);
      childMap.get(f.parentFolderId)!.push(f);
    }
  }
  return { roots, childMap };
}

/** "Compliance / Insurance / Policies" — so a picker shows where a folder sits. */
function folderPath(folders: FolderListItem[], id: string): string {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const parts: string[] = [];
  let current = byId.get(id);
  // The depth cap stops a malformed cycle from hanging the render
  for (let i = 0; current && i < 10; i++) {
    parts.unshift(current.name);
    current = current.parentFolderId ? byId.get(current.parentFolderId) : undefined;
  }
  return parts.join(' / ');
}

/** Folders ordered so each one reads under its parent, with its full path. */
function folderOptions(folders: FolderListItem[]): { id: string; path: string }[] {
  return folders
    .map((f) => ({ id: f.id, path: folderPath(folders, f.id) }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** A folder plus everything nested underneath it. */
function descendantIds(folders: FolderListItem[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (!ids.has(f.id) && f.parentFolderId && ids.has(f.parentFolderId)) {
        ids.add(f.id);
        grew = true;
      }
    }
  }
  return ids;
}

function buildBreadcrumb(folderId: string | null, folders: FolderListItem[]): FolderListItem[] {
  if (!folderId) return [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  const crumbs: FolderListItem[] = [];
  let current = byId.get(folderId);
  while (current) {
    crumbs.unshift(current);
    current = current.parentFolderId ? byId.get(current.parentFolderId) : undefined;
  }
  return crumbs;
}

function Breadcrumb({
  crumbs,
  onNavigate,
}: {
  crumbs: FolderListItem[];
  onNavigate: (id: string | null) => void;
}) {
  return (
    <nav className="flex items-center gap-1 text-xs text-ink-3 mb-3 flex-wrap">
      <button
        type="button"
        onClick={() => onNavigate(null)}
        className="hover:text-brand-600 transition-colors"
      >
        All Documents
      </button>
      {crumbs.map((crumb) => (
        <span key={crumb.id} className="flex items-center gap-1">
          <span className="text-gray-300">/</span>
          <button
            type="button"
            onClick={() => onNavigate(crumb.id)}
            className="hover:text-brand-600 transition-colors"
          >
            {crumb.name}
          </button>
        </span>
      ))}
    </nav>
  );
}

// ------------------------------------------------------------------ //
// Page
// ------------------------------------------------------------------ //

function DocumentsPageInner() {
  const { activeWorkspace, isLoading: userLoading } = useUser();
  const searchParams = useSearchParams();
  const toast = useToast();
  const role = activeWorkspace?.role ?? 'VIEWER';
  const canEdit = role !== 'VIEWER';

  const [folders, setFolders] = useState<FolderListItem[]>([]);
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [deletedFolders, setDeletedFolders] = useState<FolderListItem[]>([]);
  const [selectedDeletedFolderId, setSelectedDeletedFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [bulkFiles, setBulkFiles] = useState<{ file: File; relativeDir: string }[] | null>(null);
  const [dropFile, setDropFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderParentId, setNewFolderParentId] = useState<string | undefined>(undefined);
  const [renamingFolder, setRenamingFolder] = useState<FolderListItem | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Internal document-to-folder drag state
  const [dragDocId, setDragDocId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const dragLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Label filter + multi-select
  const [tags, setTags] = useState<Tag[]>([]);
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<'move' | 'label' | 'delete' | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Folder-to-folder drag state
  const [dragFolderId, setDragFolderId] = useState<string | null>(null);

  // Everything not in the trash, ignoring the folder and label filters. The
  // "All documents" row must keep showing the workspace total while a folder
  // is selected, not the count of what happens to be on screen.
  const [totalDocCount, setTotalDocCount] = useState<number | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch folders + documents whenever the active workspace changes
  useEffect(() => {
    if (!activeWorkspace || userLoading) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedFolderId(null);

    Promise.all([
      fetchFolders(activeWorkspace.workspaceId),
      fetchDocuments({ workspaceId: activeWorkspace.workspaceId, status: showTrash ? 'DELETED' : undefined }),
      fetchTags(activeWorkspace.workspaceId).catch(() => [] as Tag[]),
      fetchWorkspaceSummary(activeWorkspace.workspaceId).catch(() => null),
    ])
      .then(([f, d, t, summary]) => {
        if (cancelled) return;
        setFolders(f);
        setDocuments(d);
        setTags(t);
        setTotalDocCount(summary?.totalDocuments ?? d.length);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load documents. Is the API running?');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeWorkspace?.workspaceId, userLoading]);

  // Refetch documents when folder selection or trash view changes
  useEffect(() => {
    if (!activeWorkspace || loading) return;

    fetchDocuments({
      workspaceId: activeWorkspace.workspaceId,
      folderId: showTrash ? undefined : (selectedFolderId ?? undefined),
      status: showTrash ? 'DELETED' : undefined,
      tagIds: showTrash ? undefined : filterTagIds,
    })
      .then(setDocuments)
      .catch(() => {}); // silent on filter change errors
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolderId, showTrash, filterTagIds]);

  // A fresh ?q= from the header search (the page does not remount between them)
  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null) setSearchQuery(q);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Debounced search — fires 350 ms after the user stops typing
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!searchQuery.trim() || !activeWorkspace) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchTimerRef.current = setTimeout(() => {
      searchDocuments({
        workspaceId: activeWorkspace.workspaceId,
        q: searchQuery.trim(),
      })
        .then(setSearchResults)
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 350);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, activeWorkspace?.workspaceId]);

  // Open upload modal automatically when arriving via ?upload=1 (e.g. dashboard Quick Action)
  // Also restore trash/folder context when returning from document detail (?view=trash, ?folder=ID)
  useEffect(() => {
    if (loading) return;
    if (searchParams.get('upload') === '1' && canEdit) {
      setShowUpload(true);
    }
    const q = searchParams.get('q');
    if (q) setSearchQuery(q);
    if (searchParams.get('view') === 'trash') {
      setShowTrash(true);
      setSelectedFolderId(null);
    } else if (searchParams.get('folder')) {
      setShowTrash(false);
      setSelectedFolderId(searchParams.get('folder'));
    }
  // Only run once after initial load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Drag-and-drop handlers
  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    // Only show file-upload overlay for OS file drops, not internal document moves
    if (!e.dataTransfer.types.includes('Files')) return;
    if (!canEdit) return;
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    // Only clear when leaving the container entirely (not when moving between children)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (!canEdit) return;
    if (e.dataTransfer.types.includes('Files')) {
      // One file opens the single upload; more than one, or a folder, opens the bulk upload.
      void collectDroppedFiles(e.dataTransfer).then((list) => {
        if (list.length === 1 && !list[0].relativeDir) {
          setDropFile(list[0].file);
          setShowUpload(true);
        } else if (list.length > 0) {
          setBulkFiles(list);
        }
      });
    }
    // Clean up internal doc drag state if dropped on table area (not a folder)
    setDragDocId(null);
    setDragOverFolderId(null);
  }

  // Folder drag-enter/leave with debounce to prevent flash when moving between folder rows
  function handleFolderDragEnter(folderId: string) {
    if (dragLeaveTimer.current) clearTimeout(dragLeaveTimer.current);
    setDragOverFolderId(folderId);
  }

  function handleFolderDragLeave() {
    dragLeaveTimer.current = setTimeout(() => setDragOverFolderId(null), 60);
  }

  async function handleMoveDoc(docId: string, targetFolderId: string | null) {
    // Find current folder to avoid no-op moves
    const doc = documents.find((d) => d.id === docId);
    const currentFolderId = (doc as DocumentListItem | undefined)?.folder?.id ?? null;
    if (currentFolderId === targetFolderId) {
      setDragDocId(null);
      setDragOverFolderId(null);
      return;
    }
    try {
      await updateDocument(docId, { folderId: targetFolderId });
      setDragDocId(null);
      setDragOverFolderId(null);
      refreshDocuments();
      refreshFolders();
      const folder = folders.find((f) => f.id === targetFolderId);
      toast.success(folder ? `Moved to "${folder.name}".` : 'Removed from folder.');
    } catch (err) {
      setDragDocId(null);
      setDragOverFolderId(null);
      toast.error(err instanceof Error ? err.message : 'Move failed.');
    }
  }

  function refreshDocuments() {
    if (!activeWorkspace) return;
    fetchDocuments({
      workspaceId: activeWorkspace.workspaceId,
      folderId: showTrash
        ? (selectedDeletedFolderId ?? undefined)
        : (selectedFolderId ?? undefined),
      status: showTrash ? 'DELETED' : undefined,
      tagIds: showTrash ? undefined : filterTagIds,
    })
      .then(setDocuments)
      .catch(() => {});
    // The "All documents" total is a separate count, so it stays right while
    // a folder or label filter is narrowing the list below it.
    refreshTotalCount();
  }

  function refreshTags() {
    if (!activeWorkspace) return;
    fetchTags(activeWorkspace.workspaceId).then(setTags).catch(() => {});
  }

  function refreshTotalCount() {
    if (!activeWorkspace) return;
    fetchWorkspaceSummary(activeWorkspace.workspaceId)
      .then((s) => setTotalDocCount(s.totalDocuments))
      .catch(() => {});
  }

  function toggleFilterTag(tagId: string) {
    setSelectedDocIds([]);
    setFilterTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId],
    );
  }

  function refreshFolders() {
    if (!activeWorkspace) return;
    fetchFolders(activeWorkspace.workspaceId).then(setFolders).catch(() => {});
    if (showTrash) {
      fetchDeletedFolders(activeWorkspace.workspaceId).then(setDeletedFolders).catch(() => {});
    }
  }

  // ---------------------------------------------------------------- //
  // Multi-select
  // ---------------------------------------------------------------- //

  function toggleDocSelected(id: string) {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    );
  }

  function toggleSelectAll(ids: string[]) {
    setSelectedDocIds((prev) => (prev.length === ids.length ? [] : ids));
  }

  async function handleBulkMove(folderId: string | null) {
    if (selectedDocIds.length === 0) return;
    setBulkBusy(true);
    try {
      const result = await bulkMoveDocuments(selectedDocIds, folderId);
      const folder = folders.find((f) => f.id === folderId);
      toast.success(
        folder
          ? `Moved ${result.updated} document${result.updated === 1 ? '' : 's'} to "${folder.name}".`
          : `Took ${result.updated} document${result.updated === 1 ? '' : 's'} out of their folder.`,
      );
      setSelectedDocIds([]);
      setBulkAction(null);
      refreshDocuments();
      refreshFolders();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not move those documents.');
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkLabel(tagIds: string[], action: 'add' | 'remove') {
    if (selectedDocIds.length === 0 || tagIds.length === 0) return;
    setBulkBusy(true);
    try {
      const result = await bulkTagDocuments(selectedDocIds, tagIds, action);
      const label = tagIds.length === 1
        ? `"${tags.find((t) => t.id === tagIds[0])?.name ?? 'Label'}"`
        : `${tagIds.length} labels`;
      toast.success(
        action === 'add'
          ? `Added ${label} to ${result.updated} document${result.updated === 1 ? '' : 's'}.`
          : `Removed ${label} from ${result.updated} document${result.updated === 1 ? '' : 's'}.`,
      );
      setSelectedDocIds([]);
      setBulkAction(null);
      refreshDocuments();
      refreshTags();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update those labels.');
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedDocIds.length === 0) return;
    setBulkBusy(true);
    try {
      const result = await bulkDeleteDocuments(selectedDocIds);
      toast.success(
        `${result.updated} document${result.updated === 1 ? '' : 's'} moved to Trash. Restore from there if that was a mistake.`,
      );
      setSelectedDocIds([]);
      setBulkAction(null);
      refreshDocuments();
      refreshFolders();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete those documents.');
    } finally {
      setBulkBusy(false);
    }
  }

  /** Move a folder under another folder, or to the top level with null. */
  async function handleMoveFolder(folderId: string, targetParentId: string | null) {
    const folder = folders.find((f) => f.id === folderId);
    if (!folder || folder.parentFolderId === targetParentId) {
      setDragFolderId(null);
      setDragOverFolderId(null);
      return;
    }
    try {
      await moveFolder(folderId, targetParentId);
      const target = folders.find((f) => f.id === targetParentId);
      toast.success(
        target ? `"${folder.name}" moved into "${target.name}".` : `"${folder.name}" moved to the top level.`,
      );
      refreshFolders();
      refreshDocuments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not move that folder.');
    } finally {
      setDragFolderId(null);
      setDragOverFolderId(null);
    }
  }

  function handleSelectFolder(id: string | null) {
    setShowTrash(false);
    setSelectedFolderId(id);
    setSelectedDocIds([]);
  }

  function handleSelectTrash() {
    setShowTrash(true);
    setSelectedFolderId(null);
    setSelectedDeletedFolderId(null);
    if (activeWorkspace) {
      fetchDeletedFolders(activeWorkspace.workspaceId).then(setDeletedFolders).catch(() => {});
    }
  }

  async function handleRestoreDoc(doc: DocumentListItem) {
    try {
      await updateDocument(doc.id, { status: 'ACTIVE' });
      refreshDocuments();
      toast.success(`"${doc.name}" restored.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restore failed.');
    }
  }

  function handleDeleteFolder(folder: FolderListItem) {
    const docCount = folder.documentCount;
    const childCount = folder.childCount;

    let contentWarning: string;
    if (childCount > 0 && docCount > 0) {
      contentWarning = `It contains ${docCount} document${docCount !== 1 ? 's' : ''} and ${childCount} sub-folder${childCount !== 1 ? 's' : ''} — all nested contents will be moved to trash too.`;
    } else if (childCount > 0) {
      contentWarning = `It contains ${childCount} sub-folder${childCount !== 1 ? 's' : ''} and all their nested files — everything inside will be moved to trash.`;
    } else if (docCount > 0) {
      contentWarning = `It contains ${docCount} document${docCount !== 1 ? 's' : ''} which will also be moved to trash.`;
    } else {
      contentWarning = 'This folder appears to be empty.';
    }

    setPendingConfirm({
      title: 'Move folder to trash',
      body: `"${folder.name}" will be moved to trash. ${contentWarning} Everything can be fully restored.`,
      confirmLabel: 'Move to Trash',
      danger: true,
      onConfirm: async () => {
        await deleteFolder(folder.id);
        if (selectedFolderId === folder.id) setSelectedFolderId(null);
        refreshFolders();
        refreshDocuments();
        toast.success(`"${folder.name}" moved to trash.`);
      },
    });
  }

  async function handleRestoreFolder(folder: FolderListItem) {
    try {
      await restoreFolder(folder.id);
      setDeletedFolders((prev) => prev.filter((f) => f.id !== folder.id));
      if (selectedDeletedFolderId === folder.id) setSelectedDeletedFolderId(null);
      refreshFolders();
      refreshDocuments();
      toast.success(`"${folder.name}" and its contents restored.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restore failed.');
    }
  }

  function handleDeleteDoc(doc: DocumentListItem) {
    setPendingConfirm({
      title: 'Delete document',
      body: `"${doc.name}" will be soft-deleted. You can restore it from the document detail page.`,
      confirmLabel: 'Delete Document',
      danger: true,
      onConfirm: async () => {
        setDeletingDocId(doc.id);
        try {
          await deleteDocument(doc.id);
          refreshDocuments();
          toast.success(`"${doc.name}" deleted.`);
        } finally {
          setDeletingDocId(null);
        }
      },
    });
  }

  async function executeConfirm() {
    if (!pendingConfirm) return;
    setConfirmLoading(true);
    try {
      await pendingConfirm.onConfirm();
      setPendingConfirm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Operation failed.');
    } finally {
      setConfirmLoading(false);
    }
  }

  if (userLoading || (!activeWorkspace && !error)) {
    return <PageSkeleton />;
  }

  if (!activeWorkspace) {
    return (
      <div className="text-sm text-ink-3 p-4">
        No active workspace selected.
      </div>
    );
  }

  const { roots, childMap } = buildTree(folders);
  const isSearching = searchQuery.trim().length > 0;
  const displayDocs = isSearching ? searchResults : documents;

  // While dragging a folder, it and its own contents cannot accept the drop
  const blockedFolderDropIds = dragFolderId
    ? descendantIds(folders, dragFolderId)
    : EMPTY_ID_SET;

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">
            {showTrash ? 'Trash' : 'Documents'}
          </h1>
          <p className="page-subtitle">
            {activeWorkspace.workspaceName} &middot;{' '}
            {isSearching
              ? `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for "${searchQuery}"`
              : `${documents.length} document${documents.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        {!showTrash && canEdit && (
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-brand-400 dark:text-slate-900 dark:hover:bg-brand-300 text-sm font-semibold active:scale-[0.97] transition-all duration-150"
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Upload Document
          </button>
        )}
        {!showTrash && canEdit && (
          <button
            type="button"
            onClick={() => setBulkFiles([])}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-stroke text-sm font-semibold text-ink-2 hover:bg-surface-high active:scale-[0.97] transition-all duration-150"
            title="Upload many files or a whole folder at once"
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
              <path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1M16 8l-4-4-4 4M12 4v12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Upload many
          </button>
        )}
      </div>

      {/* Search bar */}
      <div className="relative mb-7">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none"
          width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, tags, content…"
          className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-stroke text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-surface"
        />
        {searching && (
          <svg className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-ink-3" width="14" height="14" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {!searching && searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink-2"
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-6">
        {/* --------------------------------------------------------- */}
        {/* Folder sidebar                                             */}
        {/* --------------------------------------------------------- */}
        <aside className="w-56 flex-shrink-0">
          <div className="bg-surface rounded-xl border border-stroke overflow-hidden">
            <div className="px-3.5 py-3 border-b border-stroke-soft flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-label text-ink-3">
                Folders
              </p>
              {canEdit && (
                <button
                  onClick={() => { setNewFolderParentId(undefined); setShowNewFolder(true); }}
                  title="New folder"
                  className="text-ink-3 hover:text-brand-600 transition-colors"
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
            <nav className="p-1.5 space-y-0.5">
              {/* All documents — also accepts doc drops to remove from folder */}
              <FolderRow
                label="All documents"
                count={!showTrash ? (totalDocCount ?? undefined) : undefined}
                active={selectedFolderId === null && !showTrash}
                onClick={() => handleSelectFolder(null)}
                iconEl={<AllDocsSvgIcon />}
                dragHighlight={dragOverFolderId === '__root__' && (dragDocId !== null || dragFolderId !== null)}
                onDragOver={(e) => {
                  const types = e.dataTransfer.types;
                  if (!types.includes('application/dockydoc-docid') &&
                      !types.includes('application/dockydoc-folderid')) return;
                  e.preventDefault();
                  handleFolderDragEnter('__root__');
                }}
                onDragLeave={handleFolderDragLeave}
                onDrop={(e) => {
                  e.preventDefault();
                  const docId = e.dataTransfer.getData('application/dockydoc-docid');
                  const folderId = e.dataTransfer.getData('application/dockydoc-folderid');
                  if (docId) void handleMoveDoc(docId, null);
                  else if (folderId) void handleMoveFolder(folderId, null);
                  else { setDragDocId(null); setDragOverFolderId(null); }
                }}
              />
              {/* Folder tree */}
              {loading ? (
                <div className="px-3 py-2 text-xs text-ink-3">Loading…</div>
              ) : roots.length === 0 ? null : (
                roots.map((folder) => (
                  <FolderTreeNode
                    key={folder.id}
                    folder={folder}
                    childMap={childMap}
                    selectedId={showTrash ? null : selectedFolderId}
                    onSelect={handleSelectFolder}
                    onRename={setRenamingFolder}
                    onDelete={handleDeleteFolder}
                    onCreateSubfolder={(parentId) => { setNewFolderParentId(parentId); setShowNewFolder(true); }}
                    depth={0}
                    dragOverFolderId={dragOverFolderId}
                    onDropDoc={handleMoveDoc}
                    onDragFolderEnter={handleFolderDragEnter}
                    onDragFolderLeave={handleFolderDragLeave}
                    canEdit={canEdit && !showTrash}
                    dragFolderId={dragFolderId}
                    onFolderDragStart={setDragFolderId}
                    onFolderDragEnd={() => { setDragFolderId(null); setDragOverFolderId(null); }}
                    onDropFolder={(id, parentId) => void handleMoveFolder(id, parentId)}
                    blockedDropIds={blockedFolderDropIds}
                  />
                ))
              )}
              {/* Divider + Trash */}
              <div className="border-t border-stroke-soft mt-1 pt-1">
                <FolderRow
                  label="Trash"
                  count={showTrash && selectedDeletedFolderId === null ? documents.length : undefined}
                  active={showTrash && selectedDeletedFolderId === null}
                  onClick={() => { handleSelectTrash(); setSelectedDeletedFolderId(null); }}
                  iconEl={<TrashSvgIcon />}
                  onDragOver={undefined}
                  onDragLeave={undefined}
                  onDrop={undefined}
                />
                {/* Deleted folders listed under trash */}
                {showTrash && deletedFolders.length > 0 && (
                  <div className="mt-0.5 space-y-0.5">
                    {deletedFolders.map((df) => (
                      <div key={df.id} className="relative group/df">
                        <FolderRow
                          label={df.name}
                          count={selectedDeletedFolderId === df.id ? documents.length : df.documentCount || undefined}
                          active={selectedDeletedFolderId === df.id}
                          onClick={() => {
                            setSelectedDeletedFolderId(df.id);
                            fetchDocuments({
                              workspaceId: activeWorkspace!.workspaceId,
                              folderId: df.id,
                              status: 'DELETED',
                            }).then(setDocuments).catch(() => {});
                          }}
                          indent={1}
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); void handleRestoreFolder(df); }}
                          title="Restore folder"
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 hidden group-hover/df:flex items-center p-0.5 text-ink-3 hover:text-brand-600 transition-colors bg-surface rounded shadow-sm border border-stroke"
                        >
                          <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </nav>
          </div>
        </aside>

        {/* --------------------------------------------------------- */}
        {/* Document table                                             */}
        {/* --------------------------------------------------------- */}
        <div
          className="flex-1 min-w-0 relative"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag-over overlay */}
          {dragOver && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-brand-400 bg-brand-50/80 pointer-events-none">
              <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" className="text-brand-500 mb-2">
                <path d="M4 16.004V17a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1M16 8l-4-4-4 4M12 4v12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-sm font-semibold text-brand-600">Drop file to upload</p>
            </div>
          )}
          {selectedFolderId !== null && !showTrash && !isSearching && (
            <Breadcrumb
              crumbs={buildBreadcrumb(selectedFolderId, folders)}
              onNavigate={handleSelectFolder}
            />
          )}
          {!showTrash && !isSearching && tags.length > 0 && (
            <TagFilterBar
              tags={tags}
              active={filterTagIds}
              onToggle={toggleFilterTag}
              onClear={() => { setFilterTagIds([]); setSelectedDocIds([]); }}
            />
          )}

          {selectedDocIds.length > 0 && (
            <SelectionBar
              count={selectedDocIds.length}
              busy={bulkBusy}
              onMove={() => setBulkAction('move')}
              onLabel={() => setBulkAction('label')}
              onDelete={() => setBulkAction('delete')}
              onClear={() => setSelectedDocIds([])}
            />
          )}

          <div className="bg-surface rounded-xl border border-stroke overflow-hidden">
            {loading || searching ? (
              <TableSkeleton />
            ) : displayDocs.length === 0 ? (
              <>
                {isSearching ? (
                  /* No search results */
                  <div className="flex flex-col items-center justify-center py-14 text-center px-6">
                    <div className="w-10 h-10 rounded-full bg-surface-high flex items-center justify-center mb-3">
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="text-ink-3">
                        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-ink-2 mb-1">No results for &ldquo;{searchQuery}&rdquo;</p>
                    <p className="text-xs text-ink-3 mb-3">Try different keywords, or check for typos.</p>
                    <button type="button" onClick={() => setSearchQuery('')} className="text-xs text-brand-600 hover:underline font-medium">
                      Clear search
                    </button>
                  </div>
                ) : showTrash ? (
                  /* Empty trash */
                  <div className="flex flex-col items-center justify-center py-14 text-center">
                    <div className="w-10 h-10 rounded-full bg-surface-high flex items-center justify-center mb-3">
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="text-ink-3">
                        <polyline points="3 6 5 6 21 6" strokeLinecap="round" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" strokeLinecap="round" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-ink-2 mb-1">Trash is empty</p>
                    <p className="text-xs text-ink-3">Deleted documents appear here before they're permanently removed.</p>
                  </div>
                ) : selectedFolderId ? (
                  /* Empty folder */
                  <div className="flex flex-col items-center justify-center py-14 text-center px-6">
                    <div className="w-10 h-10 rounded-lg bg-surface-high flex items-center justify-center mb-3">
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="text-ink-3">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-ink-2 mb-1">This folder is empty</p>
                    <p className="text-xs text-ink-3 mb-4">Upload a document or drag one here from the list.</p>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setShowUpload(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-brand-400 dark:text-slate-900 dark:hover:bg-brand-300 text-xs font-semibold active:scale-[0.97] transition-all duration-150"
                      >
                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                        </svg>
                        Upload Document
                      </button>
                    )}
                  </div>
                ) : (
                  /* First-time / no documents in workspace */
                  <div className="flex flex-col items-center justify-center py-16 text-center px-8">
                    <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mb-4">
                      <svg width="26" height="26" fill="none" stroke="#2563eb" strokeWidth={1.6} viewBox="0 0 24 24">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" strokeLinejoin="round" />
                        <path d="M12 12v5M9.5 14.5 12 12l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-semibold text-ink mb-2">No documents yet</h3>
                    <p className="text-sm text-ink-3 leading-relaxed max-w-xs mb-5">
                      Upload contracts, certificates, or policies. DockyDoc tracks expiry dates, extracts key details with AI, and alerts you before anything lapses.
                    </p>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => setShowUpload(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-brand-400 dark:text-slate-900 dark:hover:bg-brand-300 text-sm font-semibold active:scale-[0.97] transition-all duration-150"
                      >
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                        </svg>
                        Upload your first document
                      </button>
                    ) : (
                      <p className="text-xs text-ink-3">You don&apos;t have upload permissions in this workspace.</p>
                    )}
                    <p className="mt-3 text-xs text-ink-3">Supports PDF, Word, Excel, PowerPoint, and images</p>
                  </div>
                )}
              </>
            ) : (
              <div className="divide-y divide-stroke-soft">
                {canEdit && !showTrash && displayDocs.length > 1 && (
                  <div className="flex items-center gap-3.5 px-5 py-2 bg-surface-high">
                    <input
                      type="checkbox"
                      aria-label="Select all documents"
                      checked={selectedDocIds.length === displayDocs.length && displayDocs.length > 0}
                      onChange={() => toggleSelectAll(displayDocs.map((d) => d.id))}
                      className="w-4 h-4 rounded border-stroke cursor-pointer"
                    />
                    <span className="text-xs text-ink-3">
                      {selectedDocIds.length > 0
                        ? `${selectedDocIds.length} selected`
                        : 'Select all'}
                    </span>
                  </div>
                )}
                {displayDocs.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc as DocumentListItem}
                    snippet={(doc as SearchResult).snippet}
                    deleting={deletingDocId === doc.id}
                    canEdit={canEdit}
                    selectable={canEdit && !showTrash}
                    selected={selectedDocIds.includes(doc.id)}
                    onToggleSelect={() => toggleDocSelected(doc.id)}
                    activeTagIds={filterTagIds}
                    onTagClick={showTrash || isSearching ? undefined : toggleFilterTag}
                    onDelete={() => handleDeleteDoc(doc as DocumentListItem)}
                    onRestore={showTrash ? () => { void handleRestoreDoc(doc as DocumentListItem); } : undefined}
                    dragging={dragDocId === doc.id}
                    onDragStart={!showTrash && !isSearching && canEdit ? setDragDocId : undefined}
                    onDragEnd={!showTrash && !isSearching && canEdit ? () => {
                      setDragDocId(null);
                      setDragOverFolderId(null);
                    } : undefined}
                    fromParam={
                      showTrash
                        ? 'trash'
                        : selectedFolderId
                        ? `folder:${selectedFolderId}`
                        : 'all'
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bulk action modals */}
      {bulkAction === 'move' && (
        <BulkMoveModal
          count={selectedDocIds.length}
          folders={folders}
          busy={bulkBusy}
          onMove={(folderId) => void handleBulkMove(folderId)}
          onClose={() => { if (!bulkBusy) setBulkAction(null); }}
        />
      )}
      {bulkAction === 'delete' && (
        <ConfirmModal
          title={`Delete ${selectedDocIds.length} document${selectedDocIds.length === 1 ? '' : 's'}?`}
          body={
            `${selectedDocIds.length === 1 ? 'This document' : `All ${selectedDocIds.length} documents`} will be moved to Trash, ` +
            'along with any reminders and share links. Nothing is erased: you can restore from Trash, ' +
            'and files are only removed for good when a document is shredded there.'
          }
          confirmLabel={`Move ${selectedDocIds.length === 1 ? 'it' : 'them'} to Trash`}
          danger
          loading={bulkBusy}
          onConfirm={() => void handleBulkDelete()}
          onClose={() => { if (!bulkBusy) setBulkAction(null); }}
        />
      )}
      {bulkAction === 'label' && (
        <BulkLabelModal
          count={selectedDocIds.length}
          tags={tags}
          busy={bulkBusy}
          onApply={(tagIds, action) => void handleBulkLabel(tagIds, action)}
          onClose={() => { if (!bulkBusy) setBulkAction(null); }}
        />
      )}

      {/* Bulk upload modal */}
      {bulkFiles !== null && activeWorkspace && (
        <BulkUploadModal
          workspaceId={activeWorkspace.workspaceId}
          folders={folders}
          tags={tags}
          defaultFolderId={selectedFolderId ?? undefined}
          initialFiles={bulkFiles}
          onClose={() => setBulkFiles(null)}
          onDone={(n) => {
            refreshDocuments();
            refreshFolders();
            refreshTags();
            toast.success(`${n} document${n === 1 ? '' : 's'} uploaded. The AI is reading them in turn.`);
          }}
        />
      )}

      {/* Upload modal */}
      {showUpload && activeWorkspace && (
        <UploadModal
          workspaceId={activeWorkspace.workspaceId}
          folders={folders}
          tags={tags}
          defaultFolderId={selectedFolderId ?? undefined}
          initialFile={dropFile ?? undefined}
          onManyFiles={(files) => { setShowUpload(false); setDropFile(null); setBulkFiles(files.map((file) => ({ file, relativeDir: '' }))); }}
          onClose={() => { setShowUpload(false); setDropFile(null); }}
          onSuccess={() => {
            setShowUpload(false);
            setDropFile(null);
            refreshDocuments();
            refreshFolders();
            refreshTags();
            toast.success('Uploaded. AI is reading it now — check the document for suggestions.');
          }}
        />
      )}

      {/* New folder modal */}
      {showNewFolder && activeWorkspace && (
        <FolderModal
          workspaceId={activeWorkspace.workspaceId}
          folders={folders}
          defaultParentId={newFolderParentId}
          onClose={() => setShowNewFolder(false)}
          onSaved={() => {
            setShowNewFolder(false);
            refreshFolders();
            toast.success('Folder created.');
          }}
        />
      )}

      {/* Rename folder modal */}
      {renamingFolder && (
        <FolderModal
          workspaceId={renamingFolder.workspaceId}
          folder={renamingFolder}
          folders={folders}
          onClose={() => setRenamingFolder(null)}
          onSaved={() => {
            setRenamingFolder(null);
            refreshFolders();
            refreshDocuments();
            toast.success('Folder updated.');
          }}
        />
      )}

      {/* Confirm modal for destructive actions */}
      {pendingConfirm && (
        <ConfirmModal
          title={pendingConfirm.title}
          body={pendingConfirm.body}
          confirmLabel={pendingConfirm.confirmLabel}
          danger={pendingConfirm.danger}
          loading={confirmLoading}
          onConfirm={executeConfirm}
          onClose={() => { if (!confirmLoading) setPendingConfirm(null); }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ //
// Folder modal (create or rename)
// ------------------------------------------------------------------ //

function FolderModal({
  workspaceId,
  folder,
  folders = [],
  defaultParentId,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  folder?: FolderListItem;
  folders?: FolderListItem[];
  defaultParentId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = !!folder;
  const [name, setName] = useState(folder?.name ?? '');
  const [parentFolderId, setParentFolderId] = useState(
    isEditing ? (folder!.parentFolderId ?? '') : (defaultParentId ?? ''),
  );
  const [retentionDays, setRetentionDays] = useState<string>(folder?.retentionDays ? String(folder.retentionDays) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    const retention = retentionDays.trim() === '' ? null : Number(retentionDays);
    if (retention !== null && (!Number.isInteger(retention) || retention < 30 || retention > 3650)) {
      setError('Retention must be a whole number of days between 30 and 3650, or left blank.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEditing) {
        await updateFolder(folder!.id, {
          name: name.trim(),
          parentFolderId: parentFolderId || null,
          retentionDays: retention,
        });
      } else {
        await createFolder({
          workspaceId,
          name: name.trim(),
          parentFolderId: parentFolderId || undefined,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  // A folder cannot be moved into itself or into anything it contains
  const parentOptions = isEditing
    ? folders.filter((f) => !descendantIds(folders, folder!.id).has(f.id))
    : folders;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop">
      <div className="bg-surface border border-stroke rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 animate-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-ink">
            {isEditing ? 'Edit Folder' : 'New Folder'}
          </h2>
          <button onClick={onClose} className="text-ink-3 hover:text-ink-2 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">Folder name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
              className="w-full text-sm border border-stroke bg-surface text-ink rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="e.g. Contracts"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">
              {isEditing ? 'Sits inside' : 'Parent folder'}{' '}
              <span className="text-ink-3 font-normal">(optional)</span>
            </label>
            <select
              value={parentFolderId}
              onChange={(e) => setParentFolderId(e.target.value)}
              className="w-full text-sm border border-stroke bg-surface text-ink rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">— Top level —</option>
              {parentOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.parentFolderId ? '  └ ' : ''}{f.name}
                </option>
              ))}
            </select>
            {isEditing && (
              <p className="mt-1 text-[11px] text-ink-3">
                Changing this moves the folder and everything inside it.
              </p>
            )}
          </div>

          {isEditing && (
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">
                Auto-delete after <span className="text-ink-3 font-normal">(optional)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={30}
                  max={3650}
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(e.target.value)}
                  placeholder="Off"
                  className="w-28 text-sm border border-stroke bg-surface text-ink rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <span className="text-sm text-ink-2">days after expiry</span>
              </div>
              <p className="mt-1 text-[11px] text-ink-3">
                Documents in this folder move to the bin this many days after their expiry date (or after upload, if they have none). Documents on legal hold are skipped. Leave blank to turn off.
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-ink-2 border border-stroke rounded-lg hover:bg-surface-high">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {saving ? 'Saving…' : isEditing ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense>
      <DocumentsPageInner />
    </Suspense>
  );
}

// ------------------------------------------------------------------ //
// Upload modal
// ------------------------------------------------------------------ //

function UploadModal({
  workspaceId,
  folders,
  tags,
  defaultFolderId,
  initialFile,
  onManyFiles,
  onClose,
  onSuccess,
}: {
  workspaceId: string;
  folders: FolderListItem[];
  tags: Tag[];
  defaultFolderId?: string;
  initialFile?: File;
  /** When more than one file is picked, hand them to the bulk upload instead. */
  onManyFiles?: (files: File[]) => void;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [name, setName] = useState(initialFile ? initialFile.name.replace(/\.[^.]+$/, '') : '');
  const [description, setDescription] = useState('');
  const [folderId, setFolderId] = useState(defaultFolderId ?? '');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Folder created from inside this dialog, so people never have to cancel,
  // go and make a folder, and start the upload again
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [extraFolders, setExtraFolders] = useState<FolderListItem[]>([]);

  // Labels chosen up front. New names are created when the upload runs.
  const [pickedTagIds, setPickedTagIds] = useState<string[]>([]);
  const [newTagNames, setNewTagNames] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');

  const allFolders = [...folders, ...extraFolders];
  const options = folderOptions(allFolders);

  async function handleCreateFolder() {
    const trimmed = newFolderName.trim();
    if (!trimmed || creatingFolder) return;
    setCreatingFolder(true);
    setError(null);
    try {
      const created = await createFolder({
        workspaceId,
        name: trimmed,
        parentFolderId: folderId || undefined,
      });
      setExtraFolders((prev) => [...prev, created]);
      setFolderId(created.id);
      setNewFolderName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that folder.');
    } finally {
      setCreatingFolder(false);
    }
  }

  function addTagDraft() {
    const trimmed = tagDraft.trim();
    if (!trimmed) return;
    const existing = tags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setPickedTagIds((prev) => (prev.includes(existing.id) ? prev : [...prev, existing.id]));
    } else if (!newTagNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
      setNewTagNames((prev) => [...prev, trimmed]);
    }
    setTagDraft('');
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length > 1 && onManyFiles) {
      onManyFiles(picked);
      return;
    }
    const f = picked[0] ?? null;
    setFile(f);
    if (f && !name) {
      // Auto-fill name from filename (strip extension)
      setName(f.name.replace(/\.[^.]+$/, ''));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError('Please select a file.'); return; }
    if (!name.trim()) { setError('Document name is required.'); return; }

    setUploading(true);
    setError(null);

    try {
      // Any label typed but not yet created is created now. createTag hands
      // back the existing label when the name is already taken.
      const createdIds: string[] = [];
      for (const label of newTagNames) {
        try {
          const tag = await createTag(workspaceId, label);
          createdIds.push(tag.id);
        } catch {
          // A label that cannot be created should not lose the upload
        }
      }

      await uploadDocument({
        workspaceId,
        name: name.trim(),
        file,
        description: description.trim() || undefined,
        folderId: folderId || undefined,
        tags: [...pickedTagIds, ...createdIds],
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  // Close on backdrop click
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
          <h2 className="text-base font-semibold text-ink">Upload Document</h2>
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
              File <span className="text-red-500">*</span>
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
                  <FileTypeIcon fileType={file.name.split('.').pop() ?? ''} />
                  <div className="text-left">
                    <p className="text-sm font-medium text-ink truncate max-w-xs">{file.name}</p>
                    <p className="text-xs text-ink-3">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
              ) : (
                <div>
                  <svg className="mx-auto mb-2 text-gray-300" width="28" height="28" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path d="M4 16.004V17a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1M16 8l-4-4-4 4M12 4v12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="text-sm text-ink-3">Click to choose a file{onManyFiles ? ', or several' : ''}</p>
                  <p className="text-xs text-ink-3 mt-1">PDF, Word, Excel, images, text — up to 50 MB</p>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                multiple={!!onManyFiles}
                className="sr-only"
                onChange={handleFileChange}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.zip,.json"
              />
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1.5">
              Document name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q4 Budget Report"
              className="w-full rounded-lg border border-stroke bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description…"
              rows={2}
              className="w-full rounded-lg border border-stroke bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Folder — full paths, and a way to make one without leaving */}
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1.5">
              Folder
            </label>
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="w-full rounded-lg border border-stroke px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-surface"
            >
              <option value="">No folder</option>
              {options.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.path}
                </option>
              ))}
            </select>

            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); void handleCreateFolder(); }
                }}
                placeholder={folderId ? 'New folder inside the one above…' : 'Or type a new folder name…'}
                className="flex-1 rounded-lg border border-stroke bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-ink-3"
              />
              <button
                type="button"
                onClick={() => void handleCreateFolder()}
                disabled={creatingFolder || !newFolderName.trim()}
                className="btn-ghost px-3 py-1.5 text-xs"
              >
                {creatingFolder ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>

          {/* Labels */}
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1.5">
              Labels
            </label>

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map((t) => {
                  const on = pickedTagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        setPickedTagIds((prev) =>
                          prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id],
                        )
                      }
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                        on
                          ? 'border-brand-400 bg-brand-50 text-brand-700 font-semibold'
                          : 'border-stroke bg-surface text-ink-2 hover:border-brand-300',
                      )}
                    >
                      <span
                        aria-hidden
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: t.color ?? '#94a3b8' }}
                      />
                      {t.name}
                    </button>
                  );
                })}
              </div>
            )}

            {newTagNames.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {newTagNames.map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-brand-400 bg-brand-50 px-2.5 py-1 text-xs text-brand-700"
                  >
                    {label}
                    <span className="text-[10px] text-ink-3">new</span>
                    <button
                      type="button"
                      aria-label={`Remove ${label}`}
                      onClick={() => setNewTagNames((prev) => prev.filter((n) => n !== label))}
                      className="text-ink-3 hover:text-red-600"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTagDraft(); }
                }}
                placeholder={tags.length > 0 ? 'Or type a new label…' : 'Type a label and press Enter…'}
                className="flex-1 rounded-lg border border-stroke bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-ink-3"
              />
              <button
                type="button"
                onClick={addTagDraft}
                disabled={!tagDraft.trim()}
                className="btn-ghost px-3 py-1.5 text-xs"
              >
                Add
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-ink-3">
              AI reads the file after upload and suggests an expiry date, a folder and labels on the
              document&apos;s page.
            </p>
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
                'Upload'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Sub-components
// ------------------------------------------------------------------ //

function FolderSvgIcon() {
  return (
    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AllDocsSvgIcon() {
  return (
    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" />
      <polyline points="14 2 14 8 20 8" strokeLinejoin="round" />
    </svg>
  );
}

function TrashSvgIcon() {
  return (
    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <polyline points="3 6 5 6 21 6" strokeLinecap="round" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" strokeLinecap="round" />
    </svg>
  );
}

function FolderRow({
  label,
  count,
  active,
  onClick,
  iconEl,
  indent = 0,
  onDragOver,
  onDragLeave,
  onDrop,
  dragHighlight = false,
  draggable = false,
  onDragStart,
  onDragEnd,
  dragging = false,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  iconEl?: React.ReactNode;
  indent?: number;
  onDragOver?: (e: React.DragEvent<HTMLButtonElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent<HTMLButtonElement>) => void;
  dragHighlight?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: () => void;
  dragging?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'w-full flex items-start gap-2 px-3 py-1.5 rounded-lg text-left transition-colors text-sm',
        dragHighlight
          ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-400 ring-inset'
          : active
          ? 'bg-brand-50 text-brand-700 font-medium'
          : 'text-ink-2 hover:bg-surface-high',
        dragging && 'opacity-40',
      )}
      style={{ paddingLeft: `${12 + indent * 14}px` }}
    >
      <span className="flex-shrink-0 opacity-70 mt-px">
        {iconEl ?? <FolderSvgIcon />}
      </span>
      <span className="flex-1 min-w-0 break-words leading-snug">{label}</span>
      {dragHighlight && (
        <span className="text-[10px] font-semibold text-brand-500 mt-px flex-shrink-0">Drop</span>
      )}
      {!dragHighlight && count !== undefined && (
        <span className="text-xs text-ink-3 tabular-nums mt-px flex-shrink-0">{count}</span>
      )}
    </button>
  );
}

function FolderTreeNode({
  folder,
  childMap,
  selectedId,
  onSelect,
  onRename,
  onDelete,
  onCreateSubfolder,
  depth,
  dragOverFolderId,
  onDropDoc,
  onDragFolderEnter,
  onDragFolderLeave,
  canEdit,
  dragFolderId,
  onFolderDragStart,
  onFolderDragEnd,
  onDropFolder,
  blockedDropIds,
}: {
  folder: FolderListItem;
  childMap: Map<string, FolderListItem[]>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRename: (f: FolderListItem) => void;
  onDelete: (f: FolderListItem) => void;
  onCreateSubfolder: (parentId: string) => void;
  depth: number;
  dragOverFolderId: string | null;
  onDropDoc: (docId: string, folderId: string) => void;
  onDragFolderEnter: (folderId: string) => void;
  onDragFolderLeave: () => void;
  canEdit?: boolean;
  dragFolderId: string | null;
  onFolderDragStart: (id: string) => void;
  onFolderDragEnd: () => void;
  onDropFolder: (folderId: string, targetParentId: string | null) => void;
  /** The dragged folder and its descendants, which cannot receive the drop. */
  blockedDropIds: Set<string>;
}) {
  const children = childMap.get(folder.id) ?? [];
  const [hovered, setHovered] = useState(false);

  return (
    <>
      <div
        className="relative group"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <FolderRow
          label={folder.name}
          count={folder.documentCount || undefined}
          active={selectedId === folder.id}
          onClick={() => onSelect(folder.id)}
          indent={depth}
          dragHighlight={dragOverFolderId === folder.id}
          draggable={!!canEdit}
          dragging={dragFolderId === folder.id}
          onDragStart={(e) => {
            e.dataTransfer.setData('application/dockydoc-folderid', folder.id);
            e.dataTransfer.effectAllowed = 'move';
            onFolderDragStart(folder.id);
          }}
          onDragEnd={onFolderDragEnd}
          onDragOver={(e) => {
            const types = e.dataTransfer.types;
            const isDoc = types.includes('application/dockydoc-docid');
            const isFolder = types.includes('application/dockydoc-folderid');
            if (!isDoc && !isFolder) return;
            // A folder cannot land inside itself or its own contents
            if (isFolder && blockedDropIds.has(folder.id)) return;
            e.preventDefault();
            onDragFolderEnter(folder.id);
          }}
          onDragLeave={onDragFolderLeave}
          onDrop={(e) => {
            e.preventDefault();
            const docId = e.dataTransfer.getData('application/dockydoc-docid');
            if (docId) { onDropDoc(docId, folder.id); return; }
            const folderId = e.dataTransfer.getData('application/dockydoc-folderid');
            if (folderId && !blockedDropIds.has(folder.id)) onDropFolder(folderId, folder.id);
          }}
        />
        {hovered && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-surface rounded shadow-sm border border-stroke px-1 py-0.5 z-10">
            <button
              onClick={(e) => { e.stopPropagation(); onRename(folder); }}
              title="Rename or move"
              className="p-0.5 text-ink-3 hover:text-brand-600 transition-colors"
            >
              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onCreateSubfolder(folder.id); }}
              title="New subfolder"
              className="p-0.5 text-ink-3 hover:text-brand-600 transition-colors"
            >
              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                <path d="M12 11v6M9 14h6" strokeLinecap="round" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(folder); }}
              title="Delete"
              className="p-0.5 text-ink-3 hover:text-red-600 transition-colors"
            >
              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            </button>
          </div>
        )}
      </div>
      {children.map((child) => (
        <FolderTreeNode
          key={child.id}
          folder={child}
          childMap={childMap}
          selectedId={selectedId}
          onSelect={onSelect}
          onRename={onRename}
          onDelete={onDelete}
          onCreateSubfolder={onCreateSubfolder}
          depth={depth + 1}
          dragOverFolderId={dragOverFolderId}
          onDropDoc={onDropDoc}
          onDragFolderEnter={onDragFolderEnter}
          onDragFolderLeave={onDragFolderLeave}
          canEdit={canEdit}
          dragFolderId={dragFolderId}
          onFolderDragStart={onFolderDragStart}
          onFolderDragEnd={onFolderDragEnd}
          onDropFolder={onDropFolder}
          blockedDropIds={blockedDropIds}
        />
      ))}
    </>
  );
}

function expiryBadge(expiryDate: string | null | undefined): {
  label: string;
  class: string;
} | null {
  if (!expiryDate) return null;
  const now = new Date();
  const expiry = new Date(expiryDate);
  const daysLeft = Math.round((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { label: 'Expired', class: 'bg-red-100 text-red-700' };
  if (daysLeft <= 30) return { label: `Exp. ${daysLeft}d`, class: 'bg-orange-100 text-orange-700' };
  return null;
}

/**
 * Label filter above the list. Picking more than one narrows to documents
 * carrying all of them, which is how people expect filters to stack.
 */
function TagFilterBar({
  tags,
  active,
  onToggle,
  onClear,
}: {
  tags: Tag[];
  active: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Busiest labels first, but anything already picked stays visible
  const ordered = [...tags].sort((a, b) => b.documentCount - a.documentCount);
  const visible = expanded
    ? ordered
    : [
        ...ordered.slice(0, TAG_FILTER_VISIBLE),
        ...ordered.slice(TAG_FILTER_VISIBLE).filter((t) => active.includes(t.id)),
      ];
  const hidden = ordered.length - visible.length;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <span className="label-mono mr-1">Labels</span>
      {visible.map((tag) => {
        const on = active.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => onToggle(tag.id)}
            aria-pressed={on}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
              on
                ? 'border-brand-400 bg-brand-50 text-brand-700 font-semibold'
                : 'border-stroke bg-surface text-ink-2 hover:border-brand-300 hover:text-ink',
            )}
          >
            <span
              aria-hidden
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: tag.color ?? '#94a3b8' }}
            />
            {tag.name}
            <span className="tabular-nums text-ink-3">{tag.documentCount}</span>
          </button>
        );
      })}

      {hidden > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs text-ink-3 hover:text-ink-2 px-1.5"
        >
          +{hidden} more
        </button>
      )}
      {expanded && ordered.length > TAG_FILTER_VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-xs text-ink-3 hover:text-ink-2 px-1.5"
        >
          show fewer
        </button>
      )}
      {active.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="ml-1 text-xs font-semibold text-brand-600 hover:underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}

/** Appears once documents are ticked, and holds the actions that apply to all of them. */
function SelectionBar({
  count,
  busy,
  onMove,
  onLabel,
  onDelete,
  onClear,
}: {
  count: number;
  busy: boolean;
  onMove: () => void;
  onLabel: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand-300 bg-brand-50 px-4 py-2.5">
      <span className="text-sm font-semibold text-brand-800">
        {count} document{count === 1 ? '' : 's'} selected
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button type="button" onClick={onMove} disabled={busy} className="btn-ghost px-3 py-1.5 text-xs">
          Move to folder
        </button>
        <button type="button" onClick={onLabel} disabled={busy} className="btn-ghost px-3 py-1.5 text-xs">
          Labels
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-surface px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
          </svg>
          Delete
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={busy}
          className="text-xs font-semibold text-ink-2 hover:text-ink px-2"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

/** Pick one destination folder for every selected document. */
function BulkMoveModal({
  count,
  folders,
  busy,
  onMove,
  onClose,
}: {
  count: number;
  folders: FolderListItem[];
  busy: boolean;
  onMove: (folderId: string | null) => void;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<string>('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop">
      <div className="bg-surface border border-stroke rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 animate-in">
        <h2 className="text-base font-semibold text-ink">
          Move {count} document{count === 1 ? '' : 's'}
        </h2>
        <p className="mt-1 text-xs text-ink-3">Every selected document goes to the same place.</p>

        <select
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="mt-4 w-full text-sm border border-stroke bg-surface text-ink rounded-lg px-3 py-2"
        >
          <option value="">— No folder —</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.parentFolderId ? '   ' : ''}{f.name}
            </option>
          ))}
        </select>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-ink-2 border border-stroke rounded-lg hover:bg-surface-high disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onMove(choice || null)}
            disabled={busy}
            className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? 'Moving…' : 'Move'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Add or take away labels across every selected document. */
function BulkLabelModal({
  count,
  tags,
  busy,
  onApply,
  onClose,
}: {
  count: number;
  tags: Tag[];
  busy: boolean;
  onApply: (tagIds: string[], action: 'add' | 'remove') => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  const matches = search.trim()
    ? tags.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    : tags;

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop">
      <div className="bg-surface border border-stroke rounded-xl shadow-xl w-full max-w-md mx-4 p-6 animate-in">
        <h2 className="text-base font-semibold text-ink">
          Labels for {count} document{count === 1 ? '' : 's'}
        </h2>
        <p className="mt-1 text-xs text-ink-3">
          Pick the labels, then choose whether to add or take them away.
        </p>

        {tags.length > 8 && (
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search labels…"
            className="mt-4 w-full h-9 rounded-lg border border-stroke bg-surface px-3 text-sm text-ink"
          />
        )}

        <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-stroke divide-y divide-stroke-soft">
          {matches.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-ink-3">
              {tags.length === 0 ? 'No labels in this workspace yet.' : 'No labels match.'}
            </p>
          ) : (
            matches.map((t) => (
              <label
                key={t.id}
                className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-surface-high"
              >
                <input
                  type="checkbox"
                  checked={picked.includes(t.id)}
                  onChange={() => toggle(t.id)}
                  className="w-4 h-4 rounded border-stroke"
                />
                <span
                  aria-hidden
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: t.color ?? '#94a3b8' }}
                />
                <span className="text-sm text-ink truncate">{t.name}</span>
                <span className="ml-auto text-xs text-ink-3 tabular-nums">{t.documentCount}</span>
              </label>
            ))
          )}
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-ink-2 border border-stroke rounded-lg hover:bg-surface-high disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onApply(picked, 'remove')}
            disabled={busy || picked.length === 0}
            className="px-4 py-2 text-sm font-semibold text-ink-2 border border-stroke rounded-lg hover:bg-surface-high disabled:opacity-50"
          >
            Remove
          </button>
          <button
            type="button"
            onClick={() => onApply(picked, 'add')}
            disabled={busy || picked.length === 0}
            className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? 'Applying…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Small "AI read this" marker on a document row.
 * Silent when the document has never been analysed, so the list stays calm.
 */
function AiRowBadge({ status, confidence }: { status?: AiDocumentStatus; confidence?: number }) {
  // Search results come from a different endpoint and carry no AI fields
  if (status !== 'running' && status !== 'failed' && status !== 'done') return null;

  if (status === 'running') {
    return (
      <span
        title="AI is reading this document"
        className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700"
      >
        <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
        AI
      </span>
    );
  }

  if (status === 'failed') {
    return (
      <span
        title="AI could not read this document"
        className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600"
      >
        AI failed
      </span>
    );
  }

  const pct = Math.round((confidence ?? 0) * 100);
  return (
    <span
      title={`AI read this document with ${pct}% confidence`}
      className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700"
    >
      <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
        <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.3l-1.9-5.5L4.5 10.9 10.1 9z" strokeLinejoin="round" />
      </svg>
      AI
    </span>
  );
}

function DocumentRow({
  doc,
  snippet,
  deleting,
  canEdit,
  onDelete,
  onRestore,
  dragging,
  onDragStart,
  onDragEnd,
  fromParam,
  selectable,
  selected,
  onToggleSelect,
  activeTagIds,
  onTagClick,
}: {
  doc: DocumentListItem;
  snippet?: string;
  deleting?: boolean;
  canEdit?: boolean;
  onDelete: () => void;
  onRestore?: () => void;
  dragging?: boolean;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
  fromParam?: string;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  activeTagIds?: string[];
  onTagClick?: (tagId: string) => void;
}) {
  const badge = STATUS_BADGE[doc.status];
  const expiry = expiryBadge(doc.expiryDate);
  const date = new Date(doc.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div
      className={cn(
        'group flex items-center gap-3.5 px-5 py-4',
        'hover:bg-surface-high transition-colors duration-100 cursor-default',
        dragging && 'opacity-40 bg-surface-high',
        selected && 'bg-brand-50',
      )}
      draggable={!!onDragStart}
      onDragStart={onDragStart ? (e) => {
        e.dataTransfer.setData('application/dockydoc-docid', doc.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(doc.id);
      } : undefined}
      onDragEnd={onDragEnd}
    >
      {selectable && (
        <input
          type="checkbox"
          aria-label={`Select ${doc.name}`}
          checked={!!selected}
          onChange={onToggleSelect}
          className="w-4 h-4 rounded border-stroke cursor-pointer flex-shrink-0"
        />
      )}

      {/* File type icon */}
      <div className="flex-shrink-0">
        <FileTypeIcon fileType={doc.fileType} />
      </div>

      {/* Primary block — name + compact metadata subtitle */}
      <div className="flex-1 min-w-0">
        <Link
          href={`/documents/${doc.id}${fromParam ? `?from=${fromParam}` : ''}`}
          className="block"
        >
          <span className="text-sm font-medium text-ink group-hover:text-brand-600 transition-colors truncate block leading-snug">
            {doc.name}
          </span>
        </Link>
        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-ink-3 flex-wrap">
          {doc.folder && (
            <span className="truncate max-w-[80px]">{doc.folder.name}</span>
          )}
          {doc.folder && <span className="text-gray-200 flex-shrink-0">·</span>}
          <span className="flex-shrink-0">{doc.owner.firstName} {doc.owner.lastName}</span>
          <span className="text-gray-200 flex-shrink-0">·</span>
          <span className="flex-shrink-0 whitespace-nowrap">{date}</span>
          {doc.currentVersionNumber > 1 && (
            <>
              <span className="text-gray-200 flex-shrink-0">·</span>
              <span className="flex-shrink-0 tabular-nums">v{doc.currentVersionNumber}</span>
            </>
          )}
          {snippet && (
            <>
              <span className="text-gray-200 flex-shrink-0">·</span>
              <span className="italic truncate text-ink-3 max-w-[160px]">{snippet}</span>
            </>
          )}
        </div>
      </div>

      {/* Tags — sm+ only. Clicking one filters the list by it. */}
      {doc.tags.length > 0 && (
        <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
          {doc.tags.slice(0, 2).map((tag) => (
            <button
              key={tag.id}
              type="button"
              disabled={!onTagClick}
              title={onTagClick ? `Show everything labelled "${tag.name}"` : tag.name}
              onClick={(e) => { e.stopPropagation(); onTagClick?.(tag.id); }}
              className={cn(
                'inline-block px-1.5 py-0.5 rounded text-[10px] font-medium transition-opacity',
                onTagClick && 'hover:opacity-80 cursor-pointer',
                activeTagIds?.includes(tag.id) && 'ring-1 ring-offset-1 ring-brand-500 dark:ring-offset-canvas',
              )}
              style={
                tag.color
                  ? { backgroundColor: `${tag.color}18`, color: tag.color }
                  : { backgroundColor: '#f3f4f6', color: '#6b7280' }
              }
            >
              {tag.name}
            </button>
          ))}
          {doc.tags.length > 2 && (
            <span className="text-[10px] text-ink-3">+{doc.tags.length - 2}</span>
          )}
        </div>
      )}

      {/* Status + expiry chips */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <AiRowBadge status={doc.aiStatus} confidence={doc.aiConfidence} />
        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', badge.class)}>
          {badge.label}
        </span>
        {expiry && (
          <span className={cn('hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', expiry.class)}>
            {expiry.label}
          </span>
        )}
      </div>

      {/* Row actions — fixed width so status chip stays aligned across all rows */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-100 flex-shrink-0 w-[60px] justify-end">
        {onRestore && (
          <button
            onClick={(e) => { e.stopPropagation(); onRestore(); }}
            title="Restore document"
            className="p-1.5 rounded text-gray-300 hover:text-green-600 hover:bg-green-50 transition-colors"
          >
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M1 4v6h6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3.51 15a9 9 0 1 0 .49-5.1L1 10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {canEdit && doc.status !== 'DELETED' && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            disabled={deleting}
            title="Delete document"
            className="p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {deleting ? (
              <svg className="animate-spin" width="13" height="13" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Skeletons
// ------------------------------------------------------------------ //

function PageSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-8 w-40 bg-surface-high rounded mb-2" />
      <div className="h-4 w-56 bg-surface-high rounded mb-6" />
      <div className="flex gap-5">
        <div className="w-52 h-64 bg-surface-high rounded-xl" />
        <div className="flex-1 h-64 bg-surface-high rounded-xl" />
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-stroke-soft">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3.5 px-5 py-4 animate-pulse">
          {/* File icon placeholder */}
          <div className="w-[18px] h-[22px] bg-surface-high rounded flex-shrink-0" />
          {/* Name + metadata */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-3.5 bg-surface-high rounded w-48" />
            <div className="h-3 bg-surface-high rounded w-64" />
          </div>
          {/* Status chip */}
          <div className="w-14 h-5 bg-surface-high rounded-full flex-shrink-0" />
          {/* Actions placeholder */}
          <div className="w-[60px] flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}
