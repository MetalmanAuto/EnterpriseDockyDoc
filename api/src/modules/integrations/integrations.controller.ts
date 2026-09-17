import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { DevAuthGuard, type DevUserPayload } from '../../common/guards/dev-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { ApiKeyContext } from '../api-keys/api-keys.service';
import { uploadFileInterceptor } from '../documents/documents.controller';
import { IntegrationsService } from './integrations.service';
import {
  DeliverDocumentsDto,
  DeliveryDto,
  FetchDocumentsDto,
  FetchResultDto,
  FindDocumentsDto,
  FindResultDto,
  IntegrationDocumentDto,
  IntegrationMeDto,
  IntegrationUploadDto,
} from './dto/integrations.dto';

/**
 * Endpoints for other software: a WhatsApp bot, an assistant, a script.
 * Authenticate with a personal API key as `Authorization: Bearer dd_live_…`.
 * Every call acts as the key's owner.
 */
@ApiTags('Integrations')
@ApiBearerAuth()
@Controller('integrations')
@UseGuards(DevAuthGuard)
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Who this key belongs to, and their workspaces' })
  @ApiResponse({ status: 200, type: IntegrationMeDto })
  me(@CurrentUser() user: DevUserPayload, @Req() req: Request): IntegrationMeDto {
    return this.integrations.me(user, keyOf(req));
  }

  @Post('find')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Work out which documents a plain-English request means' })
  @ApiResponse({ status: 200, type: FindResultDto })
  find(@Body() dto: FindDocumentsDto, @CurrentUser() user: DevUserPayload): Promise<FindResultDto> {
    return this.integrations.find(user, dto);
  }

  @Post('deliver')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get short-lived download links for documents by id' })
  @ApiResponse({ status: 200, type: [DeliveryDto] })
  deliver(@Body() dto: DeliverDocumentsDto, @CurrentUser() user: DevUserPayload): Promise<DeliveryDto[]> {
    return this.integrations.deliver(user, dto);
  }

  @Post('fetch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Find and deliver in one call: request in, download links out' })
  @ApiResponse({ status: 200, type: FetchResultDto })
  fetch(@Body() dto: FetchDocumentsDto, @CurrentUser() user: DevUserPayload): Promise<FetchResultDto> {
    return this.integrations.fetch(user, dto);
  }

  @Post('upload')
  @UseInterceptors(uploadFileInterceptor())
  @ApiOperation({ summary: 'Upload a file as a new document (needs a key with write access)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        workspaceId: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        labels: { type: 'string', description: 'Comma-separated label names' },
      },
    },
  })
  @ApiResponse({ status: 201, type: IntegrationDocumentDto })
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: IntegrationUploadDto,
    @CurrentUser() user: DevUserPayload,
    @Req() req: Request,
  ): Promise<IntegrationDocumentDto> {
    if (!file) throw new BadRequestException('No file provided');
    return this.integrations.upload(user, keyOf(req), dto, file);
  }
}

function keyOf(req: Request): ApiKeyContext | undefined {
  return (req as Request & { apiKey?: ApiKeyContext }).apiKey;
}
