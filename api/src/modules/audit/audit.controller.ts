import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DevAuthGuard, type DevUserPayload } from '../../common/guards/dev-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from './audit.service';
import { AuditLogDto, AuditQueryDto } from './dto/audit.dto';

@ApiTags('Audit')
@Controller('audit')
@UseGuards(DevAuthGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /** GET /api/v1/audit/export?workspaceId=... — the whole log as a CSV file (Business and above). */
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="dockydoc-activity.csv"')
  @ApiOperation({ summary: 'Export the workspace activity log as CSV' })
  exportCsv(@Query('workspaceId') workspaceId: string, @CurrentUser() user: DevUserPayload): Promise<string> {
    return this.auditService.exportCsv(workspaceId, user);
  }

  /**
   * GET /api/v1/audit?workspaceId=...
   * Returns recent activity for the workspace, newest first.
   */
  @Get()
  @ApiOperation({ summary: 'Get workspace activity feed' })
  @ApiResponse({ status: 200, type: [AuditLogDto] })
  getWorkspaceActivity(
    @Query() query: AuditQueryDto,
    @CurrentUser() user: DevUserPayload,
  ): Promise<AuditLogDto[]> {
    return this.auditService.getWorkspaceActivity(query, user);
  }
}
