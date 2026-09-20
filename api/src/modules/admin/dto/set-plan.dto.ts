import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { WorkspacePlan } from '@prisma/client';

export class SetPlanDto {
  @ApiProperty({ enum: WorkspacePlan })
  @IsEnum(WorkspacePlan)
  plan!: WorkspacePlan;

  @ApiPropertyOptional({ description: 'Months the complimentary plan lasts; omit for no expiry' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(36)
  months?: number;
}
