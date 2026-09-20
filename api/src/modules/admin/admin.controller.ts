import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DevAuthGuard } from '../../common/guards/dev-auth.guard';
import { PlatformAdminGuard } from './platform-admin.guard';
import { AdminService, type AdminOverview } from './admin.service';

/**
 * Platform-level view for the people who run DockyDoc: who has signed up,
 * what they have stored, and how much AI they have used. Gated by
 * PLATFORM_ADMIN_EMAILS; everyone else gets 403.
 */
@ApiTags('Admin')
@Controller('admin')
@UseGuards(DevAuthGuard, PlatformAdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Sign-ups, workspaces, storage, AI usage and recent activity across the platform' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: 'Not a platform administrator' })
  overview(): Promise<AdminOverview> {
    return this.admin.overview();
  }
}
