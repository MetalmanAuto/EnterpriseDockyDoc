import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsHexColor, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TagQueryDto {
  @ApiProperty({ description: 'Workspace ID to list tags for' })
  @IsString()
  @IsNotEmpty()
  workspaceId!: string;
}

export class CreateTagDto {
  @ApiProperty() @IsString() @IsNotEmpty() workspaceId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;

  @ApiPropertyOptional({ description: 'Hex color e.g. #6366f1' })
  @IsOptional()
  @IsString()
  @IsHexColor()
  color?: string;
}

export class UpdateTagDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() name?: string;

  @ApiPropertyOptional({ description: 'Hex color e.g. #6366f1 or null to clear' })
  @IsOptional()
  @IsString()
  @IsHexColor()
  color?: string | null;
}

export class MergeTagDto {
  @ApiProperty({ description: 'The label to keep. The one being merged is deleted.' })
  @IsString()
  @IsNotEmpty()
  intoTagId!: string;
}

export class TagResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() workspaceId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() color!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ description: 'How many documents carry this label' })
  documentCount!: number;
}
