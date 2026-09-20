import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { WorkspaceType, WorkspaceUserRole, WorkspaceUserStatus } from '@prisma/client';

// ------------------------------------------------------------------ //
// Request DTOs
// ------------------------------------------------------------------ //

export class SwitchWorkspaceDto {
  @ApiProperty({ description: 'ID of the workspace to switch to' })
  @IsString()
  @IsNotEmpty()
  workspaceId!: string;
}

// ------------------------------------------------------------------ //
// Response DTOs
// ------------------------------------------------------------------ //

/**
 * A single workspace membership — included in /me and /auth/workspaces responses.
 */
export class WorkspaceMembershipDto {
  @ApiProperty()
  workspaceId!: string;

  @ApiProperty()
  workspaceName!: string;

  @ApiProperty()
  workspaceSlug!: string;

  @ApiProperty({ enum: WorkspaceType })
  workspaceType!: WorkspaceType;

  @ApiProperty({ enum: WorkspaceUserRole })
  role!: WorkspaceUserRole;

  @ApiProperty({ enum: WorkspaceUserStatus })
  status!: WorkspaceUserStatus;
}

/**
 * Response shape for GET /api/v1/auth/me
 */
export class MeResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'True for the people named in PLATFORM_ADMIN_EMAILS, who can open the platform admin page' })
  isPlatformAdmin!: boolean;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ description: 'FREE, PERSONAL, BUSINESS, TEAM or ENTERPRISE' })
  plan!: string;

  @ApiProperty({ type: [WorkspaceMembershipDto] })
  workspaces!: WorkspaceMembershipDto[];

  @ApiProperty({ type: WorkspaceMembershipDto, nullable: true })
  defaultWorkspace!: WorkspaceMembershipDto | null;
}

/**
 * Response shape for POST /api/v1/auth/switch-workspace
 */
export class SwitchWorkspaceResponseDto {
  @ApiProperty()
  workspaceId!: string;

  @ApiProperty()
  workspaceName!: string;

  @ApiProperty()
  workspaceSlug!: string;

  @ApiProperty({ enum: WorkspaceType })
  workspaceType!: WorkspaceType;

  @ApiProperty({ enum: WorkspaceUserRole })
  role!: WorkspaceUserRole;
}
