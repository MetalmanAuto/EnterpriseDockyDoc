import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { SharePermission, ShareType } from '@prisma/client';

// ================================================================== //
// Request DTOs
// ================================================================== //

export class CreateInternalShareDto {
  @ApiProperty({ type: [String], description: 'User IDs to share with' })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  userIds!: string[];

  @ApiProperty({ enum: SharePermission })
  @IsEnum(SharePermission)
  permission!: SharePermission;
}

export class CreateExternalShareDto {
  @ApiPropertyOptional({ description: 'ISO date string — when the link expires' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ description: 'Password to protect the link (min 4 chars)' })
  @IsOptional()
  @IsString()
  @MinLength(4)
  password?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Email the link to these people. The password, if any, is never included.',
    maxItems: 20,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  recipients?: string[];

  @ApiPropertyOptional({ description: 'A short note to include in the email' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @ApiProperty({ description: 'Whether the link allows file download', default: true })
  @IsBoolean()
  allowDownload!: boolean;
}

export class VerifySharePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password!: string;
}

// ================================================================== //
// Response DTOs
// ================================================================== //

export class ShareUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty() email!: string;
}

export class InternalShareDto {
  @ApiProperty() id!: string;
  @ApiProperty() shareId!: string;
  @ApiProperty({ type: ShareUserDto }) sharedWith!: ShareUserDto;
  @ApiProperty({ enum: SharePermission }) permission!: SharePermission;
  @ApiProperty() createdAt!: string;
}

export class ExternalShareDto {
  @ApiProperty() id!: string;
  @ApiProperty() token!: string;
  @ApiPropertyOptional({ nullable: true }) expiresAt!: string | null;
  @ApiProperty() allowDownload!: boolean;
  @ApiProperty() hasPassword!: boolean;
  @ApiProperty({ type: [String], description: 'Who the link was emailed to when created' }) recipientEmails!: string[];
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: ShareUserDto }) createdBy!: ShareUserDto;
}

export class DocumentSharesResponseDto {
  @ApiProperty({ type: [InternalShareDto] }) internalShares!: InternalShareDto[];
  @ApiProperty({ type: [ExternalShareDto] }) externalShares!: ExternalShareDto[];
}

// Public endpoint responses
export class PublicShareInfoDto {
  @ApiProperty() id!: string;
  @ApiProperty() documentId!: string;
  @ApiProperty() documentName!: string;
  @ApiProperty() allowDownload!: boolean;
  @ApiPropertyOptional({ nullable: true }) expiresAt!: string | null;
  @ApiProperty() requiresPassword!: boolean;
  @ApiProperty({ enum: ShareType }) shareType!: ShareType;
}

export class VerifyShareResponseDto {
  @ApiProperty() accessGrant!: string;
  @ApiProperty() expiresIn!: number;
}

export { SharePermission, ShareType };
