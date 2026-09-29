import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DevAuthGuard } from '../../common/guards/dev-auth.guard';
import { PlatformAdminGuard } from './platform-admin.guard';
import { AdminService, type AdminOverview } from './admin.service';
import { SetPlanDto } from './dto/set-plan.dto';
import { RetentionService } from '../retention/retention.service';
import { OperationsService } from '../operations/operations.service';
import { PaymentsService } from '../billing/payments.service';
import { PromoService } from '../billing/promo.service';
import { CreatePromoCodesDto } from '../billing/dto/promo.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { DevUserPayload } from '../../common/guards/dev-auth.guard';

/**
 * Platform-level view for the people who run DockyDoc: who has signed up,
 * what they have stored, and how much AI they have used. Gated by
 * PLATFORM_ADMIN_EMAILS; everyone else gets 403.
 */
@ApiTags('Admin')
@Controller('admin')
@UseGuards(DevAuthGuard, PlatformAdminGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly retention: RetentionService,
    private readonly operations: OperationsService,
    private readonly payments: PaymentsService,
    private readonly promo: PromoService,
  ) {}

  @Get('weekly')
  @ApiOperation({ summary: 'The numbers the Monday report emails, as JSON' })
  weekly() {
    return this.operations.weeklyNumbers();
  }

  @Post('weekly/send')
  @ApiOperation({ summary: 'Email the weekly report to the platform admins now' })
  sendWeekly() {
    return this.operations.sendWeeklyReport();
  }

  @Post('onboarding/run')
  @ApiOperation({ summary: 'Run the onboarding mail pass now' })
  runOnboarding() {
    return this.operations.runOnboarding();
  }

  @Post('billing/prices/sync')
  @ApiOperation({ summary: 'Create every plan, top-up and storage price at the enabled payment providers (idempotent)' })
  syncPrices() {
    return this.payments.syncPrices();
  }

  @Post('retention/run')
  @ApiOperation({ summary: 'Run the nightly retention job now (bin purge and folder policies)' })
  runRetention() {
    return this.retention.run();
  }

  @Get('overview')
  @ApiOperation({ summary: 'Sign-ups, workspaces, storage, AI usage and recent activity across the platform' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: 'Not a platform administrator' })
  overview(): Promise<AdminOverview> {
    return this.admin.overview();
  }

  @Get('promo-codes')
  @ApiOperation({ summary: 'Every code, newest first, with who redeemed it' })
  listPromoCodes() {
    return this.promo.list();
  }

  @Post('promo-codes')
  @ApiOperation({ summary: 'Make codes that give a plan free for a number of months' })
  createPromoCodes(@CurrentUser() user: DevUserPayload, @Body() dto: CreatePromoCodesDto) {
    return this.promo.create(dto, user.id);
  }

  @Post('promo-codes/:id/disable')
  @ApiOperation({ summary: 'Withdraw a code so nobody else can redeem it' })
  disablePromoCode(@Param('id') id: string) {
    return this.promo.disable(id);
  }

  @Patch('users/:id/plan')
  @ApiOperation({ summary: 'Give a person a plan without payment (complimentary), optionally for a number of months' })
  setPlan(@Param('id') id: string, @Body() dto: SetPlanDto) {
    return this.admin.setPlan(id, dto.plan, dto.months);
  }
}
