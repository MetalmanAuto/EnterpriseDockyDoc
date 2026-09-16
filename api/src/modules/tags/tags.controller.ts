import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TagsService } from './tags.service';
import { CreateTagDto, MergeTagDto, TagQueryDto, TagResponseDto, UpdateTagDto } from './dto/tag.dto';
import { DevAuthGuard, type DevUserPayload } from '../../common/guards/dev-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Tags')
@Controller('tags')
@UseGuards(DevAuthGuard)
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  /**
   * GET /api/v1/tags?workspaceId=...
   */
  @Get()
  @ApiOperation({ summary: 'List all tags in a workspace' })
  @ApiResponse({ status: 200, type: [TagResponseDto] })
  findAll(
    @Query() query: TagQueryDto,
    @CurrentUser() user: DevUserPayload,
  ): Promise<TagResponseDto[]> {
    return this.tagsService.findAll(query.workspaceId, user);
  }

  /**
   * POST /api/v1/tags
   */
  @Post()
  @ApiOperation({ summary: 'Create a document tag' })
  @ApiResponse({ status: 201, type: TagResponseDto })
  create(
    @Body() dto: CreateTagDto,
    @CurrentUser() user: DevUserPayload,
  ): Promise<TagResponseDto> {
    return this.tagsService.create(dto, user);
  }

  /**
   * PATCH /api/v1/tags/:id
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Update a tag name or color' })
  @ApiResponse({ status: 200, type: TagResponseDto })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTagDto,
    @CurrentUser() user: DevUserPayload,
  ): Promise<TagResponseDto> {
    return this.tagsService.update(id, dto, user);
  }

  /**
   * POST /api/v1/tags/:id/merge
   * Folds this label into another and deletes it.
   */
  @Post(':id/merge')
  @ApiOperation({ summary: 'Merge this label into another, then delete it' })
  @ApiResponse({ status: 201, type: TagResponseDto, description: 'The surviving label' })
  @ApiResponse({ status: 404, description: 'Either label not found' })
  merge(
    @Param('id') id: string,
    @Body() dto: MergeTagDto,
    @CurrentUser() user: DevUserPayload,
  ): Promise<TagResponseDto> {
    return this.tagsService.merge(id, dto, user);
  }

  /**
   * DELETE /api/v1/tags/:id
   */
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a tag' })
  @ApiResponse({ status: 204, description: 'Tag deleted' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: DevUserPayload,
  ): Promise<void> {
    return this.tagsService.delete(id, user);
  }
}
