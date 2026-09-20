import * as crypto from 'crypto';
import { BillingService } from '../billing/billing.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceUserRole, WorkspaceUserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { buildInvitationEmail } from './invitation-email';
import { assertAdminOrAbove, assertWorkspaceMembership } from '../../common/helpers/workspace-access.helper';
import type { DevUserPayload } from '../../common/guards/dev-auth.guard';
import type { CreateInvitationDto } from './dto/invitation.dto';
import type {
  InvitationResponseDto,
  PublicInvitationDto,
  AcceptInvitationResponseDto,
} from './dto/invitation.dto';

/** Invitations expire after 7 days */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly billing: BillingService,
  ) {}

  // ------------------------------------------------------------------ //
  // Admin operations (workspace-scoped)
  // ------------------------------------------------------------------ //

  /**
   * Create a new PENDING invitation for the given email + role.
   * Idempotent: returns the existing pending invite if one already exists.
   */
  async create(
    workspaceId: string,
    dto: CreateInvitationDto,
    actor: DevUserPayload,
  ): Promise<InvitationResponseDto> {
    assertAdminOrAbove(actor, workspaceId);
    await this.billing.assertMemberQuota(workspaceId);

    const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) throw new NotFoundException('Workspace not found');

    const email = dto.email.toLowerCase().trim();
    const role = dto.role ?? WorkspaceUserRole.VIEWER;

    // Guard: can't invite someone already an active member
    const existingMember = await this.prisma.workspaceUser.findFirst({
      where: { workspaceId, status: 'ACTIVE', user: { email } },
    });
    if (existingMember) {
      throw new ConflictException(`${email} is already an active member of this workspace.`);
    }

    // Guard: if a valid pending invite already exists, return it
    const existingInvite = await this.prisma.workspaceInvitation.findFirst({
      where: { workspaceId, email, status: 'PENDING', expiresAt: { gt: new Date() } },
      include: { createdBy: true },
    });
    if (existingInvite) {
      return this.toResponseDto(existingInvite);
    }

    const invite = await this.prisma.workspaceInvitation.create({
      data: {
        workspaceId,
        email,
        role,
        token: crypto.randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        createdById: actor.id,
      },
      include: { createdBy: true },
    });

    await this.sendInvitationEmail(invite, ws.name);

    return this.toResponseDto(invite);
  }

  /**
   * Email the invitee their join link. Delivery never decides whether the
   * invitation exists: the row is already written, the link is on screen for
   * the admin to copy, and MailService is a no-op when RESEND_API_KEY is unset.
   * So a failure here is logged and swallowed rather than failing the request.
   */
  private async sendInvitationEmail(
    invite: { email: string; token: string; role: WorkspaceUserRole; expiresAt: Date; createdBy: { firstName: string; lastName: string } | null },
    workspaceName: string,
  ): Promise<void> {
    try {
      const invitedByName =
        [invite.createdBy?.firstName, invite.createdBy?.lastName].filter(Boolean).join(' ').trim() ||
        'A DockyDoc user';

      const email = buildInvitationEmail({
        workspaceName,
        invitedByName,
        role: invite.role,
        joinUrl: `${this.mail.appUrl}/join/${invite.token}`,
        expiresAt: invite.expiresAt,
      });

      await this.mail.send({ to: [invite.email], ...email });
    } catch (err) {
      this.logger.error(
        `Invitation email to ${invite.email} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** List PENDING (non-expired) invitations for a workspace */
  async listPending(
    workspaceId: string,
    actor: DevUserPayload,
  ): Promise<InvitationResponseDto[]> {
    assertAdminOrAbove(actor, workspaceId);

    // Mark expired invites as EXPIRED before returning
    await this.prisma.workspaceInvitation.updateMany({
      where: { workspaceId, status: 'PENDING', expiresAt: { lte: new Date() } },
      data: { status: 'EXPIRED' },
    });

    const invites = await this.prisma.workspaceInvitation.findMany({
      where: { workspaceId, status: 'PENDING' },
      include: { createdBy: true },
      orderBy: { createdAt: 'desc' },
    });

    return invites.map((i) => this.toResponseDto(i));
  }

  /** Revoke a pending invitation */
  async revoke(
    workspaceId: string,
    inviteId: string,
    actor: DevUserPayload,
  ): Promise<void> {
    assertAdminOrAbove(actor, workspaceId);

    const invite = await this.prisma.workspaceInvitation.findFirst({
      where: { id: inviteId, workspaceId },
    });
    if (!invite) throw new NotFoundException('Invitation not found');
    if (invite.status !== 'PENDING') {
      throw new BadRequestException('Only PENDING invitations can be revoked');
    }

    await this.prisma.workspaceInvitation.update({
      where: { id: inviteId },
      data: { status: 'REVOKED' },
    });
  }

  // ------------------------------------------------------------------ //
  // Public join operations
  // ------------------------------------------------------------------ //

  /** Get invitation details by token — no auth required */
  async getByToken(token: string): Promise<PublicInvitationDto> {
    const invite = await this.prisma.workspaceInvitation.findUnique({
      where: { token },
      include: {
        workspace: true,
        createdBy: true,
      },
    });

    if (!invite) throw new NotFoundException('Invitation not found or already used');

    if (invite.status === 'ACCEPTED') throw new GoneException('This invitation has already been accepted');
    if (invite.status === 'REVOKED')  throw new GoneException('This invitation has been revoked');
    if (invite.status === 'EXPIRED' || invite.expiresAt < new Date()) {
      throw new GoneException('This invitation has expired');
    }

    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      workspace: { id: invite.workspace.id, name: invite.workspace.name, type: invite.workspace.type },
      invitedBy: { firstName: invite.createdBy.firstName, lastName: invite.createdBy.lastName },
    };
  }

  /**
   * Accept an invitation.
   * The authenticated user's email must match the invitation email.
   * Creates a new WorkspaceUser record (or reactivates an existing REMOVED one).
   */
  async accept(
    token: string,
    actor: DevUserPayload,
  ): Promise<AcceptInvitationResponseDto> {
    const invite = await this.prisma.workspaceInvitation.findUnique({
      where: { token },
      include: { workspace: true },
    });

    if (!invite) throw new NotFoundException('Invitation not found');
    if (invite.status === 'ACCEPTED') throw new ConflictException('This invitation has already been accepted');
    if (invite.status === 'REVOKED')  throw new GoneException('This invitation has been revoked');
    if (invite.status === 'EXPIRED' || invite.expiresAt < new Date()) {
      throw new GoneException('This invitation has expired');
    }

    // Email must match
    if (actor.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new ForbiddenException(
        `This invitation was sent to ${invite.email}. Please sign in with that account.`,
      );
    }

    // Upsert workspace membership
    const existingMembership = await this.prisma.workspaceUser.findUnique({
      where: { userId_workspaceId: { userId: actor.id, workspaceId: invite.workspaceId } },
    });

    if (existingMembership) {
      if (existingMembership.status === WorkspaceUserStatus.ACTIVE) {
        // Already a member — just mark invite accepted and return
        await this.prisma.workspaceInvitation.update({
          where: { id: invite.id },
          data: { status: 'ACCEPTED', acceptedById: actor.id },
        });
        return {
          workspaceId: invite.workspaceId,
          workspaceName: invite.workspace.name,
          role: existingMembership.role,
        };
      }
      // Reactivate removed/invited membership with the new role
      await this.prisma.workspaceUser.update({
        where: { id: existingMembership.id },
        data: { status: WorkspaceUserStatus.ACTIVE, role: invite.role },
      });
    } else {
      // Create new membership
      await this.prisma.workspaceUser.create({
        data: {
          userId: actor.id,
          workspaceId: invite.workspaceId,
          role: invite.role,
          status: WorkspaceUserStatus.ACTIVE,
        },
      });
    }

    // Mark invitation as accepted
    await this.prisma.workspaceInvitation.update({
      where: { id: invite.id },
      data: { status: 'ACCEPTED', acceptedById: actor.id },
    });

    return {
      workspaceId: invite.workspaceId,
      workspaceName: invite.workspace.name,
      role: invite.role,
    };
  }

  // ------------------------------------------------------------------ //
  // Helpers
  // ------------------------------------------------------------------ //

  private toResponseDto(invite: {
    id: string;
    email: string;
    role: WorkspaceUserRole;
    token: string;
    expiresAt: Date;
    status: string;
    createdAt: Date;
    createdBy: { firstName: string; lastName: string };
  }): InvitationResponseDto {
    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      token: invite.token,
      expiresAt: invite.expiresAt,
      status: invite.status,
      createdBy: { firstName: invite.createdBy.firstName, lastName: invite.createdBy.lastName },
      createdAt: invite.createdAt,
    };
  }
}
