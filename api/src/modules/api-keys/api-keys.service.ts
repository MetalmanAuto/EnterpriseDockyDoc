import * as crypto from 'crypto';
import type { WorkspacePlan } from '@prisma/client';
import { PLANS } from '../billing/plans';
import { PlanLimitException } from '../../common/exceptions/plan-limit.exception';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { DevUserPayload } from '../../common/guards/dev-auth.guard';
import type { ApiKeyDto, CreateApiKeyDto, CreatedApiKeyDto } from './dto/api-key.dto';

/** What the guard attaches to a request that came in with a key. */
export interface ApiKeyContext {
  id: string;
  name: string;
  scopes: ApiKeyScope[];
}

/**
 * Keys look like `dd_live_` followed by 40 hex characters. The prefix makes
 * one recognisable in a log or a paste, and lets the auth guard tell a key
 * from a Clerk session token without a database round trip.
 */
export const API_KEY_PREFIX = 'dd_live_';
const KEY_BYTES = 20;
/** How much of the key the list shows: `dd_live_3f9a` is enough to tell keys apart. */
const DISPLAY_PREFIX_LENGTH = API_KEY_PREFIX.length + 4;

const WORKSPACE_INCLUDE = {
  workspaces: {
    where: { status: 'ACTIVE' as const },
    include: { workspace: true },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

function hashKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  /** API access is part of Business and above. */
  assertPlanAllowsApi(user: { plan: WorkspacePlan }): void {
    if (!PLANS[user.plan].apiAccess) {
      throw new PlanLimitException('api_requires_business', 'API keys, REST and MCP access are part of the Business plan and above.', user.plan, 'BUSINESS');
    }
  }

  /**
   * Mint a key. The full key is returned exactly once, here; from then on the
   * database holds its hash and the first few characters.
   */
  async create(user: DevUserPayload, dto: CreateApiKeyDto): Promise<CreatedApiKeyDto> {
    this.assertPlanAllowsApi(user);
    const raw = API_KEY_PREFIX + crypto.randomBytes(KEY_BYTES).toString('hex');
    const scopes = dto.canWrite
      ? [ApiKeyScope.DOCUMENTS_READ, ApiKeyScope.DOCUMENTS_WRITE]
      : [ApiKeyScope.DOCUMENTS_READ];

    const record = await this.prisma.apiKey.create({
      data: {
        userId: user.id,
        name: dto.name.trim(),
        prefix: raw.slice(0, DISPLAY_PREFIX_LENGTH),
        keyHash: hashKey(raw),
        scopes,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });

    return { ...this.toDto(record), key: raw };
  }

  async list(user: DevUserPayload): Promise<ApiKeyDto[]> {
    const keys = await this.prisma.apiKey.findMany({
      where: { userId: user.id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return keys.map((k) => this.toDto(k));
  }

  /** Revoking keeps the row, so a later audit can still say which key did what. */
  async revoke(user: DevUserPayload, id: string): Promise<void> {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key || key.revokedAt) throw new NotFoundException('API key not found');
    if (key.userId !== user.id) throw new ForbiddenException('This key belongs to someone else');
    await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  /**
   * Resolve a raw key to the person it belongs to. Null means "not a valid
   * key"; the guard turns that into a 401 without saying which check failed.
   */
  async authenticate(
    raw: string,
  ): Promise<{ user: DevUserPayload; key: ApiKeyContext } | null> {
    if (!raw.startsWith(API_KEY_PREFIX)) return null;

    const key = await this.prisma.apiKey.findUnique({
      where: { keyHash: hashKey(raw) },
      include: { user: { include: WORKSPACE_INCLUDE } },
    });
    if (!key || key.revokedAt) return null;
    if (key.expiresAt && key.expiresAt <= new Date()) return null;
    if (!key.user.isActive) return null;

    // Best effort; a busy key must not pay for a write on every request.
    void this.prisma.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    const { user, ...rest } = key;
    return {
      user,
      key: { id: rest.id, name: rest.name, scopes: rest.scopes },
    };
  }

  private toDto(k: {
    id: string;
    name: string;
    prefix: string;
    scopes: ApiKeyScope[];
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    createdAt: Date;
  }): ApiKeyDto {
    return {
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      canWrite: k.scopes.includes(ApiKeyScope.DOCUMENTS_WRITE),
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
      createdAt: k.createdAt,
    };
  }
}
