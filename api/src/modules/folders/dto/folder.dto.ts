import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, ValidateIf , IsInt , Min , Max } from 'class-validator';

// ------------------------------------------------------------------ //
// Request DTOs
// ------------------------------------------------------------------ //

export class FolderQueryDto {
  @ApiProperty({ description: 'Workspace ID to list folders for' })
  @IsString()
  @IsNotEmpty()
  workspaceId!: string;
}

export class CreateFolderDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  workspaceId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Parent folder ID for nested folders' })
  @IsOptional()
  @IsString()
  parentFolderId?: string;
}

export class UpdateFolderDto {
  @ApiPropertyOptional({ nullable: true, description: 'Bin documents this many days after they expire (or after upload without an expiry). null removes the policy. 30 to 3650.' })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(3650)
  retentionDays?: number | null;

  @ApiPropertyOptional({ description: 'New folder name' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Move under this folder. Pass null to move to the top level. Omit to leave in place.',
  })
  @IsOptional()
  @ValidateIf((o) => o.parentFolderId !== null)
  @IsString()
  @IsNotEmpty()
  parentFolderId?: string | null;
}

// ------------------------------------------------------------------ //
// Response DTOs
// ------------------------------------------------------------------ //

export class FolderCreatedByDto {
  @ApiProperty() id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
}

export class FolderChildDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class FolderResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() workspaceId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() parentFolderId!: string | null;
  @ApiProperty({ type: FolderCreatedByDto }) createdBy!: FolderCreatedByDto;
  @ApiProperty() documentCount!: number;
  @ApiProperty({ nullable: true }) retentionDays!: number | null;
  @ApiProperty() childCount!: number;
  @ApiPropertyOptional() deletedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class FolderDetailResponseDto extends FolderResponseDto {
  @ApiProperty({ type: [FolderChildDto] }) children!: FolderChildDto[];
}
