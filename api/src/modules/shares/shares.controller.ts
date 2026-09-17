import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DevAuthGuard, type DevUserPayload } from '../../common/guards/dev-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SharesService } from './shares.service';
import {
  CreateExternalShareDto,
  DocumentSharesResponseDto,
  ExternalShareDto,
} from './dto/share.dto';

/**
 * DocumentSharesController — document-scoped share creation + listing.
 * Routes: /api/v1/documents/:id/share/* and /api/v1/documents/:id/shares
 *
 * NOTE: Uses prefix 'documents' alongside the existing DocumentsController.
 * NestJS merges routes from both; the sub-paths below don't conflict.
 */
@ApiTags('Shares')
@Controller('documents')
@UseGuards(DevAuthGuard)
export class DocumentSharesController {
  constructor(private readonly sharesService: SharesService) {}

  /**
   * POST /api/v1/documents/:id/share/external
   * Generate a secure external share link.
   */
  @Post(':id/share/external')
  @ApiOperation({ summary: 'Create an external share link for a document' })
  @ApiParam({ name: 'id', description: 'Document cuid' })
  @ApiResponse({ status: 201, type: ExternalShareDto })
  @ApiResponse({ status: 400, description: 'Document deleted' })
  @ApiResponse({ status: 403, description: 'Not a workspace member' })
  createExternalShare(
    @Param('id') id: string,
    @Body() dto: CreateExternalShareDto,
    @CurrentUser() user: DevUserPayload,
  ): Promise<ExternalShareDto> {
    return this.sharesService.createExternalShare(id, dto, user);
  }

  /**
   * GET /api/v1/documents/:id/shares
   * List all active shares for a document.
   */
  @Get(':id/shares')
  @ApiOperation({ summary: 'List active shares for a document' })
  @ApiParam({ name: 'id', description: 'Document cuid' })
  @ApiResponse({ status: 200, type: DocumentSharesResponseDto })
  @ApiResponse({ status: 403, description: 'Not a workspace member' })
  getShares(
    @Param('id') id: string,
    @CurrentUser() user: DevUserPayload,
  ): Promise<DocumentSharesResponseDto> {
    return this.sharesService.getDocumentShares(id, user);
  }
}

/**
 * ShareManagementController — share-level operations (revoke).
 * Routes: /api/v1/shares/*
 */
@ApiTags('Shares')
@Controller('shares')
@UseGuards(DevAuthGuard)
export class ShareManagementController {
  constructor(private readonly sharesService: SharesService) {}

  /**
   * POST /api/v1/shares/:shareId/revoke
   * Revoke a share (sets isActive=false). Keeps history.
   */
  @Post(':shareId/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a share (workspace members only)' })
  @ApiParam({ name: 'shareId', description: 'DocumentShare cuid' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: 'Not a workspace member' })
  @ApiResponse({ status: 404, description: 'Share not found' })
  @ApiResponse({ status: 409, description: 'Share already revoked' })
  async revokeShare(
    @Param('shareId') shareId: string,
    @CurrentUser() user: DevUserPayload,
  ): Promise<{ message: string }> {
    await this.sharesService.revokeShare(shareId, user);
    return { message: 'Share revoked successfully' };
  }
}
