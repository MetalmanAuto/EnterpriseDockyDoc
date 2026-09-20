import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DevAuthGuard, type DevUserPayload } from '../../common/guards/dev-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BillingService, type AccountSummary } from './billing.service';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Public: the tiers, limits and prices the pricing page shows. */
  @Get('plans')
  @ApiOperation({ summary: 'Plans, limits and prices' })
  plans() {
    return this.billing.plansForDisplay();
  }

  @Get('account')
  @UseGuards(DevAuthGuard)
  @ApiOperation({ summary: 'The signed-in account’s plan, limits and AI usage' })
  account(@CurrentUser() user: DevUserPayload): Promise<AccountSummary> {
    return this.billing.getAccount(user.id);
  }
}
