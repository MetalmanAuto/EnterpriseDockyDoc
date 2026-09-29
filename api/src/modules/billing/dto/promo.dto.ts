import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export const PROMO_PLANS = ['PERSONAL', 'BUSINESS', 'TEAM'] as const;
export type PromoPlan = (typeof PROMO_PLANS)[number];

export class RedeemCodeDto {
  @ApiProperty({ example: 'DD-7K2M-9QXH' })
  @IsString()
  @MaxLength(40)
  code!: string;
}

export class CreatePromoCodesDto {
  @ApiProperty({ enum: PROMO_PLANS })
  @IsIn(PROMO_PLANS)
  plan!: PromoPlan;

  @ApiProperty({ description: 'How many months the plan runs from redemption', example: 12 })
  @IsInt() @Min(1) @Max(36)
  months!: number;

  @ApiPropertyOptional({ description: 'How many codes to generate, 1 to 100. Default 1.' })
  @IsOptional() @IsInt() @Min(1) @Max(100)
  count?: number;

  @ApiPropertyOptional({ description: 'How many people may redeem each code. Omit for one per code.' })
  @IsOptional() @IsInt() @Min(1) @Max(100000)
  maxUses?: number;

  @ApiPropertyOptional({ description: 'Last day the code can be redeemed, ISO date' })
  @IsOptional() @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ description: 'Who it is for or why, shown only to admins' })
  @IsOptional() @IsString() @MaxLength(200)
  note?: string;

  @ApiPropertyOptional({ description: 'A custom code instead of a generated one, letters, digits and dashes, 6 to 24 characters. Only with count 1.' })
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9-]{6,24}$/)
  code?: string;
}
