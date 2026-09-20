import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { fullCard, plainAnswer, rank, shortLine, toCard } from './assistant-context';
import { STORAGE_SERVICE } from '../storage/storage.module';
import type { IStorageService } from '../storage/storage.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/services/encryption.service';
import { BillingService } from '../billing/billing.service';
import { actionsForPages } from '../billing/plans';
import { PlanLimitException } from '../../common/exceptions/plan-limit.exception';
import { OcrService } from '../document-intelligence/ocr.service';
import { ExtractionService } from '../document-intelligence/extraction.service';
import type { ConfidenceByField } from '../document-intelligence/extraction.service';
import { ReminderPlannerService } from '../reminders/reminder-planner.service';

// ------------------------------------------------------------------ //
// Metadata key constants
// ------------------------------------------------------------------ //
const AI_KEYS = {
  STATUS: 'ai:status',
  DOCUMENT_TYPE: 'ai:documentType',
  TITLE: 'ai:title',
  ISSUER: 'ai:issuer',
  COUNTERPARTY: 'ai:counterparty',
  CONTRACT_NUMBER: 'ai:contractNumber',
  POLICY_NUMBER: 'ai:policyNumber',
  CERTIFICATE_NUMBER: 'ai:certificateNumber',
  REFERENCE_NUMBER: 'ai:referenceNumber',
  ISSUE_DATE: 'ai:issueDate',
  EFFECTIVE_DATE: 'ai:effectiveDate',
  EXPIRY_DATE: 'ai:expiryDate',
  RENEWAL_DATE: 'ai:renewalDueDate',
  SUMMARY: 'ai:summary',
  KEY_POINTS: 'ai:keyPoints',
  SUGGESTED_TAGS: 'ai:suggestedTags',
  SUGGESTED_FOLDER: 'ai:suggestedFolder',
  RISK_FLAGS: 'ai:riskFlags',
  OVERALL_CONFIDENCE: 'ai:overallConfidence',
  DATE_CONFIDENCE: 'ai:dateConfidence',
  CONFIDENCE_BY_FIELD: 'ai:confidenceByField',
  OCR_PROVIDER: 'ai:ocrProvider',
  EXTRACTED_AT: 'ai:extractedAt',
  APPLIED_FIELDS: 'ai:appliedFields',
  USER_APPLIED_FIELDS: 'ai:userAppliedFields', // fields manually applied by user — never auto-overwrite
  ERROR: 'ai:error',
  STARTED_AT: 'ai:startedAt',
} as const;

// ------------------------------------------------------------------ //
// AiExtractionResult interface
// ------------------------------------------------------------------ //
export interface AiExtractionResult {
  status: 'done' | 'running' | 'failed' | 'disabled' | 'none';
  documentType: string | null;
  title: string | null;
  issuer: string | null;
  counterparty: string | null;
  contractNumber: string | null;
  policyNumber: string | null;
  certificateNumber: string | null;
  referenceNumber: string | null;
  issueDate: string | null;
  effectiveDate: string | null;
  expiryDate: string | null;
  renewalDueDate: string | null;
  summary: string | null;
  keyPoints: string[];
  suggestedTags: string[];
  suggestedFolder: string | null;
  riskFlags: string[];
  overallConfidence: number;
  dateConfidence: number;
  confidenceByField: ConfidenceByField;
  ocrProvider: string | null;
  extractedAt: string | null;
  appliedFields: string[];       // auto-applied fields (can be re-applied on re-extraction)
  userAppliedFields: string[];   // manually confirmed by user — never auto-overwritten
  error: string | null;
}

// ------------------------------------------------------------------ //
// Workspace-level AI overview
// ------------------------------------------------------------------ //
export interface AiWorkspaceOverview {
  enabled: boolean;
  ocrAvailable: boolean;
  totalDocuments: number;
  analyzed: number;
  running: number;
  failed: number;
  notAnalyzed: number;
  lastExtractedAt: string | null;
  riskFlags: { documentId: string; documentName: string; flags: string[] }[];
  riskFlagCount: number;
  pendingSuggestions: {
    documentId: string;
    documentName: string;
    fields: string[];
    expiryDate: string | null;
    confidence: number;
  }[];
  pendingSuggestionCount: number;
}

/** How many risk-flag / suggestion rows the overview returns before truncating. */
const OVERVIEW_LIST_LIMIT = 20;

/**
 * The only metadata the workspace overview reads. Listing them keeps the long
 * values (summary, key points, per-field confidence) out of a whole-workspace query.
 */
const OVERVIEW_META_KEYS: string[] = [
  'ai:status',
  'ai:startedAt',
  'ai:extractedAt',
  'ai:riskFlags',
  'ai:appliedFields',
  'ai:userAppliedFields',
  'ai:expiryDate',
  'ai:renewalDueDate',
  'ai:suggestedTags',
  'ai:suggestedFolder',
  'ai:overallConfidence',
];

/** Hard ceiling on one batch extraction request. */
const BATCH_MAX = 25;

/**
 * A document stuck on "running" for longer than this is treated as abandoned
 * (an API restart mid-batch, say) and can be picked up again.
 */
const STALE_RUN_MS = 30 * 60 * 1000;

// ------------------------------------------------------------------ //
// Helpers
// ------------------------------------------------------------------ //
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(v: unknown): v is string {
  return typeof v === 'string' && DATE_RE.test(v);
}

function safeString(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string') return v.trim() || null;
  return String(v).trim() || null;
}

/**
 * Has a "running" extraction been abandoned? A missing or unreadable start time
 * counts as abandoned — rows written before start times were recorded would
 * otherwise stay stuck on running forever.
 */
function isStaleRun(startedAt: string | undefined, staleBefore: number): boolean {
  const started = Date.parse(startedAt ?? '');
  return !Number.isFinite(started) || started < staleBefore;
}

/** Parse a metadata value that holds a JSON array of strings. */
function parseJsonArrayValue(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function safeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string');
}

function safeNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

function emptyConfidenceByField(): ConfidenceByField {
  return {
    documentType: 0, title: 0, issuer: 0, counterparty: 0,
    contractNumber: 0, policyNumber: 0, certificateNumber: 0, referenceNumber: 0,
    issueDate: 0, effectiveDate: 0, expiryDate: 0, renewalDueDate: 0,
    suggestedTags: 0, suggestedFolder: 0,
  };
}

// ------------------------------------------------------------------ //
// Assistant ("when does my Schengen visa expire?")
// ------------------------------------------------------------------ //

const ASSISTANT_MAX_DOCUMENTS = 300;
const ASSISTANT_FOCUS_DOCUMENTS = 6;
const ASSISTANT_TEXT_CHARS = 6000;

const AssistantReply = z.object({
  answer: z.string().describe('The reply shown to the person, in plain text'),
  relevantDocumentIds: z.array(z.string()).describe('ids of the documents the answer is based on, most relevant first, up to 5; empty if none'),
});

/** All billable tokens on a call, cached reads and writes included. */
function usageTokens(u: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null }): number {
  return u.input_tokens + u.output_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
}

function describeUsage(u: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null }): string {
  return `in=${u.input_tokens} out=${u.output_tokens} cacheWrite=${u.cache_creation_input_tokens ?? 0} cacheRead=${u.cache_read_input_tokens ?? 0}`;
}

const ASSISTANT_SYSTEM = `You are the assistant inside DockyDoc, an app where people store documents such as passports, visas, insurance policies, contracts, licences and certificates and track when they expire.

You are given what the app knows about every document in the person's workspace, then their question. Answer from that material only.

How to answer:
- Lead with the answer. For a date question, give the exact date and the days remaining, both of which are already worked out in the material, and name the document it comes from.
- People use everyday names: "Schengen visa" may be stored as "Visa - France 2026", a "car policy" as "Motor insurance". Match on meaning, using type, issuer, labels, summary and scanned text, not just the file name.
- If several documents could be meant, answer for the likeliest and mention the others in one line.
- If a document matches but has no expiry date recorded, look for the date in its scanned text. If you find one, give it and say it came from the text and is not yet recorded on the document. If there is no text either, say the document has not been read by AI yet and that opening it and running AI extraction will fill this in.
- If nothing matches, say so plainly and name the closest documents you saw, so the person can tell whether it is missing or just named differently.
- Never invent a date, a number or a document. Never quote an id in the answer; use document names.
- Write in short plain sentences, no headings, no markdown. Two to five sentences is usually right.`;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Anthropic | null;
  private readonly openaiApiKey: string | null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly ocrService: OcrService,
    private readonly extractionService: ExtractionService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly reminderPlanner: ReminderPlannerService,
    private readonly billing: BillingService,
  ) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    this.client = apiKey ? new Anthropic({ apiKey }) : null;

    this.openaiApiKey = this.config.get<string>('OPENAI_API_KEY') ?? null;

    if (!this.client && !this.openaiApiKey) {
      this.logger.warn('Neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is set — AI features disabled');
    } else if (!this.client) {
      this.logger.log('ANTHROPIC_API_KEY not set — using OpenAI GPT-4o for extraction');
    }
  }

  get isEnabled(): boolean {
    // Enabled when either Anthropic or OpenAI is configured
    return this.client !== null || !!this.openaiApiKey;
  }

  // ---------------------------------------------------------------- //
  // Metadata upsert helper
  // ---------------------------------------------------------------- //
  private async upsertMeta(
    documentId: string,
    key: string,
    value: string,
  ): Promise<void> {
    await this.prisma.documentMetadata.upsert({
      where: { documentId_key: { documentId, key } },
      update: { value },
      create: { documentId, key, value },
    });
  }

  // ---------------------------------------------------------------- //
  // Workspace-aware client routing
  // ---------------------------------------------------------------- //

  private async getClientForWorkspace(workspaceId: string): Promise<{
    client: Anthropic | null;
    isplatform: boolean;
    workspaceId: string;
  } | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workspace = await (this.prisma.workspace as any).findUnique({
      where: { id: workspaceId },
      select: {
        plan: true,
        aiProvider: true,
        aiApiKeyEncrypted: true,
        aiUsageTokens: true,
      },
    }) as { plan: string; aiProvider: string; aiApiKeyEncrypted: string | null; aiUsageTokens: number } | null;
    if (!workspace) return null;

    const isPlatform = workspace.aiProvider !== 'BYOK';

    if (isPlatform) {
      // Allowances are checked where the work happens (chargeAiActions), in
      // actions rather than tokens, so a person sees "3 of 50 used" not a token count.
      // Allow pipeline to proceed when OpenAI is configured even without Anthropic key.
      // ExtractionService will use GPT-4o in that case; client override stays null.
      if (!this.client && !this.openaiApiKey) {
        this.logger.warn(`[extractDocument] No AI client available for workspace ${workspaceId} — both ANTHROPIC_API_KEY and OPENAI_API_KEY are missing`);
        return null;
      }
      return { client: this.client, isplatform: true, workspaceId };
    } else {
      if (!workspace.aiApiKeyEncrypted) {
        throw new Error('BYOK is selected but no API key has been configured. Please add your API key in Workspace Settings → AI Configuration.');
      }
      let decryptedKey: string;
      try {
        decryptedKey = this.encryption.decrypt(workspace.aiApiKeyEncrypted);
      } catch {
        throw new Error('Failed to decrypt workspace API key. Please re-enter your API key in Workspace Settings → AI Configuration.');
      }
      const byokClient = new Anthropic({ apiKey: decryptedKey });
      return { client: byokClient, isplatform: false, workspaceId };
    }
  }

  private async trackUsage(workspaceId: string, tokens: number): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.prisma.workspace as any).update({
        where: { id: workspaceId },
        data: { aiUsageTokens: { increment: tokens } },
      });
    } catch {
      this.logger.warn(`Failed to track AI usage for workspace ${workspaceId}`);
    }
  }

  // ---------------------------------------------------------------- //
  // extractDocument  — main pipeline
  // ---------------------------------------------------------------- //
  async extractDocument(documentId: string): Promise<AiExtractionResult> {
    await this.upsertMeta(documentId, AI_KEYS.STATUS, 'running');
    await this.upsertMeta(documentId, AI_KEYS.STARTED_AT, new Date().toISOString());

    try {
      // ---- 1. Fetch document (include current version for storageKey/mimeType) //
      const doc = await this.prisma.document.findUnique({
        where: { id: documentId },
        include: {
          searchContent: true,
          metadata: true,
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
            select: { storageKey: true, mimeType: true },
          },
        },
      });
      if (!doc) throw new NotFoundException(`Document ${documentId} not found`);

      // ---- 2. Get workspace client ----------------------------------- //
      const routing = await this.getClientForWorkspace(doc.workspaceId);
      if (!routing) {
        await this.upsertMeta(documentId, AI_KEYS.STATUS, 'disabled');
        return this.buildDisabledResult();
      }

      // ---- 3. Read file buffer from the latest DocumentVersion ------- //
      const currentVersion = doc.versions[0] ?? null;
      const storageKey: string = currentVersion?.storageKey ?? '';
      const mimeType: string = currentVersion?.mimeType ?? '';

      this.logger.log(
        `extractDocument ${documentId}: storageKey="${storageKey}" mimeType="${mimeType}"`,
      );

      let fileBuffer: Buffer | null = null;
      if (storageKey) {
        try {
          fileBuffer = await this.storage.getBuffer(storageKey);
          this.logger.log(
            `extractDocument ${documentId}: read ${fileBuffer.length} bytes (key="${storageKey}")`,
          );
        } catch {
          this.logger.warn(
            `extractDocument ${documentId}: could not read file for key "${storageKey}" — file may not exist`,
          );
        }
      } else {
        this.logger.warn(
          `extractDocument ${documentId}: no storageKey found (document has ${doc.versions.length} version(s))`,
        );
      }

      // ---- 4. OCR --------------------------------------------------- //
      // Skip OCR for formats with no text-extraction support (Excel, PowerPoint, ZIP)
      const OCR_UNSUPPORTED = new Set([
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/zip',
      ]);

      if (mimeType && OCR_UNSUPPORTED.has(mimeType)) {
        this.logger.warn(
          `extractDocument ${documentId}: MIME type "${mimeType}" has no OCR support — skipping extraction, marking disabled`,
        );
        await this.upsertMeta(documentId, AI_KEYS.STATUS, 'disabled');
        return this.buildDisabledResult();
      }

      let ocrOutput = fileBuffer
        ? await this.ocrService.extract(fileBuffer, mimeType, doc.name)
        : null;

      // Fallback: use existing searchContent text if OCR failed/unavailable
      if (!ocrOutput && doc.searchContent?.extractedText) {
        const fallbackText = doc.searchContent.extractedText.trim();
        if (fallbackText.length > 10) {
          ocrOutput = {
            provider: 'search-content-fallback',
            fullText: fallbackText,
            pages: [{ pageNumber: 1, text: fallbackText }],
            pageCount: 1,
            confidence: 0.7,
            processingTimeMs: 0,
          };
        }
      }

      if (!ocrOutput) {
        throw new Error('Could not extract text from document — no OCR provider succeeded and no cached text available.');
      }

      // One AI action per document, more for long scans. Fails with a clear
      // message when the allowance is used up; the document stays unread.
      await this.billing.chargeAiActions(doc.workspaceId, actionsForPages(ocrOutput.pageCount), 'document_read');

      this.logger.log(
        `extractDocument ${documentId}: OCR via ${ocrOutput.provider}, ${ocrOutput.fullText.length} chars`,
      );

      // ---- 5. Structured extraction ---------------------------------- //
      const extracted = await this.extractionService.extract(
        ocrOutput,
        doc.name,
        routing.client ?? undefined, // Pass workspace-specific Anthropic client for BYOK; null → let ExtractionService use OpenAI
      );

      if (!extracted) {
        throw new Error('Structured extraction failed — no AI provider returned a valid result.');
      }

      // ---- 6. Persist metadata -------------------------------------- //
      const metaEntries: [string, string][] = [
        [AI_KEYS.DOCUMENT_TYPE, extracted.documentType ?? 'other'],
        [AI_KEYS.TITLE, extracted.title ?? ''],
        [AI_KEYS.ISSUER, extracted.issuer ?? ''],
        [AI_KEYS.COUNTERPARTY, extracted.counterparty ?? ''],
        [AI_KEYS.CONTRACT_NUMBER, extracted.contractNumber ?? ''],
        [AI_KEYS.POLICY_NUMBER, extracted.policyNumber ?? ''],
        [AI_KEYS.CERTIFICATE_NUMBER, extracted.certificateNumber ?? ''],
        [AI_KEYS.REFERENCE_NUMBER, extracted.referenceNumber ?? ''],
        [AI_KEYS.ISSUE_DATE, extracted.issueDate ?? ''],
        [AI_KEYS.EFFECTIVE_DATE, extracted.effectiveDate ?? ''],
        [AI_KEYS.EXPIRY_DATE, extracted.expiryDate ?? ''],
        [AI_KEYS.RENEWAL_DATE, extracted.renewalDueDate ?? ''],
        [AI_KEYS.SUMMARY, extracted.summary ?? ''],
        [AI_KEYS.KEY_POINTS, JSON.stringify(extracted.keyPoints)],
        [AI_KEYS.SUGGESTED_TAGS, JSON.stringify(extracted.suggestedTags)],
        [AI_KEYS.SUGGESTED_FOLDER, extracted.suggestedFolder ?? ''],
        [AI_KEYS.RISK_FLAGS, JSON.stringify(extracted.riskFlags)],
        [AI_KEYS.OVERALL_CONFIDENCE, String(extracted.overallConfidence)],
        [AI_KEYS.DATE_CONFIDENCE, String(extracted.dateConfidence)],
        [AI_KEYS.CONFIDENCE_BY_FIELD, JSON.stringify(extracted.confidenceByField)],
        [AI_KEYS.OCR_PROVIDER, ocrOutput.provider],
      ];

      for (const [key, value] of metaEntries) {
        await this.upsertMeta(documentId, key, value);
      }

      const extractedAt = new Date().toISOString();
      await this.upsertMeta(documentId, AI_KEYS.STATUS, 'done');
      await this.upsertMeta(documentId, AI_KEYS.EXTRACTED_AT, extractedAt);

      // ---- 7. Auto-apply high-confidence fields ---------------------- //
      //
      // Thresholds:
      //   expiryDate / renewalDueDate: >= 0.60 (pre-scan makes these reliable)
      //   Other fields: >= 0.85 (reserved for future field auto-apply)
      //
      // User-confirmed fields (ai:userAppliedFields) are NEVER overwritten.

      const EXPIRY_AUTO_APPLY_THRESHOLD = 0.60; // lower — pre-scan regex is very reliable
      const cfb = extracted.confidenceByField;

      // Load user-confirmed fields — these were manually applied by the user
      const userAppliedMeta = doc.metadata.find((m) => m.key === AI_KEYS.USER_APPLIED_FIELDS);
      const userAppliedFields: string[] = userAppliedMeta
        ? (() => { try { return JSON.parse(userAppliedMeta.value) as string[]; } catch { return []; } })()
        : [];

      // Load previous AI auto-applied fields (may be re-applied on re-extraction)
      const prevAutoAppliedMeta = doc.metadata.find((m) => m.key === AI_KEYS.APPLIED_FIELDS);
      const prevAutoApplied: string[] = prevAutoAppliedMeta
        ? (() => { try { return JSON.parse(prevAutoAppliedMeta.value) as string[]; } catch { return []; } })()
        : [];

      const autoApplied: string[] = [];

      const docUpdate: { expiryDate?: Date; renewalDueDate?: Date } = {};

      // expiryDate — auto-save whenever AI finds one and user hasn't manually set it
      if (extracted.expiryDate) {
        const conf = cfb.expiryDate;
        const isUserConfirmed = userAppliedFields.includes('expiryDate');
        const wasAiApplied = prevAutoApplied.includes('expiryDate');
        this.logger.log(
          `[AutoFill] expiryDate=${extracted.expiryDate} conf=${conf.toFixed(2)} ` +
          `userConfirmed=${isUserConfirmed} wasAiApplied=${wasAiApplied} docHasDate=${doc.expiryDate !== null}`,
        );
        if (!isUserConfirmed && conf >= EXPIRY_AUTO_APPLY_THRESHOLD) {
          // Auto-save if: document has no date yet, OR the existing date was previously AI-applied (can update)
          if (doc.expiryDate === null || wasAiApplied) {
            docUpdate.expiryDate = new Date(extracted.expiryDate);
            autoApplied.push('expiryDate');
            this.logger.log(`[AutoFill] ✓ Auto-saved expiryDate=${extracted.expiryDate} (conf=${conf.toFixed(2)})`);
          } else {
            this.logger.log(`[AutoFill] Skipped expiryDate — user has manually set a date (protected)`);
          }
        } else if (conf < EXPIRY_AUTO_APPLY_THRESHOLD) {
          this.logger.log(`[AutoFill] expiryDate conf=${conf.toFixed(2)} below threshold — shown as suggestion only`);
        }
      }

      // renewalDueDate — same logic
      if (extracted.renewalDueDate) {
        const conf = cfb.renewalDueDate;
        const isUserConfirmed = userAppliedFields.includes('renewalDueDate');
        const wasAiApplied = prevAutoApplied.includes('renewalDueDate');
        this.logger.log(
          `[AutoFill] renewalDueDate=${extracted.renewalDueDate} conf=${conf.toFixed(2)} userConfirmed=${isUserConfirmed}`,
        );
        if (!isUserConfirmed && conf >= EXPIRY_AUTO_APPLY_THRESHOLD) {
          const docRenewal = (doc as any).renewalDueDate;
          if (docRenewal === null || wasAiApplied) {
            docUpdate.renewalDueDate = new Date(extracted.renewalDueDate);
            autoApplied.push('renewalDueDate');
            this.logger.log(`[AutoFill] ✓ Auto-saved renewalDueDate=${extracted.renewalDueDate}`);
          }
        }
      }

      if (Object.keys(docUpdate).length > 0) {
        await this.prisma.document.update({ where: { id: documentId }, data: docUpdate });
        if (docUpdate.expiryDate) {
          await this.reminderPlanner.syncForExpiryChange(documentId, doc.expiryDate, docUpdate.expiryDate);
        }
      }

      // Persist auto-applied fields list (reset each extraction — only tracks THIS run)
      await this.upsertMeta(documentId, AI_KEYS.APPLIED_FIELDS, JSON.stringify(autoApplied));

      // Track token usage for platform clients
      // (We don't have token counts from ExtractionService; use a reasonable estimate)
      if (routing.isplatform) {
        const estimatedTokens = Math.ceil(ocrOutput.fullText.length / 4) + 1000;
        await this.trackUsage(doc.workspaceId, estimatedTokens);
      }

      return {
        status: 'done',
        documentType: extracted.documentType,
        title: extracted.title,
        issuer: extracted.issuer,
        counterparty: extracted.counterparty,
        contractNumber: extracted.contractNumber,
        policyNumber: extracted.policyNumber,
        certificateNumber: extracted.certificateNumber,
        referenceNumber: extracted.referenceNumber,
        issueDate: extracted.issueDate,
        effectiveDate: extracted.effectiveDate,
        expiryDate: extracted.expiryDate,
        renewalDueDate: extracted.renewalDueDate,
        summary: extracted.summary,
        keyPoints: extracted.keyPoints,
        suggestedTags: extracted.suggestedTags,
        suggestedFolder: extracted.suggestedFolder,
        riskFlags: extracted.riskFlags,
        overallConfidence: extracted.overallConfidence,
        dateConfidence: extracted.dateConfidence,
        confidenceByField: extracted.confidenceByField,
        ocrProvider: ocrOutput.provider,
        extractedAt,
        appliedFields: autoApplied,
        userAppliedFields,
        error: null,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error during extraction';
      this.logger.error(`extractDocument failed for ${documentId}: ${errorMessage}`);

      try {
        await this.upsertMeta(documentId, AI_KEYS.STATUS, 'failed');
        await this.upsertMeta(documentId, AI_KEYS.ERROR, errorMessage);
      } catch (metaErr) {
        this.logger.error(`Failed to write error metadata: ${(metaErr as Error).message}`);
      }

      return this.buildFailedResult(errorMessage);
    }
  }

  // ---------------------------------------------------------------- //
  // getExtraction
  // ---------------------------------------------------------------- //
  async getExtraction(documentId: string): Promise<AiExtractionResult | null> {
    const metaRows = await this.prisma.documentMetadata.findMany({
      where: { documentId, key: { startsWith: 'ai:' } },
    });

    if (metaRows.length === 0) return null;

    const meta = new Map<string, string>(metaRows.map((r) => [r.key, r.value]));

    const status = (meta.get(AI_KEYS.STATUS) ?? 'none') as AiExtractionResult['status'];

    const parseJsonArray = (key: string): string[] => {
      const raw = meta.get(key);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch { return []; }
    };

    const parseConfidenceByField = (): ConfidenceByField => {
      const raw = meta.get(AI_KEYS.CONFIDENCE_BY_FIELD);
      if (!raw) return emptyConfidenceByField();
      try {
        return JSON.parse(raw) as ConfidenceByField;
      } catch { return emptyConfidenceByField(); }
    };

    return {
      status,
      documentType: meta.get(AI_KEYS.DOCUMENT_TYPE) || null,
      title: meta.get(AI_KEYS.TITLE) || null,
      issuer: meta.get(AI_KEYS.ISSUER) || null,
      counterparty: meta.get(AI_KEYS.COUNTERPARTY) || null,
      contractNumber: meta.get(AI_KEYS.CONTRACT_NUMBER) || null,
      policyNumber: meta.get(AI_KEYS.POLICY_NUMBER) || null,
      certificateNumber: meta.get(AI_KEYS.CERTIFICATE_NUMBER) || null,
      referenceNumber: meta.get(AI_KEYS.REFERENCE_NUMBER) || null,
      issueDate: isValidDate(meta.get(AI_KEYS.ISSUE_DATE)) ? (meta.get(AI_KEYS.ISSUE_DATE) as string) : null,
      effectiveDate: isValidDate(meta.get(AI_KEYS.EFFECTIVE_DATE)) ? (meta.get(AI_KEYS.EFFECTIVE_DATE) as string) : null,
      expiryDate: isValidDate(meta.get(AI_KEYS.EXPIRY_DATE)) ? (meta.get(AI_KEYS.EXPIRY_DATE) as string) : null,
      renewalDueDate: isValidDate(meta.get(AI_KEYS.RENEWAL_DATE)) ? (meta.get(AI_KEYS.RENEWAL_DATE) as string) : null,
      summary: meta.get(AI_KEYS.SUMMARY) || null,
      keyPoints: parseJsonArray(AI_KEYS.KEY_POINTS),
      suggestedTags: parseJsonArray(AI_KEYS.SUGGESTED_TAGS),
      suggestedFolder: meta.get(AI_KEYS.SUGGESTED_FOLDER) || null,
      riskFlags: parseJsonArray(AI_KEYS.RISK_FLAGS),
      overallConfidence: safeNumber(meta.get(AI_KEYS.OVERALL_CONFIDENCE), 0),
      dateConfidence: safeNumber(meta.get(AI_KEYS.DATE_CONFIDENCE), 0),
      confidenceByField: parseConfidenceByField(),
      ocrProvider: meta.get(AI_KEYS.OCR_PROVIDER) || null,
      extractedAt: meta.get(AI_KEYS.EXTRACTED_AT) || null,
      appliedFields: parseJsonArray(AI_KEYS.APPLIED_FIELDS),
      userAppliedFields: parseJsonArray(AI_KEYS.USER_APPLIED_FIELDS),
      error: meta.get(AI_KEYS.ERROR) || null,
    };
  }

  // ---------------------------------------------------------------- //
  // applyFields
  // ---------------------------------------------------------------- //
  async applyFields(
    documentId: string,
    fields: string[],
  ): Promise<{ applied: string[]; skipped: string[] }> {
    const applied: string[] = [];
    const skipped: string[] = [];

    const [metaRows, doc] = await Promise.all([
      this.prisma.documentMetadata.findMany({
        where: { documentId, key: { startsWith: 'ai:' } },
      }),
      this.prisma.document.findUnique({ where: { id: documentId } }),
    ]);

    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);

    const meta = new Map<string, string>(metaRows.map((r) => [r.key, r.value]));

    const appliedMeta = meta.get(AI_KEYS.APPLIED_FIELDS);
    const existingApplied: string[] = appliedMeta
      ? (() => { try { return JSON.parse(appliedMeta) as string[]; } catch { return []; } })()
      : [];

    const updateData: {
      expiryDate?: Date | null;
      renewalDueDate?: Date | null;
      isReminderEnabled?: boolean;
      folderId?: string | null;
    } = {};

    const supportedFields = new Set([
      'expiryDate', 'renewalDueDate', 'isReminderEnabled', 'suggestedTags', 'suggestedFolder',
    ]);

    for (const field of fields) {
      if (!supportedFields.has(field)) {
        skipped.push(field);
        continue;
      }

      if (field === 'expiryDate') {
        const rawDate = meta.get(AI_KEYS.EXPIRY_DATE);
        if (isValidDate(rawDate)) {
          updateData.expiryDate = new Date(rawDate as string);
          applied.push(field);
        } else {
          skipped.push(field);
        }
        continue;
      }

      if (field === 'renewalDueDate') {
        const rawDate = meta.get(AI_KEYS.RENEWAL_DATE);
        if (isValidDate(rawDate)) {
          updateData.renewalDueDate = new Date(rawDate as string);
          applied.push(field);
        } else {
          skipped.push(field);
        }
        continue;
      }

      if (field === 'isReminderEnabled') {
        const hasExpiry =
          isValidDate(meta.get(AI_KEYS.EXPIRY_DATE)) ||
          isValidDate(meta.get(AI_KEYS.RENEWAL_DATE));
        if (hasExpiry) {
          updateData.isReminderEnabled = true;
          applied.push(field);
        } else {
          skipped.push(field);
        }
        continue;
      }

      if (field === 'suggestedTags') {
        const rawTags = meta.get(AI_KEYS.SUGGESTED_TAGS);
        const tagNames: string[] = rawTags
          ? (() => { try { return JSON.parse(rawTags) as string[]; } catch { return []; } })()
          : [];
        if (tagNames.length > 0) {
          const tagIds: string[] = [];
          for (const name of tagNames) {
            const trimmed = name.trim();
            if (!trimmed) continue;
            let tag = await this.prisma.documentTag.findFirst({
              where: { workspaceId: doc.workspaceId, name: { equals: trimmed, mode: 'insensitive' } },
            });
            if (!tag) {
              tag = await this.prisma.documentTag.create({
                data: { workspaceId: doc.workspaceId, name: trimmed },
              });
            }
            tagIds.push(tag.id);
          }
          await this.prisma.documentTagMapping.createMany({
            data: tagIds.map((tagId) => ({ documentId, tagId })),
            skipDuplicates: true,
          });
          applied.push(field);
        } else {
          skipped.push(field);
        }
        continue;
      }

      if (field === 'suggestedFolder') {
        const folderName = meta.get(AI_KEYS.SUGGESTED_FOLDER)?.trim();
        if (folderName) {
          // Fetch ALL workspace folders (not just root) to prevent duplicates at any level
          const existingFolders = await this.prisma.folder.findMany({
            where: { workspaceId: doc.workspaceId },
            select: { id: true, name: true },
          });

          // Canonical form: lowercase, replace & → and, strip non-alphanumeric except spaces, collapse spaces
          const canon = (s: string) =>
            s.toLowerCase()
              .replace(/&/g, 'and')
              .replace(/[^a-z0-9\s]/g, '')
              .replace(/\s+/g, ' ')
              .trim();

          const targetCanon = canon(folderName);

          // 1. Exact canonical match  2. Target contained in existing  3. Existing contained in target
          let folder = existingFolders.find((f) => canon(f.name) === targetCanon)
            ?? existingFolders.find((f) => canon(f.name).includes(targetCanon) || targetCanon.includes(canon(f.name)))
            ?? null;

          if (!folder) {
            this.logger.log(`[ApplyFields] Creating new folder: "${folderName}"`);
            folder = await this.prisma.folder.create({
              data: { workspaceId: doc.workspaceId, name: folderName, createdById: doc.ownerUserId },
            });
          } else {
            this.logger.log(`[ApplyFields] Matched existing folder: "${folder.name}" for suggestion "${folderName}"`);
          }

          updateData.folderId = folder.id;
          applied.push(field);
        } else {
          skipped.push(field);
        }
        continue;
      }
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma.document.update({ where: { id: documentId }, data: updateData });
      if (updateData.expiryDate) {
        await this.reminderPlanner.syncForExpiryChange(documentId, doc.expiryDate, updateData.expiryDate);
      } else if (updateData.isReminderEnabled) {
        await this.reminderPlanner.setEnabled(documentId, true);
      }
    }

    // Merge auto-applied list
    const newApplied = Array.from(new Set([...existingApplied, ...applied]));
    await this.upsertMeta(documentId, AI_KEYS.APPLIED_FIELDS, JSON.stringify(newApplied));

    // Track user-manually-applied fields (never auto-overwritten on re-extraction)
    const userAppliedMeta = await this.prisma.documentMetadata.findFirst({
      where: { documentId, key: AI_KEYS.USER_APPLIED_FIELDS },
    });
    const existingUserApplied: string[] = userAppliedMeta
      ? (() => { try { return JSON.parse(userAppliedMeta.value) as string[]; } catch { return []; } })()
      : [];
    const newUserApplied = Array.from(new Set([...existingUserApplied, ...applied]));
    await this.upsertMeta(documentId, AI_KEYS.USER_APPLIED_FIELDS, JSON.stringify(newUserApplied));

    this.logger.log(
      `[ApplyFields] doc=${documentId} | applied=[${applied.join(',')}] | skipped=[${skipped.join(',')}]`,
    );

    return { applied, skipped };
  }

  // ---------------------------------------------------------------- //
  // generateReportInsights
  // ---------------------------------------------------------------- //
  async generateReportInsights(
    workspaceId: string,
    reportType: string,
    data: Record<string, unknown>,
  ): Promise<{
    summary: string;
    insights: string[];
    recommendations: string[];
    urgentItems: string[];
  }> {
    const routing = await this.getClientForWorkspace(workspaceId);
    if (!routing) {
      return {
        summary: 'AI insights unavailable — no AI provider configured for this workspace.',
        insights: [],
        recommendations: [],
        urgentItems: [],
      };
    }
    try {
      await this.billing.chargeAiActions(workspaceId, 1, 'report_insights');
    } catch (err) {
      if (err instanceof PlanLimitException) {
        return { summary: err.message, insights: [], recommendations: [], urgentItems: [] };
      }
      throw err;
    }

    const dataJson = JSON.stringify(data, null, 2).slice(0, 5000);

    // Determine today's date for relative date reasoning
    const today = new Date().toISOString().slice(0, 10);

    const prompt = `You are a document management analyst. The JSON data below is LIVE data fetched directly from the database — it is complete and accurate.

Report type: ${reportType}
Today's date: ${today}

═══ LIVE DATABASE DATA ═══
${dataJson}
═══════════════════════════

RULES:
1. Use ONLY the data provided above. Do NOT say "I don't have access", "I cannot see", or "you should check".
2. Reference actual numbers: e.g. "5 of 23 documents expire within 30 days" not "some documents may expire".
3. For expiring_documents: name specific documents and their exact expiry dates from the items array.
4. For compliance_exposure: use the riskScore and the actual expired/expiringSoon counts.
5. urgentItems should list actual document names or specific findings — not generic advice.
6. If the data shows 0 issues (e.g. 0 expired documents), say so clearly. Do not invent problems.

Respond with ONLY this JSON object:
{
  "summary": "2-3 sentence executive summary with actual numbers from the data",
  "insights": [
    "Insight 1 with specific data reference",
    "Insight 2 with specific data reference",
    "Insight 3 with specific data reference"
  ],
  "recommendations": [
    "Actionable recommendation based on findings",
    "Second recommendation if applicable"
  ],
  "urgentItems": [
    "Specific urgent item (name, date, count) from the data",
    "Second urgent item if applicable"
  ]
}

No markdown. No code blocks. JSON only.`;

    let rawText: string;

    if (routing.client) {
      // Anthropic Claude
      const message = await routing.client.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      if (routing.isplatform) {
        await this.trackUsage(workspaceId, usageTokens(message.usage));
      }

      const content = message.content[0];
      if (content.type !== 'text') throw new Error('Unexpected AI response type');
      rawText = content.text.trim();
    } else if (this.openaiApiKey) {
      // OpenAI GPT-4o fallback (when only OPENAI_API_KEY is set)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const OpenAI = require('openai');
      const openai = new OpenAI.OpenAI({ apiKey: this.openaiApiKey });
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024,
        temperature: 0,
        response_format: { type: 'json_object' },
      });
      rawText = response.choices[0]?.message?.content?.trim() ?? '';
    } else {
      return {
        summary: 'AI insights unavailable — no AI provider configured.',
        insights: [], recommendations: [], urgentItems: [],
      };
    }

    try {
      let parsed: Record<string, unknown>;
      if (rawText.startsWith('{')) {
        parsed = JSON.parse(rawText);
      } else {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON in response');
        parsed = JSON.parse(jsonMatch[0]);
      }

      return {
        summary: typeof parsed.summary === 'string' ? parsed.summary : 'Report generated.',
        insights: safeStringArray(parsed.insights),
        recommendations: safeStringArray(parsed.recommendations),
        urgentItems: safeStringArray(parsed.urgentItems),
      };
    } catch {
      return {
        summary: rawText.slice(0, 300),
        insights: [],
        recommendations: [],
        urgentItems: [],
      };
    }
  }

  // ---------------------------------------------------------------- //
  // Existing methods (preserved)
  // ---------------------------------------------------------------- //
  async analyzeDocument(documentId: string): Promise<{
    summary: string;
    keyPoints: string[];
    suggestedTags: string[];
    documentType: string;
    confidence: number;
  }> {
    if (!this.client) {
      return {
        summary: 'AI analysis unavailable — ANTHROPIC_API_KEY not configured.',
        keyPoints: [], suggestedTags: [], documentType: 'unknown', confidence: 0,
      };
    }

    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { searchContent: true, tags: { include: { tag: true } } },
    });
    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);

    const text = doc.searchContent?.extractedText ?? '';
    const prompt = `You are a document analyst. Analyze the following document and respond with JSON only.

Document name: ${doc.name}
Document type: ${doc.fileType}
Content excerpt (first 3000 chars): ${text.slice(0, 3000)}

Respond with this exact JSON structure:
{
  "summary": "2-3 sentence summary of the document",
  "keyPoints": ["point 1", "point 2", "point 3"],
  "suggestedTags": ["tag1", "tag2"],
  "documentType": "contract|invoice|report|policy|agreement|other",
  "confidence": 0.85
}`;

    const message = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== 'text') throw new Error('Unexpected AI response type');

    try {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      return JSON.parse(jsonMatch[0]);
    } catch {
      return {
        summary: content.text.slice(0, 200),
        keyPoints: [], suggestedTags: [], documentType: 'unknown', confidence: 0.3,
      };
    }
  }

  async searchAssistant(
    workspaceId: string,
    question: string,
  ): Promise<{ answer: string; relevantDocuments: { id: string; name: string }[] }> {
    const [workspace, docs] = await Promise.all([
      this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } }),
      this.prisma.document.findMany({
        where: { workspaceId, status: 'ACTIVE' },
        select: {
          id: true, name: true, fileName: true, description: true, expiryDate: true, renewalDueDate: true, updatedAt: true,
          folder: { select: { name: true } },
          tags: { select: { tag: { select: { name: true } } } },
          metadata: { select: { key: true, value: true } },
          searchContent: { select: { extractedText: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: ASSISTANT_MAX_DOCUMENTS,
      }),
    ]);
    if (!workspace) throw new NotFoundException(`Workspace "${workspaceId}" not found`);

    const cards = docs.map(toCard);
    const byId = new Map(cards.map((c) => [c.id, c]));
    const todayIso = new Date().toISOString().slice(0, 10);
    const pick = (ids: string[]) =>
      ids.filter((id, i) => byId.has(id) && ids.indexOf(id) === i).map((id) => ({ id, name: byId.get(id)!.name }));

    let routed: Awaited<ReturnType<typeof this.getClientForWorkspace>>;
    try {
      routed = await this.getClientForWorkspace(workspaceId);
    } catch (err) {
      // Usage limit or a broken BYOK key: say so in the answer instead of a 500.
      return { answer: err instanceof Error ? err.message : String(err), relevantDocuments: [] };
    }
    const client = routed?.client ?? null;
    if (!client) {
      const plain = plainAnswer(question, cards, todayIso);
      return { answer: plain.answer, relevantDocuments: pick(plain.relevantIds) };
    }
    let assistantModel = 'claude-sonnet-5';
    try {
      const owner = await this.billing.ownerOfWorkspace(workspaceId);
      assistantModel = this.billing.assistantModelFor(owner.plan);
      await this.billing.chargeAiActions(workspaceId, 1, 'assistant_question');
    } catch (err) {
      if (err instanceof PlanLimitException) return { answer: err.message, relevantDocuments: [] };
      throw err;
    }

    // The documents the question seems to be about get their scanned text;
    // everything else is one line each, so the model can still spot a match
    // the word overlap missed.
    const ranked = rank(question, cards);
    const focus = ranked.filter((r) => r.score > 0).slice(0, ASSISTANT_FOCUS_DOCUMENTS).map((r) => r.card);
    const focusIds = new Set(focus.map((c) => c.id));
    const rest = ranked.map((r) => r.card).filter((c) => !focusIds.has(c.id));

    // The catalogue lists every document once, in a fixed order, and is
    // marked for prompt caching: the second question in five minutes reads
    // it from cache at a tenth of the price. Only the focus documents and
    // the question itself change from one call to the next.
    const catalogue = [
      `Workspace: ${workspace.name}`,
      `Documents in the workspace: ${cards.length}${docs.length === ASSISTANT_MAX_DOCUMENTS ? ' (showing the most recently updated)' : ''}`,
      '',
      `## All documents (one line each)\n${cards.map((c) => shortLine(c, todayIso)).join('\n')}`,
    ].join('\n\n');
    const context = [
      `Today: ${todayIso}`,
      focus.length ? `## Documents that look relevant to this question\n\n${focus.map((c) => fullCard(c, todayIso, ASSISTANT_TEXT_CHARS)).join('\n\n')}` : '',
    ].filter(Boolean).join('\n\n');

    try {
      const message = await client.messages.parse({
        model: assistantModel,
        max_tokens: 2048,
        output_config: { effort: 'medium', format: zodOutputFormat(AssistantReply) },
        system: [
          { type: 'text', text: ASSISTANT_SYSTEM },
          { type: 'text', text: catalogue, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: `${context}\n\n## Question\n${question}` }],
      });
      await this.trackUsage(workspaceId, usageTokens(message.usage));
      this.logger.log(`Assistant usage: ${describeUsage(message.usage)}`);

      if (message.stop_reason === 'refusal' || !message.parsed_output) {
        this.logger.warn(`Assistant gave no structured answer (stop_reason=${message.stop_reason})`);
        const plain = plainAnswer(question, cards, todayIso);
        return { answer: plain.answer, relevantDocuments: pick(plain.relevantIds) };
      }
      return { answer: message.parsed_output.answer.trim(), relevantDocuments: pick(message.parsed_output.relevantDocumentIds) };
    } catch (err) {
      this.logger.error(`Assistant call failed: ${err instanceof Error ? err.message : String(err)}`);
      const plain = plainAnswer(question, cards, todayIso);
      return {
        answer: `The AI service did not respond, so here is what the records say.\n${plain.answer.replace(/^AI answers are switched off on this server, so here is what the records say\.\n/, '')}`,
        relevantDocuments: pick(plain.relevantIds),
      };
    }
  }

  async generateReport(
    type: string,
    data: Record<string, unknown>,
  ): Promise<{ title: string; summary: string; insights: string[]; recommendations: string[] }> {
    if (!this.client) {
      return {
        title: `${type} Report`,
        summary: 'AI report generation unavailable — ANTHROPIC_API_KEY not configured.',
        insights: [],
        recommendations: [],
      };
    }

    const prompt = `You are a document management analyst. Generate an executive summary report based on this data.

Report type: ${type}
Data: ${JSON.stringify(data, null, 2).slice(0, 2000)}

Respond with JSON:
{
  "title": "Report title",
  "summary": "2-3 sentence executive summary",
  "insights": ["insight 1", "insight 2", "insight 3"],
  "recommendations": ["recommendation 1", "recommendation 2"]
}`;

    const message = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== 'text') throw new Error('Unexpected AI response');

    try {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON');
      return JSON.parse(jsonMatch[0]);
    } catch {
      return {
        title: `${type} Report`,
        summary: content.text.slice(0, 300),
        insights: [],
        recommendations: [],
      };
    }
  }

  // ---------------------------------------------------------------- //
  // debugExtract — step-by-step diagnostic for troubleshooting
  // ---------------------------------------------------------------- //
  async debugExtract(documentId: string): Promise<Record<string, unknown>> {
    const steps: Record<string, unknown>[] = [];

    // 1. Fetch document
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        searchContent: true,
        versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { storageKey: true, mimeType: true } },
      },
    });
    if (!doc) return { error: `Document ${documentId} not found` };

    steps.push({
      step: '1_document',
      name: doc.name,
      versionsFound: doc.versions.length,
      storageKey: doc.versions[0]?.storageKey ?? null,
      mimeType: doc.versions[0]?.mimeType ?? null,
      searchContentLength: doc.searchContent?.extractedText?.length ?? 0,
    });

    // 2. Read file
    const currentVersion = doc.versions[0] ?? null;
    const storageKey = currentVersion?.storageKey ?? '';
    const mimeType = currentVersion?.mimeType ?? '';
    let fileBuffer: Buffer | null = null;
    let fileError: string | null = null;

    if (storageKey) {
      try {
        fileBuffer = await this.storage.getBuffer(storageKey);
        steps.push({ step: '2_file', status: 'ok', key: storageKey, bytes: fileBuffer.length });
      } catch (e) {
        fileError = (e as Error).message;
        steps.push({ step: '2_file', status: 'error', key: storageKey, error: fileError });
      }
    } else {
      steps.push({ step: '2_file', status: 'no_storage_key', storageKey });
    }

    // 3. Try each OCR provider independently
    if (fileBuffer) {
      const ocrProviderStatus = this.ocrService.getProviderStatus();
      steps.push({ step: '3_ocr_providers', providers: ocrProviderStatus });

      // Test OCR (uses the normal priority chain)
      try {
        const ocrResult = await this.ocrService.extract(fileBuffer, mimeType, doc.name);
        if (ocrResult) {
          steps.push({
            step: '3_ocr_result', status: 'ok',
            provider: ocrResult.provider,
            textLength: ocrResult.fullText.length,
            textPreview: ocrResult.fullText.slice(0, 200),
            pageCount: ocrResult.pageCount,
          });
        } else {
          steps.push({ step: '3_ocr_result', status: 'all_providers_failed' });
        }
      } catch (e) {
        steps.push({ step: '3_ocr_result', status: 'error', error: (e as Error).message });
      }
    } else {
      steps.push({ step: '3_ocr_result', status: 'skipped_no_file' });
    }

    // 4. AI provider availability
    steps.push({
      step: '4_ai_providers',
      anthropicKey: !!(this.config.get<string>('ANTHROPIC_API_KEY')),
      openaiKey: !!this.openaiApiKey,
      anthropicClientReady: !!this.client,
    });

    return { documentId, steps };
  }

  // ---------------------------------------------------------------- //
  // Private helpers
  // ---------------------------------------------------------------- //
  private buildDisabledResult(): AiExtractionResult {
    return {
      status: 'disabled',
      documentType: null, title: null, issuer: null, counterparty: null,
      contractNumber: null, policyNumber: null, certificateNumber: null, referenceNumber: null,
      issueDate: null, effectiveDate: null, expiryDate: null, renewalDueDate: null,
      summary: null, keyPoints: [], suggestedTags: [], suggestedFolder: null,
      riskFlags: [], overallConfidence: 0, dateConfidence: 0,
      confidenceByField: emptyConfidenceByField(), ocrProvider: null,
      extractedAt: null, appliedFields: [], userAppliedFields: [], error: null,
    };
  }

  private buildFailedResult(error: string): AiExtractionResult {
    return {
      status: 'failed',
      documentType: null, title: null, issuer: null, counterparty: null,
      contractNumber: null, policyNumber: null, certificateNumber: null, referenceNumber: null,
      issueDate: null, effectiveDate: null, expiryDate: null, renewalDueDate: null,
      summary: null, keyPoints: [], suggestedTags: [], suggestedFolder: null,
      riskFlags: [], overallConfidence: 0, dateConfidence: 0,
      confidenceByField: emptyConfidenceByField(), ocrProvider: null,
      extractedAt: null, appliedFields: [], userAppliedFields: [], error,
    };
  }

  // ---------------------------------------------------------------- //
  // Workspace overview — how far AI has got across the whole workspace
  // ---------------------------------------------------------------- //
  async getWorkspaceOverview(workspaceId: string): Promise<AiWorkspaceOverview> {
    const docs = await this.prisma.document.findMany({
      where: { workspaceId, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        expiryDate: true,
        folderId: true,
        metadata: {
          where: { key: { in: OVERVIEW_META_KEYS } },
          select: { key: true, value: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let analyzed = 0;
    let running = 0;
    let failed = 0;
    let notAnalyzed = 0;
    let lastExtractedAt: string | null = null;

    const riskFlags: AiWorkspaceOverview['riskFlags'] = [];
    const pendingSuggestions: AiWorkspaceOverview['pendingSuggestions'] = [];

    const staleBefore = Date.now() - STALE_RUN_MS;

    for (const doc of docs) {
      const meta = new Map<string, string>(doc.metadata.map((m) => [m.key, m.value]));
      let status = meta.get(AI_KEYS.STATUS) ?? 'none';

      // A run that never came back (API restart, crash) reads as failed, so the
      // page stops waiting on it and the retry button can pick it up.
      if (status === 'running' && isStaleRun(meta.get(AI_KEYS.STARTED_AT), staleBefore)) {
        status = 'failed';
      }

      if (status === 'done') analyzed += 1;
      else if (status === 'running') running += 1;
      else if (status === 'failed') failed += 1;
      else notAnalyzed += 1;

      const extractedAt = meta.get(AI_KEYS.EXTRACTED_AT);
      if (extractedAt && (lastExtractedAt === null || extractedAt > lastExtractedAt)) {
        lastExtractedAt = extractedAt;
      }

      if (status !== 'done') continue;

      const flags = parseJsonArrayValue(meta.get(AI_KEYS.RISK_FLAGS));
      if (flags.length > 0) {
        riskFlags.push({ documentId: doc.id, documentName: doc.name, flags });
      }

      // Which suggestions has nobody acted on yet?
      const alreadyApplied = new Set([
        ...parseJsonArrayValue(meta.get(AI_KEYS.APPLIED_FIELDS)),
        ...parseJsonArrayValue(meta.get(AI_KEYS.USER_APPLIED_FIELDS)),
      ]);

      const suggestedExpiry = isValidDate(meta.get(AI_KEYS.EXPIRY_DATE))
        ? (meta.get(AI_KEYS.EXPIRY_DATE) as string)
        : null;
      const suggestedRenewal = isValidDate(meta.get(AI_KEYS.RENEWAL_DATE))
        ? (meta.get(AI_KEYS.RENEWAL_DATE) as string)
        : null;
      const suggestedTags = parseJsonArrayValue(meta.get(AI_KEYS.SUGGESTED_TAGS));
      const suggestedFolder = meta.get(AI_KEYS.SUGGESTED_FOLDER)?.trim() || null;

      const fields: string[] = [];
      if (suggestedExpiry && !alreadyApplied.has('expiryDate') && doc.expiryDate === null) {
        fields.push('expiryDate');
      }
      if (suggestedRenewal && !alreadyApplied.has('renewalDueDate')) {
        fields.push('renewalDueDate');
      }
      if (suggestedTags.length > 0 && !alreadyApplied.has('suggestedTags')) {
        fields.push('suggestedTags');
      }
      if (suggestedFolder && !alreadyApplied.has('suggestedFolder') && doc.folderId === null) {
        fields.push('suggestedFolder');
      }

      if (fields.length > 0) {
        pendingSuggestions.push({
          documentId: doc.id,
          documentName: doc.name,
          fields,
          expiryDate: suggestedExpiry,
          confidence: safeNumber(meta.get(AI_KEYS.OVERALL_CONFIDENCE), 0),
        });
      }
    }

    // Highest confidence first so the most trustworthy suggestions lead
    pendingSuggestions.sort((a, b) => b.confidence - a.confidence);

    return {
      enabled: this.isEnabled,
      ocrAvailable: this.ocrService.getProviderStatus().some((p) => p.available),
      totalDocuments: docs.length,
      analyzed,
      running,
      failed,
      notAnalyzed,
      lastExtractedAt,
      riskFlags: riskFlags.slice(0, OVERVIEW_LIST_LIMIT),
      riskFlagCount: riskFlags.length,
      pendingSuggestions: pendingSuggestions.slice(0, OVERVIEW_LIST_LIMIT),
      pendingSuggestionCount: pendingSuggestions.length,
    };
  }

  // ---------------------------------------------------------------- //
  // Batch extraction — analyse the documents nobody has run AI on yet
  // ---------------------------------------------------------------- //
  async extractWorkspaceBatch(
    workspaceId: string,
    limit: number,
    includeFailed: boolean,
  ): Promise<{ queued: number; documentIds: string[]; remaining: number }> {
    if (!this.isEnabled) {
      return { queued: 0, documentIds: [], remaining: 0 };
    }

    const docs = await this.prisma.document.findMany({
      where: { workspaceId, status: 'ACTIVE' },
      select: {
        id: true,
        metadata: {
          where: { key: { in: [AI_KEYS.STATUS, AI_KEYS.STARTED_AT] as string[] } },
          select: { key: true, value: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const staleBefore = Date.now() - STALE_RUN_MS;

    const eligible = docs
      .filter((d) => {
        const meta = new Map(d.metadata.map((m) => [m.key, m.value]));
        const status = meta.get(AI_KEYS.STATUS) ?? 'none';
        if (status === 'done') return false;
        // Only retry a run that has clearly been abandoned
        if (status === 'running') return isStaleRun(meta.get(AI_KEYS.STARTED_AT), staleBefore);
        if (status === 'failed') return includeFailed;
        return true;
      })
      .map((d) => d.id);

    const capped = Math.min(Math.max(limit, 1), BATCH_MAX);
    const queued = eligible.slice(0, capped);

    // Claim every document in the batch now, so a second click (or a second
    // tab) cannot queue the same files again and pay for them twice.
    const claimedAt = new Date().toISOString();
    for (const id of queued) {
      await this.upsertMeta(id, AI_KEYS.STATUS, 'running');
      await this.upsertMeta(id, AI_KEYS.STARTED_AT, claimedAt);
    }

    // Run in the background, one at a time, so a large workspace cannot
    // stall the request or hammer the AI provider with parallel calls.
    void this.runBatchSequentially(queued);

    return {
      queued: queued.length,
      documentIds: queued,
      remaining: Math.max(eligible.length - queued.length, 0),
    };
  }

  private async runBatchSequentially(documentIds: string[]): Promise<void> {
    for (const id of documentIds) {
      try {
        await this.extractDocument(id);
      } catch (err) {
        this.logger.warn(`[BatchExtract] doc=${id} failed: ${(err as Error).message}`);
      }
    }
  }
}
