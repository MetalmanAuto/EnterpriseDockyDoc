import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DevAuthGuard, type DevUserPayload } from '../../common/guards/dev-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RemindersService } from './reminders.service';
import {
  ExpiringDocumentDto,
  ExpiringQueryDto,
  ReminderQueryDto,
  TestEmailResultDto,
  UpcomingReminderDto,
} from './dto/reminder-query.dto';

/**
 * Reminders endpoints.
 * Routes: /api/v1/reminders/*
 */
@ApiTags('Reminders')
@Controller('reminders')
@UseGuards(DevAuthGuard)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  /**
   * GET /api/v1/reminders?workspaceId=...
   * Upcoming reminders plus recently sent / failed ones for the workspace.
   */
  @Get()
  @ApiOperation({ summary: 'List upcoming and recently delivered reminders for a workspace' })
  @ApiResponse({ status: 200, type: [UpcomingReminderDto] })
  getReminders(
    @Query() query: ReminderQueryDto,
    @CurrentUser() user: DevUserPayload,
  ): Promise<UpcomingReminderDto[]> {
    return this.remindersService.getWorkspaceReminders(query.workspaceId, user);
  }

  /**
   * GET /api/v1/reminders/expiring?workspaceId=...&days=90
   * Documents expiring within `days` (default 90) or already expired.
   */
  @Get('expiring')
  @ApiOperation({ summary: 'List expiring/expired documents in a workspace' })
  @ApiResponse({ status: 200, type: [ExpiringDocumentDto] })
  getExpiring(
    @Query() query: ExpiringQueryDto,
    @CurrentUser() user: DevUserPayload,
  ): Promise<ExpiringDocumentDto[]> {
    return this.remindersService.getExpiringDocuments(query.workspaceId, user, query.days);
  }

  /**
   * POST /api/v1/reminders/test-email?workspaceId=...
   * Sends a sample reminder email to the calling user.
   */
  @Post('test-email')
  @ApiOperation({ summary: 'Send a sample reminder email to the current user' })
  @ApiResponse({ status: 201, type: TestEmailResultDto })
  sendTestEmail(
    @Query() query: ReminderQueryDto,
    @CurrentUser() user: DevUserPayload,
  ): Promise<TestEmailResultDto> {
    return this.remindersService.sendTestEmail(query.workspaceId, user);
  }
}
