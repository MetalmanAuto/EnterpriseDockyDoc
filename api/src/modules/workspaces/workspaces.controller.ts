import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DevAuthGuard } from '../../common/guards/dev-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { DevUserPayload } from '../../common/guards/dev-auth.guard';
import { WorkspacesService } from './workspaces.service';
import {
  WorkspaceMemberDto,
  WorkspaceResponseDto,
  WorkspaceDetailResponseDto,
  WorkspaceSummaryDto,
} from './dto/workspace-response.dto';
import { WorkspaceUserStatus } from '@prisma/client';
import { CreateWorkspaceDto, AddWorkspaceMemberDto, UpdateWorkspaceMemberDto, UpdateWorkspaceDto } from './dto/add-member.dto';
import { GrantWorkspaceAccessDto, GrantWorkspaceAccessResultDto } from './dto/grant-access.dto';
import { UpdateAiSettingsDto, AiSettingsResponseDto } from './dto/ai-settings.dto';

/**
 * Workspaces endpoints.
 * Routes: /api/v1/workspaces/*
 */
@ApiTags('Workspaces')
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  /**
   * POST /api/v1/workspaces
   * Create a new workspace. The caller becomes the OWNER.
   */
  @Post()
  @UseGuards(DevAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new workspace (caller becomes OWNER)' })
  @ApiResponse({ status: 201, type: WorkspaceResponseDto })
  create(
    @Body() dto: CreateWorkspaceDto,
    @CurrentUser() user: DevUserPayload,
  ): Promise<WorkspaceResponseDto> {
    return this.workspacesService.create(dto.name, user);
  }

  /**
   * GET /api/v1/workspaces
   * Returns only workspaces the authenticated user is an active member of.
   */
  @Get()
  @UseGuards(DevAuthGuard)
  @ApiOperation({ summary: 'List workspaces the current user belongs to' })
  @ApiResponse({ status: 200, type: [WorkspaceResponseDto] })
  findAll(
    @CurrentUser() user: DevUserPayload,
  ): Promise<WorkspaceResponseDto[]> {
    return this.workspacesService.findAll(user);
  }

  /**
   * GET /api/v1/workspaces/:id
   * Returns workspace detail only if the authenticated user is a member.
   */
  @Get(':id')
  @UseGuards(DevAuthGuard)
  @ApiOperation({ summary: 'Get workspace by ID (must be a member)' })
  @ApiParam({ name: 'id', description: 'Workspace cuid' })
  @ApiResponse({ status: 200, type: WorkspaceDetailResponseDto })
  @ApiResponse({ status: 403, description: 'Not a member of this workspace' })
  @ApiResponse({ status: 404, description: 'Workspace not found' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: DevUserPayload,
  ): Promise<WorkspaceDetailResponseDto> {
    return this.workspacesService.findById(id, user);
  }

  /**
   * PATCH /api/v1/workspaces/:id
   * Update workspace properties (name). ADMIN/OWNER only.
   */
  @Patch(':id')
  @UseGuards(DevAuthGuard)
  @ApiOperation({ summary: 'Update workspace (rename). ADMIN/OWNER only.' })
  @ApiParam({ name: 'id', description: 'Workspace cuid' })
  @ApiResponse({ status: 200, type: WorkspaceResponseDto })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  @ApiResponse({ status: 404, description: 'Workspace not found' })
  updateWorkspace(
    @Param('id') id: string,
    @Body() dto: UpdateWorkspaceDto,
    @CurrentUser() user: DevUserPayload,
  ): Promise<WorkspaceResponseDto> {
    return this.workspacesService.update(id, dto, user);
  }

  /**
   * GET /api/v1/workspaces/:id/summary
   * Returns aggregate stats for the dashboard.
   */
  @Get(':id/summary')
  @UseGuards(DevAuthGuard)
  @ApiOperation({ summary: 'Get workspace dashboard summary stats' })
  @ApiParam({ name: 'id', description: 'Workspace cuid' })
  @ApiResponse({ status: 200, type: WorkspaceSummaryDto })
  getSummary(
    @Param('id') id: string,
    @CurrentUser() user: DevUserPayload,
  ): Promise<WorkspaceSummaryDto> {
    return this.workspacesService.getSummary(id, user);
  }

  /**
   * POST /api/v1/workspaces/:id/members
   * Add a member to the workspace. OWNER/ADMIN only.
   * Creates the user if they don't exist yet (find-or-create).
   */
  @Post(':id/members')
  @UseGuards(DevAuthGuard)
  @ApiOperation({ summary: 'Add member to workspace (OWNER/ADMIN only)' })
  @ApiParam({ name: 'id', description: 'Workspace cuid' })
  @ApiResponse({ status: 201, type: WorkspaceMemberDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  @ApiResponse({ status: 404, description: 'Workspace not found' })
  @ApiResponse({ status: 409, description: 'User already an active member' })
  addMember(
    @Param('id') id: string,
    @Body() dto: AddWorkspaceMemberDto,
    @CurrentUser() user: DevUserPayload,
  ): Promise<WorkspaceMemberDto> {
    return this.workspacesService.addMember(id, dto, user);
  }

  @Post(':id/members/:memberId/workspaces')
  @UseGuards(DevAuthGuard)
  @ApiOperation({ summary: 'Add an existing member to other workspaces you manage (OWNER/ADMIN only)' })
  @ApiParam({ name: 'id', description: 'Workspace the member is in' })
  @ApiParam({ name: 'memberId', description: 'Membership id in that workspace' })
  @ApiResponse({ status: 201, type: [GrantWorkspaceAccessResultDto] })
  grantAccess(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() dto: GrantWorkspaceAccessDto,
    @CurrentUser() user: DevUserPayload,
  ): Promise<GrantWorkspaceAccessResultDto[]> {
    return this.workspacesService.grantAccess(id, memberId, dto, user);
  }

  /**
   * PATCH /api/v1/workspaces/:id/members/:memberId
   * Update a member's role or status. OWNER/ADMIN only.
   * Guards against removing/demoting the last OWNER.
   */
  @Patch(':id/members/:memberId')
  @UseGuards(DevAuthGuard)
  @ApiOperation({ summary: 'Update workspace member role/status (OWNER/ADMIN only)' })
  @ApiParam({ name: 'id', description: 'Workspace cuid' })
  @ApiParam({ name: 'memberId', description: 'WorkspaceUser cuid' })
  @ApiResponse({ status: 200, type: WorkspaceMemberDto })
  @ApiResponse({ status: 400, description: 'Cannot remove last owner' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  @ApiResponse({ status: 404, description: 'Member not found' })
  updateMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateWorkspaceMemberDto,
    @CurrentUser() user: DevUserPayload,
  ): Promise<WorkspaceMemberDto> {
    return this.workspacesService.updateMember(id, memberId, dto, user);
  }

  /**
   * DELETE /api/v1/workspaces/:id/members/:memberId
   * Remove a member (sets status to REMOVED). OWNER/ADMIN only.
   */
  @Delete(':id/members/:memberId')
  @UseGuards(DevAuthGuard)
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a workspace member (OWNER/ADMIN only)' })
  @ApiParam({ name: 'id', description: 'Workspace cuid' })
  @ApiParam({ name: 'memberId', description: 'WorkspaceUser cuid' })
  @ApiResponse({ status: 204, description: 'Member removed' })
  @ApiResponse({ status: 400, description: 'Cannot remove last owner' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  @ApiResponse({ status: 404, description: 'Member not found' })
  async removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: DevUserPayload,
  ): Promise<void> {
    await this.workspacesService.updateMember(
      id,
      memberId,
      { status: WorkspaceUserStatus.REMOVED },
      user,
    );
  }

  /**
   * GET /api/v1/workspaces/:id/ai-settings
   * Returns workspace AI configuration. MEMBER-readable.
   */
  @Get(':id/ai-settings')
  @UseGuards(DevAuthGuard)
  @ApiOperation({ summary: 'Get workspace AI configuration' })
  @ApiParam({ name: 'id', description: 'Workspace cuid' })
  @ApiResponse({ status: 200 })
  getAiSettings(
    @Param('id') id: string,
    @CurrentUser() user: DevUserPayload,
  ): Promise<AiSettingsResponseDto> {
    return this.workspacesService.getAiSettings(id, user);
  }

  /**
   * PATCH /api/v1/workspaces/:id/ai-settings
   * Update AI configuration. ADMIN/OWNER only.
   */
  @Patch(':id/ai-settings')
  @UseGuards(DevAuthGuard)
  @ApiOperation({ summary: 'Update workspace AI configuration. ADMIN/OWNER only.' })
  @ApiParam({ name: 'id', description: 'Workspace cuid' })
  @ApiResponse({ status: 200 })
  updateAiSettings(
    @Param('id') id: string,
    @Body() dto: UpdateAiSettingsDto,
    @CurrentUser() user: DevUserPayload,
  ): Promise<AiSettingsResponseDto> {
    return this.workspacesService.updateAiSettings(id, dto, user);
  }
}
