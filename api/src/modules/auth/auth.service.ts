import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { isPlatformAdmin } from '../../common/helpers/platform-admin';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import type { DevUserPayload } from '../../common/guards/dev-auth.guard';
import {
  MeResponseDto,
  WorkspaceMembershipDto,
  SwitchWorkspaceResponseDto,
} from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  // ------------------------------------------------------------------ //
  // Login
  // ------------------------------------------------------------------ //

  async validateUser(email: string, password: string): Promise<{ id: string; email: string } | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return null;
    // passwordHash added in schema — cast until node_modules is regenerated
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hash: string | null | undefined = (user as any).passwordHash;
    // If no password set — allow in dev mode using any non-empty password
    if (!hash) {
      if (process.env.NODE_ENV !== 'production') return { id: user.id, email: user.email };
      return null;
    }
    const valid = await bcrypt.compare(password, hash);
    return valid ? { id: user.id, email: user.email } : null;
  }

  async login(userId: string): Promise<{ accessToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    const payload = { sub: user.id, email: user.email };
    return { accessToken: this.jwt.sign(payload) };
  }

  async setPassword(userId: string, password: string): Promise<void> {
    const hash = await bcrypt.hash(password, 12);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } as any });
  }

  // ------------------------------------------------------------------ //
  // Current-user context
  // ------------------------------------------------------------------ //

  getMe(devUser: DevUserPayload): MeResponseDto {
    const workspaces = this.buildMemberships(devUser);
    const defaultWorkspace =
      workspaces.find((w) => w.role === 'OWNER') ?? workspaces[0] ?? null;
    return {
      id: devUser.id,
      email: devUser.email,
      firstName: devUser.firstName,
      lastName: devUser.lastName,
      isActive: devUser.isActive,
      isPlatformAdmin: isPlatformAdmin(devUser.email),
      workspaces,
      defaultWorkspace,
    };
  }

  getUserWorkspaces(devUser: DevUserPayload): WorkspaceMembershipDto[] {
    return this.buildMemberships(devUser);
  }

  switchWorkspace(devUser: DevUserPayload, workspaceId: string): SwitchWorkspaceResponseDto {
    const membership = devUser.workspaces.find((m) => m.workspaceId === workspaceId);
    if (!membership) {
      throw new ForbiddenException(`User does not belong to workspace "${workspaceId}"`);
    }
    return {
      workspaceId: membership.workspaceId,
      workspaceName: membership.workspace.name,
      workspaceSlug: membership.workspace.slug,
      workspaceType: membership.workspace.type,
      role: membership.role,
    };
  }

  private buildMemberships(devUser: DevUserPayload): WorkspaceMembershipDto[] {
    return devUser.workspaces.map((m) => ({
      workspaceId: m.workspaceId,
      workspaceName: m.workspace.name,
      workspaceSlug: m.workspace.slug,
      workspaceType: m.workspace.type,
      role: m.role,
      status: m.status,
    }));
  }
}
