import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FindDocumentsDto {
  @ApiProperty({
    description: 'What the person asked for, in their words. May name several documents.',
    example: 'my passport and UK visa',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  query!: string;

  @ApiPropertyOptional({ description: 'Also return the text read from the best match, up to 20,000 characters, so the caller can answer questions about its contents without downloading it. Default false.' })
  @IsOptional()
  @IsBoolean()
  includeText?: boolean;

  @ApiPropertyOptional({ description: 'Search one workspace only. Default: every workspace the key holder belongs to.' })
  @IsOptional()
  @IsString()
  workspaceId?: string;
}

export class DeliverDocumentsDto {
  @ApiProperty({ type: [String], description: 'Documents to make a download link for' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  documentIds!: string[];

  @ApiPropertyOptional({ description: 'Minutes until the link stops working', default: 15, minimum: 1, maximum: 1440 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  expiresInMinutes?: number;
}

export class FetchDocumentsDto extends FindDocumentsDto {
  @ApiPropertyOptional({ description: 'Minutes until the links stop working', default: 15, minimum: 1, maximum: 1440 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  expiresInMinutes?: number;
}

export class IntegrationUploadDto {
  @ApiPropertyOptional({ description: 'Workspace to file it in. Default: the key holder\'s own workspace.' })
  @IsOptional()
  @IsString()
  workspaceId?: string;

  @ApiPropertyOptional({ description: 'Document name. Default: the file name without its extension.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'Comma-separated label names. Labels that do not exist yet are created.' })
  @IsOptional()
  @IsString()
  labels?: string;
}

// ---- responses ----------------------------------------------------------- //

export class IntegrationDocumentDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty() fileType!: string;
  @ApiProperty() workspace!: { id: string; name: string };
  @ApiProperty({ type: [String] }) labels!: string[];
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiPropertyOptional({ nullable: true }) expiryDate!: Date | null;
  @ApiPropertyOptional({ nullable: true }) renewalDueDate!: Date | null;
  @ApiProperty({
    description: 'Every field read from the document or typed in by its owner, as key and value: document type, issuer, holder, reference or registration number, dates, and anything else found.',
    example: { documentType: 'GST registration certificate', holder: 'Nishant Jairath', gstin: '07AAHCE4776H1ZC', issueDate: '2024-04-01' },
  })
  details!: Record<string, string>;
  @ApiProperty() updatedAt!: Date;
  @ApiPropertyOptional({ nullable: true, description: 'The text read from the document, only when asked for (includeText, or the read call). Cut at the limit with textTruncated=true.' })
  text?: string | null;
  @ApiPropertyOptional() textTruncated?: boolean;
}

export class ReadDocumentsDto {
  @ApiProperty({ type: [String], description: 'Documents to read, by id, up to 10' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  documentIds!: string[];

  @ApiPropertyOptional({ description: 'Include the full text read from each document. Default true.' })
  @IsOptional()
  @IsBoolean()
  includeText?: boolean;

  @ApiPropertyOptional({ description: 'Longest text to return per document, 1,000 to 200,000 characters. Default 50,000.', default: 50000 })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(200000)
  maxTextChars?: number;
}

export class MatchedDocumentDto extends IntegrationDocumentDto {
  @ApiProperty({ description: '0 to 1. Below 0.6 the caller should ask the person to choose.' })
  confidence!: number;
}

export class FindItemDto {
  @ApiProperty({ description: 'One thing the person asked for, e.g. "passport"' }) ask!: string;
  @ApiPropertyOptional({ type: MatchedDocumentDto, nullable: true }) match!: MatchedDocumentDto | null;
  @ApiProperty({ type: [IntegrationDocumentDto] }) alternatives!: IntegrationDocumentDto[];
}

export class FindResultDto {
  @ApiProperty({ type: [FindItemDto] }) items!: FindItemDto[];
  @ApiProperty({ enum: ['ai', 'lexical'], description: 'How matching was done. "lexical" means no AI key is configured.' })
  mode!: 'ai' | 'lexical';
}

export class DeliveryDto {
  @ApiProperty() documentId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty({ description: 'Download URL. No authentication needed; it stops working at expiresAt.' })
  url!: string;
  @ApiProperty() expiresAt!: Date;
}

export class FetchItemDto extends FindItemDto {
  @ApiPropertyOptional({ type: DeliveryDto, nullable: true, description: 'Set when the match was confident enough to hand over.' })
  delivery!: DeliveryDto | null;
  @ApiProperty({ description: 'True when the caller should show the alternatives and ask the person to pick one.' })
  needsChoice!: boolean;
}

export class FetchResultDto {
  @ApiProperty({ type: [FetchItemDto] }) items!: FetchItemDto[];
  @ApiProperty({ enum: ['ai', 'lexical'] }) mode!: 'ai' | 'lexical';
}

export class IntegrationMeDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty() keyName!: string;
  @ApiProperty() canWrite!: boolean;
  @ApiProperty() workspaces!: { id: string; name: string; role: string; isDefault: boolean }[];
}
