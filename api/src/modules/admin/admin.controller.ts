import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DevAuthGuard } from '../../common/guards/dev-auth.guard';
import { PlatformAdminGuard } from './platform-admin.guard';
import { AdminService, type AdminOverview } from './admin.service';
import { SetPlanDto } from './dto/set-plan.dto';
import { RetentionService } from '../retention/retention.service';
import { OperationsService } from '../operations/operations.service';

/**
 * Platform-level view for the people who run DockyDoc: who has signed up,
 * what they have stored, and how much AI they have used. Gated by
 * PLATFORM_ADMIN_EMAILS; everyone else gets 403.
 */
@ApiTags('Admin')
@Controller('admin')
@UseGuards(DevAuthGuard, PlatformAdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService, private readonly retention: RetentionService, private readonly operations: OperationsService) {}

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

  @Patch('users/:id/plan')
  @ApiOperation({ summary: 'Give a person a plan without payment (complimentary), optionally for a number of months' })
  setPlan(@Param('id') id: string, @Body() dto: SetPlanDto) {
    return this.admin.setPlan(id, dto.plan, dto.months);
  }
}
