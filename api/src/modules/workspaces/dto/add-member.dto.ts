import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { WorkspaceUserRole, WorkspaceUserStatus } from '@prisma/client';

export class CreateWorkspaceDto {
  @ApiProperty({ description: 'Workspace name', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}

export class UpdateWorkspaceDto {
  @ApiPropertyOptional({ description: 'Days deleted documents stay in the bin before shredding, 1 to 365, capped by the plan' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  trashRetentionDays?: number;

  @ApiPropertyOptional({ description: 'New workspace name', maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;
}

export class AddWorkspaceMemberDto {
  @ApiProperty({ description: 'Email address — creates user if not found' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiProperty({ enum: WorkspaceUserRole })
  @IsEnum(WorkspaceUserRole)
  role!: WorkspaceUserRole;
}

export class UpdateWorkspaceMemberDto {
  @ApiPropertyOptional({ enum: WorkspaceUserRole })
  @IsOptional()
  @IsEnum(WorkspaceUserRole)
  role?: WorkspaceUserRole;

  @ApiPropertyOptional({ enum: WorkspaceUserStatus })
  @IsOptional()
  @IsEnum(WorkspaceUserStatus)
  status?: WorkspaceUserStatus;

  @ApiPropertyOptional({ description: 'Update the member\'s first name (global profile)' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  firstName?: string;

  @ApiPropertyOptional({ description: 'Update the member\'s last name (global profile)' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lastName?: string;

  @ApiPropertyOptional({ description: 'Update the member\'s email address (global profile)' })
  @IsOptional()
  @IsEmail()
  email?: string;
}
