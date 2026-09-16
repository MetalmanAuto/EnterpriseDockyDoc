import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FoldersService } from './folders.service';
import { CreateFolderDto, FolderDetailResponseDto, FolderQueryDto, FolderResponseDto, UpdateFolderDto } from './dto/folder.dto';
import { DevAuthGuard, type DevUserPayload } from '../../common/guards/dev-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Folders')
@Controller('folders')
@UseGuards(DevAuthGuard)
export class FoldersController {
  constructor(private readonly foldersService: FoldersService) {}

  @Get()
  @ApiOperation({ summary: 'List folders in a workspace (active or deleted)' })
  @ApiResponse({ status: 200, type: [FolderResponseDto] })
  findAll(
    @Query() query: FolderQueryDto,
    @Query('deleted') deleted: string,
    @CurrentUser() user: DevUserPayload,
  ): Promise<FolderResponseDto[]> {
    if (deleted === 'true') {
      return this.foldersService.findDeleted(query.workspaceId, user);
    }
    return this.foldersService.findAll(query.workspaceId, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get folder by ID with children' })
  @ApiResponse({ status: 200, type: FolderDetailResponseDto })
  @ApiResponse({ status: 404, description: 'Folder not found' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: DevUserPayload,
  ): Promise<FolderDetailResponseDto> {
    return this.foldersService.findById(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Create a folder' })
  @ApiResponse({ status: 201, type: FolderResponseDto })
  create(
    @Body() dto: CreateFolderDto,
    @CurrentUser() user: DevUserPayload,
  ): Promise<FolderResponseDto> {
    return this.foldersService.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a folder and/or move it under another folder' })
  @ApiResponse({ status: 200, type: FolderResponseDto })
  @ApiResponse({ status: 404, description: 'Folder not found' })
  @ApiResponse({ status: 409, description: 'A folder with that name is already in that place' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFolderDto,
    @CurrentUser() user: DevUserPayload,
  ): Promise<FolderResponseDto> {
    return this.foldersService.update(id, dto, user);
  }

  @Post(':id/restore')
  @HttpCode(204)
  @ApiOperation({ summary: 'Restore a soft-deleted folder and its contents' })
  @ApiResponse({ status: 204, description: 'Folder restored' })
  async restore(
    @Param('id') id: string,
    @CurrentUser() user: DevUserPayload,
  ): Promise<void> {
    return this.foldersService.restore(id, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft-delete a folder and all its contents' })
  @ApiResponse({ status: 204, description: 'Folder moved to trash' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: DevUserPayload,
  ): Promise<void> {
    return this.foldersService.delete(id, user);
  }
}
