import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AuditAction, AuditEntityType } from '../audit/audit.service';
import {
  assertWorkspaceMembership,
  assertEditorOrAbove,
} from '../../common/helpers/workspace-access.helper';
import type { DevUserPayload } from '../../common/guards/dev-auth.guard';
import {
  CreateFolderDto,
  FolderDetailResponseDto,
  FolderResponseDto,
  UpdateFolderDto,
} from './dto/folder.dto';

/** Folders may not nest deeper than this. */
const MAX_FOLDER_DEPTH = 5;

@Injectable()
export class FoldersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async findAll(workspaceId: string, user: DevUserPayload): Promise<FolderResponseDto[]> {
    assertWorkspaceMembership(user, workspaceId);

    const folders = await this.prisma.folder.findMany({
      where: { workspaceId, deletedAt: null },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { documents: { where: { status: { not: DocumentStatus.DELETED } } }, children: { where: { deletedAt: null } } } },
      },
      orderBy: [{ parentFolderId: 'asc' }, { name: 'asc' }],
    });

    return folders.map((f) => ({
      id: f.id,
      workspaceId: f.workspaceId,
      name: f.name,
      parentFolderId: f.parentFolderId,
      createdBy: f.createdBy,
      retentionDays: f.retentionDays,
      documentCount: f._count.documents,
      childCount: f._count.children,
      deletedAt: null,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }));
  }

  async findDeleted(workspaceId: string, user: DevUserPayload): Promise<FolderResponseDto[]> {
    assertWorkspaceMembership(user, workspaceId);

    const folders = await this.prisma.folder.findMany({
      where: { workspaceId, deletedAt: { not: null } },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { documents: { where: { status: DocumentStatus.DELETED } }, children: true } },
      },
      orderBy: [{ deletedAt: 'desc' }],
    });

    return folders.map((f) => ({
      id: f.id,
      workspaceId: f.workspaceId,
      name: f.name,
      parentFolderId: f.parentFolderId,
      createdBy: f.createdBy,
      retentionDays: f.retentionDays,
      documentCount: f._count.documents,
      childCount: f._count.children,
      deletedAt: f.deletedAt,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }));
  }

  /**
   * Get a single folder with its immediate children listed.
   */
  async findById(id: string, user: DevUserPayload): Promise<FolderDetailResponseDto> {
    const folder = await this.prisma.folder.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { documents: { where: { status: { not: DocumentStatus.DELETED } } }, children: { where: { deletedAt: null } } } },
        children: { where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } },
      },
    });

    if (!folder) throw new NotFoundException(`Folder "${id}" not found`);
    assertWorkspaceMembership(user, folder.workspaceId);

    return {
      id: folder.id,
      workspaceId: folder.workspaceId,
      name: folder.name,
      parentFolderId: folder.parentFolderId,
      createdBy: folder.createdBy,
      retentionDays: folder.retentionDays,
      documentCount: folder._count.documents,
      childCount: folder._count.children,
      children: folder.children,
      deletedAt: folder.deletedAt,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    };
  }

  /**
   * Create a new folder in a workspace.
   * If parentFolderId is given, validates it belongs to the same workspace.
   */
  async create(dto: CreateFolderDto, user: DevUserPayload): Promise<FolderResponseDto> {
    assertEditorOrAbove(user, dto.workspaceId);

    if (dto.parentFolderId) {
      const parent = await this.prisma.folder.findUnique({
        where: { id: dto.parentFolderId },
      });
      if (!parent || parent.workspaceId !== dto.workspaceId) {
        throw new NotFoundException(`Parent folder "${dto.parentFolderId}" not found in workspace`);
      }
      if (await this.depthOf(parent.id) >= MAX_FOLDER_DEPTH) {
        throw new BadRequestException(
          `Maximum folder nesting depth of ${MAX_FOLDER_DEPTH} levels reached`,
        );
      }
    }

    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Folder name cannot be empty.');

    const clash = await this.findSiblingByName(dto.workspaceId, dto.parentFolderId ?? null, name);
    if (clash) {
      throw new ConflictException(
        `A folder called "${clash.name}" is already here. Pick a different name.`,
      );
    }

    const folder = await this.prisma.folder.create({
      data: {
        workspaceId: dto.workspaceId,
        name,
        parentFolderId: dto.parentFolderId ?? null,
        createdById: user.id,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { documents: { where: { status: { not: DocumentStatus.DELETED } } }, children: { where: { deletedAt: null } } } },
      },
    });

    return {
      id: folder.id,
      workspaceId: folder.workspaceId,
      name: folder.name,
      parentFolderId: folder.parentFolderId,
      createdBy: folder.createdBy,
      retentionDays: folder.retentionDays,
      documentCount: folder._count.documents,
      childCount: folder._count.children,
      deletedAt: null,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    };
  }

  /**
   * Rename a folder and/or move it under a different parent.
   * Passing parentFolderId: null moves it to the top level.
   */
  async update(id: string, dto: UpdateFolderDto, user: DevUserPayload): Promise<FolderResponseDto> {
    const existing = await this.prisma.folder.findUnique({
      where: { id },
      select: { workspaceId: true, name: true, parentFolderId: true, deletedAt: true },
    });
    if (!existing) throw new NotFoundException(`Folder "${id}" not found`);
    if (existing.deletedAt) throw new BadRequestException('Folder is in trash. Restore it first.');
    assertEditorOrAbove(user, existing.workspaceId);

    const name = dto.name?.trim() ?? existing.name;
    if (!name) throw new BadRequestException('Folder name cannot be empty.');

    // A move is only intended when the caller actually sent the field
    const moving = dto.parentFolderId !== undefined;
    const newParentId = moving ? (dto.parentFolderId ?? null) : existing.parentFolderId;

    if (moving && newParentId !== existing.parentFolderId) {
      await this.assertValidMove(id, existing.workspaceId, newParentId);
    }

    const clash = await this.findSiblingByName(existing.workspaceId, newParentId, name, id);
    if (clash) {
      throw new ConflictException(
        `A folder called "${clash.name}" is already here. Pick a different name.`,
      );
    }

    const folder = await this.prisma.folder.update({
      where: { id },
      data: {
        name,
        ...(moving && { parentFolderId: newParentId }),
        ...(dto.retentionDays !== undefined && { retentionDays: dto.retentionDays }),
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { documents: { where: { status: { not: DocumentStatus.DELETED } } }, children: { where: { deletedAt: null } } } },
      },
    });

    return {
      id: folder.id,
      workspaceId: folder.workspaceId,
      name: folder.name,
      parentFolderId: folder.parentFolderId,
      createdBy: folder.createdBy,
      retentionDays: folder.retentionDays,
      documentCount: folder._count.documents,
      childCount: folder._count.children,
      deletedAt: folder.deletedAt,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    };
  }

  /**
   * A move is valid when the new parent is a live folder in the same workspace,
   * is not the folder itself or one of its descendants, and the resulting tree
   * still fits inside MAX_DEPTH levels.
   */
  private async assertValidMove(
    id: string,
    workspaceId: string,
    newParentId: string | null,
  ): Promise<void> {
    if (newParentId === null) return;

    if (newParentId === id) {
      throw new BadRequestException('A folder cannot be moved inside itself.');
    }

    const parent = await this.prisma.folder.findUnique({ where: { id: newParentId } });
    if (!parent || parent.workspaceId !== workspaceId || parent.deletedAt) {
      throw new NotFoundException(`Parent folder "${newParentId}" not found in workspace`);
    }

    const descendants = await this.collectDescendants(id);
    if (descendants.includes(newParentId)) {
      throw new BadRequestException(
        'A folder cannot be moved inside one of the folders it contains.',
      );
    }

    const parentDepth = await this.depthOf(newParentId);
    const subtreeHeight = await this.heightOf(id);
    if (parentDepth + subtreeHeight > MAX_FOLDER_DEPTH) {
      throw new BadRequestException(
        `That move would nest folders more than ${MAX_FOLDER_DEPTH} levels deep.`,
      );
    }
  }

  /** Is there already a live folder with this name in the same place? */
  private findSiblingByName(
    workspaceId: string,
    parentFolderId: string | null,
    name: string,
    excludeId?: string,
  ) {
    return this.prisma.folder.findFirst({
      where: {
        workspaceId,
        parentFolderId,
        deletedAt: null,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId && { id: { not: excludeId } }),
      },
    });
  }

  /** How many levels down this folder sits. A top-level folder is 1. */
  private async depthOf(folderId: string): Promise<number> {
    let depth = 1;
    let current = await this.prisma.folder.findUnique({
      where: { id: folderId },
      select: { parentFolderId: true },
    });
    while (current?.parentFolderId) {
      depth++;
      if (depth > MAX_FOLDER_DEPTH) break;
      current = await this.prisma.folder.findUnique({
        where: { id: current.parentFolderId },
        select: { parentFolderId: true },
      });
    }
    return depth;
  }

  /** How many levels this folder's own subtree spans. A leaf is 1. */
  private async heightOf(folderId: string): Promise<number> {
    let height = 1;
    let level = [folderId];
    while (level.length > 0) {
      const children = await this.prisma.folder.findMany({
        where: { parentFolderId: { in: level }, deletedAt: null },
        select: { id: true },
      });
      if (children.length === 0) break;
      height++;
      if (height > MAX_FOLDER_DEPTH) break;
      level = children.map((c) => c.id);
    }
    return height;
  }

  /**
   * Soft-delete a folder and all its descendants + mark their documents as DELETED.
   */
  async delete(id: string, user: DevUserPayload): Promise<void> {
    const folder = await this.prisma.folder.findUnique({
      where: { id },
      select: { workspaceId: true, name: true, deletedAt: true },
    });
    if (!folder) throw new NotFoundException(`Folder "${id}" not found`);
    if (folder.deletedAt) throw new BadRequestException(`Folder is already in trash`);
    assertEditorOrAbove(user, folder.workspaceId);

    const allFolderIds = await this.collectDescendants(id);
    const now = new Date();

    const [, binned] = await this.prisma.$transaction([
      this.prisma.folder.updateMany({
        where: { id: { in: allFolderIds } },
        data: { deletedAt: now },
      }),
      this.prisma.document.updateMany({
        where: {
          folderId: { in: allFolderIds },
          status: { not: DocumentStatus.DELETED },
        },
        data: { status: DocumentStatus.DELETED },
      }),
    ]);

    // One entry for the folder, with the count, so the activity log explains
    // why a batch of documents left the live list at once.
    this.audit.log({
      workspaceId: folder.workspaceId,
      userId: user.id,
      action: AuditAction.FOLDER_DELETED,
      entityType: AuditEntityType.FOLDER,
      entityId: id,
      metadata: { folderName: folder.name, folders: allFolderIds.length, documents: binned.count },
    });
  }

  /**
   * Restore a soft-deleted folder and all its descendants + restore their documents to ACTIVE.
   */
  async restore(id: string, user: DevUserPayload): Promise<void> {
    const folder = await this.prisma.folder.findUnique({
      where: { id },
      select: { workspaceId: true, name: true, deletedAt: true },
    });
    if (!folder) throw new NotFoundException(`Folder "${id}" not found`);
    if (!folder.deletedAt) throw new BadRequestException(`Folder is not in trash`);
    assertEditorOrAbove(user, folder.workspaceId);

    const allFolderIds = await this.collectDeletedDescendants(id);

    const [, restored] = await this.prisma.$transaction([
      this.prisma.folder.updateMany({
        where: { id: { in: allFolderIds } },
        data: { deletedAt: null },
      }),
      this.prisma.document.updateMany({
        where: {
          folderId: { in: allFolderIds },
          status: DocumentStatus.DELETED,
        },
        data: { status: DocumentStatus.ACTIVE },
      }),
    ]);

    this.audit.log({
      workspaceId: folder.workspaceId,
      userId: user.id,
      action: AuditAction.FOLDER_RESTORED,
      entityType: AuditEntityType.FOLDER,
      entityId: id,
      metadata: { folderName: folder.name, folders: allFolderIds.length, documents: restored.count },
    });
  }

  /** BFS to collect a folder and all its non-deleted descendants. */
  private async collectDescendants(rootId: string): Promise<string[]> {
    const ids: string[] = [rootId];
    const queue: string[] = [rootId];
    while (queue.length > 0) {
      const parentId = queue.shift()!;
      const children = await this.prisma.folder.findMany({
        where: { parentFolderId: parentId, deletedAt: null },
        select: { id: true },
      });
      for (const child of children) {
        ids.push(child.id);
        queue.push(child.id);
      }
    }
    return ids;
  }

  /** BFS to collect a deleted folder and all its deleted descendants. */
  private async collectDeletedDescendants(rootId: string): Promise<string[]> {
    const ids: string[] = [rootId];
    const queue: string[] = [rootId];
    while (queue.length > 0) {
      const parentId = queue.shift()!;
      const children = await this.prisma.folder.findMany({
        where: { parentFolderId: parentId, deletedAt: { not: null } },
        select: { id: true },
      });
      for (const child of children) {
        ids.push(child.id);
        queue.push(child.id);
      }
    }
    return ids;
  }
}
