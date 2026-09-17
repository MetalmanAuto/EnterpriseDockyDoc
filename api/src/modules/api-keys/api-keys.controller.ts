import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyDto, CreateApiKeyDto, CreatedApiKeyDto } from './dto/api-key.dto';
import { DevAuthGuard, type DevUserPayload } from '../../common/guards/dev-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * Personal API keys. Managed from a signed-in session only: a key must not be
 * able to mint or revoke keys, or one leaked key becomes every key.
 */
@ApiTags('API keys')
@ApiBearerAuth()
@Controller('api-keys')
@UseGuards(DevAuthGuard)
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'List my API keys' })
  @ApiResponse({ status: 200, type: [ApiKeyDto] })
  list(@CurrentUser() user: DevUserPayload, @Req() req: Request): Promise<ApiKeyDto[]> {
    rejectApiKeyCaller(req);
    return this.apiKeys.list(user);
  }

  @Post()
  @ApiOperation({ summary: 'Create an API key. The full key is returned once.' })
  @ApiResponse({ status: 201, type: CreatedApiKeyDto })
  create(
    @Body() dto: CreateApiKeyDto,
    @CurrentUser() user: DevUserPayload,
    @Req() req: Request,
  ): Promise<CreatedApiKeyDto> {
    rejectApiKeyCaller(req);
    return this.apiKeys.create(user, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke an API key' })
  @ApiResponse({ status: 204, description: 'Key revoked' })
  async revoke(
    @Param('id') id: string,
    @CurrentUser() user: DevUserPayload,
    @Req() req: Request,
  ): Promise<void> {
    rejectApiKeyCaller(req);
    await this.apiKeys.revoke(user, id);
  }
}

function rejectApiKeyCaller(req: Request): void {
  if ((req as Request & { apiKey?: unknown }).apiKey) {
    throw new ForbiddenException('API keys are managed from the DockyDoc app, not with another key.');
  }
}
