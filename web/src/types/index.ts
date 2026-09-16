/**
 * Shared TypeScript types used across the web app.
 * Keep in sync with NestJS DTOs in api/src/modules/<module>/dto/
 */

// ================================================================== //
// Enums (mirrored from Prisma)
// ================================================================== //

export type WorkspaceType = 'PERSONAL' | 'FAMILY' | 'ENTERPRISE';
export type WorkspaceUserRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
export type WorkspaceUserStatus = 'ACTIVE' | 'INVITED' | 'REMOVED';
export type WorkspaceStatus = 'ACTIVE' | 'INACTIVE';
export type DocumentStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED';
export type ReminderChannel = 'IN_APP' | 'EMAIL';
export type ReminderStatus = 'PENDING' | 'SENT' | 'CANCELLED' | 'FAILED';
export type ShareType = 'INTERNAL' | 'EXTERNAL_LINK';
export type SharePermission = 'VIEW' | 'DOWNLOAD';
export type AuditAction =
  | 'DOCUMENT_CREATED'
  | 'DOCUMENT_UPDATED'
  | 'DOCUMENT_DELETED'
  | 'DOCUMENT_SHREDDED'
  | 'DOCUMENT_VERSION_ADDED'
  | 'DOCUMENT_DOWNLOADED'
  | 'DOCUMENT_SHARED_INTERNAL'
  | 'DOCUMENT_SHARED_EXTERNAL'
  | 'SHARE_REVOKED'
  | 'REMINDER_CREATED'
  | 'REMINDER_UPDATED'
  | 'REMINDER_SENT'
  | 'MEMBER_ADDED'
  | 'MEMBER_ROLE_UPDATED';
export type AuditEntityType =
  | 'DOCUMENT'
  | 'DOCUMENT_VERSION'
  | 'SHARE'
  | 'REMINDER'
  | 'USER'
  | 'WORKSPACE';

// ================================================================== //
// Audit Logs
// ================================================================== //

export interface AuditUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface AuditLog {
  id: string;
  workspaceId: string;
  userId: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: AuditUser | null;
}

// ================================================================== //
// Sharing
// ================================================================== //

export interface ShareUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface InternalShare {
  id: string;
  shareId: string;
  sharedWith: ShareUser;
  permission: SharePermission;
  createdAt: string;
}

export interface ExternalShare {
  id: string;
  token: string;
  expiresAt: string | null;
  allowDownload: boolean;
  hasPassword: boolean;
  isActive: boolean;
  createdAt: string;
  createdBy: ShareUser;
}

export interface DocumentShares {
  internalShares: InternalShare[];
  externalShares: ExternalShare[];
}

export interface PublicShareInfo {
  id: string;
  documentId: string;
  documentName: string;
  allowDownload: boolean;
  expiresAt: string | null;
  requiresPassword: boolean;
  shareType: ShareType;
}

export interface VerifyShareResponse {
  accessGrant: string;
  expiresIn: number;
}

// ================================================================== //
// Auth / Current user
// ================================================================== //

export interface WorkspaceMembership {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  workspaceType: WorkspaceType;
  role: WorkspaceUserRole;
  status: WorkspaceUserStatus;
}

export interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  workspaces: WorkspaceMembership[];
  defaultWorkspace: WorkspaceMembership | null;
}

export interface SwitchWorkspaceResponse {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  workspaceType: WorkspaceType;
  role: WorkspaceUserRole;
}

// ================================================================== //
// Workspaces
// ================================================================== //

export interface WorkspaceListItem {
  id: string;
  name: string;
  slug: string;
  type: WorkspaceType;
  status: WorkspaceStatus;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: WorkspaceUserRole;
  status: WorkspaceUserStatus;
  joinedAt: string;
}

export interface WorkspaceDetail extends WorkspaceListItem {
  documentCount: number;
  members: WorkspaceMember[];
}

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export interface WorkspaceInvitation {
  id: string;
  email: string;
  role: WorkspaceUserRole;
  token: string;
  expiresAt: string;
  status: InvitationStatus;
  createdBy: { firstName: string; lastName: string };
  createdAt: string;
}

export interface PublicInvitation {
  id: string;
  email: string;
  role: WorkspaceUserRole;
  expiresAt: string;
  workspace: { id: string; name: string; type: string };
  invitedBy: { firstName: string; lastName: string };
}

export interface AcceptInvitationResponse {
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceUserRole;
}

export interface WorkspaceSummary {
  totalDocuments: number;
  activeDocuments: number;
  archivedDocuments: number;
  expiringCount: number;
  expiredCount: number;
  activeShares: number;
  memberCount: number;
  recentUploads: number;
}

// ================================================================== //
// Folders
// ================================================================== //

export interface FolderCreatedBy {
  id: string;
  firstName: string;
  lastName: string;
}

export interface FolderListItem {
  id: string;
  workspaceId: string;
  name: string;
  parentFolderId: string | null;
  createdBy: FolderCreatedBy;
  documentCount: number;
  childCount: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ================================================================== //
// Documents
// ================================================================== //

export interface DocOwner {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface DocTagRef {
  id: string;
  name: string;
  color: string | null;
}

export interface DocumentListItem {
  id: string;
  workspaceId: string;
  name: string;
  fileName: string;
  fileType: string;
  status: DocumentStatus;
  currentVersionNumber: number;
  folder: { id: string; name: string } | null;
  owner: DocOwner;
  tags: DocTagRef[];
  versionCount: number;
  expiryDate: string | null;
  renewalDueDate: string | null;
  isReminderEnabled: boolean;
  remindersSnoozedUntil: string | null;
  createdAt: string;
  updatedAt: string;
  /** State of the AI extraction for this document. */
  aiStatus: AiDocumentStatus;
  /** Overall AI extraction confidence, 0 when never analysed. */
  aiConfidence: number;
}

export type AiDocumentStatus = 'none' | 'running' | 'done' | 'failed' | 'disabled';

export interface DocumentVersion {
  id: string;
  versionNumber: number;
  storageKey: string;
  fileSizeBytes: string; // BigInt serialised as string
  mimeType: string;
  uploadedBy: DocOwner;
  createdAt: string;
}

export interface DocumentMetadataEntry {
  id: string;
  key: string;
  value: string;
}

export interface DocumentDetail extends DocumentListItem {
  description: string | null;
  workspace: { id: string; name: string };
  versions: DocumentVersion[];
  metadata: DocumentMetadataEntry[];
}

export interface DocumentReminder {
  id: string;
  documentId: string;
  remindAt: string;
  channel: ReminderChannel;
  status: ReminderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SetRemindersPayload {
  expiryDate?: string | null;
  renewalDueDate?: string | null;
  isReminderEnabled?: boolean;
  offsetDays?: number[];
  channel?: ReminderChannel;
}

export interface ExpiringDocument {
  id: string;
  name: string;
  workspaceId: string;
  expiryDate: string | null;
  renewalDueDate: string | null;
  isReminderEnabled: boolean;
  remindersSnoozedUntil: string | null;
  folderName: string | null;
  ownerEmail: string;
  daysUntilExpiry: number;
}

export interface UpcomingReminder {
  id: string;
  documentId: string;
  documentName: string;
  remindAt: string;
  channel: ReminderChannel;
  status: ReminderStatus;
  sentAt: string | null;
  lastError: string | null;
  expiryDate: string | null;
}

// ================================================================== //
// Tags
// ================================================================== //

export interface Tag {
  id: string;
  workspaceId: string;
  name: string;
  color: string | null;
  createdAt: string;
  updatedAt: string;
  /** How many documents carry this label. */
  documentCount: number;
}

// ================================================================== //
// Search
// ================================================================== //

export interface SearchResult {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  fileName: string;
  fileType: string;
  status: DocumentStatus;
  currentVersionNumber: number;
  folder: { id: string; name: string } | null;
  owner: DocOwner;
  tags: DocTagRef[];
  versionCount: number;
  snippet?: string;
  createdAt: string;
  updatedAt: string;
}

// ================================================================== //
// Pagination + API error
// ================================================================== //

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
  timestamp: string;
  path: string;
}
