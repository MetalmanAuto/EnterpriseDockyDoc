import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export const PAID_PLANS = ['PERSONAL', 'BUSINESS', 'TEAM'] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];
export type Interval = 'monthly' | 'yearly';
export type Currency = 'INR' | 'USD';

export class CheckoutDto {
  @ApiProperty({ enum: PAID_PLANS })
  @IsIn(PAID_PLANS)
  plan!: PaidPlan;

  @ApiProperty({ enum: ['monthly', 'yearly'] })
  @IsIn(['monthly', 'yearly'])
  interval!: Interval;

  @ApiProperty({ enum: ['INR', 'USD'], description: 'INR pays through Razorpay, USD through Paddle' })
  @IsIn(['INR', 'USD'])
  currency!: Currency;
}

export class TopUpDto {
  @ApiProperty({ enum: [100, 500] })
  @IsInt()
  @IsIn([100, 500])
  actions!: 100 | 500;

  @ApiProperty({ enum: ['INR', 'USD'] })
  @IsIn(['INR', 'USD'])
  currency!: Currency;
}

export class RazorpayConfirmDto {
  @ApiProperty() @IsString() razorpay_payment_id!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() razorpay_subscription_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() razorpay_order_id?: string;
  @ApiProperty() @IsString() razorpay_signature!: string;
}
