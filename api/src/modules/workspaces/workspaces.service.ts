import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { WorkspaceUserRole, WorkspaceUserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AuditAction, AuditEntityType } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { buildMemberAddedEmail } from './member-added-email';
import type { GrantWorkspaceAccessDto, GrantWorkspaceAccessResultDto } from './dto/grant-access.dto';
import {
  assertWorkspaceMembership,
  assertAdminOrAbove,
} from '../../common/helpers/workspace-access.helper';
import type { DevUserPayload } from '../../common/guards/dev-auth.guard';
import {
  WorkspaceMemberDto,
  WorkspaceResponseDto,
  WorkspaceDetailResponseDto,
  WorkspaceSummaryDto,
} from './dto/workspace-response.dto';
import type {
  AddWorkspaceMemberDto,
  UpdateWorkspaceMemberDto,
  UpdateWorkspaceDto,
} from './dto/add-member.dto';
import { EncryptionService } from '../../common/services/encryption.service';
import type { UpdateAiSettingsDto, AiSettingsResponseDto } from './dto/ai-settings.dto';
import { PLAN_TOKEN_LIMITS } from './dto/ai-settings.dto';
import { BillingService } from '../billing/billing.service';
import { PlanLimitException } from '../../common/exceptions/plan-limit.exception';

// Roles that can manage members
const MANAGER_ROLES = new Set<WorkspaceUserRole>([
  WorkspaceUserRole.OWNER,
  WorkspaceUserRole.ADMIN,
]);

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly encryption: EncryptionService,
    private readonly mail: MailService,
    private readonly billing: BillingService,
  ) {}

  // ------------------------------------------------------------------ //
  // Create
  // ------------------------------------------------------------------ //

  async create(name: string, user: DevUserPayload): Promise<WorkspaceResponseDto> {
    await this.billing.assertWorkspaceQuota(user.id);
    const makeSlug = () =>
      name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) +
      '-' + Math.random().toString(36).slice(2, 7);

    let workspace: Awaited<ReturnType<typeof this.prisma.workspace.create>>;
    // Retry up to 3 times on slug collision (P2002 unique constraint)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        workspace = await this.prisma.$transaction(async (tx) => {
          const ws = await tx.workspace.create({
            data: { name, slug: makeSlug(), type: 'PERSONAL', status: 'ACTIVE' },
          });
          await tx.workspaceUser.create({
            data: {
              workspaceId: ws.id,
              userId: user.id,
              role: WorkspaceUserRole.OWNER,
              status: WorkspaceUserStatus.ACTIVE,
            },
          });
          return ws;
        });
        break;
      } catch (err: unknown) {
        const pe = err as { code?: string; meta?: { target?: string[] } };
        if (pe?.code === 'P2002' && pe?.meta?.target?.includes('slug') && attempt < 2) continue;
        throw err;
      }
    }

    this.audit.log({
      workspaceId: workspace!.id,
      userId: user.id,
      action: AuditAction.MEMBER_ADDED,
      entityType: AuditEntityType.WORKSPACE,
      entityId: workspace!.id,
      metadata: { workspaceName: name },
    });

    return {
      id: workspace!.id,
      name: workspace!.name,
      slug: workspace!.slug,
      type: workspace!.type,
      status: workspace!.status,
      memberCount: 1,
      createdAt: workspace!.createdAt,
      updatedAt: workspace!.updatedAt,
    };
  }

  // ------------------------------------------------------------------ //
  // Read
  // ------------------------------------------------------------------ //

  async findAll(user: DevUserPayload): Promise<WorkspaceResponseDto[]> {
    // Only return workspaces the caller is an active member of
    const memberWorkspaceIds = user.workspaces
      .filter((w) => w.status === 'ACTIVE')
      .map((w) => w.workspaceId);

    if (memberWorkspaceIds.length === 0) return [];

    const workspaces = await this.prisma.workspace.findMany({
      where: {
        id: { in: memberWorkspaceIds },
        status: 'ACTIVE',
      },
      include: {
        _count: { select: { members: { where: { status: 'ACTIVE' as const } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return workspaces.map((ws) => ({
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      type: ws.type,
      status: ws.status,
      memberCount: ws._count.members,
      createdAt: ws.createdAt,
      updatedAt: ws.updatedAt,
    }));
  }

  async findById(id: string, user: DevUserPayload): Promise<WorkspaceDetailResponseDto> {
    // Verify caller is an active member before revealing any workspace data
    assertWorkspaceMembership(user, id);

    const workspace = await this.prisma.workspace.findUnique({
      where: { id },
      include: {
        members: {
          where: { status: 'ACTIVE' },
          include: { user: true },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { documents: true } },
      },
    });

    if (!workspace) {
      throw new NotFoundException(`Workspace "${id}" not found`);
    }

    const members: WorkspaceMemberDto[] = workspace.members.map((m) => ({
      id: m.id,
      userId: m.userId,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      email: m.user.email,
      role: m.role,
      status: m.status,
      joinedAt: m.createdAt,
    }));

    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      type: workspace.type,
      status: workspace.status,
      memberCount: members.length,
      documentCount: workspace._count.documents,
      members,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    };
  }

  // ------------------------------------------------------------------ //
  // Dashboard summary
  // ------------------------------------------------------------------ //

  async getSummary(workspaceId: string, user: DevUserPayload): Promise<WorkspaceSummaryDto> {
    assertWorkspaceMembership(user, workspaceId);

    const now = new Date();
    const ninetyDaysOut = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalDocuments,
      activeDocuments,
      archivedDocuments,
      expiringCount,
      expiredCount,
      activeShares,
      memberCount,
      recentUploads,
    ] = await Promise.all([
      this.prisma.document.count({ where: { workspaceId, status: { not: 'DELETED' } } }),
      this.prisma.document.count({ where: { workspaceId, status: 'ACTIVE' } }),
      this.prisma.document.count({ where: { workspaceId, status: 'ARCHIVED' } }),
      this.prisma.document.count({
        where: {
          workspaceId,
          status: 'ACTIVE',
          expiryDate: { gte: now, lte: ninetyDaysOut },
        },
      }),
      this.prisma.document.count({
        where: { workspaceId, status: 'ACTIVE', expiryDate: { lt: now } },
      }),
      this.prisma.documentShare.count({
        where: {
          document: { workspaceId },
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
      this.prisma.workspaceUser.count({ where: { workspaceId, status: 'ACTIVE' } }),
      this.prisma.document.count({
        where: { workspaceId, status: 'ACTIVE', createdAt: { gte: sevenDaysAgo } },
      }),
    ]);

    return {
      totalDocuments,
      activeDocuments,
      archivedDocuments,
      expiringCount,
      expiredCount,
      activeShares,
      memberCount,
      recentUploads,
    };
  }

  // ------------------------------------------------------------------ //
  // Update workspace (rename, etc.) — ADMIN/OWNER only
  // ------------------------------------------------------------------ //

  async update(
    workspaceId: string,
    dto: UpdateWorkspaceDto,
    currentUser: DevUserPayload,
  ): Promise<WorkspaceResponseDto> {
    assertAdminOrAbove(currentUser, workspaceId);

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { _count: { select: { members: { where: { status: 'ACTIVE' as const } } } } },
    });
    if (!workspace) throw new NotFoundException(`Workspace "${workspaceId}" not found`);

    const updated = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
      },
      include: { _count: { select: { members: { where: { status: 'ACTIVE' as const } } } } },
    });

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      type: updated.type,
      status: updated.status,
      memberCount: updated._count.members,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  // ------------------------------------------------------------------ //
  // Add member
  // ------------------------------------------------------------------ //

  async addMember(
    workspaceId: string,
    dto: AddWorkspaceMemberDto,
    currentUser: DevUserPayload,
  ): Promise<WorkspaceMemberDto> {
    this.assertManagerRole(currentUser, workspaceId);
    await this.billing.assertMemberQuota(workspaceId);

    // Ensure workspace exists
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace) throw new NotFoundException(`Workspace "${workspaceId}" not found`);

    // Find or create the user by email
    let user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    const isNewAccount = !user;
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          isActive: true,
        },
      });
    }

    return this.addUserToWorkspace(workspace, user, dto.role, currentUser, isNewAccount);
  }

  /**
   * Add someone directly to several workspaces at once, without re-typing
   * their details for each. The caller must manage the workspace the member
   * is in and every target workspace; a target they cannot manage comes back
   * as "forbidden" rather than failing the whole request, so the rest go
   * through and the caller can see which did not.
   */
  async grantAccess(
    sourceWorkspaceId: string,
    memberId: string,
    dto: GrantWorkspaceAccessDto,
    currentUser: DevUserPayload,
  ): Promise<GrantWorkspaceAccessResultDto[]> {
    this.assertManagerRole(currentUser, sourceWorkspaceId);
    await this.billing.assertCrossWorkspaceGrants(sourceWorkspaceId);

    const membership = await this.prisma.workspaceUser.findUnique({
      where: { id: memberId },
      include: { user: true },
    });
    if (!membership || membership.workspaceId !== sourceWorkspaceId) {
      throw new NotFoundException('Member not found in this workspace');
    }
    const role = dto.role ?? membership.role;
    const targets = [...new Set(dto.workspaceIds)].filter((id) => id !== sourceWorkspaceId);
    const workspaces = await this.prisma.workspace.findMany({ where: { id: { in: targets } } });
    const byId = new Map(workspaces.map((w) => [w.id, w]));

    const results: GrantWorkspaceAccessResultDto[] = [];
    for (const workspaceId of targets) {
      const workspace = byId.get(workspaceId);
      if (!workspace) throw new NotFoundException(`Workspace "${workspaceId}" not found`);

      const mine = currentUser.workspaces.find((w) => w.workspaceId === workspaceId);
      if (!mine || !MANAGER_ROLES.has(mine.role as WorkspaceUserRole)) {
        results.push({ workspaceId, workspaceName: workspace.name, outcome: 'forbidden' });
        continue;
      }

      const existing = await this.prisma.workspaceUser.findUnique({
        where: { userId_workspaceId: { userId: membership.userId, workspaceId } },
      });
      if (existing?.status === WorkspaceUserStatus.ACTIVE) {
        results.push({ workspaceId, workspaceName: workspace.name, outcome: 'already_member', role: existing.role });
        continue;
      }

      try {
        await this.billing.assertMemberQuota(workspaceId);
      } catch (err) {
        if (err instanceof PlanLimitException) {
          results.push({ workspaceId, workspaceName: workspace.name, outcome: 'forbidden' });
          continue;
        }
        throw err;
      }
      await this.addUserToWorkspace(workspace, membership.user, role, currentUser, false);
      results.push({ workspaceId, workspaceName: workspace.name, outcome: existing ? 'reactivated' : 'added', role });
    }
    return results;
  }

  /**
   * The part of adding a member that happens once the person is known:
   * create or reactivate the membership, audit it, and tell them by email.
   */
  private async addUserToWorkspace(
    workspace: { id: string; name: string },
    user: { id: string; email: string },
    role: WorkspaceUserRole,
    currentUser: DevUserPayload,
    isNewAccount: boolean,
  ): Promise<WorkspaceMemberDto> {
    const workspaceId = workspace.id;
    // Check for existing membership
    const existing = await this.prisma.workspaceUser.findUnique({
      where: {
        userId_workspaceId: { userId: user.id, workspaceId },
      },
    });

    if (existing?.status === WorkspaceUserStatus.ACTIVE) {
      throw new ConflictException(
        `${user.email} is already an active member of this workspace`,
      );
    }

    // Create or reactivate
    const membership = existing
      ? await this.prisma.workspaceUser.update({
          where: { id: existing.id },
          data: { role: role, status: WorkspaceUserStatus.ACTIVE },
          include: { user: true },
        })
      : await this.prisma.workspaceUser.create({
          data: {
            workspaceId,
            userId: user.id,
            role: role,
            status: WorkspaceUserStatus.ACTIVE,
          },
          include: { user: true },
        });

    this.audit.log({
      workspaceId,
      userId: currentUser.id,
      action: AuditAction.MEMBER_ADDED,
      entityType: AuditEntityType.USER,
      entityId: user.id,
      metadata: { email: user.email, role: role },
    });

    // Adding someone directly used to be silent: they were a member and nobody
    // told them. Delivery never decides whether the membership exists.
    try {
      const addedByName =
        [currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ').trim() || 'A DockyDoc user';
      const email = buildMemberAddedEmail({
        workspaceName: workspace.name,
        addedByName,
        role: role,
        loginUrl: `${this.mail.appUrl}/login`,
        isNewAccount,
      });
      await this.mail.send({ to: [user.email], ...email });
    } catch (err) {
      this.logger.error(
        `Member-added email to ${user.email} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return this.toMemberDto(membership);
  }


  // ------------------------------------------------------------------ //
  // Update member role / status
  // ------------------------------------------------------------------ //

  async updateMember(
    workspaceId: string,
    memberId: string,
    dto: UpdateWorkspaceMemberDto,
    currentUser: DevUserPayload,
  ): Promise<WorkspaceMemberDto> {
    this.assertManagerRole(currentUser, workspaceId);

    const membership = await this.prisma.workspaceUser.findFirst({
      where: { id: memberId, workspaceId },
      include: { user: true },
    });
    if (!membership) throw new NotFoundException('Member not found');

    // Guard: cannot modify your own membership via this endpoint
    if (membership.userId === currentUser.id) {
      throw new ForbiddenException(
        'You cannot modify your own workspace membership.',
      );
    }

    // Guard: only OWNERs may grant the OWNER role
    if (dto.role === WorkspaceUserRole.OWNER) {
      const callerMembership = currentUser.workspaces.find(
        (w) => w.workspaceId === workspaceId,
      );
      if (callerMembership?.role !== WorkspaceUserRole.OWNER) {
        throw new ForbiddenException(
          'Only an existing Owner can grant the Owner role.',
        );
      }
    }

    // Guard: cannot demote or remove the last OWNER
    if (
      membership.role === WorkspaceUserRole.OWNER &&
      (dto.role !== WorkspaceUserRole.OWNER ||
        dto.status === WorkspaceUserStatus.REMOVED)
    ) {
      const ownerCount = await this.prisma.workspaceUser.count({
        where: {
          workspaceId,
          role: WorkspaceUserRole.OWNER,
          status: WorkspaceUserStatus.ACTIVE,
        },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException(
          'Cannot change or remove the only owner of this workspace',
        );
      }
    }

    const updated = await this.prisma.workspaceUser.update({
      where: { id: memberId },
      data: {
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
      include: { user: true },
    });

    // Update user profile fields if provided (global — applies across all workspaces)
    if (dto.firstName !== undefined || dto.lastName !== undefined || dto.email !== undefined) {
      await this.prisma.user.update({
        where: { id: membership.userId },
        data: {
          ...(dto.firstName !== undefined && { firstName: dto.firstName }),
          ...(dto.lastName !== undefined && { lastName: dto.lastName }),
          ...(dto.email !== undefined && { email: dto.email }),
        },
      });
    }

    this.audit.log({
      workspaceId,
      userId: currentUser.id,
      action: AuditAction.MEMBER_ROLE_UPDATED,
      entityType: AuditEntityType.USER,
      entityId: membership.userId,
      metadata: {
        email: membership.user.email,
        ...(dto.role && { newRole: dto.role }),
        ...(dto.status && { newStatus: dto.status }),
      },
    });

    return this.toMemberDto(updated);
  }

  // ------------------------------------------------------------------ //
  // AI Settings
  // ------------------------------------------------------------------ //

  async getAiSettings(
    workspaceId: string,
    user: DevUserPayload,
  ): Promise<AiSettingsResponseDto> {
    assertWorkspaceMembership(user, workspaceId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workspace = await (this.prisma.workspace as any).findUnique({
      where: { id: workspaceId },
      select: {
        plan: true,
        aiProvider: true,
        aiProviderType: true,
        aiApiKeyEncrypted: true,
        aiUsageTokens: true,
      },
    }) as { plan: string; aiProvider: string; aiProviderType: string; aiApiKeyEncrypted: string | null; aiUsageTokens: number } | null;
    if (!workspace) throw new NotFoundException(`Workspace "${workspaceId}" not found`);

    const limit = PLAN_TOKEN_LIMITS[workspace.plan] ?? PLAN_TOKEN_LIMITS['FREE'];
    const used = workspace.aiUsageTokens;

    return {
      plan: workspace.plan,
      aiProvider: workspace.aiProvider,
      aiProviderType: workspace.aiProviderType,
      hasApiKey: !!workspace.aiApiKeyEncrypted,
      aiUsageTokens: used,
      aiUsageLimit: limit,
      aiUsagePercent: limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0,
    };
  }

  async updateAiSettings(
    workspaceId: string,
    dto: UpdateAiSettingsDto,
    user: DevUserPayload,
  ): Promise<AiSettingsResponseDto> {
    assertAdminOrAbove(user, workspaceId);

    const updateData: Record<string, unknown> = {};
    if (dto.aiProvider !== undefined) updateData.aiProvider = dto.aiProvider;
    if (dto.aiProviderType !== undefined) updateData.aiProviderType = dto.aiProviderType;
    if (dto.apiKey !== undefined) {
      updateData.aiApiKeyEncrypted = this.encryption.encrypt(dto.apiKey);
    }

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: updateData as any,
    });

    return this.getAiSettings(workspaceId, user);
  }

  // ------------------------------------------------------------------ //
  // Private helpers
  // ------------------------------------------------------------------ //

  private assertManagerRole(user: DevUserPayload, workspaceId: string): void {
    const membership = user.workspaces.find(
      (w) => w.workspaceId === workspaceId,
    );
    if (!membership) {
      throw new ForbiddenException('You are not a member of this workspace');
    }
    if (!MANAGER_ROLES.has(membership.role as WorkspaceUserRole)) {
      throw new ForbiddenException(
        'Only OWNER or ADMIN can manage workspace members',
      );
    }
  }

  private toMemberDto(m: {
    id: string;
    userId: string;
    role: WorkspaceUserRole;
    status: WorkspaceUserStatus;
    createdAt: Date;
    user: { firstName: string; lastName: string; email: string };
  }): WorkspaceMemberDto {
    return {
      id: m.id,
      userId: m.userId,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      email: m.user.email,
      role: m.role,
      status: m.status,
      joinedAt: m.createdAt,
    };
  }
}
