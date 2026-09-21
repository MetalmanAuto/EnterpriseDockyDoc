import { Body, Controller, Get, Headers, Post, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { DevAuthGuard, type DevUserPayload } from '../../common/guards/dev-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BillingService, type AccountSummary } from './billing.service';
import { PaymentsService } from './payments.service';
import { CheckoutDto, RazorpayConfirmDto, StoragePackDto, TopUpDto } from './dto/payments.dto';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService, private readonly payments: PaymentsService) {}

  /** Public: the tiers, limits and prices the pricing page shows. */
  @Get('plans')
  @ApiOperation({ summary: 'Plans, limits and prices' })
  plans() {
    return this.billing.plansForDisplay();
  }

  /** Public: which processors are live and the keys the browser needs to open a checkout. */
  @Get('config')
  @ApiOperation({ summary: 'Payment processor availability and public keys' })
  config() {
    return this.payments.config();
  }

  @Get('account')
  @UseGuards(DevAuthGuard)
  @ApiOperation({ summary: 'The signed-in account’s plan, limits, AI usage, subscription and payments' })
  account(@CurrentUser() user: DevUserPayload): Promise<AccountSummary> {
    return this.billing.getAccount(user.id);
  }

  @Post('checkout')
  @UseGuards(DevAuthGuard)
  @ApiOperation({ summary: 'Start a subscription (or change plan on an existing one)' })
  checkout(@CurrentUser() user: DevUserPayload, @Body() dto: CheckoutDto) {
    return this.payments.startSubscription(user, dto.plan, dto.interval, dto.currency);
  }

  @Post('topup')
  @UseGuards(DevAuthGuard)
  @ApiOperation({ summary: 'Buy extra AI actions' })
  topUp(@CurrentUser() user: DevUserPayload, @Body() dto: TopUpDto) {
    return this.payments.startTopUp(user, dto.actions, dto.currency);
  }

  @Post('storage')
  @UseGuards(DevAuthGuard)
  @ApiOperation({ summary: 'Buy extra file storage for 12 months' })
  storagePack(@CurrentUser() user: DevUserPayload, @Body() dto: StoragePackDto) {
    return this.payments.startStoragePack(user, dto.gb, dto.currency);
  }

  @Post('razorpay/confirm')
  @UseGuards(DevAuthGuard)
  @ApiOperation({ summary: 'Razorpay checkout success: verify the signature and apply the plan or top-up now' })
  confirmRazorpay(@CurrentUser() user: DevUserPayload, @Body() dto: RazorpayConfirmDto) {
    return this.payments.confirmRazorpay(user, dto);
  }

  @Post('cancel')
  @UseGuards(DevAuthGuard)
  @ApiOperation({ summary: 'Cancel the subscription at the end of the paid period' })
  cancel(@CurrentUser() user: DevUserPayload) {
    return this.payments.cancel(user);
  }

  /** Razorpay calls this. Signature over the raw body; no sign-in. */
  @Post('webhooks/razorpay')
  @ApiOperation({ summary: 'Razorpay webhook' })
  razorpayWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Headers('x-razorpay-event-id') eventId: string | undefined,
  ) {
    return this.payments.razorpayWebhook(req.rawBody ?? Buffer.from(JSON.stringify(req.body)), signature, eventId);
  }

  /** Paddle calls this. Signature over the raw body; no sign-in. */
  @Post('webhooks/paddle')
  @ApiOperation({ summary: 'Paddle webhook' })
  paddleWebhook(@Req() req: RawBodyRequest<Request>, @Headers('paddle-signature') signature: string | undefined) {
    return this.payments.paddleWebhook(req.rawBody ?? Buffer.from(JSON.stringify(req.body)), signature);
  }
}
