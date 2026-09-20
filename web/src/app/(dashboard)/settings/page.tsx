'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/context/UserContext';
import { fetchAiStatus, fetchOcrStatus, type AiOcrStatus } from '@/lib/ai';
import {
  fetchWorkspaceDetail,
  fetchTags,
  createTag,
  updateTag,
  deleteTag,
  renameWorkspace,
  fetchAiSettings,
  updateAiSettings,
  mergeTag,
} from '@/lib/documents';
import type { AiSettings } from '@/lib/documents';
import { fetchBillingAccount, limitLabel, type AccountSummary } from '@/lib/billing';
import { deleteAccount, downloadAccountExport, fetchDeletionBlockers, type DeletionBlocker } from '@/lib/account';
import { createApiKey, fetchApiKeys, revokeApiKey, type ApiKey, type CreatedApiKey } from '@/lib/api-keys';
import { cn, fullName } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import ConfirmModal from '@/components/ui/ConfirmModal';
import type { Tag, WorkspaceDetail } from '@/types';

// ------------------------------------------------------------------ //
// Sidebar nav definition
// ------------------------------------------------------------------ //

type SectionId = 'general' | 'tags' | 'ai' | 'retention' | 'integrations' | 'security';

const NAV_ITEMS: { id: SectionId; label: string }[] = [
  { id: 'general',      label: 'General' },
  { id: 'tags',         label: 'Tags' },
  { id: 'ai',           label: 'AI Configuration' },
  { id: 'retention',    label: 'Retention & Storage' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'security',     label: 'Security' },
];

// ------------------------------------------------------------------ //
// Page
// ------------------------------------------------------------------ //

export default function SettingsPage() {
  const { user, activeWorkspace, isLoading, refreshUser } = useUser();
  const toast = useToast();
  const [activeSection, setActiveSection] = useState<SectionId>('general');

  // Data
  const [detail, setDetail] = useState<WorkspaceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [aiSettingsLoading, setAiSettingsLoading] = useState(false);

  // General — rename workspace
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [renamingWorkspace, setRenamingWorkspace] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  // AI settings form state
  const [aiProviderMode, setAiProviderMode] = useState<'PLATFORM' | 'BYOK'>('PLATFORM');
  const [byokKey, setByokKey] = useState('');
  const [aiSaving, setAiSaving] = useState(false);
  const [showByokKey, setShowByokKey] = useState(false);

  const canManage =
    activeWorkspace?.role === 'ADMIN' || activeWorkspace?.role === 'OWNER';

  useEffect(() => {
    if (!activeWorkspace) return;
    setDisplayName(activeWorkspace.workspaceName);

    setDetailLoading(true);
    fetchWorkspaceDetail(activeWorkspace.workspaceId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));

    setTagsLoading(true);
    fetchTags(activeWorkspace.workspaceId)
      .then(setTags)
      .catch(() => setTags([]))
      .finally(() => setTagsLoading(false));

    setAiSettingsLoading(true);
    fetchBillingAccount().then(setAccount).catch(() => setAccount(null));
    fetchAiSettings(activeWorkspace.workspaceId)
      .then((s) => {
        setAiSettings(s);
        setAiProviderMode(s.aiProvider);
      })
      .catch(() => setAiSettings(null))
      .finally(() => setAiSettingsLoading(false));
  }, [activeWorkspace?.workspaceId]);

  function refreshTags() {
    if (!activeWorkspace) return;
    fetchTags(activeWorkspace.workspaceId).then(setTags).catch(() => {});
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWorkspace || !renameValue.trim()) return;
    setRenameSaving(true);
    try {
      const updated = await renameWorkspace(activeWorkspace.workspaceId, renameValue.trim());
      setDisplayName(updated.name);
      setRenamingWorkspace(false);
      toast.success('Workspace renamed successfully.');
      void refreshUser();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to rename workspace.');
    } finally {
      setRenameSaving(false);
    }
  }

  async function handleSaveAiSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWorkspace) return;
    setAiSaving(true);
    try {
      const payload: { aiProvider: string; apiKey?: string } = { aiProvider: aiProviderMode };
      if (aiProviderMode === 'BYOK' && byokKey.trim()) payload.apiKey = byokKey.trim();
      const updated = await updateAiSettings(activeWorkspace.workspaceId, payload);
      setAiSettings(updated);
      setByokKey('');
      toast.success('AI settings saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save AI settings.');
    } finally {
      setAiSaving(false);
    }
  }

  if (isLoading || detailLoading) return <PageSkeleton />;

  const wsName = displayName ?? activeWorkspace?.workspaceName ?? '—';

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">{wsName}</p>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6 items-start">
        {/* ---- Left sidebar nav ---- */}
        <aside className="w-44 flex-shrink-0">
          <nav className="bg-surface rounded-xl border border-stroke overflow-hidden">
            {NAV_ITEMS.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors',
                  i < NAV_ITEMS.length - 1 && 'border-b border-stroke-soft',
                  activeSection === item.id
                    ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 font-semibold'
                    : 'text-ink-2 hover:bg-surface-high hover:text-ink',
                )}
              >
                <NavIcon sectionId={item.id} active={activeSection === item.id} />
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* ---- Right content pane ---- */}
        <div className="flex-1 min-w-0">
          {activeSection === 'general' && (
            <GeneralSection
              user={user}
              activeWorkspace={activeWorkspace}
              detail={detail}
              displayName={wsName}
              canManage={canManage}
              renamingWorkspace={renamingWorkspace}
              renameValue={renameValue}
              renameSaving={renameSaving}
              onStartRename={() => { setRenameValue(wsName); setRenamingWorkspace(true); }}
              onCancelRename={() => setRenamingWorkspace(false)}
              onRenameChange={setRenameValue}
              onRenameSubmit={handleRename}
            />
          )}

          {activeSection === 'tags' && (
            <TagsSection
              loading={tagsLoading}
              workspaceId={activeWorkspace?.workspaceId ?? ''}
              tags={tags}
              onChanged={refreshTags}
            />
          )}

          {activeSection === 'ai' && (
            <AiSection
              loading={aiSettingsLoading}
              settings={aiSettings}
              account={account}
              canManage={canManage}
              providerMode={aiProviderMode}
              byokKey={byokKey}
              showByokKey={showByokKey}
              saving={aiSaving}
              onProviderChange={setAiProviderMode}
              onByokKeyChange={setByokKey}
              onToggleShowKey={() => setShowByokKey((v) => !v)}
              onSubmit={handleSaveAiSettings}
            />
          )}

          {activeSection === 'retention' && <RetentionSection />}
          {activeSection === 'integrations' && <IntegrationsSection />}
          {activeSection === 'security' && <SecuritySection />}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Nav icon (inline SVGs per section)
// ------------------------------------------------------------------ //

function NavIcon({ sectionId, active }: { sectionId: SectionId; active: boolean }) {
  const cls = cn('flex-shrink-0', active ? 'text-brand-600' : 'text-ink-3');
  const s = { width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 2, viewBox: '0 0 24 24' };
  switch (sectionId) {
    case 'general':
      return <svg {...s} className={cls}><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" strokeLinecap="round"/></svg>;
    case 'tags':
      return <svg {...s} className={cls}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
    case 'ai':
      return <svg {...s} className={cls}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
    case 'retention':
      return <svg {...s} className={cls}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>;
    case 'integrations':
      return <svg {...s} className={cls}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>;
    case 'security':
      return <svg {...s} className={cls}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
    default:
      return null;
  }
}

// ------------------------------------------------------------------ //
// Section: General
// ------------------------------------------------------------------ //

function GeneralSection({
  user,
  activeWorkspace,
  detail,
  displayName,
  canManage,
  renamingWorkspace,
  renameValue,
  renameSaving,
  onStartRename,
  onCancelRename,
  onRenameChange,
  onRenameSubmit,
}: {
  user: ReturnType<typeof useUser>['user'];
  activeWorkspace: ReturnType<typeof useUser>['activeWorkspace'];
  detail: WorkspaceDetail | null;
  displayName: string;
  canManage: boolean;
  renamingWorkspace: boolean;
  renameValue: string;
  renameSaving: boolean;
  onStartRename: () => void;
  onCancelRename: () => void;
  onRenameChange: (v: string) => void;
  onRenameSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div className="space-y-5">
      {/* Workspace */}
      <SectionCard title="Workspace" subtitle="Details about this workspace">
        <div className="divide-y divide-stroke-soft">
          {/* Name row with optional rename */}
          <div className="flex items-center justify-between py-3">
            <span className="text-xs font-medium text-ink-3 w-36 flex-shrink-0">Name</span>
            {renamingWorkspace ? (
              <form onSubmit={onRenameSubmit} className="flex-1 flex items-center gap-2">
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => onRenameChange(e.target.value)}
                  autoFocus
                  className="flex-1 h-9 rounded-lg border border-stroke bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button
                  type="submit"
                  disabled={renameSaving || !renameValue.trim()}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white dark:bg-brand-400 dark:text-slate-900 rounded-lg hover:bg-slate-800 dark:hover:bg-brand-300 disabled:opacity-50"
                >
                  {renameSaving ? '…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={onCancelRename}
                  className="px-3 py-1.5 text-xs text-ink-3 hover:text-ink-2"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div className="flex-1 flex items-center justify-between">
                <span className="text-sm text-ink">{displayName}</span>
                {canManage && (
                  <button onClick={onStartRename} className="text-xs text-brand-600 hover:underline">
                    Rename
                  </button>
                )}
              </div>
            )}
          </div>
          <InfoRow label="Slug"       value={activeWorkspace?.workspaceSlug ?? '—'} />
          <InfoRow label="Type"       value={activeWorkspace ? activeWorkspace.workspaceType.charAt(0) + activeWorkspace.workspaceType.slice(1).toLowerCase() : '—'} />
          <InfoRow label="Your role"  value={activeWorkspace?.role ?? '—'} />
          <InfoRow label="Members"    value={detail ? String(detail.memberCount) : '—'} />
          <InfoRow label="Documents"  value={detail ? String(detail.documentCount) : '—'} last />
        </div>
      </SectionCard>

      {/* Account */}
      <SectionCard title="Account" subtitle="Your personal account information">
        <div className="divide-y divide-stroke-soft">
          <InfoRow label="Name"  value={user ? fullName(user) : '—'} />
          <InfoRow label="Email" value={user?.email ?? '—'} last />
        </div>
      </SectionCard>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Section: Tags
// ------------------------------------------------------------------ //

const TAGS_PAGE_SIZE = 10;
const PRESET_COLORS = [
  '#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6b7280',
];

function TagsSection({
  loading,
  workspaceId,
  tags,
  onChanged,
}: {
  loading: boolean;
  workspaceId: string;
  tags: Tag[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(TAGS_PAGE_SIZE);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Tag | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [mergingTag, setMergingTag] = useState<Tag | null>(null);
  const [mergeInto, setMergeInto] = useState('');
  const [merging, setMerging] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'usage'>('name');

  // Reset visible count when search changes
  const filtered = useMemo(() => {
    const matching = search.trim()
      ? tags.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
      : tags;
    // Sorting by usage puts the labels worth keeping at the top and the
    // one-off mistakes at the bottom, which is where cleanup starts.
    return sortBy === 'usage'
      ? [...matching].sort((a, b) => b.documentCount - a.documentCount || a.name.localeCompare(b.name))
      : matching;
  }, [tags, search, sortBy]);

  /** Labels that look like near-duplicates of each other, by loose name match. */
  const duplicateNames = useMemo(() => {
    const seen = new Map<string, number>();
    for (const t of tags) {
      const key = t.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return new Set(
      tags
        .filter((t) => (seen.get(t.name.toLowerCase().replace(/[^a-z0-9]/g, '')) ?? 0) > 1)
        .map((t) => t.id),
    );
  }, [tags]);
  const visible = filtered.slice(0, visibleCount);
  const hasMoreTags = filtered.length > visibleCount;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createTag(workspaceId, newName.trim(), newColor);
      setNewName('');
      setNewColor(PRESET_COLORS[0]);
      setShowNew(false);
      onChanged();
      toast.success(`Tag "${newName.trim()}" created.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tag.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmMerge() {
    if (!mergingTag || !mergeInto) return;
    setMerging(true);
    try {
      const survivor = await mergeTag(mergingTag.id, mergeInto);
      toast.success(`"${mergingTag.name}" merged into "${survivor.name}".`);
      setMergingTag(null);
      setMergeInto('');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to merge labels.');
    } finally {
      setMerging(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteTag(pendingDelete.id);
      toast.success(`Tag "${pendingDelete.name}" deleted.`);
      setPendingDelete(null);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete tag.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleSaveEdit(name: string, color: string) {
    if (!editingTag) return;
    setSaving(true);
    setError(null);
    try {
      await updateTag(editingTag.id, { name, color });
      setEditingTag(null);
      onChanged();
      toast.success('Tag updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tag.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="Tags"
      subtitle={`${tags.length} tag${tags.length !== 1 ? 's' : ''} in this workspace`}
      action={
        <button
          onClick={() => setShowNew(true)}
          className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
        >
          + New tag
        </button>
      }
    >
      {loading ? (
        <div className="py-6 text-center text-sm text-ink-3">Loading tags…</div>
      ) : (
        <>
          {/* Search */}
          {tags.length > 5 && (
            <div className="mb-4">
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none"
                  width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                >
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setVisibleCount(TAGS_PAGE_SIZE); }}
                  placeholder="Search tags…"
                  className="w-full h-9 rounded-lg border border-stroke bg-surface pl-8 pr-4 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          )}

          {tags.length > 1 && (
            <div className="flex items-center gap-3 mb-3 text-xs">
              <span className="text-ink-3">Sort by</span>
              <button
                type="button"
                onClick={() => setSortBy('name')}
                className={cn('font-semibold', sortBy === 'name' ? 'text-brand-600' : 'text-ink-3 hover:text-ink-2')}
              >
                name
              </button>
              <button
                type="button"
                onClick={() => setSortBy('usage')}
                className={cn('font-semibold', sortBy === 'usage' ? 'text-brand-600' : 'text-ink-3 hover:text-ink-2')}
              >
                most used
              </button>
              {duplicateNames.size > 0 && (
                <span className="ml-auto text-amber-700">
                  {duplicateNames.size} look like duplicates
                </span>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{error}</p>
          )}

          {/* New tag form */}
          {showNew && (
            <form onSubmit={handleCreate} className="flex items-center gap-2 pb-3 mb-3 border-b border-stroke">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Tag name"
                autoFocus
                className="flex-1 h-9 rounded-lg border border-stroke bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <div className="flex gap-1">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={cn(
                      'w-5 h-5 rounded-full transition-transform',
                      newColor === c ? 'scale-125 ring-2 ring-offset-1 ring-ink-3' : '',
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <button
                type="submit"
                disabled={saving || !newName.trim()}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white dark:bg-brand-400 dark:text-slate-900 rounded-lg hover:bg-slate-800 dark:hover:bg-brand-300 disabled:opacity-50"
              >
                {saving ? '…' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => setShowNew(false)}
                className="px-3 py-1.5 text-xs text-ink-3 hover:text-ink-2"
              >
                Cancel
              </button>
            </form>
          )}

          {/* Tag list */}
          {filtered.length === 0 ? (
            <p className="text-sm text-ink-3 py-4 text-center">
              {search ? 'No tags match your search.' : 'No tags yet. Create one to organize your documents.'}
            </p>
          ) : (
            <>
              <div className="divide-y divide-stroke-soft">
                {visible.map((tag) =>
                  editingTag?.id === tag.id ? (
                    <TagEditRow
                      key={tag.id}
                      tag={tag}
                      saving={saving}
                      onSave={handleSaveEdit}
                      onCancel={() => setEditingTag(null)}
                    />
                  ) : (
                    <div key={tag.id} className="flex items-center gap-3 py-2.5">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                        style={
                          tag.color
                            ? { backgroundColor: `${tag.color}20`, color: tag.color }
                            : { backgroundColor: '#f3f4f6', color: '#6b7280' }
                        }
                      >
                        {tag.color && (
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                        )}
                        {tag.name}
                      </span>
                      <span className="text-xs text-ink-3 tabular-nums whitespace-nowrap">
                        {tag.documentCount === 0
                          ? 'unused'
                          : `${tag.documentCount} document${tag.documentCount === 1 ? '' : 's'}`}
                      </span>
                      {duplicateNames.has(tag.id) && (
                        <span className="text-[10px] font-semibold text-amber-700 whitespace-nowrap">
                          possible duplicate
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          onClick={() => setEditingTag(tag)}
                          className="text-xs text-ink-3 hover:text-brand-600 transition-colors px-2 py-1"
                        >
                          Edit
                        </button>
                        {tags.length > 1 && (
                          <button
                            onClick={() => { setMergingTag(tag); setMergeInto(''); }}
                            className="text-xs text-ink-3 hover:text-brand-600 transition-colors px-2 py-1"
                          >
                            Merge
                          </button>
                        )}
                        <button
                          onClick={() => setPendingDelete(tag)}
                          className="text-xs text-ink-3 hover:text-red-600 transition-colors px-2 py-1"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>

              {/* Show more / less */}
              {hasMoreTags && (
                <button
                  onClick={() => setVisibleCount((c) => c + TAGS_PAGE_SIZE)}
                  className="mt-3 text-xs text-brand-600 hover:underline"
                >
                  Show {Math.min(TAGS_PAGE_SIZE, filtered.length - visibleCount)} more
                  <span className="text-ink-3 ml-1">({filtered.length - visibleCount} remaining)</span>
                </button>
              )}
              {!hasMoreTags && visibleCount > TAGS_PAGE_SIZE && (
                <button
                  onClick={() => setVisibleCount(TAGS_PAGE_SIZE)}
                  className="mt-3 text-xs text-ink-3 hover:text-ink-2 hover:underline"
                >
                  Show less
                </button>
              )}
            </>
          )}
        </>
      )}

      {mergingTag && (
        <MergeTagModal
          tag={mergingTag}
          others={tags.filter((t) => t.id !== mergingTag.id)}
          selected={mergeInto}
          onSelect={setMergeInto}
          merging={merging}
          onConfirm={confirmMerge}
          onClose={() => { if (!merging) { setMergingTag(null); setMergeInto(''); } }}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Delete tag"
          body={
            pendingDelete.documentCount === 0
              ? `"${pendingDelete.name}" is not on any document, so nothing else changes.`
              : `"${pendingDelete.name}" will be taken off ${pendingDelete.documentCount} document${pendingDelete.documentCount === 1 ? '' : 's'}. To keep those documents labelled, merge it into another label instead.`
          }
          confirmLabel="Delete Tag"
          danger
          loading={deleting}
          onConfirm={confirmDelete}
          onClose={() => { if (!deleting) setPendingDelete(null); }}
        />
      )}
    </SectionCard>
  );
}

/**
 * Fold one label into another. Every document carrying the old label ends up
 * carrying the kept one, so nothing loses its labelling in the process.
 */
function MergeTagModal({
  tag,
  others,
  selected,
  onSelect,
  merging,
  onConfirm,
  onClose,
}: {
  tag: Tag;
  others: Tag[];
  selected: string;
  onSelect: (id: string) => void;
  merging: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const matches = search.trim()
    ? others.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    : others;
  const target = others.find((t) => t.id === selected) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop">
      <div className="bg-surface border border-stroke rounded-xl shadow-xl w-full max-w-md mx-4 p-6 animate-in">
        <h2 className="text-base font-semibold text-ink">Merge &ldquo;{tag.name}&rdquo;</h2>
        <p className="mt-1 text-xs text-ink-2 leading-relaxed">
          Pick the label to keep. The {tag.documentCount} document
          {tag.documentCount === 1 ? '' : 's'} carrying &ldquo;{tag.name}&rdquo; will carry
          that one instead, and &ldquo;{tag.name}&rdquo; is deleted.
        </p>

        {others.length > 6 && (
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search labels…"
            className="mt-4 w-full h-9 rounded-lg border border-stroke bg-surface px-3 text-sm text-ink"
          />
        )}

        <div className="mt-3 max-h-56 overflow-y-auto divide-y divide-stroke-soft border border-stroke rounded-lg">
          {matches.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-ink-3">No other labels match.</p>
          ) : (
            matches.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
                  selected === t.id ? 'bg-brand-50' : 'hover:bg-surface-high',
                )}
              >
                <span
                  aria-hidden
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: t.color ?? '#94a3b8' }}
                />
                <span className="text-sm text-ink truncate">{t.name}</span>
                <span className="ml-auto text-xs text-ink-3 tabular-nums whitespace-nowrap">
                  {t.documentCount}
                </span>
              </button>
            ))
          )}
        </div>

        {target && (
          <p className="mt-3 text-xs text-ink-2">
            After merging, &ldquo;{target.name}&rdquo; will be on up to{' '}
            {target.documentCount + tag.documentCount} documents.
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={merging}
            className="px-4 py-2 text-sm font-medium text-ink-2 border border-stroke rounded-lg hover:bg-surface-high disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={merging || !selected}
            className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            {merging ? 'Merging…' : 'Merge'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Section: AI Configuration
// ------------------------------------------------------------------ //

function AiSection({
  account,
  loading,
  settings,
  canManage,
  providerMode,
  byokKey,
  showByokKey,
  saving,
  onProviderChange,
  onByokKeyChange,
  onToggleShowKey,
  onSubmit,
}: {
  loading: boolean;
  settings: AiSettings | null;
  account: AccountSummary | null;
  canManage: boolean;
  providerMode: 'PLATFORM' | 'BYOK';
  byokKey: string;
  showByokKey: boolean;
  saving: boolean;
  onProviderChange: (v: 'PLATFORM' | 'BYOK') => void;
  onByokKeyChange: (v: string) => void;
  onToggleShowKey: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <SectionCard title="AI Configuration" subtitle="Manage how DockyDoc AI processes your documents">
      <AiEngineStatus />
      {loading ? (
        <div className="py-6 text-center text-sm text-ink-3">Loading AI settings…</div>
      ) : settings === null ? (
        <div className="py-6 text-center text-sm text-ink-3">AI settings unavailable.</div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5 py-1">
          {/* Plan */}
          <div className="flex items-center justify-between py-2 border-b border-stroke-soft">
            <div>
              <p className="text-sm font-medium text-ink">Plan</p>
              <p className="text-xs text-ink-3 mt-0.5">
                {account?.planSource === 'complimentary' && account.planRenewsAt
                  ? `Complimentary until ${new Date(account.planRenewsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : 'The plan of the workspace owner covers everyone in it'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn(
                'text-xs font-semibold px-2.5 py-1 rounded-full',
                (account?.plan ?? settings.plan) === 'FREE' && 'bg-surface-high text-ink-2',
                (account?.plan ?? settings.plan) === 'PERSONAL' && 'bg-blue-100 text-blue-700',
                (account?.plan ?? settings.plan) === 'BUSINESS' && 'bg-brand-100 text-brand-700',
                (account?.plan ?? settings.plan) === 'TEAM' && 'bg-purple-100 text-purple-700',
                (account?.plan ?? settings.plan) === 'ENTERPRISE' && 'bg-purple-100 text-purple-700',
              )}>
                {account?.planName ?? settings.plan}
              </span>
              <Link href="/plans" className="text-xs font-semibold text-brand-600 hover:underline">See plans</Link>
            </div>
          </div>

          {/* Provider toggle */}
          <div>
            <p className="text-xs font-medium text-ink-3 mb-2">AI Provider</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onProviderChange('PLATFORM')}
                className={cn(
                  'rounded-xl border px-4 py-3 text-left text-sm transition-colors',
                  providerMode === 'PLATFORM'
                    ? 'border-brand-400 bg-brand-50 text-brand-800'
                    : 'border-stroke text-ink-2 hover:border-ink-3',
                )}
              >
                <div className="font-medium">DockyDoc AI</div>
                <div className="text-xs mt-0.5 opacity-70">Managed, usage tracked</div>
              </button>
              <button
                type="button"
                onClick={() => onProviderChange('BYOK')}
                className={cn(
                  'rounded-xl border px-4 py-3 text-left text-sm transition-colors',
                  providerMode === 'BYOK'
                    ? 'border-brand-400 bg-brand-50 text-brand-800'
                    : 'border-stroke text-ink-2 hover:border-ink-3',
                )}
              >
                <div className="font-medium">Bring Your Own Key</div>
                <div className="text-xs mt-0.5 opacity-70">Use your Anthropic API key</div>
              </button>
            </div>
          </div>

          {/* Platform usage meter: AI actions this period */}
          {providerMode === 'PLATFORM' && account && (() => {
            const included = account.usage.aiActionsIncluded;
            const unlimited = included >= 1_000_000_000;
            const pct = unlimited ? 0 : Math.min(100, Math.round((account.usage.aiActionsUsed / Math.max(1, included)) * 100));
            return (
              <div className="rounded-xl bg-surface-high border border-stroke p-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-ink-2">
                  <span>AI actions used this period</span>
                  <span className="font-semibold tabular-nums">
                    {account.usage.aiActionsUsed.toLocaleString()} / {limitLabel(included)}
                    {account.usage.aiCreditActions > 0 && <span className="text-ink-3 font-normal"> + {account.usage.aiCreditActions} extra</span>}
                  </span>
                </div>
                {!unlimited && (
                  <div className="w-full h-2 bg-stroke rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-brand-500')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
                <p className="text-[11px] text-ink-3">
                  One action reads one document (up to 20 pages), answers one assistant question, or serves one API request.
                  Resets {new Date(account.usage.periodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.
                  {' '}{account.usage.documents} of {limitLabel(account.limits.documents)} documents used.
                </p>
                {pct >= 90 && (
                  <p className="text-xs text-red-600">
                    Nearly out of AI actions. <Link href="/plans" className="underline">See plans</Link>.
                  </p>
                )}
              </div>
            );
          })()}

          {/* BYOK key input */}
          {providerMode === 'BYOK' && (
            <div className="space-y-2">
              {settings.hasApiKey && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <span>✓</span> API key saved. Enter a new key below to replace it.
                </p>
              )}
              <div className="relative">
                <input
                  type={showByokKey ? 'text' : 'password'}
                  value={byokKey}
                  onChange={(e) => onByokKeyChange(e.target.value)}
                  placeholder={settings.hasApiKey ? 'Enter new key to replace…' : 'sk-ant-…'}
                  className="w-full h-9 rounded-lg border border-stroke bg-surface px-3 pr-16 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
                <button
                  type="button"
                  onClick={onToggleShowKey}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-3 hover:text-ink-2"
                >
                  {showByokKey ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="text-xs text-ink-3">Keys are encrypted at rest. Never shared or logged.</p>
            </div>
          )}

          {canManage && (
            <div className="flex justify-end pt-1 border-t border-stroke-soft">
              <button
                type="submit"
                disabled={saving || (providerMode === 'BYOK' && !settings.hasApiKey && !byokKey.trim())}
                className="px-4 py-2 text-sm font-semibold bg-slate-900 text-white dark:bg-brand-400 dark:text-slate-900 rounded-xl hover:bg-slate-800 dark:hover:bg-brand-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : 'Save AI Settings'}
              </button>
            </div>
          )}
        </form>
      )}
    </SectionCard>
  );
}

/**
 * Live server-side status: is an AI key configured, and can scans be read?
 * This is separate from the workspace's plan and BYOK settings below.
 */
function AiEngineStatus() {
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [ocr, setOcr] = useState<AiOcrStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAiStatus(), fetchOcrStatus()])
      .then(([status, ocrStatus]) => {
        if (cancelled) return;
        setAiEnabled(status.enabled);
        setOcr(ocrStatus);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  if (failed) return null;

  const available = ocr?.providers.filter((p) => p.available) ?? [];

  return (
    <div className="mb-5 rounded-xl border border-stroke bg-surface-high p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink">AI engine</p>
          <p className="text-xs text-ink-3 mt-0.5">Whether the server can run AI at all</p>
        </div>
        <StatusPill
          ok={aiEnabled === true}
          pending={aiEnabled === null}
          okLabel="Running"
          offLabel="No key set"
        />
      </div>

      <div className="flex items-center justify-between pt-2.5 border-t border-stroke-soft">
        <div>
          <p className="text-sm font-medium text-ink">Scanned documents</p>
          <p className="text-xs text-ink-3 mt-0.5">
            {available.length > 0
              ? `Read by ${available.map((p) => p.name).join(', ')}`
              : 'Scans and photos cannot be read until an OCR provider is configured'}
          </p>
        </div>
        <StatusPill
          ok={ocr?.anyAvailable === true}
          pending={ocr === null}
          okLabel="Ready"
          offLabel="Not configured"
        />
      </div>

      {aiEnabled === true && (
        <Link href="/assistant" className="inline-block pt-1 text-xs font-semibold text-brand-600 hover:underline">
          Open the assistant
        </Link>
      )}
    </div>
  );
}

function StatusPill({
  ok,
  pending,
  okLabel,
  offLabel,
}: {
  ok: boolean;
  pending: boolean;
  okLabel: string;
  offLabel: string;
}) {
  if (pending) {
    return <span className="text-xs text-ink-3">Checking…</span>;
  }
  return (
    <span
      className={cn(
        'text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap',
        ok ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800',
      )}
    >
      {ok ? okLabel : offLabel}
    </span>
  );
}

// ------------------------------------------------------------------ //
// Placeholder sections
// ------------------------------------------------------------------ //

function RetentionSection() {
  return (
    <SectionCard title="Retention & Storage" subtitle="Configure document lifecycle and storage policies">
      <div className="space-y-0 divide-y divide-stroke-soft">
        <PlaceholderRow
          label="Auto-empty Trash"
          description="Automatically shred deleted documents after a set period"
        />
        <PlaceholderRow
          label="Document retention policy"
          description="Set default expiry rules for document types"
          last
        />
      </div>
    </SectionCard>
  );
}

function IntegrationsSection() {
  const toast = useToast();
  const { user } = useUser();
  const apiAllowed = user?.plan === 'BUSINESS' || user?.plan === 'TEAM' || user?.plan === 'ENTERPRISE';
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [canWrite, setCanWrite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justCreated, setJustCreated] = useState<CreatedApiKey | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<ApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://dockydoc.app';

  async function load() {
    try {
      setKeys(await fetchApiKeys());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load API keys.');
      setKeys([]);
    }
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const created = await createApiKey({ name: name.trim(), canWrite });
      setJustCreated(created);
      setName('');
      setCanWrite(false);
      setCreating(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the key.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke() {
    if (!pendingRevoke) return;
    setRevoking(true);
    try {
      await revokeApiKey(pendingRevoke.id);
      toast.success(`Key "${pendingRevoke.name}" revoked. Anything using it stops working now.`);
      setPendingRevoke(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not revoke the key.');
    } finally {
      setRevoking(false);
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied.`);
    } catch {
      toast.error('Could not copy. Select the text and copy it by hand.');
    }
  }

  return (
    <div className="space-y-6">
      {!apiAllowed && (
        <div className="rounded-xl border border-brand-500/40 bg-brand-500/5 px-4 py-3 text-sm text-ink">
          API keys, REST and MCP access are part of the <strong>Business</strong> plan and above. Keys already created stop working until the account is upgraded.{' '}
          <Link href="/plans" className="font-semibold text-brand-600 hover:underline">See plans</Link>
        </div>
      )}
      <SectionCard
        title="API keys"
        subtitle="Let other software act as you: a WhatsApp bot, an assistant, a script. Each key is you, with your workspaces."
        action={
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors"
          >
            + New key
          </button>
        }
      >
        {justCreated && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-400/40 p-4">
            <p className="text-sm font-semibold text-ink">Copy this key now. It will not be shown again.</p>
            <p className="text-xs text-ink-3 mt-0.5">For &ldquo;{justCreated.name}&rdquo;. If you lose it, revoke it and make a new one.</p>
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate rounded-lg bg-surface-high px-3 py-2 font-mono text-xs text-ink select-all">
                {justCreated.key}
              </code>
              <button
                type="button"
                onClick={() => copy(justCreated.key, 'Key')}
                className="px-3 py-2 rounded-lg border border-stroke text-xs font-semibold text-ink hover:bg-surface-high"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={() => setJustCreated(null)}
                className="px-3 py-2 rounded-lg text-xs font-semibold text-ink-3 hover:text-ink"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {creating && (
          <div className="mb-4 rounded-xl border border-stroke bg-surface-high p-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-ink-3 mb-1">What is this key for?</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
                placeholder="e.g. Clawdbot on WhatsApp"
                className="w-full rounded-lg border border-stroke bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3"
              />
            </div>
            <label className="flex items-start gap-2 text-sm text-ink cursor-pointer">
              <input type="checkbox" checked={canWrite} onChange={(e) => setCanWrite(e.target.checked)} className="mt-0.5" />
              <span>
                Allow uploads and changes
                <span className="block text-xs text-ink-3">Off means the key can only find and download documents. Leave it off unless the bot needs to save files.</span>
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setCreating(false); setName(''); }} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-ink-3 hover:text-ink">
                Cancel
              </button>
              <button
                type="button"
                disabled={!name.trim() || saving}
                onClick={() => void handleCreate()}
                className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? 'Creating…' : 'Create key'}
              </button>
            </div>
          </div>
        )}

        {keys === null ? (
          <p className="text-sm text-ink-3 py-4">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-ink-3 py-4">No keys yet. Create one to connect something.</p>
        ) : (
          <div>
            {keys.map((k, i) => (
              <div key={k.id} className={cn('flex items-center justify-between gap-4 py-3', i < keys.length - 1 && 'border-b border-stroke-soft')}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{k.name}</p>
                  <p className="text-xs text-ink-3 mt-0.5">
                    <code className="font-mono">{k.prefix}…</code>
                    {' · '}{k.canWrite ? 'read and write' : 'read only'}
                    {' · '}{k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : 'never used'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingRevoke(k)}
                  className="text-xs font-semibold text-red-600 hover:text-red-700 flex-shrink-0"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Connect" subtitle="Where to point the other software. Both use the key above as a Bearer token.">
        <ConnectRow label="REST base URL" value={`${origin}/api/v1/integrations`} onCopy={copy} />
        <ConnectRow label="MCP server URL" value={`${origin}/api/v1/mcp`} onCopy={copy} />
        <ConnectRow label="One-call fetch" value={`POST ${origin}/api/v1/integrations/fetch  {"query": "my passport and UK visa"}`} onCopy={copy} last />
        <p className="text-xs text-ink-3 mt-3">
          Full instructions, including the Clawdbot setup, are in <code className="font-mono">docs/integrations.md</code> in the repository.
        </p>
      </SectionCard>

      {pendingRevoke && (
        <ConfirmModal
          title="Revoke this key?"
          body={`"${pendingRevoke.name}" stops working immediately. Anything connected with it will be cut off until you give it a new key.`}
          confirmLabel="Revoke key"
          danger
          loading={revoking}
          onConfirm={() => void handleRevoke()}
          onClose={() => setPendingRevoke(null)}
        />
      )}
    </div>
  );
}

function ConnectRow({
  label,
  value,
  onCopy,
  last = false,
}: {
  label: string;
  value: string;
  onCopy: (text: string, what: string) => void;
  last?: boolean;
}) {
  return (
    <div className={cn('flex items-center gap-3 py-2.5', !last && 'border-b border-stroke-soft')}>
      <span className="text-xs font-medium text-ink-3 w-32 flex-shrink-0">{label}</span>
      <code className="flex-1 min-w-0 truncate font-mono text-xs text-ink">{value}</code>
      <button type="button" onClick={() => onCopy(value, label)} className="text-xs font-semibold text-brand-600 hover:underline flex-shrink-0">
        Copy
      </button>
    </div>
  );
}

function SecuritySection() {
  const toast = useToast();
  const { logout } = useUser();
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [blockers, setBlockers] = useState<DeletionBlocker[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      await downloadAccountExport();
      toast.success('Your export is downloading.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not export your data.');
    } finally {
      setExporting(false);
    }
  }

  async function openDelete() {
    setPhrase('');
    setConfirming(true);
    try {
      setBlockers(await fetchDeletionBlockers());
    } catch {
      setBlockers([]);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const r = await deleteAccount();
      toast.success(`Account deleted: ${r.deletedWorkspaces} workspace(s) and ${r.deletedDocuments} document(s) removed.`);
      setTimeout(() => logout(), 800);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the account.');
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Sign-in security" subtitle="Two-factor authentication, email addresses and signed-in devices">
        <div className="flex flex-wrap items-center justify-between gap-3 py-2">
          <p className="text-sm text-ink-2 max-w-xl">Turn on two-factor authentication with an authenticator app, change your email, and sign out other devices. Team workspace admins can require two-factor for every member.</p>
          <Link href="/account" className="h-9 px-3 inline-flex items-center rounded-lg border border-stroke text-sm font-semibold text-ink hover:bg-surface-high">Manage sign-in</Link>
        </div>
      </SectionCard>

      <SectionCard title="Your data" subtitle="Take a copy of everything DockyDoc holds about you">
        <div className="flex flex-wrap items-center justify-between gap-3 py-2">
          <p className="text-sm text-ink-2 max-w-xl">One JSON file with your profile, plan, workspaces, every document's details, dates, labels, AI-found fields, reminders, share links, API keys and your activity log. Document files download from the Documents page.</p>
          <button type="button" onClick={() => void handleExport()} disabled={exporting} className="h-9 px-3 rounded-lg border border-stroke text-sm font-semibold text-ink hover:bg-surface-high disabled:opacity-50">
            {exporting ? 'Preparing…' : 'Export my data'}
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Delete account" subtitle="Permanent, and done within minutes">
        <div className="flex flex-wrap items-center justify-between gap-3 py-2">
          <p className="text-sm text-ink-2 max-w-xl">Deletes your account, the workspaces you own and every document in them, your API keys and your sign-in. Workspaces where other people are members must be handed over first. There is no undo.</p>
          <button type="button" onClick={() => void openDelete()} className="h-9 px-3 rounded-lg border border-red-300 text-sm font-semibold text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30">Delete my account</button>
        </div>
      </SectionCard>

      {confirming && (
        <div role="dialog" aria-modal className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !deleting && setConfirming(false)}>
          <div className="w-full max-w-md rounded-2xl border border-stroke bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-ink">Delete your account?</h3>
            {blockers === null ? (
              <p className="mt-2 text-sm text-ink-3">Checking your workspaces…</p>
            ) : blockers.length > 0 ? (
              <div className="mt-2 text-sm text-ink-2">
                <p>These workspaces have other members. Hand them over (make someone else Owner) or remove the members first, so their documents are not deleted by your choice:</p>
                <ul className="mt-2 list-disc pl-5">{blockers.map((b) => <li key={b.workspaceId}>{b.name}: {b.otherMembers} other member{b.otherMembers === 1 ? '' : 's'}</li>)}</ul>
              </div>
            ) : (
              <>
                <p className="mt-2 text-sm text-ink-2">Everything you own is removed for good. Export your data first if you want a copy. Type <strong className="text-ink">DELETE</strong> to confirm.</p>
                <input value={phrase} onChange={(e) => setPhrase(e.target.value)} autoFocus className="mt-3 h-10 w-full rounded-lg border border-stroke bg-surface px-3 text-sm text-ink" placeholder="DELETE" />
              </>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} disabled={deleting} className="h-9 px-3 rounded-lg border border-stroke text-sm font-semibold text-ink">Cancel</button>
              {blockers !== null && blockers.length === 0 && (
                <button type="button" onClick={() => void handleDelete()} disabled={deleting || phrase !== 'DELETE'} className="h-9 px-3 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                  {deleting ? 'Deleting…' : 'Delete everything'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ //
// Shared components
// ------------------------------------------------------------------ //

function SectionCard({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-surface rounded-xl border border-stroke overflow-hidden">
      <div className="px-6 py-4 border-b border-stroke flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {subtitle && <p className="text-xs text-ink-3 mt-0.5">{subtitle}</p>}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      <div className="px-6 py-4">{children}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div className={cn('flex items-center py-2.5', !last && 'border-b border-stroke-soft')}>
      <span className="text-xs font-medium text-ink-3 w-36 flex-shrink-0">{label}</span>
      <span className="text-sm text-ink">{value}</span>
    </div>
  );
}

function PlaceholderRow({
  label,
  description,
  last = false,
}: {
  label: string;
  description: string;
  last?: boolean;
}) {
  return (
    <div className={cn('flex items-center justify-between py-3', !last && 'border-b border-stroke-soft')}>
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="text-xs text-ink-3 mt-0.5">{description}</p>
      </div>
      <span className="text-xs text-ink-3 bg-surface-high px-2 py-1 rounded-full flex-shrink-0 ml-4">
        Coming soon
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Tag edit row (reused from original)
// ------------------------------------------------------------------ //

function TagEditRow({
  tag,
  saving,
  onSave,
  onCancel,
}: {
  tag: Tag;
  saving: boolean;
  onSave: (name: string, color: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color ?? PRESET_COLORS[0]);

  return (
    <div className="flex items-center gap-2 py-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        className="flex-1 h-9 rounded-lg border border-stroke bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      <div className="flex gap-1">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={cn(
              'w-5 h-5 rounded-full transition-transform',
              color === c ? 'scale-125 ring-2 ring-offset-1 ring-ink-3' : '',
            )}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <button
        type="button"
        disabled={saving || !name.trim()}
        onClick={() => onSave(name.trim(), color)}
        className="px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white dark:bg-brand-400 dark:text-slate-900 rounded-lg hover:bg-slate-800 dark:hover:bg-brand-300 disabled:opacity-50"
      >
        {saving ? '…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="px-3 py-1.5 text-xs text-ink-3 hover:text-ink-2"
      >
        Cancel
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Page skeleton
// ------------------------------------------------------------------ //

function PageSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-7 w-28 bg-stroke rounded mb-2" />
      <div className="h-4 w-44 bg-surface-high rounded mb-6" />
      <div className="flex gap-6">
        <div className="w-44 flex-shrink-0">
          <div className="bg-surface-high rounded-xl h-64" />
        </div>
        <div className="flex-1 space-y-4">
          <div className="bg-surface-high rounded-xl h-40" />
          <div className="bg-surface-high rounded-xl h-28" />
        </div>
      </div>
    </div>
  );
}
