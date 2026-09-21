'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { createFolder, createTag, uploadDocument } from '@/lib/documents';
import { ApiError } from '@/lib/api';
import type { FolderListItem, Tag } from '@/types';

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const CONCURRENCY = 3;
const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.zip,.json';
const ACCEPTED_EXT = new Set(ACCEPT.split(',').map((e) => e.slice(1)));

type RowStatus = 'queued' | 'uploading' | 'done' | 'failed' | 'skipped';

interface Row {
  key: string;
  file: File;
  name: string;
  /** Sub-folder path when a folder was dropped, e.g. "2025/Insurance". */
  relativeDir: string;
  status: RowStatus;
  error?: string;
}

/**
 * Reads every file out of a drop, walking into dropped folders. Falls back
 * to the plain file list where the browser has no directory support.
 */
export async function collectDroppedFiles(dt: DataTransfer): Promise<{ file: File; relativeDir: string }[]> {
  const out: { file: File; relativeDir: string }[] = [];
  const items = Array.from(dt.items ?? []);
  const entries = items.map((i) => (typeof i.webkitGetAsEntry === 'function' ? i.webkitGetAsEntry() : null));
  if (entries.length === 0 || entries.every((e) => e === null)) {
    for (const f of Array.from(dt.files)) out.push({ file: f, relativeDir: '' });
    return out;
  }
  async function walk(entry: FileSystemEntry, dir: string): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      out.push({ file, relativeDir: dir });
      return;
    }
    if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const nextDir = dir ? `${dir}/${entry.name}` : entry.name;
      // readEntries returns in batches; keep calling until it returns none.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (batch.length === 0) break;
        for (const child of batch) await walk(child, nextDir);
      }
    }
  }
  for (const e of entries) if (e) await walk(e, '');
  return out;
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

function ext(name: string): string {
  return (name.split('.').pop() ?? '').toLowerCase();
}

function human(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Many files in one go. Shared folder and labels; a name per file that can
 * be edited before starting; three uploads in flight at a time; a clear
 * line per file when something is refused; retry for the failures.
 */
export default function BulkUploadModal({
  workspaceId,
  folders,
  tags,
  defaultFolderId,
  initialFiles,
  onClose,
  onDone,
}: {
  workspaceId: string;
  folders: FolderListItem[];
  tags: Tag[];
  defaultFolderId?: string;
  initialFiles?: { file: File; relativeDir: string }[];
  onClose: () => void;
  /** Called when the run finishes with at least one upload. */
  onDone: (uploaded: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>(() => toRows(initialFiles ?? []));
  const [folderId, setFolderId] = useState(defaultFolderId ?? '');
  const [keepFolders, setKeepFolders] = useState(true);
  const [pickedTagIds, setPickedTagIds] = useState<string[]>([]);
  const [newTagNames, setNewTagNames] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [stopReason, setStopReason] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const cancelRef = useRef(false);

  const hasDirs = rows.some((r) => r.relativeDir);
  const folderChoices = flatten(folders);
  const queued = rows.filter((r) => r.status === 'queued').length;
  const done = rows.filter((r) => r.status === 'done').length;
  const failed = rows.filter((r) => r.status === 'failed').length;
  const skipped = rows.filter((r) => r.status === 'skipped').length;
  const totalBytes = rows.reduce((s, r) => s + r.file.size, 0);

  useEffect(() => {
    if (finished && done > 0) onDone(done);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  function addFiles(list: { file: File; relativeDir: string }[]) {
    setRows((prev) => {
      const seen = new Set(prev.map((r) => `${r.relativeDir}/${r.file.name}/${r.file.size}`));
      const fresh = toRows(list).filter((r) => !seen.has(`${r.relativeDir}/${r.file.name}/${r.file.size}`));
      return [...prev, ...fresh];
    });
  }

  function addTagDraft() {
    const trimmed = tagDraft.trim();
    if (!trimmed) return;
    const existing = tags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) setPickedTagIds((p) => (p.includes(existing.id) ? p : [...p, existing.id]));
    else if (!newTagNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) setNewTagNames((p) => [...p, trimmed]);
    setTagDraft('');
  }

  async function start() {
    if (running) return;
    const todo = rows.filter((r) => r.status === 'queued' || r.status === 'failed');
    if (todo.length === 0) return;
    setRunning(true);
    setFinished(false);
    setStopReason(null);
    cancelRef.current = false;

    // Labels typed but not created yet.
    const tagIds = [...pickedTagIds];
    for (const label of newTagNames) {
      try { tagIds.push((await createTag(workspaceId, label)).id); } catch { /* a label must not sink the run */ }
    }
    setNewTagNames([]);
    setPickedTagIds(tagIds);

    // Sub-folders from a dropped folder, created once each under the chosen folder.
    const folderCache = new Map<string, string>();
    async function folderFor(relativeDir: string): Promise<string | undefined> {
      if (!keepFolders || !relativeDir) return folderId || undefined;
      if (folderCache.has(relativeDir)) return folderCache.get(relativeDir);
      const parts = relativeDir.split('/');
      let parentId: string | undefined = folderId || undefined;
      let path = '';
      for (const part of parts) {
        path = path ? `${path}/${part}` : part;
        if (folderCache.has(path)) { parentId = folderCache.get(path); continue; }
        const existing = folders.find((f) => f.name === part && (f.parentFolderId ?? undefined) === parentId);
        const id: string = existing ? existing.id : (await createFolder({ workspaceId, name: part, parentFolderId: parentId })).id;
        folderCache.set(path, id);
        parentId = id;
      }
      return parentId;
    }

    const pending = [...todo];
    let stopped = false;
    setRows((prev) => prev.map((r) => (todo.some((t) => t.key === r.key) ? { ...r, status: 'queued', error: undefined } : r)));

    async function worker() {
      while (pending.length > 0 && !stopped && !cancelRef.current) {
        const row = pending.shift()!;
        setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, status: 'uploading' } : r)));
        try {
          const target = await folderFor(row.relativeDir);
          await uploadDocument({ workspaceId, name: row.name.trim() || stripExt(row.file.name), file: row.file, folderId: target, tags: tagIds });
          setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, status: 'done' } : r)));
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Upload failed.';
          setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, status: 'failed', error: msg } : r)));
          // Out of room on the plan: no point trying the rest.
          if (err instanceof ApiError && err.status === 402) {
            stopped = true;
            setStopReason(msg);
          }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
    if (stopped || cancelRef.current) {
      setRows((prev) => prev.map((r) => (r.status === 'queued' ? { ...r, status: 'skipped', error: cancelRef.current ? 'Stopped' : 'Not tried: the plan is out of room' } : r)));
    }
    setRunning(false);
    setFinished(true);
  }

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !running) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop" onClick={handleBackdrop}>
      <div className="bg-surface border border-stroke rounded-2xl shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col animate-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stroke-soft">
          <div>
            <h2 className="text-base font-semibold text-ink">Upload many documents</h2>
            <p className="text-xs text-ink-3 mt-0.5">Drop files or a whole folder. Each file becomes one document; the AI reads them in turn.</p>
          </div>
          <button type="button" onClick={onClose} disabled={running} className="text-ink-3 hover:text-ink-2 disabled:opacity-40" aria-label="Close">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          {/* Drop zone */}
          {!finished && (
            <div
              onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true); } }}
              onDragLeave={() => setDragOver(false)}
              onDrop={async (e) => { e.preventDefault(); setDragOver(false); addFiles(await collectDroppedFiles(e.dataTransfer)); }}
              onClick={() => !running && inputRef.current?.click()}
              className={cn('border-2 border-dashed rounded-xl px-4 py-5 text-center cursor-pointer transition-colors', dragOver ? 'border-brand-500 bg-brand-50' : 'border-stroke hover:border-brand-400/60')}
            >
              <p className="text-sm text-ink-2">Drop files or a folder here, or click to choose files</p>
              <p className="text-xs text-ink-3 mt-1">PDF, Word, Excel, PowerPoint, images, text. Up to 50 MB each.</p>
              <input ref={inputRef} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => { addFiles(Array.from(e.target.files ?? []).map((file) => ({ file, relativeDir: '' }))); e.target.value = ''; }} />
            </div>
          )}

          {/* Shared settings */}
          {!finished && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1.5">Put them in</label>
                <select value={folderId} onChange={(e) => setFolderId(e.target.value)} disabled={running} className="w-full rounded-lg border border-stroke bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">Top level</option>
                  {folderChoices.map((f) => <option key={f.id} value={f.id}>{f.path}</option>)}
                </select>
                {hasDirs && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-ink-2">
                    <input type="checkbox" checked={keepFolders} onChange={(e) => setKeepFolders(e.target.checked)} disabled={running} />
                    Keep the dropped folder structure as sub-folders
                  </label>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1.5">Labels for all of them</label>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {pickedTagIds.map((id) => { const t = tags.find((x) => x.id === id); return t ? <Chip key={id} onRemove={() => setPickedTagIds((p) => p.filter((x) => x !== id))}>{t.name}</Chip> : null; })}
                  {newTagNames.map((n) => <Chip key={n} onRemove={() => setNewTagNames((p) => p.filter((x) => x !== n))}>{n} (new)</Chip>)}
                </div>
                <input
                  type="text"
                  value={tagDraft}
                  disabled={running}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTagDraft(); } }}
                  placeholder="Type a label and press Enter"
                  list="bulk-tag-options"
                  className="w-full rounded-lg border border-stroke bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <datalist id="bulk-tag-options">{tags.map((t) => <option key={t.id} value={t.name} />)}</datalist>
              </div>
            </div>
          )}

          {/* Rows */}
          {rows.length > 0 && (
            <div className="rounded-xl border border-stroke divide-y divide-stroke-soft">
              {rows.map((r) => (
                <div key={r.key} className="flex items-center gap-3 px-3 py-2">
                  <StatusDot status={r.status} />
                  <div className="flex-1 min-w-0">
                    {r.status === 'queued' && !running ? (
                      <input
                        type="text"
                        value={r.name}
                        onChange={(e) => setRows((prev) => prev.map((x) => (x.key === r.key ? { ...x, name: e.target.value } : x)))}
                        className="w-full bg-transparent text-sm text-ink border-b border-transparent focus:border-brand-500 focus:outline-none"
                      />
                    ) : (
                      <p className="text-sm text-ink truncate">{r.name}</p>
                    )}
                    <p className="text-[11px] text-ink-3 truncate">
                      {r.relativeDir ? `${r.relativeDir}/` : ''}{r.file.name} · {human(r.file.size)}
                      {r.error && <span className="text-red-600"> · {r.error}</span>}
                    </p>
                  </div>
                  {r.status === 'queued' && !running && (
                    <button type="button" onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))} className="text-ink-3 hover:text-red-600 text-xs" aria-label="Remove">Remove</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {stopReason && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{stopReason}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-stroke-soft">
          <p className="text-xs text-ink-3">
            {rows.length === 0 ? 'No files yet.' : finished
              ? `${done} uploaded${failed ? `, ${failed} failed` : ''}${skipped ? `, ${skipped} skipped` : ''}.`
              : running
                ? `Uploading… ${done} of ${rows.length} done.`
                : `${rows.length} file${rows.length === 1 ? '' : 's'}, ${human(totalBytes)} in total.`}
          </p>
          <div className="flex items-center gap-2">
            {running ? (
              <button type="button" onClick={() => { cancelRef.current = true; }} className="h-9 px-4 rounded-lg border border-stroke text-sm font-medium text-ink-2 hover:bg-surface-high">Stop after current</button>
            ) : finished ? (
              <>
                {failed > 0 && <button type="button" onClick={start} className="h-9 px-4 rounded-lg border border-stroke text-sm font-medium text-ink-2 hover:bg-surface-high">Retry failed</button>}
                <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700">Done</button>
              </>
            ) : (
              <>
                <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-stroke text-sm font-medium text-ink-2 hover:bg-surface-high">Cancel</button>
                <button type="button" onClick={start} disabled={queued === 0} className="h-9 px-4 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50">
                  Upload {queued > 0 ? queued : ''} {queued === 1 ? 'file' : 'files'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function toRows(list: { file: File; relativeDir: string }[]): Row[] {
  return list.map(({ file, relativeDir }, i) => {
    const e = ext(file.name);
    let status: RowStatus = 'queued';
    let error: string | undefined;
    if (!ACCEPTED_EXT.has(e)) { status = 'skipped'; error = 'File type not supported'; }
    else if (file.size === 0) { status = 'skipped'; error = 'Empty file'; }
    else if (file.size > MAX_UPLOAD_BYTES) { status = 'skipped'; error = 'Over 50 MB'; }
    return { key: `${Date.now()}-${i}-${relativeDir}/${file.name}`, file, name: stripExt(file.name), relativeDir, status, error };
  });
}

function flatten(folders: FolderListItem[]): { id: string; path: string }[] {
  const byParent = new Map<string | null, FolderListItem[]>();
  for (const f of folders) {
    const k = f.parentFolderId ?? null;
    byParent.set(k, [...(byParent.get(k) ?? []), f]);
  }
  const out: { id: string; path: string }[] = [];
  const walk = (parent: string | null, prefix: string) => {
    for (const f of (byParent.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = prefix ? `${prefix} / ${f.name}` : f.name;
      out.push({ id: f.id, path });
      walk(f.id, path);
    }
  };
  walk(null, '');
  return out;
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-high px-2 py-0.5 text-xs text-ink-2">
      {children}
      <button type="button" onClick={onRemove} className="text-ink-3 hover:text-ink" aria-label="Remove label">×</button>
    </span>
  );
}

function StatusDot({ status }: { status: RowStatus }) {
  const cls = status === 'done' ? 'bg-green-500' : status === 'failed' ? 'bg-red-500' : status === 'uploading' ? 'bg-brand-500 animate-pulse' : status === 'skipped' ? 'bg-stroke' : 'bg-amber-400';
  return <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', cls)} title={status} />;
}
