import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, AuditEntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { assertWorkspaceMembership, assertAdminOrAbove } from '../../common/helpers/workspace-access.helper';
import type { DevUserPayload } from '../../common/guards/dev-auth.guard';
import type { AuditLogDto, AuditQueryDto } from './dto/audit.dto';

export { AuditAction, AuditEntityType };

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

interface LogParams {
  workspaceId: string;
  userId?: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService, private readonly billing: BillingService) {}

  /**
   * Fire-and-forget audit log write.
   * Never throws — callers must not await this or depend on its result.
   */
  log(params: LogParams): void {
    void this.prisma.auditLog
      .create({
        data: {
          workspaceId: params.workspaceId,
          userId: params.userId ?? null,
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId,
          metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
        },
      })
      .catch((err: Error) => {
        this.logger.warn(`Audit log write failed [${params.action}]: ${err.message}`);
      });
  }

  // ------------------------------------------------------------------ //
  // Workspace activity feed
  // ------------------------------------------------------------------ //

  async getWorkspaceActivity(
    query: AuditQueryDto,
    user: DevUserPayload,
  ): Promise<AuditLogDto[]> {
    assertWorkspaceMembership(user, query.workspaceId);

    const logs = await this.prisma.auditLog.findMany({
      where: {
        workspaceId: query.workspaceId,
        ...(query.entityType && { entityType: query.entityType }),
        ...(query.action && { action: query.action }),
        ...((query.dateFrom || query.dateTo) && {
          createdAt: {
            ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
            ...(query.dateTo && { lte: new Date(query.dateTo) }),
          },
        }),
      },
      include: { user: { select: USER_SELECT } },
      orderBy: { createdAt: 'desc' },
      skip: query.offset ?? 0,
      take: query.limit ?? 50,
    });

    return logs.map(this.toDto);
  }

  /** The whole workspace log as CSV, newest first, for Business and above. */
  async exportCsv(workspaceId: string, user: DevUserPayload): Promise<string> {
    assertAdminOrAbove(user, workspaceId);
    await this.billing.assertActivityExport(workspaceId);
    const logs = await this.prisma.auditLog.findMany({
      where: { workspaceId },
      include: { user: { select: USER_SELECT } },
      orderBy: { createdAt: 'desc' },
      take: 50_000,
    });
    const cell = (v: unknown) => {
      const s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [['time (UTC)', 'who', 'email', 'action', 'entity type', 'entity id', 'details'].join(',')];
    for (const l of logs) {
      const who = l.user ? `${l.user.firstName} ${l.user.lastName}`.trim() : 'System';
      rows.push([l.createdAt.toISOString(), who, l.user?.email ?? '', l.action, l.entityType, l.entityId, l.metadata ? JSON.stringify(l.metadata) : ''].map(cell).join(','));
    }
    return rows.join('\n') + '\n';
  }

  // ------------------------------------------------------------------ //
  // Document activity (entityId = documentId)
  // ------------------------------------------------------------------ //

  async getDocumentActivity(
    documentId: string,
    user: DevUserPayload,
  ): Promise<AuditLogDto[]> {
    // Verify document exists and user has access
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { workspaceId: true },
    });
    if (!doc) return [];
    assertWorkspaceMembership(user, doc.workspaceId);

    const logs = await this.prisma.auditLog.findMany({
      where: { entityId: documentId },
      include: { user: { select: USER_SELECT } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return logs.map(this.toDto);
  }

  // ------------------------------------------------------------------ //
  // Private helpers
  // ------------------------------------------------------------------ //

  private toDto(log: {
    id: string;
    workspaceId: string;
    userId: string | null;
    action: AuditAction;
    entityType: AuditEntityType;
    entityId: string;
    metadata: unknown;
    createdAt: Date;
    user: { id: string; firstName: string; lastName: string; email: string } | null;
  }): AuditLogDto {
    return {
      id: log.id,
      workspaceId: log.workspaceId,
      userId: log.userId,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      metadata: (log.metadata as Record<string, unknown>) ?? null,
      createdAt: log.createdAt.toISOString(),
      user: log.user,
    };
  }
}
