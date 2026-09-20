/**
 * Platform admin overview. Mirrors api/src/modules/admin/admin.service.ts.
 */
import { apiFetch } from './api';

export interface AdminTotals {
  users: number;
  usersLast7Days: number;
  workspaces: number;
  documents: number;
  documentsLast7Days: number;
  storageBytes: number;
  aiTokens: number;
  externalShares: number;
  apiKeys: number;
  pendingInvitations: number;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  joinedAt: string;
  lastActiveAt: string | null;
  workspaces: { id: string; name: string; role: string; plan: string }[];
  documents: number;
  storageBytes: number;
  aiTokens: number;
}

export interface AdminWorkspaceRow {
  id: string;
  name: string;
  type: string;
  plan: string;
  ownerEmail: string | null;
  members: number;
  documents: number;
  storageBytes: number;
  aiTokens: number;
  createdAt: string;
  lastActivityAt: string | null;
}

export interface AdminActivityRow {
  id: string;
  at: string;
  who: string;
  workspace: string;
  action: string;
  entityType: string;
  detail: string | null;
}

export interface AdminOverview {
  generatedAt: string;
  totals: AdminTotals;
  signupsByDay: { day: string; count: number }[];
  users: AdminUserRow[];
  workspaces: AdminWorkspaceRow[];
  recentActivity: AdminActivityRow[];
}

export function fetchAdminOverview(): Promise<AdminOverview> {
  return apiFetch<AdminOverview>('/api/v1/admin/overview');
}
