import { ApiProperty } from '@nestjs/swagger';
import { WorkspaceType, WorkspaceStatus, WorkspaceUserRole, WorkspaceUserStatus } from '@prisma/client';

export class WorkspaceMemberDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: WorkspaceUserRole })
  role!: WorkspaceUserRole;

  @ApiProperty({ enum: WorkspaceUserStatus })
  status!: WorkspaceUserStatus;

  @ApiProperty()
  joinedAt!: Date;
}

export class WorkspaceResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ enum: WorkspaceType })
  type!: WorkspaceType;

  @ApiProperty({ enum: WorkspaceStatus })
  status!: WorkspaceStatus;

  @ApiProperty()
  memberCount!: number;

  @ApiProperty({ description: 'Days deleted documents wait in the bin before shredding' })
  trashRetentionDays!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class WorkspaceDetailResponseDto extends WorkspaceResponseDto {
  @ApiProperty()
  documentCount!: number;

  @ApiProperty({ type: [WorkspaceMemberDto] })
  members!: WorkspaceMemberDto[];
}

export class WorkspaceSummaryDto {
  @ApiProperty() totalDocuments!: number;
  @ApiProperty() activeDocuments!: number;
  @ApiProperty() archivedDocuments!: number;
  @ApiProperty() expiringCount!: number;
  @ApiProperty() expiredCount!: number;
  @ApiProperty() activeShares!: number;
  @ApiProperty() memberCount!: number;
  @ApiProperty() recentUploads!: number;
}
