import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DocumentStatus, ReminderChannel, ReminderStatus } from '@prisma/client';

// ------------------------------------------------------------------ //
// Request DTOs
// ------------------------------------------------------------------ //

export class DocumentQueryDto {
  @ApiProperty({ description: 'Workspace ID (required)' })
  @IsString()
  @IsNotEmpty()
  workspaceId!: string;

  @ApiPropertyOptional({ description: 'Filter by folder ID' })
  @IsOptional()
  @IsString()
  folderId?: string;

  @ApiPropertyOptional({ enum: DocumentStatus, description: 'Filter by status (default excludes DELETED)' })
  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @ApiPropertyOptional({ description: 'Filter by owner user ID' })
  @IsOptional()
  @IsString()
  ownerUserId?: string;

  @ApiPropertyOptional({
    description:
      'Comma-separated tag IDs. A document must carry every listed tag to match.',
  })
  @IsOptional()
  @IsString()
  tagIds?: string;
}

export class CreateDocumentDto {
  @ApiProperty() @IsString() @IsNotEmpty() workspaceId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiProperty() @IsString() @IsNotEmpty() fileName!: string;
  @ApiProperty({ description: 'File extension (pdf, docx, xlsx…)' })
  @IsString() @IsNotEmpty() fileType!: string;
  @ApiProperty({ description: 'MIME type for the initial version' })
  @IsString() @IsNotEmpty() mimeType!: string;
  @ApiProperty({ description: 'Owner user ID' }) @IsString() @IsNotEmpty() ownerUserId!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ description: 'Place document in this folder' })
  @IsOptional() @IsString() folderId?: string;
}

export class UpdateDocumentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;

  // Allow null to remove from folder
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.folderId !== null)
  @IsString()
  folderId?: string | null;

  @ApiPropertyOptional({ enum: DocumentStatus })
  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @ApiPropertyOptional({ nullable: true, description: 'ISO date string or null to clear' })
  @IsOptional()
  @ValidateIf((o) => o.expiryDate !== null)
  @IsDateString()
  expiryDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.renewalDueDate !== null)
  @IsDateString()
  renewalDueDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isReminderEnabled?: boolean;
}

// ------------------------------------------------------------------ //
// Bulk action DTOs
// ------------------------------------------------------------------ //

export class BulkMoveDto {
  @ApiProperty({ type: [String], description: 'Documents to move (max 200)' })
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  documentIds!: string[];

  @ApiPropertyOptional({ nullable: true, description: 'Destination folder, or null for no folder' })
  @IsOptional()
  @ValidateIf((o) => o.folderId !== null)
  @IsString()
  folderId?: string | null;
}

export class BulkTagDto {
  @ApiProperty({ type: [String], description: 'Documents to label (max 200)' })
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  documentIds!: string[];

  @ApiProperty({ type: [String], description: 'Labels to add or remove' })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  tagIds!: string[];

  @ApiProperty({ enum: ['add', 'remove'], description: 'Whether to add or remove these labels' })
  @IsEnum(['add', 'remove'])
  action!: 'add' | 'remove';
}

export class BulkDeleteDto {
  @ApiProperty({ type: [String], description: 'Documents to move to trash (max 200)' })
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  documentIds!: string[];
}

export class BulkResultDto {
  @ApiProperty({ description: 'How many documents were changed' })
  updated!: number;
  @ApiProperty({ type: [String], description: 'Documents skipped because they were not found' })
  skipped!: string[];
}

// ------------------------------------------------------------------ //
// Metadata DTOs
// ------------------------------------------------------------------ //

export class MetadataEntryDto {
  @ApiProperty() @IsString() @IsNotEmpty() key!: string;
  @ApiProperty() @IsString() value!: string;
}

export class SetDocumentMetadataDto {
  @ApiProperty({ type: [MetadataEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetadataEntryDto)
  entries!: MetadataEntryDto[];
}

// ------------------------------------------------------------------ //
// Reminder DTOs
// ------------------------------------------------------------------ //

export class DocumentReminderDto {
  @ApiProperty() id!: string;
  @ApiProperty() documentId!: string;
  @ApiProperty() remindAt!: Date;
  @ApiProperty({ enum: ReminderChannel }) channel!: ReminderChannel;
  @ApiProperty({ enum: ReminderStatus }) status!: ReminderStatus;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class SetDocumentRemindersDto {
  @ApiPropertyOptional({ nullable: true, description: 'ISO date string or null to clear' })
  @IsOptional()
  @ValidateIf((o) => o.expiryDate !== null)
  @IsDateString()
  expiryDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.renewalDueDate !== null)
  @IsDateString()
  renewalDueDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isReminderEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Days before expiry to remind (e.g. [180, 30, 7]). Each value must be 1–3650.',
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(3650, { each: true })
  offsetDays?: number[];

  @ApiPropertyOptional({ enum: ReminderChannel })
  @IsOptional()
  @IsEnum(ReminderChannel)
  channel?: ReminderChannel;
}

// ------------------------------------------------------------------ //
// Response DTOs
// ------------------------------------------------------------------ //

export class DocOwnerDto {
  @ApiProperty() id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty() email!: string;
}

export class DocFolderRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class DocTagRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() color!: string | null;
}

export class DocumentVersionDto {
  @ApiProperty() id!: string;
  @ApiProperty() versionNumber!: number;
  @ApiProperty() storageKey!: string;
  @ApiProperty({ description: 'File size in bytes (serialized as string for BigInt safety)' })
  fileSizeBytes!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty({ type: DocOwnerDto }) uploadedBy!: DocOwnerDto;
  @ApiProperty() createdAt!: Date;
}

export class DocumentMetadataDto {
  @ApiProperty() id!: string;
  @ApiProperty() key!: string;
  @ApiProperty() value!: string;
}

export class DocumentListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() workspaceId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty() fileType!: string;
  @ApiProperty({ enum: DocumentStatus }) status!: DocumentStatus;
  @ApiProperty() currentVersionNumber!: number;
  @ApiPropertyOptional({ type: DocFolderRefDto }) folder!: DocFolderRefDto | null;
  @ApiProperty({ type: DocOwnerDto }) owner!: DocOwnerDto;
  @ApiProperty({ type: [DocTagRefDto] }) tags!: DocTagRefDto[];
  @ApiProperty() versionCount!: number;
  @ApiPropertyOptional({ nullable: true }) expiryDate!: Date | null;
  @ApiPropertyOptional({ nullable: true }) renewalDueDate!: Date | null;
  @ApiProperty() isReminderEnabled!: boolean;
  @ApiPropertyOptional({ nullable: true, description: 'Reminders are held until this time' })
  remindersSnoozedUntil!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({
    enum: ['none', 'running', 'done', 'failed', 'disabled'],
    description: 'State of the AI extraction for this document',
  })
  aiStatus!: 'none' | 'running' | 'done' | 'failed' | 'disabled';
  @ApiProperty({ description: 'Overall AI extraction confidence, 0 when never analysed' })
  aiConfidence!: number;
}

export class SnoozeRemindersDto {
  @ApiProperty({ description: 'Days to hold reminders for (1–365)', example: 7 })
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;
}

export class DocumentDetailDto extends DocumentListItemDto {
  @ApiPropertyOptional() description!: string | null;
  @ApiProperty() workspace!: { id: string; name: string };
  @ApiProperty({ type: [DocumentVersionDto] }) versions!: DocumentVersionDto[];
  @ApiProperty({ type: [DocumentMetadataDto] }) metadata!: DocumentMetadataDto[];
}

export class SetDocumentTagsDto {
  @ApiProperty({ description: 'Tag IDs to assign (replaces all existing tags)', type: [String] })
  @IsArray()
  @IsString({ each: true })
  tagIds!: string[];
}

export { ReminderChannel, ReminderStatus };
