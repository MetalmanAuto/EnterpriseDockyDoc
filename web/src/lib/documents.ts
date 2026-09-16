/**
 * Document, Folder, and Tag API helpers.
 * All calls go through apiFetch / apiUpload / apiDownload which handle auth headers centrally.
 */
import { apiFetch, apiUpload, apiDownload } from './api';
import type {
  AcceptInvitationResponse,
  DocumentDetail,
  DocumentListItem,
  DocumentReminder,
  DocumentStatus,
  ExpiringDocument,
  FolderListItem,
  PublicInvitation,
  SearchResult,
  SetRemindersPayload,
  Tag,
  UpcomingReminder,
  WorkspaceDetail,
  WorkspaceInvitation,
  WorkspaceListItem,
  WorkspaceMember,
  WorkspaceSummary,
  WorkspaceUserRole,
} from '@/types';

// ------------------------------------------------------------------ //
// Folders
// ------------------------------------------------------------------ //

export function fetchFolders(workspaceId: string): Promise<FolderListItem[]> {
  return apiFetch<FolderListItem[]>(
    `/api/v1/folders?workspaceId=${encodeURIComponent(workspaceId)}`,
  );
}

export function fetchFolder(id: string): Promise<FolderListItem> {
  return apiFetch<FolderListItem>(`/api/v1/folders/${id}`);
}

export function createFolder(params: {
  workspaceId: string;
  name: string;
  parentFolderId?: string;
}): Promise<FolderListItem> {
  return apiFetch<FolderListItem>('/api/v1/folders', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function renameFolder(id: string, name: string): Promise<FolderListItem> {
  return apiFetch<FolderListItem>(`/api/v1/folders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

/**
 * Rename and/or move a folder. Pass parentFolderId: null for the top level,
 * or leave it out to keep the folder where it is.
 */
export function updateFolder(
  id: string,
  params: { name?: string; parentFolderId?: string | null },
): Promise<FolderListItem> {
  return apiFetch<FolderListItem>(`/api/v1/folders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(params),
  });
}

export function moveFolder(id: string, parentFolderId: string | null): Promise<FolderListItem> {
  return updateFolder(id, { parentFolderId });
}

export function deleteFolder(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/folders/${id}`, { method: 'DELETE' });
}

export function fetchDeletedFolders(workspaceId: string): Promise<FolderListItem[]> {
  return apiFetch<FolderListItem[]>(
    `/api/v1/folders?workspaceId=${encodeURIComponent(workspaceId)}&deleted=true`,
  );
}

export function restoreFolder(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/folders/${id}/restore`, { method: 'POST' });
}

// ------------------------------------------------------------------ //
// Documents — list & detail
// ------------------------------------------------------------------ //

export interface FetchDocumentsParams {
  workspaceId: string;
  folderId?: string;
  status?: string;
  ownerUserId?: string;
  /** Only documents carrying every one of these labels. */
  tagIds?: string[];
}

export function fetchDocuments(params: FetchDocumentsParams): Promise<DocumentListItem[]> {
  const qs = new URLSearchParams({ workspaceId: params.workspaceId });
  if (params.folderId) qs.set('folderId', params.folderId);
  if (params.status) qs.set('status', params.status);
  if (params.ownerUserId) qs.set('ownerUserId', params.ownerUserId);
  if (params.tagIds && params.tagIds.length > 0) qs.set('tagIds', params.tagIds.join(','));
  return apiFetch<DocumentListItem[]>(`/api/v1/documents?${qs.toString()}`);
}

export function fetchDocument(id: string): Promise<DocumentDetail> {
  return apiFetch<DocumentDetail>(`/api/v1/documents/${id}`);
}

export interface UpdateDocumentParams {
  name?: string;
  description?: string;
  folderId?: string | null;
  status?: DocumentStatus;
  expiryDate?: string | null;
  renewalDueDate?: string | null;
  isReminderEnabled?: boolean;
}

export function snoozeDocumentReminders(id: string, days: number): Promise<DocumentListItem> {
  return apiFetch<DocumentListItem>(`/api/v1/documents/${id}/reminders/snooze`, {
    method: 'POST',
    body: JSON.stringify({ days }),
  });
}

export function unsnoozeDocumentReminders(id: string): Promise<DocumentListItem> {
  return apiFetch<DocumentListItem>(`/api/v1/documents/${id}/reminders/snooze`, { method: 'DELETE' });
}

export function updateDocument(id: string, params: UpdateDocumentParams): Promise<DocumentDetail> {
  return apiFetch<DocumentDetail>(`/api/v1/documents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(params),
  });
}

export function deleteDocument(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/documents/${id}`, { method: 'DELETE' });
}

export function shredDocument(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/documents/${id}/shred`, { method: 'POST' });
}

// ------------------------------------------------------------------ //
// Documents — upload
// ------------------------------------------------------------------ //

export interface UploadDocumentParams {
  workspaceId: string;
  name: string;
  file: File;
  description?: string;
  folderId?: string;
  tags?: string[];   // tag IDs
  metadata?: { key: string; value: string }[];
}

/**
 * Upload a new document with file binary.
 * Sends multipart/form-data to POST /api/v1/documents/upload.
 */
export function uploadDocument(params: UploadDocumentParams): Promise<DocumentDetail> {
  const form = new FormData();
  form.append('file', params.file);
  form.append('workspaceId', params.workspaceId);
  form.append('name', params.name);
  if (params.description) form.append('description', params.description);
  if (params.folderId) form.append('folderId', params.folderId);
  if (params.tags?.length) form.append('tags', params.tags.join(','));
  if (params.metadata?.length) form.append('metadata', JSON.stringify(params.metadata));

  return apiUpload<DocumentDetail>('/api/v1/documents/upload', form);
}

/**
 * Upload a new version of an existing document.
 * Sends multipart/form-data to POST /api/v1/documents/:id/versions.
 */
export function uploadDocumentVersion(
  documentId: string,
  file: File,
  notes?: string,
): Promise<DocumentDetail> {
  const form = new FormData();
  form.append('file', file);
  if (notes) form.append('notes', notes);

  return apiUpload<DocumentDetail>(`/api/v1/documents/${documentId}/versions`, form);
}

// ------------------------------------------------------------------ //
// Documents — download
// ------------------------------------------------------------------ //

/**
 * Download the latest version of a document.
 * Triggers a browser file download.
 */
export function downloadDocument(documentId: string, fileName: string): Promise<void> {
  return apiDownload(`/api/v1/documents/${documentId}/download`, fileName);
}

/**
 * Delete a specific version of a document.
 * Cannot delete the only version — delete the document instead.
 */
export function deleteDocumentVersion(
  documentId: string,
  versionNumber: number,
): Promise<import('@/types').DocumentDetail> {
  return apiFetch<import('@/types').DocumentDetail>(
    `/api/v1/documents/${documentId}/versions/${versionNumber}`,
    { method: 'DELETE' },
  );
}

/**
 * Download a specific version of a document.
 * Triggers a browser file download.
 */
export function downloadDocumentVersion(
  documentId: string,
  versionNumber: number,
  fileName: string,
): Promise<void> {
  return apiDownload(
    `/api/v1/documents/${documentId}/versions/${versionNumber}/download`,
    fileName,
  );
}

// ------------------------------------------------------------------ //
// Documents — metadata
// ------------------------------------------------------------------ //

export function setDocumentMetadata(
  documentId: string,
  entries: { key: string; value: string }[],
): Promise<{ id: string; key: string; value: string }[]> {
  return apiFetch<{ id: string; key: string; value: string }[]>(
    `/api/v1/documents/${documentId}/metadata`,
    {
      method: 'PUT',
      body: JSON.stringify({ entries }),
    },
  );
}

// ------------------------------------------------------------------ //
// Search
// ------------------------------------------------------------------ //

export interface SearchParams {
  workspaceId: string;
  q: string;
  folderId?: string;
  status?: string;
}

export function searchDocuments(params: SearchParams): Promise<SearchResult[]> {
  const qs = new URLSearchParams({ workspaceId: params.workspaceId, q: params.q });
  if (params.folderId) qs.set('folderId', params.folderId);
  if (params.status) qs.set('status', params.status);
  return apiFetch<SearchResult[]>(`/api/v1/search?${qs.toString()}`);
}

// ------------------------------------------------------------------ //
// Tags
// ------------------------------------------------------------------ //

export function fetchTags(workspaceId: string): Promise<Tag[]> {
  return apiFetch<Tag[]>(
    `/api/v1/tags?workspaceId=${encodeURIComponent(workspaceId)}`,
  );
}

export function createTag(workspaceId: string, name: string, color?: string): Promise<Tag> {
  return apiFetch<Tag>('/api/v1/tags', {
    method: 'POST',
    body: JSON.stringify({ workspaceId, name, color }),
  });
}

export function updateTag(id: string, params: { name?: string; color?: string | null }): Promise<Tag> {
  return apiFetch<Tag>(`/api/v1/tags/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(params),
  });
}

export function deleteTag(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/tags/${id}`, { method: 'DELETE' });
}

/** Fold one label into another. The source label is deleted. */
export function mergeTag(id: string, intoTagId: string): Promise<Tag> {
  return apiFetch<Tag>(`/api/v1/tags/${id}/merge`, {
    method: 'POST',
    body: JSON.stringify({ intoTagId }),
  });
}

export interface BulkResult {
  updated: number;
  skipped: string[];
}

export function bulkMoveDocuments(
  documentIds: string[],
  folderId: string | null,
): Promise<BulkResult> {
  return apiFetch<BulkResult>('/api/v1/documents/bulk/move', {
    method: 'POST',
    body: JSON.stringify({ documentIds, folderId }),
  });
}

export function bulkTagDocuments(
  documentIds: string[],
  tagIds: string[],
  action: 'add' | 'remove',
): Promise<BulkResult> {
  return apiFetch<BulkResult>('/api/v1/documents/bulk/tags', {
    method: 'POST',
    body: JSON.stringify({ documentIds, tagIds, action }),
  });
}

export function setDocumentTags(documentId: string, tagIds: string[]): Promise<Tag[]> {
  return apiFetch<Tag[]>(`/api/v1/documents/${documentId}/tags`, {
    method: 'PUT',
    body: JSON.stringify({ tagIds }),
  });
}

// ------------------------------------------------------------------ //
// Workspaces — detail + member management
// ------------------------------------------------------------------ //

export function fetchWorkspaceDetail(workspaceId: string): Promise<WorkspaceDetail> {
  return apiFetch<WorkspaceDetail>(`/api/v1/workspaces/${workspaceId}`);
}

export function fetchWorkspaceSummary(workspaceId: string): Promise<WorkspaceSummary> {
  return apiFetch<WorkspaceSummary>(`/api/v1/workspaces/${workspaceId}/summary`);
}

export function removeWorkspaceMember(workspaceId: string, memberId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/workspaces/${workspaceId}/members/${memberId}`, {
    method: 'DELETE',
  });
}

export interface AddMemberParams {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

export function addWorkspaceMember(
  workspaceId: string,
  params: AddMemberParams,
): Promise<WorkspaceMember> {
  return apiFetch<WorkspaceMember>(`/api/v1/workspaces/${workspaceId}/members`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function updateWorkspaceMember(
  workspaceId: string,
  memberId: string,
  params: { role?: string; status?: string; firstName?: string; lastName?: string; email?: string },
): Promise<WorkspaceMember> {
  return apiFetch<WorkspaceMember>(
    `/api/v1/workspaces/${workspaceId}/members/${memberId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(params),
    },
  );
}

export function renameWorkspace(workspaceId: string, name: string): Promise<WorkspaceListItem> {
  return apiFetch<WorkspaceListItem>(`/api/v1/workspaces/${workspaceId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

// ------------------------------------------------------------------ //
// Invitations
// ------------------------------------------------------------------ //

export function createInvitation(
  workspaceId: string,
  params: { email: string; role?: WorkspaceUserRole },
): Promise<WorkspaceInvitation> {
  return apiFetch<WorkspaceInvitation>(`/api/v1/workspaces/${workspaceId}/invitations`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function listInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
  return apiFetch<WorkspaceInvitation[]>(`/api/v1/workspaces/${workspaceId}/invitations`);
}

export function revokeInvitation(workspaceId: string, inviteId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/workspaces/${workspaceId}/invitations/${inviteId}`, {
    method: 'DELETE',
  });
}

/** Public — fetches invite details without authentication */
export function getPublicInvitation(token: string): Promise<PublicInvitation> {
  return apiFetch<PublicInvitation>(`/api/v1/join/${token}`);
}

/** Requires auth — accepts the invitation and joins the workspace */
export function acceptInvitation(token: string): Promise<AcceptInvitationResponse> {
  return apiFetch<AcceptInvitationResponse>(`/api/v1/join/${token}`, { method: 'POST' });
}

// ------------------------------------------------------------------ //
// Reminders
// ------------------------------------------------------------------ //

export function fetchDocumentReminders(documentId: string): Promise<DocumentReminder[]> {
  return apiFetch<DocumentReminder[]>(`/api/v1/documents/${documentId}/reminders`);
}

export function setDocumentReminders(
  documentId: string,
  payload: SetRemindersPayload,
): Promise<DocumentReminder[]> {
  return apiFetch<DocumentReminder[]>(`/api/v1/documents/${documentId}/reminders`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function fetchExpiringDocuments(workspaceId: string, days?: number): Promise<ExpiringDocument[]> {
  const params = new URLSearchParams({ workspaceId });
  if (days) params.set('days', String(days));
  return apiFetch<ExpiringDocument[]>(`/api/v1/reminders/expiring?${params.toString()}`);
}

export function fetchWorkspaceReminders(workspaceId: string): Promise<UpcomingReminder[]> {
  return apiFetch<UpcomingReminder[]>(
    `/api/v1/reminders?workspaceId=${encodeURIComponent(workspaceId)}`,
  );
}

export function sendTestReminderEmail(
  workspaceId: string,
): Promise<{ delivered: boolean; to: string }> {
  return apiFetch<{ delivered: boolean; to: string }>(
    `/api/v1/reminders/test-email?workspaceId=${encodeURIComponent(workspaceId)}`,
    { method: 'POST' },
  );
}

// ------------------------------------------------------------------ //
// AI Settings
// ------------------------------------------------------------------ //

export interface AiSettings {
  plan: string;
  aiProvider: 'PLATFORM' | 'BYOK';
  aiProviderType: 'ANTHROPIC' | 'OPENAI';
  hasApiKey: boolean;
  aiUsageTokens: number;
  aiUsageLimit: number;
  aiUsagePercent: number;
}

export async function fetchAiSettings(workspaceId: string): Promise<AiSettings> {
  return apiFetch<AiSettings>(`/api/v1/workspaces/${workspaceId}/ai-settings`);
}

export async function updateAiSettings(
  workspaceId: string,
  data: { aiProvider?: string; aiProviderType?: string; apiKey?: string },
): Promise<AiSettings> {
  return apiFetch<AiSettings>(`/api/v1/workspaces/${workspaceId}/ai-settings`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
