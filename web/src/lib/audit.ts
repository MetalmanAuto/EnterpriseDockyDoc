import { apiFetch } from './api';
import type { AuditAction, AuditEntityType, AuditLog } from '@/types';

// ------------------------------------------------------------------ //
// Human-readable labels for each action
// ------------------------------------------------------------------ //

const ACTION_LABELS: Record<AuditAction, string> = {
  DOCUMENT_CREATED:        'Document created',
  DOCUMENT_UPDATED:        'Document updated',
  DOCUMENT_DELETED:        'Document deleted',
  DOCUMENT_SHREDDED:       'Document permanently deleted',
  DOCUMENT_VERSION_ADDED:  'New version uploaded',
  DOCUMENT_DOWNLOADED:     'Document downloaded',
  DOCUMENT_SHARED_INTERNAL:'Shared internally',
  DOCUMENT_SHARED_EXTERNAL:'External link created',
  SHARE_REVOKED:           'Share revoked',
  REMINDER_CREATED:        'Reminder set',
  REMINDER_UPDATED:        'Reminders updated',
  REMINDER_SENT:           'Reminder email sent',
  MEMBER_ADDED:            'Member added',
  MEMBER_ROLE_UPDATED:     'Member role updated',
};

export function formatAuditAction(action: AuditAction): string {
  return ACTION_LABELS[action] ?? action;
}

/** Returns a richer sentence based on action + metadata, e.g. "Uploaded version 3" */
export function describeAuditLog(log: AuditLog): string {
  const meta = log.metadata ?? {};
  const name = (meta.documentName as string) ?? '';

  switch (log.action) {
    case 'DOCUMENT_CREATED':
      return name ? `Created "${name}"` : 'Document created';
    case 'DOCUMENT_UPDATED':
      return name ? `Updated "${name}"` : 'Document updated';
    case 'DOCUMENT_DELETED':
      return name ? `Deleted "${name}"` : 'Document deleted';
    case 'DOCUMENT_SHREDDED':
      return name ? `Permanently deleted "${name}"` : 'Document permanently deleted';
    case 'DOCUMENT_VERSION_ADDED':
      return `Uploaded version ${meta.version ?? ''}${name ? ` of "${name}"` : ''}`.trim();
    case 'DOCUMENT_DOWNLOADED':
      return meta.external
        ? `External user downloaded${name ? ` "${name}"` : ' document'}`
        : `Downloaded${name ? ` "${name}"` : ' document'}`;
    case 'DOCUMENT_SHARED_INTERNAL': {
      const count = meta.sharedWithCount as number | undefined;
      return `Shared${name ? ` "${name}"` : ''} internally${count ? ` with ${count} ${count === 1 ? 'person' : 'people'}` : ''}`;
    }
    case 'DOCUMENT_SHARED_EXTERNAL':
      return `Created external link${name ? ` for "${name}"` : ''}`;
    case 'SHARE_REVOKED':
      return 'Share revoked';
    case 'REMINDER_CREATED':
      return name ? `Set reminder for "${name}"` : 'Reminder set';
    case 'REMINDER_UPDATED':
      return name ? `Updated reminders for "${name}"` : 'Reminders updated';
    case 'REMINDER_SENT': {
      const days = meta.daysUntilExpiry as number | undefined;
      const delivered = meta.delivered as boolean | undefined;
      const when = typeof days === 'number' ? (days < 0 ? 'expired' : days === 0 ? 'expires today' : `expires in ${days}d`) : '';
      return `${delivered === false ? 'Reminder due' : 'Reminder emailed'}${name ? ` for "${name}"` : ''}${when ? ` (${when})` : ''}`;
    }
    case 'MEMBER_ADDED':
      return `Added ${meta.email ?? 'member'} as ${meta.role ?? 'member'}`;
    case 'MEMBER_ROLE_UPDATED':
      return `Updated role for ${meta.email ?? 'member'}${meta.newRole ? ` → ${meta.newRole}` : ''}`;
    default:
      return formatAuditAction(log.action);
  }
}

/** Icon category for colour-coding in the UI */
export function auditActionCategory(action: AuditAction): 'create' | 'update' | 'delete' | 'share' | 'download' | 'member' {
  if (['DOCUMENT_CREATED'].includes(action)) return 'create';
  if (['DOCUMENT_UPDATED', 'DOCUMENT_VERSION_ADDED', 'REMINDER_CREATED', 'REMINDER_UPDATED', 'REMINDER_SENT'].includes(action)) return 'update';
  if (['DOCUMENT_DELETED', 'DOCUMENT_SHREDDED'].includes(action)) return 'delete';
  if (['DOCUMENT_SHARED_INTERNAL', 'DOCUMENT_SHARED_EXTERNAL', 'SHARE_REVOKED'].includes(action)) return 'share';
  if (['DOCUMENT_DOWNLOADED'].includes(action)) return 'download';
  if (['MEMBER_ADDED', 'MEMBER_ROLE_UPDATED'].includes(action)) return 'member';
  return 'update';
}

// ------------------------------------------------------------------ //
// API helpers
// ------------------------------------------------------------------ //

export interface WorkspaceActivityQuery {
  workspaceId: string;
  entityType?: AuditEntityType;
  action?: AuditAction;
  limit?: number;
  offset?: number;
  dateFrom?: string;
  dateTo?: string;
}

export function fetchWorkspaceActivity(query: WorkspaceActivityQuery): Promise<AuditLog[]> {
  const params = new URLSearchParams({ workspaceId: query.workspaceId });
  if (query.entityType) params.set('entityType', query.entityType);
  if (query.action) params.set('action', query.action);
  if (query.limit != null) params.set('limit', String(query.limit));
  if (query.offset != null && query.offset > 0) params.set('offset', String(query.offset));
  if (query.dateFrom) params.set('dateFrom', query.dateFrom);
  if (query.dateTo) params.set('dateTo', query.dateTo);
  return apiFetch<AuditLog[]>(`/api/v1/audit?${params}`);
}

export function fetchDocumentActivity(documentId: string): Promise<AuditLog[]> {
  return apiFetch<AuditLog[]>(`/api/v1/documents/${documentId}/activity`);
}
