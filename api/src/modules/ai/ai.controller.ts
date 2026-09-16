import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { AiService } from './ai.service';
import { ReportsService } from '../reports/reports.service';
import { OcrService } from '../document-intelligence/ocr.service';
import { DevAuthGuard, type DevUserPayload } from '../../common/guards/dev-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  assertEditorOrAbove,
  assertWorkspaceMembership,
} from '../../common/helpers/workspace-access.helper';

// ------------------------------------------------------------------ //
// DTOs
// ------------------------------------------------------------------ //
class AiSearchDto {
  @IsString()
  @IsNotEmpty()
  question!: string;
}

class AiReportDto {
  @IsString()
  @IsNotEmpty()
  type!: string;

  data!: Record<string, unknown>;
}

class AiApplyFieldsDto {
  @IsArray()
  @IsString({ each: true })
  fields!: string[];
}

class AiBatchExtractDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(25)
  limit?: number;

  @IsOptional()
  @IsBoolean()
  includeFailed?: boolean;
}

class AiReportInsightsDto {
  // Optional additional context from frontend (merged with DB-fetched data)
  data?: Record<string, unknown>;
}

// ------------------------------------------------------------------ //
// Controller
// ------------------------------------------------------------------ //
@ApiTags('AI')
@Controller('ai')
@UseGuards(DevAuthGuard)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly reportsService: ReportsService,
    private readonly ocrService: OcrService,
  ) {}

  // ---------------------------------------------------------------- //
  // Existing endpoints
  // ---------------------------------------------------------------- //

  @Get('status')
  @ApiOperation({ summary: 'Check AI availability' })
  status() {
    return { enabled: this.aiService.isEnabled };
  }

  @Get('ocr-status')
  @ApiOperation({ summary: 'Diagnostic: list OCR provider availability' })
  ocrStatus() {
    const providers = this.ocrService.getProviderStatus();
    const anyAvailable = providers.some((p) => p.available);
    return {
      anyAvailable,
      providers,
      recommendation: anyAvailable
        ? null
        : 'No OCR providers are configured. Set AZURE_DOCUMENT_INTELLIGENCE_KEY, MISTRAL_API_KEY, or OPENAI_API_KEY in your environment.',
    };
  }

  @Get('documents/:id/analyze')
  @ApiOperation({ summary: 'Analyze a document with AI' })
  @ApiResponse({ status: 200, description: 'AI analysis result' })
  analyze(@Param('id') id: string) {
    return this.aiService.analyzeDocument(id);
  }

  @Post('search')
  @ApiOperation({ summary: 'AI document search assistant' })
  search(
    @Query('workspaceId') workspaceId: string,
    @Body() dto: AiSearchDto,
  ) {
    return this.aiService.searchAssistant(workspaceId, dto.question);
  }

  @Post('reports/generate')
  @ApiOperation({ summary: 'Generate an AI report' })
  generateReport(@Body() dto: AiReportDto) {
    return this.aiService.generateReport(dto.type, dto.data ?? {});
  }

  // ---------------------------------------------------------------- //
  // Extraction endpoints
  // ---------------------------------------------------------------- //

  @Get('documents/:id/debug')
  @ApiOperation({ summary: 'Step-by-step diagnostic: file read → OCR → AI provider check' })
  debugExtract(@Param('id') id: string) {
    return this.aiService.debugExtract(id);
  }

  @Post('documents/:id/extract')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run full AI extraction on a document' })
  @ApiResponse({ status: 200, description: 'AiExtractionResult' })
  extract(@Param('id') id: string) {
    return this.aiService.extractDocument(id);
  }

  @Get('documents/:id/extraction')
  @ApiOperation({ summary: 'Get the latest AI extraction result for a document' })
  @ApiResponse({ status: 200, description: 'AiExtractionResult or { status: "none" }' })
  async getExtraction(@Param('id') id: string) {
    const result = await this.aiService.getExtraction(id);
    if (result === null) {
      return { status: 'none' };
    }
    return result;
  }

  @Post('documents/:id/apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply specific AI-extracted fields to the document' })
  @ApiResponse({ status: 200, description: 'Lists applied and skipped fields' })
  applyFields(
    @Param('id') id: string,
    @Body() dto: AiApplyFieldsDto,
  ) {
    return this.aiService.applyFields(id, dto.fields ?? []);
  }

  // ---------------------------------------------------------------- //
  // Workspace-level intelligence
  // ---------------------------------------------------------------- //

  @Get('workspaces/:workspaceId/overview')
  @ApiOperation({ summary: 'AI coverage, risk flags and unapplied suggestions for a workspace' })
  @ApiResponse({ status: 200, description: 'AiWorkspaceOverview' })
  workspaceOverview(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: DevUserPayload,
  ) {
    assertWorkspaceMembership(user, workspaceId);
    return this.aiService.getWorkspaceOverview(workspaceId);
  }

  @Post('workspaces/:workspaceId/extract-batch')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue AI extraction for documents that have not been analysed yet' })
  @ApiResponse({ status: 202, description: 'Number of documents queued' })
  extractBatch(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: AiBatchExtractDto,
    @CurrentUser() user: DevUserPayload,
  ) {
    // Batch extraction spends money on the AI provider, so keep it to editors and above.
    assertEditorOrAbove(user, workspaceId);
    return this.aiService.extractWorkspaceBatch(
      workspaceId,
      dto.limit ?? 10,
      dto.includeFailed ?? false,
    );
  }

  // ---------------------------------------------------------------- //
  // Report Insights — pre-fetches real DB data per report type
  // ---------------------------------------------------------------- //

  @Post('reports/insights')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate AI insights from live report data' })
  @ApiResponse({ status: 200, description: 'Summary, insights, recommendations, urgent items' })
  async reportInsights(
    @Query('workspaceId') workspaceId: string,
    @Query('reportType') reportType: string,
    @Body() dto: AiReportInsightsDto,
    @CurrentUser() user: DevUserPayload,
  ) {
    // Pre-fetch real data from the database based on report type
    // This guarantees AI always has accurate, up-to-date information
    let freshData: Record<string, unknown> = {};

    try {
      switch (reportType) {
        case 'expiring_documents':
          freshData = await this.reportsService.getExpiringDocuments(workspaceId, user, 90) as unknown as Record<string, unknown>;
          break;
        case 'document_activity':
          freshData = await this.reportsService.getDocumentActivity(workspaceId, user, 30) as unknown as Record<string, unknown>;
          break;
        case 'storage_usage':
          freshData = await this.reportsService.getStorageUsage(workspaceId, user) as unknown as Record<string, unknown>;
          break;
        case 'member_activity':
          freshData = await this.reportsService.getMemberActivity(workspaceId, user, 30) as unknown as Record<string, unknown>;
          break;
        case 'tag_coverage':
          freshData = await this.reportsService.getTagCoverage(workspaceId, user) as unknown as Record<string, unknown>;
          break;
        case 'compliance_exposure':
          freshData = await this.reportsService.getComplianceExposure(workspaceId, user) as unknown as Record<string, unknown>;
          break;
        default:
          // Unknown report type — use whatever the frontend sent
          freshData = dto.data ?? {};
      }
    } catch {
      // Fall back to frontend-provided data if DB fetch fails
      freshData = dto.data ?? {};
    }

    // Merge frontend data with fresh DB data (DB data takes precedence)
    const mergedData = { ...dto.data, ...freshData };

    return this.aiService.generateReportInsights(workspaceId, reportType, mergedData);
  }
}
