import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { WorkspaceUserRole } from '@prisma/client';

export class GrantWorkspaceAccessDto {
  @ApiProperty({ type: [String], description: 'Workspaces to add this person to. The caller must be OWNER or ADMIN of each.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  workspaceIds!: string[];

  @ApiPropertyOptional({ enum: WorkspaceUserRole, description: 'Role in each target workspace. Default: their role in the current one.' })
  @IsOptional()
  @IsEnum(WorkspaceUserRole)
  role?: WorkspaceUserRole;
}

export class GrantWorkspaceAccessResultDto {
  @ApiProperty() workspaceId!: string;
  @ApiProperty() workspaceName!: string;
  @ApiProperty({ enum: ['added', 'reactivated', 'already_member', 'forbidden'] })
  outcome!: 'added' | 'reactivated' | 'already_member' | 'forbidden';
  @ApiPropertyOptional({ enum: WorkspaceUserRole }) role?: WorkspaceUserRole;
}
