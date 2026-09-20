import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_SERVICE } from '../storage/storage.module';
import type { IStorageService } from '../storage/storage.interface';
import type { DevUserPayload } from '../../common/guards/dev-auth.guard';

/**
 * The two things privacy law says a person must be able to do without
 * asking: take everything with them, and delete everything.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
  ) {}

  // ---- export ------------------------------------------------------- //

  /**
   * Everything held about the person, as one JSON document: profile, plan,
   * workspaces they belong to, every document in the workspaces they own
   * with its dates, labels and AI-found fields, reminders, share links, and
   * their activity log. File contents are listed by name and size; the
   * documents themselves download from the app as usual.
   */
  async exportAccount(user: DevUserPayload) {
    const [profile, memberships, ownedWorkspaceIds] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { id: true, email: true, firstName: true, lastName: true, plan: true, planSource: true, planRenewsAt: true, aiActionsUsed: true, aiCreditActions: true, createdAt: true },
      }),
      this.prisma.workspaceUser.findMany({
        where: { userId: user.id },
        select: { role: true, status: true, createdAt: true, workspace: { select: { id: true, name: true, plan: true, type: true, createdAt: true } } },
      }),
      this.ownedWorkspaceIds(user.id),
    ]);

    const documents = await this.prisma.document.findMany({
      where: { workspaceId: { in: ownedWorkspaceIds } },
      select: {
        id: true, workspaceId: true, name: true, description: true, fileName: true, fileType: true, status: true,
        expiryDate: true, renewalDueDate: true, isReminderEnabled: true, createdAt: true, updatedAt: true,
        folder: { select: { name: true } },
        tags: { select: { tag: { select: { name: true } } } },
        metadata: { select: { key: true, value: true } },
        versions: { select: { versionNumber: true, fileSizeBytes: true, mimeType: true, createdAt: true } },
        reminders: true,
        shares: { select: { id: true, shareType: true, expiresAt: true, allowDownload: true, isActive: true, createdAt: true, recipientEmails: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const [apiKeys, activity] = await Promise.all([
      this.prisma.apiKey.findMany({ where: { userId: user.id }, select: { name: true, prefix: true, scopes: true, createdAt: true, lastUsedAt: true, revokedAt: true } }),
      this.prisma.auditLog.findMany({
        where: { userId: user.id },
        select: { action: true, entityType: true, entityId: true, metadata: true, createdAt: true, workspace: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      about: 'Everything DockyDoc holds about this account. Document files are downloaded from the app; this file lists them.',
      profile,
      workspaces: memberships.map((m) => ({ ...m.workspace, role: m.role, status: m.status, joinedAt: m.createdAt })),
      documents: documents.map((d) => ({
        ...d,
        folder: d.folder?.name ?? null,
        tags: d.tags.map((t) => t.tag.name),
        metadata: Object.fromEntries(d.metadata.map((m) => [m.key, m.value])),
        versions: d.versions.map((v) => ({ ...v, fileSizeBytes: Number(v.fileSizeBytes) })),
      })),
      apiKeys,
      activity,
    };
  }

  // ---- deletion ----------------------------------------------------- //

  /** Owned workspaces that still have other members: deletion is refused until they are handed over. */
  async deletionBlockers(userId: string): Promise<{ workspaceId: string; name: string; otherMembers: number }[]> {
    const owned = await this.prisma.workspace.findMany({
      where: { members: { some: { userId, role: 'OWNER', status: 'ACTIVE' } } },
      select: { id: true, name: true, _count: { select: { members: { where: { status: 'ACTIVE', userId: { not: userId } } } } } },
    });
    return owned.filter((w) => w._count.members > 0).map((w) => ({ workspaceId: w.id, name: w.name, otherMembers: w._count.members }));
  }

  /**
   * Delete the person and everything only they own. Workspaces with other
   * members must be handed over first; their contributions to workspaces
   * owned by others are reassigned to that workspace's owner, so those
   * workspaces stay intact.
   */
  async deleteAccount(user: DevUserPayload): Promise<{ deletedWorkspaces: number; deletedDocuments: number }> {
    const blockers = await this.deletionBlockers(user.id);
    if (blockers.length > 0) {
      throw new BadRequestException(
        `Hand over or empty these workspaces first, so other people's documents are not deleted by your choice: ${blockers.map((b) => `${b.name} (${b.otherMembers} other member${b.otherMembers === 1 ? '' : 's'})`).join(', ')}.`,
      );
    }

    const ownedIds = await this.ownedWorkspaceIds(user.id);

    // 1. Files in storage for every document in the workspaces being deleted.
    const versions = await this.prisma.documentVersion.findMany({
      where: { document: { workspaceId: { in: ownedIds } } },
      select: { storageKey: true },
    });
    let deletedFiles = 0;
    for (const v of versions) {
      try {
        await this.storage.delete(v.storageKey);
        deletedFiles++;
      } catch (err) {
        this.logger.warn(`Could not delete file ${v.storageKey} during account deletion: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const deletedDocuments = await this.prisma.document.count({ where: { workspaceId: { in: ownedIds } } });

    // 2. Database: reassign what they did in other people's workspaces, then delete what is theirs.
    await this.prisma.$transaction(async (tx) => {
      const otherMemberships = await tx.workspaceUser.findMany({
        where: { userId: user.id, workspaceId: { notIn: ownedIds } },
        select: { workspaceId: true },
      });
      for (const { workspaceId } of otherMemberships) {
        const owner = await tx.workspaceUser.findFirst({
          where: { workspaceId, role: 'OWNER', status: 'ACTIVE', userId: { not: user.id } },
          select: { userId: true },
        });
        if (!owner) continue;
        const to = owner.userId;
        await tx.document.updateMany({ where: { workspaceId, ownerUserId: user.id }, data: { ownerUserId: to } });
        await tx.documentVersion.updateMany({ where: { uploadedById: user.id, document: { workspaceId } }, data: { uploadedById: to } });
        await tx.folder.updateMany({ where: { workspaceId, createdById: user.id }, data: { createdById: to } });
        await tx.documentShare.updateMany({ where: { createdById: user.id, document: { workspaceId } }, data: { createdById: to } });
        await tx.workspaceInvitation.updateMany({ where: { workspaceId, createdById: user.id }, data: { createdById: to } });
      }
      await tx.workspaceInvitation.updateMany({ where: { acceptedById: user.id }, data: { acceptedById: null } });
      await tx.internalDocumentShare.deleteMany({ where: { sharedWithUserId: user.id } });
      await tx.shareAccessLog.updateMany({ where: { accessedByUserId: user.id }, data: { accessedByUserId: null } });

      // Workspaces they own cascade to documents, versions, shares, reminders, logs, invitations.
      if (ownedIds.length > 0) await tx.workspace.deleteMany({ where: { id: { in: ownedIds } } });
      // Memberships, API keys and audit rows (set null) follow the schema's rules.
      await tx.user.delete({ where: { id: user.id } });
    });

    // 3. The sign-in identity at Clerk, so the email can sign up fresh later.
    await this.deleteClerkUser(user.clerkId);

    this.logger.log(`Account ${user.id} deleted: ${ownedIds.length} workspaces, ${deletedDocuments} documents, ${deletedFiles} files`);
    return { deletedWorkspaces: ownedIds.length, deletedDocuments };
  }

  private async deleteClerkUser(clerkId: string | null): Promise<void> {
    const secretKey = this.config.get<string>('CLERK_SECRET_KEY');
    if (!clerkId || !secretKey) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createClerkClient } = require('@clerk/backend') as typeof import('@clerk/backend');
      await createClerkClient({ secretKey }).users.deleteUser(clerkId);
    } catch (err) {
      // The database is already clean; a stray Clerk identity cannot reach any data.
      this.logger.error(`Clerk user ${clerkId} could not be deleted: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async ownedWorkspaceIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.workspaceUser.findMany({
      where: { userId, role: 'OWNER', status: 'ACTIVE' },
      select: { workspaceId: true },
    });
    return rows.map((r) => r.workspaceId);
  }
}
