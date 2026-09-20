import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { BillingService } from '../billing/billing.service';
import { ApiKeyScope, DocumentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertWorkspaceMembership } from '../../common/helpers/workspace-access.helper';
import type { DevUserPayload } from '../../common/guards/dev-auth.guard';
import { DocumentsService } from '../documents/documents.service';
import { SharesService } from '../shares/shares.service';
import { TagsService } from '../tags/tags.service';
import { MailService } from '../mail/mail.service';
import type { ApiKeyContext } from '../api-keys/api-keys.service';
import { ResolverService, type Candidate } from './resolver.service';
import type {
  DeliverDocumentsDto,
  DeliveryDto,
  FetchDocumentsDto,
  FetchResultDto,
  FindDocumentsDto,
  FindResultDto,
  IntegrationDocumentDto,
  IntegrationMeDto,
  IntegrationUploadDto,
  MatchedDocumentDto,
} from './dto/integrations.dto';

/** Below this the caller is told to ask the person which document they meant. */
const CONFIDENT = 0.6;
const DEFAULT_LINK_MINUTES = 15;
/** More than this and the resolver prompt gets long for no gain; searches narrow it first. */
const MAX_CANDIDATES = 200;

const CANDIDATE_INCLUDE = {
  workspace: { select: { id: true, name: true } },
  tags: { include: { tag: { select: { name: true } } } },
  metadata: { select: { key: true, value: true } },
  searchContent: { select: { extractedText: true } },
} as const;

type CandidateRow = {
  id: string;
  name: string;
  fileName: string;
  fileType: string;
  description: string | null;
  expiryDate: Date | null;
  updatedAt: Date;
  workspace: { id: string; name: string };
  tags: { tag: { name: string } }[];
  metadata: { key: string; value: string }[];
  searchContent: { extractedText: string } | null;
};

/**
 * The machine-facing surface: what a WhatsApp bot or an assistant calls.
 * Everything here runs as the person who owns the API key, through the same
 * services the web app uses, so it can do nothing they could not do themselves.
 */
@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
    private readonly shares: SharesService,
    private readonly tags: TagsService,
    private readonly mail: MailService,
    private readonly resolver: ResolverService,
    private readonly billing: BillingService,
  ) {}

  me(user: DevUserPayload, key: ApiKeyContext | undefined): IntegrationMeDto {
    const defaultId = this.defaultWorkspaceId(user);
    return {
      id: user.id,
      email: user.email,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim(),
      keyName: key?.name ?? 'session',
      canWrite: key ? key.scopes.includes(ApiKeyScope.DOCUMENTS_WRITE) : true,
      workspaces: user.workspaces.map((m) => ({
        id: m.workspaceId,
        name: m.workspace.name,
        role: m.role,
        isDefault: m.workspaceId === defaultId,
      })),
    };
  }

  async find(user: DevUserPayload, dto: FindDocumentsDto): Promise<FindResultDto> {
    const rows = await this.candidates(user, dto.workspaceId);
    const byId = new Map(rows.map((r) => [r.id, r]));
    await this.billing.chargeUserAiActions(user.id, 1, 'api_find');
    const resolution = await this.resolver.resolve(dto.query, rows.map(toCandidate));

    return {
      mode: resolution.mode,
      items: resolution.asks.map((a) => {
        const best = a.bestId ? byId.get(a.bestId) : undefined;
        return {
          ask: a.ask,
          match: best ? { ...toDto(best), confidence: round(a.confidence) } : null,
          alternatives: a.alternativeIds.map((id) => byId.get(id)).filter((r): r is CandidateRow => !!r).map(toDto),
        };
      }),
    };
  }

  /**
   * Hand a document over as a link that needs no login and dies on its own.
   * It is an ordinary external share, so it shows in the document's share
   * list, can be revoked there, and every download is logged.
   */
  async deliver(user: DevUserPayload, dto: DeliverDocumentsDto): Promise<DeliveryDto[]> {
    const minutes = dto.expiresInMinutes ?? DEFAULT_LINK_MINUTES;
    const expiresAt = new Date(Date.now() + minutes * 60_000);
    const out: DeliveryDto[] = [];

    for (const documentId of dto.documentIds) {
      // Checks membership and that the document is not in the bin.
      const info = await this.documents.getDownloadInfo(documentId, user);
      const doc = await this.prisma.document.findUniqueOrThrow({ where: { id: documentId }, select: { name: true } });
      const share = await this.shares.createExternalShare(
        documentId,
        { expiresAt: expiresAt.toISOString(), allowDownload: true },
        user,
      );
      out.push({
        documentId,
        name: doc.name,
        fileName: info.fileName,
        mimeType: info.mimeType,
        url: `${this.mail.appUrl}/api/v1/public/shares/${share.token}/download`,
        expiresAt,
      });
    }
    return out;
  }

  /**
   * The one call a bot needs: "my passport and UK visa" in, download links
   * out. Anything the resolver is not sure about comes back as a choice for
   * the person instead of a wrong document.
   */
  async fetch(user: DevUserPayload, dto: FetchDocumentsDto): Promise<FetchResultDto> {
    const found = await this.find(user, dto);
    const confident = found.items.filter((i) => i.match && i.match.confidence >= CONFIDENT);
    const deliveries = confident.length
      ? await this.deliver(user, {
          documentIds: confident.map((i) => i.match!.id),
          expiresInMinutes: dto.expiresInMinutes,
        })
      : [];
    const byDoc = new Map(deliveries.map((d) => [d.documentId, d]));

    return {
      mode: found.mode,
      items: found.items.map((i) => {
        const delivery = i.match ? byDoc.get(i.match.id) ?? null : null;
        return { ...i, delivery, needsChoice: !delivery && (i.alternatives.length > 0 || !!i.match) };
      }),
    };
  }

  async upload(
    user: DevUserPayload,
    key: ApiKeyContext | undefined,
    dto: IntegrationUploadDto,
    file: Express.Multer.File,
  ): Promise<IntegrationDocumentDto> {
    if (key && !key.scopes.includes(ApiKeyScope.DOCUMENTS_WRITE)) {
      throw new ForbiddenException('This API key is read-only');
    }
    const workspaceId = dto.workspaceId ?? this.defaultWorkspaceId(user);
    if (!workspaceId) throw new BadRequestException('You are not a member of any workspace');
    assertWorkspaceMembership(user, workspaceId);

    // Labels by name, created on the fly, so a bot can say "passport, travel"
    // without knowing ids.
    const labelNames = (dto.labels ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const tagIds: string[] = [];
    for (const name of labelNames) {
      const tag = await this.tags.create({ workspaceId, name }, user);
      tagIds.push(tag.id);
    }

    const name = dto.name?.trim() || file.originalname.replace(/\.[^.]+$/, '');
    const created = await this.documents.upload(
      { workspaceId, name, description: dto.description, tags: tagIds.join(',') || undefined },
      file,
      user,
    );

    const row = await this.prisma.document.findUniqueOrThrow({ where: { id: created.id }, include: CANDIDATE_INCLUDE });
    return toDto(row);
  }

  // ---- helpers ----------------------------------------------------------- //

  private async candidates(user: DevUserPayload, workspaceId?: string): Promise<CandidateRow[]> {
    let workspaceIds = user.workspaces.map((m) => m.workspaceId);
    if (workspaceId) {
      assertWorkspaceMembership(user, workspaceId);
      workspaceIds = [workspaceId];
    }
    return this.prisma.document.findMany({
      where: { workspaceId: { in: workspaceIds }, status: DocumentStatus.ACTIVE },
      include: CANDIDATE_INCLUDE,
      orderBy: { updatedAt: 'desc' },
      take: MAX_CANDIDATES,
    });
  }

  /** Same rule as /auth/me: the workspace they own, else the first one. */
  private defaultWorkspaceId(user: DevUserPayload): string | undefined {
    return (user.workspaces.find((m) => m.role === 'OWNER') ?? user.workspaces[0])?.workspaceId;
  }
}

function toCandidate(r: CandidateRow): Candidate {
  return {
    id: r.id,
    name: r.name,
    fileName: r.fileName,
    labels: r.tags.map((t) => t.tag.name),
    description: r.description,
    metadata: r.metadata,
    excerpt: r.searchContent?.extractedText?.slice(0, 300) ?? null,
    workspaceName: r.workspace.name,
  };
}

function toDto(r: CandidateRow): IntegrationDocumentDto {
  return {
    id: r.id,
    name: r.name,
    fileName: r.fileName,
    fileType: r.fileType,
    workspace: r.workspace,
    labels: r.tags.map((t) => t.tag.name),
    expiryDate: r.expiryDate,
    updatedAt: r.updatedAt,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export type { MatchedDocumentDto };
