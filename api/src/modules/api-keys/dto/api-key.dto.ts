import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ description: 'What this key is for, e.g. "Clawdbot on WhatsApp"' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({
    description: 'Allow the key to upload and change documents, not only read them',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  canWrite?: boolean;

  @ApiPropertyOptional({ description: 'ISO date after which the key stops working' })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

export class ApiKeyDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'First characters of the key, to tell keys apart' }) prefix!: string;
  @ApiProperty() canWrite!: boolean;
  @ApiPropertyOptional({ nullable: true }) lastUsedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) expiresAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}

export class CreatedApiKeyDto extends ApiKeyDto {
  @ApiProperty({ description: 'The full key. Shown once; it is not stored and cannot be shown again.' })
  key!: string;
}
