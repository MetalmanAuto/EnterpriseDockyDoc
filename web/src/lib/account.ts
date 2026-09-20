/**
 * Data export and account deletion, the two things a person can do
 * without asking us.
 */
import { apiFetch } from './api';

export interface DeletionBlocker {
  workspaceId: string;
  name: string;
  otherMembers: number;
}

/** Fetch the export and hand it to the browser as a JSON download. */
export async function downloadAccountExport(): Promise<void> {
  const data = await apiFetch<unknown>('/api/v1/account/export');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dockydoc-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function fetchDeletionBlockers(): Promise<DeletionBlocker[]> {
  return apiFetch<DeletionBlocker[]>('/api/v1/account/deletion-blockers');
}

export function deleteAccount(): Promise<{ deletedWorkspaces: number; deletedDocuments: number }> {
  return apiFetch('/api/v1/account', { method: 'DELETE', body: JSON.stringify({ confirm: 'DELETE' }) });
}
