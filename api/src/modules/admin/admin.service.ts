import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PLANS } from '../billing/plans';
import { BillingService } from '../billing/billing.service';
import type { WorkspacePlan } from '@prisma/client';

// ------------------------------------------------------------------ //
// Shape of the overview. Mirrored in web/src/lib/admin.ts.
// ------------------------------------------------------------------ //

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
  plan: string;
  planSource: string | null;
  planRenewsAt: string | null;
  aiActionsUsed: number;
  aiActionsIncluded: number;
  joinedAt: string;
  lastActiveAt: string | null;
  workspaces: { id: string; name: string; role: string; plan: string }[];
  documents: number;
  storageBytes: number;
  /** Tokens used by the workspaces this person owns. */
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

const DAY = 86_400_000;
const SIGNUP_DAYS = 30;
const RECENT_ACTIVITY = 40;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService, private readonly billing: BillingService) {}

  /** Hand someone a plan without payment: friends, pilots, the platform's own accounts. */
  async setPlan(userId: string, plan: WorkspacePlan, months?: number): Promise<{ plan: WorkspacePlan; renewsAt: string | null }> {
    const renewsAt = months ? new Date(Date.now() + months * 30.44 * 86_400_000) : null;
    await this.billing.setPlan(userId, plan, { source: 'complimentary', renewsAt });
    return { plan, renewsAt: renewsAt?.toISOString() ?? null };
  }

  async overview(): Promise<AdminOverview> {
    const now = new Date();
    const since7 = new Date(now.getTime() - 7 * DAY);

    const [users, workspaces, documents, versions, lastActiveByUser, lastActivityByWorkspace, recent, externalShares, apiKeys, pendingInvitations] =
      await Promise.all([
        this.prisma.user.findMany({
          select: {
            id: true, email: true, firstName: true, lastName: true, isActive: true, createdAt: true,
            plan: true, planSource: true, planRenewsAt: true, aiActionsUsed: true,
            workspaces: {
              where: { status: 'ACTIVE' },
              select: { role: true, workspace: { select: { id: true, name: true, plan: true, aiUsageTokens: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.workspace.findMany({
          select: {
            id: true, name: true, type: true, plan: true, aiUsageTokens: true, createdAt: true,
            members: { where: { status: 'ACTIVE' }, select: { role: true, user: { select: { email: true } } } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.document.findMany({
          where: { status: { not: 'DELETED' } },
          select: { id: true, workspaceId: true, ownerUserId: true, createdAt: true },
        }),
        this.prisma.documentVersion.findMany({
          select: { fileSizeBytes: true, uploadedById: true, document: { select: { workspaceId: true, status: true } } },
        }),
        this.prisma.auditLog.groupBy({ by: ['userId'], _max: { createdAt: true } }),
        this.prisma.auditLog.groupBy({ by: ['workspaceId'], _max: { createdAt: true } }),
        this.prisma.auditLog.findMany({
          take: RECENT_ACTIVITY,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, action: true, entityType: true, metadata: true, createdAt: true,
            user: { select: { email: true, firstName: true, lastName: true } },
            workspace: { select: { name: true } },
          },
        }),
        this.prisma.documentShare.count({ where: { shareType: 'EXTERNAL_LINK' } }),
        this.prisma.apiKey.count({ where: { revokedAt: null } }),
        this.prisma.workspaceInvitation.count({ where: { status: 'PENDING' } }),
      ]);

    // ---- per-user and per-workspace tallies ------------------------------ //
    const docsByOwner = new Map<string, number>();
    const docsByWorkspace = new Map<string, number>();
    for (const d of documents) {
      docsByOwner.set(d.ownerUserId, (docsByOwner.get(d.ownerUserId) ?? 0) + 1);
      docsByWorkspace.set(d.workspaceId, (docsByWorkspace.get(d.workspaceId) ?? 0) + 1);
    }

    const bytesByUploader = new Map<string, number>();
    const bytesByWorkspace = new Map<string, number>();
    let storageBytes = 0;
    for (const v of versions) {
      if (v.document.status === 'DELETED') continue;
      const bytes = Number(v.fileSizeBytes);
      storageBytes += bytes;
      bytesByUploader.set(v.uploadedById, (bytesByUploader.get(v.uploadedById) ?? 0) + bytes);
      bytesByWorkspace.set(v.document.workspaceId, (bytesByWorkspace.get(v.document.workspaceId) ?? 0) + bytes);
    }

    const lastActive = new Map<string, Date>();
    for (const row of lastActiveByUser) if (row.userId && row._max.createdAt) lastActive.set(row.userId, row._max.createdAt);
    const lastWorkspaceActivity = new Map<string, Date>();
    for (const row of lastActivityByWorkspace) if (row._max.createdAt) lastWorkspaceActivity.set(row.workspaceId, row._max.createdAt);

    // ---- sign-ups per day, oldest first, zero-filled ---------------------- //
    const signups = new Map<string, number>();
    for (let i = SIGNUP_DAYS - 1; i >= 0; i--) signups.set(isoDay(new Date(now.getTime() - i * DAY)), 0);
    for (const u of users) {
      const day = isoDay(u.createdAt);
      if (signups.has(day)) signups.set(day, (signups.get(day) ?? 0) + 1);
    }

    return {
      generatedAt: now.toISOString(),
      totals: {
        users: users.length,
        usersLast7Days: users.filter((u) => u.createdAt >= since7).length,
        workspaces: workspaces.length,
        documents: documents.length,
        documentsLast7Days: documents.filter((d) => d.createdAt >= since7).length,
        storageBytes,
        aiTokens: workspaces.reduce((sum, w) => sum + w.aiUsageTokens, 0),
        externalShares,
        apiKeys,
        pendingInvitations,
      },
      signupsByDay: [...signups].map(([day, count]) => ({ day, count })),
      users: users.map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`.trim() || u.email,
        email: u.email,
        isActive: u.isActive,
        plan: u.plan,
        planSource: u.planSource,
        planRenewsAt: u.planRenewsAt?.toISOString() ?? null,
        aiActionsUsed: u.aiActionsUsed,
        aiActionsIncluded: PLANS[u.plan].aiActionsPerMonth,
        joinedAt: u.createdAt.toISOString(),
        lastActiveAt: lastActive.get(u.id)?.toISOString() ?? null,
        workspaces: u.workspaces.map((m) => ({ id: m.workspace.id, name: m.workspace.name, role: m.role, plan: m.workspace.plan })),
        documents: docsByOwner.get(u.id) ?? 0,
        storageBytes: bytesByUploader.get(u.id) ?? 0,
        aiTokens: u.workspaces.filter((m) => m.role === 'OWNER').reduce((sum, m) => sum + m.workspace.aiUsageTokens, 0),
      })),
      workspaces: workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        type: w.type,
        plan: w.plan,
        ownerEmail: w.members.find((m) => m.role === 'OWNER')?.user.email ?? null,
        members: w.members.length,
        documents: docsByWorkspace.get(w.id) ?? 0,
        storageBytes: bytesByWorkspace.get(w.id) ?? 0,
        aiTokens: w.aiUsageTokens,
        createdAt: w.createdAt.toISOString(),
        lastActivityAt: lastWorkspaceActivity.get(w.id)?.toISOString() ?? null,
      })),
      recentActivity: recent.map((r) => ({
        id: r.id,
        at: r.createdAt.toISOString(),
        who: r.user ? `${r.user.firstName} ${r.user.lastName}`.trim() || r.user.email : 'System',
        workspace: r.workspace.name,
        action: r.action,
        entityType: r.entityType,
        detail: detailOf(r.metadata),
      })),
    };
  }
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Pull the one human-readable string out of an audit metadata blob, if any. */
function detailOf(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  for (const key of ['documentName', 'name', 'fileName', 'memberEmail', 'email', 'workspaceName']) {
    const v = m[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}
