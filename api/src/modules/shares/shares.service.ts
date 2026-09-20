import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { DocumentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_SERVICE } from '../storage/storage.module';
import type { IStorageService } from '../storage/storage.interface';
import { AuditService, AuditAction, AuditEntityType } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { BillingService } from '../billing/billing.service';
import { buildExternalShareEmail } from './share-emails';
import {
  assertWorkspaceMembership,
  assertEditorOrAbove,
} from '../../common/helpers/workspace-access.helper';
import type { DevUserPayload } from '../../common/guards/dev-auth.guard';
import {
  createAccessGrant,
  generateShareToken,
  hashPassword,
  verifyAccessGrant,
  verifyPassword,
} from './share-crypto.util';
import type {
  CreateExternalShareDto,
  DocumentSharesResponseDto,
  ExternalShareDto,
  PublicShareInfoDto,
  VerifyShareResponseDto,
} from './dto/share.dto';

// ------------------------------------------------------------------ //
// Helpers
// ------------------------------------------------------------------ //

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

// ------------------------------------------------------------------ //
// In-memory rate limiter for share password verification
// ------------------------------------------------------------------ //

const MAX_VERIFY_ATTEMPTS = 10;
const VERIFY_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface RateLimitEntry {
  count: number;
  firstAt: number;
}

@Injectable()
export class SharesService {
  private readonly logger = new Logger(SharesService.name);

  /**
   * Rate-limit state for share password verification.
   * Key: `${token}:${ip}` — scoped to one token+IP pair.
   * Entries are pruned lazily on each check.
   */
  private readonly verifyAttempts = new Map<string, RateLimitEntry>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly billing: BillingService,
  ) {
    // Validate required secrets at startup — fail fast rather than silently using an insecure default
    if (!process.env.SHARE_GRANT_SECRET) {
      throw new Error(
        'SHARE_GRANT_SECRET environment variable is not set. ' +
        'Set a strong random secret (≥32 chars) before starting the server. ' +
        'Example: openssl rand -hex 32',
      );
    }
  }

  /** Enforce rate limit; throws 429 when exceeded. Call BEFORE verifying password. */
  private checkVerifyRateLimit(token: string, ip: string): void {
    const key = `${token}:${ip}`;
    const now = Date.now();
    const entry = this.verifyAttempts.get(key);

    if (!entry || now - entry.firstAt > VERIFY_WINDOW_MS) {
      // Fresh window — reset counter
      this.verifyAttempts.set(key, { count: 1, firstAt: now });
      return;
    }

    if (entry.count >= MAX_VERIFY_ATTEMPTS) {
      const retryAfterSec = Math.ceil(
        (VERIFY_WINDOW_MS - (now - entry.firstAt)) / 1000,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Too many verification attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`,
          retryAfter: retryAfterSec,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.count++;
  }

  /** Clear rate-limit state on successful verification. */
  private clearVerifyRateLimit(token: string, ip: string): void {
    this.verifyAttempts.delete(`${token}:${ip}`);
  }

  // ------------------------------------------------------------------ //
  // POST /documents/:id/share/external
  // ------------------------------------------------------------------ //

  async createExternalShare(
    documentId: string,
    dto: CreateExternalShareDto,
    user: DevUserPayload,
  ): Promise<ExternalShareDto> {
    const doc = await this.requireAccessibleDocument(documentId, user);

    const token = generateShareToken();
    const passwordHash = dto.password ? hashPassword(dto.password) : null;
    const expiresAt = await this.billing.shareLinkExpiry(doc.workspaceId, {
      password: dto.password,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    });
    const recipients = [...new Set((dto.recipients ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean))];

    const share = await this.prisma.documentShare.create({
      data: {
        documentId,
        createdById: user.id,
        shareType: 'EXTERNAL_LINK',
        token,
        passwordHash,
        expiresAt,
        allowDownload: dto.allowDownload,
        recipientEmails: recipients,
        isActive: true,
      },
      include: { createdBy: { select: USER_SELECT } },
    });

    await this.emailExternalRecipients(recipients, {
      documentName: doc.name,
      sharedByName: displayName(user),
      shareUrl: `${this.mail.appUrl}/share/${token}`,
      expiresAt,
      hasPassword: !!passwordHash,
      allowDownload: dto.allowDownload,
      message: dto.message?.trim() || undefined,
    });

    this.audit.log({
      workspaceId: doc.workspaceId,
      userId: user.id,
      action: AuditAction.DOCUMENT_SHARED_EXTERNAL,
      entityType: AuditEntityType.SHARE,
      entityId: share.id,
      metadata: {
        documentName: doc.name,
        hasPassword: !!dto.password,
        allowDownload: dto.allowDownload,
        emailedTo: recipients.length,
      },
    });

    return this.toExternalShareDto(share);
  }

  // ------------------------------------------------------------------ //
  // GET /documents/:id/shares
  // ------------------------------------------------------------------ //

  async getDocumentShares(
    documentId: string,
    user: DevUserPayload,
  ): Promise<DocumentSharesResponseDto> {
    const doc = await this.requireReadableDocument(documentId, user);

    const shares = await this.prisma.documentShare.findMany({
      where: { documentId, isActive: true, shareType: 'EXTERNAL_LINK' },
      include: { createdBy: { select: USER_SELECT } },
      orderBy: { createdAt: 'desc' },
    });

    return { externalShares: shares.map((share) => this.toExternalShareDto(share)) };
  }

  // ------------------------------------------------------------------ //
  // POST /shares/:shareId/revoke
  // ------------------------------------------------------------------ //

  async revokeShare(shareId: string, user: DevUserPayload): Promise<void> {
    const share = await this.prisma.documentShare.findUnique({
      where: { id: shareId },
      include: { document: { select: { workspaceId: true } } },
    });

    if (!share) throw new NotFoundException(`Share "${shareId}" not found`);

    // Only the share creator or an ADMIN/OWNER may revoke a share
    const membership = user.workspaces.find(
      (w) => w.workspaceId === share.document.workspaceId && w.status === 'ACTIVE',
    );
    if (!membership) {
      throw new ForbiddenException('You are not a member of this workspace.');
    }
    const isCreator = share.createdById === user.id;
    const isAdminOrOwner = ['ADMIN', 'OWNER'].includes(membership.role);
    if (!isCreator && !isAdminOrOwner) {
      throw new ForbiddenException(
        'Only the share creator or an Admin/Owner can revoke this share.',
      );
    }

    if (!share.isActive) {
      throw new ConflictException('Share is already revoked');
    }

    await this.prisma.documentShare.update({
      where: { id: shareId },
      data: { isActive: false },
    });

    this.audit.log({
      workspaceId: share.document.workspaceId,
      userId: user.id,
      action: AuditAction.SHARE_REVOKED,
      entityType: AuditEntityType.SHARE,
      entityId: shareId,
      metadata: { shareType: share.shareType },
    });
  }

  // ------------------------------------------------------------------ //
  // GET /public/shares/:token — unauthenticated
  // ------------------------------------------------------------------ //

  async getPublicShareInfo(
    token: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<PublicShareInfoDto> {
    const share = await this.findValidPublicShare(token);

    // Log the view access
    await this.prisma.shareAccessLog.create({
      data: {
        documentShareId: share.id,
        accessType: 'VIEW',
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
    });

    return {
      id: share.id,
      documentId: share.documentId,
      documentName: share.document.name,
      allowDownload: share.allowDownload,
      expiresAt: share.expiresAt?.toISOString() ?? null,
      requiresPassword: !!share.passwordHash,
      shareType: share.shareType,
    };
  }

  // ------------------------------------------------------------------ //
  // POST /public/shares/:token/verify — unauthenticated
  // ------------------------------------------------------------------ //

  async verifySharePassword(
    token: string,
    password: string,
    ip: string,
  ): Promise<VerifyShareResponseDto> {
    // Rate-limit before any DB access to prevent enumeration via timing
    this.checkVerifyRateLimit(token, ip);

    const share = await this.findValidPublicShare(token);

    if (!share.passwordHash) {
      throw new BadRequestException('This share is not password protected');
    }

    if (!verifyPassword(password, share.passwordHash)) {
      throw new UnauthorizedException('Incorrect password');
    }

    // Clear rate-limit state on success
    this.clearVerifyRateLimit(token, ip);

    const { grant, expiresIn } = createAccessGrant(share.id);
    return { accessGrant: grant, expiresIn };
  }

  // ------------------------------------------------------------------ //
  // GET /public/shares/:token/download — unauthenticated
  // ------------------------------------------------------------------ //

  async getPublicShareDownloadInfo(
    token: string,
    grant?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ storageKey: string; fileName: string; mimeType: string }> {
    const share = await this.findValidPublicShare(token);

    if (!share.allowDownload) {
      throw new ForbiddenException('Download is not allowed for this share');
    }

    // Verify access: grant token only — password never accepted directly on download
    if (share.passwordHash) {
      const grantShareId = grant ? verifyAccessGrant(grant) : null;

      if (grantShareId !== share.id) {
        throw new UnauthorizedException(
          'A valid access grant is required. Verify the password via POST /verify first.',
        );
      }
    }

    // Get the latest version for download
    const version = await this.prisma.documentVersion.findFirst({
      where: { documentId: share.documentId },
      orderBy: { versionNumber: 'desc' },
    });

    if (!version) throw new NotFoundException('No file version found');

    // Note: skipping existsAsync check — controller stream handler catches missing-file errors
    // Log download access
    await this.prisma.shareAccessLog.create({
      data: {
        documentShareId: share.id,
        accessType: 'DOWNLOAD',
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
    });

    this.audit.log({
      workspaceId: share.document.workspaceId,
      userId: null, // external / unauthenticated
      action: AuditAction.DOCUMENT_DOWNLOADED,
      entityType: AuditEntityType.DOCUMENT,
      entityId: share.documentId,
      metadata: { documentName: share.document.name, external: true, shareId: share.id },
    });

    return {
      storageKey: version.storageKey,
      fileName: share.document.fileName,
      mimeType: version.mimeType,
    };
  }

  // ------------------------------------------------------------------ //
  // Private helpers
  // ------------------------------------------------------------------ //

  /**
   * Used for read operations (e.g. listing shares).
   * Any active workspace member may view shares on a non-deleted document.
   */
  private async requireReadableDocument(documentId: string, user: DevUserPayload) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, workspaceId: true, status: true, name: true, fileName: true },
    });

    if (!doc) throw new NotFoundException(`Document "${documentId}" not found`);
    if (doc.status === DocumentStatus.DELETED) {
      throw new BadRequestException('Document has been deleted');
    }

    assertWorkspaceMembership(user, doc.workspaceId);
    return doc;
  }

  /**
   * Used for write operations (create share, revoke).
   * Requires EDITOR role or above — VIEWERs are blocked.
   */
  /** Delivery never decides whether the share exists; a failure is logged and the share stands. */
  private async emailExternalRecipients(
    recipients: string[],
    input: Parameters<typeof buildExternalShareEmail>[0],
  ): Promise<void> {
    if (recipients.length === 0) return;
    const email = buildExternalShareEmail(input);
    for (const to of recipients) {
      try {
        await this.mail.send({ to: [to], ...email });
      } catch (err) {
        this.logger.error(`Share email to ${to} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private async requireAccessibleDocument(documentId: string, user: DevUserPayload) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, workspaceId: true, status: true, name: true, fileName: true },
    });

    if (!doc) throw new NotFoundException(`Document "${documentId}" not found`);
    if (doc.status === DocumentStatus.DELETED) {
      throw new BadRequestException('Cannot share a deleted document');
    }

    assertEditorOrAbove(user, doc.workspaceId);
    return doc;
  }

  private async findValidPublicShare(token: string) {
    const share = await this.prisma.documentShare.findUnique({
      where: { token },
      include: {
        document: {
          select: { id: true, name: true, fileName: true, status: true, workspaceId: true },
        },
      },
    });

    if (!share) throw new NotFoundException('Share not found');
    if (!share.isActive) throw new ForbiddenException('This share has been revoked');
    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new ForbiddenException('This share link has expired');
    }
    if (share.document.status === DocumentStatus.DELETED) {
      throw new ForbiddenException('The document associated with this share no longer exists');
    }

    return share;
  }

  private toExternalShareDto(share: {
    id: string;
    token: string | null;
    expiresAt: Date | null;
    allowDownload: boolean;
    passwordHash: string | null;
    isActive: boolean;
    createdAt: Date;
    recipientEmails?: string[];
    createdBy: { id: string; firstName: string; lastName: string; email: string };
  }): ExternalShareDto {
    return {
      id: share.id,
      token: share.token ?? '',
      expiresAt: share.expiresAt?.toISOString() ?? null,
      allowDownload: share.allowDownload,
      hasPassword: !!share.passwordHash,
      recipientEmails: share.recipientEmails ?? [],
      isActive: share.isActive,
      createdAt: share.createdAt.toISOString(),
      createdBy: share.createdBy,
    };
  }
}


function displayName(user: { firstName?: string | null; lastName?: string | null; email: string }): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email;
}
