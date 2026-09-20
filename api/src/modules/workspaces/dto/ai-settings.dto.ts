import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export enum AiProviderEnum {
  PLATFORM = 'PLATFORM',
  BYOK = 'BYOK',
}

export enum AiProviderTypeEnum {
  ANTHROPIC = 'ANTHROPIC',
  OPENAI = 'OPENAI',
}

export class UpdateAiSettingsDto {
  @IsOptional()
  @IsEnum(AiProviderEnum)
  aiProvider?: AiProviderEnum;

  @IsOptional()
  @IsEnum(AiProviderTypeEnum)
  aiProviderType?: AiProviderTypeEnum;

  @IsOptional()
  @IsString()
  @MinLength(10)
  apiKey?: string;
}

/** Informational only since actions replaced tokens as the metered unit; kept for the usage graph. */
export const PLAN_TOKEN_LIMITS: Record<string, number> = {
  FREE: 100_000,
  PERSONAL: 500_000,
  BUSINESS: 3_000_000,
  TEAM: 10_000_000,
  ENTERPRISE: 100_000_000,
};

export interface AiSettingsResponseDto {
  plan: string;
  aiProvider: string;
  aiProviderType: string;
  hasApiKey: boolean;
  aiUsageTokens: number;
  aiUsageLimit: number;
  aiUsagePercent: number;
}
