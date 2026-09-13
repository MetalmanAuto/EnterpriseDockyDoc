import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { ReminderChannel, ReminderStatus } from '@prisma/client';

export class ReminderQueryDto {
  @ApiProperty({ description: 'Workspace ID (required)' })
  @IsString()
  @IsNotEmpty()
  workspaceId!: string;
}

export class ExpiringQueryDto extends ReminderQueryDto {
  @ApiPropertyOptional({ description: 'Look-ahead window in days (1–3650, default 90)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  days?: number;
}

export class ExpiringDocumentDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() workspaceId!: string;
  @ApiPropertyOptional({ nullable: true }) expiryDate!: Date | null;
  @ApiPropertyOptional({ nullable: true }) renewalDueDate!: Date | null;
  @ApiProperty() isReminderEnabled!: boolean;
  @ApiPropertyOptional({ nullable: true }) folderName!: string | null;
  @ApiProperty() ownerEmail!: string;
  @ApiProperty() daysUntilExpiry!: number;
}

export class UpcomingReminderDto {
  @ApiProperty() id!: string;
  @ApiProperty() documentId!: string;
  @ApiProperty() documentName!: string;
  @ApiProperty() remindAt!: Date;
  @ApiProperty({ enum: ReminderChannel }) channel!: ReminderChannel;
  @ApiProperty({ enum: ReminderStatus }) status!: ReminderStatus;
  @ApiPropertyOptional({ nullable: true }) sentAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) lastError!: string | null;
  @ApiPropertyOptional({ nullable: true }) expiryDate!: Date | null;
}

export class TestEmailResultDto {
  @ApiProperty() delivered!: boolean;
  @ApiProperty() to!: string;
}
