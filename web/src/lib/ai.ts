/**
 * AI / document-intelligence API helpers.
 * Everything goes through apiFetch so auth headers stay in one place.
 */
import { apiFetch } from './api';

// ------------------------------------------------------------------ //
// Types
// ------------------------------------------------------------------ //

export type AiDocStatus = 'none' | 'running' | 'done' | 'failed' | 'disabled';

export interface AiRiskFlag {
  documentId: string;
  documentName: string;
  flags: string[];
}

export interface AiPendingSuggestion {
  documentId: string;
  documentName: string;
  /** Field names the AI found that nobody has applied yet. */
  fields: string[];
  expiryDate: string | null;
  confidence: number;
}

export interface AiWorkspaceOverview {
  enabled: boolean;
  ocrAvailable: boolean;
  totalDocuments: number;
  analyzed: number;
  running: number;
  failed: number;
  notAnalyzed: number;
  lastExtractedAt: string | null;
  riskFlags: AiRiskFlag[];
  riskFlagCount: number;
  pendingSuggestions: AiPendingSuggestion[];
  pendingSuggestionCount: number;
}

export interface AiBatchResult {
  queued: number;
  documentIds: string[];
  remaining: number;
}

export interface AiSearchAnswer {
  answer: string;
  relevantDocuments: { id: string; name: string }[];
}

export interface OcrProviderStatus {
  name: string;
  available: boolean;
}

export interface AiOcrStatus {
  anyAvailable: boolean;
  providers: OcrProviderStatus[];
  recommendation: string | null;
}

// ------------------------------------------------------------------ //
// Calls
// ------------------------------------------------------------------ //

export function fetchAiOverview(workspaceId: string): Promise<AiWorkspaceOverview> {
  return apiFetch<AiWorkspaceOverview>(
    `/api/v1/ai/workspaces/${encodeURIComponent(workspaceId)}/overview`,
  );
}

export function runAiBatch(
  workspaceId: string,
  options: { limit?: number; includeFailed?: boolean } = {},
): Promise<AiBatchResult> {
  return apiFetch<AiBatchResult>(
    `/api/v1/ai/workspaces/${encodeURIComponent(workspaceId)}/extract-batch`,
    { method: 'POST', body: JSON.stringify(options) },
  );
}

export function askAi(workspaceId: string, question: string): Promise<AiSearchAnswer> {
  return apiFetch<AiSearchAnswer>(
    `/api/v1/ai/search?workspaceId=${encodeURIComponent(workspaceId)}`,
    { method: 'POST', body: JSON.stringify({ question }) },
  );
}

export function applyAiFields(
  documentId: string,
  fields: string[],
): Promise<{ applied: string[]; skipped: string[] }> {
  return apiFetch<{ applied: string[]; skipped: string[] }>(
    `/api/v1/ai/documents/${documentId}/apply`,
    { method: 'POST', body: JSON.stringify({ fields }) },
  );
}

export function fetchAiStatus(): Promise<{ enabled: boolean }> {
  return apiFetch<{ enabled: boolean }>('/api/v1/ai/status');
}

export function fetchOcrStatus(): Promise<AiOcrStatus> {
  return apiFetch<AiOcrStatus>('/api/v1/ai/ocr-status');
}

// ------------------------------------------------------------------ //
// Display helpers
// ------------------------------------------------------------------ //

/** Human label for an applyable AI field name. */
export const AI_FIELD_LABEL: Record<string, string> = {
  expiryDate: 'Expiry date',
  renewalDueDate: 'Renewal date',
  isReminderEnabled: 'Reminders',
  suggestedTags: 'Tags',
  suggestedFolder: 'Folder',
};

export function aiFieldLabel(field: string): string {
  return AI_FIELD_LABEL[field] ?? field;
}

/** Confidence wording that matches the document detail page. */
export function confidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return 'High';
  if (confidence >= 0.5) return 'Medium';
  return 'Low';
}
