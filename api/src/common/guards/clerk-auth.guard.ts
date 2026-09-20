import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiKeysService, API_KEY_PREFIX, type ApiKeyContext } from '../../modules/api-keys/api-keys.service';
import { ApiKeyScope } from '@prisma/client';
import type { User, WorkspaceUser, Workspace } from '@prisma/client';
import type { Request } from 'express';

export type DevUserPayload = User & {
  workspaces: (WorkspaceUser & {
    workspace: Workspace;
  })[];
};

const WORKSPACE_INCLUDE = {
  workspaces: {
    where: { status: 'ACTIVE' as const },
    include: { workspace: true },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly apiKeys: ApiKeysService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const secretKey = process.env.CLERK_SECRET_KEY;

    // A personal API key, from other software acting as the person who made
    // it. Checked first, in both auth modes: the key prefix says what it is
    // without a database round trip, and a Clerk token never starts that way.
    const bearer = request.headers.authorization;
    if (bearer?.startsWith(`Bearer ${API_KEY_PREFIX}`)) {
      return this.verifyApiKey(request, bearer.slice('Bearer '.length));
    }

    if (secretKey) {
      return this.verifyClerkToken(request, secretKey);
    }

    return this.verifyDevHeader(request);
  }

  // ------------------------------------------------------------------ //
  // API key path
  // ------------------------------------------------------------------ //

  private async verifyApiKey(request: Request, raw: string): Promise<boolean> {
    const result = await this.apiKeys.authenticate(raw);
    if (!result) {
      throw new UnauthorizedException('Invalid or revoked API key');
    }

    // A read-only key may look but not touch. GET and HEAD are the only
    // methods that change nothing; everything else needs the write scope.
    const method = request.method.toUpperCase();
    const reads = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
    if (!reads && !result.key.scopes.includes(ApiKeyScope.DOCUMENTS_WRITE)) {
      // The machine-facing find and deliver calls are POSTs that write
      // nothing of the user's; they check the read scope themselves.
      if (!request.path.includes('/integrations/') && !request.path.endsWith('/mcp')) {
        throw new ForbiddenException('This API key is read-only');
      }
    }

    this.apiKeys.assertPlanAllowsApi(result.user);
    (request as Request & { devUser: DevUserPayload; apiKey: ApiKeyContext }).devUser = result.user;
    (request as Request & { devUser: DevUserPayload; apiKey: ApiKeyContext }).apiKey = result.key;
    return true;
  }

  // ------------------------------------------------------------------ //
  // Clerk JWT path
  // ------------------------------------------------------------------ //

  private async verifyClerkToken(
    request: Request,
    secretKey: string,
  ): Promise<boolean> {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }
    const token = authHeader.slice(7);

    let clerkUserId: string;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { verifyToken } = require('@clerk/backend') as typeof import('@clerk/backend');
      const payload = await verifyToken(token, { secretKey });
      clerkUserId = payload.sub;
    } catch (err) {
      throw new UnauthorizedException(
        err instanceof Error ? err.message : 'Invalid or expired Clerk token',
      );
    }

    // Fast path: user already linked by Clerk ID
    let user = await this.prisma.user.findUnique({
      where: { clerkId: clerkUserId },
      include: WORKSPACE_INCLUDE,
    });

    if (!user) {
      this.logger.log(`[Auth] First login for clerkId=${clerkUserId} — running linkClerkUser`);
      user = await this.linkClerkUser(clerkUserId, secretKey);
    } else {
      this.logger.log(`[Auth] Fast-path login: userId=${user.id} email=${user.email} workspaces=${user.workspaces.length}`);
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    if (user.workspaces.length === 0) {
      this.logger.log(`[Auth] User ${user.email} has no workspace — creating personal workspace`);
      user = await this.ensurePersonalWorkspace(user);
      this.logger.log(`[Auth] Personal workspace created for ${user.email}: ${user.workspaces[0]?.workspace?.name}`);
    }

    (request as Request & { devUser: DevUserPayload }).devUser = user;
    return true;
  }

  // ------------------------------------------------------------------ //
  // First-login: link or create Clerk user
  // ------------------------------------------------------------------ //

  private async linkClerkUser(
    clerkUserId: string,
    secretKey: string,
  ): Promise<DevUserPayload> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClerkClient } = require('@clerk/backend') as typeof import('@clerk/backend');
    const clerk = createClerkClient({ secretKey });
    const clerkUser = await clerk.users.getUser(clerkUserId);

    const email =
      clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

    if (!email) {
      throw new UnauthorizedException('Clerk user has no email address');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (!existing) {
      const firstName = clerkUser.firstName?.trim() || email.split('@')[0];
      const lastName = clerkUser.lastName?.trim() || '';

      try {
        return await this.prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: { email, clerkId: clerkUserId, firstName, lastName, isActive: true },
          });
          const workspace = await tx.workspace.create({
            data: {
              name: this.buildWorkspaceName(firstName),
              slug: this.generateSlug(firstName),
              type: 'PERSONAL',
              status: 'ACTIVE',
            },
          });
          await tx.workspaceUser.create({
            data: { workspaceId: workspace.id, userId: user.id, role: 'OWNER', status: 'ACTIVE' },
          });
          return tx.user.findUniqueOrThrow({
            where: { id: user.id },
            include: WORKSPACE_INCLUDE,
          });
        });
      } catch (err: unknown) {
        // BUG 7 fix: concurrent first-login race — another request already created this
        // user between our findUnique and create. Fall through to the link path.
        const prismaErr = err as { code?: string };
        if (prismaErr?.code === 'P2002') {
          const raceCreated = await this.prisma.user.findUnique({ where: { email } });
          if (raceCreated) {
            return this.prisma.user.update({
              where: { id: raceCreated.id },
              data: { clerkId: clerkUserId },
              include: WORKSPACE_INCLUDE,
            });
          }
        }
        throw err;
      }
    }

    // Existing user — write clerkId for fast lookup on subsequent requests
    return this.prisma.user.update({
      where: { id: existing.id },
      data: { clerkId: clerkUserId },
      include: WORKSPACE_INCLUDE,
    });
  }

  // ------------------------------------------------------------------ //
  // Ensure workspace exists for an already-authenticated user
  // ------------------------------------------------------------------ //

  private async ensurePersonalWorkspace(user: DevUserPayload): Promise<DevUserPayload> {
    const firstName = user.firstName?.trim() || user.email.split('@')[0];
    // BUG 6 fix: retry once on slug unique-constraint collision (P2002)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const workspace = await tx.workspace.create({
            data: {
              name: this.buildWorkspaceName(firstName),
              slug: this.generateSlug(firstName),
              type: 'PERSONAL',
              status: 'ACTIVE',
            },
          });
          await tx.workspaceUser.create({
            data: { workspaceId: workspace.id, userId: user.id, role: 'OWNER', status: 'ACTIVE' },
          });
          return tx.user.findUniqueOrThrow({
            where: { id: user.id },
            include: WORKSPACE_INCLUDE,
          });
        });
      } catch (err: unknown) {
        const prismaErr = err as { code?: string; meta?: { target?: string[] } };
        if (prismaErr?.code === 'P2002' && prismaErr?.meta?.target?.includes('slug')) {
          continue; // retry with fresh random suffix
        }
        throw err;
      }
    }
    throw new Error('Failed to generate unique workspace slug after 3 attempts');
  }

  // ------------------------------------------------------------------ //
  // Slug helpers
  // ------------------------------------------------------------------ //

  private buildWorkspaceName(firstName: string): string {
    return firstName ? `${firstName}'s Workspace` : 'My Workspace';
  }

  private generateSlug(firstName: string): string {
    const base = this.buildWorkspaceName(firstName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    return `${base}-${Math.random().toString(36).slice(2, 7)}`;
  }

  // ------------------------------------------------------------------ //
  // Dev-header fallback (no CLERK_SECRET_KEY)
  // ------------------------------------------------------------------ //

  private async verifyDevHeader(request: Request): Promise<boolean> {
    const email =
      (request.headers['x-dev-user-email'] as string | undefined)?.trim() ??
      'alice@acmecorp.com';

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: WORKSPACE_INCLUDE,
    });

    if (!user) {
      throw new UnauthorizedException(
        `Dev user "${email}" not found. Check that the database is seeded and the email matches a user record.`,
      );
    }

    // BUG 2 fix: dev path must also reject deactivated accounts
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    (request as Request & { devUser: DevUserPayload }).devUser = user;
    return true;
  }
}
