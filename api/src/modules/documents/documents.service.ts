import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DocumentStatus } from '@prisma/client';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { assertSafeUpload } from '../../common/upload/sniff';
import { STORAGE_SERVICE } from '../storage/storage.module';
import type { IStorageService } from '../storage/storage.interface';
import { SearchIndexerService } from '../search/search-indexer.service';
import { AuditService, AuditAction, AuditEntityType } from '../audit/audit.service';
import { AiService } from '../ai/ai.service';
import { ReminderPlannerService } from '../reminders/reminder-planner.service';
import {
  assertWorkspaceMembership,
  assertEditorOrAbove,
  assertAdminOrAbove,
} from '../../common/helpers/workspace-access.helper';
import type { DevUserPayload } from '../../common/guards/dev-auth.guard';
import {
  BulkDeleteDto,
  BulkMoveDto,
  BulkResultDto,
  BulkTagDto,
  CreateDocumentDto,
  DocumentDetailDto,
  DocumentListItemDto,
  DocumentReminderDto,
  SetDocumentRemindersDto,
  SetDocumentTagsDto,
  UpdateDocumentDto,
  DocumentQueryDto,
} from './dto/document.dto';
import type { UploadDocumentDto, UploadVersionDto } from './dto/upload-document.dto';

// ------------------------------------------------------------------ //
// Prisma include shapes
// ------------------------------------------------------------------ //

/** The only AI metadata the list route needs; the detail route loads everything. */
const AI_LIST_KEYS: string[] = ['ai:status', 'ai:overallConfidence'];

const DOC_LIST_INCLUDE = {
  folder: { select: { id: true, name: true } },
  owner: { select: { id: true, firstName: true, lastName: true, email: true } },
  tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
  metadata: {
    where: { key: { in: AI_LIST_KEYS } },
    select: { key: true, value: true },
  },
  _count: { select: { versions: true } },
} as const;

const DOC_DETAIL_INCLUDE = {
  folder: { select: { id: true, name: true } },
  owner: { select: { id: true, firstName: true, lastName: true, email: true } },
  workspace: { select: { id: true, name: true } },
  tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
  versions: {
    include: {
      uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { versionNumber: 'desc' as const },
  },
  metadata: { orderBy: { key: 'asc' as const } },
  _count: { select: { versions: true } },
} as const;

// ------------------------------------------------------------------ //
// Helpers
// ------------------------------------------------------------------ //

/** Build a structured, safe storage key for a file version. */
function buildStorageKey(
  workspaceId: string,
  documentId: string,
  versionNumber: number,
  originalName: string,
): string {
  const sanitized = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${workspaceId}/${documentId}/v${versionNumber}/${sanitized}`;
}

/** Extract file extension from original filename, defaulting to 'bin'. */
function fileExtension(originalName: string): string {
  return path.extname(originalName).replace('.', '').toLowerCase() || 'bin';
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly indexer: SearchIndexerService,
    private readonly audit: AuditService,
    private readonly aiService: AiService,
    private readonly reminderPlanner: ReminderPlannerService,
    private readonly billing: BillingService,
  ) {}

  // ------------------------------------------------------------------ //
  // List
  // ------------------------------------------------------------------ //

  async findAll(query: DocumentQueryDto, user: DevUserPayload): Promise<DocumentListItemDto[]> {
    assertWorkspaceMembership(user, query.workspaceId);

    // "Tagged with A and B" means both, so each tag becomes its own condition
    const tagIds = (query.tagIds ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const docs = await this.prisma.document.findMany({
      where: {
        workspaceId: query.workspaceId,
        status: query.status ?? { not: DocumentStatus.DELETED },
        ...(query.folderId && { folderId: query.folderId }),
        ...(query.ownerUserId && { ownerUserId: query.ownerUserId }),
        ...(tagIds.length > 0 && {
          AND: tagIds.map((tagId) => ({ tags: { some: { tagId } } })),
        }),
      },
      include: DOC_LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return docs.map((d) => this.toListItemDto(d));
  }

  // ------------------------------------------------------------------ //
  // Detail
  // ------------------------------------------------------------------ //

  async findById(id: string, user: DevUserPayload): Promise<DocumentDetailDto> {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      include: DOC_DETAIL_INCLUDE,
    });

    if (!doc) throw new NotFoundException(`Document "${id}" not found`);
    assertWorkspaceMembership(user, doc.workspaceId);

    return this.toDetailDto(doc);
  }

  // ------------------------------------------------------------------ //
  // Create (metadata-only, no file binary)
  // ------------------------------------------------------------------ //

  async create(dto: CreateDocumentDto, user: DevUserPayload): Promise<DocumentDetailDto> {
    assertEditorOrAbove(user, dto.workspaceId);
    await this.billing.assertDocumentQuota(dto.workspaceId);

    const created = await this.prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          workspaceId: dto.workspaceId,
          folderId: dto.folderId ?? null,
          ownerUserId: dto.ownerUserId,
          name: dto.name,
          description: dto.description ?? null,
          fileName: dto.fileName,
          fileType: dto.fileType,
          status: DocumentStatus.ACTIVE,
          currentVersionNumber: 1,
        },
      });

      await tx.documentVersion.create({
        data: {
          documentId: doc.id,
          versionNumber: 1,
          storageKey: `pending/${dto.workspaceId}/${doc.id}/v1/${dto.fileName}`,
          fileSizeBytes: BigInt(0),
          mimeType: dto.mimeType,
          uploadedById: dto.ownerUserId,
        },
      });

      return doc;
    });

    this.audit.log({
      workspaceId: dto.workspaceId,
      userId: user.id,
      action: AuditAction.DOCUMENT_CREATED,
      entityType: AuditEntityType.DOCUMENT,
      entityId: created.id,
      metadata: { documentName: dto.name, fileName: dto.fileName },
    });

    return this.findById(created.id, user);
  }

  // ------------------------------------------------------------------ //
  // Upload — create document + save file in one operation
  // ------------------------------------------------------------------ //

  async upload(
    dto: UploadDocumentDto,
    file: Express.Multer.File,
    user: DevUserPayload,
  ): Promise<DocumentDetailDto> {
    assertEditorOrAbove(user, dto.workspaceId);
    await this.billing.assertDocumentQuota(dto.workspaceId);
    await this.billing.assertStorageQuota(dto.workspaceId, file.size);
    await assertSafeUpload(file.buffer, file.mimetype, file.originalname);

    const uploadStart = Date.now();
    const fileSizeMb = (file.size / 1024 / 1024).toFixed(2);
    this.logger.log(`Upload start: "${file.originalname}" (${fileSizeMb} MB, ${file.mimetype})`);

    const ext = fileExtension(file.originalname);

    // 1. Create DB records in a transaction
    const t0 = Date.now();
    const { docId, storageKey } = await this.prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          workspaceId: dto.workspaceId,
          folderId: dto.folderId ?? null,
          ownerUserId: user.id,
          name: dto.name,
          description: dto.description ?? null,
          fileName: file.originalname,
          fileType: ext,
          status: DocumentStatus.ACTIVE,
          currentVersionNumber: 1,
        },
      });

      const storageKey = buildStorageKey(dto.workspaceId, doc.id, 1, file.originalname);

      await tx.documentVersion.create({
        data: {
          documentId: doc.id,
          versionNumber: 1,
          storageKey,
          fileSizeBytes: BigInt(file.size),
          mimeType: file.mimetype,
          uploadedById: user.id,
        },
      });

      // Attach tags (comma-separated IDs)
      if (dto.tags) {
        const tagIds = dto.tags
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean);
        for (const tagId of tagIds) {
          await tx.documentTagMapping
            .create({ data: { documentId: doc.id, tagId } })
            .catch(() => {}); // skip unknown tags
        }
      }

      // Attach metadata (JSON array)
      if (dto.metadata) {
        try {
          const entries = JSON.parse(dto.metadata) as { key: string; value: string }[];
          for (const entry of entries) {
            if (entry.key && entry.value !== undefined) {
              await tx.documentMetadata.create({
                data: { documentId: doc.id, key: entry.key, value: String(entry.value) },
              });
            }
          }
        } catch {
          // Invalid JSON metadata — skip silently
        }
      }

      return { docId: doc.id, storageKey };
    });
    this.logger.debug(`Upload DB tx: ${Date.now() - t0}ms (docId=${docId})`);

    // 2. Persist file after transaction commits
    const t1 = Date.now();
    await this.storage.save(storageKey, file.buffer);
    this.logger.debug(`Upload storage save: ${Date.now() - t1}ms (key=${storageKey})`);

    // 3. Index for search (non-blocking — never fails the upload)
    void this.indexer.indexDocument(docId, file);

    // 4. Trigger AI extraction asynchronously (fire-and-forget — never blocks upload response)
    void this.aiService.extractDocument(docId).catch(() => {});

    this.audit.log({
      workspaceId: dto.workspaceId,
      userId: user.id,
      action: AuditAction.DOCUMENT_CREATED,
      entityType: AuditEntityType.DOCUMENT,
      entityId: docId,
      metadata: { documentName: dto.name, fileName: file.originalname },
    });

    const t2 = Date.now();
    const result = await this.findById(docId, user);
    this.logger.log(
      `Upload complete: "${file.originalname}" → docId=${docId} total=${Date.now() - uploadStart}ms ` +
      `(db=${t1 - t0}ms, storage=${t2 - t1}ms, response=${Date.now() - t2}ms)`,
    );
    return result;
  }

  // ------------------------------------------------------------------ //
  // Upload new version
  // ------------------------------------------------------------------ //

  async uploadVersion(
    id: string,
    file: Express.Multer.File,
    _dto: UploadVersionDto,
    user: DevUserPayload,
  ): Promise<DocumentDetailDto> {
    const existing = await this.prisma.document.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Document "${id}" not found`);
    assertEditorOrAbove(user, existing.workspaceId);
    await this.billing.assertStorageQuota(existing.workspaceId, file.size);
    await assertSafeUpload(file.buffer, file.mimetype, file.originalname);

    const nextVersion = existing.currentVersionNumber + 1;

    const { storageKey } = await this.prisma.$transaction(async (tx) => {
      const storageKey = buildStorageKey(
        existing.workspaceId,
        id,
        nextVersion,
        file.originalname,
      );

      await tx.documentVersion.create({
        data: {
          documentId: id,
          versionNumber: nextVersion,
          storageKey,
          fileSizeBytes: BigInt(file.size),
          mimeType: file.mimetype,
          uploadedById: user.id,
        },
      });

      await tx.document.update({
        where: { id },
        data: { currentVersionNumber: nextVersion },
      });

      return { storageKey };
    });

    await this.storage.save(storageKey, file.buffer);

    // Re-index with updated file content
    void this.indexer.indexDocument(id, file);

    // Re-run AI extraction on the new version (fire-and-forget)
    void this.aiService.extractDocument(id).catch((err) => {
      this.logger.warn(`AI re-extraction failed after version upload for ${id}: ${(err as Error).message}`);
    });

    this.audit.log({
      workspaceId: existing.workspaceId,
      userId: user.id,
      action: AuditAction.DOCUMENT_VERSION_ADDED,
      entityType: AuditEntityType.DOCUMENT,
      entityId: id,
      metadata: { documentName: existing.name, version: nextVersion },
    });

    return this.findById(id, user);
  }

  // ------------------------------------------------------------------ //
  // Download — returns a stream + headers for HTTP streaming
  // ------------------------------------------------------------------ //

  async getDownloadInfo(
    id: string,
    user: DevUserPayload,
  ): Promise<{ storageKey: string; fileName: string; mimeType: string }> {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!doc) throw new NotFoundException(`Document "${id}" not found`);
    assertWorkspaceMembership(user, doc.workspaceId);

    const version = doc.versions[0];
    if (!version) throw new NotFoundException(`No versions found for document "${id}"`);

    // Note: we don't call existsAsync here — that would be an extra S3 HeadObject round-trip.
    // The controller's stream error handler will catch missing-file errors at stream time.
    this.audit.log({
      workspaceId: doc.workspaceId,
      userId: user.id,
      action: AuditAction.DOCUMENT_DOWNLOADED,
      entityType: AuditEntityType.DOCUMENT,
      entityId: id,
      metadata: { documentName: doc.fileName, version: version.versionNumber },
    });

    return { storageKey: version.storageKey, fileName: doc.fileName, mimeType: version.mimeType };
  }

  async getVersionDownloadInfo(
    id: string,
    versionNumber: number,
    user: DevUserPayload,
  ): Promise<{ storageKey: string; fileName: string; mimeType: string }> {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException(`Document "${id}" not found`);
    assertWorkspaceMembership(user, doc.workspaceId);

    const version = await this.prisma.documentVersion.findUnique({
      where: { documentId_versionNumber: { documentId: id, versionNumber } },
    });

    if (!version) {
      throw new NotFoundException(`Version ${versionNumber} not found for document "${id}"`);
    }

    return { storageKey: version.storageKey, fileName: doc.fileName, mimeType: version.mimeType };
  }

  // ------------------------------------------------------------------ //
  // Update
  // ------------------------------------------------------------------ //

  async update(
    id: string,
    dto: UpdateDocumentDto,
    user: DevUserPayload,
  ): Promise<DocumentListItemDto> {
    const existing = await this.prisma.document.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Document "${id}" not found`);
    assertEditorOrAbove(user, existing.workspaceId);

    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.folderId !== undefined && { folderId: dto.folderId }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.expiryDate !== undefined && {
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
        }),
        ...(dto.renewalDueDate !== undefined && {
          renewalDueDate: dto.renewalDueDate ? new Date(dto.renewalDueDate) : null,
        }),
        ...(dto.isReminderEnabled !== undefined && { isReminderEnabled: dto.isReminderEnabled }),
        ...(dto.status === DocumentStatus.ARCHIVED && { isReminderEnabled: false }),
      },
      include: DOC_LIST_INCLUDE,
    });
    if (dto.status === DocumentStatus.ARCHIVED && existing.status !== DocumentStatus.ARCHIVED) {
      // A one-time document that has run its course: no more reminder emails.
      await this.reminderPlanner.setEnabled(id, false);
    }

    this.audit.log({
      workspaceId: existing.workspaceId,
      userId: user.id,
      action: AuditAction.DOCUMENT_UPDATED,
      entityType: AuditEntityType.DOCUMENT,
      entityId: id,
      metadata: { documentName: updated.name },
    });

    const expiryChanged =
      dto.expiryDate !== undefined &&
      (existing.expiryDate?.getTime() ?? null) !== (updated.expiryDate?.getTime() ?? null);
    if (expiryChanged) {
      // A new expiry date supersedes any snooze that was set for the old one.
      if (existing.remindersSnoozedUntil) {
        await this.prisma.document.update({ where: { id }, data: { remindersSnoozedUntil: null } });
      }
      await this.reminderPlanner.syncForExpiryChange(id, existing.expiryDate, updated.expiryDate);
    } else if (dto.isReminderEnabled !== undefined && dto.isReminderEnabled !== existing.isReminderEnabled) {
      await this.reminderPlanner.setEnabled(id, dto.isReminderEnabled);
    }

    return this.toListItemDto(updated);
  }

  // ------------------------------------------------------------------ //
  // Soft delete
  // ------------------------------------------------------------------ //

  async softDelete(
    id: string,
    user: DevUserPayload,
  ): Promise<{ id: string; status: DocumentStatus }> {
    const existing = await this.prisma.document.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Document "${id}" not found`);
    assertEditorOrAbove(user, existing.workspaceId);
    if (existing.legalHold) throw new ForbiddenException(`"${existing.name}" is on legal hold and cannot be deleted until the hold is lifted.`);

    const deleted = await this.prisma.document.update({
      where: { id },
      data: { status: DocumentStatus.DELETED },
    });

    // File is intentionally NOT removed from storage on soft delete.
    // Physical deletion (shredding) is a separate operation.

    this.audit.log({
      workspaceId: existing.workspaceId,
      userId: user.id,
      action: AuditAction.DOCUMENT_DELETED,
      entityType: AuditEntityType.DOCUMENT,
      entityId: id,
      metadata: { documentName: existing.name },
    });

    return { id: deleted.id, status: deleted.status };
  }

  // ------------------------------------------------------------------ //
  // Legal hold: freezes a document against deletion and retention
  // ------------------------------------------------------------------ //

  async setLegalHold(id: string, hold: boolean, user: DevUserPayload): Promise<DocumentDetailDto> {
    const existing = await this.prisma.document.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Document "${id}" not found`);
    assertAdminOrAbove(user, existing.workspaceId);
    await this.prisma.document.update({ where: { id }, data: { legalHold: hold } });
    this.audit.log({
      workspaceId: existing.workspaceId,
      userId: user.id,
      action: AuditAction.DOCUMENT_UPDATED,
      entityType: AuditEntityType.DOCUMENT,
      entityId: id,
      metadata: { documentName: existing.name, legalHold: hold },
    });
    return this.findById(id, user);
  }

  // ------------------------------------------------------------------ //
  // Shred (permanent delete)
  // ------------------------------------------------------------------ //

  async shred(id: string, user: DevUserPayload): Promise<void> {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      include: { versions: { select: { storageKey: true } } },
    });

    if (!doc) throw new NotFoundException(`Document "${id}" not found`);
    assertAdminOrAbove(user, doc.workspaceId);

    if (doc.status !== DocumentStatus.DELETED) {
      throw new BadRequestException(
        'Only soft-deleted documents can be shredded. Delete the document first.',
      );
    }
    if (doc.legalHold) throw new ForbiddenException(`"${doc.name}" is on legal hold and cannot be shredded until the hold is lifted.`);

    // Delete all physical files before removing DB records
    for (const version of doc.versions) {
      try {
        await this.storage.delete(version.storageKey);
      } catch {
        // Non-fatal: file may already be gone
      }
    }

    // Cascade delete: Prisma schema cascades versions, shares, reminders, metadata, tags
    await this.prisma.document.delete({ where: { id } });

    this.audit.log({
      workspaceId: doc.workspaceId,
      userId: user.id,
      action: AuditAction.DOCUMENT_SHREDDED,
      entityType: AuditEntityType.DOCUMENT,
      entityId: id,
      metadata: { documentName: doc.name },
    });
  }

  // ------------------------------------------------------------------ //
  // Delete a specific version
  // ------------------------------------------------------------------ //

  async deleteVersion(
    id: string,
    versionNumber: number,
    user: DevUserPayload,
  ): Promise<DocumentDetailDto> {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      include: { versions: { orderBy: { versionNumber: 'asc' } } },
    });
    if (!doc) throw new NotFoundException(`Document "${id}" not found`);
    assertEditorOrAbove(user, doc.workspaceId);

    if (doc.versions.length <= 1) {
      throw new BadRequestException(
        'Cannot delete the only version of a document. Delete the document instead.',
      );
    }

    const version = doc.versions.find((v) => v.versionNumber === versionNumber);
    if (!version) {
      throw new NotFoundException(`Version ${versionNumber} not found for document "${id}"`);
    }

    // If deleting the current version, roll back to the highest remaining version
    let newCurrentVersion = doc.currentVersionNumber;
    if (versionNumber === doc.currentVersionNumber) {
      const remaining = doc.versions
        .filter((v) => v.versionNumber !== versionNumber)
        .map((v) => v.versionNumber);
      newCurrentVersion = Math.max(...remaining);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.documentVersion.delete({
        where: { documentId_versionNumber: { documentId: id, versionNumber } },
      });
      if (newCurrentVersion !== doc.currentVersionNumber) {
        await tx.document.update({
          where: { id },
          data: { currentVersionNumber: newCurrentVersion },
        });
      }
    });

    // Remove physical file (non-fatal)
    try {
      await this.storage.delete(version.storageKey);
    } catch {
      // File may not exist or already deleted
    }

    this.audit.log({
      workspaceId: doc.workspaceId,
      userId: user.id,
      action: AuditAction.DOCUMENT_VERSION_ADDED, // reuse closest existing action
      entityType: AuditEntityType.DOCUMENT,
      entityId: id,
      metadata: { documentName: doc.name, deletedVersion: versionNumber, newCurrentVersion },
    });

    return this.findById(id, user);
  }

  // ------------------------------------------------------------------ //
  // Tags — set/replace
  // ------------------------------------------------------------------ //

  async setTags(
    id: string,
    dto: SetDocumentTagsDto,
    user: DevUserPayload,
  ): Promise<{ id: string; name: string; color: string | null }[]> {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException(`Document "${id}" not found`);
    assertEditorOrAbove(user, doc.workspaceId);

    await this.prisma.$transaction(async (tx) => {
      await tx.documentTagMapping.deleteMany({ where: { documentId: id } });
      if (dto.tagIds.length > 0) {
        await tx.documentTagMapping.createMany({
          data: dto.tagIds.map((tagId) => ({ documentId: id, tagId })),
          skipDuplicates: true,
        });
      }
    });

    const updated = await this.prisma.document.findUnique({
      where: { id },
      include: {
        tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      },
    });

    return (updated?.tags ?? []).map((t) => t.tag);
  }

  // ------------------------------------------------------------------ //
  // Metadata
  // ------------------------------------------------------------------ //

  async setMetadata(
    id: string,
    entries: { key: string; value: string }[],
    user: DevUserPayload,
  ): Promise<{ id: string; key: string; value: string }[]> {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException(`Document "${id}" not found`);
    assertEditorOrAbove(user, doc.workspaceId);

    // Upsert each entry (unique on documentId+key), delete any keys not in the new list
    await this.prisma.$transaction(async (tx) => {
      // Remove entries whose keys are no longer present
      const keys = entries.map((e) => e.key);
      await tx.documentMetadata.deleteMany({
        where: { documentId: id, key: { notIn: keys } },
      });
      // Upsert each entry
      for (const entry of entries) {
        await tx.documentMetadata.upsert({
          where: { documentId_key: { documentId: id, key: entry.key } },
          create: { documentId: id, key: entry.key, value: entry.value },
          update: { value: entry.value },
        });
      }
    });

    const updated = await this.prisma.documentMetadata.findMany({
      where: { documentId: id },
      orderBy: { key: 'asc' },
    });
    return updated.map((m) => ({ id: m.id, key: m.key, value: m.value }));
  }

  // ------------------------------------------------------------------ //
  // Reminders
  // ------------------------------------------------------------------ //

  async getReminders(id: string, user: DevUserPayload): Promise<DocumentReminderDto[]> {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException(`Document "${id}" not found`);
    assertWorkspaceMembership(user, doc.workspaceId);

    const reminders = await this.prisma.documentReminder.findMany({
      where: { documentId: id },
      orderBy: { remindAt: 'asc' },
    });

    return reminders.map((r) => ({
      id: r.id,
      documentId: r.documentId,
      remindAt: r.remindAt,
      channel: r.channel,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async setReminders(
    id: string,
    dto: SetDocumentRemindersDto,
    user: DevUserPayload,
  ): Promise<DocumentReminderDto[]> {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException(`Document "${id}" not found`);
    assertEditorOrAbove(user, doc.workspaceId);

    const expiryDate = dto.expiryDate !== undefined
      ? (dto.expiryDate ? new Date(dto.expiryDate) : null)
      : doc.expiryDate;

    await this.prisma.$transaction(async (tx) => {
      // Update expiry fields on the document
      await tx.document.update({
        where: { id },
        data: {
          ...(dto.expiryDate !== undefined && {
            expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          }),
          ...(dto.renewalDueDate !== undefined && {
            renewalDueDate: dto.renewalDueDate ? new Date(dto.renewalDueDate) : null,
          }),
          ...(dto.isReminderEnabled !== undefined && { isReminderEnabled: dto.isReminderEnabled }),
        },
      });

      const enabled = dto.isReminderEnabled ?? doc.isReminderEnabled;
      await this.reminderPlanner.regenerate(
        tx,
        id,
        enabled ? expiryDate : null,
        dto.offsetDays ?? [],
        dto.channel ?? 'EMAIL',
      );
    });

    this.audit.log({
      workspaceId: doc.workspaceId,
      userId: user.id,
      action: AuditAction.REMINDER_UPDATED,
      entityType: AuditEntityType.REMINDER,
      entityId: id,
      metadata: {
        documentName: doc.name,
        isReminderEnabled: dto.isReminderEnabled,
        offsetDays: dto.offsetDays,
      },
    });

    return this.getReminders(id, user);
  }

  /** Hold reminder emails for `days` days (0 resumes immediately). */
  async snoozeReminders(id: string, days: number, user: DevUserPayload): Promise<DocumentListItemDto> {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException(`Document "${id}" not found`);
    assertEditorOrAbove(user, doc.workspaceId);

    const until = days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
    const updated = await this.prisma.document.update({
      where: { id },
      data: { remindersSnoozedUntil: until },
      include: DOC_LIST_INCLUDE,
    });

    this.audit.log({
      workspaceId: doc.workspaceId,
      userId: user.id,
      action: AuditAction.REMINDER_UPDATED,
      entityType: AuditEntityType.REMINDER,
      entityId: id,
      metadata: { documentName: doc.name, snoozedUntil: until?.toISOString() ?? null, snoozeDays: days },
    });

    return this.toListItemDto(updated);
  }

  // ------------------------------------------------------------------ //
  // Bulk actions
  // ------------------------------------------------------------------ //

  /**
   * Move several documents into a folder (or out of any folder with null).
   * Documents outside the caller's workspace, or already deleted, are skipped
   * rather than failing the whole batch.
   */
  async bulkMove(dto: BulkMoveDto, user: DevUserPayload): Promise<BulkResultDto> {
    const { allowed, skipped, workspaceId } = await this.resolveBulkTargets(dto.documentIds, user);
    if (allowed.length === 0) return { updated: 0, skipped };

    const folderId = dto.folderId ?? null;
    if (folderId) {
      const folder = await this.prisma.folder.findUnique({ where: { id: folderId } });
      if (!folder || folder.workspaceId !== workspaceId || folder.deletedAt) {
        throw new NotFoundException(`Folder "${folderId}" not found in this workspace`);
      }
    }

    const result = await this.prisma.document.updateMany({
      where: { id: { in: allowed } },
      data: { folderId },
    });

    this.audit.log({
      workspaceId,
      userId: user.id,
      action: AuditAction.DOCUMENT_UPDATED,
      entityType: AuditEntityType.DOCUMENT,
      entityId: allowed[0],
      metadata: { bulk: 'move', count: result.count, folderId },
    });

    return { updated: result.count, skipped };
  }

  /** Add or remove labels across several documents in one go. */
  async bulkTag(dto: BulkTagDto, user: DevUserPayload): Promise<BulkResultDto> {
    const { allowed, skipped, workspaceId } = await this.resolveBulkTargets(dto.documentIds, user);
    if (allowed.length === 0 || dto.tagIds.length === 0) {
      return { updated: 0, skipped };
    }

    const tags = await this.prisma.documentTag.findMany({
      where: { id: { in: dto.tagIds }, workspaceId },
      select: { id: true },
    });
    if (tags.length === 0) {
      throw new NotFoundException('None of those labels belong to this workspace');
    }
    const tagIds = tags.map((t) => t.id);

    if (dto.action === 'add') {
      const data = allowed.flatMap((documentId) => tagIds.map((tagId) => ({ documentId, tagId })));
      await this.prisma.documentTagMapping.createMany({ data, skipDuplicates: true });
    } else {
      await this.prisma.documentTagMapping.deleteMany({
        where: { documentId: { in: allowed }, tagId: { in: tagIds } },
      });
    }

    this.audit.log({
      workspaceId,
      userId: user.id,
      action: AuditAction.DOCUMENT_UPDATED,
      entityType: AuditEntityType.DOCUMENT,
      entityId: allowed[0],
      metadata: { bulk: `tag:${dto.action}`, count: allowed.length, tagIds },
    });

    return { updated: allowed.length, skipped };
  }

  /**
   * Move several documents to trash in one go. This is the same soft delete as
   * the single-document route: files stay in storage and everything can be
   * restored from Trash, so a mis-click is recoverable.
   */
  async bulkDelete(dto: BulkDeleteDto, user: DevUserPayload): Promise<BulkResultDto> {
    const { allowed, skipped, workspaceId } = await this.resolveBulkTargets(dto.documentIds, user);
    if (allowed.length === 0) return { updated: 0, skipped };

    const result = await this.prisma.document.updateMany({
      where: { id: { in: allowed } },
      data: { status: DocumentStatus.DELETED },
    });

    this.audit.log({
      workspaceId,
      userId: user.id,
      action: AuditAction.DOCUMENT_DELETED,
      entityType: AuditEntityType.DOCUMENT,
      entityId: allowed[0],
      metadata: { bulk: 'delete', count: result.count, documentIds: allowed },
    });

    return { updated: result.count, skipped };
  }

  /**
   * Narrow a list of document IDs down to the live ones the caller may edit.
   * Every document in a batch must sit in the same workspace.
   */
  private async resolveBulkTargets(
    documentIds: string[],
    user: DevUserPayload,
  ): Promise<{ allowed: string[]; skipped: string[]; workspaceId: string }> {
    const unique = Array.from(new Set(documentIds));
    if (unique.length === 0) {
      throw new BadRequestException('No documents selected.');
    }

    const docs = await this.prisma.document.findMany({
      where: { id: { in: unique }, status: { not: DocumentStatus.DELETED } },
      select: { id: true, workspaceId: true },
    });

    const workspaceIds = new Set(docs.map((d) => d.workspaceId));
    if (workspaceIds.size > 1) {
      throw new BadRequestException('All documents must be in the same workspace.');
    }

    const workspaceId = docs[0]?.workspaceId;
    if (!workspaceId) {
      throw new NotFoundException('None of those documents could be found.');
    }
    assertEditorOrAbove(user, workspaceId);

    const found = new Set(docs.map((d) => d.id));
    return {
      allowed: docs.map((d) => d.id),
      skipped: unique.filter((id) => !found.has(id)),
      workspaceId,
    };
  }

  // ------------------------------------------------------------------ //
  // Private helpers
  // ------------------------------------------------------------------ //

  private toDetailDto(
    doc: Awaited<ReturnType<typeof this.prisma.document.findUnique>> & {
      folder: { id: string; name: string } | null;
      owner: { id: string; firstName: string; lastName: string; email: string };
      workspace: { id: string; name: string };
      tags: { tag: { id: string; name: string; color: string | null } }[];
      versions: {
        id: string;
        versionNumber: number;
        storageKey: string;
        fileSizeBytes: bigint;
        mimeType: string;
        uploadedBy: { id: string; firstName: string; lastName: string; email: string };
        createdAt: Date;
      }[];
      metadata: { id: string; key: string; value: string }[];
      _count: { versions: number };
    },
  ): DocumentDetailDto {
    const aiMeta = new Map(doc!.metadata.map((m) => [m.key, m.value]));
    const rawAiStatus = aiMeta.get('ai:status');
    const aiStatus: DocumentDetailDto['aiStatus'] =
      rawAiStatus === 'done' || rawAiStatus === 'running' ||
      rawAiStatus === 'failed' || rawAiStatus === 'disabled'
        ? rawAiStatus
        : 'none';
    const parsedConfidence = Number(aiMeta.get('ai:overallConfidence'));

    return {
      id: doc!.id,
      workspaceId: doc!.workspaceId,
      name: doc!.name,
      description: doc!.description,
      fileName: doc!.fileName,
      fileType: doc!.fileType,
      status: doc!.status,
      currentVersionNumber: doc!.currentVersionNumber,
      folder: doc!.folder,
      owner: doc!.owner,
      workspace: doc!.workspace,
      tags: doc!.tags.map((t) => t.tag),
      versionCount: doc!._count.versions,
      expiryDate: doc!.expiryDate,
      renewalDueDate: doc!.renewalDueDate,
      isReminderEnabled: doc!.isReminderEnabled,
      legalHold: doc!.legalHold,
      remindersSnoozedUntil: doc!.remindersSnoozedUntil,
      versions: doc!.versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        storageKey: v.storageKey,
        fileSizeBytes: v.fileSizeBytes.toString(),
        mimeType: v.mimeType,
        uploadedBy: v.uploadedBy,
        createdAt: v.createdAt,
      })),
      metadata: doc!.metadata,
      createdAt: doc!.createdAt,
      updatedAt: doc!.updatedAt,
      aiStatus,
      aiConfidence: Number.isFinite(parsedConfidence) ? parsedConfidence : 0,
    };
  }

  private toListItemDto(
    d: Awaited<ReturnType<typeof this.prisma.document.findMany>>[number] & {
      folder: { id: string; name: string } | null;
      owner: { id: string; firstName: string; lastName: string; email: string };
      tags: { tag: { id: string; name: string; color: string | null } }[];
      metadata?: { key: string; value: string }[];
      _count: { versions: number };
    },
  ): DocumentListItemDto {
    const aiMeta = new Map((d.metadata ?? []).map((m) => [m.key, m.value]));
    const rawAiStatus = aiMeta.get('ai:status');
    const aiStatus: DocumentListItemDto['aiStatus'] =
      rawAiStatus === 'done' || rawAiStatus === 'running' ||
      rawAiStatus === 'failed' || rawAiStatus === 'disabled'
        ? rawAiStatus
        : 'none';
    const parsedConfidence = Number(aiMeta.get('ai:overallConfidence'));

    return {
      id: d.id,
      workspaceId: d.workspaceId,
      name: d.name,
      fileName: d.fileName,
      fileType: d.fileType,
      status: d.status,
      currentVersionNumber: d.currentVersionNumber,
      folder: d.folder,
      owner: d.owner,
      tags: d.tags.map((t) => t.tag),
      versionCount: d._count.versions,
      expiryDate: d.expiryDate,
      renewalDueDate: d.renewalDueDate,
      isReminderEnabled: d.isReminderEnabled,
      legalHold: d.legalHold,
      remindersSnoozedUntil: d.remindersSnoozedUntil,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      aiStatus,
      aiConfidence: Number.isFinite(parsedConfidence) ? parsedConfidence : 0,
    };
  }
}
